import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
registerSystems();
const w = generateWorld(7, 'T', 0);
for (let d = 0; d < Number(process.argv[2] ?? 10); d++) advance(w, DAY, false);
const by: Record<string, any> = {};
for (const co of Object.values(w.companies)) {
  const k = co.industry;
  by[k] = by[k] || { n: 0, prod: 0, workers: 0, slots: 0, shortage: {} as Record<string, number>, stock: 0, funds: 0 };
  const b = by[k]; b.n++; b.prod += co.hist[co.hist.length - 1]?.produced ?? 0; b.workers += co.workers.length; b.slots += co.offer?.slots ?? 0;
  const s = co.shortage ?? 'ok'; b.shortage[s.slice(0, 40)] = (b.shortage[s.slice(0, 40)] ?? 0) + 1;
  b.funds += Math.round(Object.entries(co.wallet).filter(([a]) => a !== 'GOLD').reduce((x, [, v]) => x + v, 0) / 100);
}
console.log(JSON.stringify(by, null, 1));
