import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { cref, player } from '../src/sim/query';
import { c as cur } from '../src/engine/money';
import { billsOf, buyAppliance, choresOf, furnish, homeMonth, homeUplift, improveCost, improveHome } from '../src/sim/homeLife';

registerSystems();
const fresh = (seed = 5001) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('bills, improvements, appliances and housework', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  p.dwelling = { kind: 'own', region: p.home, size: 'house', since: w.time };
  mint(w, cref(p.id), n.cur, improveCost(w, p, 'solar') + cur(5000), 'test');
  const b0 = billsOf(w, p);
  assert.ok(b0 > 0);
  assert.ok(improveHome(w, 'solar').ok);
  assert.ok(billsOf(w, p) < b0, 'solar panels cut the bills');
  assert.ok(homeUplift(p) > 1, 'and add value');
  assert.ok(!improveHome(w, 'solar').ok, 'once');
  const c0 = choresOf(w, p).total;
  assert.ok(buyAppliance(w, 'dishwasher').ok);
  assert.ok(choresOf(w, p).total < c0, 'a dishwasher saves time');
  assert.ok(furnish(w, 2).ok);
  // Couples: women do most of the housework in most countries.
  const couple = census(w).all.find((c) => !c.player && c.family?.status === 'married' && c.family.partner != null && w.nations[c.nation].iso === 'JPN');
  if (couple) { const a = choresOf(w, couple), b = choresOf(w, w.citizens[couple.family!.partner!]); assert.ok(Math.abs(a.share - b.share) > 0.3 || a.share === b.share); }
  const bill = census(w).all.find((c) => !c.player && billsOf(w, c) > 0)!;
  const before = bill.wallet[w.nations[bill.nation].cur] ?? 0;
  homeMonth(w);
  assert.ok((bill.wallet[w.nations[bill.nation].cur] ?? 0) <= before, 'bills paid');
  assert.ok(audit(w).ok);
});
