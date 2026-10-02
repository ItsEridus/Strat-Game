import { test } from 'node:test';
import { B } from '../src/data/balance';
import { progressive } from '../src/data/economy';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance, advanceTo } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { c as cur } from '../src/engine/money';
import { cref, player, regref } from '../src/sim/query';
import { createCompany, netWage, productionFactors } from '../src/sim/company';
import { campaign, govTemplate, runForHead, setStateBudget, setStateTax, voteState } from '../src/sim/stategov';
import { kmBetween, travelOptions } from '../src/sim/travel';
import { EARTH } from '../src/data/earth';
import { IDEOLOGY_LIST } from '../src/data/ideologies';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 61) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const region = (w: World, name: string, nation = 0) => w.regions.find((r) => r.name === name && r.owner === nation)!;

const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const CANADA = ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Northwest Territories', 'Nunavut', 'Yukon'];

test('every US state, DC and every Canadian province and territory exists with its own government', () => {
  const w = fresh();
  const us = w.regions.filter((r) => r.owner === 0).map((r) => r.name);
  assert.deepEqual([...us].sort(), [...US_STATES, 'District of Columbia'].sort());
  const ca = w.regions.filter((r) => r.owner === 1).map((r) => r.name);
  assert.deepEqual([...ca].sort(), [...CANADA].sort());
  for (const r of w.regions.filter((x) => x.owner <= 1)) {
    const s = w.govs[r.id];
    assert.ok(s, `${r.name} has a government`);
    assert.ok(s.head.name, `${r.name} has a head`);
    assert.ok(Object.values(s.seats).reduce((a, b) => a + (b ?? 0), 0) === s.size, `${r.name} legislature filled`);
  }
  assert.equal(govTemplate(w, region(w, 'Texas').id)!.title, 'Governor');
  assert.equal(govTemplate(w, region(w, 'District of Columbia').id)!.title, 'Mayor');
  assert.equal(govTemplate(w, region(w, 'Quebec', 1).id)!.legislature, 'National Assembly');
  assert.equal(govTemplate(w, region(w, 'Ontario', 1).id)!.title, 'Premier');
  assert.equal(EARTH.nations[0].capital, region(w, 'District of Columbia').id);
});

test('real borders connect neighbours across countries; other countries use their real systems', () => {
  const w = fresh();
  const tx = region(w, 'Texas');
  const mx = w.nations.findIndex((n) => n.name === 'Mexico');
  for (const name of ['Chihuahua', 'Coahuila', 'Nuevo León', 'Tamaulipas']) assert.ok(tx.links.includes(region(w, name, mx).id), `Texas borders ${name}`);
  assert.ok(region(w, 'Washington').links.includes(region(w, 'British Columbia', 1).id));
  const gb = w.nations.findIndex((n) => n.name === 'United Kingdom');
  assert.equal(w.govs[region(w, 'England', gb).id], null, 'England has no devolved government');
  assert.equal(govTemplate(w, region(w, 'Scotland', gb).id)!.legislature, 'Scottish Parliament');
  const cn = w.nations.findIndex((n) => n.name === 'China');
  assert.equal(govTemplate(w, region(w, 'Sichuan', cn).id)!.mode, 'appointed');
  // Every region is reachable (travel and supply depend on it).
  const seen = new Set([0]); const st = [0];
  while (st.length) for (const l of w.regions[st.pop()!].links) if (!seen.has(l)) { seen.add(l); st.push(l); }
  assert.equal(seen.size, w.regions.length);
});

test('state wage tax reduces net wages, funds the state treasury, and is 0 in no-tax states', () => {
  const w = fresh();
  const p = player(w);
  const ny = region(w, 'New York');
  const s = w.govs[ny.id]!;
  s.tax = 5;
  const co = createCompany(w, cref(p.id), 'food', 1, ny.id);
  co.offer = { wage: cur(10), slots: 3, minEco: 0 };
  const nw = netWage(w, co, p);
  assert.equal(nw.stateRate, 5);
  assert.equal(nw.tax, Math.round((nw.gross * w.nations[0].taxes.work * progressive(nw.gross / cur(B.wages.start))) / 100) + Math.round(nw.gross * 0.05));
  const tx = w.govs[region(w, 'Texas').id]!;
  assert.equal(tx.tax, 0);
  const r = setStateTax(w, 'npc', tx.region, 2);
  assert.equal(r.ok, false, 'Texas cannot levy a wage tax');
  // Only the head can change the tax, and the legislature must agree.
  assert.equal(setStateTax(w, p.id, ny.id, 6).ok, false);
});

test('a citizen can run for governor, campaign, vote and then govern', () => {
  const w = fresh(62);
  const p = player(w);
  const co = region(w, 'Colorado');
  p.loc = co.id;
  p.influence = 40;
  const s = w.govs[co.id]!;
  // Registration opens a few days before the election.
  s.nextElection = w.time + 3 * DAY;
  advance(w, DAY, false);
  assert.ok(runForHead(w, p.id, co.id).ok);
  assert.equal(runForHead(w, p.id, co.id).ok, false, 'no double registration');
  mint(w, cref(p.id), 'USD', cur(5000), 'test');
  assert.ok(campaign(w, p.id, co.id, cur(2000)).ok);
  for (const i of IDEOLOGY_LIST) s.lean[i] = i === p.ideo ? 0.9 : 0.02;
  const idx = s.candidates.findIndex((c) => c.cit === p.id);
  assert.ok(voteState(w, p.id, co.id, idx).ok);
  assert.equal(voteState(w, p.id, co.id, idx).ok, false, 'one vote');
  advanceTo(w, s.nextElection + DAY, false);
  assert.equal(s.head.cit, p.id, 'player elected');
  // Govern: budget changes are executive; tax changes need the legislature.
  assert.ok(setStateBudget(w, p.id, co.id, { welfare: 0.2, infra: 0.6, business: 0.1, police: 0.1 }, 0.4).ok);
  const before = s.tax;
  const dir = before < 3 ? 1 : -1;
  for (const i of IDEOLOGY_LIST) s.seats[i] = 0;
  s.seats[dir > 0 ? 'communism' : 'capitalism'] = s.size;
  s.lastTaxChange = -1e9; // the previous governor may have just changed it
  assert.ok(setStateTax(w, p.id, co.id, before + dir).ok);
  assert.equal(s.tax, before + dir);
  assert.equal(setStateTax(w, p.id, co.id, before).ok, false, 'cool-down between tax votes');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('infrastructure spending raises the production bonus; travel uses real distances', () => {
  const w = fresh();
  const p = player(w);
  const ca = region(w, 'California');
  const s = w.govs[ca.id]!;
  s.budget = { welfare: 0, infra: 1, business: 0, police: 0 };
  s.spendRate = 0.6;
  mint(w, regref(ca.id), 'USD', cur(20000), 'test');
  advance(w, 5 * DAY, false);
  assert.ok(s.dev >= 1, 'infrastructure level built');
  const co = createCompany(w, cref(p.id), 'food', 1, ca.id);
  assert.ok(productionFactors(w, co, null).factors.some((f) => /State infrastructure/.test(f.label)));
  const km = kmBetween(region(w, 'New York').id, ca.id);
  assert.ok(km > 3500 && km < 4500, `NY–CA ${km} km`);
  p.loc = region(w, 'New York').id;
  const opts = travelOptions(w, p, ca.id);
  assert.ok(!opts.some((o) => o.id === 'walk'), 'not a neighbour');
  assert.match(opts.find((o) => o.id === 't1')!.why ?? '', /800 km/);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
