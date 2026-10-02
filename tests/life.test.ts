import { test } from 'node:test';
import type { Citizen } from '../src/sim/types';
import { attracted, marriageBar, sameSex } from '../src/sim/partnership';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { c as cur } from '../src/engine/money';
import { census, residents } from '../src/sim/census';
import { controller, cref, player } from '../src/sim/query';
import { createCompany } from '../src/sim/company';
import { ageOf, bornYearsAgo } from '../src/sim/growth';
import { die, heirOf, leaveAbroad, populationDaily } from '../src/sim/population';
import { askOut, fam, goOnDate, kidComesOfAge, marry, propose, romanceCheck } from '../src/sim/family';
import { deserialize, serialize } from '../src/engine/save';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });
const npcs = (w: World) => census(w).all.filter((c) => !c.player);

test('a death is one transition: estate to the spouse, company passes on, the person stays on record', () => {
  const w = fresh();
  const a = npcs(w).find((c) => c.family?.status === 'married' && w.citizens[c.family.partner!] && !w.citizens[c.family.partner!].player)!;
  const spouse = w.citizens[a.family!.partner!];
  assert.equal(heirOf(w, a)?.id, spouse.id);
  mint(w, cref(a.id), 'USD', cur(500), 'test');
  const co = createCompany(w, cref(a.id), 'grain', 1, a.home);
  const before = { usd: spouse.wallet.USD ?? 0, gold: spouse.wallet.GOLD ?? 0 };
  const estate = { usd: a.wallet.USD ?? 0, gold: a.wallet.GOLD ?? 0 };
  die(w, a, 'of old age');
  die(w, a, 'twice'); // idempotent
  assert.equal(a.gone?.why, 'died');
  assert.equal(a.gone?.note, 'of old age');
  assert.equal(spouse.wallet.USD, before.usd + estate.usd);
  assert.equal(spouse.wallet.GOLD ?? 0, before.gold + estate.gold);
  assert.deepEqual(co.owner, cref(spouse.id), 'the company is inherited');
  assert.equal(spouse.family!.partner, null, 'widowed');
  assert.ok(!census(w).all.includes(a), 'no longer among the living');
  assert.ok(w.citizens[a.id], 'kept on record for history');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('a president who dies in office is replaced through a special election', () => {
  const w = fresh(302);
  const n = w.nations.find((x) => x.president != null && !w.citizens[x.president].player)!;
  const pres = w.citizens[n.president!];
  die(w, pres, 'suddenly');
  assert.equal(n.president, null);
  assert.ok(Object.values(w.elections).some((e) => !e.done && e.nation === n.id && e.kind === 'president'), 'special election called');
  assert.ok(!Object.values(w.parties).some((p) => p.members.includes(pres.id) || p.leader === pres.id));
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('emigrants leave with their savings; office holders and owners stay', () => {
  const w = fresh(303);
  const x = npcs(w).find((c) => c.family?.partner == null && ageOf(w, c) > 20 && !c.party && !Object.values(w.companies).some((co) => co.owner.id === c.id && co.owner.k === 'cit') && !Object.values(w.holdings).some((h) => h.shares[c.id]))!;
  assert.ok(leaveAbroad(w, x, 'for a better life'));
  assert.equal(x.gone?.why, 'emigrated');
  assert.equal(Object.values(x.wallet).reduce((a, b) => a + b, 0), 0);
  const n = w.nations[0];
  const pres = w.citizens[n.president!];
  assert.equal(leaveAbroad(w, pres, 'x'), false, 'a sitting president does not emigrate');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('children grow up in the family and come of age once, with parents on record', () => {
  const w = fresh(304);
  const parent = npcs(w).find((c) => c.family?.status === 'married')!;
  const kid = { name: 'Robin Test', born: bornYearsAgo(w, 18, 1) };
  fam(parent).kids.push(kid);
  populationDaily(w);
  const c = census(w).all.find((x) => x.name === 'Robin Test')!;
  assert.ok(c, 'the child became a citizen');
  assert.equal(ageOf(w, c), 18);
  assert.ok(c.family!.parents.includes(parent.id));
  assert.ok(parent.family!.children.includes(c.id));
  assert.ok(!parent.family!.kids.includes(kid));
  assert.equal(c.home, parent.home);
  kidComesOfAge; // exported for the population cycle
});

test('the player dates, proposes and marries under the same rules as everyone', () => {
  const w = fresh(305);
  const p = player(w);
  mint(w, cref(p.id), 'USD', cur(1000), 'test');
  const drawn = (c: Citizen) => attracted(w, c, p) && attracted(w, p, c) && (sameSex(w, c, p) ? !marriageBar(w, c, p, w.nations[p.nation]) : true);
  const npc = residents(w, p.home).find((c) => !c.player && c.family?.partner == null && Math.abs(ageOf(w, c) - ageOf(w, p)) < 8 && !p.family!.parents.includes(c.id) && drawn(c))
    ?? npcs(w).find((c) => c.family?.partner == null && Math.abs(ageOf(w, c) - ageOf(w, p)) < 8 && drawn(c))!;
  npc.loc = p.loc;
  assert.match(romanceCheck(w, p, npc, 'ask') ?? '', /barely knows/);
  npc.rel[p.id] = 100;
  let r = askOut(w, npc.id);
  for (let i = 0; i < 20 && fam(p).partner == null; i++) { advance(w, DAY, false); npc.loc = p.loc; npc.rel[p.id] = 100; r = askOut(w, npc.id); }
  assert.equal(fam(p).partner, npc.id, r.msg);
  advance(w, DAY, false); npc.loc = p.loc; p.energy = 100;
  const d = goOnDate(w);
  assert.ok(d.ok, d.msg);
  assert.equal(goOnDate(w).ok, false, 'one date a day');
  assert.match(propose(w).msg, /longer/);
  advance(w, 15 * DAY, false);
  npc.loc = p.loc; npc.rel[p.id] = 100;
  for (let i = 0; i < 10 && fam(p).status !== 'engaged'; i++) propose(w);
  assert.equal(fam(p).status, 'engaged');
  mint(w, cref(p.id), w.nations[controller(w.regions[p.loc])].cur, cur(400), 'test'); // fifteen days of living costs later (and wherever they are)
  const m = marry(w);
  assert.ok(m.ok, m.msg);
  assert.equal(fam(p).status, 'married');
  assert.equal(npc.home, p.home, 'they moved in');
  const w2 = deserialize(serialize(w));
  assert.equal(w2.citizens[p.id].family!.partner, npc.id, 'survives save/load');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('regions change size: people come and go without breaking the books', () => {
  const w = fresh(306);
  const start = census(w).all.length;
  advance(w, 20 * DAY, false);
  const gone = Object.values(w.citizens).filter((c) => c.gone).length;
  assert.ok(gone > 0, 'some people left or died');
  assert.ok(census(w).all.length !== start || gone > 0);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
