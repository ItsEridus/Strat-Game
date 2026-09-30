// Scale benchmark: node tests/run.mjs --script tests/diag/scale.ts [citizensPerRegion] [days]
import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { serialize } from '../../src/engine/save';
import { audit } from '../../src/engine/ledger';
registerSystems();
const cpn = Number(process.argv[2] ?? 24), days = Number(process.argv[3] ?? 3);
let t = performance.now();
const w = generateWorld(7, 'T', 0, { citizensPerRegion: cpn });
console.log(`citizens ${Object.keys(w.citizens).length}, companies ${Object.keys(w.companies).length}, gen ${(performance.now() - t).toFixed(0)}ms`);
for (let d = 0; d < days; d++) {
  t = performance.now();
  advance(w, DAY, false);
  console.log(`day ${d + 1}: ${(performance.now() - t).toFixed(0)}ms`);
}
t = performance.now();
const s = serialize(w);
console.log(`save ${(s.length / 1024).toFixed(0)}KB compressed-chars, ${(performance.now() - t).toFixed(0)}ms; raw ${(JSON.stringify(w).length / 1e6).toFixed(1)}MB; heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)}MB; audit ${audit(w).ok}`);
