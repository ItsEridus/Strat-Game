import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { census } from '../src/sim/census';
import { chooseStory, triggerStory } from '../src/sim/story';
import { declareWar, settle } from '../src/sim/war';

registerSystems();
const fresh = (seed = 1901) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('war stories: the call-up, letters from the front, ceasefire and coming home', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const home = w.nations[p.nation];
  const enemy = w.nations.find((n) => n.id !== home.id && !home.alliances.includes(n.id))!;
  w.wars = {};
  home.pacts = {};
  const war = declareWar(w, enemy, { target: home.id, days: 21, goals: [] });
  // Called up.
  p.mil.branch = 'army'; p.mil.reserve = false; p.mil.calledUp = war.id;
  const a = triggerStory(w, 'war.callup');
  assert.ok(a.ok, a.msg);
  assert.ok(chooseStory(w, (a as any).data.id, 'report', 'main').ok);
  // A partner at the front.
  const partner = census(w).all.find((c) => c.nation === home.id && !c.player)!;
  p.family!.partner = partner.id; partner.family!.partner = p.id;
  partner.mil.branch = 'army'; partner.mil.reserve = false;
  const b = triggerStory(w, 'war.letters');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'write', 'main').ok);
  // Ceasefire, as head of government.
  home.president = p.id;
  w.time += 15 * DAY;
  const c = triggerStory(w, 'war.ceasefire');
  assert.ok(c.ok, c.msg);
  assert.ok(chooseStory(w, (c as any).data.id, 'hold', 'main').ok);
  // Coming home after the peace.
  settle(w, war, 'armistice');
  assert.equal(p.flags.veteranOf, war.id);
  const d = triggerStory(w, 'war.home');
  assert.ok(d.ok, d.msg);
  assert.ok(chooseStory(w, (d as any).data.id, 'veterans', 'main').ok);
  assert.ok(audit(w).ok);
});
