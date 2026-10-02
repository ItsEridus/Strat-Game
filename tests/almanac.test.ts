import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { almanacOf } from '../src/sim/almanac';
import { statisticalSkip } from '../src/sim/statYear';
import { reserveShare } from '../src/sim/markets';
import { capsOf } from '../src/sim/strategic';
import { livingStandards } from '../src/sim/livingStandards';

registerSystems();
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('scenarios: a new cold war and a multipolar world', () => {
  const cw = generateWorld(3601, 'Tester', 0, { citizensPerRegion: 1, scenario: 'coldwar' });
  advance(cw, DAY, false);
  const us = by(cw, 'USA'), cn = by(cw, 'CHN'), ru = by(cw, 'RUS');
  assert.ok(us.embargoes.includes(cn.id) && cn.embargoes.includes(us.id));
  assert.ok((us.relations[cn.id]?.score ?? 0) <= -45);
  assert.ok(Object.values(cw.treaties ?? {}).some((t: any) => t.kind === 'defence' && t.parties.includes(cn.id) && t.parties.includes(ru.id)));
  const mp = generateWorld(3602, 'Tester', 0, { citizensPerRegion: 1, scenario: 'multipolar' });
  advance(mp, DAY, false);
  assert.ok(reserveShare(by(mp, 'USA')) < 0.5);
  assert.ok(capsOf(mp, by(mp, 'IND')).productivity > 1.2);
});

test('the World Almanac records leaders and yearly statistics; skipped decades keep people in work', () => {
  const w = generateWorld(3603, 'Tester', 0, { citizensPerRegion: 2 });
  advance(w, 2 * DAY, false);
  const us = by(w, 'USA');
  assert.ok((almanacOf(w).leaders[us.id] ?? []).length >= 1, 'the first heads of government');
  const g0 = livingStandards(w, us.id).incomeGini;
  for (let y = 0; y < 12; y++) statisticalSkip(w, w.time + 365 * DAY);
  const rows = almanacOf(w).years[us.id] ?? [];
  assert.ok(rows.length >= 10, `${rows.length} years recorded`);
  assert.ok(rows.every((r) => r.economy > 0 && r.rating.length > 0));
  assert.ok(livingStandards(w, us.id).incomeGini < Math.max(0.45, g0 + 0.15), 'incomes do not polarise in skips');
  assert.ok(audit(w).ok);
});
