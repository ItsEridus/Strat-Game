// Headless world run for balance checks: `npm run sim -- [days] [seed]`.
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { refPrice } from '../src/sim/market';
import { summarize } from './summary';

registerSystems();
const days = Number(process.argv[2] ?? 30);
const seed = Number(process.argv[3] ?? 7);
const w = generateWorld(seed, 'Tester', 0);
const t0 = Date.now();
for (let d = 0; d < days; d++) {
  advance(w, DAY, false);
  const a = audit(w);
  if (!a.ok) { console.error('AUDIT FAIL day', d, JSON.stringify(a.problems.slice(0, 10))); process.exit(1); }
  if (d % 10 === 9 || d === days - 1) {
    const n = w.nations[0];
    console.log(`day ${Math.floor(w.time / DAY)} | ${summarize(w)} | N0 food1 ${refPrice(w, 0, 'food:1')} fx ${n.fxAnchor} pres ${w.citizens[n.president!]?.name} appr ${Math.round(n.approval)} tax ${n.taxes.work}/${n.taxes.vat} bld ${w.regions.reduce((s, r) => s + r.bld.hospital + r.bld.fields + r.bld.industrial + r.bld.base, 0)}`);
  }
}
const laws = Object.values(w.proposals);
console.log(`laws: ${laws.filter((p) => p.status === 'passed').length} passed, ${laws.filter((p) => p.status === 'failed').length} failed, ${laws.filter((p) => p.status === 'open').length} open; elections done ${Object.values(w.elections).filter((e) => e.done).length}; projects done ${Object.values(w.projects).filter((p) => p.done).length}/${Object.values(w.projects).length}`);
console.log(w.log.filter((e) => ['election', 'law', 'construction', 'party'].includes(e.type)).slice(-12).map((e) => '  ' + e.text).join('\n'));
console.log(`ok in ${Date.now() - t0}ms`);
