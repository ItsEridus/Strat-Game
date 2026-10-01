// AI business management and background household demand. AI owners use the
// same market/company actions (and permission checks) as the player.
import { hasQuirk } from '../sim/nature';
import { welfareTransfer } from '../sim/nationalBudget';
import { createCompany } from '../sim/company';
import { noteBirth } from '../sim/companyLife';
import { covered, industryPay } from '../sim/labour';
import { BUSINESS_LOAN_DAYS, businessLoan } from '../sim/banking';
import { importParity } from '../sim/trade';
import { isRaw } from '../data/items';
import { corpTaxRate, overheadPerUnit } from '../sim/companyCosts';
import { BASKET_LABELS, basketOf } from '../data/economy';
import { dateAt } from '../engine/calendar';
import { goldScale } from '../sim/wages';
import { housingCost } from '../sim/housing';
import { isMinor } from '../sim/childhood';
import type { Company, Id, World } from '../sim/types';
import { census, companiesOf, nationals, representation } from '../sim/census';
import { B } from '../data/balance';
import { PRODUCTS, RAWS, kindOf, outputKey, qualityOf, refValue } from '../data/items';
import { consume, mint, pay } from '../engine/ledger';
import { c as cur, g } from '../engine/money';
import { chance, rand } from '../engine/rng';
import { SYSTEM } from '../sim/authority';
import { baseUnits, foundCompany, inputKey, inputPerUnit, productionFactors, setOffer, upgradeCost, upgradeCompany } from '../sim/company';
import { buyBest, list, listingsFor, refPrice, repriceListing } from '../sim/market';
import { cancelOrder, ordersOf, placeOrder, vwap } from '../sim/fx';
import { GOLD } from '../engine/money';
import { companyCurrency, controller, coref, cref, hhref, natref } from '../sim/query';

/** Actor id allowed to operate a company (owner citizen, holding CEO, or nation president). */
export function operatorOf(w: World, co: Company): Id | null {
  if (co.owner.k === 'cit') return co.owner.id;
  if (co.owner.k === 'hold') return w.holdings[co.owner.id]?.ceo ?? null;
  if (co.owner.k === 'nat') return w.nations[co.owner.id]?.president ?? null;
  return null;
}

/** Estimated unit cost (currency minor units) from wages and inputs. */
export function unitCost(w: World, co: Company): number {
  const units = Math.max(0.5, baseUnits(co) * productionFactors(w, co, null).mult);
  const wage = co.offer?.wage ?? cur(B.wages.start);
  let cost = wage / units + overheadPerUnit(w, co, units * Math.max(1, co.workers.length));
  const ik = inputKey(co);
  if (ik) {
    const market = controller(w.regions[co.region]);
    cost += (refPrice(w, market, ik) ?? refValue(ik)) * inputPerUnit(co);
  }
  // Sales tax comes out of the price, so the price has to cover it too.
  const vat = w.nations[controller(w.regions[co.region])].taxes.vat;
  return Math.round(cost / Math.max(0.5, 1 - vat / 100));
}

/** The median wage on offer in a country (cached per day). */
const medianCache = new WeakMap<World, { day: number; by: Map<Id, number> }>();
export function medianOffer(w: World, nation: Id): number {
  const day = Math.floor(w.time / 1440);
  let c = medianCache.get(w);
  if (!c || c.day !== day) { c = { day, by: new Map() }; medianCache.set(w, c); }
  let m = c.by.get(nation);
  if (m == null) {
    const xs = companiesOf(w, nation).filter((co) => co.offer && co.workers.length).map((co) => co.offer!.wage).sort((a, b) => a - b);
    m = xs.length ? xs[Math.floor(xs.length / 2)] : cur(B.wages.start);
    c.by.set(nation, m);
  }
  return m;
}

