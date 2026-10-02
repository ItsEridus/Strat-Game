// Banks and interest (1.5 ECON). Each central bank sets its policy rate once a month
// by a rule like the ones real central banks follow (a Taylor rule): it raises the rate
// when inflation runs above its target or unemployment is unusually low, and cuts it in
// the opposite case, by at most half a point a month. Lending and bond rates follow it.
// Savings in the bank earn interest, paid monthly by the banking system (the background
// economy). Owners of profitable companies short of cash can take a business loan; like
// all bank loans, it creates the money it lends.
import type { Company, Citizen, Id, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { mint, pay } from '../engine/ledger';
import { c as cur } from '../engine/money';
import { nid } from '../engine/events';
import { census } from './census';
import { companyCurrency, controller, coref, cref, hhref } from './query';
import { inflation } from './statistics';
import { ratePressure } from './sovereign';
import { KIND, POLICY_RATE, annuity, creditOf, loansOf, policyRateOf, type Loan } from './loans';

/** Inflation targets (%), from each central bank's mandate (2025). */
export const INFLATION_TARGET: Record<string, number> = { USA: 2, CAN: 2, MEX: 3, BRA: 3, ARG: 5, GBR: 2, DEU: 2, RUS: 4, TUR: 5, SAU: 2, ZAF: 4.5, IND: 4, CHN: 2, JPN: 2, KOR: 2, AUS: 2.5 };
/** Unemployment rates at which inflation is stable (roughly the long-run average, 2010s–2020s). */
export const NATURAL_UNEMPLOYMENT: Record<string, number> = { USA: 4.2, CAN: 6, MEX: 3.5, BRA: 9, ARG: 8, GBR: 4.5, DEU: 3.5, RUS: 5, TUR: 10, SAU: 6, ZAF: 30, IND: 7, CHN: 5, JPN: 2.6, KOR: 3.5, AUS: 4.5 };

/** Where the rule says the policy rate should be (%). */
export function taylorRate(w: World, nation: Id): number | null {
  const n = w.nations[nation];
  const pi = inflation(w, nation);
  if (pi == null) return null;
  const target = INFLATION_TARGET[n.iso] ?? 2;
  const natural = (NATURAL_UNEMPLOYMENT[n.iso] ?? 5) / 100;
  const neutral = 1 + target; // a real neutral rate of about 1%
  return Math.max(0, Math.min(60, neutral + pi - target + 0.5 * (pi - target) + 50 * (natural - n.unemployment)));
}

/** Interest on savings (% a year): the policy rate less the banks' margin. */
export const depositRate = (w: World, nation: Id) => Math.max(0, policyRateOf(w, nation) - 1.5);

export function bankingDaily(w: World) {
  const d = dateAt(w.time);
  if (d.day !== 1) return;
  for (const n of w.nations) {
    n.policyRate ??= POLICY_RATE[n.iso] ?? 4;
    const t = taylorRate(w, n.id);
    // A dependent central bank is leaned on to cut rates (sovereign.ts).
    if (t != null) { const goal = Math.max(0, t - ratePressure(w, n)); n.policyRate = Math.round((n.policyRate + Math.max(-0.5, Math.min(0.5, goal - n.policyRate))) * 4) / 4; }
  }
  // A month's interest on savings (cash in the home currency), paid by the banks while they can.
  for (const c of census(w).all) {
    if (c.gone) continue;
    const n = w.nations[c.nation];
    const cash = c.wallet[n.cur] ?? 0;
    if (cash < cur(10)) continue;
    const amt = Math.floor((cash * depositRate(w, n.id)) / 100 / 12);
    if (amt > 0 && (w.households[n.id].wallet[n.cur] ?? 0) > amt * 50) pay(w, hhref(n.id), cref(c.id), n.cur, amt, 'Interest on savings');
  }
}

/** Whether an owner can borrow for a company: good credit, a profitable month, and at most a month's sales. */
export function businessLoanCheck(w: World, owner: Citizen, co: Company, amount: number): string | null {
  if (creditOf(owner) < 550) return 'The bank wants a better credit score.';
  const month = co.hist.slice(-30);
  const sales = month.reduce((t, h) => t + h.revenue, 0), profit = month.reduce((t, h) => t + h.profit, 0);
  if (month.length < 14 || profit <= 0) return 'The bank lends to companies with a profitable record.';
  if (amount > sales) return 'The bank lends up to a month of sales.';
  if (loansOf(w, owner).some((l) => l.kind === 'business' && l.note === co.name)) return 'This company already has a business loan.';
  return null;
}
/** A business loan: the money goes into the company; the owner repays it. */
export function businessLoan(w: World, owner: Citizen, co: Company, amount: number): boolean {
  if (businessLoanCheck(w, owner, co, amount)) return false;
  const nat = controller(w.regions[co.region]);
  const code = companyCurrency(w, co);
  if (code !== w.nations[owner.nation].cur) return false;
  const days = Math.round(KIND.business.years * 365);
  const rate = +(policyRateOf(w, nat) + KIND.business.spread).toFixed(2);
  mint(w, coref(co.id), code, amount, `Business loan for ${co.name}`);
  const l: Loan = { id: nid(w), kind: 'business', borrower: owner.id, nation: nat, cur: code, principal: amount, balance: amount, rate, payment: annuity(amount, rate, days), start: w.time + DAY, term: days, paid: 0, missed: 0, note: co.name };
  (w.loans ??= {})[l.id] = l;
  return true;
}
/** Days of wages an AI owner borrows when a profitable company runs short. */
export const BUSINESS_LOAN_DAYS = 20;
