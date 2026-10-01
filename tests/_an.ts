import { readFileSync } from 'node:fs';
import { deserialize } from '../src/engine/save';
import { registerSystems } from '../src/sim/systems';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { refPrice } from '../src/sim/market';
registerSystems();
const w = deserialize(readFileSync('/tmp/claude-0/-home-user-Strat-Game/499ae045-1416-57b3-9c60-fc5a8f254a50/scratchpad/w200.json', 'utf8'));
for (const n of w.nations) {
  const cs = census(w).all.filter((c) => c.nation === n.id && !c.gone);
  const force = cs.filter((c) => ageOf(w, c) >= 18 && !c.retired && !c.edu?.enrolled);
  const jobless = force.filter((c) => c.job == null && !c.post && !c.business);
  const cos = Object.values(w.companies).filter((co) => w.regions[co.region].owner === n.id);
  const vac = cos.reduce((t, co) => t + Math.max(0, (co.offer?.slots ?? 0) - co.workers.length), 0);
  const poor = cos.filter((co) => (co.wallet[n.cur] ?? 0) < (co.offer?.wage ?? 0)).length;
  console.log(n.iso, 'pop', cs.length, 'force', force.length, 'jobless', jobless.length, 'unemp', (n.unemployment*100).toFixed(0), 'firms', cos.length, 'vac', vac, 'broke', poor, 'cpi', n.stats2?.cpi.at(-1), 'food', refPrice(w, n.id, 'food:1'), 'min', n.minWage, 'hh', Math.round((w.households[n.id].wallet[n.cur] ?? 0)/100), 'treas', Math.round((n.wallet[n.cur]??0)/100), 'rev', Math.round(n.stats.revHist.reduce((a,b)=>a+b,0)/100), 'exile', n.exile);
}
