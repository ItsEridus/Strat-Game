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

test('households: a real budget split, inequality and poverty measured', async () => {
  const { gini, livingStandards } = await import('../src/sim/livingStandards');
  const { circulation } = await import('../src/ai/economy');
  const { player } = await import('../src/sim/query');
  assert.equal(gini([5, 5, 5, 5]), 0);
  assert.ok(Math.abs(gini([0, 0, 0, 10]) - 0.75) < 1e-9);
  const w = generateWorld(1803, 'Budget', 0, { citizensPerRegion: 2 });
  circulation(w);
  const cats = w.budget!.at(-1)!.asset[w.nations[player(w).nation].cur];
  assert.ok(cats.Groceries < 0 && cats['Utilities and energy'] < 0 && cats.Transport < 0, `essentials split: ${JSON.stringify(cats)}`);
  const s = livingStandards(w, player(w).nation);
  assert.ok(s.adults > 5 && s.wealthGini > 0 && s.wealthGini < 1);
});

test('companies pay rent, energy and corporate tax, and keep accounts', async () => {
  const { accounts, premisesRent, corpTaxRate } = await import('../src/sim/companyCosts');
  const { closeCompanyDay } = await import('../src/sim/company');
  const { audit } = await import('../src/engine/ledger');
  const w = generateWorld(1804, 'Books', 0, { citizensPerRegion: 2 });
  const co = Object.values(w.companies).find((c) => c.workers.length)!;
  const code = w.nations[w.regions[co.region].owner].cur;
  const before = co.wallet[code] ?? 0;
  closeCompanyDay(w);
  const day = co.hist.at(-1)!;
  assert.equal(day.overheads, Math.min(before, premisesRent(w, co)), 'a day of rent (nothing produced yet)');
  const a = accounts(w, co);
  assert.equal(a.days, 1);
  assert.ok(a.capital > 0 && a.depreciation > 0);
  assert.ok(corpTaxRate(w, co) >= 0.2 && corpTaxRate(w, co) <= 0.35, 'a real corporate tax rate');
  assert.ok(audit(w).ok);
});

test('taxes at real rates, progressive income tax, and public debt', async () => {
  const { workTaxFor } = await import('../src/sim/taxes');
  const { publicFinanceDaily } = await import('../src/sim/publicFinance');
  const { player } = await import('../src/sim/query');
  const { audit, burn } = await import('../src/engine/ledger');
  const { natref } = await import('../src/sim/query');
  const w = generateWorld(1805, 'Taxes', 0, { citizensPerRegion: 1 });
  const deu = w.nations.find((n) => n.iso === 'DEU')!;
  assert.deepEqual(deu.taxes, { work: 19, vat: 19, import: 4 });
  const r = w.regions.find((x) => x.owner === deu.id)!.id;
  const p = player(w);
  const rate = (gross: number) => workTaxFor(w, r, p, gross).natRate;
  assert.equal(rate(cur(1)), 0, 'below the allowance');
  assert.ok(Math.abs(rate(cur(B.wages.start)) - 19) < 0.01, 'the headline rate on a typical wage');
  assert.ok(rate(cur(B.wages.start * 4)) > 25, 'higher for high earners');
  // An empty treasury borrows; the debt is recorded and the books still balance.
  deu.stats.spendHist = Array(30).fill(cur(100)); deu.stats.revHist = Array(30).fill(cur(90));
  burn(w, natref(deu.id), deu.cur, deu.wallet[deu.cur] ?? 0, 'test');
  publicFinanceDaily(w);
  assert.ok((deu.debt ?? 0) > 0 && (deu.wallet[deu.cur] ?? 0) === deu.debt);
  publicFinanceDaily(w);
  assert.ok((deu.interestPaid ?? 0) > 0, 'interest paid');
  assert.ok(audit(w).ok);
});

