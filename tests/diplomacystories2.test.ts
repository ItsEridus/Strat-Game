import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { controller, player } from '../src/sim/query';
import { chooseStory, triggerStory } from '../src/sim/story';
import { tpOf } from '../src/sim/tradePolicy';
import { spheresOf } from '../src/sim/spheres';
import { bornYearsAgo } from '../src/sim/growth';
import { timeOfDate } from '../src/engine/calendar';

registerSystems();
const fresh = (seed = 3101) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('stories of diplomacy completed: tariffs at work, a hedging government courted, a call from New York', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  // A job at a firm whose exports meet a tariff.
  const co = Object.values(w.companies).find((x) => controller(w.regions[x.region]) === p.nation)!;
  p.job = co.id;
  const other = w.nations.find((x) => x.id !== p.nation && !x.exile)!;
  tpOf(other).tariffs[p.nation] = 25;
  const a = triggerStory(w, 'dip2.tariffs');
  assert.ok(a.ok, a.msg);
  assert.ok(chooseStory(w, (a as any).data.id, 'lobby', 'main').ok);
  // A hedging government, with the player in charge of its foreign policy.
  const n = w.nations[p.nation];
  const powers = spheresOf(w).powers.filter((x) => x !== n.id);
  spheresOf(w).hedging[n.id] = [powers[0], powers[1]];
  n.cabinet.foreign = p.id;
  const b = triggerStory(w, 'dip2.courted');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'hedge', 'main').ok);
  // The call from New York, for an eligible figure in the year of the election.
  delete n.cabinet.foreign;
  const nonPerm = w.nations.find((x) => x.iso === 'CAN')!;
  p.nation = nonPerm.id; p.born = bornYearsAgo(w, 55, 1); p.influence = 90;
  w.time = timeOfDate(2026, 3, 1);
  const c = triggerStory(w, 'dip2.sgcall');
  assert.ok(c.ok, c.msg);
  assert.ok(chooseStory(w, (c as any).data.id, 'stand', 'main').ok);
  assert.ok(w.intl?.sgCandidates?.includes(p.id));
  assert.ok(audit(w).ok);
});
