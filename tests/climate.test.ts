import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { climateCommitment, climateOf, climateYield, emissionsOf, hazardFactor, transitionRate, warming } from '../src/sim/climate';
import { normals } from '../src/sim/weather';
import { statisticalSkip } from '../src/sim/statYear';

registerSystems();
const fresh = (seed = 3301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('climate: emissions, temperature, the climate agreement and its effects', () => {
  const w = fresh();
  advance(w, DAY, false);
  const cn = by(w, 'CHN'), us = by(w, 'USA'), gb = by(w, 'GBR');
  assert.ok(emissionsOf(w, cn) > emissionsOf(w, us) && emissionsOf(w, us) > emissionsOf(w, gb));
  assert.equal(climateOf(w).temp, 1.3);
  const r = w.regions.find((x: any) => x.owner === gb.id)!;
  const t0 = normals(w, r.id, 180).t;
  const y0 = climateYield(w, 'tropical');
  climateOf(w).temp = 2.3; // a degree warmer than 2025
  assert.ok(Math.abs(warming(w) - 1) < 1e-9);
  assert.ok(normals(w, r.id, 180).t > t0, 'warmer weather');
  assert.ok(hazardFactor(w, 'hurricane') > 1.2 && hazardFactor(w, 'earthquake') === 1);
  assert.ok(climateYield(w, 'tropical') < y0 && climateYield(w, 'subarctic') > 1);
  climateOf(w).temp = 1.3;
  // A year on: the Paris Agreement exists, without the United States; the temperature has risen.
  statisticalSkip(w, w.time + 400 * DAY);
  const paris = Object.values(w.treaties ?? {}).find((t: any) => t.kind === 'climate');
  assert.ok(paris && !paris.parties.includes(us.id) && paris.parties.includes(gb.id));
  assert.ok(climateOf(w).temp > 1.3 && climateOf(w).hist.length >= 1);
  if (climateCommitment(w, gb) > 0) assert.ok(transitionRate(w, gb) > transitionRate(w, us));
  assert.ok(audit(w).ok);
});
