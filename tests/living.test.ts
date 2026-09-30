import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY, HOUR } from '../src/engine/clock';
import { c as cur } from '../src/engine/money';
import { controller, cref, jailed, player } from '../src/sim/query';
import { createCompany, shiftCheck } from '../src/sim/company';
import { commitCrime, joinPolice, joinSyndicate, patrol, patrolCheck, syndicateJob, trial } from '../src/sim/crime';
import { launchOp, opCheck } from '../src/sim/intel';
import { respond } from '../src/sim/inbox';
import { travelOptions } from '../src/sim/travel';
import { replyStrike } from '../src/sim/dynamics';
import { replyBribe, replyLoan } from '../src/sim/npc';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 71) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const big = (w: World) => w.regions.filter((r) => r.owner === 0).sort((a, b) => b.pop - a.pop)[0];

test('crime opens cases; arrest, trial and prison follow; prison blocks actions', () => {
  const w = fresh();
  const p = player(w);
  p.loc = big(w).id;
  // Commit crimes until the police notice.
  for (let i = 0; i < 40 && !Object.values(w.cases).some((k) => k.suspect === p.id); i++) {
    p.energy = 100; p.sec.last = {};
    commitCrime(w, p, 'pickpocket');
  }
  const k = Object.values(w.cases).find((x) => x.suspect === p.id)!;
  assert.ok(k, 'a case was opened');
  assert.ok(p.sec.heat > 0 && p.sec.record.crimes > 0);
  // Enough evidence: the next daily pass arrests and the player is asked how to plead.
  k.evidence = 100;
  advance(w, DAY, false);
  const msg = w.inbox.find((m) => m.payload?.handler === 'arrest' && !m.resolved);
  assert.ok(msg, 'arrest message');
  assert.ok(respond(w, msg!.id, 'comply').ok);
  assert.equal(k.status, 'closed');
  assert.match(k.outcome ?? '', /convicted/);
  assert.ok(jailed(w, p));
  assert.match(shiftCheck(w, p) ?? '', /prison/);
  assert.ok(travelOptions(w, p, w.regions[p.loc].links[0]).every((o) => /prison/.test(o.why ?? '')));
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('police career: patrols cut crime and advance cases; trials acquit on weak evidence', () => {
  const w = fresh(72);
  const p = player(w);
  const r = big(w);
  p.loc = r.id; p.influence = 40; p.attrs.str = 5; p.born -= 10 * 365 * DAY;
  assert.ok(joinPolice(w, p).ok);
  const before = r.crime;
  p.energy = 100;
  assert.ok(patrol(w, p).ok);
  assert.ok(r.crime <= before);
  assert.match(patrolCheck(w, p) ?? '', /already/);
  // Weak case: a suspect with no evidence is acquitted.
  const suspect = Object.values(w.citizens).find((c) => !c.player && c.nation === 0)!;
  const id = w.nextId++;
  w.cases[id] = { id, suspect: suspect.id, kind: 'fraud', region: r.id, nation: 0, evidence: 0, opened: w.time, status: 'open', detective: null, loot: 0 };
  trial(w, w.cases[id], false);
  assert.equal(w.cases[id].outcome, 'acquitted');
});

test('syndicates recruit, run jobs, and extort companies through the inbox', () => {
  const w = fresh(73);
  const p = player(w);
  const s = Object.values(w.syndicates).find((x) => x.nation === 0)!;
  assert.ok(s, 'the US has organised crime');
  p.loc = s.turf[0]; p.sec.notoriety = 5;
  assert.ok(joinSyndicate(w, p, s.id).ok);
  mint(w, { k: 'synd', id: s.id }, 'USD', cur(200), 'test');
  let paid = false;
  for (let i = 0; i < 20 && !paid; i++) { p.energy = 100; p.sec.last = {}; paid = syndicateJob(w, p, 'smuggle').ok; }
  assert.ok(paid, 'a smuggling run paid out');
  assert.equal(p.sec.syndicate, s.id);
  // A different organisation shakes down the player's company.
  const co = createCompany(w, cref(p.id), 'food', 1, s.turf[0]);
  mint(w, { k: 'co', id: co.id }, 'USD', cur(500), 'test');
  const other = Object.values(w.syndicates).find((x) => x.id !== s.id)!;
  other.turf.push(co.region);
  for (let i = 0; i < 60 && !w.inbox.some((m) => m.payload?.handler === 'extortion'); i++) advance(w, DAY, false);
  const m = w.inbox.find((x) => x.payload?.handler === 'extortion');
  assert.ok(m, 'an organisation demanded protection');
  assert.ok(respond(w, m!.id, 'refuse').ok);
  assert.ok(co.halt && co.halt.until > w.time, 'refusing gets the company vandalised');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('intelligence operations need network and funds, then resolve on schedule', () => {
  const w = fresh(74);
  const p = player(w);
  const n = w.nations[0];
  n.president = p.id;
  const target = 1;
  assert.match(opCheck(w, p.id, 0, 'sabotage', target, w.regions.find((r) => controller(r) === target)!.id, null) ?? '', /network/);
  n.agency.network[target] = 80;
  mint(w, { k: 'nat', id: 0 }, 'USD', cur(1000), 'test');
  const r = launchOp(w, p.id, 0, 'intel', target);
  assert.ok(r.ok, r.msg);
  const op = Object.values(w.ops).find((o) => o.nation === 0 && o.kind === 'intel' && o.target === target)!;
  assert.equal(op.status, 'active');
  advance(w, 9 * HOUR, false);
  assert.notEqual(op.status, 'active');
  if ((op.status as string) === 'success') assert.ok(n.agency.dossiers[target]?.lines.length);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('the world moves: business cycle, crises, unrest, arrivals — and stays audited', () => {
  const w = fresh(75);
  const base = Object.keys(w.citizens).length;
  for (let d = 0; d < 120; d++) advance(w, DAY, false);
  assert.ok(w.econ.hist.length >= 100, 'cycle recorded');
  assert.ok(new Set(w.econ.hist.map((x) => Math.sign(x))).size >= 1);
  assert.ok(Object.keys(w.crises).length > 0, 'crises happened');
  assert.ok(Object.keys(w.citizens).length > base, 'new people arrived');
  assert.ok(w.regions.some((r) => r.unrest > 5));
  assert.ok(Object.values(w.cases).length > 0, 'AI citizens commit crimes and get caught');
  assert.ok(Object.values(w.citizens).some((c) => c.sec.goal), 'NPCs have ambitions');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('strikes, bribes and loans are real decisions with consequences', () => {
  const w = fresh(76);
  const p = player(w);
  const co = createCompany(w, cref(p.id), 'food', 1, big(w).id);
  co.offer = { wage: cur(2), slots: 5, minEco: 0 };
  co.halt = { until: w.time + DAY, why: 'Workers on strike' };
  assert.ok(replyStrike(w, { co: co.id, demand: cur(9), crisis: -1 }, 'meet').ok);
  assert.equal(co.offer.wage, cur(9));
  assert.equal(co.halt, undefined);
  // A bribe moves money and adds notoriety.
  const briber = Object.values(w.citizens).find((c) => !c.player && c.nation === 0)!;
  mint(w, cref(briber.id), 'USD', cur(300), 'test');
  const before = p.wallet.USD ?? 0;
  assert.ok(replyBribe(w, { from: briber.id, amount: cur(100) }, 'accept').ok);
  assert.equal((p.wallet.USD ?? 0) - before, cur(100));
  assert.ok(p.sec.notoriety > 0);
  // A loan is repaid automatically when due.
  const friend = Object.values(w.citizens).find((c) => !c.player && c.nation === 0 && c.id !== briber.id)!;
  mint(w, cref(friend.id), 'USD', cur(300), 'test');
  assert.ok(replyLoan(w, { from: friend.id, amount: cur(100) }, 'accept').ok);
  const owed = p.flags[`loan_${friend.id}`];
  assert.equal(owed, cur(110));
  mint(w, cref(p.id), 'USD', cur(200), 'test');
  for (let d = 0; d < 11; d++) advance(w, DAY, false);
  assert.equal(p.flags[`loan_${friend.id}`], undefined, 'loan settled');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
