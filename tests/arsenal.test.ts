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
  assert.ok(a[cls].age < old / 2, `renewed to ${a[cls].age}`);
});

test('defence contracts flow through the ledger', () => {
  const w = fresh(304);
  advance(w, 20 * DAY, false);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.ok(w.nations.some((n) => (n.defense.month?.procurement ?? 0) > 0 || n.defense.upkeepK != null));
});
