import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { serialize, deserialize } from '../src/engine/save';
import { flyMission, orbitOf, reconBonus, satBonus, spaceCapability, spaceOf } from '../src/sim/space';
import { MISSIONS } from '../src/data/space';
import { power } from '../src/sim/forces';
import { collectionQuality } from '../src/sim/beliefs';
import { createState } from '../src/sim/secession';
import { baselineOf } from '../src/data/nationBaselines';

registerSystems();
const fresh = (seed = 2801) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('space: 2025 constellations, their effects, missions, and debris', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN'), ar = by(w, 'ARG');
  assert.ok(spaceOf(us).launcher && !spaceOf(ar).launcher);
  assert.equal(spaceOf(us).sats.nav, 100);
  assert.ok(spaceOf(cn).missions.station != null, 'China already has a station');
  assert.ok(spaceCapability(w, us) > spaceCapability(w, ar) * 2);
  // Satellites matter: blinding a country's satellites weakens it.
  const f = Object.values(w.forces).find((x) => x.nation === us.id)!;
  const p0 = power(w, f), q0 = collectionQuality(w, us, cn), r0 = reconBonus(us), s0 = satBonus(us);
  spaceOf(us).sats = { comms: 0, recon: 0, nav: 0 };
  assert.ok(power(w, f) < p0 && satBonus(us) < s0 && reconBonus(us) < r0);
  assert.ok(collectionQuality(w, us, cn) <= q0);
  // A prestige mission.
  const moon = MISSIONS.find((m) => m.id === 'moon')!;
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) ok = flyMission(w, cn, moon);
  assert.ok(ok && spaceOf(cn).missions.moon >= 0);
  // Constellations rebuild over months.
  const before = spaceOf(us).sats.comms;
  for (let i = 0; i < 3; i++) advance(w, 31 * DAY, false);
  assert.ok(spaceOf(us).sats.comms > before);
  assert.ok(orbitOf(w).debris >= 0);
  const w2 = deserialize(serialize(w));
  assert.ok(spaceOf(by(w2, 'CHN')).missions.moon >= 0);
  assert.ok(audit(w).ok);
});

test("a new state's economic weight is its share of the old country's people", () => {
  const w = fresh(2802);
  advance(w, DAY, false);
  const gb = by(w, 'GBR');
  const g0 = baselineOf('GBR').gdpShare;
  const sc = w.regions.find((r) => r.name === 'Scotland')!;
  const s = createState(w, gb, [sc.id], 'referendum');
  const a = baselineOf(s.iso).gdpShare, b = baselineOf('GBR').gdpShare;
  assert.ok(a > 0 && a < g0 * 0.5, `Scotland ${a} of ${g0}`);
  assert.ok(Math.abs(a + b - g0) < 1e-6, 'the parts add up to the whole');
  assert.ok(spaceOf(s).sats.comms === 0 && !spaceOf(s).launcher);
});
