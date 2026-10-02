import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { cref, player } from '../src/sim/query';
import { c as cur } from '../src/engine/money';
import { die } from '../src/sim/population';
import { fam } from '../src/sim/family';
import { birthplaceOf, familyHomeLabel, gravesOf, homecomingCheck, raiseMemorial, visitGrave } from '../src/sim/ancestry';
import { settleHome } from '../src/sim/housing';

registerSystems();

test('the family home, graves and memorials, birthplaces', () => {
  const w = generateWorld(6001, 'T', 0, { citizensPerRegion: 2 });
  advance(w, DAY, false);
  const p = player(w);
  assert.equal(birthplaceOf(p), p.home);
  assert.ok(homecomingCheck(w, p), 'you live where you were born');
  const parent = census(w).all.find((c) => !c.player && !c.gone && c.home === p.home)!;
  fam(p).parents.push(parent.id); fam(parent).children.push(p.id);
  parent.dwelling = { kind: 'own', region: p.home, size: 'house', since: 0 };
  p.dwelling = { kind: 'rent', region: p.home, size: 'flat', since: 0 };
  settleHome(w, parent, p);
  assert.ok(familyHomeLabel(p)?.includes('generation 2'), 'the family home passes down');
  die(w, parent, 'of old age');
  assert.ok(gravesOf(w, p).some((g) => g.id === parent.id));
  p.loc = parent.home;
  assert.ok(visitGrave(w, parent.id).ok);
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(500), 'test');
  assert.ok(raiseMemorial(w, parent.id).ok);
  assert.ok(parent.memorial);
  assert.ok(!raiseMemorial(w, parent.id).ok, 'one memorial');
  assert.ok(audit(w).ok);
});
