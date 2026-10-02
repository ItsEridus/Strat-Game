import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { player } from '../src/sim/query';
import { routineOf } from '../src/sim/lifecycle';
import { commuteMinutes, dayPlan, everydayMonth, everydayParts, monthlyFares, reachOf, setCommute, setSleep, transportOf } from '../src/sim/everyday';

registerSystems();
const fresh = (seed = 4701) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('commutes follow distance, mode and country; fares are paid monthly', () => {
  const w = fresh();
  advance(w, DAY, false);
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!;
  assert.ok(transportOf(w, by('JPN').id).quality > transportOf(w, by('USA').id).quality);
  const workers = census(w).all.filter((c) => !c.player && c.job != null && reachOf(w, c) !== 'none');
  const c = workers.find((x) => w.nations[x.nation].iso === 'JPN') ?? workers[0];
  const local = commuteMinutes(w, c, 'transit');
  assert.ok(local > 0 && local < 130);
  if (reachOf(w, c) === 'local') assert.ok(commuteMinutes(w, c, 'walk') <= 30);
  const t = workers.find((x) => monthlyFares(w, x) > 0);
  if (t) {
    const n = w.nations[t.nation];
    const before = t.wallet[n.cur] ?? 0;
    everydayMonth(w);
    assert.ok((t.wallet[n.cur] ?? 0) <= before, 'fares paid');
  }
  // A long commute is a strain.
  const far = workers.find((x) => commuteMinutes(w, x) >= 30);
  if (far) assert.ok(everydayParts(w, far).stress.some(([k]) => /commute/.test(k)));
  assert.ok(audit(w).ok);
});

test('sleep and the day planner', () => {
  const w = fresh(4702);
  advance(w, DAY, false);
  const p = player(w);
  assert.ok(setSleep(w, 23, 5).ok);
  assert.ok(everydayParts(w, p).stress.some(([k]) => /sleep/.test(k)), 'short nights are a strain');
  assert.ok(!setSleep(w, 23, 14).ok);
  setSleep(w, 23, 8);
  const r = routineOf(w);
  r.work = true; r.school = true; r.family = true; r.hobby = 'chess';
  const plan = dayPlan(w, p);
  assert.ok(plan.blocks.some((b) => b.kind === 'sleep'));
  if (p.job != null || p.post) assert.ok(plan.clashes.length > 0, 'work and classes clash');
  assert.ok(plan.clashes.some((c) => /Family time|Hobby/i.test(c)), 'family time and the hobby overlap');
  if (reachOf(w, p) !== 'none') assert.ok(setCommute(w, 'transit').ok);
  assert.ok(!setCommute(w, 'car').ok || p.car != null, 'a car is needed to drive');
});
