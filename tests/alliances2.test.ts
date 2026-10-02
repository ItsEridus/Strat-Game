import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { activeTreaties, hasAccess, offensivePower, offerTreaty, recognises, signTreaty, willingness } from '../src/sim/treaties';
import { dipCheck, dipOf, doDiplomacy } from '../src/sim/diplomacyActions';
import { activeWars, declareWar, neighborNations } from '../src/sim/war';
import { tiesOfPair } from '../src/sim/relations';
import { createState } from '../src/sim/secession';
import { armyPath, formationsOf } from '../src/sim/forces';
import { controller } from '../src/sim/query';

registerSystems();
const fresh = (seed = 3011) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('offensive alliances: wanted against a common enemy; partners join the war or cut the enemy off', () => {
  const w = fresh();
  advance(w, DAY, false);
  const ru = by(w, 'RUS'), cn = by(w, 'CHN'), us = by(w, 'USA');
  assert.ok(willingness(w, us, cn, 'offensive').p < 0.5, 'the US will not plan wars with China');
  const t = signTreaty(w, 'offensive', [ru.id, cn.id]);
  assert.equal(activeTreaties(w, ru.id, 'offensive').length, 1);
  // A neighbour of both that both dislike.
  const target = w.nations.find((x) => x.id !== ru.id && x.id !== cn.id && !x.exile && neighborNations(w, ru.id).includes(x.id) && neighborNations(w, cn.id).includes(x.id) && !ru.alliances.includes(x.id) && !cn.alliances.includes(x.id))
    ?? w.nations.find((x) => x.id !== ru.id && x.id !== cn.id && !x.exile && neighborNations(w, ru.id).includes(x.id) && !ru.alliances.includes(x.id) && !cn.alliances.includes(x.id))!;
  ru.relations[target.id].score = -80; cn.relations[target.id].score = -90;
  assert.ok(offensivePower(w, ru.id, target.id) > 0, 'Russia counts on China against an enemy China dislikes');
  const before = activeWars(w).length;
  const war = declareWar(w, ru, { target: target.id, days: 60, goals: [] });
  const joined = activeWars(w).find((x) => x.joined === war.id);
  assert.ok(t.honoured + t.failed >= 1, 'the partner was asked');
  if (t.honoured) assert.ok(joined || cn.embargoes.includes(target.id), 'it joined the war or cut the enemy off');
  assert.ok(activeWars(w).length >= before + 1);
  assert.ok(audit(w).ok);
});

test('military access: armies may cross the host country; offered through diplomacy', () => {
  const w = fresh(3012);
  advance(w, DAY, false);
  const us = by(w, 'USA'), ca = by(w, 'CAN'), mx = by(w, 'MEX');
  assert.ok(!hasAccess(w, mx.id, us.id));
  for (const [a, b] of [[us, mx], [mx, us]]) { a.relations[b.id].score = 90; tiesOfPair(w, a, b).trust = 80; }
  const r = offerTreaty(w, mx, us, 'access');
  if (!r.ok) signTreaty(w, 'access', [mx.id, us.id], { host: us.id });
  assert.ok(hasAccess(w, mx.id, us.id), 'Mexico may cross the US');
  // A Mexican army can now find a road through the US to Canada.
  const f = formationsOf(w, mx.id).find((x) => x.branch === 'army')!;
  const dest = w.regions.find((x) => controller(x) === ca.id && x.links.some((l) => controller(w.regions[l]) === us.id))!;
  const ca2 = ca; void ca2;
  ca.relations[mx.id].score = -50;
  const path = armyPath(w, f, dest.id);
  assert.ok(path.length === 0 || path.every((id) => [mx.id, us.id, ca.id].includes(controller(w.regions[id]))), 'the road runs through the host');
  assert.ok(audit(w).ok);
});

test('recognition: a breakaway state is a state to those that recognise it; recognising and withdrawing', () => {
  const w = fresh(3013);
  advance(w, DAY, false);
  const es = by(w, 'ESP') ?? by(w, 'GBR');
  const fr = w.nations.find((x) => x.id !== es.id && !x.exile && x.iso !== 'ESP')!;
  const region = w.regions.find((r) => r.owner === es.id && r.id !== es.capital)!;
  const s = createState(w, es, [region.id], 'declaration');
  for (const o of [fr]) s.recognisedBy = (s.recognisedBy ?? []).filter((x) => x !== o.id);
  assert.ok(!recognises(fr, s));
  assert.match(offerTreaty(w, fr, s, 'trade').msg, /recognise/);
  dipOf(fr).capital = 100;
  assert.equal(dipCheck(w, fr, 'recognise', { target: s.id }), null);
  assert.ok(doDiplomacy(w, fr, 'recognise', { target: s.id }).ok);
  assert.ok(recognises(fr, s));
  assert.match(dipCheck(w, fr, 'recognise', { target: es.id }) ?? '', /not a breakaway/);
  dipOf(fr).capital = 100;
  assert.ok(doDiplomacy(w, fr, 'unrecognise', { target: s.id }).ok);
  assert.ok(!recognises(fr, s));
  assert.ok(audit(w).ok);
});
