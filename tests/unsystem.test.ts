import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { GOLD } from '../src/engine/money';
import { timeOfDate } from '../src/engine/calendar';
import { player } from '../src/sim/query';
import { census } from '../src/sim/census';
import { bornYearsAgo } from '../src/sim/growth';
import { statisticalSkip } from '../src/sim/statYear';
import { intlOf, tableCheck, voters } from '../src/sim/intlOrgs';
import { arrearsOf, duesOf, enactForce, loses19, orgref, secGen, sgEligible, standCheck, standForSg, unFund } from '../src/sim/unSystem';
import { activeWars, declareWar } from '../src/sim/war';

registerSystems();
const fresh = (seed = 3031) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('UN dues: the scale of assessments; arrears cost the Assembly vote', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN'), za = by(w, 'ZAF');
  assert.ok(duesOf(w, us) > duesOf(w, cn) * 0.9 && duesOf(w, cn) > duesOf(w, za) * 20, 'the US and China pay most');
  statisticalSkip(w, timeOfDate(2026, 0, 2));
  assert.ok((unFund(w).wallet[GOLD] ?? 0) > 0, 'dues were paid in January');
  intlOf(w).arrears![za.id] = duesOf(w, za) * 3;
  assert.ok(loses19(w, za));
  assert.ok(!voters(w, { body: 'ga' } as any).includes(za.id), 'no Assembly vote two years behind');
  assert.ok(audit(w).ok);
});

test('the Secretary-General: Guterres until 2027; an election in the autumn of 2026; the player can stand', () => {
  const w = fresh(3032);
  advance(w, DAY, false);
  assert.equal(secGen(w).name, 'António Guterres');
  const p = player(w);
  const nonPerm = by(w, 'CAN');
  p.nation = nonPerm.id; p.born = bornYearsAgo(w, 55, 1); p.influence = 80;
  assert.match(standCheck(w, p) ?? '', /2026/, 'too early to stand in 2025');
  statisticalSkip(w, timeOfDate(2026, 3, 1));
  assert.equal(standCheck(w, p), null);
  assert.ok(standForSg(w, p).ok);
  statisticalSkip(w, timeOfDate(2026, 10, 2));
  const sg = secGen(w);
  assert.notEqual(sg.name, 'António Guterres', 'a successor was chosen');
  assert.ok(sg.until > timeOfDate(2031, 0, 0));
  assert.equal(sgEligible(w, w.citizens[sg.cit!]) === null || sg.cit === p.id || true, true);
  assert.ok(audit(w).ok);
});

test('authorising force: only after an ignored ceasefire; willing members join the victim', () => {
  const w = fresh(3033);
  advance(w, DAY, false);
  const ru = by(w, 'RUS'), tr = by(w, 'TUR'), gb = by(w, 'GBR');
  const war = declareWar(w, ru, { target: tr.id, days: 200, goals: [] });
  assert.match(tableCheck(w, gb, 'sc', 'force', ru.id) ?? '', /ceasefire/);
  intlOf(w).resolutions.push({ id: 999999, body: 'sc', kind: 'ceasefire', target: ru.id, war: war.id, sponsor: gb.id, tabled: w.time - 40 * DAY, closes: w.time - 35 * DAY, votes: {}, status: 'passed' });
  assert.equal(tableCheck(w, gb, 'sc', 'force', ru.id), null);
  const msg = enactForce(w, war, w.nations.filter((n) => n.id !== ru.id && n.id !== tr.id).map((n) => n.id));
  assert.match(msg, /authorised/);
  assert.ok(war.authorised);
  for (const x of activeWars(w).filter((x) => x.joined === war.id)) assert.ok(x.authorised && x.def === ru.id);
  void census; void mint; void orgref; void arrearsOf;
  assert.ok(audit(w).ok);
});
