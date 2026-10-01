import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { player } from '../src/sim/query';
import { ageOf, bornYearsAgo } from '../src/sim/growth';
import { childhoodDaily, isMinor, parentTime, schoolDay, schoolDayCheck } from '../src/sim/childhood';
import { kidComesOfAge } from '../src/sim/family';
import { lifeOf } from '../src/sim/lifecycle';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();

test('born into the world: a newborn with parents, at home, on the family budget', () => {
  const w = generateWorld(1101, 'Baby', 0, { citizensPerRegion: 3, startAge: 0 });
  const p = player(w);
  assert.equal(ageOf(w, p), 0);
  assert.ok(isMinor(w, p));
  assert.ok(p.family!.parents.length >= 1, 'has parents');
  assert.equal(p.dwelling!.kind, 'family');
  assert.equal(p.edu!.level, 'none');
  assert.match(schoolDayCheck(w, p) ?? '', /5/);
  advance(w, 2 * DAY, false);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.equal(deserialize(serialize(w)).settings.startAge, 0);
});

test('school days raise grades; school ends at 18 with a diploma by grades', () => {
  const w = generateWorld(1102, 'Teen', 0, { citizensPerRegion: 3, startAge: 16 });
  const p = player(w);
  p.energy = 100;
  const g0 = lifeOf(p).grades!;
  assert.ok(schoolDay(w).ok);
  assert.ok(lifeOf(p).grades! > g0);
  lifeOf(p).grades = 90;
  p.born = bornYearsAgo(w, 18, 1);
  childhoodDaily(w);
  assert.equal(p.edu!.level, 'school');
  assert.ok(lifeOf(p).scholarship, 'top grades win a scholarship');
});

test('time with a child builds closeness; at 18 they are shaped by it', () => {
  const w = generateWorld(1103, 'Parent', 0, { citizensPerRegion: 3 });
  const p = player(w);
  p.family!.kids.push({ name: 'Sam Kid', born: bornYearsAgo(w, 10, 5), bond: 50, grades: 50 });
  p.energy = 100;
  assert.ok(parentTime(w, 'Sam Kid').ok);
  assert.equal(parentTime(w, 'Sam Kid').ok, false, 'once a day');
  const kid = p.family!.kids.at(-1)!;
  assert.ok(kid.bond! > 50 && kid.grades! > 50);
  kid.bond = 95; kid.grades = 90; kid.born = bornYearsAgo(w, 18, 1);
  const c = kidComesOfAge(w, p, kid);
  assert.ok(c.rel[p.id] >= 80, 'close to the parent who was there');
  assert.equal(c.edu!.level, 'school');
  assert.ok(census(w).all.includes(c));
});
