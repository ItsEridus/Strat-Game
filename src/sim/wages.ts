// Wages by country (1.5 ECON). Amounts are kept in units of local pay (data/economy.ts),
// so a typical wage is the same number of units everywhere; the minimum wage is each
// country's real 2025 rate, and gold-priced costs scale to what pay is worth abroad.
import type { Citizen, Id, World } from './types';
import { dateAt } from '../engine/calendar';
import { lifeOf } from './lifecycle';
import { B } from '../data/balance';
import { c as cur } from '../engine/money';
import { goldScale as goldScaleOf, minWageShift } from '../data/economy';

/** A typical starting wage for a day's shift (minor units). */
export const typicalWage = () => cur(B.wages.start);
/** The real minimum wage per shift, never above 90% of a typical wage. */
export const realMinWage = (w: World, nation: Id) => Math.min(minWageShift(w.nations[nation].cur), Math.round(typicalWage() * 0.9));
/** Gold costs in a country: 1 in the US, far less where pay is worth less abroad. */
export const goldScale = (w: World, nation: Id) => goldScaleOf(w.nations[nation]?.cur ?? 'USD');

/** A month's pay, as on a payslip: gross, income tax, pension contributions and what reached the account. */
export interface Payslip { year: number; month: number; code: string; employer: string; shifts: number; gross: number; tax: number; pension: number; net: number }

/** Add a paid shift to the player's payslip for this month (only the player keeps payslips). */
export function recordPay(w: World, c: Citizen, employer: string, code: string, gross: number, tax: number, pension: number) {
  if (!c.player) return;
  const d = dateAt(w.time);
  const L = lifeOf(c);
  const list = (L.payslips ??= []);
  let p = list[list.length - 1];
  if (!p || p.year !== d.year || p.month !== d.month || p.code !== code) {
    p = { year: d.year, month: d.month, code, employer, shifts: 0, gross: 0, tax: 0, pension: 0, net: 0 };
    list.push(p);
    if (list.length > 3) list.shift();
  }
  p.employer = employer;
  p.shifts++;
  p.gross += gross; p.tax += tax; p.pension += pension; p.net += gross - tax - pension;
}
