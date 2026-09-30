// Holdings with a share ledger, roles, treasury and ownership-weighted votes;
// a stock market for their shares (citizens only — holdings may not buy
// shares, DOC). Issuance dilutes, dividends pay pro rata, splits scale orders.
import { repNeed, standing } from './growth';
import type { Citizen, Holding, Id, ShareOrder, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { acct, burn, pay } from '../engine/ledger';
import { GOLD, fmtAmt, g } from '../engine/money';
import { DAY } from '../engine/clock';
import { nid, notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { authorize } from './authority';
import { companyValue, transferCompany } from './companyMarket';
import { cref, player } from './query';
import { bump } from './progress';

export const holdRef = (id: Id) => ({ k: 'hold' as const, id });
export const sharesOf = (h: Holding, cid: Id) => h.shares[cid] ?? 0;
/** Fraction of all shares owned, counting shares the citizen has listed for sale. */
export const ownership = (w: World, h: Holding, cid: Id) => (sharesOf(h, cid) + escrowedShares(w, h, cid)) / h.total;
const escrowedShares = (w: World, h: Holding, cid: Id) => Object.values(w.shareOrders).filter((o) => o.holding === h.id && o.seller.k === 'cit' && o.seller.id === cid).reduce((s, o) => s + o.qty, 0);

export function holdingCompanies(w: World, h: Holding) { return Object.values(w.companies).filter((c) => c.owner.k === 'hold' && c.owner.id === h.id); }

/** Net asset value in gold minor units (treasury at reference FX + companies). */
export function valuation(w: World, h: Holding): number {
  let v = h.wallet[GOLD] ?? 0;
  for (const [a, amt] of Object.entries(h.wallet)) if (a !== GOLD) { const n = w.nations.find((x) => x.cur === a); if (n?.fxAnchor) v += Math.round((amt * 1000) / n.fxAnchor); }
  for (const co of holdingCompanies(w, h)) v += companyValue(w, co);
  return v;
}

export function lastSharePrice(w: World, hid: Id): number | null {
  for (let i = w.shareTrades.length - 1; i >= 0; i--) if (w.shareTrades[i].holding === hid) return w.shareTrades[i].price;
  return null;
}

export function foundHoldingCheck(w: World, c: Citizen): string | null {
  if (standing(c) < B.holdings.rep && !Object.values(w.companies).some((co) => co.owner.k === 'cit' && co.owner.id === c.id)) return `Investors won't back you yet: a holding needs ${repNeed(B.holdings.rep)} or a company of your own.`;
  if ((c.wallet[GOLD] ?? 0) < g(B.holdings.cost)) return `Founding a holding costs ${B.holdings.cost} gold.`;
  return null;
}

export function createHolding(w: World, founder: Citizen, name: string): Holding {
  const h: Holding = {
    id: nid(w), name, nation: founder.nation, founder: founder.id, ceo: founder.id, roles: {}, shares: { [founder.id]: B.holdings.shares }, total: B.holdings.shares,
    wallet: {}, inv: {}, issuePrice: g(1), public: false, founded: w.time, votes: [], divHist: [], valuation: 0,
  };
  w.holdings[h.id] = h;
  return h;
}

export function foundHolding(w: World, c: Citizen, name: string): Result {
  const why = foundHoldingCheck(w, c);
  if (why) return fail(why);
  if (!name.trim()) return fail('Name your holding.');
  burn(w, cref(c.id), GOLD, g(B.holdings.cost), 'Holding founding');
  const h = createHolding(w, c, name.trim().slice(0, 40));
  record(w, 'holding', `${c.name} founded the holding ${h.name}.`, { cit: c.id, nation: c.nation, player: c.player });
  if (c.player) bump(w, 'holding');
  return ok(`Founded ${h.name} with ${B.holdings.shares} shares, all yours.`);
}

/** Owner moves a personally owned company into a holding they run. */
export function contributeCompany(w: World, c: Citizen, hid: Id, coId: Id): Result {
  const h = w.holdings[hid];
  const co = w.companies[coId];
  if (!h || !co) return fail('Not found.');
  if (authorize(w, c.id, holdRef(hid), 'manage')) return fail('You must run the holding.');
  if (!(co.owner.k === 'cit' && co.owner.id === c.id)) return fail('You must personally own the company.');
  transferCompany(w, co, holdRef(hid));
  return ok(`${co.name} now belongs to ${h.name}.`);
}

export function setRole(w: World, c: Citizen, hid: Id, role: keyof Holding['roles'], who: Id | null): Result {
  const h = w.holdings[hid];
  if (!h || h.ceo !== c.id) return fail('Only the CEO assigns roles.');
  if (who == null) delete h.roles[role]; else h.roles[role] = who;
  return ok('Role updated.');
}

/** Pay a dividend from the holding treasury pro rata to all shareholders (including shares listed for sale). */
export function payDividend(w: World, actor: Id, hid: Id, asset: string, amount: number): Result {
  const h = w.holdings[hid];
  if (!h) return fail('Holding not found.');
  if (authorize(w, actor, holdRef(hid), 'money')) return fail('Only the CEO, vice CEO or accountant pays dividends.');
  if (!Number.isInteger(amount) || amount <= 0) return fail('Invalid amount.');
  if ((h.wallet[asset] ?? 0) < amount) return fail('The holding treasury is short.');
  const holders: Record<Id, number> = {};
  for (const [id, n] of Object.entries(h.shares)) holders[Number(id)] = (holders[Number(id)] ?? 0) + n;
  for (const o of Object.values(w.shareOrders)) if (o.holding === hid && o.seller.k === 'cit') holders[o.seller.id] = (holders[o.seller.id] ?? 0) + o.qty;
  let paid = 0;
  for (const [id, n] of Object.entries(holders).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const share = Math.floor((amount * n) / h.total);
    if (share > 0 && w.citizens[Number(id)] && pay(w, holdRef(hid), cref(Number(id)), asset, share, `Dividend from ${h.name}`)) paid += share;
  }
  h.divHist.push({ t: w.time, total: paid });
  if (holders[w.playerId]) notify(w, 'market', `💸 Dividend from ${h.name}: ${fmtAmt(asset, Math.floor((amount * holders[w.playerId]) / h.total))}.`, { link: 'holdings' });
  return ok(`Paid ${fmtAmt(asset, paid)} in dividends.`);
}

/** Issue new shares for sale on the stock market (dilutes existing holders when sold). */
export function issueShares(w: World, actor: Id, hid: Id, qty: number, price: number): Result {
  const h = w.holdings[hid];
  if (!h) return fail('Holding not found.');
  if (h.ceo !== actor) return fail('Only the CEO can issue shares.');
  if (!Number.isInteger(qty) || qty < 1 || qty > h.total) return fail('Issue between 1 share and doubling the share count.');
  if (!Number.isInteger(price) || price < 1) return fail('Set an issue price.');
  h.total += qty;
  const o: ShareOrder = { id: nid(w), holding: hid, seller: holdRef(hid), qty, price, created: w.time };
  w.shareOrders[o.id] = o;
  h.issuePrice = price;
  h.public = true;
  return ok(`Issued ${qty} new shares at ${fmtAmt(GOLD, price)}; proceeds go to the holding treasury as they sell.`);
}

export function splitShares(w: World, actor: Id, hid: Id, k: number): Result {
  const h = w.holdings[hid];
  if (!h || h.ceo !== actor) return fail('Only the CEO can split shares.');
  if (![2, 3, 5, 10].includes(k)) return fail('Split ratio must be 2, 3, 5 or 10.');
  for (const id of Object.keys(h.shares)) h.shares[Number(id)] *= k;
  for (const o of Object.values(w.shareOrders)) if (o.holding === hid) { o.qty *= k; o.price = Math.max(1, Math.round(o.price / k)); }
  for (const ct of Object.values(w.contracts)) if (ct.status === 'open') for (const s of [...ct.give.shares, ...ct.want.shares]) if (s.holding === hid) s.qty *= k;
  h.total *= k;
  h.issuePrice = Math.max(1, Math.round(h.issuePrice / k));
  return ok(`Split ${k}-for-1: ${h.total} shares outstanding.`);
}

export function listSharesCheck(w: World, c: Citizen, hid: Id, qty: number, price: number): string | null {
  const h = w.holdings[hid];
  if (!h) return 'Holding not found.';
  if (!Number.isInteger(qty) || qty < 1) return 'Enter a quantity.';
  if (sharesOf(h, c.id) < qty) return `You hold ${sharesOf(h, c.id)} unlisted shares.`;
  if (!Number.isInteger(price) || price < 1) return 'Set a price.';
  return null;
}

export function listShares(w: World, c: Citizen, hid: Id, qty: number, price: number): Result {
  const why = listSharesCheck(w, c, hid, qty, price);
  if (why) return fail(why);
  const h = w.holdings[hid];
  h.shares[c.id] -= qty;
  if (h.shares[c.id] === 0) delete h.shares[c.id];
  const o: ShareOrder = { id: nid(w), holding: hid, seller: cref(c.id), qty, price, created: w.time };
  w.shareOrders[o.id] = o;
  return ok(`Listed ${qty} ${h.name} shares at ${fmtAmt(GOLD, price)}.`);
}

export function cancelShareOrder(w: World, c: Citizen, id: Id): Result {
  const o = w.shareOrders[id];
  if (!o) return fail('Order not found.');
  const h = w.holdings[o.holding];
  if (o.seller.k === 'cit' ? o.seller.id !== c.id : authorize(w, c.id, o.seller, 'manage')) return fail('Not your order.');
  if (o.seller.k === 'cit') h.shares[o.seller.id] = (h.shares[o.seller.id] ?? 0) + o.qty;
  else h.total -= o.qty; // unsold newly issued shares are cancelled
  delete w.shareOrders[id];
  return ok('Order cancelled.');
}

export function buySharesCheck(w: World, buyerId: Id, o: ShareOrder | undefined, qty: number): string | null {
  if (!o) return 'Order not found.';
  if (!Number.isInteger(qty) || qty < 1 || qty > o.qty) return `Choose 1–${o.qty} shares.`;
  if (o.seller.k === 'cit' && o.seller.id === buyerId) return 'That is your own order.';
  const c = w.citizens[buyerId];
  if (c.mining) return 'Trading is blocked while mining.';
  if ((c.wallet[GOLD] ?? 0) < o.price * qty) return `Costs ${fmtAmt(GOLD, o.price * qty)}.`;
  return null;
}

/** Citizens buy shares; the holding is paid for new issues, sellers for resales. */
export function buyShares(w: World, buyerId: Id, orderId: Id, qty: number): Result {
  const o = w.shareOrders[orderId];
  const why = buySharesCheck(w, buyerId, o, qty);
  if (why) return fail(why);
  const h = w.holdings[o.holding];
  pay(w, cref(buyerId), o.seller, GOLD, o.price * qty, `${qty} ${h.name} shares`);
  h.shares[buyerId] = (h.shares[buyerId] ?? 0) + qty;
  o.qty -= qty;
  if (o.qty <= 0) delete w.shareOrders[o.id];
  w.shareTrades.push({ t: w.time, holding: h.id, qty, price: o.price });
  if (w.shareTrades.length > 2000) w.shareTrades.splice(0, 500);
  if (buyerId === w.playerId) bump(w, 'buyShares');
  return ok(`Bought ${qty} ${h.name} shares for ${fmtAmt(GOLD, o.price * qty)}.`);
}

// ---------- shareholder governance ----------
export function proposeCeo(w: World, c: Citizen, hid: Id, target: Id): Result {
  const h = w.holdings[hid];
  if (!h) return fail('Holding not found.');
  if (ownership(w, h, c.id) <= 0) return fail('Only shareholders can call votes.');
  if (h.votes.some((v) => !v.done)) return fail('A vote is already running.');
  if (!w.citizens[target]) return fail('Unknown citizen.');
  h.votes.push({ id: nid(w), kind: 'ceo', target, votes: { [c.id]: 'y' }, closes: w.time + DAY });
  return ok(`Vote called to make ${w.citizens[target].name} CEO. Needs a majority of all shares.`);
}

export function voteCeo(w: World, c: Citizen, hid: Id, vid: Id, yes: boolean): Result {
  const h = w.holdings[hid];
  const v = h?.votes.find((x) => x.id === vid && !x.done);
  if (!v) return fail('No open vote.');
  if (ownership(w, h, c.id) <= 0) return fail('Only shareholders vote.');
  v.votes[c.id] = yes ? 'y' : 'n';
  resolveCeoVote(w, h, v);
  return ok('Vote recorded (weighted by your shares).');
}

function resolveCeoVote(w: World, h: Holding, v: Holding['votes'][number]) {
  let yes = 0, no = 0;
  for (const [id, x] of Object.entries(v.votes)) { const s = ownership(w, h, Number(id)) * h.total; if (x === 'y') yes += s; else no += s; }
  // Majority of the whole shareholder base, not just of voters (DOC).
  if (yes > h.total / 2) { v.done = true; h.ceo = v.target; record(w, 'holding', `${w.citizens[v.target].name} became CEO of ${h.name}.`, { cit: v.target }); if (v.target === w.playerId) notify(w, 'office', `🏢 You are now CEO of ${h.name}.`, { critical: true }); }
  else if (no >= h.total / 2 || w.time >= v.closes) v.done = true;
}

/** AI shareholders vote on open CEO votes; AI CEOs pay dividends; AI investors trade shares. */
export function holdingsDaily(w: World) {
  for (const h of Object.values(w.holdings).sort((a, b) => a.id - b.id)) {
    for (const v of h.votes) if (!v.done) {
      for (const id of Object.keys(h.shares).map(Number)) {
        const c = w.citizens[id];
        if (!c || c.player || v.votes[id]) continue;
        const likes = (c.rel[v.target] ?? 0) - (c.rel[h.ceo] ?? 0) + (h.divHist.length ? -5 : 5);
        v.votes[id] = likes > 0 ? 'y' : 'n';
      }
      resolveCeoVote(w, h, v);
    }
    h.valuation = valuation(w, h);
    const ceo = w.citizens[h.ceo];
    if (!ceo || ceo.player) continue;
    // Monthly dividend: half of the gold-equivalent treasury above a reserve.
    if (Math.floor(w.time / DAY) % 15 === 0) {
      const n = w.nations[h.nation];
      const cash = h.wallet[n.cur] ?? 0;
      if (cash > 500 * 100) payDividend(w, ceo.id, h.id, n.cur, Math.floor(cash * 0.4));
    }
  }
  // AI investors: buy undervalued asks, list when overvalued.
  const investors = census(w).all.filter((c) => !c.player && (c.persona === 'investor' || c.persona === 'merchant'));
  for (const o of Object.values(w.shareOrders).sort((a, b) => a.price - b.price || a.id - b.id)) {
    const h = w.holdings[o.holding];
    if (!h) continue;
    const fair = Math.max(1, Math.round(h.valuation / h.total * 1.1 + (h.divHist.slice(-2).reduce((s, d) => s + d.total, 0) > 0 ? h.valuation / h.total * 0.2 : 0)));
    if (o.price > fair) continue;
    const buyer = investors.find((c) => (c.wallet[GOLD] ?? 0) > o.price * 3 && !(o.seller.k === 'cit' && o.seller.id === c.id));
    if (buyer) buyShares(w, buyer.id, o.id, Math.max(1, Math.min(o.qty, Math.floor(((buyer.wallet[GOLD] ?? 0) * 0.3) / o.price))));
  }
  for (const c of investors) {
    for (const h of Object.values(w.holdings)) {
      const s = h.shares[c.id] ?? 0;
      if (s < 2 || !chance(w, 0.05)) continue;
      const fair = Math.max(1, Math.round(h.valuation / h.total));
      listShares(w, c, h.id, Math.ceil(s / 4), Math.round(fair * 1.25));
    }
  }
  void player; void acct;
}

/** AI holding CEOs move profits up from their companies (handled by company AI) and buy cheap companies. */
export function seedHoldings(w: World) {
  for (const n of w.nations) {
    const inv = census(w).all.filter((c) => c.nation === n.id && !c.player && c.persona === 'investor').sort((a, b) => (b.wallet[GOLD] ?? 0) - (a.wallet[GOLD] ?? 0))[0];
    if (!inv) continue;
    const h = createHolding(w, inv, `${n.adj} Capital Group`);
    const cos = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === inv.id).slice(0, 2);
    for (const co of cos) transferCompany(w, co, holdRef(h.id));
    // float 30% of shares on the stock market
    const qty = Math.floor(h.total * 0.3);
    h.shares[inv.id] -= qty;
    const price = Math.max(g(0.5), Math.round(valuation(w, h) / h.total));
    const o: ShareOrder = { id: nid(w), holding: h.id, seller: cref(inv.id), qty, price, created: w.time };
    w.shareOrders[o.id] = o;
    h.public = true;
  }
}