export function manageCompany(w: World, co: Company) {
  const actor = operatorOf(w, co);
  if (actor == null || !w.citizens[actor]) return;
  const market = controller(w.regions[co.region]);
  const n = w.nations[market];
  if (n.exile) return;
  const currency = companyCurrency(w, co);
  const key = outputKey(co.industry, co.q);
  const ref = coref(co.id);
  const funds = () => co.wallet[currency] ?? 0;
  const workers = co.workers.length;
  const payroll = (co.offer?.wage ?? 0) * Math.max(1, workers);
  const last = co.hist[co.hist.length - 1];
  const isAIOwner = !(co.owner.k === 'cit' && co.owner.id === w.playerId);

  // 1. Buy inputs for about two days of production.
  const ik = inputKey(co);
  if (ik && co.auto.buyInputs) {
    const perShift = baseUnits(co) * inputPerUnit(co) * 1.3;
    const need = Math.ceil(perShift * Math.max(1, workers + 1) * 2) - (co.inv[ik] ?? 0);
    const budget = funds() - payroll * 2;
    const refp = refPrice(w, market, ik) ?? refValue(ik);
    if (need > 0 && budget > refp) {
      const maxUnit = Math.round(refp * 1.6);
      const affordable = Math.floor(budget / Math.max(1, refp));
      const r = buyBest(w, actor, ref, market, ik, Math.min(need, affordable), maxUnit);
      if (r.ok) co.today.inputCost += r.data.spent;
    }
  }

  // 2. Sell output: list stock and adjust asking price from sales.
  if (co.auto.sell) {
    const cost = unitCost(w, co);
    let price = co.prices[key] ?? Math.round(Math.max(refValue(key), cost * B.ai.markup));
    const mine = listingsFor(w, market, key).filter((l) => l.seller.k === 'co' && l.seller.id === co.id);
    const listed = mine.reduce((s, l) => s + l.qty, 0);
    const sold = last?.sold ?? 0;
    const cheapestOther = listingsFor(w, market, key).find((l) => !(l.seller.k === 'co' && l.seller.id === co.id));
    if (listed > 0 && sold === 0) price = Math.round(price * (1 - B.ai.priceStep));
    else if (listed === 0 || sold > (listed + sold) * 0.6) price = Math.round(price * (1 + B.ai.priceStep));
    if (cheapestOther && cheapestOther.price < price && listed > baseUnits(co) * 3) price = Math.round((price + cheapestOther.price) / 2);
    // Imports cap raw-material prices: no one pays more than the world price plus freight and tariff.
    if (isRaw(key)) price = Math.min(price, importParity(w, market, key));
    price = Math.min(Math.max(price, Math.round(cost * B.market.minPriceFrac), 1), Math.round(cost * 3));
    co.prices[key] = price;
    for (const l of mine) if (l.price !== price) repriceListing(w, actor, l.id, price);
    const stock = co.inv[key] ?? 0;
    if (stock > 0) list(w, actor, ref, market, key, stock, price);
  }

  // 3. Hiring: wage competition and position count.
  if (co.auto.hire) {
    const offer = co.offer ?? { wage: Math.max(n.minWage, cur(B.wages.start)), slots: 1, minEco: 0 };
    let { wage, slots } = offer;
    const vacancies = slots - workers;
    const listedStock = listingsFor(w, market, key).filter((l) => l.seller.k === 'co' && l.seller.id === co.id).reduce((s, l) => s + l.qty, 0);
    const dailyOut = baseUnits(co) * Math.max(1, workers);
    const procured = n.procure[key] ?? 0;
    const glut = listedStock > dailyOut * 4 + procured;
    const profit3 = co.hist.slice(-3).reduce((s, h) => s + h.profit, 0);
    // Pay rises faster in a tight labour market; cuts are rare and small (wages are sticky): only on the
    // first of the month, after a fortnight of losses.
    // Raising pay to fill a vacancy: weekly, and only while the wage is near the going rate and the work pays for it.
    const median = medianOffer(w, market);
    const perWorker = co.hist.length >= 7 ? co.hist.slice(-7).reduce((s, h) => s + h.revenue - h.inputCost - (h.overheads ?? 0), 0) / 7 / Math.max(1, workers) : Infinity;
    if (vacancies > 0 && (w.time / 1440 + co.id) % 7 < 1 && wage < median * 1.3 && wage < perWorker * 0.8) wage = Math.round(wage * (n.unemployment < 0.05 ? 1.04 : n.unemployment > 0.15 ? 1.01 : 1.02));
    else if (wage > n.minWage && dateAt(w.time).day === 1 && !covered(w, co) && co.hist.slice(-14).reduce((s, h) => s + h.profit, 0) < 0) wage = Math.round(wage * 0.97);
    const ikShort = ik && (co.inv[ik] ?? 0) < inputPerUnit(co) * 2;
    if (glut || ikShort) slots = Math.max(workers > 0 ? workers - (glut ? 1 : 0) : 0, 0);
    else if (vacancies <= 0 && funds() > payroll * 6 && (profit3 >= 0 || procured > listedStock)) slots = Math.min(B.company.maxWorkers[co.q - 1], slots + 1);
    if (procured > listedStock && slots === 0) slots = 1;
    wage = Math.max(wage, n.minWage);
    if (wage !== offer.wage || slots !== offer.slots || !co.offer) setOffer(w, actor, co.id, wage, slots, offer.minEco);
  }

  if (!isAIOwner) return;

  // 4. Owner cash management: keep a buffer, take the rest as profit, top up if short.
  const owner = co.owner.k === 'cit' ? w.citizens[co.owner.id] : null;
  // Keep a reserve for this month's corporate tax (paid on the 1st) as well as five days of wages.
  const d0 = dateAt(w.time).day;
  const monthProfit = co.hist.slice(-Math.min(30, d0)).reduce((t, h) => t + h.profit, 0);
  const buffer = payroll * 5 + (ik ? cur(60) : 0) + Math.round(Math.max(0, monthProfit) * corpTaxRate(w, co));
  if (co.owner.k === 'hold' && funds() > buffer * 2 && !w.citizens[w.holdings[co.owner.id]?.ceo ?? -1]?.player) {
    pay(w, ref, co.owner, currency, Math.floor(funds() - buffer * 1.5), `Profit from ${co.name}`);
  }
  if (owner && funds() > buffer * 2) pay(w, ref, cref(owner.id), currency, Math.floor(funds() - buffer * 1.5), `Profit from ${co.name}`);
  else if (owner && funds() < payroll * 2) {
    const top = Math.min(owner.wallet[currency] ?? 0, payroll * 3);
    if (top > 0) pay(w, cref(owner.id), ref, currency, top, `Funding ${co.name}`);
    // Still short: a profitable company borrows a few weeks of wages from the bank.
    if (funds() < payroll * 2 && !owner.player) businessLoan(w, owner, co, payroll * BUSINESS_LOAN_DAYS);
  }
  // 5. Upgrades when consistently profitable and the owner has gold to spare.
  if (owner && co.q < 5 && chance(w, 0.05)) {
    const profit7 = co.hist.slice(-7).reduce((s, h) => s + h.profit, 0);
    const cost = upgradeCost(w, owner, co);
    if (profit7 > 0 && (owner.wallet.GOLD ?? 0) > cost * 1.5) upgradeCompany(w, owner, co.id, cref(owner.id));
  }
}

