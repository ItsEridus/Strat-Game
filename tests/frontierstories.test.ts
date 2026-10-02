import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { chooseStory, triggerStory } from '../src/sim/story';
import { capsOf } from '../src/sim/strategic';
import { postsIn } from '../src/sim/services';
import { spaceOf } from '../src/sim/space';
import { exposureOf } from '../src/sim/automation';

registerSystems();
const fresh = (seed = 3001) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('frontier stories: the breakthrough, the machines are coming, and a launch window', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  // The breakthrough: a researcher in a national laboratory.
  p.post = { kind: 'research', region: p.home, grade: 2, since: w.time, promoted: w.time, shifts: 0, lastDay: 0 };
  const a = triggerStory(w, 'tech.breakthrough');
  assert.ok(a.ok, a.msg);
  const fame = p.sec.fame;
  assert.ok(chooseStory(w, (a as any).data.id, 'publish', 'main').ok);
  assert.ok(p.sec.fame > fame);
  // The machines are coming: a routine job in a country with robotics.
  n.techs = { ...(n.techs ?? {}), robotics: w.time };
  delete p.post;
  const co = Object.values(w.companies).find((x) => w.regions[x.region].owner === n.id && ['wg', 'materials', 'clothing'].includes(x.industry));
  if (co) {
    p.job = co.id; if (!co.workers.includes(p.id)) co.workers.push(p.id);
    if (exposureOf(w, p) >= 0.3) {
      const m = triggerStory(w, 'tech.machines');
      assert.ok(m.ok, m.msg);
      assert.ok(chooseStory(w, (m as any).data.id, 'retrain', 'main').ok);
      assert.ok(p.flags.retraining != null);
    }
    co.workers = co.workers.filter((x) => x !== p.id); p.job = null;
  }
  // A launch window: an astronaut in a country that launches its own crews.
  spaceOf(n).launcher = true;
  p.post = { kind: 'astronaut', region: p.home, grade: 2, since: w.time, promoted: w.time, shifts: 0, lastDay: 0 };
  const b = triggerStory(w, 'space.launch');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'go', 'main').ok);
  assert.equal(p.flags.spaceflights, 1);
  // Astronaut posts exist only where crews launch at home.
  spaceOf(n).launcher = false;
  assert.equal(postsIn(w, p.home, 'astronaut'), 0);
  void capsOf;
  advance(w, DAY, false);
  assert.ok(audit(w).ok);
});
