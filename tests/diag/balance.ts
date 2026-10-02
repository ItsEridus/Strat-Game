// Balance report for a full-population world: node tests/run.mjs --script tests/diag/balance.ts [perRegion] [days]
import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { audit } from '../../src/engine/ledger';
import { nationals } from '../../src/sim/census';
registerSystems();
const cpr = Number(process.argv[2] ?? 24), days = Number(process.argv[3] ?? 60);
const w = generateWorld(7, 'T', 0, { citizensPerRegion: cpr });
const t0 = performance.now();
const report = (d: number) => {
  const cits = Object.values(w.citizens);
  const employed = cits.filter((c) => c.job != null).length / cits.length;
  const avgCash = (n: number) => { const a = nationals(w, n); return a.reduce((s, c) => s + (c.wallet[w.nations[n].cur] ?? 0), 0) / a.length / 100; };
  console.log(`--- day ${d} (${((performance.now() - t0) / 1000).toFixed(0)}s) citizens ${cits.length} companies ${Object.keys(w.companies).length} employed ${(employed * 100).toFixed(0)}% listings ${Object.keys(w.listings).length} log ${w.log.length} notices ${w.notices.length} inbox ${w.inbox.length} wars ${Object.values(w.wars).filter((x) => x.status === 'active').length} battles ${Object.values(w.battles).filter((b) => !b.done).length} cases ${Object.keys(w.cases).length} articles ${Object.keys(w.articles).length}`);
  for (const n of w.nations.slice(0, 16)) {
    const food = w.lastPrice[`${n.id}|food:1`], wg = w.lastPrice[`${n.id}|wg:1`], grain = w.lastPrice[`${n.id}|grain`];
    console.log(`${n.name.padEnd(15)} treas ${((n.wallet[n.cur] ?? 0) / 100).toFixed(0).padStart(8)} rev ${(n.stats.revHist.slice(-3).reduce((a, b) => a + b, 0) / 300).toFixed(0).padStart(6)} spend ${(n.stats.spendHist.slice(-3).reduce((a, b) => a + b, 0) / 300).toFixed(0).padStart(6)} appr ${n.approval.toFixed(0).padStart(3)} fx ${n.fxAnchor} food ${food} wg ${wg} grain ${grain} cash/cit ${avgCash(n.id).toFixed(0)} unemp ${(n.unemployment * 100).toFixed(0)}% hh ${((w.households[n.id].wallet[n.cur] ?? 0) / 100).toFixed(0)}`);
  }
};
report(0);
for (let d = 1; d <= days; d++) { advance(w, DAY, false); if (d % 15 === 0) report(d); }
const a = audit(w);
console.log('audit', a.ok, a.problems.slice(0, 3));
