import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { cref, player } from '../src/sim/query';
import { ageOf } from '../src/sim/growth';
import { c as cur } from '../src/engine/money';
import { MODELS, buyCar, carPrice, carValue, carsMonth, crashRisk, runningCost, sellCar } from '../src/sim/cars';
import { hasCar, setCommute } from '../src/sim/everyday';

registerSystems();
const fresh = (seed = 4801) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('cars: prices by country, buying, running, selling, risk', () => {
  const w = fresh();
  advance(w, DAY, false);
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!;
  assert.ok(carPrice(w, by('BRA').id, MODELS[1]) > carPrice(w, by('IND').id, MODELS[1]) * 2, 'dear in Brazil, cheap in India');
  const p = player(w);
  const n = w.nations[p.nation];
  mint(w, cref(p.id), n.cur, carPrice(w, p.nation, MODELS[1]) + cur(100), 'test');
  const r = buyCar(w, 2);
  assert.ok(r.ok, r.msg);
  assert.ok(hasCar(w, p) && p.car!.tier === 2);
  const elec = runningCost(w, p, { ...p.car!, tier: 4 }), petrol = runningCost(w, p, p.car);
  assert.ok(elec < petrol, 'electric is cheaper to run');
  const v0 = carValue(w, p.car!);
  advance(w, 40 * DAY, false);
  assert.ok(carValue(w, p.car!) < v0, 'cars lose value');
  if (p.job != null || p.post) assert.ok(setCommute(w, 'car').ok);
  assert.ok(sellCar(w).ok);
  assert.ok(!hasCar(w, p));
  // Risk: Japan's roads are safer than South Africa's; young drivers are riskier.
  const drivers = census(w).all.filter((c) => !c.player && ageOf(w, c) >= 30 && ageOf(w, c) < 60);
  const j = drivers.find((c) => w.nations[c.nation].iso === 'JPN'), z = drivers.find((c) => w.nations[c.nation].iso === 'ZAF');
  if (j && z) { j.traits.risk = z.traits.risk = 0.5; assert.ok(crashRisk(w, z) > crashRisk(w, j) * 4); }
  assert.ok(audit(w).ok);
});

test('everyone drives as often as in their country, pays to run cars and crashes now and then', () => {
  const w = fresh(4802);
  advance(w, DAY, false);
  const adults = census(w).all.filter((c) => !c.player && ageOf(w, c) >= 18);
  const share = (iso: string) => { const xs = adults.filter((c) => w.nations[c.nation].iso === iso); return xs.filter((c) => hasCar(w, c)).length / Math.max(1, xs.length); };
  assert.ok(share('USA') > share('IND') + 0.4, `America drives, India mostly not (${share('USA')} vs ${share('IND')})`);
  for (let m = 0; m < 6; m++) carsMonth(w);
  assert.ok(audit(w).ok);
});
