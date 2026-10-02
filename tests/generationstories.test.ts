import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { player } from '../src/sim/query';
import { bornYearsAgo } from '../src/sim/growth';
import { fam } from '../src/sim/family';
import { lifeOf } from '../src/sim/lifecycle';
import { chooseStory, triggerStory } from '../src/sim/story';
import { dynastyOf, generationOf } from '../src/sim/dynasty';
import { statisticalSkip } from '../src/sim/statYear';

registerSystems();
const fresh = (seed = 5801) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const grownChild = (w: ReturnType<typeof fresh>) => {
  const p = player(w);
  const child = census(w).all.find((c) => !c.player && !c.gone && !fam(p).parents.includes(c.id) && c.id !== fam(p).partner)!;
  child.born = bornYearsAgo(w, 25, 1);
  fam(p).children.push(child.id); fam(child).parents.push(p.id);
  return child;
};

test('stories of generations: an heirloom passed down, an offer for the family home, old letters', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const kid = grownChild(w);
  lifeOf(p).heirlooms = [{ name: 'Pocket watch', origin: "your grandfather's", t: w.time }];
  const a = triggerStory(w, 'gen.heirloom');
  assert.ok(a.ok, a.msg);
  assert.ok(chooseStory(w, (a as any).data.id, 'give', 'main').ok);
  assert.equal(lifeOf(kid).heirlooms?.[0]?.name, 'Pocket watch', 'the heirloom passed down');
  assert.ok(dynastyOf(w).events.some((e) => e.text.includes('pocket watch')));
  // The family home.
  p.dwelling = { kind: 'own', region: p.home, size: p.dwelling?.size ?? 'flat', since: w.time, gens: 2 } as any;
  const b = triggerStory(w, 'gen.homeOffer');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'keep', 'main').ok);
  assert.equal(p.dwelling!.kind, 'own');
  // An ancestor's letters, once the line has a second generation.
  dynastyOf(w).gens[p.id] = 2;
  const c = triggerStory(w, 'gen.letters');
  assert.ok(c.ok, c.msg);
  assert.ok(chooseStory(w, (c as any).data.id, 'write', 'main').ok);
  assert.ok(audit(w).ok);
});

test('skipped years: the player can die, and the line passes to an heir', () => {
  const w = fresh(5802);
  advance(w, DAY, false);
  const p = player(w);
  const kid = grownChild(w);
  p.born = bornYearsAgo(w, 99, 1);
  p.health = 5;
  w.settings.playerMortality = true;
  statisticalSkip(w, w.time + 3 * 365 * DAY);
  assert.ok(p.gone?.why === 'died', 'a 99-year-old in poor health dies within three skipped years');
  const now = player(w);
  assert.equal(now.id, kid.id, 'the child carries on');
  assert.equal(generationOf(w, kid.id), 2);
  assert.ok(dynastyOf(w).events.some((e) => e.kind === 'succession'));
  assert.ok(audit(w).ok);
});
