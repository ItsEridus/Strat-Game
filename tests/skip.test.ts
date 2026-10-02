import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { statisticalSkip } from '../src/sim/statYear';
import { capsOf } from '../src/sim/strategic';
import { player } from '../src/sim/query';
import { ageOf } from '../src/sim/growth';

registerSystems();

test('skipping a year statistically: fast, the books balance, the world moves on and keeps running', () => {
  const w = generateWorld(701, 'Tester', 0, { citizensPerRegion: 2 });
  advance(w, 2 * DAY, false);
  const p = player(w);
  const age = ageOf(w, p);
  const before = { prod: capsOf(w, w.nations[0]).productivity, months: capsOf(w, w.nations[0]).hist.length };
  const t0 = Date.now();
  statisticalSkip(w, w.time + 365 * DAY);
  assert.ok(Date.now() - t0 < 30_000, 'a year in seconds');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.ok(ageOf(w, p) >= age + 1 - 0.01 || ageOf(w, p) === age + 1, 'the player is a year older');
  assert.ok(capsOf(w, w.nations[0]).hist.length >= before.months + 11, 'twelve monthly strategic turns');
  const adults = Object.values(w.citizens).filter((c) => !c.gone && !c.edu?.enrolled);
  assert.ok(adults.filter((c) => c.job != null || c.post).length / adults.length > 0.6, 'most people still have work');
  assert.ok(w.nations.every((n) => n.exile || (n.wallet[n.cur] ?? 0) > 0), 'treasuries solvent');
  advance(w, 2 * DAY, false);
  assert.ok(audit(w).ok, 'the hour-by-hour simulation resumes');
});
