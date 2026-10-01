import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtAmt, fromLocal, toLocal, c as cur } from '../src/engine/money';
import { MONEY, priceLevel, unitPrice } from '../src/data/economy';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { deserialize, serialize } from '../src/engine/save';
import { B } from '../src/data/balance';

registerSystems();

test('amounts show in real currencies at real price levels', () => {
  assert.equal(fmtAmt('USD', cur(0.5)), '$5.00', 'a coffee in the US');
  assert.equal(fmtAmt('USD', -cur(3)), '-$30.00');
  assert.match(fmtAmt('INR', cur(0.5)), /^₹\d+$/, 'rupees without paise');
  assert.ok(toLocal('INR', cur(1)) < 85.7 * 10 * 0.5, 'a unit of value costs far fewer dollars-worth of rupees in India');
  assert.ok(toLocal('JPY', cur(1)) > 500);
  for (const code of Object.keys(MONEY)) {
    const typed = Math.round(unitPrice(code) * 7);
    assert.ok(Math.abs(toLocal(code, fromLocal(code, typed)) - typed) <= unitPrice(code) / 100 + 1e-9, `round trip ${code}`);
  }
});

test('exchange rates start at real levels; old saves are re-based once', () => {
  const w = generateWorld(1801, 'Money', 0, { citizensPerRegion: 1 });
  const usd = w.nations.find((n) => n.cur === 'USD')!, inr = w.nations.find((n) => n.cur === 'INR')!;
  const ratio = toLocal('INR', inr.fxAnchor) / toLocal('USD', usd.fxAnchor);
  assert.ok(ratio > 75 && ratio < 98, `1 USD ≈ ${ratio.toFixed(1)} INR`);
  assert.ok(inr.fxAnchor > usd.fxAnchor * 3, 'gold buys more where prices are low');
  // A save from before real money: anchors at the old flat rate get re-based.
  const flat = JSON.parse(serialize(w));
  flat.version = 12;
  for (const n of flat.world.nations) n.fxAnchor = cur(B.fx.startRate);
  const w2 = deserialize(JSON.stringify(flat));
  const inr2 = w2.nations.find((n) => n.cur === 'INR')!;
  assert.equal(inr2.fxAnchor, Math.round(cur(B.fx.startRate) / priceLevel('INR')));
});
