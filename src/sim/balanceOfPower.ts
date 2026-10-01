// The balance of power (2.0 GEO 4).
// - Polarity: each month the shares of world power held by the strongest countries are
//   recorded, and the world is called unipolar, bipolar or multipolar.
// - Arms races: two rivals who each fear the other (high mutual threat, cold relations, no
//   alliance) race. Both governments switch to a military build-up; without an arms-control
//   treaty between nuclear powers, their stockpiles grow. A race ends when the fear or the
//   hostility fades.
// - Balancing or bandwagoning: a country that faces a much stronger threat either seeks
//   protection (it becomes keener on alliances with others who fear the same power) or, when
//   it is weak, exposed and led by a dove, makes its peace with the threat.
// - Sanctions cost both sides growth, the target more, in proportion to the trade between
//   them; trade agreements add a little growth (read by strategic.ts).
import { believedPower } from './beliefs';
import type { Id, Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { record } from '../engine/events';
import { tiesOf } from '../data/diplomacy';
import { nationScores } from './forces';
import { leaderProfile, noteTrust, tiesOfPair } from './relations';
import { activeTreaties, alliedPower, hasTreaty } from './treaties';
import { militaryPower } from './war';
import { strategicOf } from './forceStructure';
import { reviewStrategy } from './nationalBudget';

export interface ArmsRace { a: Id; b: Id; since: number; ended?: number; nuclear: boolean }
export interface BopPoint { key: string; shares: { id: Id; share: number }[]; polarity: 'unipolar' | 'bipolar' | 'multipolar' }

const key = (a: Id, b: Id) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const racesOf = (w: World, n?: Id) => (w.armsRaces ?? []).filter((r) => r.ended == null && (n == null || r.a === n || r.b === n));
export const inArmsRace = (w: World, n: Id) => racesOf(w, n).length > 0;

export function polarityOf(shares: { share: number }[]): BopPoint['polarity'] {
  const [s1 = 0, s2 = 0, s3 = 0] = shares.map((s) => s.share);
  if (s1 > 1.6 * s2) return 'unipolar';
  if (s2 > 1.25 * s3 && s1 < 1.6 * s2) return 'bipolar';
  return 'multipolar';
}

function snapshot(w: World) {
  const scores = nationScores(w).filter((s) => !w.nations[s.id].exile);
  const total = scores.reduce((t, s) => t + s.total, 0) || 1;
  const shares = scores.map((s) => ({ id: s.id, share: Math.round((s.total / total) * 1000) / 1000 })).sort((a, b) => b.share - a.share);
  const d = dateAt(w.time);
  const pt: BopPoint = { key: `${d.year}-${String(d.month + 1).padStart(2, '0')}`, shares: shares.slice(0, 6), polarity: polarityOf(shares) };
  const hist = (w.bop ??= []);
  const prev = hist[hist.length - 1];
  hist.push(pt);
  if (hist.length > 240) hist.shift();
  if (prev && prev.polarity !== pt.polarity) record(w, 'diplomacy', `🌍 The world has become ${pt.polarity}: ${pt.shares.slice(0, 3).map((s) => `${w.nations[s.id].name} ${Math.round(s.share * 100)}%`).join(', ')} of world power.`, { important: true });
}

function racesMonth(w: World) {
  const races = (w.armsRaces ??= []);
  const live = new Map(racesOf(w).map((r) => [key(r.a, r.b), r]));
  for (const a of w.nations) for (const b of w.nations) {
    if (a.id >= b.id || a.exile || b.exile) continue;
    const ta = tiesOfPair(w, a, b), tb = tiesOfPair(w, b, a);
    const rel = Math.min(a.relations[b.id]?.score ?? 0, b.relations[a.id]?.score ?? 0);
    const allied = a.alliances.includes(b.id);
    const r = live.get(key(a.id, b.id));
    if (!r && !allied && ta.threat >= 35 && tb.threat >= 35 && rel < -25) {
      const nuclear = !!strategicOf(a)?.warheads && !!strategicOf(b)?.warheads;
      races.push({ a: a.id, b: b.id, since: w.time, nuclear });
      const text = `🚀 An arms race has begun between ${a.name} and ${b.name}: each fears the other's military.`;
      record(w, 'diplomacy', text, { nation: a.id, important: true });
      for (const n of [a, b]) { (n.chronicle ??= []).push({ t: w.time, text }); reviewStrategy(w, n, `the start of an arms race with ${n === a ? b.name : a.name}`); }
    } else if (r && (allied || ta.threat < 25 || tb.threat < 25 || rel > -10)) {
      r.ended = w.time;
      record(w, 'diplomacy', `🕊️ The arms race between ${a.name} and ${b.name} has wound down.`, { nation: a.id });
      for (const n of [a, b]) reviewStrategy(w, n, 'the end of an arms race');
    }
  }
  // Nuclear stockpiles grow in a race without arms control.
  for (const r of racesOf(w)) {
    if (!r.nuclear || hasTreaty(w, r.a, r.b, 'armscontrol')) continue;
    for (const id of [r.a, r.b]) { const s = strategicOf(w.nations[id]); if (s) s.warheads = Math.round(s.warheads * 1.004 + 1); }
  }
  if (races.length > 80) w.armsRaces = races.filter((r) => r.ended == null || r.ended > w.time - 20 * 365 * 1440);
}

/** A country facing a far stronger threat balances (seeks allies) or bandwagons (makes its peace). */
function alignmentMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    let worst: Nation | null = null, threat = 0;
    for (const o of w.nations) if (o.id !== n.id && !o.exile) { const t = tiesOfPair(w, n, o).threat; if (t > threat) { threat = t; worst = o; } }
    if (!worst || threat < 60 || (n.relations[worst.id]?.score ?? 0) > -10) { delete n.alignment; continue; }
    const weak = militaryPower(w, n.id) + alliedPower(w, n.id) < believedPower(w, n.id, worst.id) * 0.25;
    const lp = leaderProfile(w, n);
    const choice = weak && lp.hawk < 0.4 && !n.alliances.length ? 'bandwagon' : 'balance';
    if (n.alignment?.towards !== worst.id || n.alignment.choice !== choice) {
      n.alignment = { towards: worst.id, choice, since: w.time };
      const text = choice === 'bandwagon'
        ? `🤝 ${n.name}, too weak to resist ${worst.name}, is seeking an accommodation with it.`
        : `🛡️ ${n.name} is looking for partners against ${worst.name}.`;
      record(w, 'diplomacy', text, { nation: n.id });
      (n.chronicle ??= []).push({ t: w.time, text });
    }
    if (choice === 'bandwagon') noteTrust(w, n.id, worst.id, 1);
  }
}

/** Growth effects of sanctions and new trade agreements (percentage points a year), for strategic.ts. */
export function tradePolicyGrowth(w: World, n: Nation): { sanctions: number; agreements: number } {
  let s = 0;
  for (const o of w.nations) {
    if (o.id === n.id) continue;
    const t = tiesOf(n.iso, o.iso) / 100;
    if (o.embargoes.includes(n.id)) s -= t * 1.0; // sanctioned: markets and finance closed
    if (n.embargoes.includes(o.id)) s -= t * 0.4; // sanctioning: lost exports and dearer imports
  }
  let a = 0;
  // 2025 potential growth already reflects the old agreements; only new ones add.
  for (const tr of activeTreaties(w, n.id, 'trade')) if (!tr.historic) for (const p of tr.parties) if (p !== n.id) a += tiesOf(n.iso, w.nations[p].iso) / 100 * 0.08;
  return { sanctions: Math.max(-4, s), agreements: Math.min(0.6, a) };
}

export function balanceOfPowerDaily(w: World) {
  if (dateAt(w.time).day !== 1) return;
  snapshot(w);
  racesMonth(w);
  alignmentMonth(w);
}
