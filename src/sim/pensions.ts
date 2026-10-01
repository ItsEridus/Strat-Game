// Retirement and pensions. Working people pay a share of every wage into a
// funded pension pot (where their country has one), and each year of work
// counts toward the state pension. From the national pension age (or a few
// years earlier, with a reduced state pension) people retire: the state pays
// its pension from the treasury, the pot is paid out as an annuity, and long
// service in the armed forces earns a military pension.
import { addHeirloom } from './legacy';
import type { Citizen, World } from './types';
import { DAY } from '../engine/clock';
import { pay } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { cref, hhref, natref, player } from './query';
import { ageOf, lifeYear } from './growth';
import { milestone } from './lifecycle';
import { quitJob } from './company';
import { leavePost } from './services';
import { annuity } from './loans';
import { localNews } from './life';
import { holdsOffice } from './population';

export interface Pension { days: number; pot: number; state?: number; private?: number; military?: number; since?: number }

/** Statutory pension age, the state pension (share of an average wage after a full career) and the funded contribution rate. OECD Pensions at a Glance, rounded. */
export const PENSIONS: Record<string, { age: number; state: number; contrib: number }> = {
  USA: { age: 67, state: 0.39, contrib: 0.05 }, CAN: { age: 65, state: 0.38, contrib: 0.05 }, MEX: { age: 65, state: 0.3, contrib: 0.065 },
  BRA: { age: 65, state: 0.6, contrib: 0 }, ARG: { age: 65, state: 0.6, contrib: 0 }, GBR: { age: 66, state: 0.29, contrib: 0.05 },
  DEU: { age: 67, state: 0.43, contrib: 0 }, RUS: { age: 64, state: 0.35, contrib: 0 }, TUR: { age: 60, state: 0.6, contrib: 0 },
  SAU: { age: 60, state: 0.5, contrib: 0.09 }, ZAF: { age: 60, state: 0.15, contrib: 0.05 }, IND: { age: 60, state: 0.1, contrib: 0.12 },
  CHN: { age: 62, state: 0.45, contrib: 0.08 }, JPN: { age: 65, state: 0.32, contrib: 0 }, KOR: { age: 63, state: 0.3, contrib: 0.045 },
  AUS: { age: 67, state: 0.25, contrib: 0.115 },
};
export const pensionRules = (w: World, c: Citizen) => PENSIONS[w.nations[c.nation].iso] ?? { age: 65, state: 0.35, contrib: 0.05 };
export const pensionOf = (c: Citizen): Pension => (c.pension ??= { days: 0, pot: 0 });
/** A national average wage per day (minor units), for pension formulas: about 1.8 × the minimum wage. */
const avgWage = (w: World, c: Citizen) => Math.round(w.nations[c.nation].minWage * 1.8);
/** Working days in a full career (35 years of about 230 working days), on the pace of life. */
const fullCareer = (w: World) => Math.round(35 * 230 * (lifeYear(w) / (365 * DAY)));

/** Called on every paid shift: a contribution to the pot (to the pension funds in the background economy) and a day on the record. */
export function contribute(w: World, c: Citizen, gross: number, code: string) {
  const p = pensionOf(c);
  p.days++;
  const rate = pensionRules(w, c).contrib;
  const amt = Math.floor(gross * rate);
  if (amt > 0 && pay(w, cref(c.id), hhref(c.nation), code, amt, 'Pension contribution')) p.pot += amt;
}

/** What someone would get a day if they retired now. */
export function pensionQuote(w: World, c: Citizen) {
  const r = pensionRules(w, c);
  const p = pensionOf(c);
  const age = ageOf(w, c);
  const early = Math.max(0, r.age - age);
  const years = Math.min(1, p.days / fullCareer(w));
  const state = Math.round(avgWage(w, c) * r.state * years * (1 - 0.06 * early));
  const priv = p.pot > 0 ? annuity(p.pot, 2, Math.round(20 * 365)) : 0;
  const vet = c.veteran && c.veteran.days >= 20 * 365 * (lifeYear(w) / (365 * DAY)) ? Math.round(avgWage(w, c) * (0.4 + c.veteran.rank * 0.03)) : 0;
  return { state, private: priv, military: vet, early, years: Math.round(years * 35) };
}

export function retireCheck(w: World, c: Citizen): string | null {
  if (c.retired) return 'You are already retired.';
  const r = pensionRules(w, c);
  if (ageOf(w, c) < r.age - 5) return `The earliest retirement in ${w.nations[c.nation].name} is ${r.age - 5} (pension age ${r.age}).`;
  return null;
}

/** Retire: leave work; the state pension, an annuity from the pot and any military pension start. */
export function retire(w: World, c: Citizen = player(w)): Result {
  const why = retireCheck(w, c);
  if (why) return fail(why);
  const q = pensionQuote(w, c);
  if (c.job != null) quitJob(w, c, true);
  if (c.post) leavePost(w, c, 'retired');
  c.retired = true;
  const p = pensionOf(c);
  p.state = q.state; p.private = q.private; p.military = q.military; p.since = w.time;
  addHeirloom(w, c, 'Gold watch', `a retirement gift at ${ageOf(w, c)}`);
  milestone(w, c, 'retirement', `retired${q.early ? ` ${q.early} year${q.early > 1 ? 's' : ''} early` : ''}`);
  const code = w.nations[c.nation].cur;
  return ok(`🌅 Retired. Pensions: ${fmtAmt(code, q.state)} a day from the state${q.private ? `, ${fmtAmt(code, q.private)} from your pension pot` : ''}${q.military ? `, ${fmtAmt(code, q.military)} military pension` : ''}.`);
}

/** Daily: pensions are paid; NPCs retire around their country's pension age. */
export function pensionsDaily(w: World) {
  for (const c of census(w).all) {
    if (!c.retired) {
      const r = pensionRules(w, c);
      const age = ageOf(w, c);
      if (!c.player && age >= r.age - 2 && hash01(c.id, Math.floor(w.time / DAY), 1316) < 0.01 * (age - r.age + 3) && !c.unit && !holdsOffice(w, c)) { const co = c.job != null ? w.companies[c.job] : null; if (retire(w, c).ok) localNews(w, c.home, `🎉 ${c.name} retired${co ? ` after years at ${co.name}` : ''}, aged ${age}.`); }
      continue;
    }
    const p = pensionOf(c);
    if (p.state == null) { // retired before pensions existed: a record from their working life (stable hash)
      p.days = Math.round(fullCareer(w) * (0.5 + hash01(c.id, 1316) * 0.5));
      const q = pensionQuote(w, c);
      p.state = q.state; p.private = 0; p.military = q.military; p.since = w.time;
    }
    const n = w.nations[c.nation];
    if (p.state && pay(w, natref(n.id), cref(c.id), n.cur, p.state, 'State pension')) n.stats.spendToday += p.state;
    if (p.private && p.pot > 0) { const amt = Math.min(p.private, p.pot); if (pay(w, hhref(n.id), cref(c.id), n.cur, amt, 'Private pension')) p.pot -= amt; }
    if (p.military && pay(w, natref(n.id), cref(c.id), n.cur, p.military, 'Military pension')) n.stats.spendToday += p.military;
  }
}
