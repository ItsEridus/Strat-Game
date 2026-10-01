// Why wars start (2.2 War & peace). A government weighs a war against each neighbour with
// what its intelligence believes (beliefs.ts), not with the truth:
//   chance of winning (its forces against the target's and its allies', as estimated)
//   × what it would gain (territorial claims, resources, nationalism, a distraction from
//     trouble at home, striking a rising rival before it is too late, an opportunity
//     when the target is busy or divided, and fear of the target itself)
//   − what it would cost (the fighting, lost trade, the world's reaction, war-weariness,
//     other wars, and above all deterrence: attacking a nuclear power or its ally),
// scaled by the leader's appetite for risk. Wars start only when the calculation favours
// them, which between states is rare. The same calculation drives AI proposals in
// congress and, during a statistical skip, governments' monthly decisions.
import type { Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { chance } from '../engine/rng';
import { controller } from './query';
import { believed, believedPower } from './beliefs';
import { leaderProfile, tiesOfPair } from './relations';
import { alliedPower } from './treaties';
import { capsOf, historyPace } from './strategic';
import { strategicOf } from './forceStructure';
import { activeWars, declareWar, militaryPower, neighborNations, warCheck } from './war';
import { eligibleVoters } from './congress';
import { EXTRA_PROPOSALS } from './congressExtra';

export interface WarCase { target: Id; goal: Id | null; pWin: number; gains: [string, number][]; costs: [string, number][]; value: number }

const resourceValue = (r: { res: Record<string, number | undefined>; pop: number }) => Object.values(r.res).reduce((s: number, v) => s + (v ?? 0), 0) + r.pop / 50000;

/** The case for war on `t`, as `n`'s government sees it. */
export function warCase(w: World, n: Nation, t: Nation): WarCase {
  const mine = militaryPower(w, n.id) + alliedPower(w, n.id) * 0.5;
  const theirs = believedPower(w, n.id, t.id) + alliedPower(w, t.id, n.id);
  const ratio = mine / Math.max(1, theirs);
  const pWin = 1 / (1 + Math.exp(-3 * Math.log(Math.max(0.05, ratio))));
  const lp = leaderProfile(w, n);
  const ties = tiesOfPair(w, n, t);
  const border = w.regions.filter((r) => controller(r) === t.id && r.links.some((l) => controller(w.regions[l]) === n.id)).sort((a, b) => resourceValue(b) - resourceValue(a) || a.id - b.id);
  const goal = border[0] ?? null;
  const gains: [string, number][] = [
    ['territorial claims', ties.grievance / 100],
    ['the prize', goal ? Math.min(0.3, resourceValue(goal) / 15) : 0],
    ['nationalism', lp.nationalism * 0.3],
    ['a distraction from trouble at home', n.approval < 40 ? (40 - n.approval) / 100 : 0],
    ['striking a rising rival', theirs > mine * 0.8 && capsOf(w, t).growth > capsOf(w, n).growth + 1 ? 0.2 : 0],
    ['their weakness', (activeWars(w).some((x) => x.att === t.id || x.def === t.id) ? 0.3 : 0) + (capsOf(w, t).cohesion < 40 ? 0.2 : 0)],
    ['fear of them', Math.max(0, believed(w, n, t, 'hostile')) / 100 * 0.4],
  ];
  const nuclear = (x: Nation) => !!strategicOf(x)?.warheads;
  const theyNuclear = nuclear(t) || t.alliances.some((a) => nuclear(w.nations[a]));
  const recent = Object.values(w.wars).some((x) => (x.att === n.id || x.def === n.id) && x.declared > w.time - 3 * 365 * DAY);
  const costs: [string, number][] = [
    ['the fighting', 0.3 + (1 - pWin) * 1.0],
    ['lost trade', ties.interdep / 100 * 0.6],
    ["the world's reaction", 0.2 + t.alliances.length * 0.1],
    ['nuclear deterrence', theyNuclear ? (nuclear(n) ? 3 : 2) : 0],
    ['war-weariness', recent ? 0.5 : 0],
    ['other wars', activeWars(w).some((x) => x.att === n.id || x.def === n.id) ? 1 : 0],
    // A war of choice with no quarrel behind it is hard to justify, at home and abroad.
    ['no quarrel to justify it', ties.grievance < 10 && (n.relations[t.id]?.score ?? 0) > -30 ? 0.5 : 0],
    // Free countries answer to their voters and press (the democratic peace).
    ['public opinion', capsOf(w, n).inst.press * 0.4],
  ];
  const gain = gains.reduce((s, [, v]) => s + v, 0) * pWin;
  const cost = costs.reduce((s, [, v]) => s + v, 0);
  return { target: t.id, goal: goal?.id ?? null, pWin, gains: gains.filter(([, v]) => v > 0.005), costs: costs.filter(([, v]) => v > 0.005), value: (gain - cost) * (0.6 + lp.risk * 0.8) };
}

/** The most attractive war a government could start now (null if none is worth it). */
export function bestWarCase(w: World, n: Nation): WarCase | null {
  let best: WarCase | null = null;
  for (const id of neighborNations(w, n.id)) {
    const t = w.nations[id];
    if (!t || t.exile || warCheck(w, n, { target: id, days: 21, goals: [] })) continue;
    const c = warCase(w, n, t);
    if (c.value > 0 && (!best || c.value > best.value)) best = c;
  }
  return best;
}

/** During a statistical skip: governments that find a war worth it ask congress, which votes on its merits. */
function warMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const c = bestWarCase(w, n);
    if (!c || !chance(w, Math.min(0.5, c.value))) continue;
    const params = { target: c.target, days: 21, goals: c.goal != null ? [c.goal] : [] };
    const voters = eligibleVoters(n).map((id) => w.citizens[id]).filter(Boolean);
    const prop = EXTRA_PROPOSALS.war;
    const yes = voters.filter((d) => chance(w, Math.max(0.02, Math.min(0.98, 0.5 + prop.support(w, n, d, params))))).length;
    if (yes * 2 > voters.length && !warCheck(w, n, params)) declareWar(w, n, params);
  }
}

export function warDecisionDaily(w: World, days = 1) {
  if (days > 1 && dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) warMonth(w);
}
