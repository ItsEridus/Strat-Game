// Business market: companies listed for gold. Listed companies produce less
// (wiki; size SOLO). Purchase transfers gold and ownership atomically and keeps
// the company's accounting and ownership history.
import type { AccountRef, Citizen, Company, Id, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { acct, pay } from '../engine/ledger';
import { GOLD, fmtAmt } from '../engine/money';
import { notify, record } from '../engine/events';
import { authorize } from './authority';
import { companyCurrency, coref, cref } from './query';

export function listCompanyCheck(w: World, actor: Citizen, co: Company): string | null {
  const a = authorize(w, actor.id, coref(co.id), 'own');
  if (a) return a;
  if (co.forSale != null) return 'Already listed.';
  if (co.locked != null) return 'Held in escrow by a contract.';
  return null;
}

export function listCompany(w: World, actor: Citizen, id: Id, price: number): Result {
  const co = w.companies[id];
  if (!co) return fail('Company not found.');
  const why = listCompanyCheck(w, actor, co);
  if (why) return fail(why);
  if (!Number.isInteger(price) || price < 1) return fail('Invalid price.');
  co.forSale = price;
  return ok(`${co.name} listed for ${fmtAmt(GOLD, price)}. Production is reduced by ${B.company.listedPenalty * 100}% while listed.`);
}

export function unlistCompany(w: World, actor: Citizen, id: Id): Result {
  const co = w.companies[id];
  if (!co) return fail('Company not found.');
  const a = authorize(w, actor.id, coref(co.id), 'own');
  if (a) return fail(a);
  co.forSale = null;
  return ok('Listing removed.');
}

/** Transfer ownership (used by sales, contracts and holdings). Workers and history stay. */
export function transferCompany(w: World, co: Company, to: AccountRef, price?: number) {
  co.owner = to;
  co.forSale = null;
  co.ownerHist.push({ t: w.time, owner: to, price });
  co.auto = to.k === 'cit' && to.id === w.playerId ? { sell: co.auto.sell, buyInputs: co.auto.buyInputs, hire: co.auto.hire } : { sell: true, buyInputs: true, hire: true };
}

export function buyCompanyCheck(w: World, actor: Id, buyer: AccountRef, co: Company | undefined): string | null {
  if (!co) return 'Company not found.';
  if (co.forSale == null) return 'Not for sale.';
  if (co.locked != null) return 'Held in escrow by a contract.';
  const a = authorize(w, actor, buyer, 'money');
  if (a) return a;
  if (co.owner.k === buyer.k && co.owner.id === buyer.id) return 'You already own it.';
  if ((acct(w, buyer)?.wallet[GOLD] ?? 0) < co.forSale) return `Costs ${fmtAmt(GOLD, co.forSale)}.`;
  return null;
}

export function buyCompany(w: World, actor: Id, buyer: AccountRef, id: Id): Result {
  const co = w.companies[id];
  const why = buyCompanyCheck(w, actor, buyer, co);
  if (why) return fail(why);
  const price = co.forSale!;
  const seller = co.owner;
  pay(w, buyer, seller, GOLD, price, `Purchase of ${co.name}`);
  transferCompany(w, co, buyer, price);
  const buyerName = buyer.k === 'cit' ? w.citizens[buyer.id]?.name : buyer.k === 'hold' ? w.holdings[buyer.id]?.name : 'a nation';
  record(w, 'company', `${co.name} was sold to ${buyerName} for ${fmtAmt(GOLD, price)}.`, { region: co.region, player: buyer.k === 'cit' && buyer.id === w.playerId });
  if (seller.k === 'cit' && seller.id === w.playerId) notify(w, 'company', `💰 ${co.name} sold for ${fmtAmt(GOLD, price)}.`, { link: 'companies' });
  return ok(`You bought ${co.name}.`);
}

/** Rough fair value in gold minor units: founding cost + recent profits. */
export function companyValue(w: World, co: Company): number {
  const base = B.company.foundCost.slice(0, co.q).reduce((a, b) => a + b, 0) * 1000;
  const cur = companyCurrency(w, co);
  const profit = co.hist.slice(-14).reduce((s, h) => s + h.profit, 0);
  const rate = w.nations.find((n) => n.cur === cur)?.fxAnchor || 10000;
  return Math.max(Math.round(base * 0.6), Math.round(base * 0.6 + ((profit * 1000) / rate) * 2));
}

/** AI investors/industrialists buy listed companies priced below their valuation. */
export function aiCompanyMarket(w: World) {
  for (const co of Object.values(w.companies)) {
    if (co.forSale == null) continue;
    const value = companyValue(w, co);
    if (co.forSale > value * 1.1) continue;
    const buyers = census(w).all.filter((c) => !c.player && (c.persona === 'industrialist' || c.persona === 'investor') && (c.wallet[GOLD] ?? 0) > co.forSale! * 1.3);
    const b = buyers.sort((a, z) => (z.wallet[GOLD] ?? 0) - (a.wallet[GOLD] ?? 0) || a.id - z.id)[0];
    if (b) buyCompany(w, b.id, cref(b.id), co.id);
  }
}
