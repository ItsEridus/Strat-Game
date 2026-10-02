// Currency exchange: one order book per national currency against gold.
// Rates are always "currency per 1 gold". Asks sell gold, bids buy gold.
// Resting orders hold their offered asset in escrow; fills can be partial and
// execute at the resting order's rate.
import type { AccountRef, AssetId, FxOrder, Id, World } from './types';
import { fail, ok, type Result } from '../engine/result';
import { escrowIn, escrowOut, acct, pay } from '../engine/ledger';
import { GOLD, curForGold, fmtAmt, goldForCur } from '../engine/money';
import { nid } from '../engine/events';
import { authorize } from './authority';
import { bump } from './progress';

export const asks = (w: World, cur: AssetId) => Object.values(w.fx).filter((o) => o.cur === cur && o.side === 'sellGold').sort((a, b) => a.rate - b.rate || a.id - b.id);
export const bids = (w: World, cur: AssetId) => Object.values(w.fx).filter((o) => o.cur === cur && o.side === 'sellCur').sort((a, b) => b.rate - a.rate || a.id - b.id);
export const bestAskRate = (w: World, cur: AssetId) => asks(w, cur)[0]?.rate ?? null;
export const bestBidRate = (w: World, cur: AssetId) => bids(w, cur)[0]?.rate ?? null;

/** Mid-market rate (currency minor per gold), falling back to the last trade. */
export function midRate(w: World, cur: AssetId): number {
  const a = bestAskRate(w, cur), b = bestBidRate(w, cur);
  if (a && b) return Math.round((a + b) / 2);
  const last = w.fxTrades[cur]?.[w.fxTrades[cur].length - 1]?.rate;
  return a ?? b ?? last ?? 10000;
}

/** Gold available in an order at its rate. */
const goldOf = (o: FxOrder) => (o.side === 'sellGold' ? o.amount : goldForCur(o.amount, o.rate));

function recordFx(w: World, cur: AssetId, rate: number, gold: number) {
  const arr = (w.fxTrades[cur] = w.fxTrades[cur] ?? []);
  arr.push({ t: w.time, rate, gold });
  if (arr.length > 300) arr.shift();
}

/** Fill `goldAmt` of a resting order against `taker`. Assumes checks done. */
function fill(w: World, o: FxOrder, taker: AccountRef, goldAmt: number) {
  const curAmt = curForGold(goldAmt, o.rate);
  if (o.side === 'sellGold') {
    // taker pays currency to maker, receives escrowed gold
    pay(w, taker, o.maker, o.cur, curAmt, `Bought ${fmtAmt(GOLD, goldAmt)} at ${fmtAmt(o.cur, o.rate)}/g`);
    escrowOut(w, taker, GOLD, goldAmt, 'Gold purchase');
    o.amount -= goldAmt;
  } else {
    // taker pays gold to maker, receives escrowed currency
    pay(w, taker, o.maker, GOLD, goldAmt, `Sold ${fmtAmt(GOLD, goldAmt)} at ${fmtAmt(o.cur, o.rate)}/g`);
    escrowOut(w, taker, o.cur, curAmt, 'Gold sale');
    o.amount -= curAmt;
  }
  recordFx(w, o.cur, o.rate, goldAmt);
  // Remove exhausted orders and return dust that can no longer buy 0.001 gold.
  if (o.amount <= 0 || goldOf(o) <= 0) {
    if (o.amount > 0) escrowOut(w, o.maker, o.side === 'sellGold' ? GOLD : o.cur, o.amount, 'FX order dust returned');
    delete w.fx[o.id];
  }
}

/** Taker: buy up to goldAmt gold with currency, paying at most maxRate. */
export function buyGold(w: World, actor: Id, who: AccountRef, cur: AssetId, goldAmt: number, maxRate = Infinity): Result {
  const auth = authorize(w, actor, who, 'exchange');
  if (auth) return fail(auth);
  if (who.k === 'cit' && w.citizens[who.id].mining) return fail('Trading is blocked while mining.');
  let left = goldAmt, got = 0, paid = 0;
  for (const o of asks(w, cur)) {
    if (left <= 0 || o.rate > maxRate) break;
    if (o.maker.k === who.k && o.maker.id === who.id) continue;
    const have = acct(w, who)?.wallet[cur] ?? 0;
    const affordable = goldForCur(have, o.rate);
    const n = Math.min(left, o.amount, affordable);
    if (n <= 0) break;
    paid += curForGold(n, o.rate);
    fill(w, o, who, n);
    left -= n; got += n;
  }
  if (!got) return fail('No gold offers you can afford at that rate.');
  if (who.k === 'cit' && who.id === w.playerId) bump(w, 'fx');
  return ok(`Bought ${fmtAmt(GOLD, got)} for ${fmtAmt(cur, paid)}.`, { got, paid });
}

