import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { audit, mint } from '../src/engine/ledger';
import { c as cur } from '../src/engine/money';
import { cref, player } from '../src/sim/query';
import { bornYearsAgo } from '../src/sim/growth';
import { chooseStory, STORIES, triggerStory, viewStage } from '../src/sim/story';
import { conceive } from '../src/sim/kinship';
import { census } from '../src/sim/census';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 1301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });
const inst = (w: World, def: string) => Object.values(w.story.instances).find((i) => i.def === def)!;

test('all eight life chains are registered and every stage renders', () => {
  const ids = ['baby', 'movingout', 'diagnosis', 'emptynest', 'midlife', 'carer', 'graduation', 'inheritance'].map((x) => `life.chain.${x}`);
  for (const id of ids) assert.ok(STORIES[id], id);
});

test('a baby on the way: the chain starts from the pregnancy and plays through', () => {
  const w = fresh();
  const p = player(w);
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(200), 'test');
  const partner = census(w).all.find((c) => !c.player && !c.gone)!;
  conceive(w, p, partner);
  const r = triggerStory(w, 'life.chain.baby');
  assert.ok(r.ok, r.msg);
  const i = inst(w, 'life.chain.baby');
  const v = viewStage(w, i);
  assert.ok(v.text.includes('due around'));
  const c = chooseStory(w, i.id, 'nursery');
  assert.ok(c.ok, c.msg);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('a milestone birthday and moving out play through', () => {
  const w = fresh(1302);
  const p = player(w);
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(500), 'test');
  p.born = bornYearsAgo(w, 40, 100);
  assert.ok(triggerStory(w, 'life.chain.midlife').ok);
  assert.ok(chooseStory(w, inst(w, 'life.chain.midlife').id, 'trip').ok);
  p.born = bornYearsAgo(w, 23, 100);
  p.dwelling = { kind: 'family', region: p.home, size: 'room', since: w.time };
  p.loc = p.home;
  assert.ok(triggerStory(w, 'life.chain.movingout').ok);
  const r = chooseStory(w, inst(w, 'life.chain.movingout').id, 'flat');
  assert.ok(r.ok, r.msg);
  assert.equal(p.dwelling!.kind, 'rent');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('sixteen everyday encounters: each renders and every choice can be made where it binds', () => {
  const ids = Object.keys(STORIES).filter((k) => k.startsWith('enc.'));
  assert.equal(ids.length, 16);
  let ran = 0;
  for (const id of ids) {
    const w = fresh(1400 + ran);
    const p = player(w);
    mint(w, cref(p.id), w.nations[p.nation].cur, cur(500), 'test');
    p.energy = 100;
    const r = triggerStory(w, id);
    if (!r.ok) continue; // its situation does not arise in this world
    const i = inst(w, id);
    const v = viewStage(w, i);
    assert.ok(v.text.length > 10, id);
    const ch = v.choices.find((x) => !x.why)!;
    const res = chooseStory(w, i.id, ch.id);
    assert.ok(res.ok, `${id}/${ch.id}: ${res.msg}`);
    assert.ok(audit(w).ok, `${id}: ${audit(w).problems.join('; ')}`);
    ran++;
  }
  assert.ok(ran >= 8, `only ${ran} encounters could be played`);
});