/** Background households spend part of their wallet on food, tickets and weapons, then consume them. */
export function householdsDaily(w: World, half: number) {
  for (const h of w.households) {
    const n = w.nations[h.nation];
    if (n.exile) continue;
    const market = n.id;
    const cash = h.wallet[n.cur] ?? 0;
    // Spending swings with the world business cycle.
    // Spending swings with the business cycle and with confidence: people spend less when jobs are scarce.
    const confidence = 1 - Math.min(0.3, Math.max(0, n.unemployment - 0.06) * 1.5);
    let budget = Math.floor((cash * B.households.spendRate * (1 + B.dynamics.hhSpendSwing * w.econ.cycle) * confidence) / 2);
    const ref = hhref(h.nation);
    let unmet = 0;
    const by: Record<string, number> = {};
    for (const [kind, share] of Object.entries(B.households.shares)) {
      let b = Math.floor(budget * share);
      // Choose the cheapest quality per unit of value (energy for food).
      const opts = [1, 2, 3, 4, 5].map((q) => `${kind}:${q}`).map((k) => {
        const l = listingsFor(w, market, k)[0];
        return l ? { k, price: l.price, value: l.price / (qualityOf(k) * (kind === 'food' ? 10 : 1)) } : null;
      }).filter(Boolean).sort((a, b) => a!.value - b!.value) as { k: string; price: number }[];
      for (const o of opts) {
        if (b < o.price) break;
        // Leave part of the listed stock for citizens (and the player) shopping later in the day.
        const stock = listingsFor(w, market, o.k).reduce((sum, l) => sum + l.qty, 0);
        const cap = Math.floor(stock * B.households.maxStockShare);
        if (cap <= 0) continue;
        const r = buyBest(w, SYSTEM, ref, market, o.k, Math.min(cap, Math.floor(b / o.price)), Math.round(o.price * 1.3));
        if (r.ok) b -= r.data.spent;
      }
      unmet += b;
      by[kind] = (half === 0 ? 0 : h.unmetBy?.[kind] ?? 0) + b;
    }
    h.unmet = half === 0 ? unmet : h.unmet + unmet;
    h.unmetBy = by; // money households meant to spend on each good today but could not
    // Background consumption destroys the goods.
    for (const [k, q] of Object.entries(h.inv)) consume(w, ref, k, q, 'household consumption');
  }
}

