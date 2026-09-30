import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance, advanceTo } from '../src/sim/tick';
import { audit, produce } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { cref, natref, player } from '../src/sim/query';
import { propose, voteProposal } from '../src/sim/congress';
import { netWage } from '../src/sim/company';
import { taxCeilings } from '../src/sim/taxes';
import { contributeLabor, donateMaterials, startProject } from '../src/sim/construction';
import { travel } from '../src/sim/travel';
import { withAuthority, AUTH_ANY } from '../src/sim/worldgen';

registerSystems();
const fresh = (seed = 21) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('elections run on the calendar and assign real offices and seats', () => {
  const w = fresh();
  const cong = () => Object.values(w.elections).find((e) => e.kind === 'congress' && e.nation === 0);
  advance(w, 20 * DAY, false);
  const e = cong();
  assert.ok(e, 'congress election scheduled');
  advanceTo(w, e!.at + 60, false);
  assert.ok(e!.done && e!.result, 'election resolved');
  const n = w.nations[0];
  const seats = Object.values(n.seats).reduce((a, b) => a + b, 0);
  assert.equal(seats, n.congressSize);
  assert.ok(n.deputies.length > 0 && n.deputies.length <= seats);
  for (const d of n.deputies) assert.equal(w.citizens[d].nation, 0);
  assert.ok(e!.result!.turnout > 0);
  // presidential election on day 1 of month 2
  advance(w, 8 * DAY, false);
  const pres = Object.values(w.elections).find((x) => x.kind === 'president' && x.nation === 0 && x.done);
  assert.ok(pres?.result?.winners.length === 1);
  assert.equal(n.president, pres!.result!.winners[0]);
});

test('an enacted tax law changes subsequent net wages and needs congress', () => {
  const w = fresh(22);
  const n = w.nations[0];
  const pres = w.citizens[n.president!];
  const p = player(w);
  // A non-member cannot propose.
  assert.equal(propose(w, p, 'workTax', { value: 20 }).ok, false);
  const co = Object.values(w.companies).find((c) => c.offer && w.regions[c.region].owner === 0)!;
  const before = netWage(w, co, p).net;
  const value = Math.min(20, Math.floor(taxCeilings(w, n).work));
  assert.ok(value > n.taxes.work, 'ceiling leaves room to raise');
  const r = propose(w, pres, 'workTax', { value });
  assert.ok(r.ok, r.msg);
  const prop = Object.values(w.proposals).find((x) => x.type === 'workTax' && x.status === 'open')!;
  for (const d of n.deputies) if (!w.citizens[d].player) voteProposal(w, w.citizens[d], prop.id, true);
  assert.equal(prop.status, 'passed');
  assert.equal(n.taxes.work, value);
  assert.ok(netWage(w, co, p).net < before);
});

test('government construction requires authority and completes exactly once', () => {
  const w = fresh(23);
  const n = w.nations[0];
  const p = player(w);
  const rid = w.regions.find((r) => r.owner === 0 && r.project == null)!.id;
  assert.equal(startProject(w, p.id, 0, rid, 'hospital').ok, false);
  const r = startProject(w, n.president!, 0, rid, 'hospital');
  assert.ok(r.ok, r.msg);
  const proj = Object.values(w.projects).find((x) => x.region === rid)!;
  const before = w.regions[rid].bld.hospital;
  // deliver materials from the player's storage
  for (const [k, need] of Object.entries(proj.needMats)) {
    produce(w, cref(p.id), k, need, 'test');
    p.loc = rid;
    assert.ok(donateMaterials(w, p.id, cref(p.id), proj.id, k, need).ok);
  }
  let guard = 0;
  while (!proj.done && guard++ < 200) { p.energy = 100; contributeLabor(w, p, proj.id, 5); }
  assert.ok(proj.done);
  assert.equal(w.regions[rid].bld.hospital, before + 1);
  p.energy = 100;
  assert.equal(contributeLabor(w, p, proj.id, 1).ok, false);
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
  void natref; void withAuthority; void AUTH_ANY;
});

test('travel uses energy and tickets; location is separate from citizenship', () => {
  const w = fresh(24);
  const p = player(w);
  const far = w.regions.find((r) => r.id !== p.loc && !w.regions[p.loc].links.includes(r.id) && w.regions[p.loc].links.some((l) => w.regions[l].links.includes(r.id)))!;
  assert.equal(travel(w, p, far.id, 't2').ok, false); // no ticket
  produce(w, cref(p.id), 'ticket:2', 1, 'test');
  const e0 = p.energy;
  const r = travel(w, p, far.id, 't2');
  assert.ok(r.ok, r.msg);
  assert.equal(p.loc, far.id);
  assert.ok(p.energy < e0);
  assert.equal(p.inv['ticket:2'] ?? 0, 0);
  assert.equal(p.nation, 0);
});
