// Goods market: per-nation order books of sell listings. Listing moves goods into
// escrow (so they cannot be sold twice); buying transfers money and goods
// atomically and routes VAT/import tax to the market nation's treasury.
import { noteTrade } from './trade';
import type { AccountRef, Id, ItemKey, Listing, World } from './types';
import { B } from '../data/balance';
import { itemName } from '../data/items';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { acct, freeCap, itemsFromEscrow, itemsToEscrow, pay, sameRef } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { nid } from '../engine/events';
import { weightOf } from '../data/items';
import { authorize } from './authority';
import { controller, natref, seatShare, today } from './query';
import { bump } from './progress';

/** Nation an account belongs to for tax purposes. */
export function accountNation(w: World, ref: AccountRef): Id | null {
  switch (ref.k) {
    case 'cit': return w.citizens[ref.id]?.nation ?? null;
    case 'co': { const co = w.companies[ref.id]; return co ? controller(w.regions[co.region]) : null; }
    case 'nat': case 'hh': return ref.id;
    case 'hold': return w.holdings[ref.id]?.nation ?? null;
    case 'unit': return w.units[ref.id]?.nation ?? null;
    default: return null;
  }
}

/** Nation where an account physically is (citizens travel; organisations sit at home). */
export function accountLocNation(w: World, ref: AccountRef): Id | null {
  switch (ref.k) {
    case 'cit': { const c = w.citizens[ref.id]; return c ? controller(w.regions[c.loc]) : null; }
    case 'co': { const co = w.companies[ref.id]; return co ? controller(w.regions[co.region]) : null; }
    default: return accountNation(w, ref);
  }
}

export function embargoed(w: World, a: Id | null, b: Id | null) {
  if (a == null || b == null || a === b) return false;
  return w.nations[a]?.embargoes.includes(b) || w.nations[b]?.embargoes.includes(a);
}

/** Effective tax rates (percent) for a sale by `seller` in `market`. */
export function saleTaxes(w: World, market: Id, seller: AccountRef, buyer?: AccountRef) {
  const n = w.nations[market];
  const sellerNat = accountNation(w, seller);
  const shares = seatShare(w, n);
  let vat = n.taxes.vat;
  const domestic = (shares.socialism ?? 0) * IDEOLOGIES.socialism.fx.domestic;
  if (buyer && sellerNat === market && accountNation(w, buyer) === market) vat *= 1 - domestic;
  let imp = 0;
  if (sellerNat !== market) {
    imp = Math.max(n.taxes.import, (shares.communism ?? 0) * IDEOLOGIES.communism.fx.importTaxFloor);
    // Exile relief: hosts holding an exiled nation's cores waive import tax on its citizens' goods.
    if (sellerNat != null && w.nations[sellerNat]?.exile && w.regions.some((r) => r.core === sellerNat && r.owner === market)) imp = 0;
  }
  return { vat, imp };
}

// ---------- order-book index ----------
// Derived, never saved: listings grouped by market and item, and a count per
// seller and market. It is rebuilt from w.listings when a world is created or
// loaded, then kept in step by the functions below (the only places that add,
// remove or reprice listings).
interface BookIndex { books: Map<string, Set<Listing>>; sorted: Map<string, Listing[]>; sellers: Map<string, number> }
const INDEX = new WeakMap<Record<Id, Listing>, BookIndex>();
const bookKey = (market: Id, item: ItemKey) => `${market}|${item}`;
const sellerKey = (ref: AccountRef, market: Id) => `${ref.k}:${ref.id}|${market}`;

