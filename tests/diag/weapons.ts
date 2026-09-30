import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { listingsFor, refPrice } from '../../src/sim/market';
registerSystems();
const w = generateWorld(7, 'T', 0);
advance(w, Number(process.argv[2] ?? 60) * DAY, false);
for (const n of w.nations) {
  const sol = Object.values(w.citizens).filter((c) => c.nation === n.id && c.persona === 'soldier');
  const wpn = sol.reduce((s, c) => s + Object.entries(c.inv).filter(([k]) => k.startsWith('wg')).reduce((a, [, v]) => a + v, 0), 0);
  const cash = sol.reduce((s, c) => s + (c.wallet[n.cur] ?? 0), 0) / Math.max(1, sol.length) / 100;
  const sup = [1, 2, 3].map((q) => `Q${q}:${listingsFor(w, n.id, `wg:${q}`).reduce((s, l) => s + l.qty, 0)}@${(refPrice(w, n.id, `wg:${q}`) ?? 0) / 100}`).join(' ');
  const units = Object.values(w.units).filter((u) => u.nation === n.id).map((u) => `${Math.round((u.wallet[n.cur] ?? 0) / 100)}c ${Object.values(u.inv).reduce((a, b) => a + b, 0)}i`).join(',');
  const makers = Object.values(w.companies).filter((c) => c.industry === 'wg' && w.regions[c.region].owner === n.id).map((c) => `${c.workers.length}/${c.offer?.slots ?? 0}${c.shortage ? '!' : ''}`).join(' ');
  console.log(`${n.name}: soldiers ${sol.length} weapons ${wpn} avg cash ${cash.toFixed(0)} | market ${sup} | units ${units} | makers ${makers}`);
}
console.log('flows', JSON.stringify(Object.fromEntries(Object.entries(w.stats.itemFlows).filter(([k]) => /combat|household|eaten|shift|manager|construction/.test(k)))));
let ga = [0, 0, 0], gg = [0, 0, 0];
for (const b of Object.values(w.battles)) { const t = b.airOnly ? ga : gg; t[0]++; t[1] += b.hits.a + b.hits.d; t[2] += b.weaponsUsed.a + b.weaponsUsed.d; }
console.log('air battles/hits/weapons', ga, 'ground', gg);
const byP: Record<string, number> = {};
for (const b of Object.values(w.battles)) for (const [id, v] of Object.entries(b.total)) { const p = w.citizens[Number(id)].persona; byP[p] = (byP[p] ?? 0) + v.a + v.d; }
console.log('damage by persona', byP);
