// Arsenal calibration (1.8): thirty strategic years of defence R&D and procurement at each
// country's real budget, plus one country that stops funding its forces. Prints how
// generations, frontiers and ages move, and how many programmes finish, slip or die.
// Usage: node tests/run.mjs --script tests/arsenalcal.ts [years] [seed]
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { arsenalMonth, arsenalOf, splitOf } from '../src/sim/arsenal';
import { defenceBaseline, defenceShare } from '../src/data/arsenal';
import { c as cur } from '../src/engine/money';
registerSystems();
const years = Number(process.argv[2] ?? 30);
const w = generateWorld(Number(process.argv[3] ?? 11), 'T', 0, { citizensPerRegion: 1 });
const neglect = w.nations.find((n) => n.iso === 'ARG')!;
const rev = (iso: string) => cur(200) * (defenceBaseline(iso).revenue / 30); // a stand-in for revenue: only ratios matter
const row = (y: number) => {
  const cells = w.nations.map((n) => { const a = arsenalOf(w, n); return `${n.iso} ${a.fighters.gen.toFixed(1)}/${a.fighters.frontier} ${Math.round(a.fighters.age)}y`; });
  console.log(`year ${String(y).padStart(2)}: ${cells.join(' | ')}`);
};
for (const n of w.nations) n.stats.revHist = [rev(n.iso)];
row(0);
for (let m = 1; m <= years * 12; m++) {
  w.time += 30 * 1440;
  for (const n of w.nations) {
    const s = splitOf(n);
    const base = rev(n.iso) * (n === neglect ? 0 : defenceShare(n.iso)) * 30;
    n.defense.month = { procurement: Math.round(base * s.procurement * 0.7), rd: Math.round(base * s.rd), days: 30 };
    arsenalMonth(w, n);
  }
  if (m % 120 === 0) row(m / 12);
}
for (const n of w.nations) {
  const p = n.programmes ?? [];
  const done = p.filter((x) => x.status === 'done');
  const avgYears = done.length ? done.reduce((t, x) => t + (x.elapsed ?? 0), 0) / done.length / 12 : 0;
  const fighters = done.filter((x) => x.cls === 'fighters').map((x) => ((x.elapsed ?? 0) / 12).toFixed(0));
  console.log(n.iso, 'done', done.length, `(avg ${avgYears.toFixed(1)}y; fighters ${fighters.join(',') || '-'})`, 'cancelled', p.filter((x) => x.status === 'cancelled').length, 'running', p.filter((x) => x.status === 'running').length, 'orders', (n.armsOrders ?? []).length, 'avg overrun', done.length ? (done.reduce((t, x) => t + x.overrun, 0) / done.length * 100).toFixed(0) + '%' : '-');
}
