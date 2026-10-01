// Loans: mortgages, student loans and personal loans from the banking system
// (banks become institutions in 1.5.0). As in real banking, a loan creates the
// money it lends and repaying the principal retires it; interest is the
// lenders' income and flows to the background economy. Rates follow
// each country's central-bank rate plus a spread; payments are a fixed daily
// annuity; lenders check that repayments are affordable; missed payments hurt
// credit, and a mortgage in long arrears ends in repossession. Every coin moves
// through the ledger.
import type { Citizen, Id, World } from './types';
import { B } from '../data/balance';
import { DAY } from '../engine/clock';
import { burn, mint, pay } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { nid, notify } from '../engine/events';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { controller, cref, hhref, jailed, player, today } from './query';
import { ageOf } from './growth';
import { lifeGate, lifeOf, milestone } from './lifecycle';
import { MORTGAGE, SIZES, priceOf, type HomeSize } from './housing';

export type LoanKind = 'mortgage' | 'student' | 'personal';
export interface Loan { id: Id; kind: LoanKind; borrower: Id; nation: Id; cur: string; principal: number; balance: number; rate: number; payment: number; start: number; term: number; paid: number; missed: number; note: string }

/** Central-bank policy rates at the start of 2025 (%), rounded. */
export const POLICY_RATE: Record<string, number> = { USA: 4.5, CAN: 3.25, MEX: 10, BRA: 12.25, ARG: 32, GBR: 4.75, DEU: 3, RUS: 21, TUR: 47.5, SAU: 5, ZAF: 7.75, IND: 6.5, CHN: 3.1, JPN: 0.25, KOR: 3, AUS: 4.35 };
export const KIND: Record<LoanKind, { label: string; icon: string; spread: number; years: number }> = {
  mortgage: { label: 'Mortgage', icon: '🏠', spread: 1.5, years: 25 },
  student: { label: 'Student loan', icon: '🎓', spread: 1, years: 10 },
  personal: { label: 'Personal loan', icon: '💳', spread: 7, years: 2 },
};

const index = new WeakMap<World, { n: number; t: number; by: Map<Id, Loan[]> }>();
/** Someone's loans (indexed; rebuilt when loans are added or removed). */
export function loansOf(w: World, c: Citizen): Loan[] {
  const all = w.loans ?? {};
  const n = Object.keys(all).length;
  let ix = index.get(w);
  if (!ix || ix.n !== n || ix.t !== w.time) {
    const by = new Map<Id, Loan[]>();
    for (const l of Object.values(all)) by.set(l.borrower, [...(by.get(l.borrower) ?? []), l]);
    ix = { n, t: w.time, by };
    index.set(w, ix);
  }
  return (ix.by.get(c.id) ?? []).filter((l) => all[l.id]);
}
export const debtOf = (w: World, c: Citizen) => loansOf(w, c).reduce((t, l) => t + l.balance, 0);
/** Credit score 300–850: starts at 650, rises with payments made, falls with missed ones. */
export const creditOf = (c: Citizen) => c.credit ?? 650;
const adjustCredit = (c: Citizen, d: number) => { c.credit = Math.max(300, Math.min(850, creditOf(c) + d)); };

/** The rate a lender offers (annual %): the policy rate, the kind's spread, and a premium for weak credit. */
export function rateFor(w: World, c: Citizen, kind: LoanKind): number {
  const base = POLICY_RATE[w.nations[c.nation].iso] ?? 4;
  const risk = kind === 'student' ? 0 : Math.max(0, (700 - creditOf(c)) / 50);
  return +(base + KIND[kind].spread + risk).toFixed(2);
}
/** Fixed daily payment that clears `amount` over `days` at `rate`% a year. */
export function annuity(amount: number, rate: number, days: number): number {
  const r = rate / 100 / 365;
  return Math.ceil(r > 0 ? (amount * r) / (1 - Math.pow(1 + r, -days)) : amount / days);
}

/** Income a lender counts (per day, minor units): the job's wage or the post's salary; for the player, the last 30 days. */
export function incomeOf(w: World, c: Citizen): number {
  if (c.player) {
    const code = w.nations[c.nation].cur;
    const m = (w.budget ?? []).slice(-2);
    const wages = m.reduce((t, x) => t + Math.max(0, x.asset[code]?.Wages ?? 0), 0);
    return Math.round(wages / 30);
  }
  if (c.job != null && w.companies[c.job]) return w.companies[c.job].offer?.wage ?? 0;
  if (c.post) return Math.round(w.nations[controller(w.regions[c.post.region])].minWage * 1.8);
  return 0;
}

// ---------- borrowing ----------

