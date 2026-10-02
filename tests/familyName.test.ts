import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { almanacOf } from '../src/sim/almanac';
import { dynastyVote, familyFirmLabel, handDown, moneyKind, surnameOf } from '../src/sim/familyName';
import { fam } from '../src/sim/family';

registerSystems();

test('political dynasties, old money and family firms', () => {
  const w = generateWorld(5901, 'T', 0, { citizensPerRegion: 2 });
  advance(w, DAY, false);
  const all = census(w).all.filter((c) => !c.player && ageOf(w, c) >= 30);
  const [elder, heir] = all;
  heir.name = `Ann ${surnameOf(elder.name)}`;
  fam(elder).children.push(heir.id); fam(heir).parents.push(elder.id);
  heir.nation = elder.nation;
  (almanacOf(w).leaders[elder.nation] ??= []).push({ id: elder.id, name: elder.name, from: 0, to: w.time });
  assert.ok(dynastyVote(w, heir, 'capitalism') > 0, 'a political dynasty');
  const co = Object.values(w.companies)[0];
  handDown(w, co, elder, heir);
  assert.ok(familyFirmLabel(co)?.includes('generation 2'));
  co.owner = { k: 'cit', id: heir.id };
  assert.equal(moneyKind(w, heir), 'old', 'a family firm is old money');
  assert.ok(audit(w).ok);
});