/** Daily money circulation: living costs to households, treasury transfers. */
export function circulation(w: World) {
  const yday = Math.floor(w.time / 1440) - 1;
  for (const c of census(w).all) {
    if (c.player) continue;
    const done = (c.lastWorkDay === yday ? 1 : 0) + (c.lastTrainDay === yday ? 1 : 0) + (c.flags.hitDay === yday ? 1 : 0) + (c.flags.buildDay === yday ? 1 : 0) + (c.flags.voteDay === yday ? 1 : 0);
    if (done) mint(w, cref(c.id), GOLD, Math.max(1, Math.round(g(B.missions.aiGold * done) * goldScale(w, c.nation))), 'Daily missions');
  }
  for (const c of census(w).all) {
    const n = w.nations[c.nation];
    if (c.player && isMinor(w, c)) { const parent = (c.family?.parents ?? []).map((id) => w.citizens[id]).find((x) => x && !x.gone); if (parent) pay(w, cref(parent.id), hhref(parent.nation), w.nations[parent.nation].cur, Math.min(parent.wallet[w.nations[parent.nation].cur] ?? 0, cur(B.family.childPerDay)), 'Raising children'); continue; }
    const cash = c.wallet[n.cur] ?? 0;
    const kids = c.family?.kids.length ?? 0;
    const forKids = Math.min(Math.max(0, cash - cur(B.living.essentials)), cur(B.family.childPerDay * kids));
    if (kids && c.player) pay(w, cref(c.id), hhref(c.nation), n.cur, forKids, 'Raising children');
    const home = housingCost(w, c.dwelling);
    if (c.player && home > 0) pay(w, cref(c.id), hhref(c.nation), n.cur, Math.min(home, Math.max(0, (c.wallet[n.cur] ?? 0) - cur(B.living.essentials))), c.dwelling!.kind === 'rent' ? 'Rent' : 'Home upkeep and property tax');
    const due = Math.round(cur(B.living.essentials) * (hasQuirk(c, 'frugal') ? 0.9 : 1)) + (c.player ? 0 : forKids + home);
    if (cash < due) c.mood = Math.max(-1, c.mood - 0.05);
    // Lifestyle spending: AI citizens spend part of comfortable savings; the player only pays the fixed cost.
    const extra = c.player ? 0 : Math.floor(Math.max(0, cash - due - cur(B.living.comfort)) * B.living.discretionary);
    if (c.player) {
      // The player's everyday costs, split as a household there spends them (data/economy.ts).
      let left = Math.min(c.wallet[n.cur] ?? 0, due);
      const shares = basketOf(n.cur);
      shares.forEach((sh, i) => { const amt = i === shares.length - 1 ? left : Math.min(left, Math.round(due * sh)); if (amt > 0) { pay(w, cref(c.id), hhref(c.nation), n.cur, amt, BASKET_LABELS[i]); left -= amt; } });
    } else pay(w, cref(c.id), hhref(c.nation), n.cur, Math.min(c.wallet[n.cur] ?? 0, due + extra), 'Living costs');
  }
  for (const n of w.nations) {
    if (n.exile) continue;
    const t = n.stats.revHist.length >= 7 ? welfareTransfer(n) : Math.floor((n.wallet[n.cur] ?? 0) * B.treasury.householdTransfer);
    if (t > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, t, 'Social transfers')) n.stats.spendToday += t;
  }
}

