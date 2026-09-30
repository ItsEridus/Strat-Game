import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { serialize, deserialize } from '../src/engine/save';
import { buyListing, listingsFor, list } from '../src/sim/market';
import { cref, coref, player } from '../src/sim/query';
import { applyJob, workShift, managerShift, createCompany, setOffer } from '../src/sim/company';
import { mint, produce } from '../src/engine/ledger';
import { GOLD, c as cur, g } from '../src/engine/money';

registerSystems();
const fresh = (seed = 11) => generateWorld(seed, 'Tester', 0, { citizensPerNation: 20 });

test('world generation is deterministic', () => {
  assert.equal(serialize(fresh(5)), serialize(fresh(5)));
});

test('one long advance equals many short ones', () => {
  const a = fresh(3), b = fresh(3);
  advance(a, 5 * DAY, false);
  for (let i = 0; i < 5; i++) advance(b, DAY, false);
  assert.equal(serialize(a), serialize(b));
});

test('save/load preserves state and future outcomes', () => {
  const a = fresh(4);
  advance(a, 2 * DAY, false);
  const b = deserialize(serialize(a));
  assert.equal(serialize(a), serialize(b));
  advance(a, 2 * DAY, false);
  advance(b, 2 * DAY, false);
  assert.equal(serialize(a), serialize(b));
});

test('money and goods stay fully accounted for over time', () => {
  const w = fresh(9);
  for (let d = 0; d < 10; d++) {
    advance(w, DAY, false);
    const r = audit(w);
    assert.ok(r.ok, r.problems.join('\n'));
  }
});

test('a market purchase transfers money and goods exactly once', () => {
  const w = fresh(2);
  const p = player(w);
  const n = w.nations[p.nation];
  const l = listingsFor(w, p.nation, 'food:1')[0];
  const seller = l.seller;
  const before = { money: p.wallet[n.cur], food: p.inv['food:1'] ?? 0, listed: l.qty };
  const r = buyListing(w, p.id, cref(p.id), l.id, 2);
  assert.ok(r.ok, r.msg);
  assert.equal(p.wallet[n.cur], before.money - l.price * 2);
  assert.equal(p.inv['food:1'], before.food + 2);
  assert.equal(w.listings[l.id]?.qty ?? 0, before.listed - 2);
  // buying more than listed fails and changes nothing
  const snapshot = serialize(w);
  const r2 = buyListing(w, p.id, cref(p.id), l.id, 100000);
  assert.equal(r2.ok, false);
  assert.equal(serialize(w), snapshot);
  assert.ok(seller);
  assert.ok(audit(w).ok);
});

test('listed goods are reserved and cannot be sold twice', () => {
  const w = fresh(2);
  const p = player(w);
  const have = p.inv['food:1'];
  assert.ok(list(w, p.id, cref(p.id), p.nation, 'food:1', have, cur(9)).ok);
  assert.equal(p.inv['food:1'] ?? 0, 0);
  assert.equal(list(w, p.id, cref(p.id), p.nation, 'food:1', 1, cur(9)).ok, false);
});

test('factories consume inputs and stop without inputs, funds or labour', () => {
  const w = fresh(6);
  const p = player(w);
  const nat = p.nation;
  const co = createCompany(w, cref(p.id), 'food', 2, p.loc);
  mint(w, coref(co.id), w.nations[nat].cur, cur(100), 'test');
  // no grain → manager shift refused
  mint(w, cref(p.id), GOLD, g(5), 'test');
  let r = managerShift(w, p, co.id);
  assert.equal(r.ok, false);
  assert.match(r.msg, /Out of Grain/);
  produce(w, coref(co.id), 'grain', 40, 'test');
  r = managerShift(w, p, co.id);
  assert.ok(r.ok, r.msg);
  const made = co.inv['food:2'];
  assert.ok(made > 0);
  assert.equal(co.inv.grain ?? 0, 40 - made * 4); // Q2 food uses 2×2 grain per unit
  // employee shift: no wage funds → refused
  const worker = Object.values(w.citizens).find((c) => !c.player && c.nation === nat && c.loc === p.loc)!;
  worker.job = null;
  setOffer(w, p.id, co.id, cur(8), 1, 0);
  assert.ok(applyJob(w, worker, co.id).ok);
  w.companies[co.id].wallet[w.nations[nat].cur] = 0;
  worker.energy = 100;
  const r2 = workShift(w, worker);
  assert.equal(r2.ok, false);
  assert.match(r2.msg, /cannot pay wages/);
});
