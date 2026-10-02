import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { census } from '../src/sim/census';
import { changeRegime, isDemocracy, managedBonus, regimeOf, termLimited } from '../src/sim/regimes';

registerSystems();
const fresh = (seed = 2001) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('the regimes of 2025: democracies hold free elections, autocracies manage theirs', () => {
  const w = fresh();
  advance(w, DAY, false);
  assert.equal(regimeOf(by(w, 'DEU')).type, 'full');
  assert.equal(regimeOf(by(w, 'CHN')).type, 'oneparty');
  assert.equal(regimeOf(by(w, 'SAU')).type, 'monarchy');
  assert.ok(isDemocracy(by(w, 'USA')) && !isDemocracy(by(w, 'RUS')));
  const ru = by(w, 'RUS'), de = by(w, 'DEU');
  if (ru.president != null) assert.ok(managedBonus(w, ru, w.citizens[ru.president], null) > 0, 'the incumbent is favoured');
  if (de.president != null) assert.equal(managedBonus(w, de, w.citizens[de.president], null), 0);
});

test('term limits stop a third run in a democracy, not in an autocracy; regimes change with a reason', () => {
  const w = fresh(2002);
  advance(w, DAY, false);
  const us = by(w, 'USA'), ru = by(w, 'RUS');
  const a = census(w).all.find((c: any) => c.nation === us.id && !c.player)!;
  a.flags.termsServed = 2;
  assert.ok(termLimited(w, us, a));
  const b = census(w).all.find((c: any) => c.nation === ru.id && !c.player)!;
  b.flags.termsServed = 5;
  assert.ok(!termLimited(w, ru, b));
  changeRegime(w, us, 'hybrid', 'a test');
  assert.equal(regimeOf(us).type, 'hybrid');
  assert.equal(regimeOf(us).history[0].why, 'a test');
  assert.ok(w.log.some((e: any) => /became a hybrid regime/.test(e.text)));
});
