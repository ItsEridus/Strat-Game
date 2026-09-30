// Auctions for equipment and special items, paid in gold. The lot and the
// current winning bid are held in escrow; displaced bids are refunded at once;
// a bid in the last minutes extends the auction (adapted to 10-minute ticks).
// Endings are processed by the event queue exactly once.
import type { Auction, Citizen, Id, World } from './types';
import { B } from '../data/balance';
import { itemName, SPECIALS } from '../data/items';
import { fail, ok, type Result } from '../engine/result';
import { burn, escrowIn, escrowOut, itemsFromEscrow, itemsToEscrow, pay } from '../engine/ledger';
import { GOLD, fmtAmt, g } from '../engine/money';
import { HOUR } from '../engine/clock';
import { nid, notify, record, schedule } from '../engine/events';
import { cref, player } from './query';
import { isEquipped } from './gear';
import { bump } from './progress';

export const MIN_INCREMENT = 0.05; // SOLO: new bids must beat the current one by 5%

export const lotName = (w: World, a: Auction) => (a.gear != null ? w.gear[a.gear]?.name ?? 'gear' : a.item ? `${a.item.qty}× ${itemName(a.item.key)}` : '?');
export const nextMinBid = (a: Auction) => (a.bid ? Math.ceil(a.bid.amount * (1 + MIN_INCREMENT)) : a.minBid);

export function createCheck(w: World, c: Citizen, lot: { gear?: Id; item?: string; qty?: number }, minBid: number, hours: number): string | null {
  if (c.level < B.auctions.level) return `Auctions unlock at level ${B.auctions.level}.`;
  if (hours < B.auctions.minHours || hours > B.auctions.maxHours) return `Duration must be ${B.auctions.minHours}–${B.auctions.maxHours} hours.`;
  if (!Number.isInteger(minBid) || minBid < 1) return 'Set a starting bid.';
  if ((c.wallet[GOLD] ?? 0) < g(B.auctions.listFee)) return `The listing fee is ${B.auctions.listFee} gold.`;
  if (lot.gear != null) {
    const gr = w.gear[lot.gear];
    if (!gr || gr.owner?.k !== 'cit' || gr.owner.id !== c.id) return 'You do not own that item.';
    if (isEquipped(c, lot.gear)) return 'Unequip it first.';
  } else if (lot.item) {
    if (!lot.item.startsWith('sp:')) return 'Only equipment and special items are auctioned.';
    if ((c.inv[lot.item] ?? 0) < (lot.qty ?? 1)) return 'Not enough in storage.';
  } else return 'Choose a lot.';
  return null;
}

export function createAuction(w: World, c: Citizen, lot: { gear?: Id; item?: string; qty?: number }, minBid: number, hours: number): Result {
  const why = createCheck(w, c, lot, minBid, hours);
  if (why) return fail(why);
  burn(w, cref(c.id), GOLD, g(B.auctions.listFee), 'Auction listing fee');
  const a: Auction = { id: nid(w), seller: c.id, gear: lot.gear ?? null, item: lot.item ? { key: lot.item, qty: lot.qty ?? 1 } : null, start: w.time, end: w.time + hours * HOUR, minBid, bid: null, status: 'open', fee: g(B.auctions.listFee), bids: 0 };
  if (a.gear != null) w.gear[a.gear].owner = null; // escrowed
  if (a.item) itemsToEscrow(w, cref(c.id), a.item.key, a.item.qty);
  w.auctions[a.id] = a;
  schedule(w, a.end, 'auctionEnd', { id: a.id });
  if (c.player) bump(w, 'auction');
  return ok(`Auction opened for ${lotName(w, a)} — ends in ${hours}h.`);
}

export function bidCheck(w: World, c: Citizen, a: Auction | undefined, amount: number): string | null {
  if (!a || a.status !== 'open') return 'Auction closed.';
  if (c.level < B.auctions.level) return `Auctions unlock at level ${B.auctions.level}.`;
  if (a.seller === c.id) return 'You cannot bid on your own lot.';
  if (a.bid?.by === c.id) return 'You already hold the winning bid.';
  if (amount < nextMinBid(a)) return `Bid at least ${fmtAmt(GOLD, nextMinBid(a))}.`;
  if ((c.wallet[GOLD] ?? 0) < amount) return 'Not enough gold.';
  return null;
}

export function placeBid(w: World, c: Citizen, id: Id, amount: number): Result {
  const a = w.auctions[id];
  const why = bidCheck(w, c, a, amount);
  if (why) return fail(why);
  escrowIn(w, cref(c.id), GOLD, amount, `Bid on ${lotName(w, a)}`);
  if (a.bid) {
    escrowOut(w, cref(a.bid.by), GOLD, a.bid.amount, 'Outbid refund');
    if (a.bid.by === w.playerId) notify(w, 'market', `🔨 You were outbid on ${lotName(w, a)} (${fmtAmt(GOLD, amount)}). Your bid was refunded.`, { link: 'auctions' });
  }
  a.bid = { by: c.id, amount };
  a.bids++;
  if (a.end - w.time <= B.auctions.snipeWindow) {
    a.end += B.auctions.snipeExtend;
    schedule(w, a.end, 'auctionEnd', { id: a.id });
  }
  return ok(`You lead with ${fmtAmt(GOLD, amount)}.`);
}

