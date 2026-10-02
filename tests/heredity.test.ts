import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { inherit, takesAfter } from '../src/sim/heredity';
import { natureOf } from '../src/sim/nature';
import { religionOf } from '../src/sim/faith';

registerSystems();

test('children take after their parents: temperament (regressed to the mean), talents, faith', () => {
  const w = generateWorld(5801, 'T', 0, { citizensPerRegion: 2 });
  advance(w, DAY, false);
  const all = census(w).all.filter((c) => !c.player && ageOf(w, c) >= 18);
  const [ma, pa] = all;
  ma.traits.ambition = pa.traits.ambition = 0.95;
  ma.religion = pa.religion = 'buddhist';
  const kids = all.slice(2, 82);
  for (const k of kids) { k.family!.parents = [ma.id, pa.id]; inherit(w, k, [ma, pa]); }
  const avg = kids.reduce((t, k) => t + k.traits.ambition, 0) / kids.length;
  assert.ok(avg > 0.6 && avg < 0.85, `ambitious parents, ambitious children, but less so (${avg.toFixed(2)})`);
  const sameTalent = kids.filter((k) => natureOf(k).talent === natureOf(ma).talent || natureOf(k).talent === natureOf(pa).talent).length / kids.length;
  assert.ok(sameTalent > 0.35, `talents run in families (${sameTalent})`);
  assert.ok(kids.filter((k) => religionOf(w, k) === 'buddhist').length / kids.length > 0.7, 'the family faith');
  assert.ok(kids.every((k) => natureOf(k).talent !== natureOf(k).weakness));
  assert.ok([ma.id, pa.id].includes(takesAfter(w, kids[0])!.id));
});
