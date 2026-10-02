import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { gamesOf, softPowerOf, studentPull } from '../src/sim/softPower';
import { statisticalSkip } from '../src/sim/statYear';
import { dateAt } from '../src/engine/calendar';

registerSystems();
const fresh = (seed = 3401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('soft power starts from 2025, draws students, and the Olympics come round', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), za = by(w, 'ZAF');
  assert.equal(softPowerOf(us), 79);
  assert.ok(softPowerOf(us) > softPowerOf(za));
  assert.ok(studentPull(us) > studentPull(za));
  const g = gamesOf(w);
  assert.ok(g.some((e) => e.kind === 'olympics' && e.year === 2028 && e.host === us.id));
  // Skip to after Los Angeles 2028.
  while (dateAt(w.time).year < 2030) statisticalSkip(w, w.time + 365 * DAY);
  const la = gamesOf(w).find((e) => e.year === 2028)!;
  assert.ok(la.done && (us.hosted ?? 0) >= 1);
  assert.ok(gamesOf(w).some((e) => e.kind === 'olympics' && e.year === 2036), 'the 2036 host was chosen seven years ahead');
  assert.ok(audit(w).ok);
});