function books(w: World): BookIndex {
  let ix = INDEX.get(w.listings);
  if (!ix) {
    ix = { books: new Map(), sorted: new Map(), sellers: new Map() };
    INDEX.set(w.listings, ix);
    for (const l of Object.values(w.listings)) indexAdd(ix, l);
  }
  return ix;
}
function indexAdd(ix: BookIndex, l: Listing) {
  const k = bookKey(l.market, l.item);
  let set = ix.books.get(k);
  if (!set) ix.books.set(k, (set = new Set()));
  set.add(l);
  ix.sorted.delete(k);
  const sk = sellerKey(l.seller, l.market);
  ix.sellers.set(sk, (ix.sellers.get(sk) ?? 0) + 1);
}
function indexRemove(ix: BookIndex, l: Listing) {
  const k = bookKey(l.market, l.item);
  ix.books.get(k)?.delete(l);
  ix.sorted.delete(k);
  const sk = sellerKey(l.seller, l.market);
  ix.sellers.set(sk, Math.max(0, (ix.sellers.get(sk) ?? 1) - 1));
}
function removeListing(w: World, l: Listing) {
  indexRemove(books(w), l);
  delete w.listings[l.id];
}

/** Listings for an item in a market, cheapest first. The array is shared: do not modify it. */
export function listingsFor(w: World, market: Id, item: ItemKey): readonly Listing[] {
  const ix = books(w);
  const k = bookKey(market, item);
  let arr = ix.sorted.get(k);
  if (!arr) {
    arr = [...(ix.books.get(k) ?? [])].sort((a, b) => a.price - b.price || a.id - b.id);
    ix.sorted.set(k, arr);
  }
  return arr;
}

export const bestAsk = (w: World, market: Id, item: ItemKey): number | null => listingsFor(w, market, item)[0]?.price ?? null;

export const supplyOf = (w: World, market: Id, item: ItemKey) => {
  let s = 0;
  for (const l of listingsFor(w, market, item)) s += l.qty;
  return s;
};

/** Number of listings a seller has in a market. */
export const listingCount = (w: World, seller: AccountRef, market: Id) => books(w).sellers.get(sellerKey(seller, market)) ?? 0;

export function listCheck(w: World, actor: Id, seller: AccountRef, market: Id, item: ItemKey, qty: number, price: number, exporting = false): string | null {
  const a = acct(w, seller);
  if (!a) return 'Seller not found.';
  const auth = authorize(w, actor, seller, seller.k === 'nat' ? 'publicTrade' : 'trade');
  if (auth) return auth;
  if (!Number.isInteger(qty) || qty < 1) return 'Enter a quantity of at least 1.';
  if (!Number.isInteger(price) || price < 1) return 'Enter a positive price.';
  if ((a.inv[item] ?? 0) < qty) return `Only ${a.inv[item] ?? 0} ${itemName(item)} available (listed goods are reserved).`;
  if (item.startsWith('sp:')) return 'Special items trade through auctions and contracts.';
  if (!exporting && accountLocNation(w, seller) !== market) return `You must be located in ${w.nations[market].name} to sell on its market.`;
  if (seller.k === 'cit' && w.citizens[seller.id].mining) return 'Market trading is blocked while mining.';
  if (w.nations[market].exile) return 'This nation has no territory and no market.';
  if (embargoed(w, accountNation(w, seller), market)) return 'Trade is blocked by an embargo.';
  if (listingCount(w, seller, market) >= B.market.maxListings) return `Listing limit reached (${B.market.maxListings}).`;
  return null;
}

export function list(w: World, actor: Id, seller: AccountRef, market: Id, item: ItemKey, qty: number, price: number, exporting = false): Result {
  const why = listCheck(w, actor, seller, market, item, qty, price, exporting);
  if (why) return fail(why);
  // Merge with an identical listing to keep books tidy.
  const same = listingsFor(w, market, item).find((l) => l.price === price && sameRef(l.seller, seller));
  itemsToEscrow(w, seller, item, qty);
  if (same) same.qty += qty;
  else {
    const l: Listing = { id: nid(w), market, item, qty, price, seller, created: w.time };
    w.listings[l.id] = l;
    indexAdd(books(w), l);
  }
  if (seller.k === 'cit' && seller.id === w.playerId) bump(w, 'list');
  return ok(`Listed ${qty} ${itemName(item)} at ${fmtAmt(w.nations[market].cur, price)} each.`);
}

