import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { divisionOf, identityVote, measureDivision, prideOf, prideOfNation, regionalOf } from '../src/sim/identity';
import { statisticalSkip } from '../src/sim/statYear';

registerSystems();
const fresh = (seed = 5501) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('pride by country and person; regional attachment; division; identity in votes', () => {
  const w = fresh();
  advance(w, DAY, false);
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!;
  assert.ok(prideOfNation(by('IND')) > prideOfNation(by('DEU')) + 30, 'Indians prouder than Germans');
  const all = census(w).all.filter((c) => !c.player && ageOf(w, c) >= 20);
  const c = all[0];
  const p0 = prideOf(w, c);
  c.origin = (c.nation + 1) % w.nations.length;
  assert.ok(prideOf(w, c) < p0, 'newcomers are less proud of their new country');
  delete c.origin;
  assert.ok(regionalOf(w, c) >= 0 && regionalOf(w, c) <= 100);
  const proud = all.find((x) => prideOf(w, x) > 70), cool = all.find((x) => prideOf(w, x) < 35);
  if (proud && cool) assert.ok(identityVote(w, proud, 'nationalism') > identityVote(w, cool, 'nationalism'));
  for (const n of w.nations) { const d = measureDivision(w, n); assert.ok(d >= 0 && d <= 100); }
  statisticalSkip(w, w.time + 100 * DAY);
  assert.ok(w.nations.every((n) => n.dissolved != null || n.exile || (divisionOf(n) >= 0 && prideOfNation(n) > 0)));
  assert.ok(audit(w).ok);
});
