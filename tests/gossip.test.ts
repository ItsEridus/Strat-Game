import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { answerRumour, enemiesOf, feuding, gossipMonth, rumoursAbout, spreadRumour, startRumour } from '../src/sim/gossip';
import { note } from '../src/sim/ties';
import { circlesOf } from '../src/sim/circles';

registerSystems();
const fresh = (seed = 4301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('rumours spread through circles and change what people think', () => {
  const w = fresh();
  advance(w, DAY, false);
  const c = census(w).all.find((x) => !x.player && ageOf(w, x) >= 25 && circlesOf(w, x).filter((k) => k.kind !== 'family').flatMap((k) => k.members).length >= 6)!;
  const aud = circlesOf(w, c).filter((k) => k.kind !== 'family').flatMap((k) => k.members);
  const before = aud.reduce((t, x) => t + (x.rel[c.id] ?? 0), 0);
  const r = startRumour(w, c, 'drink', `${c.name} was seen drunk again`, -1, 6, true)!;
  for (let m = 0; m < 3; m++) gossipMonth(w);
  assert.ok(r.heard.length >= 4, `it spreads (${r.heard.length})`);
  assert.ok(aud.reduce((t, x) => t + (x.rel[c.id] ?? 0), 0) < before, 'and people think less of them');
  assert.ok(audit(w).ok);
});

test('grudges breed slander and feuds; the player answers rumours and spreads their own', () => {
  const w = fresh(4302);
  advance(w, DAY, false);
  const p = player(w);
  const foe = census(w).all.find((x) => !x.player && ageOf(w, x) >= 25)!;
  note(w, foe, p, 'grudge', 80, 'an old quarrel');
  note(w, p, foe, 'grudge', 80, 'an old quarrel');
  assert.ok(feuding(w, foe, p));
  assert.ok(enemiesOf(w, p).includes(foe));
  for (let m = 0; m < 24 && !rumoursAbout(w, p.id).length; m++) gossipMonth(w);
  const r = rumoursAbout(w, p.id)[0];
  if (r) {
    if (!r.heard.length) r.heard.push(foe.id);
    const res = answerRumour(w, r.id);
    assert.ok(res.ok, res.msg);
    assert.ok(r.done);
  }
  const res = spreadRumour(w, foe.id, true);
  assert.ok(res.ok, res.msg);
  assert.ok(rumoursAbout(w, foe.id).some((x) => x.by === p.id && !x.truth));
  assert.ok(!spreadRumour(w, foe.id, true).ok, 'once a week');
  assert.ok(audit(w).ok);
});
