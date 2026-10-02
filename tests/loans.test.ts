import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { audit, burn, mint } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { c as cur } from '../src/engine/money';
import { cref, player } from '../src/sim/query';
import { annuity, borrow, buyWithMortgage, creditOf, lendingDaily, loanCheck, loansOf, mortgageCheck, rateFor, repayLoan } from '../src/sim/loans';
import { priceOf } from '../src/sim/housing';
import { budgetRecord } from '../src/engine/budget';
import { deserialize, serialize } from '../src/engine/save';

registerSystems();
const fresh = (seed = 801) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3 });
const earn = (w: ReturnType<typeof fresh>, perDay: number) => { const p = player(w); budgetRecord(w, 'Wage from Test Co', cur(perDay) * 30, w.nations[p.nation].cur); };

test('an annuity clears the loan exactly; rates follow the country', () => {
  const pmt = annuity(100000, 5, 365);
  let bal = 100000;
  for (let i = 0; i < 365; i++) bal = bal + Math.round((bal * 5) / 100 / 365) - Math.min(pmt, bal + Math.round((bal * 5) / 100 / 365));
  assert.ok(bal <= 0);
  const w = fresh();
  const p = player(w);
  assert.ok(rateFor(w, p, 'personal') > rateFor(w, p, 'mortgage'));
});

test('borrowing is checked for affordability; payments build credit; paying off is allowed', () => {
  const w = fresh(802);
  const p = player(w);
  const code = w.nations[p.nation].cur;
  assert.match(loanCheck(w, p, 'personal', cur(500)) ?? '', /income/);
  earn(w, 20);
  const r = borrow(w, p, 'personal', cur(300), 'test');
  assert.ok(r.ok, r.msg);
  mint(w, cref(p.id), code, cur(500), 'test');
  for (let i = 0; i < 31; i++) { w.time += DAY; lendingDaily(w); }
  assert.ok(creditOf(p) > 650, 'on-time payments raise credit');
  const l = loansOf(w, p)[0];
  assert.ok(l.balance < cur(300));
  assert.ok(repayLoan(w, l.id).ok);
  assert.equal(loansOf(w, p).length, 0);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('a mortgage buys a home with a 10% deposit; long arrears end in repossession', () => {
  const w = fresh(803);
  const p = player(w);
  const code = w.nations[p.nation].cur;
  p.loc = p.home;
  earn(w, 200);
  mint(w, cref(p.id), code, Math.round(priceOf(w, p.loc, 'flat') * 0.2), 'test');
  if (p.dwelling?.kind === 'own') p.dwelling = { kind: 'rent', region: p.home, size: 'flat', since: w.time };
  assert.equal(mortgageCheck(w, p, 'flat'), null);
  const b = buyWithMortgage(w, 'flat');
  assert.ok(b.ok, b.msg);
  assert.equal(p.dwelling!.kind, 'own');
  const l = loansOf(w, p)[0];
  assert.equal(l.kind, 'mortgage');
  const w2 = deserialize(serialize(w));
  assert.equal(Object.keys(w2.loans!).length, Object.keys(w.loans!).length);
  burn(w, cref(p.id), code, p.wallet[code] ?? 0, 'test: broke');
  for (let i = 0; i < 62; i++) { w.time += DAY; lendingDaily(w); }
  assert.equal(p.dwelling!.kind, 'rent', 'repossessed');
  assert.ok(creditOf(p) < 600);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
