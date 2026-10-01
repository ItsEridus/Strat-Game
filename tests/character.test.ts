import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { player } from '../src/sim/query';
import { ageing, blendLook, lookOf, sexOf } from '../src/sim/looks';
import { census } from '../src/sim/census';
import { bornYearsAgo } from '../src/sim/growth';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();

test('everyone has a stable look; presentation follows the first name; age shows', () => {
  const w = generateWorld(1701, 'Tester', 0, { citizensPerRegion: 3 });
  const all = census(w).all;
  const c = all[5];
  assert.deepEqual(lookOf(w, c), lookOf(w, c), 'stable');
  const looks = new Set(all.map((x) => JSON.stringify(lookOf(w, x))));
  assert.ok(looks.size > all.length * 0.9, `distinct faces ${looks.size}/${all.length}`);
  const mary = all.find((x) => x.name.startsWith('Mary '));
  if (mary) assert.equal(sexOf(w, mary), 'f');
  const old = all[7];
  old.born = bornYearsAgo(w, 80, 1);
  assert.ok(ageing(w, old).grey > 0.5 && ageing(w, old).lines >= 2);
});

test('a designed character: look, birthplace and politics become real starting conditions', () => {
  const look = { sex: 'f' as const, pronouns: 'they' as const, skin: 3, face: 1, hair: 5, hairColor: 5, eyes: 3, brows: 1, nose: 2, beard: 0, glasses: true, freckles: true, mark: 'tattoo' as const, clothes: 2 };
  const w = generateWorld(1702, 'Ada Designed', 6, { citizensPerRegion: 3, character: { look, birthplace: null, ideology: 'socialism' } });
  const p = player(w);
  assert.equal(p.ideo, 'socialism');
  assert.deepEqual(lookOf(w, p), look);
  const region = w.regions.find((r) => r.owner === 6 && r.id !== p.home)!;
  const w2 = generateWorld(1703, 'Born There', 6, { citizensPerRegion: 3, character: { look, birthplace: region.id, ideology: null } });
  assert.equal(player(w2).home, region.id);
  const w3 = deserialize(serialize(w));
  assert.deepEqual(w3.citizens[p.id].look, look);
});

test('children blend their parents', () => {
  const w = generateWorld(1704, 'Tester', 0, { citizensPerRegion: 3 });
  const [a, b, kid] = census(w).all.filter((c) => !c.player);
  a.look = { ...lookOf(w, a), skin: 0 }; b.look = { ...lookOf(w, b), skin: 6 };
  const l = blendLook(w, kid, a, b);
  assert.ok(l.skin >= 2 && l.skin <= 4);
});
