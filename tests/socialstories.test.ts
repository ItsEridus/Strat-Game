import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { chooseStory, triggerStory } from '../src/sim/story';
import { startRumour } from '../src/sim/gossip';
import { lifeOf } from '../src/sim/lifecycle';

registerSystems();
const fresh = (seed = 4601) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('stories of the social fabric: a rumour, the visiting arrangements', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const others = census(w).all.filter((x) => !x.player && !x.gone && ageOf(w, x) >= 20);
  // A rumour about you, heard by several people.
  const r = startRumour(w, p, 'slander', `${p.name} cannot be trusted`, -1, 5, false, others[0])!;
  r.heard.push(others[1].id, others[2].id, others[3].id);
  const a = triggerStory(w, 'social.rumour');
  assert.ok(a.ok, a.msg);
  const s0 = lifeOf(p).stress;
  assert.ok(chooseStory(w, (a as any).data.id, 'laugh', 'main').ok);
  assert.ok(lifeOf(p).stress >= s0);
  // Children living with an ex.
  const ex = others.find((x) => x.family)!;
  ex.family!.kids.push({ name: 'Kim Tester', born: w.time - 5 * 365 * DAY, other: p.id });
  const b = triggerStory(w, 'social.visiting');
  assert.ok(b.ok, b.msg);
  const r0 = ex.rel[p.id] ?? 0;
  assert.ok(chooseStory(w, (b as any).data.id, 'flex', 'main').ok);
  assert.ok((ex.rel[p.id] ?? 0) > r0);
  assert.ok(audit(w).ok);
});
