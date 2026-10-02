import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { player } from '../src/sim/query';
import { bmiOf, bodyMonth, bodyToll, exercise, exerciseCheck, fitnessOf, setDiet, weightRisk } from '../src/sim/body';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 4901) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('weight follows each country; obesity harms health; fitness helps', () => {
  const w = fresh();
  advance(w, DAY, false);
  const all = census(w).all.filter((c) => !c.player && ageOf(w, c) >= 18);
  const ob = (iso: string) => { const xs = all.filter((c) => w.nations[c.nation].iso === iso); return xs.filter((c) => bmiOf(w, c) >= 30).length / Math.max(1, xs.length); };
  assert.ok(ob('USA') > ob('JPN') + 0.2, `Americans heavier than the Japanese (${ob('USA')} vs ${ob('JPN')})`);
  const c = all[0];
  c.body = { bmi: 24, fitness: 60, diet: 'cook' };
  const fit = bodyToll(w, c);
  c.body = { bmi: 36, fitness: 15, diet: 'fast' };
  assert.ok(bodyToll(w, c) > fit + 10, 'an unhealthy body costs health');
  assert.ok(weightRisk(w, c) > 2);
});

test('the player: diet changes weight, exercise builds fitness', () => {
  const w = fresh(4902);
  advance(w, DAY, false);
  const p = player(w);
  assert.ok(setDiet(w, 'fast').ok);
  const b0 = bmiOf(w, p);
  for (let m = 0; m < 12; m++) bodyMonth(w);
  assert.ok(bmiOf(w, p) > b0, 'fast food fattens');
  const f0 = fitnessOf(w, p);
  p.energy = 100;
  assert.equal(exerciseCheck(w, p), null);
  assert.ok(exercise(w).ok);
  assert.ok(fitnessOf(w, p) > f0);
  assert.ok(exerciseCheck(w, p), 'once a day');
  assert.ok(audit(w as World).ok);
});
