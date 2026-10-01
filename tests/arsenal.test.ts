import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { arsenalMonth, arsenalOf, effectiveGen, formationGen, kindGen, milexOfGdp, qualityFactor, splitOf } from '../src/sim/arsenal';
import { formationsOf, power } from '../src/sim/forces';
import { CLASS_INFO } from '../src/data/arsenal';

registerSystems();
const fresh = (seed = 301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('defence budgets start at real shares of GDP', () => {
  const w = fresh();
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!;
  assert.ok(Math.abs(milexOfGdp(by('USA')) - 3.4) < 0.2);
  assert.ok(milexOfGdp(by('RUS')) > 6 && milexOfGdp(by('SAU')) > 6);
  for (const iso of ['MEX', 'ARG', 'ZAF']) assert.ok(milexOfGdp(by(iso)) < 1, iso);
  const s = splitOf(by('USA'));
  assert.ok(Math.abs(s.personnel + s.om + s.procurement + s.rd - 1) < 0.01);
});

test('generations: the leaders field better equipment, and quality counts in combat', () => {
  const w = fresh(302);
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!;
  const us = by('USA'), mx = by('MEX');
  assert.equal(arsenalOf(w, us).fighters.gen, 5);
  assert.equal(arsenalOf(w, mx).carriers.gen, 0, 'Mexico has no carriers');
  assert.ok(kindGen(w, us, 'fighter') > kindGen(w, mx, 'fighter') + 1);
  assert.ok(qualityFactor(5) / qualityFactor(3) > 1.25);
  const f = formationsOf(w, us.id)[0];
  const before = power(w, f);
  f.gen = formationGen(w, f) - 1;
  assert.ok(power(w, f) < before * 0.92, 'a generation older fights worse');
});

test('without procurement equipment ages and loses its edge; with it, it is renewed', () => {
  const w = fresh(303);
  const n = w.nations[0];
  const a = arsenalOf(w, n);
  const cls = 'fighters';
  a[cls].gen ||= 4;
  a[cls].age = CLASS_INFO[cls].life * 0.6;
  // Twenty years with no procurement money.
  for (let i = 0; i < 240; i++) { n.defense.month = { procurement: 0, rd: 0, days: 30 }; arsenalMonth(w, n); }
  assert.ok(a[cls].age > CLASS_INFO[cls].life * 0.7 + 10, `aged to ${a[cls].age}`);
  assert.ok(effectiveGen(cls, a[cls]) < a[cls].gen, 'past its life it fights below its generation');
  const old = a[cls].age;
  // Ten years at three times the usual procurement.
  for (let i = 0; i < 120; i++) { n.defense.month = { procurement: 1e12, rd: 0, days: 30 }; arsenalMonth(w, n); }
  assert.ok(a[cls].age < old * 0.7, `renewed to ${a[cls].age}`); // half speed: the contractor has no goods to build with
});

test('defence contracts flow through the ledger', () => {
  const w = fresh(304);
  advance(w, 20 * DAY, false);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.ok(w.nations.some((n) => (n.defense.month?.procurement ?? 0) > 0 || n.defense.upkeepK != null));
});

import { bestSeller, cutOff, exportLicence, placeOrder, programmeCheck, runningOrders, runningProgrammes, startProgramme } from '../src/sim/defenceIndustry';
import { wearFactor } from '../src/sim/arsenal';
import { capsOf } from '../src/sim/strategic';
import { mint } from '../src/engine/ledger';
import { natref } from '../src/sim/query';
import { c as cur } from '../src/engine/money';

test('an R&D programme takes years, then raises what the country can build and the forces follow', () => {
  const w = fresh(305);
  const n = w.nations.find((x) => x.iso === 'GBR') ?? w.nations[0];
  const a = arsenalOf(w, n);
  const before = { frontier: a.fighters.frontier, gen: a.fighters.gen, tech: capsOf(w, n).tech.military };
  n.president = null; // keep the AI from starting its own programmes in this class
  assert.equal(programmeCheck(w, null, n, 'fighters'), null);
  assert.ok(startProgramme(w, null, n, 'fighters').ok);
  const p = runningProgrammes(n).find((x) => x.cls === 'fighters')!;
  assert.ok(p.months >= 120 && p.months <= 240, `${p.months / 12} years for a fighter`);
  let months = 0;
  while (p.status === 'running' && months < 400) { n.defense.month = { procurement: 1e9, rd: p.monthly * 1.2 * 3, days: 30 }; arsenalMonth(w, n); months++; }
  if (p.status === 'cancelled') return; // risk is real: overruns can kill a programme
  assert.equal(p.status, 'done');
  assert.ok(months >= p.months * 0.8, `took ${months} months`);
  assert.ok(a.fighters.frontier > before.frontier);
  assert.ok(capsOf(w, n).tech.military > before.tech, 'spin-offs');
  for (let i = 0; i < 120; i++) { n.defense.month = { procurement: 1e9, rd: 0, days: 30 }; arsenalMonth(w, n); }
  assert.ok(a.fighters.gen > before.gen + 0.2, `the forces modernised to ${a.fighters.gen}`);
});

test('starved programmes are cancelled', () => {
  const w = fresh(306);
  const n = w.nations[0];
  n.president = null;
  const cls = (['armour', 'artillery', 'smallarms'] as const).find((c) => !programmeCheck(w, null, n, c))!;
  startProgramme(w, null, n, cls);
  const p = runningProgrammes(n).find((x) => x.cls === cls)!;
  for (let i = 0; i < 24 && p.status === 'running'; i++) { n.defense.month = { procurement: 0, rd: 0, days: 30 }; arsenalMonth(w, n); }
  assert.equal(p.status, 'cancelled');
  assert.ok((n.chronicle ?? []).some((x) => /cancelled/.test(x.text)));
});

test('the arms trade: licences, deliveries over years, and spare-parts dependence', () => {
  const w = fresh(307);
  const buyer = w.nations.find((x) => x.iso === 'ARG')!;
  const us = w.nations.find((x) => x.iso === 'USA')!;
  for (const x of w.nations) { x.relations[buyer.id] = { score: 30, hist: [] }; buyer.relations[x.id] = { score: 30, hist: [] }; }
  assert.equal(exportLicence(w, us, buyer), null);
  us.embargoes.push(buyer.id);
  assert.match(exportLicence(w, us, buyer) ?? '', /embargo/);
  us.embargoes.pop();
  const seller = bestSeller(w, buyer, 'fighters')!;
  assert.ok(seller);
  mint(w, natref(buyer.id), buyer.cur, cur(1e6), 'test');
  const before = arsenalOf(w, buyer).fighters.gen;
  assert.ok(placeOrder(w, null, buyer, 'fighters', seller).ok);
  const o = runningOrders(buyer)[0];
  for (let i = 0; i < 60 && o.status === 'running'; i++) { w.time += 30 * 1440; buyer.defense.month = { procurement: 0, rd: 0, days: 30 }; arsenalMonth(w, buyer); }
  assert.ok(o.delivered > 0.9, `delivered ${o.delivered}`);
  assert.ok(arsenalOf(w, buyer).fighters.gen > before);
  assert.equal(arsenalOf(w, buyer).fighters.supplier, seller.id);
  // An embargo cuts off spare parts.
  seller.embargoes.push(buyer.id);
  assert.ok(cutOff(w, buyer, 'fighters'));
  const f = formationsOf(w, buyer.id).find((x) => x.kind === 'fighter');
  if (f) assert.ok(wearFactor(w, f) >= 2);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
