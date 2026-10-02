import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { GOLD, c as cur, g } from '../src/engine/money';
import { cref, player } from '../src/sim/query';
import { census, invalidateCensus, residents } from '../src/sim/census';
import { listingsFor } from '../src/sim/market';
import { canvass, converse, holdRally, localIssues, pledgeOf, startTalk } from '../src/sim/interact';
import { STORIES, chooseStory, triggerStory, urgentStories, viewStage } from '../src/sim/story';
import { adminGiveItem, adminSetAge, adminSetStanding, adminSetMoney, adminTeleport } from '../src/sim/admin';
import { runForHead } from '../src/sim/stategov';
import { ageOf } from '../src/sim/growth';
import { deserialize, serialize } from '../src/engine/save';
import { EARTH } from '../src/data/earth';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 91, perRegion = 2) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: perRegion });
const region = (w: World, name: string) => w.regions.find((r) => r.name === name && r.owner === 0)!;

test('every region has its own residents, businesses spread across the country, and people work near home', () => {
  const w = fresh(91, 3);
  for (const r of w.regions) assert.ok(residents(w, r.id).length >= 3, `${r.name} has residents`);
  const tx = residents(w, region(w, 'Texas').id).length, wy = residents(w, region(w, 'Wyoming').id).length;
  assert.ok(tx > wy, 'populous states have more people');
  const usRegionsWithCompanies = new Set(Object.values(w.companies).filter((co) => w.regions[co.region].owner === 0).map((co) => co.region));
  assert.ok(usRegionsWithCompanies.size > 25, `companies in ${usRegionsWithCompanies.size} US states`);
  const employed = Object.values(w.citizens).filter((c) => c.job != null && w.companies[c.job]);
  const local = employed.filter((c) => { const r = w.companies[c.job!].region; return r === c.home || w.regions[c.home].links.includes(r); });
  assert.ok(local.length / employed.length > 0.6, `most jobs are close to home (${local.length}/${employed.length})`);
  assert.equal(EARTH.regions.length, w.regions.length);
});

test('indexes stay consistent with the world: order books and census', () => {
  const w = fresh(92);
  advance(w, 3 * DAY, false);
  for (const n of w.nations) for (const item of ['food:1', 'wg:1', 'grain']) {
    const brute = Object.values(w.listings).filter((l) => l.market === n.id && l.item === item).sort((a, b) => a.price - b.price || a.id - b.id).map((l) => l.id);
    assert.deepEqual(listingsFor(w, n.id, item).map((l) => l.id), brute, `${n.name} ${item}`);
  }
  const p = player(w);
  const dest = w.regions[p.loc].links[0];
  adminTeleport(w, dest, false);
  assert.ok(census(w).byLoc.get(dest)!.includes(p), 'census follows moves');
  invalidateCensus(w);
  assert.equal(census(w).all.length, Object.values(w.citizens).filter((c) => !c.gone).length, 'the census holds everyone alive and present');
});

