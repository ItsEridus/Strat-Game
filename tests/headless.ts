// Headless world run for balance checks: `npm run sim -- [days] [seed]`.
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { listingsFor, refPrice } from '../src/sim/market';
import { midRate } from '../src/sim/fx';
import { summarize } from './summary';

registerSystems();
const days = Number(process.argv[2] ?? 30);
const seed = Number(process.argv[3] ?? 7);
const w = generateWorld(seed, 'Tester', 0);
const t0 = Date.now();
for (let d = 0; d < days; d++) {
  advance(w, DAY, false);
  const a = audit(w);
  if (!a.ok) { console.error('AUDIT FAIL day', d, a.problems.slice(0, 10)); process.exit(1); }
  if (d % 5 === 4 || d === days - 1) {
    const n = w.nations[0];
    const food = refPrice(w, 0, 'food:1');
    console.log(`day ${Math.floor(w.time / DAY)} | ${summarize(w)} | N0 food1 ${food} supply ${listingsFor(w, 0, 'food:1').reduce((s, l) => s + l.qty, 0)} fx ${midRate(w, n.cur)}`);
  }
}
console.log(`ok in ${Date.now() - t0}ms`);
