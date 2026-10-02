import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { listingsFor } from '../../src/sim/market';
registerSystems();
const w = generateWorld(7, 'T', 0);
for (let d = 0; d < 30; d++) advance(w, DAY, false);
for (const n of w.nations.slice(0, 5)) console.log(n.name, ['wg:1', 'wg:2', 'wa:1', 'wa:2', 'oil', 'iron', 'titanium'].map((k) => { const l = listingsFor(w, n.id, k); return `${k}:${l.reduce((s, x) => s + x.qty, 0)}@${l[0] ? (l[0].price / 100).toFixed(2) : '-'}`; }).join(' '), 'procure', JSON.stringify(n.procure));
