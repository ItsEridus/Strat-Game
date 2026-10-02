import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { hazardArrives, heavyTail, preparedness, strike } from '../src/sim/naturalHazards';
import { triggerStory } from '../src/sim/story';
import { player } from '../src/sim/query';

registerSystems();
const fresh = (seed = 501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('severity is heavy-tailed: mostly minor, a few catastrophic', () => {
  const w = fresh();
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < 4000; i++) counts[heavyTail(w).level]++;
  assert.ok(counts[1] > 2400, `minor ${counts[1]}`);
  assert.ok(counts[3] + counts[4] > 150 && counts[4] < 250, `major ${counts[3]}, catastrophic ${counts[4]}`);
});

test('preparedness saves lives: the same quake kills more where buildings are weaker', () => {
  const w = fresh(502);
  const jp = w.nations.find((n) => n.iso === 'JPN')!, ind = w.nations.find((n) => n.iso === 'IND')!;
  assert.ok(preparedness(w, jp) > preparedness(w, ind) + 0.3);
  const rj = w.regions.filter((r) => r.owner === jp.id).sort((a, b) => b.pop - a.pop)[0];
  const ri = w.regions.filter((r) => r.owner === ind.id).sort((a, b) => b.pop - a.pop)[0];
  const pj = rj.pop, pi = ri.pop;
  strike(w, 'earthquake', 'Earthquake', [rj.id], 2, 2.5, 0);
  strike(w, 'earthquake', 'Earthquake', [ri.id], 2, 2.5, 0);
  assert.ok((pi - ri.pop) / pi > ((pj - rj.pop) / pj) * 1.3, 'higher death rate where less prepared');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('storms are forecast a day ahead; the warning story lets you shelter or leave', () => {
  const w = fresh(503);
  const p = player(w);
  const r = p.loc;
  hazardArrives(w, 'hurricane', 'Hurricane', [r]);
  const mine = (w.warnings ?? []).find((x) => x.kind === 'hurricane' && x.regions.includes(r))!;
  assert.ok(mine, 'a warning, not yet the impact');
  assert.ok(triggerStory(w, 'nature.warning').ok);
  advance(w, 2 * DAY, false);
  assert.ok(!(w.warnings ?? []).includes(mine), 'the storm arrived');
  assert.ok(Object.values(w.crises).some((c) => c.kind === 'hurricane' && c.regions.includes(r)));
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
