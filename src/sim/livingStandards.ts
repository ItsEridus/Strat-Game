// Living standards: how incomes and wealth are spread in a country, measured from
// the simulated people themselves (1.5 ECON). Income is pay and benefits per day,
// smoothed over about a month; wealth is cash at home plus the value of a home owned, less debts.
import type { Citizen, Id, World } from './types';
import { census } from './census';
import { ageOf } from './growth';
import { B } from '../data/balance';
import { priceOf } from './housing';
import { loansOf } from './loans';

/** Gini coefficient (0 = everyone equal, 1 = one person has everything). */
export function gini(xs: number[]): number {
  const v = xs.filter((x) => Number.isFinite(x)).map((x) => Math.max(0, x)).sort((a, b) => a - b);
  const n = v.length, total = v.reduce((a, b) => a + b, 0);
  if (n < 2 || total <= 0) return 0;
  let acc = 0;
  v.forEach((x, i) => { acc += (2 * (i + 1) - n - 1) * x; });
  return acc / (n * total);
}
const median = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };

export function wealthOf(w: World, c: Citizen): number {
  const code = w.nations[c.nation].cur;
  const home = c.dwelling?.kind === 'own' ? priceOf(w, c.dwelling.region, c.dwelling.size) : 0;
  const debt = loansOf(w, c).filter((l) => l.cur === code).reduce((t, l) => t + l.balance, 0);
  return (c.wallet[code] ?? 0) + home - debt;
}

export interface Standards { adults: number; medianIncome: number; incomeGini: number; wealthGini: number; poverty: number; comfortable: number; medianWealth: number }

/** Living standards among a country's adults (relative poverty: under 60% of median income, the OECD/EU line). */
export function livingStandards(w: World, nation: Id): Standards {
  const adults = census(w).all.filter((c) => c.nation === nation && !c.gone && ageOf(w, c) >= B.life.adultAge);
  const inc = adults.map((c) => c.incomeAvg ?? c.lastIncome ?? 0);
  const wealth = adults.map((c) => wealthOf(w, c));
  const med = median(inc);
  return {
    adults: adults.length,
    medianIncome: med,
    incomeGini: gini(inc),
    wealthGini: gini(wealth),
    poverty: adults.length ? inc.filter((x) => x < med * 0.6).length / adults.length : 0,
    comfortable: adults.length ? inc.filter((x) => x > med * 2).length / adults.length : 0,
    medianWealth: median(wealth),
  };
}
