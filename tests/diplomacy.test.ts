import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { addGrievance, blocsOf, composite, leaderProfile, tiesOfPair } from '../src/sim/relations';
import { relation } from '../src/sim/congress';

registerSystems();
const fresh = (seed = 801) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('relations start from the real world: allies close, rivals cold, disputes remembered', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), gb = by(w, 'GBR'), ru = by(w, 'RUS'), cn = by(w, 'CHN'), ar = by(w, 'ARG');
  assert.ok(us.relations[gb.id].score > 40, 'the special relationship');
  assert.ok(us.relations[ru.id].score < -10, 'the US and Russia');
  assert.ok(cn.relations[ru.id].score > 10, 'China and Russia');
  assert.ok(tiesOfPair(w, gb, ar).grievance > 20, 'the Falklands');
  assert.ok(blocsOf(us).some((b) => b.id === 'nato') && blocsOf(cn).some((b) => b.id === 'brics'));
  const lp = leaderProfile(w, us);
  assert.ok(lp.hawk >= 0 && lp.hawk <= 1 && lp.risk >= 0 && lp.risk <= 1);
});

test('nations remember: hostile acts cut trust, conquest leaves a grievance, and the score follows', () => {
  const w = fresh(802);
  advance(w, DAY, false);
  const a = by(w, 'BRA'), b = by(w, 'ARG');
  const t0 = tiesOfPair(w, a, b).trust, c0 = composite(w, a, b);
  relation(w, a.id, b.id, -30, 'a border incident');
  assert.ok(tiesOfPair(w, a, b).trust <= t0 - 29 && tiesOfPair(w, b, a).trust < 35);
  addGrievance(w, b.id, a.id, 40);
  assert.ok(composite(w, b, a) < c0 - 15);
  advance(w, 20 * DAY, false);
  assert.ok(b.relations[a.id].score < 20, `the relation sours (${b.relations[a.id].score})`);
  assert.ok(audit(w).ok);
});
