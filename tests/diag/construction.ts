import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { listingsFor, refPrice } from '../../src/sim/market';
registerSystems();
const w = generateWorld(7, 'T', 0);
advance(w, Number(process.argv[2] ?? 30) * DAY, false);
for (const p of Object.values(w.projects)) {
  const n = w.nations[p.nation];
  const sup = Object.keys(p.needMats).map((k) => `${k}:${listingsFor(w, n.id, k).reduce((s, l) => s + l.qty, 0)} best ${listingsFor(w, n.id, k)[0]?.price} ref ${refPrice(w, n.id, k)}`).join(' | ');
  console.log(n.name, p.type, p.done ? 'DONE' : '', 'mats', JSON.stringify(p.mats), '/', JSON.stringify(p.needMats), 'procure', JSON.stringify(n.procure), '|', sup);
}
for (const ind of ['oil', 'titanium']) {
  const cos = Object.values(w.companies).filter((c) => c.industry === ind);
  console.log(ind, cos.map((c) => `${w.nations[w.regions[c.region].owner].cur} ${c.workers.length}/${c.offer?.slots} wage ${c.offer?.wage} funds ${Object.values(c.wallet)[0]} stock ${c.inv[ind] ?? 0} auto ${c.auto.hire}`).join(' | '));
}
