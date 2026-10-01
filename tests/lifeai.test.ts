import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { lifeAIDaily } from '../src/sim/lifeai';
import { petsDaily } from '../src/sim/kinship';
import { oneYearOn, periodStart, periodSummary } from '../src/sim/periodReview';
import { dateAt } from '../src/engine/calendar';
import { advance } from '../src/sim/tick';

registerSystems();

test('everyone else takes up hobbies, keeps pets and goes back to study by the same rules', () => {
  const w = generateWorld(1601, 'Tester', 0, { citizensPerRegion: 3 });
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) { w.time += DAY; for (const c of census(w).all) c.energy = 100; lifeAIDaily(w); petsDaily(w); }
  const perDay = (Date.now() - t0) / 60;
  const all = census(w).all.filter((c) => !c.player);
  assert.ok(all.filter((c) => Object.keys(c.life?.hobbies ?? {}).length).length > all.length * 0.3, 'hobbies');
  assert.ok(w.life.pets.filter((p) => !p.gone && !w.citizens[p.owner].player).length > 0, 'pets');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.ok(perDay < 200, `life AI took ${perDay.toFixed(0)} ms a day`);
});

test('a year on keeps the date; a long advance is summarised from the real records', () => {
  const w = generateWorld(1602, 'Tester', 0, { citizensPerRegion: 2 });
  const t = w.time;
  const y = oneYearOn(t);
  assert.ok(y - t === 365 * DAY || y - t === 366 * DAY);
  assert.equal(dateAt(y).day, dateAt(t).day);
  const s = periodStart(w);
  advance(w, 7 * DAY, false);
  const r = periodSummary(w, s, 'a week from now');
  assert.ok(r.you.some((x) => x.includes('Savings')));
  assert.ok(r.world.length > 0);
});
