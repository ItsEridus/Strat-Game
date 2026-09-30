import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY, HOUR } from '../src/engine/clock';
import { GOLD, g } from '../src/engine/money';
import { cref, player } from '../src/sim/query';
import { Ctx, chooseStory, memoriesOf, registerStory, remember, setStoryFrequency, startStory, triggerStory, urgentStories, viewStage } from '../src/sim/story';
import { createCompany } from '../src/sim/company';
import { transferCompany } from '../src/sim/companyMarket';
import { deserialize, serialize } from '../src/engine/save';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 101) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

// A tiny three-stage story exercising waits, deadlines and endings.
registerStory({
  id: 'test.chain', version: 1, icon: '🧪', kind: 'chain', tags: [], title: () => 'Test chain', start: 'a',
  stages: {
    a: { urgent: true, text: (c) => `Hello ${c.cit('who')?.name}`, choices: () => [
      { id: 'go', label: 'Go on', hint: '', run: (c) => { c.remember(c.cit('who'), 7, 'went on with the test'); return { text: 'Wait a day.', next: 'b', wait: { minutes: DAY, why: 'Waiting a day.' } }; } },
      { id: 'no', label: 'No', hint: '', run: () => ({ text: 'Declined.', decline: true }) },
    ] },
    b: { urgent: true, expires: 2 * HOUR, text: () => 'Stage b', choices: () => [{ id: 'end', label: 'End', hint: '', run: () => ({ text: 'The end.', end: 'finale' }) }], onExpire: () => ({ text: 'Too late.', end: 'late' }) },
  },
});

const someone = (w: World) => Object.values(w.citizens).find((c) => !c.player)!;

test('stories are deterministic, viewing them changes nothing, and each decision runs once', () => {
  const run = () => {
    const w = fresh(102);
    advance(w, 4 * DAY, false);
    const out: string[] = [];
    for (let d = 0; d < 4; d++) {
      advance(w, DAY, false);
      for (const inst of urgentStories(w)) { const c = viewStage(w, inst).choices.find((x) => !x.why); if (c) out.push(`${inst.def}:${c.id}:${chooseStory(w, inst.id, c.id, inst.stage).msg}`); }
    }
    return { out, rng: w.rng, j: w.story.journal.length };
  };
  const a = run(), b = run();
  assert.deepEqual(a, b, 'same seed and choices, same stories');
  const w = fresh(103);
  const inst = startStory(w, 'test.chain', { bind: { who: someone(w).id }, key: 'k1' })!;
  const before = JSON.stringify({ rng: w.rng, t: w.time, s: w.story });
  for (let i = 0; i < 5; i++) { viewStage(w, inst); urgentStories(w); }
  assert.equal(JSON.stringify({ rng: w.rng, t: w.time, s: w.story }), before, 'viewing is pure');
  assert.equal(startStory(w, 'test.chain', { bind: {}, key: 'k1' }), null, 'one story per source');
  assert.ok(chooseStory(w, inst.id, 'go', 'a').ok);
  assert.equal(chooseStory(w, inst.id, 'go', 'a').ok, false, 'no second decision');
  assert.equal(inst.status, 'waiting');
  assert.equal(memoriesOf(w, someone(w).id).length, 1, 'remembered');
});

test('waiting stages resume on the clock, deadlines resolve with a recorded reason, stale premises end cleanly', () => {
  const w = fresh(104);
  const inst = startStory(w, 'test.chain', { bind: { who: someone(w).id }, key: 'k2' })!;
  chooseStory(w, inst.id, 'go', 'a');
  advance(w, DAY + HOUR, false);
  assert.equal(inst.status, 'active');
  assert.equal(inst.stage, 'b');
  advance(w, 3 * HOUR, false);
  assert.equal(inst.status, 'completed');
  assert.equal(inst.ending, 'late');
  assert.ok(w.story.journal.some((j) => j.story === inst.id && /Too late/.test(j.text)));
  // Stale: a buyout offer for a company that has since been sold.
  const p = player(w);
  mint(w, cref(p.id), GOLD, g(50), 'test');
  const co = createCompany(w, cref(p.id), 'grain', 1, p.loc);
  const buyer = Object.values(w.citizens).find((c) => !c.player && c.nation === p.nation)!;
  mint(w, cref(buyer.id), GOLD, g(500), 'test');
  const offer = startStory(w, 'work.buyout', { bind: { co: co.id, buyer: buyer.id }, key: 'b1', data: { offer: g(20), value: g(15) } })!;
  transferCompany(w, co, cref(buyer.id), 0);
  const gold = p.wallet[GOLD];
  const r = chooseStory(w, offer.id, 'sell', 'main');
  assert.equal(r.ok, false);
  assert.equal(offer.status, 'invalidated');
  assert.equal(p.wallet[GOLD], gold, 'no payment for a company you no longer own');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('stories, journal and memories survive save/load; old saves migrate; frequency off stops everyday situations', () => {
  const w = fresh(105);
  const who = someone(w);
  const inst = startStory(w, 'test.chain', { bind: { who: who.id }, key: 'k3' })!;
  chooseStory(w, inst.id, 'go', 'a');
  remember(w, who, -5, 'tested their patience');
  const back = deserialize(serialize(w));
  const i2 = back.story.instances[inst.id];
  assert.equal(i2.status, 'waiting');
  assert.equal(i2.waitUntil, inst.waitUntil);
  assert.equal(memoriesOf(back, who.id).length, 2);
  advance(back, DAY + HOUR, false);
  assert.equal(i2.stage, 'b');
  assert.ok(chooseStory(back, i2.id, 'end', 'b').ok);
  assert.equal(i2.ending, 'finale');
  // A version-6 save (before stories) loads with an empty narrative and nothing else changed.
  const old = JSON.parse(serialize(fresh(106)));
  old.version = 6; delete old.world.story;
  const money = JSON.stringify(old.world.nations.map((n: any) => n.wallet));
  const m = deserialize(JSON.stringify(old));
  assert.deepEqual(m.story.instances, {});
  assert.equal(JSON.stringify(m.nations.map((n) => n.wallet)), money);
  // Everyday situations off: none are offered, but a triggered story still works.
  const w2 = fresh(107);
  setStoryFrequency(w2, 'off');
  advance(w2, 5 * DAY, false);
  assert.equal(Object.values(w2.story.instances).filter((i) => i.def.startsWith('life.') || i.def.startsWith('work.')).length, 0);
  const t = triggerStory(w2, 'life.festival');
  assert.ok(t.ok);
  void Ctx;
});
