import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { serialize, deserialize } from '../src/engine/save';
import { flameBonus, letGo, lostTo, note, partedWays, takenOn, tieBias, tieWith, tiesMonth } from '../src/sim/ties';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 4001) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const adults = (w: World) => census(w).all.filter((c) => !c.gone && !c.player && ageOf(w, c) >= 20);

test('people remember each other: exes, bosses, employers, rivals; memories pull feelings and fade', () => {
  const w = fresh();
  advance(w, DAY, false);
  const [a, b, boss, cand, x, y] = adults(w);
  // A bitter divorce, and a fond parting.
  a.rel[b.id] = -30; b.rel[a.id] = 40;
  partedWays(w, a, b, true);
  assert.equal(tieWith(a, b.id)?.kind, 'grudge');
  assert.equal(tieWith(b, a.id)?.kind, 'flame');
  assert.ok(flameBonus(b, a) > 0);
  // Work.
  letGo(w, x, boss.id, 'Acme', true);
  assert.equal(tieWith(x, boss.id)?.kind, 'grudge');
  takenOn(w, y, boss.id, 'Acme', 200);
  assert.equal(tieWith(y, boss.id)?.kind, 'gratitude');
  takenOn(w, cand, boss.id, 'Acme', 5);
  assert.equal(tieWith(cand, boss.id), undefined, 'a short search leaves no mark');
  // Politics.
  lostTo(w, cand, boss, 'presidential');
  assert.equal(tieWith(cand, boss.id)?.kind, 'rival');
  assert.ok(tieBias(x, boss.id) < 0 && tieBias(y, boss.id) > 0, 'grudges and gratitude sway votes');
  // A grudge keeps a relationship cold; gratitude warms it.
  x.rel[boss.id] = 30; y.rel[boss.id] = 0;
  for (let m = 0; m < 12; m++) tiesMonth(w);
  assert.ok(x.rel[boss.id] < 15, `grudge cools the relationship (${x.rel[boss.id]})`);
  assert.ok(y.rel[boss.id] > 5, `gratitude warms it (${y.rel[boss.id]})`);
  const s0 = tieWith(x, boss.id)!.s;
  for (let m = 0; m < 24; m++) tiesMonth(w);
  assert.ok((tieWith(x, boss.id)?.s ?? 0) < s0, 'grudges fade');
  // Opposite feelings replace each other; at most six memories.
  note(w, x, boss, 'gratitude', 40, 'a kindness');
  assert.equal(tieWith(x, boss.id, 'grudge'), undefined);
  for (const o of adults(w).slice(10, 20)) note(w, a, o, 'gratitude', 30, 'help');
  assert.ok((a.ties?.length ?? 0) <= 6);
  const w2 = deserialize(serialize(w));
  assert.ok(w2.citizens[a.id].ties?.length);
  assert.ok(audit(w).ok);
});

test('veterans of the same war find comrades', () => {
  const w = fresh(4002);
  advance(w, DAY, false);
  const n = adults(w)[0].nation;
  const vets = adults(w).filter((c) => c.nation === n).slice(0, 5);
  for (const v of vets) v.flags.veteranOf = 777;
  tiesMonth(w);
  assert.ok(vets.every((v) => v.ties?.some((t) => t.kind === 'comrade')));
});
