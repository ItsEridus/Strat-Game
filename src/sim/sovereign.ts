// Sovereign finance (2.5 A world of consequences).
// - Central bank independence (0–1, from 2025 assessments): an independent bank follows its
//   rule (banking.ts); a dependent one is leaned on to cut rates before elections or when
//   the government is unpopular, which feeds inflation. Independence erodes under
//   autocracy and recovers in democracies.
// - Credit ratings, from AAA to D, start from the 2025 ratings (S&P, rounded) and move one
//   notch at a time with the fundamentals: debt against revenue, growth, inflation,
//   institutions, war, a failed state and past defaults. The rating sets the premium a
//   government pays on its bonds (publicFinance.ts).
// - Default: a government that has borrowed to its limit and cannot pay its bills defaults.
//   Its debt is restructured (bondholders take a loss of 30–50%), its rating falls to D,
//   its currency weakens as capital flees, growth suffers for two years and voters punish
//   the government. Ratings then recover slowly.
import type { Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { dataIso } from '../data/isoAlias';
import { capsOf, historyPace } from './strategic';
import { dailyRevenue, dailySpending, debtLimit } from './publicFinance';
import { inflation } from './statistics';
import { INFLATION_TARGET } from './banking';
import { regimeOf } from './regimes';
import { imfActive } from './intlOrgs';
import { activeWars } from './war';
import { player } from './query';

export const RATINGS = ['D', 'C', 'CC', 'CCC-', 'CCC', 'CCC+', 'B-', 'B', 'B+', 'BB-', 'BB', 'BB+', 'BBB-', 'BBB', 'BBB+', 'A-', 'A', 'A+', 'AA-', 'AA', 'AA+', 'AAA'];
export const ratingLabel = (score: number) => RATINGS[Math.max(0, Math.min(21, Math.round(score)))];
/** S&P long-term foreign-currency ratings, 2025 (Russia: unrated since 2022; set at its last rating band). */
const RATING_2025: Record<string, string> = {
  USA: 'AA+', CAN: 'AAA', MEX: 'BBB', BRA: 'BB', ARG: 'CCC', GBR: 'AA', DEU: 'AAA', RUS: 'BB-', TUR: 'BB-', SAU: 'A+', ZAF: 'BB-', IND: 'BBB', CHN: 'A+', JPN: 'A+', KOR: 'AA', AUS: 'AAA',
};
/** Central bank independence, 2025 (0–1; rounded from the Garriga and Romelli indices, with recent pressure). */
const INDEPENDENCE_2025: Record<string, number> = {
  USA: 0.8, CAN: 0.9, MEX: 0.8, BRA: 0.75, ARG: 0.4, GBR: 0.9, DEU: 0.95, RUS: 0.55, TUR: 0.3, SAU: 0.5, ZAF: 0.8, IND: 0.7, CHN: 0.3, JPN: 0.8, KOR: 0.8, AUS: 0.9,
};
const REGIME_INDEPENDENCE = { full: 0.9, flawed: 0.75, hybrid: 0.45, oneparty: 0.3, personalist: 0.25, junta: 0.25, monarchy: 0.45 } as const;

export interface Credit { score: number; base: number; law0: number; growth0: number; lastMove: number; outlook: -1 | 0 | 1; defaults: number[] }

export function creditOf(n: Nation): Credit {
  if (n.credit) return n.credit;
  const r = RATING_2025[dataIso(n.iso)];
  const score = n.parent != null ? 10 : r ? RATINGS.indexOf(r) : 12; // a new state starts at BB
  n.credit = { score, base: score, law0: -1, growth0: 999, lastMove: -1e12, outlook: 0, defaults: [] };
  return n.credit;
}
export const independenceOf = (n: Nation) => (n.cbIndependence ??= n.parent != null ? 0.5 : INDEPENDENCE_2025[dataIso(n.iso)] ?? 0.6);

/** The premium over the policy rate a government pays on its bonds (% a year). */
export function ratingSpread(n: Nation): number {
  const s = creditOf(n).score;
  return s >= 21 ? 0 : Math.pow(21 - s, 1.6) * 0.06;
}

/** Where the fundamentals say the rating should be. */
export function ratingTarget(w: World, n: Nation): number {
  const c = creditOf(n);
  const caps = capsOf(w, n);
  if (c.law0 < 0) c.law0 = caps.inst.law;
  if (c.growth0 > 900) c.growth0 = caps.growth;
  const debtYears = (n.debt ?? 0) / Math.max(1, dailyRevenue(n) * 365);
  const pi = inflation(w, n.id);
  const target = INFLATION_TARGET[dataIso(n.iso)] ?? 2;
  let t = c.base;
  t -= debtYears * 2.5; // the debt the government has run up since 2025
  if (pi != null) t -= Math.max(0, pi - target - 2) / 4; // inflation well above target
  t += (caps.growth - c.growth0) * 0.4;
  t += (caps.inst.law - c.law0) * 12;
  if (activeWars(w).some((x) => x.att === n.id || x.def === n.id)) t -= 1.5;
  if (n.failedSince != null) t -= 5;
  const recent = c.defaults.filter((d) => w.time - d < 10 * 365 * DAY).length;
  t -= recent * 3;
  if (imfActive(w, n.id)) t += 0.5; // a programme reassures
  return Math.max(0, Math.min(21, t));
}

/** Default and restructure. */
export function defaultOn(w: World, n: Nation, why: string) {
  const c = creditOf(n);
  const haircut = Math.round(rand(w, 0.3, 0.5) * 100) / 100;
  const before = n.debt ?? 0;
  n.debt = Math.round(before * (1 - haircut));
  c.score = 0;
  c.lastMove = w.time;
  c.outlook = 0;
  c.defaults.push(w.time);
  n.defaultedAt = w.time;
  n.approval = Math.max(5, n.approval - 8);
  n.fxAnchor = Math.round(n.fxAnchor * 1.15); // capital flight: the currency weakens
  const text = `💥 ${n.name} defaulted on its debt (${why}). Bondholders took a ${Math.round(haircut * 100)}% loss in the restructuring; the currency fell and the rating went to D.`;
  record(w, 'economy', text, { nation: n.id, important: true });
  (n.chronicle ??= []).push({ t: w.time, text });
  if (player(w).nation === n.id) notify(w, 'economy', text, { critical: true });
}

function monthly(w: World) {
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const c = creditOf(n);
    // Central bank independence drifts with the regime.
    const ind = independenceOf(n);
    const goal = REGIME_INDEPENDENCE[regimeOf(n).type];
    n.cbIndependence = Math.round((ind + (goal - ind) * 0.01) * 1000) / 1000;
    // Default: borrowing at its limit, the treasury nearly empty, no rescue.
    const cash = n.wallet[n.cur] ?? 0;
    if ((n.debt ?? 0) >= debtLimit(n) * 0.98 && cash < dailySpending(n) * 5 && !imfActive(w, n.id) && n.stats.spendHist.length >= 7 && chance(w, 0.5)) {
      defaultOn(w, n, 'it could no longer borrow or pay its bills');
      continue;
    }
    // The agencies review: at most one notch a quarter (a month in a crisis).
    const t = ratingTarget(w, n);
    const gap = t - c.score;
    c.outlook = gap > 0.6 ? 1 : gap < -0.6 ? -1 : 0;
    const crisis = gap < -3;
    if (Math.abs(gap) >= 1 && w.time - c.lastMove >= (crisis ? 30 : 90) * DAY) {
      const from = ratingLabel(c.score);
      c.score = Math.max(0, Math.min(21, c.score + Math.sign(gap)));
      c.lastMove = w.time;
      const text = `${gap > 0 ? '📈' : '📉'} ${n.name}'s credit rating was ${gap > 0 ? 'raised' : 'cut'} from ${from} to ${ratingLabel(c.score)}.`;
      record(w, 'economy', text, { nation: n.id, important: c.score <= 9 && gap < 0 });
      if (player(w).nation === n.id) notify(w, 'economy', text);
    }
  }
}

/** Political pressure on a dependent central bank (percentage points off the rule's rate). */
export function ratePressure(w: World, n: Nation): number {
  const lean = 1 - independenceOf(n);
  const election = Object.values(w.elections).some((e) => e.nation === n.id && !e.done && e.at > w.time && e.at - w.time < 180 * DAY);
  const unpopular = n.approval < 35;
  return election || unpopular ? lean * 3 : lean * 0.5;
}

export function sovereignDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}

/** For the UI: how the debt and rating stand. */
export function creditSummary(w: World, n: Nation): { rating: string; outlook: string; spread: number; debtYears: number; independence: number; defaults: number } {
  const c = creditOf(n);
  return {
    rating: ratingLabel(c.score), outlook: c.outlook > 0 ? 'positive' : c.outlook < 0 ? 'negative' : 'stable', spread: ratingSpread(n),
    debtYears: (n.debt ?? 0) / Math.max(1, dailyRevenue(n) * 365), independence: independenceOf(n), defaults: c.defaults.length,
  };
}
