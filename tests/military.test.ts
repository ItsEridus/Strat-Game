import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance, advanceTo } from '../src/sim/tick';
import { audit, produce } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { controller, cref, player } from '../src/sim/query';
import { createBattle, finishBattle, hit } from '../src/sim/battle';
import { computeSupply, declareWar, onWarBattleWon, settle, updateExile, warCheck } from '../src/sim/war';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 31) => generateWorld(seed, 'Tester', 0, { citizensPerNation: 20 });
function neighbours(w: World) {
  // A non-capital border region, so losing it doesn't trigger capital-loss behaviour.
  const capitals = new Set(w.nations.map((n) => n.capital));
  for (const r of w.regions) for (const l of r.links) { const o = w.regions[l]; if (o.owner !== r.owner && !capitals.has(o.id)) return { a: r.owner, b: o.owner, border: o.id }; }
  throw new Error('no border');
}

test('battles keep damage, scoring points, round wins and outcome distinct', () => {
  const w = fresh();
  const p = player(w);
  const { a, b, border } = neighbours(w);
  const bt = createBattle(w, 'war', border, a, b, null);
  p.nation = a; p.loc = w.regions.find((r) => r.owner === a)!.id; p.energy = 100;
  produce(w, cref(p.id), 'wg:1', 3, 'test');
  const before = p.inv['wg:1'];
  for (let i = 0; i < 3; i++) hit(w, p, bt.id, 'a', { kind: 'wg', q: 1 });
  assert.equal(p.inv['wg:1'] ?? 0, before - 3, 'weapon consumed every hit (even misses)');
  assert.ok(bt.hits.a === 3);
  advance(w, 160, false); // one full round
  assert.equal(bt.rounds.length >= 1, true);
  const r0 = bt.rounds[0];
  assert.equal(r0.ptsA + r0.ptsD, 4800);
  assert.ok(r0.a >= 0 && r0.d >= 0);
  assert.equal(bt.wins.a + bt.wins.d, bt.rounds.length);
});

test('occupation stays distinct from ownership until settlement; goals transfer once', () => {
  const w = fresh(32);
  const { a, b, border } = neighbours(w);
  const war = declareWar(w, w.nations[a], { target: b, days: 8, goals: [border] });
  const bt = createBattle(w, 'war', border, a, b, war.id);
  war.battles.push(bt.id);
  const r = w.regions[border];
  const bld = r.bld.hospital = 2;
  finishBattle(w, bt, 'a');
  assert.equal(r.owner, b, 'legal owner unchanged');
  assert.equal(r.occ?.nation, a, 'occupied by attacker');
  assert.equal(controller(r), a);
  assert.ok(war.occupied.includes(border));
  // Occupy two more non-goal regions to reach the quota of 3.
  const more = w.regions.filter((x) => x.owner === b && x.id !== border).slice(0, 2);
  for (const m of more) { const bb = createBattle(w, 'war', m.id, a, b, war.id); war.battles.push(bb.id); onWarBattleWon(w, bb, 'a'); bb.done = true; }
  assert.equal(war.status, 'ended');
  assert.equal(r.owner, a, 'held goal transferred');
  assert.equal(r.occ, null);
  assert.equal(r.bld.hospital, bld - 1, 'retained region lost a building level');
  for (const m of more) { assert.equal(m.owner, b, 'non-goal occupation returned'); assert.equal(m.occ, null); }
  assert.ok((w.nations[a].pacts[b] ?? 0) > w.time, 'non-aggression pact');
  assert.ok(warCheck(w, w.nations[a], { target: b, days: 8, goals: [] }), 'pact blocks a new war');
  assert.ok(audit(w).ok);
});

