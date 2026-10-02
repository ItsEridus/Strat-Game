import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { player } from '../src/sim/query';
import { ageing, blendLook, lookOf, sexOf } from '../src/sim/looks';
import { census } from '../src/sim/census';
import { bornYearsAgo } from '../src/sim/growth';
import { deserialize, serialize } from '../src/engine/save';
import { practise } from '../src/sim/growth';
import { remember } from '../src/sim/story';

registerSystems();

test('everyone has a stable look; presentation follows the first name; age shows', () => {
  const w = generateWorld(1701, 'Tester', 0, { citizensPerRegion: 3 });
  const all = census(w).all;
  const c = all[5];
  assert.deepEqual(lookOf(w, c), lookOf(w, c), 'stable');
  const looks = new Set(all.map((x) => JSON.stringify(lookOf(w, x))));
  assert.ok(looks.size > all.length * 0.9, `distinct faces ${looks.size}/${all.length}`);
  const mary = all.find((x) => x.name.startsWith('Mary '));
  if (mary) assert.equal(sexOf(w, mary), 'f');
  const old = all[7];
  old.born = bornYearsAgo(w, 80, 1);
  assert.ok(ageing(w, old).grey > 0.5 && ageing(w, old).lines >= 2);
});

test('a designed character: look, birthplace and politics become real starting conditions', () => {
  const look = { sex: 'f' as const, pronouns: 'they' as const, skin: 3, face: 1, hair: 5, hairColor: 5, eyes: 3, brows: 1, nose: 2, beard: 0, glasses: true, freckles: true, mark: 'tattoo' as const, clothes: 2 };
  const w = generateWorld(1702, 'Ada Designed', 6, { citizensPerRegion: 3, character: { look, birthplace: null, ideology: 'socialism' } });
  const p = player(w);
  assert.equal(p.ideo, 'socialism');
  assert.deepEqual(lookOf(w, p), look);
  const region = w.regions.find((r) => r.owner === 6 && r.id !== p.home)!;
  const w2 = generateWorld(1703, 'Born There', 6, { citizensPerRegion: 3, character: { look, birthplace: region.id, ideology: null } });
  assert.equal(player(w2).home, region.id);
  const w3 = deserialize(serialize(w));
  assert.deepEqual(w3.citizens[p.id].look, look);
});

test('children blend their parents', () => {
  const w = generateWorld(1704, 'Tester', 0, { citizensPerRegion: 3 });
  const [a, b, kid] = census(w).all.filter((c) => !c.player);
  a.look = { ...lookOf(w, a), skin: 0 }; b.look = { ...lookOf(w, b), skin: 6 };
  const l = blendLook(w, kid, a, b);
  assert.ok(l.skin >= 2 && l.skin <= 4);
});

test('background, talents and quirks have real effects', () => {
  const base = { look: { sex: 'm' as const, skin: 2, face: 0, hair: 0, hairColor: 1, eyes: 0, brows: 0, nose: 0, beard: 0, glasses: false, freckles: false }, birthplace: null, ideology: null };
  const rich = generateWorld(1705, 'Rich', 0, { citizensPerRegion: 3, character: { ...base, background: 'wealthy', nature: { talent: 'numbers', weakness: 'hands', quirks: ['charming'] } } });
  const poor = generateWorld(1705, 'Poor', 0, { citizensPerRegion: 3, character: { ...base, background: 'struggling', nature: { talent: 'hands', weakness: 'numbers', quirks: [] } } });
  const pr = player(rich), pp = player(poor);
  const code = rich.nations[0].cur;
  assert.ok((pr.wallet[code] ?? 0) > (pp.wallet[code] ?? 0) * 5, 'a wealthy start');
  assert.equal(pr.dwelling!.kind, 'own');
  const e0 = pr.attrs.eco, f0 = pp.attrs.eco;
  practise(rich, pr, 'eco', 1); practise(poor, pp, 'eco', 1);
  assert.ok(pr.attrs.eco - e0 > (pp.attrs.eco - f0) * 1.5, 'talent speeds learning; weakness slows it');
  const npc = census(rich).all.find((c) => !c.player)!;
  const r0 = npc.rel[pr.id] ?? 0;
  remember(rich, npc, 8, 'was kind', 'private');
  assert.equal((npc.rel[pr.id] ?? 0) - r0, 10, 'charming: +25%');
});

test('quick starts, character codes and changing your look in play', async () => {
  const { PRESETS, fromPreset, randomLife, characterCode, readCharacterCode } = await import('../src/ui/presets');
  for (const p of PRESETS) {
    const q = fromPreset(p);
    assert.ok(q.character.birthplace! >= 0, `preset region ${p.region}`);
    const back = readCharacterCode(characterCode(q))!;
    assert.deepEqual(back.character, q.character);
    assert.equal(back.name, q.name);
  }
  const r = randomLife();
  assert.deepEqual(readCharacterCode(characterCode(r))!.character, r.character);
  assert.equal(readCharacterCode('MR1-garbage'), null);
  assert.equal(readCharacterCode('hello'), null);

  const { changeLook, changeLookCheck, lookCost } = await import('../src/sim/appearance');
  const lookCostOf = (w: any, p: any) => lookCost(w, p, 'hair').code;
  const { audit, mint } = await import('../src/engine/ledger');
  const { cref } = await import('../src/sim/query');
  const w = generateWorld(1706, 'Barber Test', 0, { citizensPerRegion: 3 });
  const p = player(w);
  const code = lookCostOf(w, p);
  mint(w, cref(p.id), code, 100000, 'test');
  const before = p.wallet[code];
  const next = (lookOf(w, p).hair + 1) % 10;
  assert.ok(changeLook(w, 'hair', next).ok);
  assert.equal(lookOf(w, p).hair, next);
  assert.ok(p.wallet[code] < before, 'a haircut costs money');
  assert.ok(changeLookCheck(w, p, 'hair', next), 'no change, no charge');
  assert.ok(changeLook(w, 'mark', 'tattoo').ok);
  assert.equal(lookOf(w, p).mark, 'tattoo');
  const w2 = deserialize(serialize(w));
  assert.equal(lookOf(w2, player(w2)).mark, 'tattoo', 'kept in the save');
  assert.ok(audit(w).ok, audit(w).problems.join("; "));
});
