// The only code allowed to change balances. Every money/item movement goes
// through here so totals can be audited: supply[asset] must always equal the sum
// of every wallet plus everything held in escrow (orders, bids, contracts).
import type { AccountRef, AssetId, Inventory, ItemKey, Wallet, World } from '../sim/types';
import { B } from '../data/balance';
import { weightOf } from '../data/items';
import { GOLD } from './money';
import { budgetRecord } from './budget';

export interface Account { wallet: Wallet; inv: Inventory; cap: number }

export function acct(w: World, ref: AccountRef): Account | null {
  switch (ref.k) {
    case 'cit': { const c = w.citizens[ref.id]; return c ? { wallet: c.wallet, inv: c.inv, cap: B.storage.citizen } : null; }
    case 'co': { const c = w.companies[ref.id]; return c ? { wallet: c.wallet, inv: c.inv, cap: B.company.storage } : null; }
    case 'nat': { const n = w.nations[ref.id]; return n ? { wallet: n.wallet, inv: n.inv, cap: B.storage.nation } : null; }
    case 'hh': { const h = w.households[ref.id]; return h ? { wallet: h.wallet, inv: h.inv, cap: Infinity } : null; }
    case 'hold': { const h = w.holdings[ref.id]; return h ? { wallet: h.wallet, inv: h.inv, cap: B.storage.holding } : null; }
    case 'unit': { const u = w.units[ref.id]; return u ? { wallet: u.wallet, inv: u.inv, cap: B.storage.unit } : null; }
    case 'synd': { const s = w.syndicates[ref.id]; return s ? { wallet: s.wallet, inv: s.inv, cap: B.storage.nation } : null; }
    case 'org': { const f = w.intl?.fund; return f ? { wallet: f.wallet, inv: f.inv, cap: Infinity } : null; }
    case 'reg': { const s = w.govs[ref.id]; return s ? { wallet: s.wallet, inv: s.inv, cap: B.storage.nation } : null; }
    default: return null;
  }
}

export const refKey = (r: AccountRef) => `${r.k}:${r.id}`;
export const sameRef = (a: AccountRef, b: AccountRef) => a.k === b.k && a.id === b.id;
export const bal = (w: World, ref: AccountRef, asset: AssetId) => acct(w, ref)?.wallet[asset] ?? 0;
export const qty = (w: World, ref: AccountRef, key: ItemKey) => acct(w, ref)?.inv[key] ?? 0;

function addW(wallet: Wallet, asset: AssetId, amt: number) {
  const v = (wallet[asset] ?? 0) + amt;
  if (v === 0) delete wallet[asset];
  else wallet[asset] = v;
}
function addI(inv: Inventory, key: ItemKey, n: number) {
  const v = (inv[key] ?? 0) + n;
  if (v === 0) delete inv[key];
  else inv[key] = v;
}

export function usedCap(inv: Inventory): number {
  let s = 0;
  for (const [k, n] of Object.entries(inv)) s += weightOf(k) * n;
  return s;
}
export const freeCap = (w: World, ref: AccountRef) => {
  const a = acct(w, ref);
  return a ? a.cap - usedCap(a.inv) : 0;
};

/** Diagnostics hook: called for every tracked flow when set (never saved, off in play). */
export const ledgerTap: { fn: ((ref: AccountRef, why: string, amount: number, asset: AssetId) => void) | null } = { fn: null };

function track(w: World, ref: AccountRef, text: string, amount: number, asset: AssetId) {
  if (ledgerTap.fn) ledgerTap.fn(ref, text, amount, asset);
  if (ref.k === 'cit' && ref.id === w.playerId) {
    w.ledger.unshift({ t: w.time, text, amount, asset, ref: refKey(ref) });
    if (w.ledger.length > 300) w.ledger.length = 300;
    budgetRecord(w, text, amount, asset);
  }
}