test('conversations, canvassing and rallies win people over; pledges decide a state election', () => {
  const w = fresh(93, 6);
  const p = player(w);
  p.influence = Math.max(p.influence, 40); p.energy = 100;
  mint(w, cref(p.id), 'USD', cur(500), 'test');
  const co = region(w, 'Colorado');
  adminTeleport(w, co.id, true);
  const npc = residents(w, co.id).find((c) => !c.player)!;
  assert.ok(startTalk(w, npc.id).ok);
  assert.ok(w.player.convo && w.player.convo.choices.length > 3);
  assert.ok(converse(w, 'life').ok);
  assert.ok(converse(w, 'news').ok);
  assert.ok(npc.flags.toldIssue != null, 'learned what they care about');
  assert.ok(converse(w, 'bye').ok);
  assert.equal(w.player.convo, null);
  assert.ok(canvass(w).ok);
  assert.equal(canvass(w).ok, false, 'once a day');
  p.energy = 100;
  const issue = localIssues(w, co.id)[0].issue;
  const before = p.influence;
  assert.ok(holdRally(w, issue).ok);
  assert.ok(p.influence > before, 'rallies build influence');
  // Stand for governor, then get every resident to promise their vote.
  const s = w.govs[co.id]!;
  s.nextElection = w.time + 2 * DAY;
  advance(w, DAY, false);
  assert.ok(runForHead(w, p.id, co.id).ok);
  for (const c of residents(w, co.id)) if (!c.player) { c.flags.pledge = p.id; c.flags.pledgeDay = Math.floor(w.time / DAY); }
  assert.ok(residents(w, co.id).every((c) => c.player || pledgeOf(w, c) === p.id));
  advance(w, 2 * DAY, false);
  assert.equal(s.head.cit, p.id, 'residents who promised their votes carried the election');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('every everyday situation can be presented and every choice resolves without breaking the books', () => {
  let tried = 0;
  for (const def of Object.values(STORIES).filter((d) => d.ambient)) {
    for (let optIdx = 0; optIdx < 4; optIdx++) {
      const w = fresh(94 + optIdx);
      const p = player(w);
      p.influence = 40; p.energy = 100;
      mint(w, cref(p.id), 'USD', cur(800), 'test');
      mint(w, cref(p.id), GOLD, g(40), 'test');
      adminGiveItem(w, 'food:1', 6);
      const t = triggerStory(w, def.id);
      if (!t.ok) break;
      const inst = w.story.instances[t.data.id];
      const opt = viewStage(w, inst).choices[optIdx];
      if (!opt) break;
      if (opt.why) continue;
      const r = chooseStory(w, inst.id, opt.id, inst.stage);
      assert.ok(r.ok, `${def.id}/${opt.id}: ${r.msg}`);
      assert.equal(chooseStory(w, inst.id, opt.id, 'main').ok, false, 'decided once');
      advance(w, DAY, false);
      assert.ok(audit(w).ok, `${def.id}/${opt.id}: ${audit(w).problems.join('; ')}`);
      tried++;
    }
  }
  assert.ok(tried >= 12, `${tried} choices exercised`);
  // Situations also arise on their own while time passes.
  const w = fresh(99);
  let seen = 0;
  // About three in six days on average; twelve days keeps the test from depending on one lucky draw.
  for (let d = 0; d < 12; d++) {
    advance(w, DAY, false);
    for (const inst of urgentStories(w)) { seen++; const c = viewStage(w, inst).choices.find((o) => !o.why); if (c) chooseStory(w, inst.id, c.id, inst.stage); }
  }
  assert.ok(seen >= 2, `situations happen (${seen} in 12 days)`);
});

test('admin panel edits go through the ledger; saves migrate and round-trip', () => {
  const w = fresh(95);
  const p = player(w);
  assert.ok(adminSetMoney(w, 'USD', cur(123456)).ok);
  assert.equal(p.wallet.USD, cur(123456));
  assert.ok(adminSetMoney(w, GOLD, g(5)).ok);
  assert.ok(adminSetStanding(w, 80).ok);
  assert.ok(adminSetAge(w, 40).ok);
  assert.equal(ageOf(w, p), 40);
  assert.ok(adminGiveItem(w, 'wg:5', 20).ok);
  assert.ok(w.settings.adminUsed);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  // A version-5 save (no home regions) loads and gains them.
  const old = JSON.parse(serialize(w));
  old.version = 5;
  for (const c of Object.values(old.world.citizens) as any[]) delete c.home;
  const back = deserialize(JSON.stringify(old));
  assert.ok(Object.values(back.citizens).every((c) => c.home === c.loc));
  // People move house for work over time, and it makes the local news.
  const w2 = fresh(96, 3);
  const homes = new Map(Object.values(w2.citizens).map((c) => [c.id, c.home]));
  advance(w2, 12 * DAY, false);
  assert.ok(w2.regions.some((r) => (r.news ?? []).length > 0), 'local news written');
  const moved = Object.values(w2.citizens).filter((c) => homes.get(c.id) !== c.home);
  assert.ok(moved.length > 0, 'some people moved house');
});
