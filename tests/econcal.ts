// Economy calibration: `node tests/run.mjs --script tests/econcal.ts [days] [seed] [perRegion]`.
// Prints each country's vital economic statistics every 90 days (the 1.5.0 "done when" checks).
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { inflation } from '../src/sim/statistics';
import { policyRateOf } from '../src/sim/loans';
import { demographyOf } from '../src/sim/companyLife';

registerSystems();
const days = Number(process.argv[2] ?? 365);
const seed = Number(process.argv[3] ?? 7);
const per = Number(process.argv[4] ?? 2);
const w = generateWorld(seed, 'Tester', 0, { citizensPerRegion: per });
w.settings.playerMortality = false;
const t0 = Date.now();
const r = (x: number, d = 0) => x.toFixed(d);
const range = (xs: number[], d = 0) => `${r(Math.min(...xs), d)}..${r(Math.max(...xs), d)}`;
for (let d = 1; d <= days; d++) {
  advance(w, DAY, false);
  if (d % 90 && d !== days) continue;
  const a = audit(w);
  const all = census(w).all;
  const force = all.filter((c) => ageOf(w, c) >= 18 && !c.retired && !c.edu?.enrolled);
  const working = force.filter((c) => c.job != null || c.post || c.business);
  const cpi = w.nations.filter((n) => !n.exile).map((n) => n.stats2?.cpi.at(-1) ?? 100);
  const inf = w.nations.map((n) => inflation(w, n.id)).filter((x): x is number => x != null);
  const treas = w.nations.map((n) => (n.wallet[n.cur] ?? 0));
  const live = w.nations.filter((n) => !n.exile);
  const debtY = live.map((n) => (n.debt ?? 0) / Math.max(1, (n.stats.revHist.reduce((x, y) => x + y, 0) / Math.max(1, n.stats.revHist.length)) * 365));
  const firms = Object.keys(w.companies).length;
  const births = w.nations.reduce((t, n) => t + demographyOf(w, n.id).hist.reduce((s, x) => s + x.born, 0), 0);
  const deaths = w.nations.reduce((t, n) => t + demographyOf(w, n.id).hist.reduce((s, x) => s + x.died, 0), 0);
  console.log([
    `day ${d}`, `people ${all.length}`, `working ${Math.round((working.length / force.length) * 100)}%`,
    `unemployment ${range(w.nations.filter((n) => !n.exile).map((n) => n.unemployment * 100))}%`, `CPI ${range(cpi)}`, inf.length ? `inflation ${range(inf, 1)}%` : 'inflation n/a',
    `rates ${range(w.nations.map((n) => policyRateOf(w, n.id)), 2)}%`, `debt ${range(debtY, 2)}y`, `treasury>0 ${treas.filter((x) => x > 0).length}/16`, `exiled ${w.nations.filter((n) => n.exile).length}`,
    `firms ${firms} (+${births}/-${deaths} in 12m)`, `self-employed ${all.filter((c) => c.business).length}`,
    a.ok ? 'audit ok' : `AUDIT ${a.problems.slice(0, 2).join('; ')}`, `${Math.round((Date.now() - t0) / d)} ms/day`,
  ].join(' | '));
}