test('trade: world prices move, imports cap raw prices, exports are counted', async () => {
  const { worldPrices, worldPricesDaily, importParity, worldPriceIn } = await import('../src/sim/trade');
  const { list, buyListing } = await import('../src/sim/market');
  const { createCompany } = await import('../src/sim/company');
  const { mint, audit, produce } = await import('../src/engine/ledger');
  const { cref, coref, player } = await import('../src/sim/query');
  const w = generateWorld(1806, 'Trade', 0, { citizensPerRegion: 1 });
  const p0 = worldPrices(w).oil.p;
  for (let i = 0; i < 30; i++) worldPricesDaily(w);
  assert.notEqual(worldPrices(w).oil.p, p0, 'prices move');
  assert.equal(worldPrices(w).oil.hist.length, 30);
  const usa = w.nations.find((n) => n.cur === 'USD')!, ind = w.nations.find((n) => n.cur === 'INR')!;
  assert.ok(importParity(w, usa.id, 'grain') > worldPriceIn(w, usa.id, 'grain'));
  // An Indian firm exports to the US; the sale counts as Indian exports and US imports.
  const p = player(w);
  const co = createCompany(w, cref(p.id), 'grain', 1, w.regions.find((r) => r.owner === ind.id)!.id);
  produce(w, coref(co.id), 'grain', 10, 'test');
  assert.ok(list(w, p.id, coref(co.id), usa.id, 'grain', 5, 200, true).ok, 'an export listing');
  assert.ok(!list(w, p.id, coref(co.id), usa.id, 'grain', 5, 200).ok, 'an ordinary listing needs presence');
  const buyer = Object.values(w.citizens).find((c) => !c.player && c.nation === usa.id)!;
  mint(w, cref(buyer.id), 'USD', 10000, 'test');
  const l = Object.values(w.listings).find((x) => x.seller.k === 'co' && x.seller.id === co.id)!;
  assert.ok(buyListing(w, buyer.id, cref(buyer.id), l.id, 2).ok);
  assert.ok((ind.trade?.exp ?? 0) > 0 && (usa.trade?.imp ?? 0) > 0);
  assert.ok(audit(w).ok);
});

test('statistics: monthly GDP, prices, inflation and unemployment from the simulation', async () => {
  const { advance } = await import('../src/sim/tick');
  const { DAY } = await import('../src/engine/clock');
  const { inflation } = await import('../src/sim/statistics');
  const w = generateWorld(1807, 'Stats', 0, { citizensPerRegion: 1 });
  w.settings.playerMortality = false;
  advance(w, 33 * DAY, false);
  const usa = w.nations.find((n) => n.cur === 'USD')!;
  const m = usa.stats2!.months.at(-1)!;
  assert.equal(m.key, '2025-01');
  assert.ok(m.gdp > 0 && m.days >= 28, `GDP ${m.gdp} over ${m.days} days`);
  assert.ok(m.cpi > 50 && m.cpi < 200, `CPI ${m.cpi}`);
  assert.equal(inflation(w, usa.id), undefined, 'not enough data for a rate yet');
  assert.equal(m.cpi, 100, 'the index is based on January');
  assert.ok(m.unemployment >= 0 && m.unemployment <= 1);
});

test('banks: a policy rule, savings interest and business loans', async () => {
  const { taylorRate, bankingDaily, businessLoan, depositRate } = await import('../src/sim/banking');
  const { policyRateOf } = await import('../src/sim/loans');
  const { player, cref } = await import('../src/sim/query');
  const { mint, audit } = await import('../src/engine/ledger');
  const { timeOfDate } = await import('../src/engine/calendar');
  const w = generateWorld(1808, 'Banks', 0, { citizensPerRegion: 1 });
  const usa = w.nations.find((n) => n.cur === 'USD')!;
  assert.equal(policyRateOf(w, usa.id), 4.5, 'starts at the real rate');
  assert.equal(taylorRate(w, usa.id), null, 'no rule without a year of data');
  // A year of 6% inflation with low unemployment: the rule says raise.
  usa.stats2 = { va: 0, gov: 0, days: 0, based: true, cpi: [106], months: Array.from({ length: 13 }, (_, i) => ({ key: `m${i}`, days: 30, gdp: 1, cpi: 100 * Math.pow(1.06, i / 12), unemployment: 0.03, wage: 0, exports: 0, imports: 0, debt: 0, rate: 4.5 })) };
  usa.unemployment = 0.03;
  assert.ok(taylorRate(w, usa.id)! > 6);
  // On the first of the month the bank moves half a point towards it and pays interest on savings.
  const p = player(w);
  p.nation = usa.id;
  mint(w, cref(p.id), 'USD', 1200000, 'test');
  const before = p.wallet.USD!;
  w.time = timeOfDate(2025, 1, 1);
  bankingDaily(w);
  assert.equal(usa.policyRate, 5);
  assert.equal(p.wallet.USD! - before, Math.floor((before * depositRate(w, usa.id)) / 100 / 12));
  // A profitable company short of cash can borrow; the money arrives in the company.
  const co = Object.values(w.companies).find((c) => c.owner.k === 'cit' && w.citizens[c.owner.id] && !w.citizens[c.owner.id].player && w.citizens[c.owner.id].nation === usa.id && w.regions[c.region].owner === usa.id)!;
  co.hist = Array.from({ length: 20 }, (_, i) => ({ day: i, produced: 5, consumed: 0, sold: 5, revenue: 20000, wages: 8000, inputCost: 4000, profit: 8000 }));
  const cash = co.wallet.USD ?? 0;
  assert.ok(businessLoan(w, w.citizens[co.owner.id], co, 50000));
  assert.equal((co.wallet.USD ?? 0) - cash, 50000);
  assert.ok(audit(w).ok);
});