function assertInt(n: number, what: string) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${what}: ${n}`);
}

/** Move money between accounts. Returns false (and changes nothing) if the payer lacks funds. */
export function pay(w: World, from: AccountRef, to: AccountRef, asset: AssetId, amt: number, why: string): boolean {
  assertInt(amt, 'amount');
  if (amt === 0) return true;
  const a = acct(w, from), b = acct(w, to);
  if (!a || !b) return false;
  if ((a.wallet[asset] ?? 0) < amt) return false;
  addW(a.wallet, asset, -amt);
  addW(b.wallet, asset, amt);
  track(w, from, why, -amt, asset);
  track(w, to, why, amt, asset);
  return true;
}

/** Create money (tracked by reason so the UI can explain money creation). */
export function mint(w: World, to: AccountRef, asset: AssetId, amt: number, why: string) {
  assertInt(amt, 'mint');
  if (!amt) return;
  const b = acct(w, to);
  if (!b) throw new Error('mint to missing account');
  addW(b.wallet, asset, amt);
  w.stats.supply[asset] = (w.stats.supply[asset] ?? 0) + amt;
  const k = `${asset}|${why}`;
  w.stats.minted[k] = (w.stats.minted[k] ?? 0) + amt;
  track(w, to, why, amt, asset);
}

/** Destroy money (fees, founding costs). Returns false if insufficient. */
export function burn(w: World, from: AccountRef, asset: AssetId, amt: number, why: string): boolean {
  assertInt(amt, 'burn');
  if (!amt) return true;
  const a = acct(w, from);
  if (!a || (a.wallet[asset] ?? 0) < amt) return false;
  addW(a.wallet, asset, -amt);
  w.stats.supply[asset] = (w.stats.supply[asset] ?? 0) - amt;
  const k = `${asset}|${why}`;
  w.stats.burned[k] = (w.stats.burned[k] ?? 0) + amt;
  track(w, from, why, -amt, asset);
  return true;
}

/** Take money out of an account into an escrow held by an order/contract object. */
export function escrowIn(w: World, from: AccountRef, asset: AssetId, amt: number, why: string): boolean {
  assertInt(amt, 'escrow');
  const a = acct(w, from);
  if (!a || (a.wallet[asset] ?? 0) < amt) return false;
  addW(a.wallet, asset, -amt);
  track(w, from, why, -amt, asset);
  return true;
}
/** Release escrowed money to an account. */
export function escrowOut(w: World, to: AccountRef, asset: AssetId, amt: number, why: string) {
  assertInt(amt, 'escrow');
  const b = acct(w, to);
  if (!b) throw new Error('escrow release to missing account');
  addW(b.wallet, asset, amt);
  track(w, to, why, amt, asset);
}

// ---------- items ----------
export function produce(w: World, to: AccountRef, key: ItemKey, n: number, why: string): boolean {
  assertInt(n, 'produce');
  const b = acct(w, to);
  if (!b) return false;
  if (b.cap !== Infinity && usedCap(b.inv) + weightOf(key) * n > b.cap) return false;
  addI(b.inv, key, n);
  w.stats.items[key] = (w.stats.items[key] ?? 0) + n;
  w.stats.itemFlows[`+${why}`] = (w.stats.itemFlows[`+${why}`] ?? 0) + n;
  return true;
}
export function consume(w: World, from: AccountRef, key: ItemKey, n: number, why: string): boolean {
  assertInt(n, 'consume');
  const a = acct(w, from);
  if (!a || (a.inv[key] ?? 0) < n) return false;
  addI(a.inv, key, -n);
  w.stats.items[key] = (w.stats.items[key] ?? 0) - n;
  w.stats.itemFlows[`-${why}`] = (w.stats.itemFlows[`-${why}`] ?? 0) + n;
  return true;
}
export function moveItems(w: World, from: AccountRef, to: AccountRef, key: ItemKey, n: number): boolean {
  assertInt(n, 'move');
  if (!n) return true;
  const a = acct(w, from), b = acct(w, to);
  if (!a || !b || (a.inv[key] ?? 0) < n) return false;
  if (b.cap !== Infinity && usedCap(b.inv) + weightOf(key) * n > b.cap) return false;
  addI(a.inv, key, -n);
  addI(b.inv, key, n);
  return true;
}
export function itemsToEscrow(w: World, from: AccountRef, key: ItemKey, n: number): boolean {
  assertInt(n, 'escrow');
  const a = acct(w, from);
  if (!a || (a.inv[key] ?? 0) < n) return false;
  addI(a.inv, key, -n);
  return true;
}
/** Release escrowed items. Ignores capacity (the goods were already owned). */
export function itemsFromEscrow(w: World, to: AccountRef, key: ItemKey, n: number) {
  assertInt(n, 'escrow');
  const b = acct(w, to);
  if (!b) throw new Error('escrow release to missing account');
  addI(b.inv, key, n);
}

// ---------- audit ----------
/** Sum every holding of every asset/item including escrows; compare with tracked supply. */
export function audit(w: World): { ok: boolean; problems: string[] } {
  const money: Record<string, number> = {};
  const items: Record<string, number> = {};
  const addM = (wal: Wallet) => { for (const [k, v] of Object.entries(wal)) money[k] = (money[k] ?? 0) + v; };
  const addIt = (inv: Inventory) => { for (const [k, v] of Object.entries(inv)) items[k] = (items[k] ?? 0) + v; };
  const problems: string[] = [];
  const scan = (wal: Wallet, inv: Inventory, who: string) => {
    for (const [k, v] of Object.entries(wal)) if (v < 0 || !Number.isInteger(v)) problems.push(`${who} ${k}=${v}`);
    for (const [k, v] of Object.entries(inv)) if (v < 0 || !Number.isInteger(v)) problems.push(`${who} item ${k}=${v}`);
    addM(wal); addIt(inv);
  };
  for (const c of Object.values(w.citizens)) scan(c.wallet, c.inv, `cit${c.id}`);
  for (const c of Object.values(w.companies)) scan(c.wallet, c.inv, `co${c.id}`);
  for (const n of w.nations) scan(n.wallet, n.inv, `nat${n.id}`);
  for (const h of w.households) scan(h.wallet, h.inv, `hh${h.nation}`);
  for (const h of Object.values(w.holdings)) scan(h.wallet, h.inv, `hold${h.id}`);
  for (const u of Object.values(w.units)) scan(u.wallet, u.inv, `unit${u.id}`);
  for (const s of w.govs) if (s) scan(s.wallet, s.inv, `reg${s.region}`);
  for (const s of Object.values(w.syndicates)) scan(s.wallet, s.inv, `synd${s.id}`);
  if (w.intl?.fund) scan(w.intl.fund.wallet, w.intl.fund.inv, 'org0');
  // escrows
  for (const l of Object.values(w.listings)) items[l.item] = (items[l.item] ?? 0) + l.qty;
  for (const o of Object.values(w.fx)) {
    const asset = o.side === 'sellCur' ? o.cur : GOLD;
    money[asset] = (money[asset] ?? 0) + o.amount;
  }
  for (const a of Object.values(w.auctions)) {
    if (a.status === 'open' && a.bid) money[GOLD] = (money[GOLD] ?? 0) + a.bid.amount;
    if (a.status === 'open' && a.item) items[a.item.key] = (items[a.item.key] ?? 0) + a.item.qty;
  }
  for (const ct of Object.values(w.contracts)) {
    if (ct.status !== 'open') continue;
    addM(ct.give.money);
    addIt(ct.give.items);
  }
  for (const p of Object.values(w.projects)) if (!p.done) addIt(p.mats);
  for (const t of Object.values(w.tournaments)) money[GOLD] = (money[GOLD] ?? 0) + (t.escrow ?? 0);
  for (const [k, v] of Object.entries(w.stats.supply)) {
    if ((money[k] ?? 0) !== v) problems.push(`money ${k}: held ${money[k] ?? 0} vs supply ${v}`);
  }
  for (const k of Object.keys(money)) if (!(k in w.stats.supply) && money[k] !== 0) problems.push(`money ${k} untracked ${money[k]}`);
  for (const [k, v] of Object.entries(w.stats.items)) {
    if ((items[k] ?? 0) !== v) problems.push(`item ${k}: held ${items[k] ?? 0} vs produced ${v}`);
  }
  // shares: ledger + open sell orders must equal total per holding
  for (const h of Object.values(w.holdings)) {
    let s = 0;
    for (const v of Object.values(h.shares)) s += v;
    for (const o of Object.values(w.shareOrders)) if (o.holding === h.id) s += o.qty;
    for (const ct of Object.values(w.contracts)) if (ct.status === 'open') for (const sh of ct.give.shares) if (sh.holding === h.id) s += sh.qty;
    if (s !== h.total) problems.push(`holding ${h.id} shares ${s} vs ${h.total}`);
  }
  return { ok: problems.length === 0, problems };
}