/** AI entrepreneurs look for undersupplied goods and found companies to meet demand. */
export function entrepreneurship(w: World) {
  nations: for (const n of w.nations) {
    if (n.exile) continue;
    // Producers of each good in this country (a bigger society supports more of them).
    const byKey = new Map<string, Company[]>();
    for (const co of companiesOf(w, n.id)) { if (!w.companies[co.id]) continue; const k = outputKey(co.industry, co.q); byKey.set(k, [...(byKey.get(k) ?? []), co]); }
    const maxProducers = Math.round(8 / representation(w, n.id));
    // No more private firms than about one for every two people of working age (small societies were filling with empty firms).
    const crowded = companiesOf(w, n.id).length >= Math.max(10, nationals(w, n.id).filter((c) => !c.retired && !c.gone).length * 0.5);
    const founder = () => nationals(w, n.id).filter((c) => !c.player && (c.persona === 'industrialist' || c.persona === 'investor' || c.persona === 'merchant') && (c.wallet.GOLD ?? 0) > g(B.company.foundCost[0]) * goldScale(w, n.id) * 1.5 && (c.wallet[n.cur] ?? 0) > cur(200)).sort((a, b) => b.traits.ambition - a.traits.ambition)[0];
    for (const kind of [...PRODUCTS, ...RAWS] as string[]) {
      // Nobody in the country makes this at all (a new industry, or the last maker failed): someone may start.
      if (![...byKey.keys()].some((k) => kindOf(k) === kind) && chance(w, 0.1)) {
        const f = founder();
        if (f) { foundForDemand(w, f.id, kind, n.id); continue nations; } // a missing industry may always start
        // No private founder: for food and raw materials, the state steps in (a state enterprise).
        if ((kind === 'food' || (RAWS as string[]).includes(kind)) && stateFound(w, n.id, kind)) continue nations;
      }
      const keys = (RAWS as string[]).includes(kind) ? [kind] : [1, 2, 3].map((q) => `${kind}:${q}`);
      for (const key of keys) {
        const supply = listingsFor(w, n.id, key).reduce((s, l) => s + l.qty, 0);
        const traded = (w.trades[`${n.id}|${key}`] ?? []).slice(-3).reduce((s, x) => s + x.qty, 0);
        const makers = byKey.get(key) ?? [];
        const producers = makers.length;
        const busy = makers.every((co) => (co.hist[co.hist.length - 1]?.produced ?? 0) > 0 && (!co.offer || co.workers.length >= co.offer.slots));
        if (!crowded && traded > 0 && supply < traded / 3 && producers < maxProducers && busy && chance(w, 0.3)) {
          const f = founder();
          if (!f) continue;
          foundForDemand(w, f.id, kindOf(key), n.id);
          continue nations; // at most one new company per country per day keeps growth readable
        }
      }
    }
  }
}

/** A state enterprise, founded and funded by the treasury when no one else will make an essential good. */
function stateFound(w: World, nation: Id, kind: string): boolean {
  const n = w.nations[nation];
  const president = n.president != null ? w.citizens[n.president] : null;
  if (!president) return false;
  const regions = w.regions.filter((r) => controller(r) === nation);
  const raw = (RAWS as string[]).includes(kind);
  const region = raw ? regions.slice().sort((a, b) => ((b.res as any)[kind] ?? 0) - ((a.res as any)[kind] ?? 0))[0] : regions.slice().sort((a, b) => b.pop - a.pop)[0];
  if (!region || (raw && !((region.res as any)[kind] > 0))) return false;
  const seed = cur(250);
  // An empty treasury borrows the seed money (bonds), as governments do to keep essentials going.
  if ((n.wallet[n.cur] ?? 0) < seed * 2) { mint(w, natref(nation), n.cur, seed * 2, 'Government bonds issued'); n.debt = (n.debt ?? 0) + seed * 2; n.debtIssued = (n.debtIssued ?? 0) + seed * 2; }
  const co = createCompany(w, natref(nation), kind as any, 1, region.id);
  noteBirth(w, co);
  co.state = true;
  co.auto = { sell: true, buyInputs: true, hire: true };
  pay(w, natref(nation), coref(co.id), n.cur, seed, `Founding ${co.name} (state enterprise)`);
  co.offer = { wage: Math.max(n.minWage, cur(B.wages.start)), slots: 2, minEco: 0 };
  return true;
}