test('labour market: occupations, redundancy pay and unemployment benefit', async () => {
  const { occupationOf, labourDaily, benefitRules } = await import('../src/sim/labour');
  const { OCCUPATIONS } = await import('../src/data/occupations');
  const { setOffer } = await import('../src/sim/company');
  const { operatorOf } = await import('../src/ai/economy');
  const { audit } = await import('../src/engine/ledger');
  assert.ok(Object.keys(OCCUPATIONS).length >= 60, 'about sixty occupations');
  const w = generateWorld(1809, 'Jobs', 0, { citizensPerRegion: 2 });
  const deu = w.nations.find((n) => n.iso === 'DEU')!;
  const co = Object.values(w.companies).find((c) => c.workers.length >= 2 && w.regions[c.region].owner === deu.id && operatorOf(w, c) != null)!;
  const worker = w.citizens[co.workers[co.workers.length - 1]];
  const occ = occupationOf(w, worker)!;
  assert.ok(OCCUPATIONS[occ].industries?.includes(co.industry), `${OCCUPATIONS[occ].label} works in ${co.industry}`);
  const cash = worker.wallet.EUR ?? 0;
  assert.ok(setOffer(w, operatorOf(w, co)!, co.id, co.offer!.wage, co.workers.length - 1, 0).ok);
  assert.equal(worker.job, null);
  assert.ok((worker.wallet.EUR ?? 0) > cash, 'redundancy pay');
  assert.equal(worker.benefit?.daily, Math.round(co.offer!.wage * benefitRules(w, deu.id).rate));
  const before = worker.wallet.EUR ?? 0;
  labourDaily(w);
  assert.equal((worker.wallet.EUR ?? 0) - before, worker.benefit!.daily, 'a day of benefit');
  assert.ok(audit(w).ok);
});

test('small businesses: set up, trade daily, pay tax, and close', async () => {
  const { startBusiness, smallBusinessDaily, closeBusiness, BIZ } = await import('../src/sim/smallBusiness');
  const { player, cref } = await import('../src/sim/query');
  const { mint, audit } = await import('../src/engine/ledger');
  const w = generateWorld(1810, 'Café', 0, { citizensPerRegion: 1 });
  const p = player(w);
  p.loc = p.home;
  const code = w.nations[p.nation].cur;
  mint(w, cref(p.id), code, cur(1000), 'test');
  assert.ok(startBusiness(w, 'cafe').ok);
  assert.equal(p.business?.kind, 'cafe');
  assert.equal(p.job, null);
  for (let i = 0; i < 5; i++) smallBusinessDaily(w);
  assert.equal(p.business!.hist.length, 5);
  assert.ok(p.business!.hist.every((h) => h.rev > 0), 'takings every day');
  assert.ok(BIZ.cafe.start > 0);
  assert.ok(closeBusiness(w).ok);
  assert.equal(p.business, undefined);
  assert.ok(audit(w).ok);
});