test('deadlines settle wars and return occupations', () => {
  const w = fresh(33);
  const { a, b, border } = neighbours(w);
  const war = declareWar(w, w.nations[a], { target: b, days: 8, goals: [border] });
  const bt = createBattle(w, 'war', border, a, b, war.id);
  war.battles.push(bt.id);
  finishBattle(w, bt, 'a');
  assert.equal(w.regions[border].occ?.nation, a);
  advanceTo(w, war.deadline + 10, false);
  assert.equal(war.status, 'ended');
  assert.equal(w.regions[border].occ, null);
  assert.equal(w.regions[border].owner, b);
});

test('supply follows the connection graph and territorial changes', () => {
  const w = fresh(34);
  const n = w.nations[0];
  computeSupply(w);
  const own = w.regions.filter((r) => r.owner === 0);
  assert.ok(own.every((r) => r.supplied));
  // Occupy every neighbour of the capital: regions beyond it lose supply unless protected.
  const cap = w.regions[n.capital];
  for (const l of cap.links) { const r = w.regions[l]; if (r.owner === 0) r.occ = { nation: 1, war: -1 }; }
  computeSupply(w);
  const cut = w.regions.filter((r) => r.owner === 0 && !r.occ && r.id !== cap.id && r.bld.base < 4);
  assert.ok(cut.length === 0 || cut.some((r) => !r.supplied));
});

test('losing all territory creates a nation in exile with a comeback path', () => {
  const w = fresh(35);
  const victim = w.nations[3];
  const cores = w.regions.filter((r) => r.owner === 3);
  const edge = cores.find((r) => r.links.some((l) => w.regions[l].owner !== 3))!;
  const taker = w.regions[edge.links.find((l) => w.regions[l].owner !== 3)!].owner;
  for (const r of cores) r.owner = taker;
  updateExile(w);
  assert.equal(victim.exile, true);
  assert.ok(Object.values(w.citizens).some((c) => c.nation === 3), 'citizens keep citizenship');
  assert.equal(warCheck(w, victim, { target: taker, days: 8, goals: [victim.capital] }), null, 'exile can reclaim its capital');
  const war = declareWar(w, victim, { target: taker, days: 8, goals: [victim.capital] });
  assert.equal(war.quota, 1, 'capital-only goal needs one occupation');
  const bt = createBattle(w, 'war', victim.capital, 3, taker, war.id);
  war.battles.push(bt.id);
  finishBattle(w, bt, 'a');
  assert.equal(w.regions[victim.capital].owner, 3);
  assert.equal(victim.exile, false);
  void settle; void advance; void DAY;
});

test('peace terms need both congresses and then settle consistently', async () => {
  const { propose, voteProposal } = await import('../src/sim/congress');
  const w = fresh(36);
  const { a, b, border } = neighbours(w);
  const war = declareWar(w, w.nations[a], { target: b, days: 21, goals: [border] });
  const bt = createBattle(w, 'war', border, a, b, war.id);
  war.battles.push(bt.id);
  finishBattle(w, bt, 'a');
  assert.equal(w.regions[border].occ?.nation, a);
  const pa = w.citizens[w.nations[a].president!];
  assert.ok(propose(w, pa, 'peace', { war: war.id, kind: 'armistice' }).ok);
  const p1 = Object.values(w.proposals).find((x) => x.type === 'peace' && x.nation === a)!;
  for (const d of w.nations[a].deputies) voteProposal(w, w.citizens[d], p1.id, true);
  advance(w, 25 * 60, false);
  assert.equal(p1.status, 'passed');
  assert.equal(war.status, 'active', 'still at war until the other side agrees');
  const p2 = Object.values(w.proposals).find((x) => x.type === 'peace' && x.nation === b && x.params.kind === 'accept')!;
  assert.ok(p2, 'response vote opened in the enemy congress');
  for (const d of w.nations[b].deputies) if (!p2.votes[d]) p2.votes[d] = 'y';
  if (w.nations[b].president != null) p2.votes[w.nations[b].president!] = 'y';
  advance(w, 25 * 60, false);
  assert.equal(war.status, 'ended');
  assert.equal(w.regions[border].occ, null, 'armistice returned the occupation');
  assert.equal(w.regions[border].owner, b);
});
