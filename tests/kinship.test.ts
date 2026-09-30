import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { c as cur } from '../src/engine/money';
import { census } from '../src/sim/census';
import { cref, player } from '../src/sim/query';
import { ageOf, bornYearsAgo, lifeYear } from '../src/sim/growth';
import { bereave, fam } from '../src/sim/family';
import { populationDaily } from '../src/sim/population';
import { adoptChildCheck, adoptionsDaily, applyToAdopt, adoptPet, careForPet, conceive, expecting, giftCheck, giveGift, petsOf, siblingsOf } from '../src/sim/kinship';
import { deserialize, serialize } from '../src/engine/save';
import { hobbyCheck, pursueHobby } from '../src/sim/hobbies';
import { lifeOf, routineOf } from '../src/sim/lifecycle';

registerSystems();
const fresh = (seed = 401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });

test('a pregnancy ends in a birth about nine months later', () => {
  const w = fresh();
  const p = player(w);
  const npc = census(w).all.find((c) => !c.player && !c.gone && ageOf(w, c) >= 20 && ageOf(w, c) < 40)!;
  w.settings.lifeYearDays = 24; // a fast pace of life: due in about 18 days
  conceive(w, p, npc);
  assert.ok(expecting(w, p));
  const before = fam(p).kids.length + fam(p).children.length;
  const w2 = deserialize(serialize(w));
  assert.equal(w2.life.pregnancies.length, w.life.pregnancies.length, 'survives save/load');
  advance(w, Math.round(lifeYear(w) * 0.5), false);
  assert.equal(fam(p).kids.length + fam(p).children.length, before, 'not yet');
  advance(w, Math.round(lifeYear(w) * 0.3), false);
  assert.equal(fam(p).kids.length + fam(p).children.length, before + 1, 'born');
  assert.equal(expecting(w, p), undefined);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('gifts: flowers are paid for, items change hands, one a day', () => {
  const w = fresh(402);
  const p = player(w);
  const npc = census(w).all.find((c) => !c.player && !c.gone)!;
  npc.loc = p.loc;
  const code = w.nations[p.nation].cur;
  mint(w, cref(p.id), code, cur(100), 'test');
  const rel = npc.rel[p.id] ?? 0;
  const r = giveGift(w, npc.id, 'flowers');
  assert.ok(r.ok, r.msg);
  assert.ok((npc.rel[p.id] ?? 0) > rel, 'warmer');
  assert.match(giftCheck(w, p, npc, 'flowers') ?? '', /one gift a day/i);
  advance(w, DAY, false);
  npc.loc = p.loc;
  const key = Object.keys(p.inv).find((k) => k.startsWith('clothing') || k.startsWith('food'));
  if (key) {
    const had = p.inv[key]!;
    const g = giveGift(w, npc.id, key);
    assert.ok(g.ok, g.msg);
    assert.equal(p.inv[key] ?? 0, had - 1);
    assert.ok((npc.inv[key] ?? 0) >= 1);
  }
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('pets are adopted, cared for, cost upkeep and are rehomed if neglected', () => {
  const w = fresh(403);
  const p = player(w);
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(500), 'test');
  const a = adoptPet(w, 'dog');
  assert.ok(a.ok, a.msg);
  const pet = petsOf(w, p)[0];
  assert.equal(careForPet(w, pet.id).ok, false, 'settling in on the first day');
  advance(w, DAY, false);
  p.energy = 100;
  const bond = pet.bond;
  assert.ok(careForPet(w, pet.id).ok);
  assert.equal(pet.bond, bond + 8);
  assert.equal(careForPet(w, pet.id).ok, false, 'once a day');
  const w2 = deserialize(serialize(w));
  assert.equal(w2.life.pets.length, 1, 'survives save/load');
  advance(w, 25 * DAY, false);
  assert.equal(petsOf(w, p).length, 0, 'neglected for weeks, rehomed');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('siblings are the other children of one’s parents', () => {
  const w = fresh(404);
  const kid = census(w).all.find((c) => fam(c).parents.some((id) => { const par = w.citizens[id]; return par && fam(par).children.length + fam(par).kids.length > 1; }));
  if (!kid) return;
  const s = siblingsOf(w, kid);
  assert.ok(s.grown.length + s.young.length >= 1);
  assert.ok(!s.grown.some((x) => x.id === kid.id));
});

test('hobbies: learned by doing, once a day, and part of the routine', () => {
  const w = fresh(405);
  const p = player(w);
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(100), 'test');
  p.energy = 100;
  const r = pursueHobby(w, 'painting');
  assert.ok(r.ok, r.msg);
  const once = lifeOf(p).hobbies.painting;
  assert.ok(once > 0);
  assert.match(hobbyCheck(w, p, 'running') ?? '', /one hobby evening a day/i);
  routineOf(w).hobby = 'painting';
  advance(w, 3 * DAY, false);
  assert.ok(lifeOf(p).hobbies.painting > once, 'the routine kept it up');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('adoption: fees to the state, a month of assessment, then a child comes home', () => {
  const w = fresh(406);
  const p = player(w);
  const code = w.nations[p.nation].cur;
  mint(w, cref(p.id), code, cur(400), 'test');
  w.life.orphans.push({ name: 'Sam Waiting', born: bornYearsAgo(w, 6, 10), parents: [], region: p.home });
  const r = applyToAdopt(w);
  assert.ok(r.ok, r.msg);
  assert.match(adoptChildCheck(w, p) ?? '', /already/);
  const before = fam(p).kids.length;
  advance(w, 31 * DAY, false);
  assert.equal(fam(p).kids.length, before + 1);
  const kid = fam(p).kids.at(-1)!;
  assert.equal(kid.how, 'adopted');
  assert.equal(kid.name.split(' ')[0], 'Sam');
  assert.ok(!w.life.orphans.some((o) => o.name === 'Sam Waiting'), 'no longer in care');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('children with nobody left go into care, and leave it at 18 with a grant, not minted money', () => {
  const w = fresh(407);
  const parent = census(w).all.find((c) => !c.player && c.family?.status === 'single' && !c.family.parents.some((id) => w.citizens[id] && !w.citizens[id].gone) && !c.family.children.length)!;
  fam(parent).parents = [];
  fam(parent).kids.push({ name: 'Alex Alone', born: bornYearsAgo(w, 17, 360) });
  bereave(w, parent);
  const o = w.life.orphans.find((x) => x.name === 'Alex Alone');
  assert.ok(o, 'in care');
  o!.born = bornYearsAgo(w, 18, 1);
  const minted = () => w.ledger.filter((e) => /Arrival savings/.test(e.text)).length;
  const m0 = minted();
  adoptionsDaily(w);
  const c = census(w).all.find((x) => x.name === 'Alex Alone');
  assert.ok(c, 'came of age as a citizen');
  assert.equal(minted(), m0, 'no money from nowhere');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('a child coming of age gets a start from the family, and children cost money to raise', () => {
  const w = fresh(408);
  const p = player(w);
  const code = w.nations[p.nation].cur;
  mint(w, cref(p.id), code, cur(500), 'test');
  fam(p).kids.push({ name: 'Kim Grown', born: bornYearsAgo(w, 18, 1) });
  const cash = p.wallet[code]!;
  populationDaily(w);
  const c = census(w).all.find((x) => x.name === 'Kim Grown')!;
  assert.ok(c);
  assert.ok(p.wallet[code]! < cash, 'the parent paid for the start');
  fam(p).kids.push({ name: 'Lee Small', born: bornYearsAgo(w, 4, 1) });
  advance(w, 2 * DAY, false);
  assert.ok(w.ledger.some((e) => e.text === 'Raising children'));
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
