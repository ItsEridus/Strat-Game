import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { saleTaxes } from '../src/sim/market';
import { natref } from '../src/sim/query';
import { blocked, commonTariff, customsUnionOf, leak, quotaShare, tariffOn, tpOf } from '../src/sim/tradePolicy';
import { dipCheck, dipOf, doDiplomacy } from '../src/sim/diplomacyActions';
import { exportLicence } from '../src/sim/defenceIndustry';
import { freeTrade, hasTreaty } from '../src/sim/treaties';
import { statisticalSkip } from '../src/sim/statYear';

registerSystems();
const fresh = (seed = 3021) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('customs unions: Mercosur and the EU–Turkey union; free inside, one tariff outside', () => {
  const w = fresh();
  advance(w, DAY, false);
  const br = by(w, 'BRA'), ar = by(w, 'ARG'), us = by(w, 'USA'), de = by(w, 'DEU'), tr = by(w, 'TUR'), jp = by(w, 'JPN');
  assert.ok(customsUnionOf(w, br.id) && customsUnionOf(w, ar.id), 'Mercosur');
  assert.ok(customsUnionOf(w, de.id)?.parties.includes(tr.id), 'the EU–Turkey customs union');
  assert.ok(freeTrade(w, br.id, ar.id));
  assert.equal(saleTaxes(w, br.id, natref(ar.id)).imp, 0, 'no tariff inside the union');
  assert.equal(saleTaxes(w, br.id, natref(us.id)).imp, Math.max(br.taxes.import, commonTariff(w, br.id)!), 'the common tariff outside it');
  assert.equal(saleTaxes(w, de.id, natref(jp.id)).imp, 0, 'free-trade partners pay no union tariff');
  assert.ok(audit(w).ok);
});

test('tariffs, quotas and sectoral sanctions; a tariff breaks a trade agreement', () => {
  const w = fresh(3022);
  advance(w, DAY, false);
  const us = by(w, 'USA'), kr = by(w, 'KOR'), cn = by(w, 'CHN'), ru = by(w, 'RUS');
  dipOf(us).capital = 100;
  const base = saleTaxes(w, us.id, natref(cn.id)).imp;
  assert.ok(doDiplomacy(w, us, 'tariff', { target: cn.id }).ok);
  assert.equal(tariffOn(w, us.id, cn.id), 25);
  assert.equal(saleTaxes(w, us.id, natref(cn.id)).imp, base + 25);
  dipOf(us).capital = 100;
  assert.ok(hasTreaty(w, us.id, kr.id, 'trade'));
  assert.ok(doDiplomacy(w, us, 'tariff', { target: kr.id }).ok);
  assert.ok(!hasTreaty(w, us.id, kr.id, 'trade'), 'KORUS broken by the tariff');
  dipOf(us).capital = 100;
  assert.ok(doDiplomacy(w, us, 'quota', { target: cn.id }).ok);
  assert.equal(quotaShare(w, us.id, cn.id), 0.5);
  dipOf(us).capital = 100;
  assert.match(dipCheck(w, us, 'sectoral', { target: ru.id }) ?? '', /sector/);
  assert.ok(doDiplomacy(w, us, 'sectoral', { target: ru.id, sector: 'energy' }).ok);
  assert.ok(blocked(w, ru.id, us.id, 'oil') && !blocked(w, ru.id, us.id, 'food:1'), 'oil cut off, food still flows');
  dipOf(us).capital = 100;
  assert.match(dipCheck(w, us, 'sectoral', { target: ru.id, sector: 'arms' }) ?? '', /recently/, 'one sector a month');
  dipOf(us).last = {};
  assert.ok(doDiplomacy(w, us, 'sectoral', { target: ru.id, sector: 'arms' }).ok);
  assert.match(exportLicence(w, us, ru) ?? '', /./);
  dipOf(us).capital = 100;
  assert.ok(doDiplomacy(w, us, 'easeTrade', { target: cn.id }).ok);
  assert.equal(tariffOn(w, us.id, cn.id), 0);
  assert.ok(audit(w).ok);
});

test('secondary sanctions press third countries; smuggling leaks across land borders', () => {
  const w = fresh(3023);
  advance(w, DAY, false);
  const us = by(w, 'USA'), ru = by(w, 'RUS'), cn = by(w, 'CHN'), mx = by(w, 'MEX'), ca = by(w, 'CAN');
  if (!us.embargoes.includes(ru.id)) us.embargoes.push(ru.id);
  dipOf(us).capital = 100;
  assert.ok(doDiplomacy(w, us, 'secondary', { target: ru.id }).ok);
  statisticalSkip(w, w.time + 70 * DAY);
  const asked = Object.keys(tpOf(us).asked ?? {}).length;
  assert.ok(asked >= 1, 'third countries were pressed');
  assert.ok(leak(w, us.id, mx.id) > leak(w, us.id, cn.id), 'a land border leaks more than an ocean');
  void ca;
  assert.ok(audit(w).ok);
});
