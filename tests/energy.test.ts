import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { energyFactors, energyOf, energyPrice, importShare, mineralCutOff, opecPriceFactor } from '../src/sim/energy';
import { worldPrices } from '../src/sim/trade';

registerSystems();
const fresh = (seed = 601) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('real energy mixes and import dependence', () => {
  const w = fresh();
  assert.ok(energyOf(by(w, 'ZAF')).mix.coal > 0.8, 'South Africa runs on coal');
  assert.ok(energyOf(by(w, 'CAN')).mix.hydro > 0.5, 'Canada on hydro');
  assert.ok(energyOf(by(w, 'KOR')).mix.nuclear > 0.25);
  assert.equal(importShare(by(w, 'JPN'), 'oil'), 1, 'Japan imports all its oil');
  assert.equal(importShare(by(w, 'SAU'), 'oil'), 0);
});

test('an oil shock raises energy prices most where fuel is imported and burned', () => {
  const w = fresh(602);
  const jp = by(w, 'JPN'), ca = by(w, 'CAN');
  const before = { jp: energyPrice(w, jp), ca: energyPrice(w, ca) };
  worldPrices(w).oil.p *= 2;
  assert.ok(energyPrice(w, jp) - before.jp > (energyPrice(w, ca) - before.ca) * 2, 'importer with fossil power hit harder than hydro exporter');
});

test('depletion, OPEC+ and mineral embargoes', () => {
  const w = fresh(603);
  const gb = by(w, 'GBR');
  energyOf(gb).reserves.oil = 2;
  assert.ok(importShare(gb, 'oil') > 0.8, 'imports rise as the fields run dry');
  const oilCo = Object.values(w.companies).find((c) => c.industry === 'oil' && w.regions[c.region].owner === gb.id);
  if (oilCo) assert.ok(energyFactors(w, oilCo).some((f) => /Depleting/.test(f.label)));
  // OPEC+ cuts when oil is cheap.
  worldPrices(w).oil.p *= 0.5;
  w.opec = { quota: 1, hist: [] };
  const cn = by(w, 'CHN'), jp = by(w, 'JPN');
  cn.embargoes.push(jp.id);
  assert.match(mineralCutOff(w, jp, 'rareearths') ?? '', /Rare earth/);
  // Run into the next month so OPEC+ meets.
  advance(w, 35 * DAY, false);
  assert.ok((w.opec?.quota ?? 1) < 1, `OPEC+ quota ${w.opec?.quota}`);
  assert.ok(opecPriceFactor(w) > 1);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

import { foodOf, harvestIndex, selfSufficiency } from '../src/sim/food';
import { weatherOf } from '../src/sim/weather';
import { SERVICES } from '../src/sim/services';
import { preparedness } from '../src/sim/naturalHazards';

test('food security: bad harvests in a poor importer bring hunger; rich importers buy their way out', () => {
  const w = fresh(604);
  advance(w, 2 * DAY, false);
  const jp = by(w, 'JPN'), ind = by(w, 'IND'), ar = by(w, 'ARG');
  assert.ok(selfSufficiency(ar) > 2 && selfSufficiency(jp) < 0.5);
  // A disastrous season everywhere.
  const s = weatherOf(w);
  for (const r of w.regions) s.grow[r.id] = 0.7;
  assert.ok(harvestIndex(w, ind) < 0.75);
  // Run into a new month so the food balance is struck.
  advance(w, 32 * DAY, false);
  for (const r of w.regions) s.grow[r.id] = 0.7;
  advance(w, 31 * DAY, false);
  assert.ok(foodOf(jp).supply > foodOf(ind).supply || foodOf(ind).supply >= 0.95, `Japan ${foodOf(jp).supply}, India ${foodOf(ind).supply}`);
  assert.ok((w.econ.harvest ?? 1) < 1, 'poor exporter harvests raise the world grain price');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('emergency services and the weather service are careers; staffing raises preparedness', () => {
  const w = fresh(605);
  assert.ok(SERVICES.emergency.ladder.includes('Firefighter') && SERVICES.meteorology.ladder.includes('Meteorologist'));
  const n = w.nations[0];
  const rs = w.regions.filter((r) => r.owner === n.id);
  for (const r of rs) r.staff = { school: 1, clinic: 1, offices: 1, emergency: 0 };
  const low = preparedness(w, n);
  for (const r of rs) r.staff = { school: 1, clinic: 1, offices: 1, emergency: 1 };
  assert.ok(preparedness(w, n) > low);
});