/** Taker: sell up to goldAmt gold for currency, accepting at least minRate. */
export function sellGold(w: World, actor: Id, who: AccountRef, cur: AssetId, goldAmt: number, minRate = 0): Result {
  const auth = authorize(w, actor, who, 'exchange');
  if (auth) return fail(auth);
  if (who.k === 'cit' && w.citizens[who.id].mining) return fail('Trading is blocked while mining.');
  let left = Math.min(goldAmt, acct(w, who)?.wallet[GOLD] ?? 0), sold = 0, got = 0;
  if (left <= 0) return fail('No gold to sell.');
  for (const o of bids(w, cur)) {
    if (left <= 0 || o.rate < minRate) break;
    if (o.maker.k === who.k && o.maker.id === who.id) continue;
    const n = Math.min(left, goldOf(o));
    if (n <= 0) continue;
    got += curForGold(n, o.rate);
    fill(w, o, who, n);
    left -= n; sold += n;
  }
  if (!sold) return fail('No buyers at that rate.');
  if (who.k === 'cit' && who.id === w.playerId) bump(w, 'fx');
  return ok(`Sold ${fmtAmt(GOLD, sold)} for ${fmtAmt(cur, got)}.`, { sold, got });
}

/** Maker: post a resting order (crossing orders are matched first as a taker). */
export function placeOrder(w: World, actor: Id, who: AccountRef, cur: AssetId, side: 'sellGold' | 'sellCur', goldAmt: number, rate: number): Result {
  const auth = authorize(w, actor, who, 'exchange');
  if (auth) return fail(auth);
  if (!Number.isInteger(rate) || rate < 1) return fail('Invalid rate.');
  if (!Number.isInteger(goldAmt) || goldAmt < 1) return fail('Invalid amount.');
  if (who.k === 'cit' && w.citizens[who.id].mining) return fail('Trading is blocked while mining.');
  let remaining = goldAmt;
  let matched = '';
  if (side === 'sellGold') {
    const bb = bestBidRate(w, cur);
    if (bb !== null && bb >= rate) {
      const r = sellGold(w, actor, who, cur, remaining, rate);
      if (r.ok) { remaining -= r.data.sold; matched = r.msg + ' '; }
    }
    if (remaining <= 0) return ok(matched.trim());
    if (!escrowIn(w, who, GOLD, remaining, 'FX order placed')) return fail(matched + 'Not enough gold.');
    const o: FxOrder = { id: nid(w), cur, side, amount: remaining, rate, maker: who, created: w.time };
    w.fx[o.id] = o;
  } else {
    const ba = bestAskRate(w, cur);
    if (ba !== null && ba <= rate) {
      const r = buyGold(w, actor, who, cur, remaining, rate);
      if (r.ok) { remaining -= r.data.got; matched = r.msg + ' '; }
    }
    if (remaining <= 0) return ok(matched.trim());
    const need = curForGold(remaining, rate);
    if (!escrowIn(w, who, cur, need, 'FX order placed')) return fail(matched + `Not enough ${cur} (need ${fmtAmt(cur, need)}).`);
    const o: FxOrder = { id: nid(w), cur, side, amount: need, rate, maker: who, created: w.time };
    w.fx[o.id] = o;
  }
  return ok(`${matched}Order posted: ${side === 'sellGold' ? 'sell' : 'buy'} ${fmtAmt(GOLD, remaining)} at ${fmtAmt(cur, rate)} per gold.`);
}

export function cancelOrder(w: World, actor: Id, id: Id): Result {
  const o = w.fx[id];
  if (!o) return fail('Order not found.');
  const auth = authorize(w, actor, o.maker, 'exchange');
  if (auth) return fail(auth);
  escrowOut(w, o.maker, o.side === 'sellGold' ? GOLD : o.cur, o.amount, 'FX order cancelled');
  delete w.fx[id];
  return ok('Order cancelled; escrow returned.');
}

/** Withdraw an order without an actor (a company being wound up): the escrow returns to its maker. */
export function forceCancelOrder(w: World, id: Id) {
  const o = w.fx[id];
  if (!o) return;
  escrowOut(w, o.maker, o.side === 'sellGold' ? GOLD : o.cur, o.amount, 'FX order withdrawn');
  delete w.fx[id];
}

export const ordersOf = (w: World, who: AccountRef) => Object.values(w.fx).filter((o) => o.maker.k === who.k && o.maker.id === who.id);

/** Volume-weighted rate of the last `days` of trades (null if none). */
export function vwap(w: World, cur: AssetId, days = 3): number | null {
  const since = w.time - days * 1440;
  let gsum = 0, v = 0;
  for (const t of w.fxTrades[cur] ?? []) if (t.t >= since) { gsum += t.gold; v += t.gold * t.rate; }
  return gsum ? Math.round(v / gsum) : null;
}
