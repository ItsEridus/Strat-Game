// Sky & ground calibration (1.9): a year of weather, hazards, energy and food in a small
// world. Prints disasters by kind and severity, deaths, harvest swings, energy prices,
// blackouts and food supply by country, to compare with EM-DAT, FAO and IEA base rates.
// Usage: node tests/run.mjs --script tests/naturecal.ts [days] [seed]
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance, lod } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { energyOf, energyPrice } from '../src/sim/energy';
import { foodOf } from '../src/sim/food';
registerSystems();
const days = Number(process.argv[2] ?? 365);
const w = generateWorld(Number(process.argv[3] ?? 21), 'T', 0, { citizensPerRegion: 1 });
lod.coarse = true;
const t0 = Date.now();
const harvests: Record<string, number[]> = {};
for (let d = 0; d < days; d += 30) {
  advance(w, Math.min(30, days - d) * DAY, false);
  for (const n of w.nations) (harvests[n.iso] ??= []).push(foodOf(n).harvest);
}
const natural = ['hurricane', 'earthquake', 'flood', 'wildfire', 'blizzard', 'drought', 'heatwave', 'eruption', 'tsunami'];
const cs = Object.values(w.crises).filter((c) => natural.includes(c.kind));
const by: Record<string, number[]> = {};
for (const c of cs) { (by[c.kind] ??= [0, 0, 0, 0, 0])[c.severity]++; }
console.log(`${days} days in ${((Date.now() - t0) / 1000).toFixed(0)}s; audit ${audit(w).ok ? 'ok' : 'FAIL'}`);
console.log('disasters', cs.length, 'deaths', cs.reduce((t, c) => t + (c.deaths ?? 0), 0).toLocaleString());
for (const [k, v] of Object.entries(by)) console.log(' ', k.padEnd(10), 'minor', v[1], 'severe', v[2], 'major', v[3], 'catastrophic', v[4]);
console.log('oil price ratio', (w.econ.world?.oil.p ?? 0).toFixed(5), 'OPEC quota', w.opec?.quota, 'exporters harvest', w.econ.harvest);
for (const n of w.nations) {
  const h = harvests[n.iso];
  console.log(n.iso, 'harvest', Math.min(...h).toFixed(2), '-', Math.max(...h).toFixed(2), 'food supply', foodOf(n).supply.toFixed(2), 'energy price', energyPrice(w, n).toFixed(2), 'blackout region-days', energyOf(n).blackouts + (energyOf(n).lastYear ?? 0));
}
