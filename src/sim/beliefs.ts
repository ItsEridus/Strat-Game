// Beliefs (2.1 Shadows): governments act on what they believe, not on the truth.
// Every government holds an estimate of each other country's military power, economy,
// technology and hostility, with a confidence range. How good the estimate is depends on
// collection: its networks in the country, its signals, imagery, open-source and analysis
// directorates, how open the target is (a free press gives a lot away), and the target's
// counter-intelligence. Each estimate also carries a misperception that persists and only
// slowly corrects itself; hawkish leaders read more hostility into what they see.
// The estimates are refreshed every week (every month in a statistical skip), and at once
// when an operation brings in a dossier or maps an order of battle.
// War, crisis, ultimatum and threat decisions use them (militaryPower is the truth;
// believedPower is what a government thinks), so surprise and miscalculation happen.
// After the fact, each estimate can be compared with the truth (the review).
import { hasTech, techFx } from './technology';
import type { Id, Nation, World } from './types';
import { dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { rand } from '../engine/rng';
import { capsOf, techAvg } from './strategic';
import { nationScores } from './forces';
import { militaryPower } from './war';
import { dirStrength } from './intelOrg';
import { leaderProfile } from './relations';
import { agentQuality } from './collection';
import { deceive, partnerQuality } from './counterIntel';

export type Measure = 'mil' | 'econ' | 'tech' | 'hostile';
export const MEASURES: Measure[] = ['mil', 'econ', 'tech', 'hostile'];
export const MEASURE_LABEL: Record<Measure, string> = { mil: 'Military power', econ: 'Economy', tech: 'Technology', hostile: 'Hostility towards us' };
export interface Estimate {
  bias: Record<Measure, number>; // relative misperception (mil, econ, tech) or points (hostile)
  sd: Record<Measure, number>; // the uncertainty (relative, or points for hostility)
  quality: number; // 0..1: how well we can see them
  t: number; // last refreshed
  review?: { t: number; est: Record<Measure, number>; truth: Record<Measure, number> }[]; // yearly snapshots
}

/** The truth about a country (the measures an estimate is of). */
export function truthOf(w: World, observer: Nation, t: Nation): Record<Measure, number> {
  const s = nationScores(w).find((x) => x.id === t.id);
  const lp = leaderProfile(w, t);
  return {
    mil: militaryPower(w, t.id),
    econ: s?.economy ?? 0,
    tech: techAvg(capsOf(w, t)),
    hostile: Math.max(-100, Math.min(100, -(t.relations[observer.id]?.score ?? 0) + (lp.hawk - 0.4) * 30)),
  };
}

/** How well `n` can see `t` (0..1). */
export function collectionQuality(w: World, n: Nation, t: Nation): number {
  // Agents in place see past the counter-intelligence (collection.ts); partners share what they see (counterIntel.ts).
  // Technology sharpens collection (and a quantum computer reads traffic not yet protected by post-quantum codes).
  const tech = techFx(n).intel + (hasTech(n, 'quantum') && !hasTech(t, 'pqc') ? 0.06 : 0) - (hasTech(t, 'pqc') ? 0.02 : 0);
  return Math.max(0.05, Math.min(0.97, Math.max(rawQuality(w, n, t) + agentQuality(w, n, t) + tech, sharedPicture(w, n, t))));
}
/** What a service sees of `t` by its own means (no agents, no partners). */
export function rawQuality(w: World, n: Nation, t: Nation): number {
  const net = (n.agency.network[t.id] ?? 0) / 100;
  const tech = (dirStrength(n, 'sigint') * 0.4 + dirStrength(n, 'imagery') * 0.3 + dirStrength(n, 'cyber') * 0.3) / 100;
  const open = (dirStrength(n, 'osint') / 100) * (0.4 + capsOf(w, t).inst.press * 0.6); // a free press gives a lot away
  const judgement = dirStrength(n, 'analysis') / 100;
  const raw = net * 0.25 + tech * 0.3 + open * 0.25 + judgement * 0.2;
  const shield = 1 - dirStrength(t, 'counter') / 400; // good counter-intelligence hides things
  return Math.max(0, raw * shield);
}
/** Allies who share intelligence (Five Eyes and other intelligence-sharing treaties) pool what they see. */
const sharedPicture = (w: World, n: Nation, t: Nation) => partnerQuality(w, n, t);

export function estimateOf(w: World, n: Nation, t: Nation): Estimate {
  const m = (n.beliefs ??= {});
  if (!m[t.id]) {
    const q = collectionQuality(w, n, t);
    m[t.id] = { bias: { mil: 0, econ: 0, tech: 0, hostile: 0 }, sd: spread(q), quality: q, t: w.time };
    refresh(w, n, t, 0, true);
  }
  return m[t.id];
}
const spread = (q: number): Record<Measure, number> => { const u = Math.pow(1 - q, 1.5); return { mil: 0.8 * u, econ: 0.45 * u, tech: 0.4 * u, hostile: 60 * u }; };

/** Re-estimate `t`. `boost` (0..1) is extra collection from an operation; misperceptions drift and slowly correct. */
export function refresh(w: World, n: Nation, t: Nation, boost = 0, first = false) {
  const e = (n.beliefs ??= {})[t.id] ?? estimateOf(w, n, t);
  const q = Math.min(0.97, collectionQuality(w, n, t) + boost * (1 - collectionQuality(w, n, t)));
  e.quality = q;
  e.sd = spread(q);
  const hawk = leaderProfile(w, n).hawk;
  for (const k of MEASURES) {
    // A persistent error: most of it survives each weekly refresh, and new noise is in proportion to the
    // uncertainty, so the misperception settles at about half the uncertainty and corrects itself over months.
    // An operation's fresh material replaces most of it.
    const keep = 0.85 - boost * 0.6;
    const noise = (rand(w, -1, 1) + rand(w, -1, 1)) * 2.2 * e.sd[k];
    e.bias[k] = first ? noise * 0.28 : e.bias[k] * keep + noise * (1 - keep);
  }
  e.bias.hostile += (hawk - 0.4) * 3 * (1 - q); // hawks read more menace into what they cannot see clearly
  deceive(w, n, t, e); // turned agents feed what the other side wants believed (counterIntel.ts)
  e.t = w.time;
}

/** What `n` believes about `t` (the truth for its own country). */
export function believed(w: World, n: Nation, t: Nation, k: Measure): number {
  const truth = truthOf(w, n, t)[k];
  if (n.id === t.id) return truth;
  const e = estimateOf(w, n, t);
  return k === 'hostile' ? Math.max(-100, Math.min(100, truth + e.bias.hostile)) : Math.max(0, truth * (1 + e.bias[k]));
}
/** The military power `observer` believes `target` has. */
export function believedPower(w: World, observer: Id, target: Id): number {
  if (observer === target) return militaryPower(w, target);
  const n = w.nations[observer], t = w.nations[target];
  return Math.max(0, militaryPower(w, target) * (1 + estimateOf(w, n, t).bias.mil));
}
/** The range `observer` would quote (low, high) for a measure. */
export function rangeOf(w: World, n: Nation, t: Nation, k: Measure): [number, number] {
  const e = estimateOf(w, n, t);
  const v = believed(w, n, t, k);
  return k === 'hostile' ? [v - e.sd.hostile, v + e.sd.hostile] : [v * (1 - e.sd[k]), v * (1 + e.sd[k])];
}

/** How far off an estimate is (relative error of military power; points of hostility). */
export function errorOf(w: World, n: Nation, t: Nation): { mil: number; hostile: number } {
  const e = estimateOf(w, n, t);
  return { mil: e.bias.mil, hostile: e.bias.hostile };
}

export function beliefsDaily(w: World, days = 1) {
  const d = dayOf(w.time);
  const yearly = dateAt(w.time).month === 0 && dateAt(w.time).day === 1;
  for (const n of w.nations) {
    if (n.exile) continue;
    if (days === 1 && (d + n.id) % 7 !== 0 && !yearly) continue; // each government's weekly assessment
    for (const t of w.nations) {
      if (t.id === n.id || t.exile) continue;
      refresh(w, n, t);
      if (yearly) {
        const e = estimateOf(w, n, t);
        const truth = truthOf(w, n, t);
        const est = Object.fromEntries(MEASURES.map((k) => [k, believed(w, n, t, k)])) as Record<Measure, number>;
        (e.review ??= []).push({ t: w.time, est, truth });
        if (e.review.length > 10) e.review.shift();
      }
    }
  }
}
