// The statistical skip (1.9 "Skip a year"): a year in seconds instead of minutes.
//
// Instead of living every hour of every person, the world moves a month at a time:
// - The national systems run their monthly turn: growth and capabilities, budgets and
//   grand strategy, the arsenal and defence industry, energy, food and the power ranking.
// - Money moves in aggregate, through the ledger: every company trades at its own recent
//   average (sales from households, wages to its workers, costs back to the economy);
//   governments collect and spend at their recent rates; people pay their living costs.
// - People age with the calendar; deaths follow the same mortality as day to day, as a
//   monthly probability; the population module tops regions up with arrivals and those
//   coming of age.
// - Battles under way are settled on the strength of the two sides; scheduled events
//   (elections, war deadlines, the end of pacts) fire in order as their dates pass.
// The player's own life is summarised in the review at the end. Day-to-day detail
// (individual shifts, markets, conversations) resumes when the skip is over.
import { withScope } from './scope';
import type { Citizen, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur } from '../engine/money';
import { chance } from '../engine/rng';
import { B } from '../data/balance';
import { census, invalidateCensus } from './census';
import { companyCurrency, coref, cref, hhref, natref, player } from './query';
import { runQueue } from './tick';
import { activeBattles, finishBattle } from './battle';
import { engaged, power } from './forces';
import { die, mortality, populationDaily } from './population';
import { dailyRevenue, dailySpending } from './publicFinance';
import { strategicDaily } from './strategic';
import { arsenalDaily } from './arsenal';
import { energyDaily } from './energy';
import { foodDaily } from './food';
import { powerMonthly } from './worldHistory';
import { budgetDaily } from './nationalBudget';
import { intelOrgDaily } from './intelOrg';
import { collectionDaily } from './collection';
import { counterIntelDaily } from './counterIntel';
import { beliefsDaily } from './beliefs';
import { warDecisionDaily } from './warDecision';
import { warHomeDaily } from './warHome';
import { warCourseDaily } from './warCourse';
import { regimesDaily } from './regimes';
import { uprisingsDaily } from './uprisings';
import { secessionDaily } from './secession';
import { civilWarDaily } from './civilWar';
import { technologyDaily } from './technology';
import { cyberDaily } from './cyber';
import { spaceDaily } from './space';
import { automationDaily } from './automation';
import { sovereignDaily } from './sovereign';
import { marketsDaily } from './markets';
import { climateDaily } from './climate';
import { softPowerDaily } from './softPower';
import { treatiesDaily } from './treaties';
import { relationsDaily } from './relations';
import { diplomacyActionsDaily } from './diplomacyActions';
import { intlDaily } from './intlOrgs';
import { balanceOfPowerDaily } from './balanceOfPower';
import { crisesDaily } from './crises';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The first moment of the next calendar month after `t`. */
function nextMonth(t: number): number {
  let x = t - (t % DAY) + DAY;
  while (dateAt(x).day !== 1) x += DAY;
  return x;
}

/** A month of companies trading at their recent averages. */
function companiesMonth(w: World, days: number) {
  for (const co of Object.values(w.companies)) {
    const h = co.hist.slice(-14);
    if (!h.length) continue;
    const code = companyCurrency(w, co);
    const nat = w.regions[co.region].owner;
    const hh = w.households[nat];
    if (!hh) continue;
    const sales = Math.round(avg(h.map((x) => x.revenue)) * days);
    const costs = Math.round(avg(h.map((x) => x.inputCost + (x.overheads ?? 0))) * days);
    if (sales > 0) pay(w, hhref(nat), coref(co.id), code, Math.min(sales, Math.floor((hh.wallet[code] ?? 0) * 0.02)), 'Sales (statistical month)');
    if (costs > 0) pay(w, coref(co.id), hhref(nat), code, Math.min(costs, co.wallet[code] ?? 0), 'Costs (statistical month)');
    // Wages: about five shifts a week.
    const wage = co.offer?.wage ?? 0;
    for (const id of [...co.workers]) {
      const c = w.citizens[id];
      if (!c || c.gone) continue;
      const due = Math.round(wage * days * (5 / 7));
      if (due <= 0) continue;
      const paid = Math.min(due, co.wallet[code] ?? 0); // a firm short of cash pays what it can; staff stay on
      if (paid > 0) pay(w, coref(co.id), cref(c.id), code, paid, `Wages from ${co.name} (statistical month)`);
      c.incomeAvg = Math.round(due / days);
    }
  }
}

