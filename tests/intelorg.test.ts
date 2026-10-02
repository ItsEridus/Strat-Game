import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { dirEdge, dirStrength, joinDirectorate, noteLesson, orgMonth, orgOf, prioritise, dirOfAgent } from '../src/sim/intelOrg';
import { joinAgency } from '../src/sim/intel';

registerSystems();
const fresh = (seed = 1101) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('services start from the real ones: the US leads in signals and satellites, Russia in covert action', () => {
  const w = fresh();
  const us = by(w, 'USA'), mx = by(w, 'MEX'), ru = by(w, 'RUS'), jp = by(w, 'JPN');
  assert.ok(dirStrength(us, 'sigint') > 90 && dirStrength(mx, 'sigint') < 40);
  assert.ok(dirStrength(ru, 'covert') > dirStrength(jp, 'covert') + 50);
  assert.ok(dirEdge(us, 'milintel') > 0 && dirEdge(mx, 'milintel') < 0, 'imagery runs reconnaissance');
});

test('money builds a service up and cuts run it down, slowly; failures teach', () => {
  const w = fresh(1102);
  advance(w, DAY, false);
  const de = by(w, 'DEU'), br = by(w, 'BRA');
  orgMonth(w); // the services take stock of their starting budgets
  const de0 = dirStrength(de, 'humint'), br0 = dirStrength(br, 'humint');
  de.agency.budget = 0; br.agency.budget = 0.08;
  for (let m = 0; m < 24; m++) orgMonth(w);
  assert.ok(dirStrength(de, 'humint') < de0 - 5, `cut: ${de0} → ${dirStrength(de, 'humint')}`);
  assert.ok(dirStrength(br, 'humint') > br0 + 5, `funded: ${br0} → ${dirStrength(br, 'humint')}`);
  assert.ok(dirStrength(de, 'humint') > de0 * 0.4, 'but a service does not vanish in two years');
  // Lessons from an exposure speed up improvement.
  const a = by(w, 'ARG'), z = by(w, 'ZAF');
  noteLesson(a, 'covert', 3);
  const a0 = dirStrength(a, 'covert'), z0 = dirStrength(z, 'covert');
  orgMonth(w);
  assert.ok(dirStrength(a, 'covert') - a0 > dirStrength(z, 'covert') - z0, 'the service that failed learns faster');
});

test('the director divides the budget; officers serve in a directorate', () => {
  const w = fresh(1103);
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  n.president = p.id;
  const before = orgOf(n).split.cyber;
  assert.ok(prioritise(w, p.id, n.id, 'cyber').ok);
  assert.ok(orgOf(n).split.cyber > before);
  assert.ok(Math.abs(Object.values(orgOf(n).split).reduce((a, b) => a + b, 0) - 1) < 0.01);
  n.president = null;
  p.sec.record.convictions = 0;
  p.influence = 1000;
  joinAgency(w, p);
  if (p.sec.agency != null) {
    assert.ok(joinDirectorate(w, p, dirOfAgent(p) === 'analysis' ? 'humint' : 'analysis').ok);
  }
  assert.ok(audit(w).ok);
});
