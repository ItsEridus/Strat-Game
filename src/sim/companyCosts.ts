// What it costs to run a company (1.5 ECON): besides wages and inputs, a firm rents
// its premises (more for a bigger, better plant, and more where property is dear),
// pays for energy as it produces, wears out its equipment (depreciation, shown in
// the accounts) and pays corporate tax on each month's profit at its country's
// real 2025 rate. Rent and energy go to the local economy; tax to the treasury.
import { energyDemand } from './weather';
import { evadeTax } from './whitecollar';
import type { Company, World } from './types';
import { pay } from '../engine/ledger';
import { c as cur } from '../engine/money';
import { dateAt } from '../engine/calendar';
import { companyCurrency, controller, coref, hhref, natref } from './query';
import { priceIndex } from './housing';
import { foundCost } from './company';

/** Daily rent for premises by grade (units of value, before the regional property index). */
const RENT = [0.6, 1, 1.6, 2.4, 3.6];
/** Energy per unit produced: raw materials are energy-hungry to extract, finished goods to make. */
const ENERGY_PER_UNIT = 0.03;
/** Equipment wears out over about ten years. */
const DEPRECIATION_YEAR = 0.1;

/** Corporate income tax, 2025 headline rates (%; OECD, KPMG; federal and typical sub-national combined, rounded). */
export const CORP_TAX: Record<string, number> = { USA: 25, CAN: 26, MEX: 30, BRA: 34, ARG: 35, GBR: 25, DEU: 30, RUS: 25, TUR: 25, SAU: 20, ZAF: 27, IND: 25, CHN: 25, JPN: 30, KOR: 24, AUS: 30 };
export const corpTaxRate = (w: World, co: Company) => (CORP_TAX[w.nations[controller(w.regions[co.region])].iso] ?? 25) / 100;

export const premisesRent = (w: World, co: Company) => Math.round(cur(RENT[co.q - 1] ?? 1) * priceIndex(w.regions[co.region]));
export const energyCost = (units: number) => Math.round(cur(ENERGY_PER_UNIT) * units);
/** The plant's book value in the company's currency: what founding and upgrading it cost, at today's gold rate. */
export function capitalValue(w: World, co: Company): number {
  const n = w.nations[controller(w.regions[co.region])];
  const gold = foundCost(w, co.region) * co.q * (1 + (co.q - 1) * 0.6);
  return Math.round((gold * n.fxAnchor) / 1000);
}
export const depreciationPerDay = (w: World, co: Company) => Math.round((capitalValue(w, co) * DEPRECIATION_YEAR) / 365);

/** Overheads per unit at the current output, for pricing. */
export function overheadPerUnit(w: World, co: Company, unitsPerDay: number): number {
  return Math.round(premisesRent(w, co) / Math.max(1, unitsPerDay)) + cur(ENERGY_PER_UNIT);
}

/** End of a company's day: rent and energy (as far as the money goes); on the 1st, corporate tax on last month's profit. */
export function payOverheads(w: World, co: Company) {
  const code = companyCurrency(w, co);
  const nat = controller(w.regions[co.region]);
  // A mothballed plant (no staff) keeps only its lease on a fifth of the space.
  const due = Math.round(premisesRent(w, co) * (co.workers.length ? 1 : 0.2)) + Math.round(energyCost(co.today.produced) * (w.weather ? energyDemand(w, co.region) : 1));
  const amt = Math.min(due, co.wallet[code] ?? 0);
  if (amt > 0 && pay(w, coref(co.id), hhref(nat), code, amt, 'Premises and energy')) co.today.overheads = (co.today.overheads ?? 0) + amt;
  if (dateAt(w.time).day === 1) {
    const profit = co.hist.slice(-30).reduce((t, h) => t + h.profit, 0);
    const tax = Math.min(co.wallet[code] ?? 0, evadeTax(w, co, Math.round(Math.max(0, profit) * corpTaxRate(w, co))));
    if (tax > 0 && pay(w, coref(co.id), natref(nat), code, tax, 'Corporate tax')) {
      co.today.tax = (co.today.tax ?? 0) + tax;
      const n = w.nations[nat];
      if (n.cur === code) n.stats.revToday += tax;
    }
  }
}

/** A month's profit and loss (the last 30 days), and a simple balance sheet. */
export function accounts(w: World, co: Company) {
  const days = co.hist.slice(-30);
  const sum = (f: (d: (typeof days)[number]) => number) => days.reduce((t, d) => t + f(d), 0);
  const revenue = sum((d) => d.revenue), wages = sum((d) => d.wages), inputs = sum((d) => d.inputCost), overheads = sum((d) => d.overheads ?? 0), tax = sum((d) => d.tax ?? 0);
  const depreciation = depreciationPerDay(w, co) * days.length;
  const operating = revenue - wages - inputs - overheads - depreciation;
  return { days: days.length, revenue, wages, inputs, overheads, depreciation, operating, tax, net: operating - tax, capital: capitalValue(w, co) };
}
