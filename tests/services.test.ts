import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { player } from '../src/sim/query';
import { maxGrade, postCheck, serviceShift, servicesDaily, takePost } from '../src/sim/services';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 601) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });

test('public services start staffed by qualified people, and staffing is measured', () => {
  const w = fresh();
  const staff = census(w).all.filter((c) => c.post);
  assert.ok(staff.length > 20, `staff ${staff.length}`);
  assert.ok(staff.every((c) => maxGrade(c, c.post!.kind) >= c.post!.grade), 'nobody above their qualifications');
  assert.ok(staff.every((c) => c.job == null), 'one job at a time');
  assert.ok(w.regions.some((r) => (r.staff?.school ?? 0) > 0));
});

test('the player takes a post, is paid by the state, and builds a work history', () => {
  const w = fresh(602);
  const p = player(w);
  p.edu = { level: 'bachelor', field: 'teaching' };
  for (const c of census(w).all) if (c.post?.kind === 'teacher' && c.post.region === p.home) delete c.post; // open a vacancy
  assert.equal(postCheck(w, p, 'doctor') !== null, true, 'not a doctor');
  const r = takePost(w, 'teacher');
  assert.ok(r.ok, r.msg);
  assert.equal(p.post!.grade, 1, 'a graduate starts as a teacher, not an assistant');
  p.loc = p.home; p.energy = 100;
  const n = w.nations[w.regions[p.home].owner];
  const before = p.wallet[n.cur] ?? 0;
  const s = serviceShift(w);
  assert.ok(s.ok, s.msg);
  assert.ok((p.wallet[n.cur] ?? 0) > before);
  assert.equal(p.life!.work!.at(-1)!.what.startsWith('Teacher'), true);
  // Promotion after enough good service.
  p.post!.shifts = 200; p.traits.ambition = 1;
  for (let i = 0; i < 60 && p.post!.grade === 1; i++) { w.time += DAY; servicesDaily(w); }
  assert.equal(p.post!.grade, 2, 'promoted to senior teacher');
  advance(w, DAY, false);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.equal(deserialize(serialize(w)).citizens[p.id].post!.kind, 'teacher');
});
