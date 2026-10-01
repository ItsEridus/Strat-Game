// Official statistics (1.5 ECON), computed from what actually happens in the
// simulation, never invented. Each country publishes, every month:
// - GDP: the value companies add (sales less materials) plus government spending;
// - a consumer price index from a real basket (food, housing, transport, clothes,
//   electronics, medicine) priced on its own markets, and inflation from it;
// - unemployment, average pay on offer, exports, imports, public debt and the policy rate.
import type { Id, World } from './types';
import { dateAt } from '../engine/calendar';
import { refPrice } from './market';
import { rentOf } from './housing';
import { controller } from './query';

export interface MonthStat { key: string; days: number; gdp: number; cpi: number; inflation?: number; unemployment: number; wage: number; exports: number; imports: number; debt: number; rate: number }
export interface NationalStats { va: number; gov: number; days: number; base?: Record<string, number>; based?: boolean; cpi: number[]; months: MonthStat[] }

/** The consumer basket: weights by spending (rounded from national CPI weights), priced on the market. */
export const CPI_BASKET: [string, number][] = [['food:1', 0.4], ['rent', 0.27], ['ticket:1', 0.1], ['clothing:1', 0.1], ['electronics:1', 0.08], ['medicine:1', 0.05]];

const statsOf = (w: World, nation: Id): NationalStats => (w.nations[nation].stats2 ??= { va: 0, gov: 0, days: 0, cpi: [], months: [] });

/** A month's average price: everything sold in the last 30 days, by value (thin markets are noisy day to day). */
function priceOf(w: World, nation: Id, k: string): number | null {
  if (k === 'rent') return rentOf(w, w.nations[nation].capital, 'flat');
  const arr = w.trades[`${nation}|${k}`];
  if (arr?.length) {
    const since = Math.floor(w.time / 1440) - 30;
    let q = 0, v = 0;
    for (const s of arr) if (s.day >= since) { q += s.qty; v += s.value; }
    if (q) return v / q;
  }
  return refPrice(w, nation, k);
}

/** Today's consumer price index (100 = the first day it was measured). */
export function cpiNow(w: World, nation: Id): number {
  const s = statsOf(w, nation);
  const base = (s.base ??= {});
  let idx = 0, wt = 0;
  for (const [k, weight] of CPI_BASKET) {
    const p = priceOf(w, nation, k);
    if (!p) continue;
    base[k] ??= p;
    idx += weight * (p / base[k]);
    wt += weight;
  }
  return wt ? (idx / wt) * 100 : (s.cpi.at(-1) ?? 100);
}

/**
 * Annual inflation: over the last year once there is a year of data; before that, the trend since the index began
 * (January = 100), annualised, once there are three months of it. Unknown before then.
 */
export function inflation(w: World, nation: Id): number | undefined {
  const s = statsOf(w, nation);
  const ms = s.months;
  if (ms.length >= 13) return (ms[ms.length - 1].cpi / ms[ms.length - 13].cpi - 1) * 100;
  const c = s.cpi;
  if (!s.based || c.length < 90) return undefined;
  return (Math.pow(c[c.length - 1] / c[0], 365 / (c.length - 1)) - 1) * 100;
}

export function statisticsDaily(w: World) {
  const yesterday = Math.floor(w.time / 1440) - 1;
  const va = new Map<Id, number>();
  for (const co of Object.values(w.companies)) {
    const h = co.hist[co.hist.length - 1];
    if (!h || h.day !== yesterday) continue;
    const nat = controller(w.regions[co.region]);
    va.set(nat, (va.get(nat) ?? 0) + h.revenue - h.inputCost);
  }
  const d = dateAt(w.time);
  for (const n of w.nations) {
    const s = statsOf(w, n.id);
    s.va += va.get(n.id) ?? 0;
    s.gov += n.stats.spendHist[n.stats.spendHist.length - 1] ?? 0;
    s.days++;
    s.cpi.push(Math.round(cpiNow(w, n.id) * 100) / 100);
    if (s.cpi.length > 400) s.cpi.shift();
    if (d.day === 1 && s.days >= 7) {
      const prev = dateAt(w.time - 1440);
      const offers = Object.values(w.companies).filter((co) => co.offer && co.workers.length && controller(w.regions[co.region]) === n.id).map((co) => co.offer!.wage);
      const trade = n.trade?.hist ?? [];
      s.months.push({
        key: `${prev.year}-${String(prev.month + 1).padStart(2, '0')}`, days: s.days,
        gdp: s.va + s.gov, cpi: s.cpi[s.cpi.length - 1], inflation: 0, unemployment: n.unemployment,
        wage: offers.length ? Math.round(offers.reduce((a, b) => a + b, 0) / offers.length) : 0,
        exports: trade.reduce((t, x) => t + x.exp, 0), imports: trade.reduce((t, x) => t + x.imp, 0), debt: n.debt ?? 0, rate: n.policyRate ?? 0,
      });
      const inf = inflation(w, n.id);
      if (inf != null) s.months[s.months.length - 1].inflation = Math.round(inf * 10) / 10;
      // The index is based on the first full month's average prices (= 100).
      if (!s.based) { s.based = true; s.base = {}; s.cpi = []; cpiNow(w, n.id); s.cpi.push(100); s.months[s.months.length - 1].cpi = 100; }
      if (s.months.length > 36) s.months.shift();
      s.va = 0; s.gov = 0; s.days = 0;
    }
  }
}
