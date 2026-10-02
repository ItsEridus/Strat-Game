import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { cref, player } from '../src/sim/query';
import { c as cur } from '../src/engine/money';
import { chooseStory, triggerStory } from '../src/sim/story';
import { emigrate } from '../src/sim/migration';
import { timeOfDate } from '../src/engine/calendar';

registerSystems();
const fresh = (seed = 5601) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('stories of culture: a festival coming, an invitation next door', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  // Two days before Christmas.
  w.time = timeOfDate(2025, 11, 23) + 10 * 60;
  p.religion = 'christian';
  const a = triggerStory(w, 'culture.festival');
  assert.ok(a.ok, a.msg);
  assert.ok(chooseStory(w, (a as any).data.id, 'quiet', 'main').ok);
  // A newcomer abroad.
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(2000), 'test');
  const dest = w.nations.find((n) => ['ARG', 'MEX', 'BRA', 'ZAF'].includes(n.iso) && n.id !== p.nation)!;
  assert.ok(emigrate(w, dest.id, 'work').ok);
  const b = triggerStory(w, 'culture.newcomer');
  if (b.ok) assert.ok(chooseStory(w, (b as any).data.id, 'yes', 'main').ok);
  assert.ok(audit(w).ok);
});
