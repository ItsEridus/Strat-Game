import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY, HOUR } from '../src/engine/clock';
import { c as cur } from '../src/engine/money';
import { controller, cref, player } from '../src/sim/query';
import { residents } from '../src/sim/census';
import { deserialize, serialize } from '../src/engine/save';
import {
  arrangeMeeting, availability, explore, exploreCheck, familiarity, goTo, isKnown, keepAppointment, localAct, localActCheck, peopleAt, position, venuesOf,
} from '../src/sim/places';
import { talkCheck } from '../src/sim/interact';
import { chooseStory, memoriesOf, registerStory, startStory, type Ctx } from '../src/sim/story';
import { nowDoing } from '../src/sim/life';

registerSystems();
const fresh = (seed = 501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 4, lifeYearDays: 36 });

test('a region\'s places are fixed: same layout every time, no dice used, kept across save/load', () => {
  const a = fresh(), b = fresh();
  const p = player(a);
  const rng = a.rng;
  const la = venuesOf(a, p.loc).map((v) => `${v.id}|${v.name}`);
  assert.equal(a.rng, rng, 'looking at a map does not roll dice');
  assert.deepEqual(venuesOf(b, player(b).loc).map((v) => `${v.id}|${v.name}`), la);
  const c = deserialize(serialize(a));
  assert.deepEqual(venuesOf(c, player(c).loc).map((v) => `${v.id}|${v.name}`), la);
  for (const kind of ['home', 'park', 'cafe', 'cityhall', 'police', 'market', 'station']) assert.ok(la.some((x) => x.startsWith(`${kind}|`)), kind);
});

test('essential places are always known; exploring reveals the rest with diminishing returns', () => {
  const w = fresh(502);
  const p = player(w);
  const vs = venuesOf(w, p.loc);
  for (const v of vs.filter((x) => x.essential)) assert.ok(isKnown(w, p.loc, v), `${v.id} known`);
  const lookout = vs.find((v) => v.kind === 'lookout')!;
  assert.ok(!isKnown(w, p.loc, lookout), 'the lookout is a local secret');
  const f0 = familiarity(w, p.loc);
  p.energy = 100;
  assert.ok(explore(w).ok);
  const gain1 = familiarity(w, p.loc) - f0;
  assert.match(exploreCheck(w) ?? '', /hour/);
  for (let i = 0; i < 30; i++) { advance(w, HOUR, false); p.energy = 100; explore(w); }
  const f1 = familiarity(w, p.loc);
  advance(w, HOUR, false); p.energy = 100; explore(w);
  assert.ok(familiarity(w, p.loc) - f1 < gain1, 'each exploration teaches less');
  assert.ok(isKnown(w, p.loc, lookout), 'the lookout found');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('local position resets when you travel to another region', () => {
  const w = fresh(503);
  const p = player(w);
  assert.ok(goTo(w, 'park').ok);
  assert.equal(position(w).venue, 'park');
  p.loc = w.regions[p.loc].links[0];
  assert.equal(position(w).venue, 'station', 'arrive at the station');
  assert.equal(position(w).district, 'transport');
});

test('people can be met when they are free; the sleeping wait until morning', () => {
  const w = fresh(504);
  const p = player(w);
  advance(w, (24 - 8 + 2) * HOUR, false); // 02:00 the next night
  const npc = residents(w, p.loc).find((c) => !c.player && nowDoing(w, c) === 'sleep')!;
  assert.ok(npc, 'someone asleep');
  const a = availability(w, npc);
  assert.equal(a.now, false);
  assert.equal(a.why, 'asleep');
  assert.ok(a.next && a.next > w.time, 'next window known');
  assert.match(talkCheck(w, p, npc) ?? '', /asleep/);
  advance(w, a.next! - w.time, false);
  assert.ok(availability(w, npc).now, 'free after waking');
});

test('appointments: kept meetings warm people up; missed ones are remembered', () => {
  const w = fresh(505);
  const p = player(w);
  const [x, y] = residents(w, p.loc).filter((c) => !c.player).slice(0, 2);
  assert.ok(arrangeMeeting(w, x.id).ok);
  assert.ok(arrangeMeeting(w, y.id).ok);
  const ax = w.story.appointments.find((a) => a.npc === x.id)!;
  const yAt = w.story.appointments.find((a) => a.npc === y.id)!.at;
  y.flags.meetMissTest = 1;
  // Keep x's appointment (y's may come earlier or later; it will simply be missed).
  advance(w, ax.at - w.time, false);
  assert.ok(w.notices.some((n) => /⏰/.test(n.text)), 'reminded');
  const r = keepAppointment(w, ax.id);
  assert.ok(r.ok, r.msg);
  assert.ok(memoriesOf(w, x.id).some((m) => /kept our appointment/.test(m.text)));
  assert.equal(w.player.convo?.npc, x.id, 'the conversation begins');
  advance(w, Math.max(0, yAt - w.time) + 3 * HOUR, false);
  assert.ok(!w.story.appointments.some((a) => a.npc === y.id), 'the missed meeting is over');
  assert.ok(memoriesOf(w, y.id).some((m) => /stood me up/.test(m.text)));
});

test('a story can arrange a meeting and wait for it', () => {
  const w = fresh(506);
  const p = player(w);
  const friend = residents(w, p.loc).find((c) => !c.player)!;
  registerStory({
    id: 'test.meet', version: 1, icon: '🧪', kind: 'chain', tags: [], title: () => 'A word in private', start: 'ask',
    stages: {
      ask: { text: () => 'They want to talk.', choices: () => [{ id: 'yes', label: 'Agree to meet', hint: '', run: () => ({ text: 'You agree.', next: 'after', meet: { role: 'friend', venue: 'cafe', what: 'talk things over' } }) }] },
      after: { text: (c: Ctx) => (c.num('met') ? 'You talked it through.' : 'You never showed up.'), choices: (c: Ctx) => [{ id: 'ok', label: 'Go on', hint: '', run: () => ({ text: c.num('met') ? 'Settled.' : 'A pity.', end: c.num('met') ? 'met' : 'missed' }) }] },
    },
  });
  const inst = startStory(w, 'test.meet', { bind: { friend: friend.id }, key: 'meet-1' })!;
  assert.ok(inst, 'started');
  assert.ok(chooseStory(w, inst.id, 'yes', 'ask').ok);
  assert.equal(inst.status, 'waiting');
  const appt = w.story.appointments.find((a) => a.story === inst.id)!;
  assert.ok(appt, 'the meeting is booked');
  advance(w, appt.at - w.time, false);
  assert.ok(keepAppointment(w, appt.id).ok);
  advance(w, 2 * HOUR, false);
  assert.equal(inst.stage, 'after');
  assert.equal(inst.data.met, 1);
});

test('everyday things to do at a place: once a day, paid for properly', () => {
  const w = fresh(507);
  const p = player(w);
  mint(w, cref(p.id), w.nations[controller(w.regions[p.loc])].cur, cur(20), 'test');
  assert.match(localActCheck(w, 'coffee') ?? '', /café/);
  goTo(w, 'cafe');
  assert.ok(localAct(w, 'coffee').ok);
  assert.match(localActCheck(w, 'coffee') ?? '', /once a day/i);
  advance(w, DAY, false);
  goTo(w, 'cafe');
  assert.equal(localActCheck(w, 'coffee'), null);
  peopleAt(w, p.loc, 'cafe');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
