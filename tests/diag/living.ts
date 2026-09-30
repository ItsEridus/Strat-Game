// Diagnostics for law & order, intelligence and the dynamic world after N days.
import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { audit } from '../../src/engine/ledger';
import { DAY } from '../../src/engine/clock';
registerSystems();
const w = generateWorld(Number(process.argv[3] ?? 7), 'T', 0);
const days = Number(process.argv[2] ?? 40);
const t0 = Date.now();
for (let d = 0; d < days; d++) {
  advance(w, DAY, false);
  if ((d + 1) % 10 === 0) {
    const crime = w.regions.map((r) => r.crime), police = w.regions.map((r) => r.police), unrest = w.regions.map((r) => r.unrest);
    const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
    const cases = Object.values(w.cases);
    const jailed = Object.values(w.citizens).filter((c) => c.sec.jailUntil > w.time).length;
    const ops = Object.values(w.ops);
    const by = (k: string) => ops.filter((o) => o.status === k).length;
    const crises = Object.values(w.crises).filter((c) => c.status === 'active').map((c) => c.kind);
    const treas = w.nations.reduce((s, n) => s + (n.wallet[n.cur] ?? 0), 0) / 100;
    console.log(`day ${d + 1}: crime ${avg(crime)} (max ${Math.max(...crime).toFixed(0)}) police ${avg(police)} unrest ${avg(unrest)} | synd ${Object.keys(w.syndicates).length} members ${Object.values(w.syndicates).reduce((s, x) => s + x.members.length, 0)} | cases open ${cases.filter((c) => c.status === 'open').length} closed ${cases.filter((c) => c.status === 'closed').length} jailed ${jailed} cops ${Object.values(w.citizens).filter((c) => c.sec.police != null).length} | ops ok ${by('success')} fail ${by('failed')} exp ${by('exposed')} act ${by('active')} agents ${Object.values(w.citizens).filter((c) => c.sec.agency != null).length} assets ${Object.values(w.citizens).filter((c) => c.sec.asset != null).length} | crises ${crises.join(',')} | cycle ${w.econ.cycle.toFixed(2)} ${w.econ.phase} | citizens ${Object.keys(w.citizens).length} treas ${treas.toFixed(0)}`);
  }
}
const outcomes: Record<string, number> = {};
for (const c of Object.values(w.cases)) if (c.outcome) { const k = c.outcome.split(':')[0]; outcomes[k] = (outcomes[k] ?? 0) + 1; }
console.log('case outcomes', outcomes, 'goals', Object.values(w.citizens).reduce((m, c) => { const k = c.sec.goal?.kind ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>));
console.log('syndicates', Object.values(w.syndicates).map((s) => `${s.name} [${w.nations[s.nation].name}] str ${s.strength.toFixed(0)} turf ${s.turf.length} rackets ${Object.keys(s.rackets).length}`).join(' | '));
console.log('recent', w.log.slice(-15).map((e) => e.text).join('\n  '));
console.log('audit', audit(w).ok, audit(w).problems.slice(0, 3), `${Date.now() - t0}ms`);
