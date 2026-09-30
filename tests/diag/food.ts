import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
registerSystems();
const w = generateWorld(52, 'T', 0, { citizensPerNation: 24 });
for (let d = 0; d < 12; d++) {
  const per = w.nations.map((n) => Object.values(w.listings).filter((l) => l.market === n.id && l.item === 'food:1').reduce((s, l) => s + l.qty, 0));
  const cos = w.nations.map((n) => Object.values(w.companies).filter((c) => c.industry === 'food' && w.regions[c.region].owner === n.id).map((c) => `${c.workers.length}w/${c.inv['food:' + c.q] ?? 0}/${c.inv.grain ?? 0}g`).join(' '));
  console.log(d, per.join(','), '| USA food cos', cos[0]);
  advance(w, DAY);
}
