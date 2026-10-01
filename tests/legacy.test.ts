import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { audit, burn, mint } from '../src/engine/ledger';
import { c as cur } from '../src/engine/money';
import { census } from '../src/sim/census';
import { cref, player } from '../src/sim/query';
import { bornYearsAgo } from '../src/sim/growth';
import { addHeirloom, continueAsNewcomer, playerDies, successor, writeWill } from '../src/sim/legacy';
import { bereave, fam, kidComesOfAge } from '../src/sim/family';
import { releaseRoles, settleEstate } from '../src/sim/population';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();
const deps = { releaseRoles, settleEstate, bereave };

test('the player dies: the will is followed, children get trusts, play continues as the heir', () => {
  const w = generateWorld(1201, 'Elder', 0, { citizensPerRegion: 3 });
  const p = player(w);
  const code = w.nations[p.nation].cur;
  const [friend, child] = census(w).all.filter((c) => !c.player && !c.gone && !fam(p).parents.includes(c.id));
  child.born = bornYearsAgo(w, 30, 1);
  fam(p).children.push(child.id); fam(child).parents.push(p.id);
  fam(p).kids.push({ name: 'Tess Young', born: bornYearsAgo(w, 10, 1) });
  burn(w, cref(p.id), code, p.wallet[code] ?? 0, 'test');
  mint(w, cref(p.id), code, cur(1000), 'test');
  addHeirloom(w, p, 'Pocket watch', 'grandfather');
  assert.ok(writeWill(w, [{ id: friend.id, share: 0.2 }], 0.3).ok);
  const fb = friend.wallet[code] ?? 0, cb = child.wallet[code] ?? 0;
  assert.equal(successor(w, p)?.id, child.id);
  const heir = playerDies(w, 'of old age', deps);
  assert.equal(heir?.id, child.id);
  assert.equal(w.playerId, child.id);
  assert.ok(child.player && p.gone);
  assert.ok((friend.wallet[code] ?? 0) > fb, 'bequest paid');
  assert.ok((child.wallet[code] ?? 0) > cb, 'the heir inherits the rest');
  assert.equal(w.trusts!.length, 1, 'a trust for the child at home');
  assert.ok(child.life!.heirlooms!.some((h) => h.name === 'Pocket watch'));
  assert.equal(w.legacy!.length, 1);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  // The trust is paid when the child comes of age.
  const t = w.trusts![0];
  const kid = fam(child).kids.find((k) => k.name === 'Tess Young') ?? { name: t.kid, born: t.born };
  kid.born = bornYearsAgo(w, 18, 1); t.born = kid.born;
  const grown = kidComesOfAge(w, child, kid);
  assert.ok((grown.wallet[code] ?? 0) >= t.amount);
  assert.equal(w.trusts!.length, 0);
  const w2 = deserialize(serialize(w));
  assert.equal(w2.playerId, child.id);
});

test('a line without heirs ends; a new life can begin', () => {
  const w = generateWorld(1202, 'Alone', 0, { citizensPerRegion: 3 });
  const p = player(w);
  fam(p).parents = []; fam(p).partner = null; fam(p).status = 'single'; fam(p).children = [];
  assert.equal(playerDies(w, 'suddenly', deps), null);
  assert.ok(w.life.ended);
  assert.ok(continueAsNewcomer(w).ok);
  assert.ok(!player(w).gone);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