export function cancelListing(w: World, actor: Id, id: Id, qty?: number): Result {
  const l = w.listings[id];
  if (!l) return fail('Listing no longer exists.');
  const auth = authorize(w, actor, l.seller, l.seller.k === 'nat' ? 'publicTrade' : 'trade');
  if (auth) return fail(auth);
  const n = Math.min(l.qty, qty ?? l.qty);
  itemsFromEscrow(w, l.seller, l.item, n);
  l.qty -= n;
  if (l.qty <= 0) removeListing(w, l);
  return ok(`Withdrew ${n} ${itemName(l.item)} from the market.`);
}

export function repriceListing(w: World, actor: Id, id: Id, price: number): Result {
  const l = w.listings[id];
  if (!l) return fail('Listing no longer exists.');
  const auth = authorize(w, actor, l.seller, l.seller.k === 'nat' ? 'publicTrade' : 'trade');
  if (auth) return fail(auth);
  if (!Number.isInteger(price) || price < 1) return fail('Invalid price.');
  if (l.price !== price) {
    l.price = price;
    books(w).sorted.delete(bookKey(l.market, l.item));
  }
  return ok('Price updated.');
}

function recordTrade(w: World, market: Id, item: ItemKey, n: number, unit: number) {
  const key = `${market}|${item}`;
  const arr = (w.trades[key] = w.trades[key] ?? []);
  const d = today(w);
  let s = arr[arr.length - 1];
  if (!s || s.day !== d) {
    s = { day: d, qty: 0, value: 0, lo: unit, hi: unit };
    arr.push(s);
    if (arr.length > 60) arr.shift();
  }
  s.qty += n;
  s.value += n * unit;
  s.lo = Math.min(s.lo, unit);
  s.hi = Math.max(s.hi, unit);
  w.lastPrice[key] = unit;
}

export function buyCheck(w: World, actor: Id, buyer: AccountRef, l: Listing | undefined, n: number): string | null {
  if (!l) return 'Listing no longer exists.';
  // Nations buy through the labour ministry (public trade) or, for construction supplies, the development ministry.
  const auth = buyer.k === 'nat' ? (authorize(w, actor, buyer, 'publicTrade') && authorize(w, actor, buyer, 'build')) : authorize(w, actor, buyer, 'trade');
  if (auth) return auth;
  if (!Number.isInteger(n) || n < 1) return 'Enter a quantity of at least 1.';
  if (n > l.qty) return `Only ${l.qty} available in this listing.`;
  if (sameRef(buyer, l.seller)) return 'You cannot buy your own listing.';
  if (accountLocNation(w, buyer) !== l.market) return `You must be located in ${w.nations[l.market].name} to buy on its market.`;
  if (buyer.k === 'cit' && w.citizens[buyer.id].mining) return 'Market trading is blocked while mining.';
  if (embargoed(w, accountNation(w, buyer), l.market)) return 'Trade is blocked by an embargo.';
  const cur = w.nations[l.market].cur;
  const total = l.price * n;
  const have = acct(w, buyer)?.wallet[cur] ?? 0;
  if (have < total) return `Need ${fmtAmt(cur, total)} (have ${fmtAmt(cur, have)}).`;
  if (freeCap(w, buyer) < weightOf(l.item) * n) return 'Not enough storage capacity.';
  return null;
}

