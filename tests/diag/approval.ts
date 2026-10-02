import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { nationals } from '../../src/sim/census';
registerSystems();
const cpr = Number(process.argv[2] ?? 8);
const w = generateWorld(7, 'T', 0, { citizensPerRegion: cpr });
for (let d = 1; d <= 30; d++) {
  advance(w, DAY, false);
  const row = [0, 2, 7].map((i) => { const n = w.nations[i]; const cs = nationals(w, i); const mood = cs.reduce((s, c) => s + c.mood, 0) / cs.length; const inc = cs.reduce((s, c) => s + c.lastIncome, 0) / cs.length; return `${n.name.slice(0, 6)} appr ${n.approval.toFixed(0)} mood ${mood.toFixed(2)} inc ${(inc / 100).toFixed(1)} war ${n.warScore.toFixed(0)} tax ${n.taxes.work}/${n.taxes.vat} unmet ${(w.households[i].unmet / 100).toFixed(0)}`; });
  console.log(d, row.join(' | '));
}
