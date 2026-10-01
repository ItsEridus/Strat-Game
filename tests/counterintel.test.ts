import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { collectionQuality, estimateOf, rawQuality, refresh } from '../src/sim/beliefs';
import { domesticFallout, favouredParty, interferenceBonus } from '../src/sim/counterIntel';
import { orgOf } from '../src/sim/intelOrg';

registerSystems();
const fresh = (seed = 1401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test("Five Eyes partners see through each other's eyes", () => {
  const w = fresh();
  advance(w, DAY, false);
  const ca = by(w, 'CAN'), us = by(w, 'USA'), cn = by(w, 'CHN'), mx = by(w, 'MEX');
  assert.ok(rawQuality(w, us, cn) > rawQuality(w, ca, cn));
  assert.ok(collectionQuality(w, ca, cn) >= rawQuality(w, us, cn) * 0.85 - 1e-9, 'Canada borrows the US picture');
  assert.ok(collectionQuality(w, mx, cn) < collectionQuality(w, ca, cn), 'Mexico has no such partner');
});

test('a turned agent feeds the handler a false picture', () => {
  const w = fresh(1402);
  advance(w, DAY, false);
  const ru = by(w, 'RUS'), gb = by(w, 'GBR');
  const mole = census(w).all.find((c) => c.nation === gb.id && !c.player)!;
  gb.cabinet.economy = mole.id;
  mole.sec.asset = ru.id; mole.sec.doubled = gb.id;
  const e = estimateOf(w, ru, gb);
  e.bias.mil = 0; e.bias.hostile = 0;
  refresh(w, ru, gb, 1);
  assert.ok(e.bias.mil > 0.03 && e.bias.hostile < -3, `Britain looks stronger and friendlier than it is (${e.bias.mil}, ${e.bias.hostile})`);
});

test('in a free country, exposed covert action costs the government at home', () => {
  const w = fresh(1403);
  advance(w, DAY, false);
  const gb = by(w, 'GBR');
  const a0 = gb.approval, b0 = gb.agency.budget;
  for (let i = 0; i < 10; i++) domesticFallout(w, gb, 'sabotage against someone');
  assert.ok(gb.approval < a0, 'approval falls');
  assert.ok(gb.agency.budget <= b0);
  assert.ok(w.log.some((e) => /Scandal at home/.test(e.text)));
  void orgOf;
});

test("election interference backs the sponsor's friends at the polls", () => {
  const w = fresh(1404);
  advance(w, DAY, false);
  const us = by(w, 'USA'), mx = by(w, 'MEX');
  const party = favouredParty(w, us, mx);
  assert.ok(party != null);
  mx.interference = { by: us.id, party: party!, until: w.time + 10 * DAY };
  assert.ok(interferenceBonus(w, mx, party) > 0);
  assert.equal(interferenceBonus(w, mx, -1), 0);
  assert.ok(audit(w).ok);
});
