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
import { enroll, enrollCheck, eduOfCitizen, hasUniversity, study, studyCheck, courseDays } from '../src/sim/education';
import { rank } from '../src/data/education';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });

test('everyone has an education, in plausible shares by country', () => {
  const w = fresh();
  const adults = census(w).all.filter((c) => !c.gone);
  assert.ok(adults.every((c) => c.edu));
  const tertiary = adults.filter((c) => rank(c.edu!.level) >= 2).length / adults.length;
  assert.ok(tertiary > 0.15 && tertiary < 0.6, `tertiary share ${tertiary}`);
  assert.ok(adults.some((c) => c.edu!.enrolled), 'some students');
  assert.ok(w.regions.some((r) => hasUniversity(w, r)) && w.regions.some((r) => !hasUniversity(w, r)));
});

test('enrol, pay fees to the state, study day by day, graduate', () => {
  const w = fresh(502);
  w.settings.lifeYearDays = 24; // a fast pace of life: short courses
  const p = player(w);
  const r = w.regions.find((x) => hasUniversity(w, x) && x.owner === p.nation)!;
  p.home = r.id; p.loc = r.id;
  p.edu = { level: 'school' };
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(3000), 'test');
  assert.match(enrollCheck(w, p, 'master', 'law') ?? '', /bachelor/i);
  const e = enroll(w, 'vocational', 'trades');
  assert.ok(e.ok, e.msg);
  assert.ok(courseDays(w, 'vocational') < 180);
  p.energy = 100;
  assert.ok(study(w).ok);
  assert.match(studyCheck(w, p) ?? '', /today/);
  for (let i = 0; i < 40 && eduOfCitizen(p).enrolled; i++) { advance(w, DAY, false); p.energy = 100; p.loc = r.id; study(w); }
  assert.equal(eduOfCitizen(p).level, 'vocational');
  assert.equal(eduOfCitizen(p).enrolled, undefined);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  const w2 = deserialize(serialize(w));
  assert.equal(w2.citizens[p.id].edu!.level, 'vocational');
});