export function onAuctionEnd(w: World, id: Id) {
  const a = w.auctions[id];
  if (!a || a.status !== 'open' || w.time < a.end) return; // extended: a later event will close it
  const seller = w.citizens[a.seller];
  if (a.bid) {
    const winner = a.bid.by;
    const cut = Math.round(a.bid.amount * B.auctions.sellerCut);
    escrowOut(w, cref(a.seller), GOLD, a.bid.amount, `Auction sale: ${lotName(w, a)}`);
    burn(w, cref(a.seller), GOLD, cut, 'Auction seller charge');
    if (a.gear != null) w.gear[a.gear].owner = cref(winner);
    if (a.item) itemsFromEscrow(w, cref(winner), a.item.key, a.item.qty);
    a.status = 'sold';
    if (winner === w.playerId) notify(w, 'market', `🔨 You won ${lotName(w, a)} for ${fmtAmt(GOLD, a.bid.amount)}.`, { link: 'auctions' });
    if (a.seller === w.playerId) notify(w, 'market', `🔨 Sold ${lotName(w, a)} for ${fmtAmt(GOLD, a.bid.amount)} (−5% charge).`, { link: 'auctions' });
    record(w, 'auction', `🔨 ${lotName(w, a)} sold by ${seller?.name} to ${w.citizens[winner]?.name} for ${fmtAmt(GOLD, a.bid.amount)}.`, { cit: winner, player: winner === w.playerId || a.seller === w.playerId });
  } else {
    if (a.gear != null) w.gear[a.gear].owner = cref(a.seller);
    if (a.item) itemsFromEscrow(w, cref(a.seller), a.item.key, a.item.qty);
    a.status = 'unsold';
    if (a.seller === w.playerId) notify(w, 'market', `🔨 No bids for ${lotName(w, a)}; it was returned.`, { link: 'auctions' });
  }
  void pay; void player;
}

/** AI valuation of a lot in gold minor units for a given bidder. */
export function lotValue(w: World, a: Auction, c: Citizen): number {
  if (a.gear != null) {
    const gr = w.gear[a.gear];
    if (!gr) return 0;
    const base = [0.3, 1, 3, 8, 20][gr.rarity];
    const fit = (gr.family === 'combat' && c.persona === 'soldier') || (gr.family === 'construction' && c.persona === 'builder') || (gr.family === 'mining' && (c.persona === 'worker' || c.persona === 'investor')) ? 1.3 : ['plains', 'mountains', 'forest', 'desert'].includes(gr.family) && c.persona === 'soldier' ? 1.1 : 0.6;
    return g(base * fit);
  }
  if (a.item) return g((SPECIALS[a.item.key.slice(3)]?.price ?? 0.5) * 0.8 * a.item.qty);
  return 0;
}

/** Hourly: AI bidders with budgets and valuations. */
export function aiBidding(w: World) {
  const open = Object.values(w.auctions).filter((a) => a.status === 'open').sort((a, b) => a.id - b.id);
  if (!open.length) return;
  const bidders = Object.values(w.citizens).filter((c) => !c.player && c.level >= B.auctions.level && (c.wallet[GOLD] ?? 0) > g(1));
  for (const a of open) {
    let best: { c: Citizen; v: number } | null = null;
    for (const c of bidders) {
      if (c.id === a.seller || a.bid?.by === c.id) continue;
      const v = Math.min(lotValue(w, a, c) * (0.8 + ((c.id * 13) % 40) / 100), (c.wallet[GOLD] ?? 0) * 0.3);
      if (v >= nextMinBid(a) && (!best || v > best.v)) best = { c, v };
    }
    if (best && (a.end - w.time <= 3 * HOUR || a.bids === 0 || (w.time / 60 + best.c.id) % 3 === 0)) placeBid(w, best.c, a.id, nextMinBid(a));
  }
}

/** AI citizens occasionally auction spare gear. */
export function aiListings(w: World) {
  for (const c of Object.values(w.citizens)) {
    if (c.player || c.level < B.auctions.level || (c.wallet[GOLD] ?? 0) < g(B.auctions.listFee)) continue;
    const spare = Object.values(w.gear).filter((x) => x.owner?.k === 'cit' && x.owner.id === c.id && !isEquipped(c, x.id));
    if (!spare.length || (Math.floor(w.time / 1440) + c.id) % 5 !== 0) continue;
    const gr = spare[0];
    createAuction(w, c, { gear: gr.id }, g([0.1, 0.4, 1.2, 3, 8][gr.rarity]), 24);
  }
}
