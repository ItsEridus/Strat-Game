// Life calibration: `node tests/run.mjs --script tests/lifecal.ts [days] [seed] [perRegion]`.
// Prints the life systems' vital statistics every 30 days, for plausibility checks.
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { rank } from '../src/data/education';

registerSystems();
const days = Number(process.argv[2] ?? 180);
const seed = Number(process.argv[3] ?? 7);
const per = Number(process.argv[4] ?? 2);
const w = generateWorld(seed, 'Tester', 0, { citizensPerRegion: per });
const pct = (a: number, b: number) => `${Math.round((a / Math.max(1, b)) * 100)}%`;
const t0 = Date.now();
const treas0 = w.nations.map((n) => n.wallet[n.cur] ?? 0);
for (let d = 1; d <= days; d++) {
  advance(w, DAY, false);
  if (d % 30 && d !== days) continue;
  const a = audit(w);
  const all = census(w).all;
  const adults = all.filter((c) => ageOf(w, c) >= 18);
  const working = adults.filter((c) => !c.retired && !c.edu?.enrolled && ageOf(w, c) < 65);
  const employed = working.filter((c) => c.job != null || c.post);
  const loans = Object.values(w.loans ?? {});
  const treas = w.nations.map((n, i) => (n.wallet[n.cur] ?? 0) / Math.max(1, treas0[i]));
  console.log([
    `day ${d}`, `people ${all.length}`, `employed ${pct(employed.length, working.length)}`, `retired ${pct(adults.filter((c) => c.retired).length, adults.length)}`,
    `own ${pct(adults.filter((c) => c.dwelling?.kind === 'own').length, adults.length)}`, `loans ${loans.length} (arrears ${loans.filter((l) => l.missed > 0).length})`,
    `ill ${pct(all.filter((c) => c.conditions?.length).length, all.length)}`, `students ${all.filter((c) => c.edu?.enrolled).length}`, `tertiary ${pct(adults.filter((c) => rank(c.edu?.level ?? 'school') >= 2).length, adults.length)}`,
    `posts ${all.filter((c) => c.post).length}`, `pets ${w.life.pets.filter((p) => !p.gone).length}`, `orphans ${w.life.orphans.length}`,
    `happy ${Math.round(all.reduce((t, c) => t + (c.life?.happiness ?? 50), 0) / all.length)}`, `treasury min ${treas.reduce((m, x) => Math.min(m, x), 9).toFixed(2)}x`,
    `firms ${Object.keys(w.companies).length} (hiring ${Object.values(w.companies).filter((c) => c.offer && c.offer.slots > c.workers.length).length}, losing ${Object.values(w.companies).filter((c) => c.hist.slice(-7).reduce((t, h) => t + h.profit, 0) < 0).length})`,
    `debt max ${Math.max(...w.nations.map((n) => (n.debt ?? 0) / Math.max(1, n.stats.revHist.reduce((x, y) => x + y, 0) / Math.max(1, n.stats.revHist.length) * 365))).toFixed(2)}y (${w.nations.filter((n) => n.debt).length} borrowing)`,
    `approval ${Math.round(w.nations.reduce((t, n) => t + n.approval, 0) / w.nations.length)}`,
    `trade ${Math.round(w.nations.reduce((t, n) => t + (n.trade?.hist.at(-1)?.exp ?? 0), 0) / 1000)}g/day`,
    a.ok ? 'audit ok' : `AUDIT ${a.problems.slice(0, 3).join('; ')}`, `${Math.round((Date.now() - t0) / d)} ms/day`,
  ].join(' | '));
}
