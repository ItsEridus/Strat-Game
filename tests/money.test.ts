import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtAmt, fromLocal, toLocal, c as cur } from '../src/engine/money';
import { MONEY, goldRate, priceLevel, unitPrice } from '../src/data/economy';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { deserialize, serialize } from '../src/engine/save';
import { B } from '../src/data/balance';

registerSystems();

test('amounts show in real currencies at real price levels', () => {
  assert.equal(fmtAmt('USD', cur(0.2)), '$5.00', 'a coffee in the US');
  assert.equal(fmtAmt('USD', -cur(3)), '-$75.00');
  assert.match(fmtAmt('INR', cur(0.2)), /^₹\d+$/, 'rupees without paise');
  assert.ok(toLocal('INR', cur(8)) > 600 && toLocal('INR', cur(8)) < 900, 'a typical day of pay in India');
  assert.ok(toLocal('JPY', cur(8)) > 10000);
  for (const code of Object.keys(MONEY)) {
    const typed = Math.round(unitPrice(code) * 7);
    assert.ok(Math.abs(toLocal(code, fromLocal(code, typed)) - typed) <= unitPrice(code) / 100 + 1e-9, `round trip ${code}`);
  }
});

test('exchange rates start at real levels; old saves are re-based once', () => {
  const w = generateWorld(1801, 'Money', 0, { citizensPerRegion: 1 });
  const usd = w.nations.find((n) => n.cur === 'USD')!, inr = w.nations.find((n) => n.cur === 'INR')!;
  const ratio = toLocal('INR', inr.fxAnchor) / toLocal('USD', usd.fxAnchor);
  assert.ok(ratio > 80 && ratio < 92, `1 USD ≈ ${ratio.toFixed(1)} INR`);
  assert.ok(inr.fxAnchor > usd.fxAnchor * 15, 'gold is worth many days of pay where pay is low');
  // A save from before real money: anchors at the old flat rate get re-based.
  const flat = JSON.parse(serialize(w));
  flat.version = 12;
  for (const n of flat.world.nations) n.fxAnchor = cur(B.fx.startRate);
  const w2 = deserialize(JSON.stringify(flat));
  const inr2 = w2.nations.find((n) => n.cur === 'INR')!;
  assert.equal(inr2.fxAnchor, Math.round(cur(goldRate('INR'))));
  // And one from 1.4.4, whose anchors followed price levels.
  const v13 = JSON.parse(serialize(w));
  v13.version = 13;
  for (const n of v13.world.nations) n.fxAnchor = Math.round(cur(B.fx.startRate) / priceLevel(n.cur));
  const w3 = deserialize(JSON.stringify(v13));
  assert.ok(Math.abs(w3.nations.find((n) => n.cur === 'INR')!.fxAnchor - cur(goldRate('INR'))) < 3);
});

test('wages: real minimum wages, scaled gold costs and payslips', async () => {
  const { foundCost } = await import('../src/sim/company');
  const { recordPay } = await import('../src/sim/wages');
  const { player } = await import('../src/sim/query');
  const { lifeOf } = await import('../src/sim/lifecycle');
  const w = generateWorld(1802, 'Payday', 0, { citizensPerRegion: 1 });
  const usa = w.nations.find((n) => n.cur === 'USD')!, ind = w.nations.find((n) => n.cur === 'INR')!;
  assert.equal(usa.minWage, Math.round(7.25 * 8 / 25 * 100), 'federal minimum: $58 a day');
  assert.ok(ind.minWage > usa.minWage && ind.minWage <= Math.round(cur(B.wages.start) * 0.9), 'India: a binding minimum, below typical pay');
  const usRegion = w.regions.find((r) => r.owner === usa.id)!.id, inRegion = w.regions.find((r) => r.owner === ind.id)!.id;
  assert.ok(foundCost(w, inRegion) < foundCost(w, usRegion) / 10, 'a business costs far less gold in India');
  const p = player(w);
  recordPay(w, p, 'Acme', 'USD', 800, 80, 40);
  recordPay(w, p, 'Acme', 'USD', 800, 80, 40);
  const s = lifeOf(p).payslips!.at(-1)!;
  assert.deepEqual([s.shifts, s.gross, s.tax, s.pension, s.net], [2, 1600, 160, 80, 1360]);
});
