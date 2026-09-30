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
import { ageOf, lifeYear } from '../src/sim/growth';
import { fam } from '../src/sim/family';
import { adoptPet, careForPet, conceive, expecting, giftCheck, giveGift, petsOf, siblingsOf } from '../src/sim/kinship';
import { deserialize, serialize } from '../src/engine/save';

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