test('companies close in the legal order: staff, then the owner', async () => {
  const { closeCompany, demographyOf } = await import('../src/sim/companyLife');
  const { audit } = await import('../src/engine/ledger');
  const { companyCurrency } = await import('../src/sim/query');
  const w = generateWorld(1811, 'Closing', 0, { citizensPerRegion: 2 });
  const co = Object.values(w.companies).find((c) => c.workers.length >= 1 && c.owner.k === 'cit' && !w.citizens[c.owner.id].player)!;
  const code = companyCurrency(w, co);
  const owner = w.citizens[co.owner.id];
  const staff = co.workers.map((id) => w.citizens[id]);
  const ownerCash = owner.wallet[code] ?? 0;
  assert.ok(closeCompany(w, co, 'insolvent'));
  assert.equal(w.companies[co.id], undefined);
  assert.ok(staff.every((c) => c.job == null), 'staff let go');
  assert.ok((owner.wallet[code] ?? 0) >= ownerCash, 'the owner gets what remains');
  assert.ok(!Object.values(w.listings).some((l) => l.seller.k === 'co' && l.seller.id === co.id));
  assert.equal(demographyOf(w, w.regions[co.region].owner).died, 1);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('takeovers: valuation, the competition authority, and the deal', async () => {
  const { valuation, competitionCheck, takeOver } = await import('../src/sim/mergers');
  const { companiesOf } = await import('../src/sim/census');
  const { companyCurrency, cref } = await import('../src/sim/query');
  const { mint, audit } = await import('../src/engine/ledger');
  const w = generateWorld(1812, 'Deals', 0, { citizensPerRegion: 2 });
  const nat = w.nations.find((n) => n.iso === 'USA')!.id;
  const food = companiesOf(w, nat).filter((co) => co.industry === 'food' && co.owner.k === 'cit');
  assert.ok(food.length >= 2);
  const [a, b] = food;
  for (const co of food) co.hist = [{ day: 0, produced: 1, consumed: 0, sold: 1, revenue: 1000, wages: 0, inputCost: 0, profit: 0 }];
  // One owner with a dominant rival's sales would be blocked.
  a.hist = [{ day: 0, produced: 1, consumed: 0, sold: 1, revenue: 1000000, wages: 0, inputCost: 0, profit: 0 }];
  const buyerA = w.citizens[a.owner.id];
  assert.match(competitionCheck(w, cref(buyerA.id), b) ?? '', /blocked/);
  // A newcomer buying one small firm is fine.
  const outsider = Object.values(w.citizens).find((c) => !c.player && c.nation === nat && !food.some((co) => co.owner.id === c.id))!;
  const code = companyCurrency(w, b);
  const price = valuation(w, b);
  assert.ok(price > 0);
  mint(w, cref(outsider.id), code, price * 2, 'test');
  assert.equal(takeOver(w, outsider, b, price), null);
  assert.equal(b.owner.id, outsider.id);
  assert.ok(audit(w).ok);
});

test('power index 2.0: tiers from economy, military quality and technology', async () => {
  const { nationScores } = await import('../src/sim/forces');
  const w = generateWorld(1813, 'Power', 0, { citizensPerRegion: 1 });
  const s = nationScores(w);
  const iso = (i: number) => w.nations[s[i].id].iso;
  assert.equal(iso(0), 'USA');
  assert.equal(s[0].tier, 'superpower');
  assert.ok(s.some((x) => w.nations[x.id].iso === 'CHN' && x.tier === 'superpower'));
  assert.ok(s.every((x) => x.total >= 0 && x.total <= 100));
});

test('strategic engine: a monthly turn grows productivity and technology from real baselines', async () => {
  const { capsOf, strategicMonth, techAvg } = await import('../src/sim/strategic');
  const { TECH_DOMAINS } = await import('../src/data/nationBaselines');
  const w = generateWorld(1814, 'History', 0, { citizensPerRegion: 1 });
  const ind = w.nations.find((n) => n.iso === 'IND')!, jpn = w.nations.find((n) => n.iso === 'JPN')!;
  const t0 = techAvg(capsOf(w, ind));
  for (let m = 0; m < 24; m++) {
    const leaders = Object.fromEntries(TECH_DOMAINS.map((d) => [d, Math.max(...w.nations.map((n) => capsOf(w, n).tech[d]))])) as any;
    for (const n of w.nations) strategicMonth(w, n, leaders);
  }
  const gi = capsOf(w, ind).productivity, gj = capsOf(w, jpn).productivity;
  assert.ok(gi > 1.06 && gi < 1.2, `India grows fast: ${gi}`);
  assert.ok(gj > 0.98 && gj < 1.05, `Japan grows slowly: ${gj}`);
  assert.ok(techAvg(capsOf(w, ind)) > t0, 'technology spreads');
  assert.equal(capsOf(w, ind).hist.length, 24);
});

test('budgets and grand strategy: a strategy per country, spending, and a budget law', async () => {
  const { budgetDaily, budgetOf, chooseStrategy, strategyBudget, setBudget, researchFactor } = await import('../src/sim/nationalBudget');
  const { EXTRA_PROPOSALS } = await import('../src/sim/congressExtra');
  const { audit } = await import('../src/engine/ledger');
  const w = generateWorld(1815, 'Budget', 0, { citizensPerRegion: 1 });
  for (const n of w.nations) { n.stats.revHist = Array(30).fill(cur(1000)); }
  budgetDaily(w);
  assert.ok(w.nations.every((n) => n.strategy), 'every country has a strategy');
  const usa = w.nations.find((n) => n.iso === 'USA')!;
  assert.equal(usa.strategy!.kind, 'regional', 'a superpower leads its region');
  assert.ok((usa.chronicle ?? []).length >= 1, 'the chronicle records it');
  const dev = strategyBudget(usa, 'development');
  assert.ok(dev.research > budgetOf(usa).research * 0.99);
  setBudget(usa, dev);
  assert.ok(researchFactor(usa) > 1.3, 'more research than in 2025');
  assert.equal(EXTRA_PROPOSALS.budget.check(w, usa, w.citizens[w.playerId], {}), 'That is the budget already in force.');
  assert.ok(chooseStrategy(w, usa).kind);
  assert.ok(audit(w).ok);
});

test('world history: monthly power record and the State of the World', async () => {
  const { powerMonthly, yearReport } = await import('../src/sim/worldHistory');
  const { timeOfDate } = await import('../src/engine/calendar');
  const w = generateWorld(1816, 'Annals', 0, { citizensPerRegion: 1 });
  w.time = timeOfDate(2025, 1, 1);
  powerMonthly(w);
  assert.ok(w.nations.every((n) => n.powerHist?.length === 1));
  yearReport(w, 2025);
  const r = w.yearReports!.at(-1)!;
  assert.equal(r.year, 2025);
  assert.equal(r.rows.length, 16);
  assert.ok(r.headlines[0].includes('leading power'));
});

test('thirty years of history: growth stays in realistic bands and poorer countries catch up', async () => {
  const { capsOf, strategicMonth } = await import('../src/sim/strategic');
  const { TECH_DOMAINS } = await import('../src/data/nationBaselines');
  const w = generateWorld(1817, 'Decades', 0, { citizensPerRegion: 1 });
  const p0 = new Map(w.nations.map((n) => [n.id, capsOf(w, n).productivity]));
  for (let m = 0; m < 360; m++) {
    const leaders = Object.fromEntries(TECH_DOMAINS.map((d) => [d, Math.max(...w.nations.map((n) => capsOf(w, n).tech[d]))])) as any;
    for (const n of w.nations) strategicMonth(w, n, leaders);
  }
  const annual = (n: (typeof w.nations)[number]) => (Math.pow(capsOf(w, n).productivity / p0.get(n.id)!, 1 / 30) - 1) * 100;
  for (const n of w.nations) {
    const g = annual(n);
    assert.ok(g > -1 && g < 7, `${n.iso}: ${g.toFixed(2)}% a year over 30 years`);
  }
  const ind = w.nations.find((n) => n.iso === 'IND')!, usa = w.nations.find((n) => n.iso === 'USA')!;
  assert.ok(annual(ind) > annual(usa) + 1.5, 'India catches up');
  const techGap0 = 1, gap = Math.max(...TECH_DOMAINS.map((d) => capsOf(w, usa).tech[d] - capsOf(w, ind).tech[d]));
  assert.ok(gap < 40 * techGap0, 'technology gaps narrow');
});
