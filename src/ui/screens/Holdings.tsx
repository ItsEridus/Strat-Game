import { useState } from 'preact/hooks';
import type { Holding, World } from '../../sim/types';
import { ActBtn, CitLink, Empty, Num, Panel, Select, Sparkline, Help } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import {
  buyShares, buySharesCheck, cancelShareOrder, contributeCompany, foundHolding, foundHoldingCheck, holdingCompanies, issueShares, lastSharePrice,
  listShares, listSharesCheck, ownership, payDividend, proposeCeo, setRole, sharesOf, splitShares, valuation, voteCeo,
} from '../../sim/holdings';
import { GOLD, c as cur, fmtAmt, g } from '../../engine/money';
import { B } from '../../data/balance';
import { INDUSTRY_INFO } from '../../data/items';

export function Holdings({ w }: { w: World }) {
  const p = player(w);
  const sel = store.sel.holding != null ? w.holdings[store.sel.holding] : undefined;
  const [name, setName] = useState('');
  if (sel) return <HoldingDetail w={w} h={sel} />;
  const list = Object.values(w.holdings).sort((a, b) => b.valuation - a.valuation);
  return (
    <div class="grid">
      <Panel title="Holdings & stock market" class="wide">
        <Help>Holdings own companies, keep their own treasury and storage, and issue shares. Shareholder votes are weighted by the whole share base (a CEO change needs a majority of all shares). Holdings cannot buy shares themselves. Share prices below come from real trades.</Help>
        <table class="table">
          <thead><tr><th>Holding</th><th>CEO</th><th>Companies</th><th class="num">Value</th><th class="num">Last price</th><th class="num">Your stake</th><th>Price</th></tr></thead>
          <tbody>{list.map((h) => (
            <tr class="link-row" onClick={() => store.go('holdings', { holding: h.id })}>
              <td><b>{h.name}</b> <small class="muted">{w.nations[h.nation].name}</small></td>
              <td><CitLink w={w} id={h.ceo} /></td><td>{holdingCompanies(w, h).length}</td>
              <td class="num">{fmtAmt(GOLD, valuation(w, h))}</td>
              <td class="num">{lastSharePrice(w, h.id) != null ? fmtAmt(GOLD, lastSharePrice(w, h.id)!) : '—'}</td>
              <td class="num">{(ownership(w, h, p.id) * 100).toFixed(1)}%</td>
              <td><Sparkline values={w.shareTrades.filter((t) => t.holding === h.id).slice(-30).map((t) => t.price)} width={80} height={20} /></td>
            </tr>
          ))}</tbody>
        </table>
        <div class="form row">
          <input placeholder="Holding name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <ActBtn why={foundHoldingCheck(w, p)} run={(w) => foundHolding(w, p, name)}>Found holding ({B.holdings.cost} gold, standing {B.holdings.rep} or a company)</ActBtn>
        </div>
      </Panel>
    </div>
  );
}