function foundForDemand(w: World, founderId: Id, kind: string, nation: Id) {
  const f = w.citizens[founderId];
  const regions = w.regions.filter((r) => controller(r) === nation);
  const raw = (RAWS as string[]).includes(kind);
  const region = raw
    ? regions.slice().sort((a, b) => ((b.res as any)[kind] ?? 0) - ((a.res as any)[kind] ?? 0) || a.pollution - b.pollution)[0]
    : regions.slice().sort((a, b) => a.pollution - b.pollution || b.pop - a.pop)[0];
  if (!region) return;
  if (controller(w.regions[f.loc]) !== nation) return;
  const r = foundCompany(w, f, cref(f.id), kind as any, region.id);
  if (!r.ok) return;
  const co = w.companies[r.data.id];
  co.auto = { sell: true, buyInputs: true, hire: true };
  const n = w.nations[nation];
  const seed = Math.min(f.wallet[n.cur] ?? 0, cur(rand(w, 120, 250)));
  pay(w, cref(f.id), coref(co.id), n.cur, seed, `Funding ${co.name}`);
  setOffer(w, f.id, co.id, Math.max(n.minWage, Math.round(cur(B.wages.start) * (0.5 + industryPay(co.industry) * 0.5))), 2, 0);
}

/**
 * Treasury market-making: the economy minister (or president) re-quotes a
 * ladder of gold bids/asks around the recent rate using a slice of reserves,
 * so citizens can always exchange at a visible spread. Uses normal FX orders.
 */
export function centralBank(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const actor = n.cabinet.economy ?? n.president;
    if (actor == null || w.citizens[actor]?.player) continue; // a player minister manages quotes manually
    const ref = natref(n.id);
    for (const o of ordersOf(w, ref)) cancelOrder(w, actor, o.id);
    // Anchor drifts toward recent trades by at most maxDailyMove per day.
    const traded = vwap(w, n.cur) ?? n.fxAnchor;
    let anchor = n.fxAnchor + Math.max(-1, Math.min(1, (traded - n.fxAnchor) / n.fxAnchor / B.fx.drift)) * n.fxAnchor * B.fx.drift;
    // The reserve target grows with the society the bank serves (more citizens trade more gold).
    const reserve = (n.wallet[GOLD] ?? 0) / ((B.fx.reserveTarget * 1000) / representation(w, n.id));
    if (reserve < 0.5) anchor *= 1 + B.fx.pressure; // running out of gold: let currency weaken
    else if (reserve > 1.5) anchor *= 1 - B.fx.pressure; // gold piling up: let currency strengthen
    n.fxAnchor = Math.round(anchor);
    const rate = n.fxAnchor;
    const goldBudget = Math.floor((n.wallet[GOLD] ?? 0) * B.fx.bankShare);
    const curBudget = Math.floor((n.wallet[n.cur] ?? 0) * B.fx.bankShare);
    const L = B.fx.levels;
    for (let k = 1; k <= L; k++) {
      const askRate = Math.round(rate * (1 + B.fx.spread * k));
      const bidRate = Math.round(rate * (1 - B.fx.spread * k));
      const gAsk = Math.floor(goldBudget / L);
      const gBid = Math.floor(((curBudget / L) * 1000) / bidRate);
      if (gAsk > 0) placeOrder(w, actor, ref, n.cur, 'sellGold', gAsk, askRate);
      if (gBid > 0) placeOrder(w, actor, ref, n.cur, 'sellCur', gBid, bidRate);
    }
  }
}
