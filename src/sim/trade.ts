// Trade (1.5 ECON). World commodity prices move every day with each commodity's
// real volatility (oil swings most) and mean-revert to their long-run level; a supply
// shock lifts the price. Imports cap what raw materials can cost at home (a country
// pays at most the world price plus freight and tariff). Companies with surplus stock
// export it where it sells for more after the exchange rate, freight and tariffs, and
// bring the money home through the currency market. Exports and imports are counted.
import { opecPriceFactor } from './energy';
import { superCycle } from './markets';
import type { Company, Id, World } from './types';
import { RAWS } from '../data/items';
import { refValue } from '../data/items';
import { pay } from '../engine/ledger';
import { GOLD } from '../engine/money';
import { next } from '../engine/rng';
import { companyCurrency, controller, coref, hhref } from './query';
import { embargoed, list, listingsFor, refPrice } from './market';
import { buyGold, sellGold } from './fx';
import { operatorOf } from '../ai/economy';
import { outputKey } from '../data/items';
import { blocked, importRate, quotaShare } from './tradePolicy';
import { freeTrade } from './treaties';

/** Annual volatility of world prices (roughly the 2015–2024 record). */
const VOL: Record<string, number> = { oil: 0.35, grain: 0.25, iron: 0.28, copper: 0.24, titanium: 0.2, timber: 0.22, cotton: 0.24 };
/** Freight, insurance and handling, as a share of the value shipped. */
export const FREIGHT = 0.08;

/** The long-run world price of a raw material, in gold per unit (US prices: 100 units of value a gold). */
const basePrice = (k: string) => refValue(k) / 100 / 100;
export function worldPrices(w: World) {
  const ws = (w.econ.world ??= {});
  for (const k of RAWS) ws[k] ??= { p: basePrice(k), hist: [] };
  return ws;
}
/** A world price against its long-run level (1 = normal). */
export const worldPriceRatio = (w: World, k: string) => worldPrices(w)[k].p / basePrice(k);
/** World price in a country's money (minor units per unit). */
export const worldPriceIn = (w: World, nation: Id, k: string) => Math.round(worldPrices(w)[k].p * w.nations[nation].fxAnchor);

const gauss = (w: World) => (next(w) + next(w) + next(w) - 1.5) * 2; // about N(0,1)

export function worldPricesDaily(w: World) {
  const ws = worldPrices(w);
  for (const k of RAWS) {
    const x = ws[k];
    const target = (basePrice(k) * superCycle(w, k) / Math.max(0.3, w.econ.commodity[k] ?? 1)) * (k === 'oil' ? opecPriceFactor(w) : k === 'grain' ? 1 / Math.max(0.5, w.econ.harvest ?? 1) : 1); // a supply shock (or an OPEC+ cut) raises the price
    const drift = -Math.log(x.p / target) / 120;
    x.p = Math.max(target * 0.25, Math.min(target * 4, x.p * Math.exp(drift + gauss(w) * ((VOL[k] ?? 0.25) / Math.sqrt(365)))));
    x.hist.push(x.p);
    if (x.hist.length > 60) x.hist.shift();
  }
}

/** Import parity: the most a raw material can cost in a country before importing is cheaper. */
export const importParity = (w: World, nation: Id, k: string) => Math.round(worldPriceIn(w, nation, k) * (1 + FREIGHT + w.nations[nation].taxes.import / 100));

/** Record a sale across a border (exporter's and importer's statistics, in gold). */
export function noteTrade(w: World, from: Id, to: Id, gross: number) {
  const g = Math.round((gross * 1000) / Math.max(1, w.nations[to].fxAnchor));
  const a = w.nations[from], b = w.nations[to];
  (a.trade ??= { exp: 0, imp: 0, hist: [] }).exp += g;
  (b.trade ??= { exp: 0, imp: 0, hist: [] }).imp += g;
}

/** Up to this many export listings per country per day (keeps flows modest next to home markets). */
const MAX_EXPORTS = 3;

