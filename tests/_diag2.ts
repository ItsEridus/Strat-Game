import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { dailyHooks } from '../src/sim/hooks';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { serialize } from '../src/engine/save';
registerSystems();
const times = new Map<string, number>();
for (let i = 0; i < dailyHooks.length; i++) {
  const f = dailyHooks[i];
  const name = f.name || `hook${i}`;
  dailyHooks[i] = (w) => { const t = performance.now(); f(w); times.set(name, (times.get(name) ?? 0) + performance.now() - t); };
}
const days = Number(process.argv[2] ?? 200);
const w = generateWorld(7, 'T', 0, { citizensPerRegion: 2 });
w.settings.playerMortality = false;
const t0 = performance.now();
advance(w, days * DAY, false);
console.log('total s', ((performance.now() - t0) / 1000).toFixed(0));
console.log([...times.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join('\n'));
console.log('loans', Object.keys(w.loans ?? {}).length, 'listings', Object.keys(w.listings).length, 'fx', Object.keys(w.fx).length, 'trades keys', Object.keys(w.trades).length, 'events', (w as any).events?.length, 'citizens', Object.keys(w.citizens).length);
writeFileSync('/tmp/claude-0/-home-user-Strat-Game/499ae045-1416-57b3-9c60-fc5a8f254a50/scratchpad/w200.json', serialize(w));