/** A month of household living costs, and the state's revenue and spending at their recent rates. */
function householdsAndStatesMonth(w: World, days: number) {
  for (const c of census(w).all) {
    if (c.gone) continue;
    const n = w.nations[c.nation];
    if (!n) continue;
    const code = n.cur;
    const need = Math.round(cur(B.living.perDay) * days * 0.6);
    const amt = Math.min(need, Math.floor((c.wallet[code] ?? 0) * 0.5));
    if (amt > 0) pay(w, cref(c.id), hhref(n.id), code, amt, 'Living costs (statistical month)');
  }
  for (const n of w.nations) {
    if (n.exile) continue;
    const hh = w.households[n.id];
    const rev = Math.min(Math.round(dailyRevenue(n) * days), Math.floor((hh.wallet[n.cur] ?? 0) * 0.1));
    if (rev > 0 && pay(w, hhref(n.id), natref(n.id), n.cur, rev, 'Taxes (statistical month)')) n.stats.revenue += rev;
    const spend = Math.min(Math.round(dailySpending(n) * days), Math.floor((n.wallet[n.cur] ?? 0) * 0.5));
    if (spend > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, spend, 'Public spending (statistical month)')) n.stats.spending += spend;
  }
}

/** A month of mortality (the daily risk compounded), then arrivals and those coming of age. */
function peopleMonth(w: World, days: number) {
  const p = player(w);
  for (const c of census(w).all as Citizen[]) {
    if (c.player || c.gone) continue;
    const m = mortality(w, c);
    if (chance(w, 1 - Math.pow(1 - m, days - 1))) die(w, c, (c.health ?? 90) < 40 ? 'after an illness' : 'of old age');
  }
  populationDaily(w); // one day's churn and the region top-up
  invalidateCensus(w);
  if (p.gone) return;
}

/** Battles under way are settled by the strength of the two sides. */
function settleBattles(w: World) {
  for (const b of [...activeBattles(w)]) {
    if (b.kind !== 'war') { finishBattle(w, b, null); continue; }
    const a = engaged(w, b, 'a').reduce((t, f) => t + power(w, f), 0) + b.dmg.a / 1e6;
    const d = engaged(w, b, 'd').reduce((t, f) => t + power(w, f), 0) * 1.1 + b.dmg.d / 1e6; // defenders' edge
    finishBattle(w, b, chance(w, a / Math.max(1e-6, a + d)) ? 'a' : 'd');
  }
}

/** One statistical month (or what is left of it before `target`). */
export function skipMonth(w: World, target: number) {
  {
    const next = Math.min(target, nextMonth(w.time));
    const days = Math.max(1, Math.round((next - w.time) / DAY));
    companiesMonth(w, days);
    householdsAndStatesMonth(w, days);
    settleBattles(w);
    w.time = next;
    runQueue(w); // elections, war deadlines and anything else scheduled in the month, in order
    peopleMonth(w, days);
    // The monthly national turn (these run on the first of the month).
    regimesDaily(w); uprisingsDaily(w); secessionDaily(w); warCourseDaily(w); civilWarDaily(w); technologyDaily(w); cyberDaily(w); spaceDaily(w); automationDaily(w); sovereignDaily(w); marketsDaily(w); climateDaily(w); softPowerDaily(w); warHomeDaily(w, days);
    withScope(() => { warDecisionDaily(w, days); beliefsDaily(w, days); treatiesDaily(w); relationsDaily(w, days); diplomacyActionsDaily(w, days); intlDaily(w, days); balanceOfPowerDaily(w); crisesDaily(w, days); });
    intelOrgDaily(w); collectionDaily(w); counterIntelDaily(w);
    strategicDaily(w); arsenalDaily(w); energyDaily(w); foodDaily(w); powerMonthly(w); budgetDaily(w);
    for (const c of census(w).all) { c.energy = Math.max(c.energy, 50); c.lastWorkDay = Math.floor(w.time / DAY) - 1; }
  }
  invalidateCensus(w);
}

/** Skip ahead statistically to `target`, a month at a time. */
export function statisticalSkip(w: World, target: number) {
  while (w.time < target) skipMonth(w, target);
}