/** A company's stock beyond about three days' sales is surplus that could be exported. */
function surplus(co: Company, key: string) {
  const sold = co.hist.slice(-3).reduce((t, h) => t + h.sold, 0) / 3;
  return Math.max(0, (co.inv[key] ?? 0) - Math.ceil(sold * 3) - 5);
}

export function tradeDaily(w: World) {
  worldPricesDaily(w);
  for (const n of w.nations) {
    const t = (n.trade ??= { exp: 0, imp: 0, hist: [] });
    t.hist.push({ exp: t.exp, imp: t.imp });
    if (t.hist.length > 30) t.hist.shift();
    t.exp = 0; t.imp = 0;
  }
  // Exporters: the companies with the most surplus look for a better market abroad.
  const byNation = new Map<Id, number>();
  for (const co of Object.values(w.companies)) {
    const home = controller(w.regions[co.region]);
    if ((byNation.get(home) ?? 0) >= MAX_EXPORTS || w.nations[home].exile) continue;
    const actor = operatorOf(w, co);
    if (actor == null || w.citizens[actor]?.player) continue;
    const key = outputKey(co.industry, co.q);
    const extra = Math.min(10, Math.floor(surplus(co, key) * 0.3));
    if (extra < 1) continue;
    const homePrice = refPrice(w, home, key) ?? co.prices[key];
    if (!homePrice) continue;
    let best: { market: Id; price: number; gain: number } | null = null;
    for (const m of w.nations) {
      if (m.id === home || m.exile || embargoed(w, home, m.id) || blocked(w, home, m.id, key) || (quotaShare(w, m.id, home) < 1 && next(w) > quotaShare(w, m.id, home))) continue; // sanctions and quotas (tradePolicy.ts)
      const ask = listingsFor(w, m.id, key)[0]?.price ?? refPrice(w, m.id, key);
      if (!ask) continue;
      const price = Math.max(1, Math.round(ask * 0.97)); // just under the local sellers
      const inHome = (price * w.nations[home].fxAnchor) / Math.max(1, m.fxAnchor);
      const net = inHome * (1 - FREIGHT - (importRate(w, m.id, home, freeTrade(w, m.id, home) ? 0 : m.taxes.import, freeTrade(w, m.id, home)) + m.taxes.vat) / 100);
      const gain = net / homePrice;
      if (gain > 1.15 && (!best || gain > best.gain)) best = { market: m.id, price, gain };
    }
    if (!best) continue;
    // Freight is paid at home, to the local economy.
    const code = companyCurrency(w, co);
    const freight = Math.round(homePrice * extra * FREIGHT);
    if ((co.wallet[code] ?? 0) < freight) continue;
    const r = list(w, actor, coref(co.id), best.market, key, extra, best.price, true);
    if (!r.ok) continue;
    if (freight > 0) pay(w, coref(co.id), hhref(home), code, freight, 'Freight and insurance');
    byNation.set(home, (byNation.get(home) ?? 0) + 1);
  }
  repatriate(w);
}

/** Companies bring export earnings home: foreign money → gold → their own currency. */
function repatriate(w: World) {
  for (const co of Object.values(w.companies)) {
    const code = companyCurrency(w, co);
    const actor = operatorOf(w, co);
    if (actor == null || w.citizens[actor]?.player) continue;
    for (const [asset, amt] of Object.entries(co.wallet)) {
      if (asset === code || asset === GOLD || amt < 500) continue;
      const nat = w.nations.find((n) => n.cur === asset);
      if (!nat) continue;
      const goldAmt = Math.floor((amt * 1000) / Math.max(1, nat.fxAnchor) * 0.95);
      if (goldAmt < 1) continue;
      const got = buyGold(w, actor, coref(co.id), asset, goldAmt);
      const gold = got.ok ? (got.data?.got ?? 0) : 0;
      if (gold > 0) sellGold(w, actor, coref(co.id), code, gold);
    }
  }
}
