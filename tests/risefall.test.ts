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
import { createState } from '../src/sim/secession';

registerSystems();
const fresh = (seed = 2501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('rise and fall stories: the night of the coup, the referendum and a new flag', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const home = w.nations[p.nation];
  // A coup.
  const officer = census(w).all.find((c) => c.nation === home.id && !c.player)!;
  home.lastCoup = { t: w.time, ok: true, leader: officer.id };
  const a = triggerStory(w, 'rise.coup');
  assert.ok(a.ok, a.msg);
  const infl = p.influence;
  assert.ok(chooseStory(w, (a as any).data.id, 'square', 'main').ok);
  assert.ok(p.influence > infl);
  // A referendum campaign at home.
  const r = w.regions[p.home];
  r.indepMovement = w.time; r.indep = 44;
  const b = triggerStory(w, 'rise.referendum');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'yes', 'main').ok);
  assert.ok((r.indep ?? 0) > 44);
  // Independence: a new flag over the player's home.
  if (r.id !== home.capital) {
    const s = createState(w, home, [r.id], 'referendum');
    const c = triggerStory(w, 'rise.flag');
    assert.ok(c.ok, c.msg);
    assert.ok(chooseStory(w, (c as any).data.id, 'celebrate', 'main').ok);
    assert.ok(s.founded != null);
  }
  advance(w, 2 * DAY, false);
  assert.ok(audit(w).ok);
});
