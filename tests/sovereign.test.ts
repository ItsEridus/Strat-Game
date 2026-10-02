import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { creditOf, defaultOn, independenceOf, ratePressure, ratingLabel, ratingSpread, ratingTarget } from '../src/sim/sovereign';
import { bondRate } from '../src/sim/publicFinance';

registerSystems();
const fresh = (seed = 3101) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('credit ratings start from 2025, set bond spreads and fall with debt', () => {
  const w = fresh();
  advance(w, 8 * DAY, false);
  const de = by(w, 'DEU'), ar = by(w, 'ARG'), us = by(w, 'USA');
  assert.equal(ratingLabel(creditOf(de).score), 'AAA');
  assert.equal(ratingLabel(creditOf(ar).score), 'CCC');
  assert.equal(ratingLabel(creditOf(us).score), 'AA+');
  assert.ok(ratingSpread(ar) > ratingSpread(us) && ratingSpread(us) > ratingSpread(de));
  const t0 = ratingTarget(w, de);
  de.debt = Math.round((de.stats.revHist.reduce((a: number, b: number) => a + b, 0) / Math.max(1, de.stats.revHist.length)) * 365 * 2);
  assert.ok(ratingTarget(w, de) < t0 - 3, 'two years of revenue in new debt costs several notches');
});

test('dependent central banks are leaned on; a default restructures the debt and costs dearly', () => {
  const w = fresh(3102);
  advance(w, 8 * DAY, false);
  const tr = by(w, 'TUR'), ca = by(w, 'CAN');
  assert.ok(independenceOf(tr) < independenceOf(ca));
  tr.approval = 20; ca.approval = 20;
  assert.ok(ratePressure(w, tr) > ratePressure(w, ca));
  const ar = by(w, 'ARG');
  ar.debt = 1_000_000;
  const fx0 = ar.fxAnchor, appr = ar.approval, b0 = bondRate(ar);
  defaultOn(w, ar, 'a test');
  assert.ok(ar.debt < 1_000_000 * 0.71 && ar.debt >= 1_000_000 * 0.5 - 1);
  assert.equal(creditOf(ar).score, 0);
  assert.ok(ar.fxAnchor > fx0 && ar.approval < appr);
  assert.ok(bondRate(ar) > b0);
  assert.ok(w.log.some((e: any) => /defaulted on its debt/.test(e.text)));
  advance(w, 2 * DAY, false);
  assert.ok(audit(w).ok);
});
