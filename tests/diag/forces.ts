// Armed forces diagnostics over N days.
import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { audit } from '../../src/engine/ledger';
import { DAY } from '../../src/engine/clock';
registerSystems();
const w = generateWorld(Number(process.argv[3] ?? 7), 'T', 0);
const days = Number(process.argv[2] ?? 60);
const t0 = Date.now();
const f0 = Object.keys(w.forces).length;
console.log('genesis formations', f0, Object.values(w.forces).reduce((m, f) => { m[f.branch] = (m[f.branch] ?? 0) + 1; return m; }, {} as Record<string, number>));
for (let d = 0; d < days; d++) {
  advance(w, DAY, false);
  if ((d + 1) % 15 === 0) {
    const fs = Object.values(w.forces);
    const avg = (k: 'strength' | 'equipment' | 'readiness' | 'morale') => (fs.reduce((s, f) => s + f[k], 0) / fs.length).toFixed(0);
    const wb = Object.values(w.battles).filter((b) => b.kind === 'war');
    const fd = wb.reduce((s, b) => s + (b.forceDmg?.a ?? 0) + (b.forceDmg?.d ?? 0), 0);
    const all = wb.reduce((s, b) => s + b.rounds.reduce((x, r) => x + r.a + r.d, 0), 0);
    const enl = Object.values(w.citizens).filter((c) => c.mil.branch);
    console.log(`day ${d + 1}: formations ${fs.length} str ${avg('strength')} eq ${avg('equipment')} ready ${avg('readiness')} morale ${avg('morale')} | commanded ${fs.filter((f) => f.commander != null).length} | wars ${Object.values(w.wars).filter((x) => x.status === 'active').length} battles ${wb.length} force dmg share ${all ? ((fd / all) * 100).toFixed(0) : 0}% amphib ${w.log.filter((e) => /amphibious/.test(e.text)).length} naval ${w.navalLog.length} blockaded ${w.regions.filter((r) => r.blockade != null).length} | enlisted ${enl.length} top rank ${Math.max(0, ...enl.map((c) => c.mil.rank))} chiefs ${w.nations.filter((n) => n.defense.chief != null).length} | alert avg ${(w.nations.reduce((s, n) => s + n.alert, 0) / w.nations.length).toFixed(1)} treas ${(w.nations.reduce((s, n) => s + (n.wallet[n.cur] ?? 0), 0) / 100).toFixed(0)}`);
  }
}
console.log('stocks US', JSON.stringify(Object.fromEntries(Object.entries(w.nations[0].inv).filter(([k]) => /wg|wa|oil|iron/.test(k)))));
console.log(w.log.filter((e) => e.type === 'military' || /Naval|amphibious|destroyed/.test(e.text)).slice(-10).map((e) => e.text).join('\n'));
console.log('audit', audit(w).ok, audit(w).problems.slice(0, 3), `${Date.now() - t0}ms`);
