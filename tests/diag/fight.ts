import { generateWorld } from '../../src/sim/worldgen';
import { registerSystems } from '../../src/sim/systems';
import { advance } from '../../src/sim/tick';
import { DAY } from '../../src/engine/clock';
import { fightCheck } from '../../src/sim/battle';
import { bestWeapon } from '../../src/ai/military';
registerSystems();
const w = generateWorld(7, 'T', 0);
advance(w, 88 * DAY, false);
const b = Object.values(w.battles).find((x) => !x.done)!;
console.log('battle', b.id, 'att', w.nations[b.att].name, 'def', w.nations[b.def].name, 'air', b.airOnly, 'war', b.war, w.wars[b.war!]?.att, w.wars[b.war!]?.def);
const reasons: Record<string, number> = {};
for (const c of Object.values(w.citizens).filter((c) => c.nation === b.att)) {
  const r = fightCheck(w, c, b, 'a', bestWeapon(c, b)) ?? 'OK';
  reasons[r] = (reasons[r] ?? 0) + 1;
}
console.log(reasons);
const n = w.nations[b.att];
console.log('priority', n.priorities, 'exile', n.exile);
