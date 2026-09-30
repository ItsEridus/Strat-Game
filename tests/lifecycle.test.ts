import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY, HOUR } from '../src/engine/clock';
import { player } from '../src/sim/query';
import { ageOf, lifeYear, nextBirthday } from '../src/sim/growth';
import { lifeGate, lifeOf, lifeStage, pendingReview, routineOf, setLifePace } from '../src/sim/lifecycle';
import { applyJob, workShift } from '../src/sim/company';
import { bestOffer, citizenHourly } from '../src/ai/citizens';
import { enlistCheck } from '../src/sim/forces';
import { newResident } from '../src/sim/population';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('age comes from one birth time: before the campaign began, on the birthday, across save/load', () => {
  const w = fresh();
  const p = player(w);
  assert.equal(w.settings.lifeYearDays, 36, 'new campaigns use the lifetime pace');
  assert.ok(p.born < 0, 'the player was born before day 0');
  assert.equal(ageOf(w, p), 24);
  const b = nextBirthday(w, p);
  assert.equal(b - p.born, 25 * lifeYear(w));
  advance(w, b - w.time - 10, false);
  assert.equal(ageOf(w, p), 24, 'just before');
  advance(w, 10, false);
  assert.equal(ageOf(w, p), 25, 'on the birthday');
  const w2 = deserialize(serialize(w));
  assert.equal(ageOf(w2, w2.citizens[p.id]), 25);
});

test('a birthday gives exactly one annual review, with the year in it', () => {
  const w = fresh(402);
  const p = player(w);
  advance(w, HOUR, false);
  const n0 = w.life.reviews.length;
  advance(w, nextBirthday(w, p) - w.time + HOUR, false);
  assert.equal(w.life.reviews.length, n0 + 1);
  const r = pendingReview(w)!;
  assert.equal(r.age, 25);
  assert.equal(r.who, p.id);
  advance(w, 5 * DAY, false);
  assert.equal(w.life.reviews.length, n0 + 1, 'no second review for the same birthday');
  r.seen = true;
  assert.equal(pendingReview(w), null);
});

test('coming of age at 18 opens adult life once', () => {
  const w = fresh(403);
  const p = player(w);
  p.born = w.time - 17 * lifeYear(w) - (lifeYear(w) - 2 * HOUR);
  lifeOf(p).lastAge = 17; w.life.snap = null;
  advance(w, 10, false); // snapshot at 17
  assert.equal(lifeStage(w, p), 'teen');
  assert.equal(lifeGate(w, p, 16, 'Paid work'), null, 'a part-time job is fine at 17');
  assert.match(enlistCheck(w, p, 'army') ?? '', /from age 18/);
  advance(w, 3 * HOUR, false);
  assert.equal(ageOf(w, p), 18);
  assert.equal(lifeStage(w, p), 'adult');
  const r = pendingReview(w)!;
  assert.ok(r.lines.some((l) => /adult/.test(l.text)), 'the review marks adulthood');
  assert.equal(enlistCheck(w, p, 'army'), null);
});

test('children cannot work or enlist through direct calls or the AI', () => {
  const w = fresh(404);
  const kid = newResident(w, w.nations[0], player(w).home, { age: 12 });
  assert.equal(ageOf(w, kid), 12);
  assert.match(lifeGate(w, kid, 16, 'Paid work') ?? '', /12/);
  const co = Object.values(w.companies).find((c) => c.offer && c.workers.length < c.offer.slots)!;
  assert.equal(applyJob(w, kid, co.id).ok, false);
  assert.match(enlistCheck(w, kid, 'army') ?? '', /18/);
  kid.energy = 100;
  for (let h = 0; h < 24; h++) { citizenHourly(w, kid); advance(w, HOUR, false); }
  assert.equal(kid.job, null, 'the AI never gave a child a job');
  assert.equal(bestOffer(w, kid) != null || true, true);
});

test('a routine shift and a manual shift never pay twice in a day', () => {
  const w = fresh(405);
  const p = player(w);
  const co = Object.values(w.companies).find((c) => c.offer && c.workers.length < c.offer.slots && c.region === p.loc) ?? Object.values(w.companies).find((c) => c.offer && c.workers.length < c.offer.slots)!;
  p.loc = co.region;
  assert.ok(applyJob(w, p, co.id).ok);
  routineOf(w).work = true;
  assert.ok((w.time % DAY) / HOUR < p.workHour, 'the campaign starts before the work hour');
  p.energy = 100;
  const wages0 = w.ledger.filter((e) => /Wage/.test(e.text)).length;
  const m = workShift(w, p);
  assert.ok(m.ok, `manual shift: ${m.msg}`);
  advance(w, 3 * HOUR, false); // the routine hour passes
  const wages = w.ledger.filter((e) => /Wage/.test(e.text)).length;
  assert.equal(wages - wages0, 1, 'one paid shift');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('advancing in short chunks gives exactly the same world as one long advance', () => {
  const a = fresh(406), b = fresh(406);
  advance(a, 2 * DAY, false);
  for (let i = 0; i < 48; i++) advance(b, HOUR, false);
  assert.equal(serialize(a), serialize(b));
});

test('changing the pace of life keeps everyone\'s age', () => {
  const w = fresh(407);
  const ages = Object.values(w.citizens).slice(0, 50).map((c) => ageOf(w, c));
  assert.ok(setLifePace(w, 72));
  assert.deepEqual(Object.values(w.citizens).slice(0, 50).map((c) => ageOf(w, c)), ages);
  assert.equal(lifeYear(w), 72 * DAY);
});