export function loanCheck(w: World, c: Citizen, kind: LoanKind, amount: number): string | null {
  const young = lifeGate(w, c, 18, 'Borrowing');
  if (young) return young;
  if (jailed(w, c)) return 'Lenders do not deal with prisoners.';
  if (!(amount > 0)) return 'Choose an amount.';
  if (creditOf(c) < 450) return `Your credit score (${creditOf(c)}) is too low for any lender.`;
  const code = w.nations[c.nation].cur;
  const days = Math.round(KIND[kind].years * 365);
  const pmt = annuity(amount, rateFor(w, c, kind), days);
  const existing = loansOf(w, c).reduce((t, l) => t + l.payment, 0);
  const income = incomeOf(w, c);
  if (kind !== 'student' && (pmt + existing) > income * B.loans.maxShare) return `Repayments of ${fmtAmt(code, pmt)} a day would be more than ${Math.round(B.loans.maxShare * 100)}% of your income (${fmtAmt(code, income)} a day).`;
  if (kind === 'personal' && amount > income * 90) return `Personal loans go up to about three months of income (${fmtAmt(code, income * 90)}).`;
  return null;
}

/** Take out a loan: the money arrives now; payments start tomorrow (student loans after a year). */
export function borrow(w: World, c: Citizen, kind: LoanKind, amount: number, note: string): Result {
  const why = loanCheck(w, c, kind, amount);
  if (why) return fail(why);
  const code = w.nations[c.nation].cur;
  const days = Math.round(KIND[kind].years * 365);
  const rate = rateFor(w, c, kind);
  mint(w, cref(c.id), code, amount, `${KIND[kind].label}: ${note}`);
  const l: Loan = { id: nid(w), kind, borrower: c.id, nation: c.nation, cur: code, principal: amount, balance: amount, rate, payment: annuity(amount, rate, days), start: w.time + (kind === 'student' ? 365 * DAY : DAY), term: days, paid: 0, missed: 0, note };
  (w.loans ??= {})[l.id] = l;
  return ok(`${KIND[kind].icon} ${KIND[kind].label} of ${fmtAmt(code, amount)} at ${rate}% a year: ${fmtAmt(code, l.payment)} a day for ${KIND[kind].years} years${kind === 'student' ? ', starting in a year' : ''}.`);
}
export const takePersonalLoan = (w: World, amount: number) => borrow(w, player(w), 'personal', amount, 'personal');

/** Buy a home with a mortgage: the deposit and fees from savings, the rest borrowed. */
export function mortgageCheck(w: World, c: Citizen, size: HomeSize): string | null {
  const price = priceOf(w, c.loc, size);
  const code = w.nations[controller(w.regions[c.loc])].cur;
  if (controller(w.regions[c.loc]) !== c.nation) return 'Mortgages are for homes in your own country.';
  const down = Math.round(price * B.loans.deposit + price * B.housing.fees);
  if ((c.wallet[code] ?? 0) < down) return `The deposit (${Math.round(B.loans.deposit * 100)}%) and fees come to ${fmtAmt(code, down)}.`;
  if (c.dwelling?.kind === 'own') return 'Sell your home first.';
  return loanCheck(w, c, 'mortgage', price - Math.round(price * B.loans.deposit));
}
export function buyWithMortgage(w: World, size: HomeSize, c: Citizen = player(w)): Result {
  const why = mortgageCheck(w, c, size);
  if (why) return fail(why);
  const price = priceOf(w, c.loc, size);
  const r = borrow(w, c, 'mortgage', price - Math.round(price * B.loans.deposit), `${SIZES[size].label.toLowerCase()} in ${w.regions[c.loc].name}`);
  if (!r.ok) return r;
  const nat = controller(w.regions[c.loc]);
  pay(w, cref(c.id), hhref(nat), w.nations[nat].cur, Math.round(price * (1 + B.housing.fees)), `Home purchase: ${SIZES[size].label.toLowerCase()}`);
  if (c.home !== c.loc) { c.home = c.loc; c.mineSite = c.loc; }
  c.dwelling = { kind: 'own', region: c.loc, size, since: w.time, paid: price };
  milestone(w, c, 'home', `bought a ${SIZES[size].label.toLowerCase()} in ${w.regions[c.loc].name} with a mortgage`);
  return ok(`🔑 You bought a ${SIZES[size].label.toLowerCase()} in ${w.regions[c.loc].name}. ${r.msg}`);
}

