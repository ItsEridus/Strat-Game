import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { c as cur } from '../src/engine/money';
import { census } from '../src/sim/census';
import { cref, player } from '../src/sim/query';
import { buyCheck, buyHome, housingCost, priceOf, rentHome, rentOf, sellHome } from '../src/sim/housing';
import { deserialize, serialize } from '../src/engine/save';
import { die, heirOf } from '../src/sim/population';

registerSystems();
const fresh = (seed = 701) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });

test('everyone lives somewhere: owners, tenants and grown children at home, by country', () => {
  const w = fresh();
  const all = census(w).all;
  assert.ok(all.every((c) => c.dwelling && c.dwelling.region === c.home));
  const own = all.filter((c) => c.dwelling!.kind === 'own').length / all.length;
  assert.ok(own > 0.3 && own < 0.8, `ownership ${own}`);
  const r = w.regions[0];
  assert.ok(rentOf(w, r.id, 'room') < rentOf(w, r.id, 'flat') && rentOf(w, r.id, 'flat') < rentOf(w, r.id, 'house'));
  assert.ok(priceOf(w, r.id, 'flat') > rentOf(w, r.id, 'flat') * 300);
});

test('rent, buy and sell: money moves through the ledger; rent is part of living costs', () => {
  const w = fresh(702);
  const p = player(w);
  const code = w.nations[p.nation].cur;
  const other = w.regions.find((r) => r.owner === p.nation && r.id !== p.home)!;
  p.loc = other.id;
  mint(w, cref(p.id), code, cur(200), 'test');
  const r = rentHome(w, 'flat');
  assert.ok(r.ok, r.msg);
  assert.equal(p.home, other.id, 'moved');
  assert.equal(p.dwelling!.kind, 'rent');
  advance(w, 2 * DAY, false);
  assert.ok(w.ledger.some((e) => e.text === 'Rent'));
  assert.match(buyCheck(w, p, 'flat') ?? '', /need/);
  mint(w, cref(p.id), code, Math.round(priceOf(w, other.id, 'flat') * 1.1), 'test');
  const b = buyHome(w, 'flat');
  assert.ok(b.ok, b.msg);
  assert.ok(housingCost(w, p.dwelling) < rentOf(w, other.id, 'flat'), 'owning costs less a day than renting');
  const before = p.wallet[code]!;
  assert.ok(sellHome(w).ok);
  assert.ok(p.wallet[code]! > before);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.equal(deserialize(serialize(w)).citizens[p.id].dwelling!.kind, 'rent');
});

test('an owner dies: the home passes to the heir, or is sold into the estate', () => {
  const w = fresh(703);
  const npcs = census(w).all.filter((c) => !c.player && !c.gone);
  const owner = npcs.find((c) => c.dwelling?.kind === 'own' && c.family?.status === 'married' && c.family.partner != null && w.citizens[c.family.partner].home === c.home)!;
  const spouse = w.citizens[owner.family!.partner!];
  spouse.dwelling = { kind: 'rent', region: spouse.home, size: 'flat', since: w.time };
  die(w, owner, 'test');
  assert.equal(spouse.dwelling!.kind, 'own', 'the widow(er) keeps the home');
  const lone = census(w).all.find((c) => !c.player && c.dwelling?.kind === 'own' && !c.family?.partner && !(c.family?.children.length))!;
  const code = w.nations[lone.nation].cur;
  const heir = heirOf(w, lone);
  const before = heir ? heir.wallet[code] ?? 0 : 0;
  die(w, lone, 'test');
  if (heir) assert.ok((heir.wallet[code] ?? 0) > before, 'the heir inherits the sale');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
