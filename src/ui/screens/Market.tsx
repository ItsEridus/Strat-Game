import { useState } from 'preact/hooks';
import type { AccountRef, World } from '../../sim/types';
import { ActBtn, Amt, Empty, Item, Num, Panel, Select, Sparkline, Tabs, Help } from '../common';
import { store } from '../store';
import { controller, cref, player } from '../../sim/query';
import { bestAsk, buyCheck, buyListing, cancelListing, list, listCheck, listingsFor, refPrice, saleTaxes, supplyOf } from '../../sim/market';
import { GOOD_USE, MARKET_KEYS, itemName, kindOf } from '../../data/items';
import { c as cur, fmtAmt } from '../../engine/money';
import { B } from '../../data/balance';

const CATS: [string, string][] = [
  ['raw', '🪨 Raw'], ['food', '🍲 Food'], ['wg', '🔫 Ground weapons'], ['wa', '🚀 Air weapons'], ['ticket', '🎫 Tickets'],
  ['materials', '🧱 Building materials'], ['clothing', '👕 Clothing'], ['electronics', '📱 Electronics'], ['medicine', '💊 Medicine'],
];

function sellerName(w: World, r: AccountRef) {
  switch (r.k) {
    case 'cit': return w.citizens[r.id]?.name ?? '?';
    case 'co': return w.companies[r.id]?.name ?? '?';
    case 'nat': return `${w.nations[r.id].name} (state)`;
    case 'hold': return w.holdings[r.id]?.name ?? '?';
    default: return r.k;
  }
}

export function Market({ w }: { w: World }) {
  const p = player(w);
  const here = controller(w.regions[p.loc]);
  const market = store.sel.market ?? here;
  const cat = store.sel.mcat ?? 'food';
  const keys = MARKET_KEYS.filter((k) => (cat === 'raw' ? !k.includes(':') : kindOf(k) === cat));
  const item = keys.includes(store.sel.mitem) ? store.sel.mitem : keys[0];
  const n = w.nations[market];
  const book = listingsFor(w, market, item);
  const hist = w.trades[`${market}|${item}`] ?? [];
  const [qty, setQty] = useState(10);
  const [sq, setSq] = useState(10);
  const [sp, setSp] = useState(Math.round((refPrice(w, market, item) ?? 200)) / 100);
  const taxes = saleTaxes(w, market, cref(p.id));
  const gross = cur(sp) * sq;
  const tax = Math.round((gross * (taxes.vat + taxes.imp)) / 100);
  const myListings = Object.values(w.listings).filter((l) => l.seller.k === 'cit' && l.seller.id === p.id);
  return (
    <div class="grid">
      <Panel title="Goods market" class="wide" right={
        <Select value={market} options={w.nations.filter((x) => !x.exile).map((x) => [x.id, `${x.name} market (${x.cur})${x.id === here ? ' — you are here' : ''}`])} onChange={(v) => store.go('market', { market: v })} />
      }>
        <Help>You can browse any market; buying and selling require being located in that country (travel on the Map). Prices are set by sellers’ listings — AI firms reprice from their sales and costs.</Help>
        <Tabs tabs={CATS} value={cat} onChange={(c) => store.go('market', { mcat: c, mitem: null })} />
        {GOOD_USE[kindOf(item)] && <p class="small muted">{GOOD_USE[kindOf(item)]} Grades run basic, standard, good, premium, top-grade.</p>}
        <div class="item-grid">
          {keys.map((k) => {
            const a = bestAsk(w, market, k);
            return (
              <button class={`item-card ${k === item ? 'on' : ''}`} onClick={() => store.go('market', { mitem: k })}>
                <Item k={k} />
                <small>{a != null ? `from ${fmtAmt(n.cur, a)}` : 'no offers'} · {supplyOf(w, market, k)} listed</small>
              </button>
            );
          })}
        </div>
      </Panel>
      <Panel title={<span><Item k={item} /> — offers in {n.name}</span>}>
        <div class="row"><label>Quantity <Num value={qty} min={1} onInput={setQty} /></label></div>
        {book.length ? (
          <table class="table compact">
            <thead><tr><th>Seller</th><th>Qty</th><th class="num">Price</th><th /></tr></thead>
            <tbody>{book.slice(0, 15).map((l) => {
              const q = Math.min(qty, l.qty);
              return (
                <tr><td>{sellerName(w, l.seller)}</td><td>{l.qty}</td><td class="num">{fmtAmt(n.cur, l.price)}</td>
                  <td><ActBtn small why={buyCheck(w, p.id, cref(p.id), l, q)} showWhy={false} run={(w) => buyListing(w, p.id, cref(p.id), l.id, q)}>Buy {q} ({fmtAmt(n.cur, q * l.price)})</ActBtn></td></tr>
              );
            })}</tbody>
          </table>
        ) : <Empty>No one is selling {itemName(item)} here.</Empty>}
        {book[0] && buyCheck(w, p.id, cref(p.id), book[0], Math.min(qty, book[0].qty)) && <p class="why">{buyCheck(w, p.id, cref(p.id), book[0], Math.min(qty, book[0].qty))}</p>}
      </Panel>
      <Panel title="Price history (daily average of real trades)">
        <Sparkline values={hist.map((h) => h.value / Math.max(1, h.qty))} width={280} height={60} />
        <table class="table compact">
          <thead><tr><th>Day</th><th>Volume</th><th class="num">Avg</th><th class="num">Low–High</th></tr></thead>
          <tbody>{hist.slice(-7).reverse().map((h) => <tr><td>{h.day}</td><td>{h.qty}</td><td class="num">{fmtAmt(n.cur, Math.round(h.value / h.qty))}</td><td class="num">{fmtAmt(n.cur, h.lo)}–{fmtAmt(n.cur, h.hi)}</td></tr>)}</tbody>
        </table>
      </Panel>
      <Panel title="Sell from your inventory">
        <p>You have {p.inv[item] ?? 0} {itemName(item)}.</p>
        <div class="form row">
          <label>Qty <Num value={sq} min={1} onInput={setSq} /></label>
          <label>Unit price ({n.cur}) <Num value={sp} step={0.05} onInput={setSp} /></label>
        </div>
        <p class="small">Gross <Amt asset={n.cur} v={gross} /> − VAT {taxes.vat.toFixed(1)}%{taxes.imp ? ` − import ${taxes.imp.toFixed(1)}%` : ''} (<Amt asset={n.cur} v={tax} />) = <b>net <Amt asset={n.cur} v={gross - tax} /></b></p>
        <ActBtn kind="primary" why={listCheck(w, p.id, cref(p.id), market, item, sq, cur(sp))} run={(w) => list(w, p.id, cref(p.id), market, item, sq, cur(sp))}>List for sale</ActBtn>
        <p class="small muted">Listed goods are reserved in escrow until sold or withdrawn. Max {B.market.maxListings} listings per market.</p>
      </Panel>
      <Panel title="Your listings">
        {myListings.length ? myListings.map((l) => (
          <div class="row small">{w.nations[l.market].name}: {l.qty}× {itemName(l.item)} @ {fmtAmt(w.nations[l.market].cur, l.price)}
            <ActBtn small kind="ghost" run={(w) => cancelListing(w, p.id, l.id)}>Withdraw</ActBtn></div>
        )) : <Empty>No active listings.</Empty>}
      </Panel>
    </div>
  );
}
