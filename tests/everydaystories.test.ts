import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { cref, player } from '../src/sim/query';
import { c as cur } from '../src/engine/money';
import { chooseStory, triggerStory } from '../src/sim/story';
import { routineOf } from '../src/sim/lifecycle';
import { buyCar, carPrice, MODELS } from '../src/sim/cars';

registerSystems();
const fresh = (seed = 5101) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('stories of the everyday: a breakdown, the doctor, a builder', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  mint(w, cref(p.id), n.cur, carPrice(w, p.nation, MODELS[0]) + cur(3000), 'test');
  assert.ok(buyCar(w, 1).ok);
  const a = triggerStory(w, 'everyday.breakdown');
  assert.ok(a.ok, a.msg);
  assert.ok(chooseStory(w, (a as any).data.id, 'fix', 'main').ok);
  p.body = { bmi: 34, fitness: 20, diet: 'fast' };
  const b = triggerStory(w, 'everyday.checkup');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'exercise', 'main').ok);
  assert.ok(routineOf(w).exercise);
  p.dwelling = { kind: 'own', region: p.home, size: 'flat', since: w.time };
  const c = triggerStory(w, 'everyday.builder');
  if (c.ok) assert.ok(chooseStory(w, (c as any).data.id, 'no', 'main').ok);
  assert.ok(audit(w).ok);
});
