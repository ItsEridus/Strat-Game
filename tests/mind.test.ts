import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ideologyFit, mindMonth, mindOf, valueDistance, valueOf, valuesOf } from '../src/sim/mind';
import { serialize, deserialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 3701) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('values follow country, age and politics; experience shapes personality, with the cause recorded', () => {
  const w = fresh();
  advance(w, DAY, false);
  const all = census(w).all.filter((c) => !c.player);
  const avgFaith = (iso: string) => { const xs = all.filter((c) => w.nations[c.nation].iso === iso); return xs.reduce((t, c) => t + valueOf(w, c, 'faith'), 0) / xs.length; };
  assert.ok(avgFaith('SAU') > avgFaith('JPN') + 0.15, 'faith follows the country');
  const a = all[0], b = all[1];
  assert.ok(valueDistance(w, a, a) === 0 && valueDistance(w, a, b) >= 0);
  assert.ok(ideologyFit(w, a, a.ideo) >= 0 && ideologyFit(w, a, a.ideo) <= 1);
  assert.equal(a.mind, undefined, 'nothing is stored until experience shapes someone');
  // A war veteran grows cautious.
  const v = all.find((c) => !c.flags.veteranOf)!;
  const risk0 = v.traits.risk;
  v.flags.veteranOf = 999;
  mindMonth(w);
  assert.ok(v.traits.risk < risk0);
  assert.ok(mindOf(w, v).log.some((l) => /war/.test(l.why)));
  mindMonth(w);
  assert.equal(mindOf(w, v).log.filter((l) => l.trait === 'risk').length, 1, 'the same experience shapes once');
  const w2 = deserialize(serialize(w));
  assert.ok(w2.citizens[v.id].mind?.log.length);
  assert.ok(Object.keys(valuesOf(w, b)).length === 5);
  assert.ok(audit(w).ok);
});
