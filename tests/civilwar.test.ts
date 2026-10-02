import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { serialize, deserialize } from '../src/engine/save';
import { civilMonth, mergeState, startCivilWar } from '../src/sim/civilWar';
import { createState } from '../src/sim/secession';
import { activeWars } from '../src/sim/war';
import { regimeOf } from '../src/sim/regimes';

registerSystems();
const fresh = (seed = 2401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('a civil war: rebels hold regions with troops of their own, and the government fights them', () => {
  const w = fresh();
  advance(w, 2 * DAY, false);
  const mx = by(w, 'MEX');
  const f = startCivilWar(w, mx, 'A test')!;
  assert.ok(f && f.faction);
  assert.ok(w.regions.some((r) => r.owner === f.id));
  assert.ok(w.regions[mx.capital].owner === mx.id, 'the capital stays with the government');
  assert.ok(Object.values(w.forces).some((x) => x.nation === f.id), 'the rebels have forces');
  assert.ok(activeWars(w).some((x) => x.att === mx.id && x.def === f.id && x.kind === 'civil'));
  assert.ok(!(f.recognisedBy ?? []).includes(mx.id));
  advance(w, 10 * DAY, false);
  assert.ok(audit(w).ok);
});

test('a merger moves land, people and money, and the absorbed state ceases to exist', () => {
  const w = fresh(2402);
  advance(w, 2 * DAY, false);
  const mx = by(w, 'MEX');
  const f = startCivilWar(w, mx, 'A test')!;
  const people = census(w).all.filter((c) => c.nation === f.id).length;
  assert.ok(people > 0);
  const before = census(w).all.filter((c) => c.nation === mx.id).length;
  mergeState(w, f, mx, 'crushed');
  assert.ok(f.dissolved != null && f.exile);
  assert.equal(census(w).all.filter((c) => c.nation === f.id && !c.gone).length, 0);
  assert.ok(census(w).all.filter((c) => c.nation === mx.id).length >= before + people - 1);
  assert.ok(!w.regions.some((r) => r.owner === f.id));
  assert.ok(!activeWars(w).some((x) => x.att === f.id || x.def === f.id));
  assert.ok(audit(w).ok, JSON.stringify(audit(w).problems.slice(0, 3)));
  const w2 = deserialize(serialize(w));
  advance(w2, 5 * DAY, false);
  assert.ok(audit(w2).ok);
});

test('rebels who take the capital rule the whole country', () => {
  const w = fresh(2403);
  advance(w, 2 * DAY, false);
  const mx = by(w, 'MEX');
  const f = startCivilWar(w, mx, 'A test')!;
  const leader = f.president!;
  const war = activeWars(w).find((x) => x.def === f.id)!;
  w.regions[mx.capital].owner = f.id;
  war.status = 'ended';
  war.outcome = 'deadline';
  advance(w, DAY, false);
  assert.ok(f.dissolved != null);
  assert.equal(mx.president, leader);
  assert.ok(regimeOf(mx).history.some((h) => /rebels won/.test(h.why)));
  assert.ok(audit(w).ok);
});

test('failed states, restoration of exiles, and voluntary unions', () => {
  const w = fresh(2404);
  advance(w, 2 * DAY, false);
  // A failed state.
  const ar = by(w, 'ARG');
  const keep = ar.wallet[ar.cur];
  for (let i = 0; i < 40 && ar.failedSince == null; i++) {
    regimeOf(ar).legitimacy = 5;
    ar.wallet[ar.cur] = 0;
    for (const r of w.regions) if (r.owner === ar.id) r.unrest = 90;
    civilMonth(w);
  }
  assert.ok(ar.failedSince != null);
  ar.wallet[ar.cur] = keep;
  regimeOf(ar).legitimacy = 60;
  for (const r of w.regions) if (r.owner === ar.id) r.unrest = 10;
  civilMonth(w);
  assert.equal(ar.failedSince, undefined);
  // Restoration: an occupied country's people rise.
  const za = by(w, 'ZAF');
  const home = w.regions.filter((r) => r.owner === za.id);
  for (const r of home) r.owner = ar.id;
  za.exile = true;
  for (let i = 0; i < 200 && za.exile; i++) { for (const r of home) r.unrest = 90; civilMonth(w); }
  assert.ok(!za.exile, 'the government returned');
  // A voluntary union.
  const ca = by(w, 'CAN');
  const s = createState(w, ca, [w.regions.find((r) => r.name === 'Quebec')!.id], 'referendum');
  s.founded = w.time - 6 * 365 * DAY;
  for (let i = 0; i < 2000 && s.dissolved == null; i++) { s.relations[ca.id].score = 80; ca.relations[s.id].score = 80; civilMonth(w); }
  assert.equal(s.mergedInto, ca.id);
  assert.ok(audit(w).ok);
});

test('proxy wars, UN peacekeepers, puppets and insurgency', async () => {
  const { dipCheck, doDiplomacy } = await import('../src/sim/diplomacyActions');
  const { tableResolution, castVote, intlOf } = await import('../src/sim/intlOrgs');
  const { makePuppet } = await import('../src/sim/civilWar');
  const { warCheck } = await import('../src/sim/war');
  const w = fresh(2405);
  advance(w, 2 * DAY, false);
  const mx = by(w, 'MEX'), us = by(w, 'USA');
  const f = startCivilWar(w, mx, 'A test')!;
  // Arming the rebels.
  const ru = by(w, 'RUS');
  ru.dip = { capital: 100, last: {} };
  assert.equal(dipCheck(w, ru, 'arm', { target: f.id }), null);
  const eqBefore = Object.values(w.forces).filter((x) => x.nation === f.id).reduce((s, x) => s + x.equipment, 0);
  assert.ok(doDiplomacy(w, ru, 'arm', { target: f.id }).ok);
  assert.ok(Object.values(w.forces).filter((x) => x.nation === f.id).reduce((s, x) => s + x.equipment, 0) > eqBefore);
  assert.equal(f.armedBy?.[ru.id], 1);
  assert.ok(dipCheck(w, ru, 'arm', { target: by(w, 'DEU').id }), 'only rebels can be armed');
  // Peacekeepers freeze the civil war.
  const war = activeWars(w).find((x) => x.def === f.id)!;
  const st = intlOf(w);
  const sponsor = w.nations.find((n) => st.seats.some((s: any) => s.nation === n.id) || ['GBR', 'CHN', 'USA', 'RUS'].includes(n.iso) && n.id !== mx.id)!;
  const r = tableResolution(w, sponsor, 'sc', 'peacekeeping', mx.id);
  assert.ok(r, 'tabled');
  for (const id of Object.keys(w.nations)) { const n = w.nations[Number(id)]; if (n.id !== mx.id) try { castVote(w, n, r!, 'y'); } catch { /* not a voter */ } }
  r!.closes = w.time;
  advance(w, DAY, false);
  assert.equal(r!.status, 'passed');
  {
    assert.equal(war.status, 'frozen');
    assert.ok(war.peacekeepers && war.peacekeepers.until > w.time);
  }
  // A puppet state.
  makePuppet(w, f, us, 'a test');
  assert.equal(f.overlord, us.id);
  assert.ok(warCheck(w, f, { target: us.id, days: 30, goals: [] }));
  const goldBefore = us.wallet.GOLD ?? 0;
  f.wallet.GOLD = (f.wallet.GOLD ?? 0);
  civilMonth(w);
  assert.ok((us.wallet.GOLD ?? 0) >= goldBefore);
  // Insurgency on annexed land.
  const tr = by(w, 'TUR');
  const land = w.regions.filter((r) => r.owner === tr.id).slice(0, 3);
  for (const x of land) x.core = by(w, 'SAU').id;
  for (let i = 0; i < 6; i++) civilMonth(w);
  assert.ok((tr.insurgency ?? 0) >= 30, `insurgency ${tr.insurgency}`);
  assert.ok(audit(w).ok);
});
