// State government finances after N days: treasury, revenue and infrastructure per nation.
import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { audit } from '../../src/engine/ledger';
import { DAY } from '../../src/engine/clock';
registerSystems();
const w = generateWorld(Number(process.argv[3] ?? 7), 'T', 0);
const days = Number(process.argv[2] ?? 40);
for (let d = 0; d < days; d++) advance(w, DAY, false);
for (const n of w.nations) {
  const g = w.govs.filter((s) => s && w.regions[s.region].owner === n.id).map((s) => s!);
  const tre = g.reduce((t, s) => t + (s.wallet[s.cur] ?? 0), 0) / 100;
  const rev = g.reduce((t, s) => t + s.stats.revHist.slice(-7).reduce((a, b) => a + b, 0), 0) / 700;
  const dev = g.reduce((t, s) => t + s.dev, 0);
  const appr = g.reduce((t, s) => t + s.approval, 0) / (g.length || 1);
  console.log(`${n.name.padEnd(15)} govs ${String(g.length).padStart(3)} treasury ${tre.toFixed(0).padStart(6)} ${n.cur} rev/day ${rev.toFixed(1).padStart(6)} dev ${dev} appr ${appr.toFixed(0)}% | national ${((n.wallet[n.cur] ?? 0) / 100).toFixed(0)} hh ${((w.households[n.id].wallet[n.cur] ?? 0) / 100).toFixed(0)}`);
}
console.log('audit', audit(w).ok);
