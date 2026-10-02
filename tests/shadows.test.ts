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
import { relation } from '../src/sim/congress';

registerSystems();
const fresh = (seed = 1501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('stories: the walk-in, burned and the estimate', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const home = w.nations[p.nation];
  p.sec.agency = home.id; p.sec.arank = 2;
  // A hostile country with an official who might walk in.
  const rival = w.nations.find((n) => n.id !== home.id)!;
  relation(w, home.id, rival.id, -60, 'test');
  const official = census(w).all.find((c) => c.nation === rival.id && !c.player)!;
  rival.cabinet.economy = official.id;
  const a = triggerStory(w, 'shadows.walkin');
  assert.ok(a.ok, a.msg);
  assert.ok(chooseStory(w, (a as any).data.id, 'run', 'main').ok);
  assert.ok(census(w).all.some((c) => c.sec.asset === home.id), 'a source inside');
  // Burned: an exposed operation we ran.
  w.ops[999999] = { id: 999999, nation: home.id, target: rival.id, region: null, kind: 'intel', agent: p.id, start: w.time - DAY, ends: w.time, status: 'exposed' } as any;
  const b = triggerStory(w, 'shadows.burned');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'low', 'main').ok);
  // The estimate.
  const e = triggerStory(w, 'shadows.estimate');
  assert.ok(e.ok, e.msg);
  assert.ok(chooseStory(w, (e as any).data.id, 'evidence', 'main').ok);
  assert.ok(audit(w).ok);
});
