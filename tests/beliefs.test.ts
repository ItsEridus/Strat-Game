import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { believed, believedPower, collectionQuality, estimateOf, refresh } from '../src/sim/beliefs';
import { militaryPower, declareWar } from '../src/sim/war';
import { orgOf } from '../src/sim/intelOrg';

registerSystems();
const fresh = (seed = 1201) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test("better services see more clearly; the truth for one's own country", () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), mx = by(w, 'MEX'), cn = by(w, 'CHN');
  assert.ok(collectionQuality(w, us, cn) > collectionQuality(w, mx, cn) + 0.15);
  assert.ok(estimateOf(w, us, cn).sd.mil < estimateOf(w, mx, cn).sd.mil);
  assert.equal(believedPower(w, us.id, us.id), militaryPower(w, us.id));
  // A dossier sharpens the picture.
  const e = estimateOf(w, mx, cn);
  e.bias.mil = 0.5;
  refresh(w, mx, cn, 1);
  assert.ok(Math.abs(e.bias.mil) < 0.4, `fresh material corrects most of a misperception (${e.bias.mil})`);
});

test('over months, better-funded services make smaller errors', () => {
  const w = fresh(1202);
  advance(w, DAY, false);
  // Build up one service, starve another.
  const gb = by(w, 'GBR'), ar = by(w, 'ARG');
  for (const d of Object.keys(orgOf(gb).dirs) as (keyof ReturnType<typeof orgOf>['dirs'])[]) { orgOf(gb).dirs[d] = 95; orgOf(ar).dirs[d] = 10; }
  for (let i = 0; i < 40; i++) for (const t of w.nations) if (t.id !== gb.id && t.id !== ar.id) { refresh(w, gb, t); refresh(w, ar, t); }
  const err = (n: any) => w.nations.filter((t: any) => t.id !== n.id).reduce((s: number, t: any) => s + Math.abs(estimateOf(w, n, t).bias.mil), 0) / 15;
  assert.ok(err(gb) < err(ar) * 0.6, `${err(gb)} vs ${err(ar)}`);
});

test("an attack the defender did not expect is a surprise, and the attacker's estimate is kept", () => {
  const w = fresh(1203);
  advance(w, DAY, false);
  const br = by(w, 'BRA'), ar = by(w, 'ARG');
  estimateOf(w, ar, br).bias.hostile = -100; // Argentina thinks Brazil is a friend
  w.wars = {};
  const war = declareWar(w, br, { target: ar.id, days: 14, goals: [] });
  assert.equal(war.surprise, true);
  assert.ok(war.intelGap && war.intelGap.truth > 0);
  assert.ok(believed(w, ar, br, 'hostile') < 40);
  assert.ok(audit(w).ok);
});
