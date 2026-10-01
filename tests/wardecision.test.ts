import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { bestWarCase, warCase } from '../src/sim/warDecision';
import { tiesOfPair } from '../src/sim/relations';
import { estimateOf } from '../src/sim/beliefs';

registerSystems();
const fresh = (seed = 1601) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('in the world of 2025 almost no government finds a war worth starting', () => {
  const w = fresh();
  advance(w, DAY, false);
  const keen = w.nations.filter((n: any) => bestWarCase(w, n));
  assert.ok(keen.length <= 2, keen.map((n: any) => n.iso).join(','));
});

test('a grievance, a weak neighbour, trouble at home and a closed press make war tempting; nuclear deterrence stops it', () => {
  const w = fresh(1602);
  advance(w, DAY, false);
  const ar = by(w, 'ARG'), br = by(w, 'BRA'), us = by(w, 'USA'), mx = by(w, 'MEX');
  const base = warCase(w, ar, br).value;
  tiesOfPair(w, ar, br).grievance = 90;
  ar.approval = 15;
  ar.relations[br.id].score = -70;
  estimateOf(w, ar, br).bias.mil = -0.7; // Argentina's intelligence thinks Brazil is weak
  const tempted = warCase(w, ar, br);
  assert.ok(tempted.value > base + 0.3, `${base} → ${tempted.value}`);
  assert.ok(tempted.gains.some(([k]) => k === 'a distraction from trouble at home'));
  // Against a nuclear power the calculation collapses.
  tiesOfPair(w, mx, us).grievance = 90;
  mx.approval = 15;
  const c = warCase(w, mx, us);
  assert.ok(c.costs.some(([k, v]) => k === 'nuclear deterrence' && v >= 2));
  assert.ok(c.value < 0);
});