function HoldingDetail({ w, h }: { w: World; h: Holding }) {
  const p = player(w);
  const isCeo = h.ceo === p.id;
  const n = w.nations[h.nation];
  const orders = Object.values(w.shareOrders).filter((o) => o.holding === h.id).sort((a, b) => a.price - b.price);
  const holders = Object.entries(h.shares).map(([id, s]) => ({ id: Number(id), s })).sort((a, b) => b.s - a.s);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState((lastSharePrice(w, h.id) ?? h.issuePrice) / 1000);
  const [div, setDiv] = useState(100);
  const [issue, setIssue] = useState(20);
  const [coId, setCo] = useState(Object.values(w.companies).find((c) => c.owner.k === 'cit' && c.owner.id === p.id)?.id ?? -1);
  const vote = h.votes.find((v) => !v.done);
  const myCos = Object.values(w.companies).filter((c) => c.owner.k === 'cit' && c.owner.id === p.id);
  return (
    <div class="grid">
      <Panel title={`🏢 ${h.name}`} class="wide" right={<button class="btn sm ghost" onClick={() => store.go('holdings', { holding: null })}>← All holdings</button>}>
        <div class="stats">
          <div class="stat"><small>CEO</small><b><CitLink w={w} id={h.ceo} /></b></div>
          <div class="stat"><small>Shares outstanding</small><b>{h.total}</b></div>
          <div class="stat"><small>Net asset value</small><b>{fmtAmt(GOLD, valuation(w, h))}</b></div>
          <div class="stat"><small>Per share (NAV)</small><b>{fmtAmt(GOLD, Math.round(valuation(w, h) / h.total))}</b></div>
          <div class="stat"><small>Treasury</small><b>{Object.entries(h.wallet).map(([a, v]) => fmtAmt(a, v)).join(' · ') || 'empty'}</b></div>
          <div class="stat"><small>You own</small><b>{sharesOf(h, p.id)} shares ({(ownership(w, h, p.id) * 100).toFixed(1)}%)</b></div>
        </div>
        <p class="small">Roles: vice {w.citizens[h.roles.vice ?? -1]?.name ?? '—'}, accountant {w.citizens[h.roles.accountant ?? -1]?.name ?? '—'}, manager {w.citizens[h.roles.manager ?? -1]?.name ?? '—'}, salesman {w.citizens[h.roles.salesman ?? -1]?.name ?? '—'}. Dividends paid: {h.divHist.length}.</p>
      </Panel>
      <Panel title="Companies">
        {holdingCompanies(w, h).map((c) => <div class="small">{INDUSTRY_INFO[c.industry].icon} {c.name} Q{c.q} · {c.workers.length} workers · 7d profit {fmtAmt(n.cur, c.hist.slice(-7).reduce((s, x) => s + x.profit, 0))}</div>)}
        {!holdingCompanies(w, h).length && <Empty>No companies yet.</Empty>}
        {isCeo && myCos.length > 0 && <div class="form row"><Select value={coId} options={myCos.map((c) => [c.id, c.name])} onChange={setCo} /><ActBtn small run={(w) => contributeCompany(w, p, h.id, coId)}>Move my company into holding</ActBtn></div>}
      </Panel>
      <Panel title="Stock market">
        <table class="table compact"><tbody>{orders.map((o) => (
          <tr><td>{o.seller.k === 'hold' ? 'new issue' : w.citizens[o.seller.id]?.name}</td><td>{o.qty}</td><td class="num">{fmtAmt(GOLD, o.price)}</td>
            <td>{o.seller.k === 'cit' && o.seller.id === p.id ? <ActBtn small kind="ghost" run={(w) => cancelShareOrder(w, p, o.id)}>Cancel</ActBtn> : <ActBtn small why={buySharesCheck(w, p.id, o, Math.min(qty, o.qty))} showWhy={false} run={(w) => buyShares(w, p.id, o.id, Math.min(qty, o.qty))}>Buy {Math.min(qty, o.qty)}</ActBtn>}</td></tr>
        ))}</tbody></table>
        {!orders.length && <Empty>No shares offered.</Empty>}
        <div class="form row"><label>Qty <Num value={qty} min={1} onInput={setQty} /></label><label>Price (gold) <Num value={price} step={0.05} onInput={setPrice} /></label>
          <ActBtn small why={listSharesCheck(w, p, h.id, qty, g(price))} run={(w) => listShares(w, p, h.id, qty, g(price))}>Sell my shares</ActBtn></div>
      </Panel>
      <Panel title="Shareholders">
        {holders.map((x) => <div class="small"><CitLink w={w} id={x.id} /> {x.s} ({((x.s / h.total) * 100).toFixed(1)}%)</div>)}
        {vote ? (
          <div class="card">Vote: make <CitLink w={w} id={vote.target} /> CEO — closes in {Math.ceil((vote.closes - w.time) / 60)}h
            <ActBtn small run={(w) => voteCeo(w, p, h.id, vote.id, true)}>Yes</ActBtn><ActBtn small run={(w) => voteCeo(w, p, h.id, vote.id, false)}>No</ActBtn></div>
        ) : ownership(w, h, p.id) > 0 && h.ceo !== p.id && <ActBtn small run={(w) => proposeCeo(w, p, h.id, p.id)}>Call vote: make me CEO</ActBtn>}
      </Panel>
      {isCeo && (
        <Panel title="CEO tools">
          <div class="form row"><label>Dividend ({n.cur}) <Num value={div} onInput={setDiv} /></label><ActBtn small run={(w) => payDividend(w, p.id, h.id, n.cur, cur(div))}>Pay pro rata</ActBtn></div>
          <div class="form row"><label>Issue shares <Num value={issue} onInput={setIssue} /></label><label>at <Num value={price} step={0.05} onInput={setPrice} /> g</label><ActBtn small run={(w) => issueShares(w, p.id, h.id, issue, g(price))}>Issue (dilutes)</ActBtn></div>
          <div class="row">{[2, 5].map((k) => <ActBtn small kind="ghost" run={(w) => splitShares(w, p.id, h.id, k)}>Split {k}:1</ActBtn>)}</div>
          <div class="row small">{(['vice', 'accountant', 'manager', 'salesman'] as const).map((r) => <ActBtn small kind="ghost" run={(w) => setRole(w, p, h.id, r, holders.find((x) => x.id !== p.id)?.id ?? null)}>Assign {r} to top holder</ActBtn>)}</div>
        </Panel>
      )}
    </div>
  );
}
