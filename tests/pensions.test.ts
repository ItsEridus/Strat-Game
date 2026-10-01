import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { player } from '../src/sim/query';
import { bornYearsAgo } from '../src/sim/growth';
import { contribute, pensionOf, pensionRules, pensionsDaily, retire, retireCheck } from '../src/sim/pensions';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 1001) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });

test('wages pay into a pension; retiring starts state and private pensions', () => {
  const w = fresh();
  const p = player(w);
  const code = w.nations[p.nation].cur;
  for (let i = 0; i < 100; i++) contribute(w, p, 1000, code);
  assert.equal(pensionOf(p).days, 100);
  if (pensionRules(w, p).contrib) assert.ok(pensionOf(p).pot > 0);
  assert.match(retireCheck(w, p) ?? '', /earliest/);
  p.born = bornYearsAgo(w, pensionRules(w, p).age, 1);
  pensionOf(p).days = 8000;
  const r = retire(w);
  assert.ok(r.ok, r.msg);
  assert.ok(p.retired && p.job == null);
  const before = p.wallet[code] ?? 0;
  w.time += DAY; pensionsDaily(w);
  assert.ok((p.wallet[code] ?? 0) > before, 'paid a pension');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  assert.equal(deserialize(serialize(w)).citizens[p.id].pension!.days, 8000);
});

test('NPCs retire around their country pension age and draw pensions', () => {
  const w = fresh(1002);
  const old = census(w).all.filter((c) => !c.player && !c.retired).slice(0, 30);
  for (const c of old) c.born = bornYearsAgo(w, pensionRules(w, c).age + 2, 1);
  for (let i = 0; i < 60; i++) { w.time += DAY; pensionsDaily(w); }
  assert.ok(old.filter((c) => c.retired).length > 5);
  assert.ok(old.filter((c) => c.retired).every((c) => c.pension?.state != null));
});
