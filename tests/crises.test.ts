import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { crisesDaily, chooseMove, resolve, type Crisis } from '../src/sim/crises';
import { balanceOfPowerDaily, polarityOf, racesOf, tradePolicyGrowth } from '../src/sim/balanceOfPower';
import { tiesOfPair } from '../src/sim/relations';
import { chooseStrategy } from '../src/sim/nationalBudget';
import { timeOfDate } from '../src/engine/calendar';

registerSystems();
const fresh = (seed = 971) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;
const crisis = (w: any, a: number, b: number, level = 1): Crisis => {
  const c: Crisis = { id: 99999, kind: 'border', a, b, level, started: w.time, next: w.time, moves: [], status: 'active' };
  (w.standoffs ??= []).push(c);
  return c;
};

test('polarity follows the shares of world power', () => {
  assert.equal(polarityOf([{ share: 0.4 }, { share: 0.2 }, { share: 0.1 }]), 'unipolar');
  assert.equal(polarityOf([{ share: 0.3 }, { share: 0.27 }, { share: 0.1 }]), 'bipolar');
  assert.equal(polarityOf([{ share: 0.15 }, { share: 0.14 }, { share: 0.13 }]), 'multipolar');
});

test('rivals who fear each other fall into an arms race and build up their forces', () => {
  const w = fresh();
  advance(w, DAY, false);
  const sa = by(w, 'SAU'), tr = by(w, 'TUR');
  for (const [a, b] of [[sa, tr], [tr, sa]]) { a.relations[b.id].score = -60; tiesOfPair(w, a, b).trust = -60; tiesOfPair(w, a, b).grievance = 60; }
  w.time = timeOfDate(2025, 1, 1);
  // Pin the threat high for the check (relationsDaily would recompute it daily).
  tiesOfPair(w, sa, tr).threat = 50; tiesOfPair(w, tr, sa).threat = 50;
  balanceOfPowerDaily(w);
  assert.equal(racesOf(w, sa.id).length, 1);
  assert.equal(chooseStrategy(w, sa).kind, 'buildup');
  assert.match(chooseStrategy(w, sa).why, /arms race|war/);
  assert.ok(w.bop && w.bop.length === 1);
});

test("a crisis climbs the ladder, and the player chooses their country's moves", () => {
  const w = fresh(972);
  advance(w, DAY, false);
  const us = by(w, 'USA'), ru = by(w, 'RUS');
  const c = crisis(w, ru.id, us.id, 3);
  assert.ok(resolve(w, c, us.id) >= 0 && resolve(w, c, us.id) <= 1);
  // Nuclear powers fear escalation: resolve falls as the crisis climbs.
  const r3 = resolve(w, c, ru.id);
  c.level = 5;
  assert.ok(resolve(w, c, ru.id) < r3);
  // Both offer talks: settled.
  const pl = w.citizens[w.playerId];
  pl.nation = us.id; us.president = pl.id;
  chooseMove(w, c, us.id, 'talks');
  for (let i = 0; i < 20 && c.status === 'active'; i++) { c.next = w.time; chooseMove(w, c, us.id, 'talks'); crisesDaily(w); }
  assert.notEqual(c.status, 'active');
  assert.notEqual(c.status, 'war', 'nuclear rivals do not go to war over this');
});

test('backing down hands the other side a victory', () => {
  const w = fresh(973);
  advance(w, DAY, false);
  const za = by(w, 'ZAF'), sa = by(w, 'SAU');
  const pl = w.citizens[w.playerId];
  pl.nation = za.id; za.president = pl.id;
  const c = crisis(w, sa.id, za.id, 2);
  const a0 = za.approval;
  let guard = 0;
  while (c.status === 'active' && guard++ < 10) { c.next = w.time; chooseMove(w, c, za.id, 'backdown'); crisesDaily(w); }
  assert.ok(c.status === 'won' || c.status === 'settled');
  if (c.status === 'won') { assert.equal(c.winner, sa.id); assert.ok(za.approval < a0); }
  assert.ok(audit(w).ok);
});

test('sanctions cost both sides growth, the target more', () => {
  const w = fresh(974);
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN');
  us.embargoes.push(cn.id);
  const t = tradePolicyGrowth(w, cn), s = tradePolicyGrowth(w, us);
  assert.ok(t.sanctions < s.sanctions && s.sanctions < 0, `${t.sanctions} < ${s.sanctions} < 0`);
  assert.ok(t.sanctions > -1, 'not catastrophic on its own');
});