/** Pay a loan off early (no penalty). */
export function repayLoan(w: World, id: Id, c: Citizen = player(w)): Result {
  const l = w.loans?.[id];
  if (!l || l.borrower !== c.id) return fail('Not your loan.');
  if (!burn(w, cref(c.id), l.cur, l.balance, `${KIND[l.kind].label} repaid in full`)) return fail(`You need ${fmtAmt(l.cur, l.balance)}.`);
  delete w.loans![id];
  adjustCredit(c, 15);
  if (c.player) milestone(w, c, 'money', `paid off a ${KIND[l.kind].label.toLowerCase()}`);
  return ok(`Paid off: ${KIND[l.kind].label.toLowerCase()} (${l.note}).`);
}

// ---------- daily ----------

/** Daily: payments (interest first), arrears, defaults and repossessions; NPC tenants buy homes now and then. */
export function lendingDaily(w: World) {
  for (const l of Object.values(w.loans ?? {})) {
    if (w.time < l.start) continue;
    const c = w.citizens[l.borrower];
    if (!c || c.gone) { delete w.loans![l.id]; continue; } // the estate settles it (L5); written off for now
    const interest = Math.round((l.balance * l.rate) / 100 / 365);
    const due = Math.min(l.payment, l.balance + interest);
    if ((c.wallet[l.cur] ?? 0) >= due) {
      const toInterest = Math.min(interest, due);
      if (toInterest) pay(w, cref(c.id), hhref(l.nation), l.cur, toInterest, `${KIND[l.kind].label} interest`);
      if (due - toInterest) burn(w, cref(c.id), l.cur, due - toInterest, `${KIND[l.kind].label} repayment`);
      l.balance = Math.max(0, l.balance + interest - due);
      l.paid++;
      if (l.missed > 0) l.missed = Math.max(0, l.missed - 1);
      if (l.paid % 30 === 0) adjustCredit(c, 2);
      if (l.balance <= 0) {
        delete w.loans![l.id];
        adjustCredit(c, 10);
        if (c.player) { notify(w, 'economy', `🎉 Your ${KIND[l.kind].label.toLowerCase()} (${l.note}) is paid off.`, { critical: true, link: 'life' }); milestone(w, c, 'money', `paid off a ${KIND[l.kind].label.toLowerCase()}`); }
      }
    } else {
      l.balance += interest; // arrears accrue
      l.missed++;
      adjustCredit(c, -3);
      if (c.player && (l.missed === 1 || l.missed % 7 === 0)) notify(w, 'economy', `⚠️ You missed a ${KIND[l.kind].label.toLowerCase()} payment (${l.missed} in arrears). Missed payments hurt your credit${l.kind === 'mortgage' ? `; after ${B.loans.repossessAfter} the home is repossessed` : ''}.`, { critical: l.missed >= 7, link: 'life' });
      if (l.kind === 'mortgage' && l.missed >= B.loans.repossessAfter) repossess(w, c, l);
    }
  }
  // NPC tenants with steady work and savings buy a home now and then (a stable hash).
  const d = today(w);
  for (const c of census(w).all) {
    if (c.player || c.dwelling?.kind !== 'rent' || c.job == null || hash01(c.id, d, 1314) > 0.002) continue;
    if (ageOf(w, c) < 25 || ageOf(w, c) > 60) continue;
    c.loc = c.home;
    if (!mortgageCheck(w, c, c.dwelling.size)) buyWithMortgage(w, c.dwelling.size, c);
  }
}

/** Long arrears on a mortgage: the lender sells the home, clears the debt, returns anything left. */
function repossess(w: World, c: Citizen, l: Loan) {
  const h = c.dwelling;
  delete w.loans![l.id];
  adjustCredit(c, -120);
  if (h?.kind !== 'own') return;
  const value = Math.floor(priceOf(w, h.region, h.size) * (1 - B.housing.fees));
  const left = value - l.balance;
  // The home is sold: the sale clears the debt (a shortfall is the lender's loss); anything left is the owner's.
  if (left > 0) pay(w, hhref(l.nation), cref(c.id), l.cur, left, 'What was left after the repossession sale');
  c.dwelling = { kind: 'rent', region: h.region, size: h.size === 'house' ? 'flat' : 'room', since: w.time };
  lifeOf(c).stress = Math.min(100, lifeOf(c).stress + 25);
  if (c.player) { notify(w, 'economy', `🏚️ Your home was repossessed for unpaid mortgage payments${left > 0 ? `; ${fmtAmt(l.cur, left)} was left after the sale` : ''}.`, { critical: true, link: 'life' }); milestone(w, c, 'home', 'lost the house to the bank'); }
}

MORTGAGE.loanCheck = (w, c, amount) => loanCheck(w, c, 'mortgage', amount);
MORTGAGE.borrow = (w, c, amount, note) => borrow(w, c, 'mortgage', amount, note).ok;
