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
import { clinicCheck, conditionToll, healthDaily, leaveCheck, takeParentalLeave, tooIll, visitClinic } from '../src/sim/health';
import { shiftCheck } from '../src/sim/company';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 901) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });

test('people fall ill and recover over weeks; conditions weigh on health', () => {
  const w = fresh();
  for (let i = 0; i < 30; i++) { w.time += DAY; healthDaily(w); }
  const ill = census(w).all.filter((c) => c.conditions?.length);
  assert.ok(ill.length > 0, 'some illness in a month');
  assert.ok(ill.some((c) => conditionToll(w, c) > 0));
});

test('an injury keeps you off work until treated; a clinic visit treats it', () => {
  const w = fresh(902);
  const p = player(w);
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(500), 'test');
  p.conditions = [{ key: 'injury', since: w.time, until: w.time + 20 * DAY, sev: 2 }];
  assert.ok(tooIll(w, p));
  if (p.job != null) assert.match(shiftCheck(w, p) ?? '', /ill/);
  assert.equal(clinicCheck(w, p), null);
  const r = visitClinic(w);
  assert.ok(r.ok, r.msg);
  assert.equal(tooIll(w, p), false);
  assert.ok(p.conditions![0].until! < w.time + 20 * DAY, 'heals faster');
  assert.equal(leaveCheck(w, p), null);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.equal(deserialize(serialize(w)).citizens[p.id].conditions!.length, 1);
});

test('parental leave for parents of a baby, on the country terms', () => {
  const w = fresh(903);
  const p = player(w);
  p.family!.kids.push({ name: 'Baby Test', born: w.time });
  if (p.job == null && !p.post) { const co = Object.values(w.companies).find((c) => c.offer)!; p.job = co.id; co.workers.push(p.id); }
  const r = takeParentalLeave(w);
  assert.ok(r.ok, r.msg);
  assert.match(leaveCheck(w, p) ?? '', /parental/);
  advance(w, 2 * DAY, false);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
