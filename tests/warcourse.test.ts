import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { declareWar, onWarDeadline, settle } from '../src/sim/war';
import { createBattle, finishBattle } from '../src/sim/battle';
import { warCourseDaily, warKindOf } from '../src/sim/warCourse';
import { raiseCheck } from '../src/sim/forces';
import { hasTreaty } from '../src/sim/treaties';

registerSystems();
const fresh = (seed = 1801) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
function neighbours(w: any) {
  const capitals = new Set(w.nations.map((n: any) => n.capital));
  for (const r of w.regions) for (const l of r.links) { const o = w.regions[l]; if (o.owner !== r.owner && !capitals.has(o.id)) return { a: r.owner, b: o.owner, border: o.id }; }
  throw new Error('no border');
}
const occupy = (w: any, war: any, a: number, b: number, border: number) => { const bt = createBattle(w, 'war', border, a, b, war.id); war.battles.push(bt.id); finishBattle(w, bt, 'a'); };

test('a fresh war drags on past its deadline; a held but unwinnable front freezes', () => {
  const w = fresh();
  advance(w, DAY, false);
  const { a, b, border } = neighbours(w);
  w.wars = {};
  const war = declareWar(w, w.nations[a], { target: b, days: 8, goals: [border] });
  assert.equal(warKindOf(war), 'limited');
  war.quota = 99;
  occupy(w, war, a, b, border);
  const d0 = war.deadline;
  onWarDeadline(w, war.id);
  assert.equal(war.status, 'active');
  assert.ok(war.deadline > d0, 'it drags on');
  war.extensions = 2;
  war.exhaust = { [a]: 55, [b]: 60 };
  onWarDeadline(w, war.id);
  assert.equal(war.status, 'frozen');
  assert.equal(w.regions[border].occ?.nation, a, 'the occupation stays');
  assert.ok(audit(w).ok);
});

test('exhaustion grows with a war, and a negotiated peace brings a treaty, reparations and a demilitarised zone', () => {
  const w = fresh(1802);
  advance(w, DAY, false);
  const { a, b, border } = neighbours(w);
  w.wars = {};
  const war = declareWar(w, w.nations[a], { target: b, days: 30, goals: [border] });
  war.quota = 99;
  occupy(w, war, a, b, border);
  for (let i = 0; i < 20; i++) { w.time += DAY; warCourseDaily(w); }
  assert.ok((war.exhaust?.[a] ?? 0) > 5 && (war.exhaust?.[b] ?? 0) > 5);
  settle(w, war, 'conquest');
  assert.equal(w.regions[border].owner, a);
  assert.ok(hasTreaty(w, a, b, 'nonaggression'), 'a peace treaty for years');
  assert.match(raiseCheck(w, w.nations[a].president ?? 0, a, 'infantry', border) ?? '', /demilitarised/);
  assert.ok(war.reparations == null || war.reparations.from === b);
  assert.ok(audit(w).ok);
});
