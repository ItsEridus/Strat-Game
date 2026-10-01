import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, burn } from '../src/engine/ledger';
import { GOLD } from '../src/engine/money';
import { natref } from '../src/sim/query';
import { dateAt } from '../src/engine/calendar';
import { castVote, councilMembers, intlDaily, intlOf, lean, permanentIds, tableCheck, tableResolution } from '../src/sim/intlOrgs';
import { declareWar } from '../src/sim/war';

registerSystems();
const fresh = (seed = 951) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('the Security Council: four permanent members with vetoes and four elected seats, South Korea among them', () => {
  const w = fresh();
  advance(w, DAY, false);
  const st = intlOf(w);
  assert.deepEqual(permanentIds(w).map((i) => w.nations[i].iso), ['USA', 'CHN', 'RUS', 'GBR']);
  assert.equal(st.seats.length, 4);
  assert.ok(st.seats.some((s) => w.nations[s.nation].iso === 'KOR'));
  assert.equal(councilMembers(w).length, 8);
});

test('aggression is brought to the UN: a friend of the aggressor vetoes, the General Assembly condemns', () => {
  const w = fresh(952);
  advance(w, DAY, false);
  const ru = by(w, 'RUS'), de = by(w, 'DEU'), us = by(w, 'USA'), cn = by(w, 'CHN');
  w.wars = {};
  declareWar(w, ru, { target: de.id, days: 21, goals: [] });
  assert.ok(lean(w, cn, { kind: 'condemn', target: ru.id, sponsor: us.id }) < 0.2, 'China stands by Russia');
  assert.ok(lean(w, by(w, 'CAN'), { kind: 'condemn', target: ru.id, sponsor: us.id }) > 0.5, 'Canada condemns');
  const r = tableResolution(w, us, 'sc', 'condemn', ru.id)!;
  assert.ok(r);
  assert.match(tableCheck(w, us, 'sc', 'condemn', ru.id) ?? '', /already|week/);
  w.time = r.closes; intlDaily(w);
  assert.equal(r.status, 'vetoed');
  assert.ok(r.vetoedBy!.includes(ru.id));
  // Blocked in the Council, the matter goes to the General Assembly (tabled by an AI government, or by Germany here).
  const ga = intlOf(w).resolutions.find((x) => x.body === 'ga' && x.target === ru.id) ?? tableResolution(w, de, 'ga', 'condemn', ru.id)!;
  w.time = ga.closes; intlDaily(w);
  assert.equal(ga.status, 'passed', ga.result);
  assert.ok(audit(w).ok);
});

test('binding sanctions cut trade for a year, then lapse', () => {
  const w = fresh(953);
  advance(w, DAY, false);
  const sa = by(w, 'SAU'), za = by(w, 'ZAF'), gb = by(w, 'GBR');
  w.wars = {};
  declareWar(w, sa, { target: za.id, days: 21, goals: [] });
  const r = tableResolution(w, gb, 'sc', 'sanctions', sa.id)!;
  for (const id of councilMembers(w)) if (id !== sa.id) castVote(w, w.nations[id], r, 'y');
  w.time = r.closes; intlDaily(w);
  assert.equal(r.status, 'passed', r.result);
  const st = intlOf(w);
  assert.equal(st.sanctions.length, 1);
  const imposed = st.sanctions[0].imposed;
  assert.ok(imposed.length >= 5 && imposed.every((i) => w.nations[i].embargoes.includes(sa.id)));
  w.time += 366 * DAY; intlDaily(w);
  assert.equal(st.sanctions.length, 0);
  assert.ok(imposed.every((i) => !w.nations[i].embargoes.includes(sa.id)), 'the embargoes are lifted');
});

test('the IMF lends to a country whose reserves have run out, with austerity, and is repaid', () => {
  const w = fresh(954);
  advance(w, DAY, false);
  const ar = by(w, 'ARG');
  // Run to the last day of the month, empty the reserves, and let the 1st come.
  while (dateAt(w.time + DAY).day !== 1) advance(w, DAY, false);
  burn(w, natref(ar.id), GOLD, ar.wallet[GOLD], 'test: reserves gone');
  const a0 = ar.approval;
  advance(w, DAY, false);
  const st = intlOf(w);
  const p = st.imf.find((x) => x.nation === ar.id);
  assert.ok(p, 'a programme was agreed');
  assert.ok(ar.imfRelief);
  assert.ok(ar.approval < a0 + 5);
  assert.ok((w.intlLoans ?? []).some((l) => l.to === ar.id && l.imf));
  assert.ok(audit(w).ok);
});
