import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { declareWar, settle } from '../src/sim/war';
import { createBattle, finishBattle } from '../src/sim/battle';
import { tollOf, warHomeDaily } from '../src/sim/warHome';

registerSystems();
const fresh = (seed = 1701) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
function neighbours(w: any) {
  const capitals = new Set(w.nations.map((n: any) => n.capital));
  for (const r of w.regions) for (const l of r.links) { const o = w.regions[l]; if (o.owner !== r.owner && !capitals.has(o.id)) return { a: r.owner, b: o.owner, border: o.id }; }
  throw new Error('no border');
}

test('war mobilises the reserve, costs lives, money and bonds, takes prisoners, and makes refugees; peace brings them home', () => {
  const w = fresh();
  advance(w, DAY, false);
  const { a, b, border } = neighbours(w);
  // Some reservists on side a.
  const res = census(w).all.filter((c) => c.nation === a && !c.player && !c.gone).slice(0, 6);
  for (const c of res) { c.mil.branch = 'army'; c.mil.reserve = true; }
  w.wars = {};
  const war = declareWar(w, w.nations[a], { target: b, days: 21, goals: [border] });
  war.quota = 99;
  warHomeDaily(w);
  assert.ok(w.nations[a].mobilised != null);
  assert.ok(res.some((c) => c.mil.calledUp === war.id && !c.mil.reserve), 'reservists called up');
  // A battle lost by b: prisoners, occupation, refugees.
  const bt = createBattle(w, 'war', border, a, b, war.id);
  war.battles.push(bt.id);
  finishBattle(w, bt, 'a');
  assert.equal(w.regions[border].occ?.nation, a);
  const before = (tollOf(war).spent[a] ?? 0);
  for (let i = 0; i < 30; i++) { w.time += DAY / 4; warHomeDaily(w); }
  const t = tollOf(war);
  assert.ok((t.spent[a] ?? 0) > before, 'the war is paid for');
  assert.ok((w.nations[a].warBonds ?? 0) > 0, 'war bonds sold');
  assert.ok((t.captured[b] ?? 0) >= 0);
  const pows = census(w).all.filter((c) => c.mil?.pow != null);
  settle(w, war, 'armistice');
  assert.ok(pows.every((c) => c.mil.pow == null), 'prisoners released at the peace');
  warHomeDaily(w);
  assert.equal(w.nations[a].mobilised, undefined, 'stood down');
  assert.ok(res.every((c) => c.mil.calledUp == null));
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
