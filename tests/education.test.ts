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
import { addSp } from '../src/sim/forces';
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
  w.settings.lifeYearDays = 24; w.settings.playerMortality = false; // a fast pace of life (set directly, so ages rescale: no player deaths): short courses
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

test('officer ranks need a commission: officer training for graduates, the academy for cadets', () => {
  const w = fresh(503);
  w.settings.lifeYearDays = 24; w.settings.playerMortality = false; // ages rescale with the pace
  const p = player(w);
  p.edu = { level: 'school' };
  p.mil = { branch: 'army', rank: 4, sp: 1e6, since: w.time - 5000 * DAY, lastDuty: -1, commands: 0 };
  addSp(w, p, 1);
  assert.equal(p.mil.rank, 4, 'no commission, no officer rank');
  assert.ok(p.mil.hinted, 'told how to get one');
  assert.match(enrollCheck(w, p, 'ocs', 'law') ?? '', /bachelor/i);
  p.born = w.time - 20 * 24 * DAY; // 20 on this pace of life
  const r = enroll(w, 'academy', 'engineering');
  assert.ok(r.ok, r.msg);
  p.loc = w.nations[p.nation].capital;
  for (let i = 0; i < 200 && p.edu!.enrolled; i++) { advance(w, DAY, false); p.energy = 100; p.loc = w.nations[p.nation].capital; study(w); }
  assert.equal(p.edu!.level, 'bachelor');
  assert.ok(p.mil.commissioned);
  assert.equal(p.mil.rank, 5, 'commissioned as a second lieutenant');
  // NPC graduates go to officer training on their own when they reach the bar.
  const npc = census(w).all.find((c) => !c.player && !c.mil.branch && !c.edu?.enrolled)!;
  npc.edu = { level: 'bachelor', field: 'law' };
  npc.born = w.time - 26 * 24 * DAY; // 26 on this pace of life
  npc.sec.record.convictions = 0;
  npc.mil = { branch: 'army', rank: 4, sp: 1e6, since: w.time - 5000 * DAY, lastDuty: -1, commands: 0 };
  addSp(w, npc, 1);
  assert.equal(npc.edu.enrolled?.course, 'ocs');
});
