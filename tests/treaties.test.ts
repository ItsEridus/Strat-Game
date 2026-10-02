import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { GOLD } from '../src/engine/money';
import { activeTreaties, freeTrade, hasTreaty, offerTreaty, renounce, treatyBetween, willingness } from '../src/sim/treaties';
import { dipCheck, dipOf, doDiplomacy } from '../src/sim/diplomacyActions';
import { declareWar, warCheck } from '../src/sim/war';
import { tiesOfPair } from '../src/sim/relations';
import { statisticalSkip } from '../src/sim/statYear';

registerSystems();
const fresh = (seed = 901) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('the world starts with its real treaties: NATO, the Asian alliances, trade deals, New START', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), gb = by(w, 'GBR'), de = by(w, 'DEU'), jp = by(w, 'JPN'), kr = by(w, 'KOR'), ru = by(w, 'RUS'), cn = by(w, 'CHN'), ind = by(w, 'IND');
  void de;
  assert.ok(us.alliances.includes(gb.id) && de.alliances.includes(us.id) && us.alliances.includes(jp.id), 'NATO and the US–Japan treaty');
  assert.ok(!jp.alliances.includes(gb.id), 'Japan and Britain are not treaty allies');
  assert.ok(!ind.alliances.length, 'India is non-aligned');
  assert.ok(hasTreaty(w, us.id, ru.id, 'armscontrol'), 'New START');
  assert.ok(freeTrade(w, us.id, kr.id) && freeTrade(w, cn.id, kr.id) && !freeTrade(w, us.id, cn.id), 'KORUS, the China–Korea FTA, no US–China deal');
  assert.match(warCheck(w, us, { target: gb.id, days: 14, goals: [] }) ?? '', /allied/);
});

test('treaties are offered on their merits; renouncing one costs trust, and attacking soon after is a betrayal', () => {
  const w = fresh(902);
  advance(w, DAY, false);
  const us = by(w, 'USA'), ru = by(w, 'RUS'), cn = by(w, 'CHN'), br = by(w, 'BRA'), ar = by(w, 'ARG');
  assert.ok(willingness(w, ru, us, 'defence').p < 0.5, 'Russia will not ally with the US');
  const r = offerTreaty(w, us, ru, 'defence');
  assert.equal(r.ok, false);
  // Brazil and Argentina: a border agreement is easy between friends.
  for (const [a, b] of [[br, ar], [ar, br]]) { a.relations[b.id].score = 80; tiesOfPair(w, a, b).trust = 70; }
  const ok = offerTreaty(w, br, ar, 'nonaggression');
  assert.ok(ok.ok || /declined/.test(ok.msg));
  const tr = treatyBetween(w, br.id, ar.id, 'customs')!; // Mercosur (a customs union, 3.0.2)
  assert.ok(tr);
  const t0 = tiesOfPair(w, ar, br).trust;
  renounce(w, br, tr);
  assert.equal(tr.status, 'ended');
  assert.ok(tiesOfPair(w, ar, br).trust < t0 - 5, 'Argentina trusts Brazil less');
  for (const t of activeTreaties(w, br.id)) if (t.parties.includes(ar.id)) renounce(w, br, t);
  delete br.pacts[ar.id];
  const others = tiesOfPair(w, cn, br).trust;
  declareWar(w, br, { target: ar.id, days: 14, goals: [] });
  assert.ok(tiesOfPair(w, cn, br).trust < others, 'everyone remembers the betrayal');
  assert.ok(w.log.some((e) => /tearing up their treaty/.test(e.text)));
  assert.ok(audit(w).ok);
});

test('when an ally is attacked its partners stand by it or are seen to abandon it', () => {
  const w = fresh(903);
  advance(w, DAY, false);
  const ru = by(w, 'RUS'), de = by(w, 'DEU');
  const nato = treatyBetween(w, de.id, by(w, 'USA').id, 'defence')!;
  declareWar(w, ru, { target: de.id, days: 14, goals: [] });
  assert.equal(nato.honoured + nato.failed, nato.parties.length - 1, 'every other member decided');
  assert.ok(w.log.some((e) => /stood by its ally Germany|did not stand by its ally Germany/.test(e.text)));
});

test('diplomatic actions spend capital and money, respect cooldowns, and loans are repaid', () => {
  const w = fresh(904);
  advance(w, DAY, false);
  const us = by(w, 'USA'), mx = by(w, 'MEX');
  const d = dipOf(us);
  d.capital = 100;
  const g0 = us.wallet[GOLD], m0 = mx.wallet[GOLD];
  assert.ok(doDiplomacy(w, us, 'aid', { target: mx.id }).ok);
  assert.ok(us.wallet[GOLD] < g0 && mx.wallet[GOLD] > m0, 'aid moves gold between treasuries');
  assert.equal(d.capital, 90);
  assert.match(dipCheck(w, us, 'aid', { target: mx.id }) ?? '', /recently/);
  assert.ok(doDiplomacy(w, us, 'loan', { target: mx.id }).ok);
  const loan = w.intlLoans![0];
  const owed = loan.left;
  advance(w, 40 * DAY, false);
  assert.ok(!w.intlLoans!.length || w.intlLoans![0].left < owed, 'repayments come in monthly');
  assert.ok(doDiplomacy(w, us, 'sanction', { target: mx.id }).ok);
  assert.ok(us.embargoes.includes(mx.id));
  assert.ok(audit(w).ok);
});

test('a statistical year keeps treaties, diplomacy and the ledger consistent', () => {
  const w = fresh(905);
  advance(w, 2 * DAY, false);
  statisticalSkip(w, w.time + 365 * DAY);
  const us = by(w, 'USA');
  assert.ok(us.alliances.length >= 4, 'the alliances survive');
  assert.ok(Object.values(w.treaties!).length >= 30);
  assert.ok(audit(w).ok);
});
