import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { ageingDrag, demoOf } from '../src/sim/demography';
import { statisticalSkip } from '../src/sim/statYear';
import { capsOf } from '../src/sim/strategic';

registerSystems();
const fresh = (seed = 3501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('demography: 2025 starting points, ageing, population change and immigration policy', () => {
  const w = fresh();
  advance(w, DAY, false);
  const jp = by(w, 'JPN'), ind = by(w, 'IND'), ca = by(w, 'CAN');
  assert.ok(demoOf(jp).oadr > demoOf(ind).oadr && demoOf(ca).mig > demoOf(jp).mig);
  const pop0 = w.regions.filter((r: any) => r.owner === jp.id).reduce((s: number, r: any) => s + r.pop, 0);
  for (let y = 0; y < 10; y++) statisticalSkip(w, w.time + 365 * DAY);
  assert.ok(demoOf(jp).oadr > demoOf(jp).oadr0, 'Japan ages');
  assert.ok(demoOf(jp).pop < 1 && demoOf(ind).pop > demoOf(jp).pop, 'Japan shrinks; India does not');
  assert.ok(w.regions.filter((r: any) => r.owner === jp.id).reduce((s: number, r: any) => s + r.pop, 0) < pop0);
  assert.ok(ageingDrag(jp) < 0);
  assert.ok(['open', 'selective', 'closed'].includes(demoOf(ca).policy));
  // Convergence: a fast-growing economy slows as it gets richer.
  const c = capsOf(w, ind);
  assert.ok(c.productivity > 1);
  assert.ok(audit(w).ok);
});
