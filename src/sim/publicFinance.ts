// Public finance (1.5 ECON): when the treasury runs short, the government borrows by
// selling bonds (new money, as when a central bank buys them); it pays interest to
// bondholders (the background economy) at its policy rate plus a premium that rises
// with the debt; when money is plentiful it pays the debt down. Borrowing stops at
// three years of revenue: past that, spending has to be cut.
import type { Nation, World } from './types';
import { burn, mint, pay } from '../engine/ledger';
import { hhref, natref } from './query';
import { POLICY_RATE } from './loans';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** Daily spending and revenue, averaged over the last month. */
export const dailySpending = (n: Nation) => avg(n.stats.spendHist);
export const dailyRevenue = (n: Nation) => avg(n.stats.revHist);
/** Interest on the debt (%): the policy rate plus a premium for heavy debt. */
export function bondRate(n: Nation): number {
  const years = (n.debt ?? 0) / Math.max(1, dailyRevenue(n) * 365);
  return (n.policyRate ?? POLICY_RATE[n.iso] ?? 4) + 0.5 + Math.max(0, years - 1) * 1.5;
}
export const debtLimit = (n: Nation) => Math.round(dailyRevenue(n) * 365 * 3);

export function publicFinanceDaily(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const cash = n.wallet[n.cur] ?? 0;
    const month = Math.max(dailySpending(n), dailyRevenue(n) * 0.5) * 30;
    if (month <= 0) continue;
    // Interest, paid daily; unpaid interest is added to the debt.
    if (n.debt) {
      const due = Math.round((n.debt * bondRate(n)) / 36500);
      const paid = Math.min(due, cash);
      if (paid > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, paid, 'Interest on public debt')) { n.stats.spendToday += paid; n.interestPaid = (n.interestPaid ?? 0) + paid; }
      if (due > paid) n.debt += due - paid;
    }
    const now = n.wallet[n.cur] ?? 0;
    if (now < month / 2) {
      // Borrow up to a month of spending, within the debt limit.
      const amt = Math.min(Math.round(month - now), Math.max(0, debtLimit(n) - (n.debt ?? 0)));
      if (amt > 0) { mint(w, natref(n.id), n.cur, amt, 'Government bonds issued'); n.debt = (n.debt ?? 0) + amt; n.debtIssued = (n.debtIssued ?? 0) + amt; }
    } else if (n.debt && now > month * 4) {
      // Plenty of money: repay some debt.
      const amt = Math.min(n.debt, Math.round(now - month * 3));
      if (amt > 0 && burn(w, natref(n.id), n.cur, amt, 'Government bonds repaid')) n.debt -= amt;
    }
  }
}
