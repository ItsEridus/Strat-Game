import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
registerSystems();
const w = generateWorld(Number(process.argv[3] ?? 7), 'T', 0);
advance(w, Number(process.argv[2] ?? 60) * DAY, false);
console.log(w.log.filter((e) => e.type === 'war' || (e.type === 'law' && /war|Peace|peace/.test(e.text))).map((e) => `d${Math.floor(e.t / 1440)} ${e.text}`).join('\n'));
for (const b of Object.values(w.battles).slice(-6)) {
  console.log(`battle ${b.id} ${w.regions[b.region].name} done=${b.done} winner=${b.winner} rounds=${JSON.stringify(b.rounds.map((r) => [r.a, r.d, r.ptsA, r.ptsD]))} hits=${JSON.stringify(b.hits)} weapons=${JSON.stringify(b.weaponsUsed)}`);
}
