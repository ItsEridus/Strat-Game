// AI business management and background household demand. AI owners use the
// same market/company actions (and permission checks) as the player.
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
  let cost = wage / units;
  const ik = inputKey(co);
  if (ik) {
    const market = controller(w.regions[co.region]);
    cost += (refPrice(w, market, ik) ?? refValue(ik)) * inputPerUnit(co);
  }
  return Math.round(cost);
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
    price = Math.max(price, Math.round(cost * B.market.minPriceFrac), 1);
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
    if (vacancies > 0) wage = Math.round(wage * 1.03);
    else if (profit3 < 0 && wage > n.minWage) wage = Math.round(wage * 0.98);
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
  const buffer = payroll * 5 + (ik ? cur(60) : 0);
  if (co.owner.k === 'hold' && funds() > buffer * 2 && !w.citizens[w.holdings[co.owner.id]?.ceo ?? -1]?.player) {
    pay(w, ref, co.owner, currency, Math.floor(funds() - buffer * 1.5), `Profit from ${co.name}`);
  }
  if (owner && funds() > buffer * 2) pay(w, ref, cref(owner.id), currency, Math.floor(funds() - buffer * 1.5), `Profit from ${co.name}`);
  else if (owner && funds() < payroll * 2) {
    const top = Math.min(owner.wallet[currency] ?? 0, payroll * 3);
    if (top > 0) pay(w, cref(owner.id), ref, currency, top, `Funding ${co.name}`);
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
    let budget = Math.floor((cash * B.households.spendRate * (1 + B.dynamics.hhSpendSwing * w.econ.cycle)) / 2);
    const ref = hhref(h.nation);
    let unmet = 0;
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
    }
    h.unmet = half === 0 ? unmet : h.unmet + unmet;
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
    if (done) mint(w, cref(c.id), GOLD, g(B.missions.aiGold * done), 'Daily missions');
  }
  for (const c of census(w).all) {
    const n = w.nations[c.nation];
    const cash = c.wallet[n.cur] ?? 0;
    const due = cur(B.living.perDay);
    if (cash < due) c.mood = Math.max(-1, c.mood - 0.05);
    // Lifestyle spending: AI citizens spend part of comfortable savings; the player only pays the fixed cost.
    const extra = c.player ? 0 : Math.floor(Math.max(0, cash - due - cur(B.living.comfort)) * B.living.discretionary);
    pay(w, cref(c.id), hhref(c.nation), n.cur, Math.min(cash, due + extra), 'Living costs');
  }
  for (const n of w.nations) {
    if (n.exile) continue;
    const t = Math.floor((n.wallet[n.cur] ?? 0) * B.treasury.householdTransfer);
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
    for (const kind of [...PRODUCTS, ...RAWS] as string[]) {
      const keys = (RAWS as string[]).includes(kind) ? [kind] : [1, 2, 3].map((q) => `${kind}:${q}`);
      for (const key of keys) {
        const supply = listingsFor(w, n.id, key).reduce((s, l) => s + l.qty, 0);
        const traded = (w.trades[`${n.id}|${key}`] ?? []).slice(-3).reduce((s, x) => s + x.qty, 0);
        const makers = byKey.get(key) ?? [];
        const producers = makers.length;
        const busy = makers.every((co) => (co.hist[co.hist.length - 1]?.produced ?? 0) > 0 && (!co.offer || co.workers.length >= co.offer.slots));
        if (traded > 0 && supply < traded / 3 && producers < maxProducers && busy && chance(w, 0.3)) {
          const founders = nationals(w, n.id).filter((c) => !c.player && (c.persona === 'industrialist' || c.persona === 'investor' || c.persona === 'merchant') && (c.wallet.GOLD ?? 0) > B.company.foundCost[0] * 1000 * 1.5 && (c.wallet[n.cur] ?? 0) > cur(200));
          const f = founders.sort((a, b) => b.traits.ambition - a.traits.ambition)[0];
          if (!f) continue;
          foundForDemand(w, f.id, kindOf(key), n.id);
          continue nations; // at most one new company per country per day keeps growth readable
        }
      }
    }
  }
}

function foundForDemand(w: World, founderId: Id, kind: string, nation: Id) {
  const f = w.citizens[founderId];
  const regions = w.regions.filter((r) => controller(r) === nation);
  const raw = ['grain', 'iron', 'titanium', 'oil'].includes(kind);
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
  setOffer(w, f.id, co.id, Math.max(n.minWage, cur(B.wages.start)), 2, 0);
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
