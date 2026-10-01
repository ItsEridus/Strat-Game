import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { agentQuality, coverFactor, defect, motiveFor, placementOf } from '../src/sim/collection';
import { collectionQuality, estimateOf } from '../src/sim/beliefs';
import { doDiplomacy, dipOf } from '../src/sim/diplomacyActions';

registerSystems();
const fresh = (seed = 1301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('an agent in the cabinet is worth far more than a clerk, and sees past counter-intelligence', () => {
  const w = fresh();
  advance(w, DAY, false);
  const ru = by(w, 'RUS'), gb = by(w, 'GBR');
  const people = census(w).all.filter((c) => c.nation === gb.id && !c.player);
  const minister = people.find((c) => Object.values(gb.cabinet).includes(c.id)) ?? people[0];
  if (!Object.values(gb.cabinet).includes(minister.id)) gb.cabinet.economy = minister.id;
  const clerk = people.find((c) => c.id !== minister.id && placementOf(w, c).weight === 0.01)!;
  assert.ok(placementOf(w, minister).weight > placementOf(w, clerk).weight * 10);
  const q0 = collectionQuality(w, ru, gb);
  minister.sec.asset = ru.id; minister.sec.motive = motiveFor(w, minister, ru);
  assert.ok(agentQuality(w, ru, gb) >= 0.15);
  assert.ok(collectionQuality(w, ru, gb) > q0 + 0.1);
});

test('expelling diplomats strips the stations of their cover', () => {
  const w = fresh(1302);
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN');
  assert.ok(coverFactor(w, us, cn) > 1);
  dipOf(cn).capital = 100;
  assert.ok(doDiplomacy(w, cn, 'expel', { target: us.id }).ok);
  assert.ok(coverFactor(w, us, cn) < 1 && coverFactor(w, cn, us) < 1);
});

test("a defector changes sides, and the rival's picture sharpens at once", () => {
  const w = fresh(1303);
  advance(w, DAY, false);
  const ru = by(w, 'RUS'), us = by(w, 'USA');
  const officer = census(w).all.find((c) => c.nation === ru.id && !c.player)!;
  officer.sec.agency = ru.id;
  const e = estimateOf(w, us, ru);
  e.bias.mil = 0.6;
  const net0 = us.agency.network[ru.id] ?? 0;
  defect(w, officer, us);
  assert.equal(officer.nation, us.id);
  assert.equal(officer.sec.agency, null);
  assert.ok(Math.abs(e.bias.mil) < 0.45, 'the debriefing corrects the misperception');
  assert.ok((us.agency.network[ru.id] ?? 0) >= net0 + 15);
  assert.ok(w.defections!.length === 1);
  assert.ok(audit(w).ok);
});
