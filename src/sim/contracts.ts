// Contracts: escrowed two-sided offers covering money, items, companies,
// newspapers, gear and shares. The sender's side is escrowed at creation;
// acceptance moves both sides in one operation; cancel/reject/expiry releases
// the escrow. NPC recipients decide by value and relationship.
import type { Citizen, Consideration, Contract, Id, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { itemName } from '../data/items';
import { fail, ok, type Result } from '../engine/result';
import { acct, burn, escrowIn, escrowOut, freeCap, itemsFromEscrow, itemsToEscrow, moveItems, pay, usedCap } from '../engine/ledger';
import { GOLD, fmtAmt, g } from '../engine/money';
import { DAY } from '../engine/clock';
import { nid, notify, record, sendMsg } from '../engine/events';
import { cref, player } from './query';
import { companyValue, transferCompany } from './companyMarket';
import { isEquipped } from './gear';
import { refPrice } from './market';
import { refValue, weightOf } from '../data/items';
import { lastSharePrice, valuation } from './holdings';
import { bump } from './progress';

export const emptyCons = (): Consideration => ({ money: {}, items: {}, companies: [], papers: [], gear: [], shares: [] });
export const isEmpty = (c: Consideration) => !Object.keys(c.money).length && !Object.keys(c.items).length && !c.companies.length && !c.papers.length && !c.gear.length && !c.shares.length;

/** Gold-equivalent value (minor units) of a consideration, from the recipient's viewpoint. */
export function valueOf(w: World, cons: Consideration, nation: Id): number {
  let v = 0;
  for (const [a, amt] of Object.entries(cons.money)) {
    if (a === GOLD) v += amt;
    else { const n = w.nations.find((x) => x.cur === a); v += Math.round((amt * 1000) / (n?.fxAnchor || 10000)); }
  }
  const rate = w.nations[nation]?.fxAnchor || 10000;
  for (const [k, q] of Object.entries(cons.items)) v += Math.round(((refPrice(w, nation, k) ?? refValue(k)) * q * 1000) / rate);
  for (const id of cons.companies) if (w.companies[id]) v += companyValue(w, w.companies[id]);
  for (const id of cons.gear) if (w.gear[id]) v += g([0.3, 1, 3, 8, 20][w.gear[id].rarity]);
  for (const s of cons.shares) { const h = w.holdings[s.holding]; if (h) v += (lastSharePrice(w, h.id) ?? Math.round(valuation(w, h) / h.total)) * s.qty; }
  v += cons.papers.length * g(3);
  return v;
}

export function contractFee(w: World, from: Citizen, to: Citizen, give: Consideration, want: Consideration): number {
  if (isEmpty(want) && to.level < B.contracts.giftExemptLevel) return 0; // unconditional gift to a newcomer (DOC exemption)
  return g(B.contracts.feeFlat) + Math.round(valueOf(w, give, to.nation) * B.contracts.feePct);
}

/** Can `c` deliver consideration `x` right now? */
export function deliverable(w: World, c: Citizen, x: Consideration): string | null {
  for (const [a, amt] of Object.entries(x.money)) if (!Number.isInteger(amt) || amt <= 0 || (c.wallet[a] ?? 0) < amt) return `${c.name} lacks ${fmtAmt(a, amt)}.`;
  for (const [k, q] of Object.entries(x.items)) if (!Number.isInteger(q) || q <= 0 || (c.inv[k] ?? 0) < q) return `${c.name} lacks ${q} ${itemName(k)}.`;
  for (const id of x.companies) { const co = w.companies[id]; if (!co || co.owner.k !== 'cit' || co.owner.id !== c.id) return `${c.name} does not own that company.`; if (co.locked != null && co.locked !== -1) return `${co.name} is already in escrow.`; }
  for (const id of x.papers) { const p = w.papers[id]; if (!p || p.owner.k !== 'cit' || p.owner.id !== c.id) return `${c.name} does not own that newspaper.`; }
  for (const id of x.gear) { const gr = w.gear[id]; if (!gr || gr.owner?.k !== 'cit' || gr.owner.id !== c.id) return `${c.name} does not own that gear.`; if (isEquipped(c, id)) return `Unequip ${gr.name} first.`; }
  for (const s of x.shares) { const h = w.holdings[s.holding]; if (!h || (h.shares[c.id] ?? 0) < s.qty || s.qty < 1) return `${c.name} lacks ${s.qty} unlisted shares.`; }
  return null;
}

export function createCheck(w: World, from: Citizen, toId: Id, give: Consideration, want: Consideration): string | null {
  const to = w.citizens[toId];
  if (!to || to.id === from.id) return 'Choose another citizen.';
  if (isEmpty(give) && isEmpty(want)) return 'The contract is empty.';
  if (from.mining) return 'Contracts are blocked while mining.';
  const d = deliverable(w, from, give);
  if (d) return d;
  const fee = contractFee(w, from, to, give, want);
  if ((from.wallet[GOLD] ?? 0) - (give.money[GOLD] ?? 0) < fee) return `The contract fee is ${fmtAmt(GOLD, fee)}.`;
  return null;
}

export function createContract(w: World, from: Citizen, toId: Id, give: Consideration, want: Consideration, note = ''): Result {
  const why = createCheck(w, from, toId, give, want);
  if (why) return fail(why);
  const to = w.citizens[toId];
  const fee = contractFee(w, from, to, give, want);
  if (fee) burn(w, cref(from.id), GOLD, fee, 'Contract fee');
  const ct: Contract = { id: nid(w), from: from.id, to: toId, give, want, fee, status: 'open', created: w.time, expires: w.time + B.contracts.expiryDays * DAY, note: note.slice(0, 200) };
  // Escrow the sender's side.
  for (const [a, amt] of Object.entries(give.money)) escrowIn(w, cref(from.id), a, amt, 'Contract escrow');
  for (const [k, q] of Object.entries(give.items)) itemsToEscrow(w, cref(from.id), k, q);
  for (const id of give.companies) w.companies[id].locked = ct.id;
  for (const id of give.papers) w.papers[id].locked = ct.id;
  for (const id of give.gear) w.gear[id].owner = null;
  for (const s of give.shares) { const h = w.holdings[s.holding]; h.shares[from.id] -= s.qty; if (!h.shares[from.id]) delete h.shares[from.id]; }
  w.contracts[ct.id] = ct;
  if (toId === w.playerId) {
    sendMsg(w, { from: from.id, subject: `Contract offer from ${from.name}`, body: describeContract(w, ct), kind: 'contract', options: [{ id: 'accept', label: 'Accept' }, { id: 'reject', label: 'Reject' }], payload: { handler: 'contract', id: ct.id } });
  }
  if (from.player) bump(w, 'contract');
  return ok(`Contract sent to ${to.name}${fee ? ` (fee ${fmtAmt(GOLD, fee)})` : ' (fee-exempt gift)'}.`, { id: ct.id });
}

function releaseEscrow(w: World, ct: Contract, to: Id) {
  for (const [a, amt] of Object.entries(ct.give.money)) escrowOut(w, cref(to), a, amt, to === ct.from ? 'Contract escrow returned' : 'Contract received');
  for (const [k, q] of Object.entries(ct.give.items)) itemsFromEscrow(w, cref(to), k, q);
  for (const id of ct.give.companies) { const co = w.companies[id]; if (co) { co.locked = undefined; if (to !== ct.from) transferCompany(w, co, cref(to)); } }
  for (const id of ct.give.papers) { const p = w.papers[id]; if (p) { p.locked = undefined; p.owner = cref(to); } }
  for (const id of ct.give.gear) if (w.gear[id]) w.gear[id].owner = cref(to);
  for (const s of ct.give.shares) { const h = w.holdings[s.holding]; if (h) h.shares[to] = (h.shares[to] ?? 0) + s.qty; }
}

export function acceptCheck(w: World, ct: Contract | undefined, actor: Id): string | null {
  if (!ct || ct.status !== 'open') return 'Contract is no longer open.';
  if (ct.to !== actor) return 'Only the recipient can accept.';
  const to = w.citizens[ct.to];
  const d = deliverable(w, to, ct.want);
  if (d) return d;
  let incoming = 0;
  for (const [k, q] of Object.entries(ct.give.items)) incoming += weightOf(k) * q;
  if (incoming > freeCap(w, cref(to.id))) return 'Not enough storage for the incoming items.';
  return null;
}

/** Accept: both sides move in one operation. */
export function acceptContract(w: World, actor: Id, id: Id): Result {
  const ct = w.contracts[id];
  const why = acceptCheck(w, ct, actor);
  if (why) return fail(why);
  const from = w.citizens[ct.from], to = w.citizens[ct.to];
  // recipient's side → sender
  for (const [a, amt] of Object.entries(ct.want.money)) pay(w, cref(to.id), cref(from.id), a, amt, `Contract with ${from.name}`);
  for (const [k, q] of Object.entries(ct.want.items)) if (!moveItems(w, cref(to.id), cref(from.id), k, q)) { itemsToEscrow(w, cref(to.id), k, q); itemsFromEscrow(w, cref(from.id), k, q); }
  for (const cid of ct.want.companies) transferCompany(w, w.companies[cid], cref(from.id));
  for (const pid of ct.want.papers) w.papers[pid].owner = cref(from.id);
  for (const gid of ct.want.gear) w.gear[gid].owner = cref(from.id);
  for (const s of ct.want.shares) { const h = w.holdings[s.holding]; h.shares[to.id] -= s.qty; if (!h.shares[to.id]) delete h.shares[to.id]; h.shares[from.id] = (h.shares[from.id] ?? 0) + s.qty; }
  // escrowed sender's side → recipient
  releaseEscrow(w, ct, to.id);
  ct.status = 'accepted';
  ct.resolved = w.time;
  from.rel[to.id] = (from.rel[to.id] ?? 0) + 2;
  to.rel[from.id] = (to.rel[from.id] ?? 0) + 2;
  record(w, 'contract', `🤝 Contract between ${from.name} and ${to.name} completed.`, { cit: from.id, player: from.player || to.player });
  if (from.player && !to.player) notify(w, 'market', `🤝 ${to.name} accepted your contract.`, { link: 'contracts' });
  void usedCap; void acct;
  return ok('Contract completed: both sides transferred.');
}

export function closeContract(w: World, actor: Id, id: Id, how: 'rejected' | 'cancelled' | 'expired'): Result {
  const ct = w.contracts[id];
  if (!ct || ct.status !== 'open') return fail('Contract is no longer open.');
  if (how === 'rejected' && actor !== ct.to) return fail('Only the recipient can reject.');
  if (how === 'cancelled' && actor !== ct.from) return fail('Only the sender can cancel.');
  releaseEscrow(w, ct, ct.from);
  ct.status = how;
  ct.resolved = w.time;
  if (ct.from === w.playerId && how !== 'cancelled') notify(w, 'market', `Contract to ${w.citizens[ct.to]?.name} was ${how}; your escrow was returned.`, { link: 'contracts' });
  return ok(`Contract ${how}; escrow released.`);
}

export function describeContract(w: World, ct: Contract): string {
  const side = (x: Consideration) => [
    ...Object.entries(x.money).map(([a, v]) => fmtAmt(a, v)),
    ...Object.entries(x.items).map(([k, q]) => `${q}× ${itemName(k)}`),
    ...x.companies.map((id) => `company ${w.companies[id]?.name}`),
    ...x.papers.map((id) => `newspaper ${w.papers[id]?.name}`),
    ...x.gear.map((id) => w.gear[id]?.name ?? 'gear'),
    ...x.shares.map((s) => `${s.qty} ${w.holdings[s.holding]?.name} shares`),
  ].join(', ') || 'nothing';
  return `${w.citizens[ct.from]?.name} gives: ${side(ct.give)}.\nIn return for: ${side(ct.want)}.${ct.note ? `\nNote: ${ct.note}` : ''}`;
}

/** Hourly: NPC recipients decide; expired contracts release escrow. */
export function contractsHourly(w: World) {
  for (const ct of Object.values(w.contracts).sort((a, b) => a.id - b.id)) {
    if (ct.status !== 'open') continue;
    if (w.time >= ct.expires) { closeContract(w, ct.from, ct.id, 'expired'); continue; }
    const to = w.citizens[ct.to];
    if (!to || to.player || w.time - ct.created < 60) continue;
    const gain = valueOf(w, ct.give, to.nation) - valueOf(w, ct.want, to.nation);
    const goodwill = (to.rel[ct.from] ?? 0) * g(0.02);
    const canDeliver = !deliverable(w, to, ct.want);
    if (canDeliver && gain + goodwill >= -g(0.05)) acceptContract(w, to.id, ct.id);
    else {
      closeContract(w, to.id, ct.id, 'rejected');
      if (ct.from === w.playerId) sendMsg(w, { from: to.id, subject: `${to.name} declined your contract`, kind: 'contract', body: canDeliver ? `The terms don't work for me: by my reckoning I'd be giving about ${fmtAmt(GOLD, -gain)} more than I get. Sweeten it and I'll look again.` : `I can't deliver what you asked for right now.` });
    }
  }
}

/** Daily: NPC merchants propose trades to the player (buying surplus goods, selling gear). */
export function npcOffers(w: World) {
  const p = player(w);
  if ((Math.floor(w.time / DAY) + p.id) % 4 !== 0) return;
  const merchants = census(w).all.filter((c) => !c.player && (c.persona === 'merchant' || c.persona === 'investor') && c.nation === p.nation);
  const m = merchants[Math.floor(w.time / DAY) % Math.max(1, merchants.length)];
  if (!m) return;
  const surplus = Object.entries(p.inv).filter(([k, q]) => !k.startsWith('sp:') && q >= 30).sort((a, b) => b[1] - a[1])[0];
  const n = w.nations[m.nation];
  if (surplus) {
    const [k, q] = surplus;
    const qty = Math.floor(q / 2);
    const price = Math.round((refPrice(w, n.id, k) ?? refValue(k)) * qty * 0.95);
    if ((m.wallet[n.cur] ?? 0) < price) return;
    const give = emptyCons(); give.money[n.cur] = price;
    const want = emptyCons(); want.items[k] = qty;
    createContract(w, m, p.id, give, want, `I'll take ${qty} ${itemName(k)} off your hands at a fair price.`);
    return;
  }
  const gear = Object.values(w.gear).find((x) => x.owner?.k === 'cit' && x.owner.id === m.id && !isEquipped(m, x.id));
  if (gear && (p.wallet[GOLD] ?? 0) > g([0.3, 1, 3, 8, 20][gear.rarity])) {
    const give = emptyCons(); give.gear.push(gear.id);
    const want = emptyCons(); want.money[GOLD] = g([0.3, 1, 3, 8, 20][gear.rarity] * 1.05);
    createContract(w, m, p.id, give, want, `A fine ${gear.name}, yours for a fair price.`);
  }
}
