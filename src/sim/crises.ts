// Crisis diplomacy (2.0 GEO 4): confrontations short of war, and how they end.
// Between hostile neighbours (and rivals whose forces meet at sea or in the air) incidents
// happen: a border clash, a naval standoff, an airspace violation, detained citizens, a
// missile test. A crisis climbs a ladder:
//   1 an incident, 2 protests and warnings, 3 forces on alert, 4 an ultimatum, 5 the brink.
// Every few days each side escalates, holds firm, offers talks or backs down, by its resolve:
// the leader's character, the balance of power (allies included), what is at stake, and,
// for an unpopular government, the temptation of a rally round the flag. Both offering talks
// settles it; one backing down hands the other a win (approval and standing); escalating
// past the brink is war. Long stalemates fade. A player who heads a government in a crisis
// chooses each move on the Diplomacy screen.
import { believedPower } from './beliefs';
import type { Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { nid, notify, record } from '../engine/events';
import { chance, pick } from '../engine/rng';
import { controller, player } from './query';
import { relation } from './congress';
import { leaderProfile, tiesOfPair } from './relations';
import { alliedPower } from './treaties';
import { declareWar, militaryPower, warBetween, warCheck } from './war';
import { strategicOf } from './forceStructure';

export type CrisisKind = 'border' | 'naval' | 'airspace' | 'detention' | 'missile';
export type Move = 'escalate' | 'hold' | 'talks' | 'backdown';
export interface Crisis {
  id: Id; kind: CrisisKind; a: Id; b: Id; level: number; started: number; next: number;
  moves: { t: number; side: Id; move: Move }[];
  choice?: Record<Id, Move>; // a player's chosen next move
  status: 'active' | 'settled' | 'won' | 'faded' | 'war'; winner?: Id; ended?: number; quiet?: number;
}

export const LEVELS = ['', 'an incident', 'protests and warnings', 'forces on alert', 'an ultimatum', 'the brink of war'];
export const CRISIS_INFO: Record<CrisisKind, { name: string; start: (a: string, b: string) => string }> = {
  border: { name: 'Border clash', start: (a, b) => `Troops of ${a} and ${b} exchanged fire on the border.` },
  naval: { name: 'Naval standoff', start: (a, b) => `Warships of ${a} and ${b} confronted each other at sea.` },
  airspace: { name: 'Airspace violation', start: (a, b) => `Military aircraft of ${a} violated ${b}'s airspace.` },
  detention: { name: 'Detained citizens', start: (a, b) => `${a} detained citizens of ${b}, accusing them of spying.` },
  missile: { name: 'Missile test', start: (a, b) => `${a} test-fired missiles towards ${b}'s waters.` },
};
export const MOVE_INFO: Record<Move, string> = { escalate: 'Escalate', hold: 'Hold firm', talks: 'Offer talks', backdown: 'Back down' };

export const activeCrises = (w: World, n?: Id) => (w.standoffs ?? []).filter((c) => c.status === 'active' && (n == null || c.a === n || c.b === n));
const other = (c: Crisis, id: Id) => (c.a === id ? c.b : c.a);

/** Land neighbours (computed once per daily pass). */
let neighbours = new Set<string>();
function buildNeighbours(w: World) {
  neighbours = new Set();
  for (const r of w.regions) { const a = controller(r); for (const l of r.links) { const b = controller(w.regions[l]); if (a !== b) neighbours.add(`${a}-${b}`); } }
}

/** How determined a side is to see the crisis through (0..1). */
export function resolve(w: World, c: Crisis, id: Id): number {
  const n = w.nations[id], o = w.nations[other(c, id)];
  const lp = leaderProfile(w, n);
  const mine = militaryPower(w, id) + alliedPower(w, id), theirs = believedPower(w, id, o.id) + alliedPower(w, o.id, id); // their strength as we judge it
  const balance = mine / Math.max(1, mine + theirs) - 0.5;
  const stakes = tiesOfPair(w, n, o).grievance / 200 + (c.kind === 'border' || c.kind === 'detention' ? 0.05 : 0);
  const rally = n.approval < 40 ? 0.1 : 0;
  // Each rung costs more nerve; between nuclear powers the fear of where it leads weighs heavily.
  const fear = mutualDeterrence(n, o) && c.level >= 3 ? 0.15 : 0;
  return Math.max(0, Math.min(1, 0.4 + lp.hawk * 0.3 + lp.nationalism * 0.15 + balance * 0.6 + stakes + rally - c.level * 0.08 - fear));
}
const mutualDeterrence = (a: Nation, b: Nation) => !!strategicOf(a)?.warheads && !!strategicOf(b)?.warheads;

/** Past the brink, does the escalating side actually choose war? */
function choosesWar(w: World, c: Crisis, id: Id): boolean {
  const n = w.nations[id], o = w.nations[other(c, id)];
  // Deterrence: attacking a nuclear power (or a nuclear power's ally) is a different calculation; and a
  // country that fought the same enemy recently is in no hurry to do it again.
  const deterred = mutualDeterrence(n, o) ? 0.1 : strategicOf(o)?.warheads ? 0.15 : alliedNuclear(w, o) ? 0.3 : 1;
  const weary = Object.values(w.wars).some((x) => ((x.att === n.id && x.def === o.id) || (x.att === o.id && x.def === n.id)) && x.declared > w.time - 2 * 365 * DAY) ? 0.3 : 1;
  const p = (resolve(w, c, id) - 0.3) * 1.5 * deterred * weary;
  return chance(w, Math.max(0, Math.min(0.7, p)));
}
/** An ally with nuclear weapons stands behind the other side (extended deterrence). */
function alliedNuclear(w: World, o: Nation) {
  return o.alliances.some((x) => !!strategicOf(w.nations[x])?.warheads);
}

function aiMove(w: World, c: Crisis, id: Id): Move {
  const r = resolve(w, c, id);
  if (r > 0.6 && chance(w, 0.5)) return 'escalate';
  if (r < 0.35) return chance(w, 0.4) ? 'backdown' : 'talks';
  // The longer a standoff drags on, the more both sides look for a way out.
  if (r < 0.6 && chance(w, 0.4 + (c.quiet ?? 0) * 0.15)) return 'talks';
  return 'hold';
}

const isPlayerGov = (w: World, id: Id) => { const p = player(w); return p.nation === id && w.nations[id].president === p.id; };

export function chooseMove(w: World, c: Crisis, id: Id, m: Move) {
  if (c.status !== 'active' || (c.a !== id && c.b !== id)) return;
  (c.choice ??= {})[id] = m;
}

function end(w: World, c: Crisis, status: Crisis['status'], text: string, winner?: Id) {
  c.status = status; c.ended = w.time; c.winner = winner;
  const A = w.nations[c.a], B2 = w.nations[c.b];
  record(w, 'diplomacy', text, { nation: c.a, important: status !== 'faded' });
  for (const n of [A, B2]) (n.chronicle ??= []).push({ t: w.time, text });
  if (isPlayerGov(w, c.a) || isPlayerGov(w, c.b) || player(w).nation === c.a || player(w).nation === c.b) notify(w, 'diplomacy', text, { link: 'diplomacy', critical: status === 'war' });
}

function step(w: World, c: Crisis) {
  const A = w.nations[c.a], B2 = w.nations[c.b];
  if (A.exile || B2.exile || warBetween(w, c.a, c.b)) { end(w, c, 'faded', `${CRISIS_INFO[c.kind].name} between ${A.name} and ${B2.name} was overtaken by events.`); return; }
  const move = (id: Id): Move => (isPlayerGov(w, id) ? c.choice?.[id] ?? 'hold' : aiMove(w, c, id));
  const ma = move(c.a), mb = move(c.b);
  delete c.choice;
  c.moves.push({ t: w.time, side: c.a, move: ma }, { t: w.time, side: c.b, move: mb });
  if (ma === 'backdown' && mb === 'backdown') { end(w, c, 'settled', `🕊️ ${A.name} and ${B2.name} both stepped back from the ${CRISIS_INFO[c.kind].name.toLowerCase()}.`); relation(w, c.a, c.b, 3, 'a crisis defused'); return; }
  for (const [loser, winner] of [[A, B2], [B2, A]] as [Nation, Nation][]) {
    const lm = loser.id === c.a ? ma : mb, wm = winner.id === c.a ? ma : mb;
    if (lm === 'backdown' && wm !== 'backdown') {
      loser.approval = Math.max(0, loser.approval - 3 - c.level);
      winner.approval = Math.min(100, winner.approval + 2 + c.level);
      relation(w, loser.id, winner.id, -3, `forced us to back down (${CRISIS_INFO[c.kind].name.toLowerCase()})`);
      end(w, c, 'won', `🏳️ ${loser.name} backed down in its ${CRISIS_INFO[c.kind].name.toLowerCase()} with ${winner.name}, at ${LEVELS[c.level]}. ${winner.name} claims a victory.`, winner.id);
      return;
    }
  }
  if (ma === 'talks' && mb === 'talks') {
    relation(w, c.a, c.b, 4, 'settled a crisis by talks');
    end(w, c, 'settled', `🤝 Talks settled the ${CRISIS_INFO[c.kind].name.toLowerCase()} between ${A.name} and ${B2.name}.`);
    return;
  }
  if (ma === 'escalate' || mb === 'escalate') {
    const escalator = ma === 'escalate' ? A : B2;
    if (c.level >= 5) {
      // Past the brink: war, if the escalator's government can lawfully declare it.
      const target = escalator.id === c.a ? B2 : A;
      const border = w.regions.filter((r) => r.owner === target.id && r.links.some((l) => controller(w.regions[l]) === escalator.id))[0];
      const params = { target: target.id, days: 21, goals: border ? [border.id] : [] };
      if (!warCheck(w, escalator, params) && (isPlayerGov(w, escalator.id) || choosesWar(w, c, escalator.id))) {
        end(w, c, 'war', `🔥 The ${CRISIS_INFO[c.kind].name.toLowerCase()} between ${A.name} and ${B2.name} went over the brink: ${escalator.name} went to war.`, undefined);
        declareWar(w, escalator, params);
        return;
      }
      c.quiet = (c.quiet ?? 0) + 1; // at the brink, but nobody takes the last step
    } else {
      c.level++;
      c.quiet = 0;
      relation(w, c.a, c.b, -3, `the ${CRISIS_INFO[c.kind].name.toLowerCase()} escalated`);
      if (c.level >= 3) for (const n of [A, B2]) n.warMood = Math.min(5, (n.warMood ?? 0) + 0.5);
      const text = `⚠️ The ${CRISIS_INFO[c.kind].name.toLowerCase()} between ${A.name} and ${B2.name} escalated to ${LEVELS[c.level]} (${escalator.name} raised the stakes).`;
      record(w, 'diplomacy', text, { nation: escalator.id, important: c.level >= 4 });
      if (isPlayerGov(w, c.a) || isPlayerGov(w, c.b)) notify(w, 'diplomacy', `${text} Choose your next move on the Diplomacy screen.`, { link: 'diplomacy', critical: c.level >= 4 });
    }
  } else c.quiet = (c.quiet ?? 0) + 1;
  if ((c.quiet ?? 0) >= 4) { end(w, c, 'faded', `The ${CRISIS_INFO[c.kind].name.toLowerCase()} between ${A.name} and ${B2.name} faded without a resolution.`); return; }
  c.next = w.time + 3 * DAY;
}

function maybeStart(w: World) {
  for (const a of w.nations) for (const b of w.nations) {
    if (a.id === b.id || a.exile || b.exile || activeCrises(w, a.id).length || activeCrises(w, b.id).length) continue;
    const rel = a.relations[b.id]?.score ?? 0;
    const ta = tiesOfPair(w, a, b);
    if (rel > -30 || ta.threat < 30 || warBetween(w, a.id, b.id)) continue;
    const near = neighbours.has(`${a.id}-${b.id}`);
    const lp = leaderProfile(w, a);
    if (!chance(w, (near ? 0.0012 : 0.0005) * (0.5 + lp.hawk))) continue;
    const kinds: CrisisKind[] = near ? ['border', 'airspace', 'detention', 'missile'] : ['naval', 'airspace', 'detention', 'missile'];
    const kind = pick(w, kinds);
    const c: Crisis = { id: nid(w), kind, a: a.id, b: b.id, level: 1, started: w.time, next: w.time + 3 * DAY, moves: [], status: 'active' };
    (w.standoffs ??= []).push(c);
    relation(w, a.id, b.id, -4, CRISIS_INFO[kind].name.toLowerCase());
    const text = `⚠️ ${CRISIS_INFO[kind].start(a.name, b.name)} A crisis has begun.`;
    record(w, 'diplomacy', text, { nation: a.id, important: true });
    if (isPlayerGov(w, a.id) || isPlayerGov(w, b.id)) notify(w, 'diplomacy', `${text} Choose your move on the Diplomacy screen.`, { link: 'diplomacy', critical: true });
  }
}

export function crisesDaily(w: World, days = 1) {
  buildNeighbours(w);
  for (const c of activeCrises(w)) {
    // A step every three days; during a statistical month, the month's steps at once.
    const steps = days === 1 ? (c.next <= w.time ? 1 : 0) : Math.ceil(days / 3);
    for (let k = 0; k < steps && c.status === 'active'; k++) step(w, c);
  }
  for (let k = 0; k < days; k++) maybeStart(w);
  if (w.standoffs && w.standoffs.length > 60) w.standoffs = w.standoffs.filter((c) => c.status === 'active' || w.time - (c.ended ?? 0) < 5 * 365 * DAY).slice(-60);
}