/** Atomic purchase from a single listing. */
export function buyListing(w: World, actor: Id, buyer: AccountRef, id: Id, n: number): Result {
  const l = w.listings[id];
  const why = buyCheck(w, actor, buyer, l, n);
  if (why) return fail(why);
  const cur = w.nations[l.market].cur;
  const gross = l.price * n;
  const { vat, imp } = saleTaxes(w, l.market, l.seller, buyer);
  const tax = Math.min(gross, Math.round((gross * (vat + imp)) / 100));
  const treasury = natref(l.market);
  // money: buyer → seller (net) and → treasury (tax)
  if (!pay(w, buyer, l.seller, cur, gross - tax, `Sale of ${n} ${itemName(l.item)}`)) return fail('Payment failed.');
  if (tax) pay(w, buyer, treasury, cur, tax, `VAT/import tax on ${itemName(l.item)}`);
  w.nations[l.market].stats.revToday += tax;
  itemsFromEscrow(w, buyer, l.item, n);
  l.qty -= n;
  if (l.qty <= 0) removeListing(w, l);
  recordTrade(w, l.market, l.item, n, l.price);
  const from = accountNation(w, l.seller);
  if (from != null && from !== l.market) noteTrade(w, from, l.market, gross);
  if (l.seller.k === 'co') {
    const co = w.companies[l.seller.id];
    // Export sales count in the company's own currency, at the reference exchange rates.
    const home = co ? w.nations[controller(w.regions[co.region])] : null;
    const net = home && home.cur !== cur ? Math.round(((gross - tax) * home.fxAnchor) / Math.max(1, w.nations[l.market].fxAnchor)) : gross - tax;
    if (co) { co.today.sold += n; co.today.revenue += net; }
  }
  if (buyer.k === 'cit' && buyer.id === w.playerId) bump(w, 'buy');
  if (l.seller.k === 'cit' && l.seller.id === w.playerId) bump(w, 'sell', n);
  return ok(`Bought ${n} ${itemName(l.item)} for ${fmtAmt(cur, gross)} (incl. ${fmtAmt(cur, tax)} tax paid by seller).`, { n, gross });
}

/** Sweep the cheapest listings up to qty units and optional max unit price. */
export function buyBest(w: World, actor: Id, buyer: AccountRef, market: Id, item: ItemKey, qty: number, maxUnit = Infinity): Result {
  let left = qty, bought = 0, spent = 0;
  let lastErr = '';
  for (const l of listingsFor(w, market, item)) {
    if (left <= 0 || l.price > maxUnit) break;
    if (sameRef(l.seller, buyer)) continue;
    const cur = w.nations[market].cur;
    const have = acct(w, buyer)?.wallet[cur] ?? 0;
    const afford = Math.min(left, l.qty, Math.floor(have / l.price), Math.floor(freeCap(w, buyer) / weightOf(item)));
    if (afford <= 0) { lastErr = buyCheck(w, actor, buyer, l, 1) ?? 'Cannot afford.'; break; }
    const r = buyListing(w, actor, buyer, l.id, afford);
    if (!r.ok) { lastErr = r.msg; break; }
    left -= afford; bought += afford; spent += r.data.gross;
  }
  if (!bought) return fail(lastErr || `No ${itemName(item)} available at that price.`);
  return ok(`Bought ${bought} ${itemName(item)} for ${fmtAmt(w.nations[market].cur, spent)}.`, { bought, spent });
}

/** Quote for buying up to qty from the cheapest listings. */
export function quoteBest(w: World, market: Id, item: ItemKey, qty: number) {
  let left = qty, cost = 0, got = 0;
  for (const l of listingsFor(w, market, item)) {
    if (left <= 0) break;
    const n = Math.min(left, l.qty);
    cost += n * l.price; got += n; left -= n;
  }
  return { got, cost, avg: got ? cost / got : 0 };
}

/** Recent average traded price (falls back to best ask). */
export function refPrice(w: World, market: Id, item: ItemKey): number | null {
  const arr = w.trades[`${market}|${item}`];
  if (arr && arr.length) {
    let q = 0, v = 0;
    for (const s of arr.slice(-5)) { q += s.qty; v += s.value; }
    if (q) return Math.round(v / q);
  }
  return w.lastPrice[`${market}|${item}`] ?? bestAsk(w, market, item);
}

