import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
registerSystems();
const w = generateWorld(7, 'T', 0);
for (let d = 0; d < 30; d++) advance(w, DAY, false);
for (const n of w.nations.slice(0, 6)) console.log(n.name, 'rev/day', (n.stats.revHist.slice(-7).reduce((a, b) => a + b, 0) / 700).toFixed(1), 'spend/day', (n.stats.spendHist.slice(-7).reduce((a, b) => a + b, 0) / 700).toFixed(1), 'treasury', ((n.wallet[n.cur] ?? 0) / 100).toFixed(0), 'wage', (Object.values(w.companies).filter((c) => c.offer).reduce((s, c) => s + c.offer!.wage, 0) / Object.values(w.companies).filter((c) => c.offer).length / 100).toFixed(1));
