// The labour market (1.5 GEO 1). Everyone in work has an occupation (from their
// workplace and qualifications); firms that cut jobs pay redundancy; people who lose
// a job claim unemployment benefit at their country's real rate and for its real
// duration; and collective agreements cover part of each country's firms, whose pay
// cannot be cut and rises each January with the inflation target.
import type { Citizen, Company, Id, Industry, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { hash01 } from '../engine/rng';
import { pay } from '../engine/ledger';
import { census } from './census';
import { companyCurrency, controller, coref, cref, natref } from './query';
import { rank } from '../data/education';
import { OCCUPATIONS, type Occupation } from '../data/occupations';
import { eduOfCitizen } from './education';

/** Unemployment benefit: share of the last wage, and for how many weeks (OECD benefit rules, 2024, simplified). */
export const BENEFITS: Record<string, { rate: number; weeks: number }> = {
  USA: { rate: 0.45, weeks: 26 }, CAN: { rate: 0.55, weeks: 35 }, MEX: { rate: 0, weeks: 0 }, BRA: { rate: 0.7, weeks: 20 },
  ARG: { rate: 0.5, weeks: 26 }, GBR: { rate: 0.15, weeks: 26 }, DEU: { rate: 0.6, weeks: 52 }, RUS: { rate: 0.2, weeks: 26 },
  TUR: { rate: 0.4, weeks: 30 }, SAU: { rate: 0.6, weeks: 52 }, ZAF: { rate: 0.38, weeks: 34 }, IND: { rate: 0, weeks: 0 },
  CHN: { rate: 0.25, weeks: 52 }, JPN: { rate: 0.6, weeks: 20 }, KOR: { rate: 0.6, weeks: 26 }, AUS: { rate: 0.25, weeks: 104 },
};
/** Share of workers covered by a collective agreement (OECD/ILO, latest year, rounded). */
export const BARGAINING: Record<string, number> = {
  USA: 0.12, CAN: 0.3, MEX: 0.1, BRA: 0.5, ARG: 0.5, GBR: 0.26, DEU: 0.5, RUS: 0.2, TUR: 0.08, SAU: 0, ZAF: 0.3, IND: 0.05, CHN: 0.2, JPN: 0.17, KOR: 0.15, AUS: 0.5,
};
export const benefitRules = (w: World, nation: Id) => BENEFITS[w.nations[nation].iso] ?? { rate: 0.4, weeks: 26 };

/** Whether a company's pay is set by a collective agreement (a stable share of firms in each country). */
export const covered = (w: World, co: Company) => hash01(co.id, 1501, 1) < (BARGAINING[w.nations[controller(w.regions[co.region])].iso] ?? 0.2);

const fits = (c: Citizen, o: Occupation) => {
  const e = eduOfCitizen(c);
  return rank(e.level) >= rank(o.edu) && (!o.field || (e.field != null && o.field.includes(e.field)));
};
/** The occupations an industry employs, cheapest first. */
export function occupationsIn(ind: Industry): string[] {
  return Object.entries(OCCUPATIONS).filter(([, o]) => o.industries?.includes(ind)).sort((a, b) => a[1].pay - b[1].pay).map(([k]) => k);
}
/** An industry's typical pay relative to a typical wage (its entry-level occupation). */
export const industryPay = (ind: Industry) => OCCUPATIONS[occupationsIn(ind)[0]]?.pay ?? 1;

/** What someone does for a living (an occupation key), or null if they are not in work. */
export function occupationOf(w: World, c: Citizen): string | null {
  if (c.post) {
    const g = c.post.grade;
    return ({ teacher: g === 0 ? 'assistant' : 'teacher', nurse: g === 0 ? 'careworker' : 'nurse', doctor: g >= 3 ? 'surgeon' : 'doctor', clerk: g >= 3 ? 'officemgr' : 'civilservant', engineer: g === 0 ? 'mechanic' : 'civileng', prosecutor: 'prosecutor', defender: 'lawyer', judge: 'judge', warden: g >= 3 ? 'warden' : 'prisonofficer', procurement: g >= 2 ? 'progmanager' : 'procofficer', emergency: g >= 3 ? 'emergcoord' : 'firefighter', meteorology: g === 0 ? 'civilservant' : 'meteorologist', diplomat: g >= 4 ? 'ambassador' : 'diplomat', tradeneg: 'tradenegotiator', intlcivil: 'intlofficer', research: 'scientist', astronaut: 'testpilot' } as const)[c.post.kind];
  }
  if (c.job != null && w.companies[c.job]) {
    const options = occupationsIn(w.companies[c.job].industry).filter((k) => fits(c, OCCUPATIONS[k]));
    if (!options.length) return occupationsIn(w.companies[c.job].industry)[0] ?? 'warehouse';
    // The best-paid job they qualify for, but not everyone gets it: a stable draw keeps a mix.
    const i = Math.floor(hash01(c.id, c.job, 1502) * Math.min(2, options.length));
    return options[options.length - 1 - i];
  }
  if (c.mil?.branch && !c.mil.reserve) return c.mil.commissioned ? 'officer' : 'soldier';
  return null;
}
export const occupationLabel = (w: World, c: Citizen) => { const k = occupationOf(w, c); return k ? OCCUPATIONS[k].label : null; };

/** Redundancy pay: a week's wages (five shifts) for each year of service, at least one week, at most twenty. */
export function redundancyPay(w: World, co: Company, c: Citizen): number {
  const years = Math.max(0, (w.time - (c.jobSince ?? w.time)) / (365 * DAY));
  return Math.round((co.offer?.wage ?? 0) * 5 * Math.min(20, Math.max(1, Math.floor(years))));
}

/** Someone lost their job through no fault of their own: redundancy pay from the firm, then benefit from the state. */
export function jobLost(w: World, c: Citizen, co: Company | null, wage: number) {
  if (co) {
    const code = companyCurrency(w, co);
    const amt = Math.min(redundancyPay(w, co, c), co.wallet[code] ?? 0);
    if (amt > 0) pay(w, coref(co.id), cref(c.id), code, amt, `Redundancy pay from ${co.name}`);
  }
  const r = benefitRules(w, c.nation);
  if (r.rate > 0 && r.weeks > 0 && wage > 0) c.benefit = { until: w.time + r.weeks * 7 * DAY, daily: Math.round(wage * r.rate) };
}

export function labourDaily(w: World) {
  const d = dateAt(w.time);
  for (const c of census(w).all) {
    const b = c.benefit;
    if (!b) continue;
    if (c.job != null || c.post || c.gone || c.retired || w.time > b.until) { delete c.benefit; continue; }
    const n = w.nations[c.nation];
    if ((n.wallet[n.cur] ?? 0) > b.daily * 30 && pay(w, natref(n.id), cref(c.id), n.cur, b.daily, 'Unemployment benefit')) n.stats.spendToday += b.daily;
  }
  // Collective agreements: in January, covered firms raise pay by the inflation target.
  if (d.month === 0 && d.day === 2) {
    for (const co of Object.values(w.companies)) {
      if (!co.offer || !covered(w, co)) continue;
      const iso = w.nations[controller(w.regions[co.region])].iso;
      const target = ({ MEX: 3, BRA: 3, ARG: 5, RUS: 4, TUR: 5, ZAF: 4.5, IND: 4, AUS: 2.5 } as Record<string, number>)[iso] ?? 2;
      co.offer.wage = Math.round(co.offer.wage * (1 + target / 100));
    }
  }
}
