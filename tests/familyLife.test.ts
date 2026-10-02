import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { cref, player } from '../src/sim/query';
import { c as cur } from '../src/engine/money';
import { appMatches, blend, childrenAway, compatibility, custody, familyLifeMonth, meetMatch, useApp, visitChildren } from '../src/sim/familyLife';
import { mutual } from '../src/sim/partnership';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 4501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const adults = (w: World) => census(w).all.filter((c) => !c.gone && !c.player && ageOf(w, c) >= 22);

test('custody, child support and step-families', () => {
  const w = fresh();
  advance(w, DAY, false);
  const a = adults(w).find((c) => (c.family?.kids.length ?? 0) > 0 && c.family?.partner != null && !w.citizens[c.family.partner!].player)!;
  assert.ok(a, 'a family with young children');
  const b = w.citizens[a.family!.partner!];
  const kids = a.family!.kids.length + b.family!.kids.length;
  custody(w, a, b);
  const home = a.family!.kids.length ? a : b, away = home === a ? b : a;
  assert.equal(home.family!.kids.length, kids, 'the children live with one parent');
  assert.ok(childrenAway(w, away).length === kids, 'the other keeps a link to them');
  // Child support is paid on the first of the month.
  const n = w.nations[away.nation];
  mint(w, cref(away.id), n.cur, cur(500), 'test');
  away.incomeAvg = Math.max(away.incomeAvg ?? 0, cur(5));
  const h0 = home.wallet[n.cur] ?? 0;
  familyLifeMonth(w);
  assert.ok((home.wallet[n.cur] ?? 0) > h0, 'child support paid');
  // A new marriage blends the families.
  const c = adults(w).find((x) => x.family?.partner == null && x !== away)!;
  blend(home, c);
  assert.ok(home.family!.kids.every((k) => k.step === c.id));
  assert.ok(audit(w).ok);
});

test('dating apps match people who would get on; the player meets a match', () => {
  const w = fresh(4502);
  advance(w, DAY, false);
  const p = player(w);
  const all = adults(w);
  const x = all[0];
  assert.ok(compatibility(w, x, x) > 0.9, 'like with like');
  const m = appMatches(w, x);
  for (const y of m) assert.ok(mutual(w, x, w.citizens[y.id]));
  if (p.family?.partner == null) {
    mint(w, cref(p.id), w.nations[p.nation].cur, cur(20), 'test');
    const r = useApp(w);
    assert.ok(r.ok, r.msg);
    if (p.matches?.length) { p.energy = 100; assert.ok(meetMatch(w, p.matches[0].id).ok); }
  }
  // Over months, some singles meet through apps.
  const coupled0 = all.filter((c) => c.family?.partner != null).length;
  for (let k = 0; k < 6; k++) familyLifeMonth(w);
  assert.ok(all.filter((c) => c.family?.partner != null).length >= coupled0);
  assert.ok(visitChildren(w).ok === false, 'no children living apart');
  assert.ok(audit(w).ok);
});
