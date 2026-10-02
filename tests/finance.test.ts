import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance, advanceTo } from '../src/sim/tick';
import { audit, mint, produce } from '../src/engine/ledger';
import { GOLD, g } from '../src/engine/money';
import { cref, player } from '../src/sim/query';
import { createAuction, onAuctionEnd, placeBid } from '../src/sim/auctions';
import { makeGear } from '../src/sim/gear';
import { acceptContract, closeContract, createContract, emptyCons } from '../src/sim/contracts';
import { createHolding, issueShares, buyShares, payDividend, listShares } from '../src/sim/holdings';
import { onMineEnd, startMining } from '../src/sim/mining';
import { travel } from '../src/sim/travel';
import { contribute, unlocked } from '../src/sim/academy';
import { serialize, deserialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 41) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('auctions escrow bids, refund the outbid, and deliver exactly once', () => {
  const w = fresh();
  const p = player(w);
  p.influence = 40;
  const bidders = Object.values(w.citizens).filter((c) => !c.player).slice(0, 2);
  for (const b of bidders) { mint(w, cref(b.id), GOLD, g(10), 'test'); }
  const gr = makeGear(w, 'combat', 2); gr.owner = cref(p.id);
  mint(w, cref(p.id), GOLD, g(1), 'test');
  const r = createAuction(w, p, { gear: gr.id }, g(1), 1);
  assert.ok(r.ok, r.msg);
  const a = Object.values(w.auctions)[0];
  const [b1, b2] = bidders;
  const g1 = b1.wallet[GOLD];
  assert.ok(placeBid(w, b1, a.id, g(1)).ok);
  assert.equal(b1.wallet[GOLD], g1 - g(1));
  assert.ok(placeBid(w, b2, a.id, g(2)).ok);
  assert.equal(b1.wallet[GOLD], g1, 'outbid bidder refunded immediately');
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
  advanceTo(w, a.end + 10, false);
  assert.equal(a.status, 'sold');
  assert.equal(w.gear[gr.id].owner?.id, b2.id);
  const before = serialize(w);
  onAuctionEnd(w, a.id); // duplicate processing does nothing
  assert.equal(serialize(w), before);
  assert.ok(audit(w).ok);
});

test('contracts escrow, release on cancel, and settle both sides once', () => {
  const w = fresh(42);
  const p = player(w);
  const other = Object.values(w.citizens).find((c) => !c.player && c.nation === p.nation)!;
  const cur = w.nations[p.nation].cur;
  mint(w, cref(p.id), GOLD, g(5), 'test');
  produce(w, cref(other.id), 'iron', 50, 'test');
  const give = emptyCons(); give.money[cur] = 2000;
  const want = emptyCons(); want.items.iron = 20;
  const cash0 = p.wallet[cur];
  const r = createContract(w, p, other.id, give, want, 'test');
  assert.ok(r.ok, r.msg);
  assert.equal(p.wallet[cur], cash0 - 2000, 'escrowed');
  closeContract(w, p.id, (r as any).data.id, "cancelled");
  assert.equal(p.wallet[cur], cash0, 'returned');
  const r2 = createContract(w, p, other.id, give, want, 'test');
  const ironBefore = p.inv.iron ?? 0;
  const id2 = (r2 as any).data.id;
  assert.ok(acceptContract(w, other.id, id2).ok);
  assert.equal(p.inv.iron, ironBefore + 20);
  assert.equal(acceptContract(w, other.id, id2).ok, false, "cannot accept twice");
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
});

test('holdings dilute on issue, pay pro rata dividends, and keep the share ledger balanced', () => {
  const w = fresh(43);
  const p = player(w);
  const inv = Object.values(w.citizens).find((c) => !c.player)!;
  const h = createHolding(w, p, 'Test Group');
  assert.ok(issueShares(w, p.id, h.id, 100, g(0.5)).ok);
  assert.equal(h.total, 200);
  mint(w, cref(inv.id), GOLD, g(100), 'test');
  const order = Object.values(w.shareOrders).find((o) => o.holding === h.id && o.seller.k === 'hold')!;
  assert.ok(buyShares(w, inv.id, order.id, 50).ok);
  assert.equal(h.wallet[GOLD], g(25), 'issue proceeds to the holding');
  assert.ok(listShares(w, p, h.id, 10, g(1)).ok);
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
  const pg = p.wallet[GOLD] ?? 0, ig = inv.wallet[GOLD];
  assert.ok(payDividend(w, p.id, h.id, GOLD, g(20)).ok);
  // player holds 100 of 200 (incl. 10 listed), investor 50, 50 unsold new shares get nothing
  assert.equal((p.wallet[GOLD] ?? 0) - pg, g(10));
  assert.equal(inv.wallet[GOLD] - ig, g(5));
  assert.ok(audit(w).ok);
});

test('mining blocks travel and pays exactly once, surviving save/load', () => {
  const w = fresh(44);
  const p = player(w);
  p.mineSite = p.loc;
  assert.ok(startMining(w, p, 1).ok);
  const dest = w.regions[p.loc].links[0];
  assert.equal(travel(w, p, dest, 'walk').ok, false);
  const w2 = deserialize(serialize(w));
  const end = p.mining!.end;
  const g0 = p.wallet[GOLD] ?? 0;
  advanceTo(w, end + 10, false);
  advanceTo(w2, end + 10, false);
  assert.ok((p.wallet[GOLD] ?? 0) > g0);
  assert.equal(serialize(w), serialize(w2), 'loaded save continues identically');
  const after = p.wallet[GOLD];
  onMineEnd(w, p.id, end);
  assert.equal(p.wallet[GOLD], after, 'no double reward');
});

test('academy studies unlock at 75%', () => {
  const w = fresh(45);
  const p = player(w);
  let i = 0;
  while (!unlocked(p, 'gymrat') && i++ < 30) { p.energy = 100; contribute(w, p, 'gymrat', 'energy'); }
  assert.ok(unlocked(p, 'gymrat'));
  advance(w, 60, false);
});
