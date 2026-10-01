import { useState } from 'preact/hooks';
import type { World } from '../../sim/types';
import { ActBtn, Amt, Empty, Num, Panel, Select, Sparkline, Help } from '../common';
import { store } from '../store';
import { cref, player } from '../../sim/query';
import { asks, bids, buyGold, cancelOrder, midRate, ordersOf, placeOrder, sellGold } from '../../sim/fx';
import { GOLD, c as cur, fmtAmt, fromLocal, g, goldForCur, localStep, toLocal } from '../../engine/money';
import { MONEY, priceLevel } from '../../data/economy';
import { B } from '../../data/balance';
import type { Result } from '../../engine/result';

function makerName(w: World, o: { maker: { k: string; id: number } }) {
  if (o.maker.k === 'nat') return `${w.nations[o.maker.id].name} treasury`;
  if (o.maker.k === 'cit') return w.citizens[o.maker.id]?.name ?? '?';
  return o.maker.k;
}

export function Currency({ w }: { w: World }) {
  const p = player(w);
  const code = store.sel.cur ?? w.nations[p.nation].cur;
  const [goldAmt, setGoldAmt] = useState(1);
  const [rate, setRate] = useState(Math.round(toLocal(code, midRate(w, code))));
  const [side, setSide] = useState<'sellGold' | 'sellCur'>('sellCur');
  const [from, setFrom] = useState(w.nations[p.nation].cur);
  const [to, setTo] = useState(w.nations.find((n) => n.cur !== from)?.cur ?? from);
  const [amt, setAmt] = useState(() => Math.round(toLocal(w.nations[p.nation].cur, 5000)));
  const a = asks(w, code), b = bids(w, code);
  const trades = w.fxTrades[code] ?? [];
  const mine = ordersOf(w, cref(p.id));
  return (
    <div class="grid">
      <Panel title="Currency market" class="wide" right={<Select value={code} options={w.nations.map((n) => [n.cur, `${n.cur} — ${n.name}`])} onChange={(v) => store.go('fx', { cur: v })} />}>
        <p class="small">{MONEY[code]?.name ?? code}: {fmtAmt(code, 100)} buys what about $10 buys in the United States.{code !== 'USD' && w.nations.some((n) => n.cur === 'USD') ? ` At today's gold rates, 1 US dollar is ${(toLocal(code, midRate(w, code)) / Math.max(0.01, toLocal('USD', midRate(w, 'USD')))).toFixed(2)} ${code}.` : ''}</p>
        <Help>All rates read <b>{code} per 1 gold</b>. <b>Asks</b> are offers to sell gold (you pay {code}); <b>bids</b> are offers to buy gold (you receive {code}). Orders fill partially at the resting order’s rate. Treasuries quote a managed ladder around their reference rate.</Help>
        <div class="stats">
          <div class="stat"><small>Best ask (buy gold)</small><b>{a[0] ? fmtAmt(code, a[0].rate) : '—'}</b></div>
          <div class="stat"><small>Best bid (sell gold)</small><b>{b[0] ? fmtAmt(code, b[0].rate) : '—'}</b></div>
          <div class="stat"><small>Spread</small><b>{a[0] && b[0] ? `${(((a[0].rate - b[0].rate) / a[0].rate) * 100).toFixed(1)}%` : '—'}</b></div>
          <div class="stat"><small>You hold</small><b><Amt asset={GOLD} v={p.wallet[GOLD] ?? 0} /> · <Amt asset={code} v={p.wallet[code] ?? 0} /></b></div>
        </div>
        <Sparkline values={trades.slice(-60).map((t) => t.rate)} width={400} height={50} />
      </Panel>
      <Panel title="Quick trade">
        <div class="form row"><label>Gold <Num value={goldAmt} step={0.1} min={0.001} onInput={setGoldAmt} /></label></div>
        <ActBtn kind="primary" why={!a.length ? 'No one is selling gold.' : null} run={(w) => buyGold(w, p.id, cref(p.id), code, g(goldAmt))}>Buy {goldAmt} gold (≈{a[0] ? fmtAmt(code, Math.round(a[0].rate * goldAmt)) : '—'})</ActBtn>
        <ActBtn why={!b.length ? 'No one is buying gold.' : null} run={(w) => sellGold(w, p.id, cref(p.id), code, g(goldAmt))}>Sell {goldAmt} gold (≈{b[0] ? fmtAmt(code, Math.round(b[0].rate * goldAmt)) : '—'})</ActBtn>
      </Panel>
      <Panel title="Post an order">
        <div class="form">
          <label>I want to <Select value={side} options={[['sellCur', `buy gold with ${code} (bid)`], ['sellGold', `sell gold for ${code} (ask)`]]} onChange={setSide} /></label>
          <label>Gold amount <Num value={goldAmt} step={0.1} onInput={setGoldAmt} /></label>
          <label>Rate ({code} per gold) <Num value={rate} step={localStep(code)} onInput={setRate} /></label>
        </div>
        <p class="small">{side === 'sellCur' ? `Escrows ${fmtAmt(code, Math.floor(g(goldAmt) * fromLocal(code, rate) / 1000))}` : `Escrows ${goldAmt} gold`}. Crossing orders fill immediately.</p>
        <ActBtn run={(w) => placeOrder(w, p.id, cref(p.id), code, side, g(goldAmt), fromLocal(code, rate))}>Post order</ActBtn>
      </Panel>
      <Panel title="Order book">
        <div class="book">
          <div><h4>Asks — sell gold</h4>{a.slice(0, 8).map((o) => <div class="small">{fmtAmt(code, o.rate)} · {fmtAmt(GOLD, o.amount)} · {makerName(w, o)}</div>)}{!a.length && <Empty>none</Empty>}</div>
          <div><h4>Bids — buy gold</h4>{b.slice(0, 8).map((o) => <div class="small">{fmtAmt(code, o.rate)} · {fmtAmt(GOLD, goldForCur(o.amount, o.rate))} · {makerName(w, o)}</div>)}{!b.length && <Empty>none</Empty>}</div>
        </div>
      </Panel>
      <Panel title="Your open orders">
        {mine.length ? mine.map((o) => (
          <div class="row small">{o.side === 'sellGold' ? 'Sell' : 'Buy'} gold @ {fmtAmt(o.cur, o.rate)} — escrow {fmtAmt(o.side === 'sellGold' ? GOLD : o.cur, o.amount)}
            <ActBtn small kind="ghost" run={(w) => cancelOrder(w, p.id, o.id)}>Cancel</ActBtn></div>
        )) : <Empty>No open orders.</Empty>}
      </Panel>
      <Panel title="Money around the world" class="wide">
        <Help>Every country's prices in its own currency. Exchange rates come from the gold market; price levels follow real 2025 data, so a coffee costs far less in Mumbai than in Sydney.</Help>
        <table class="table small"><thead><tr><th>Country</th><th>Currency</th><th class="num">1 US dollar</th><th class="num">A coffee</th><th class="num">A day's essentials</th><th class="num">Price level (US = 100)</th></tr></thead>
          <tbody>{w.nations.map((n) => <tr><td>{n.name}</td><td>{MONEY[n.cur]?.name ?? n.cur}</td>
            <td class="num">{n.cur === 'USD' ? '—' : (toLocal(n.cur, midRate(w, n.cur)) / Math.max(0.01, toLocal('USD', midRate(w, 'USD')))).toFixed(2)}</td>
            <td class="num">{fmtAmt(n.cur, cur(B.social.treatCost))}</td><td class="num">{fmtAmt(n.cur, cur(B.living.essentials))}</td><td class="num">{Math.round(priceLevel(n.cur) * 100)}</td></tr>)}</tbody></table>
      </Panel>
      <Panel title="Convert currency (routed through gold)">
        <div class="form row">
          <label>Sell <Num value={amt} step={localStep(from)} onInput={setAmt} /></label>
          <Select value={from} options={w.nations.map((n) => [n.cur, n.cur])} onChange={setFrom} />
          <label>for</label>
          <Select value={to} options={w.nations.map((n) => [n.cur, n.cur])} onChange={setTo} />
        </div>
        <ActBtn why={from === to ? 'Pick two different currencies.' : null} run={(w) => convert(w, p.id, from, to, fromLocal(from, amt))}>Convert</ActBtn>
        <p class="small muted">Two trades: {from}→gold at the best bid, then gold→{to} at the best ask. Both spreads apply.</p>
      </Panel>
    </div>
  );
}

function convert(w: World, pid: number, from: string, to: string, amount: number): Result {
  const me = cref(pid);
  const goldBefore = w.citizens[pid].wallet[GOLD] ?? 0;
  // Step 1: sell `from` currency for gold (hit the asks of `from`, i.e. buy gold with it).
  const bestAsk = asks(w, from)[0];
  if (!bestAsk) return { ok: false, msg: `No gold offered for ${from}.` };
  const r1 = buyGold(w, pid, me, from, goldForCur(amount, bestAsk.rate));
  if (!r1.ok) return r1;
  const got = (w.citizens[pid].wallet[GOLD] ?? 0) - goldBefore;
  const r2 = sellGold(w, pid, me, to, got);
  return r2.ok ? { ok: true, msg: `${r1.msg} Then ${r2.msg}` } : { ok: false, msg: `${r1.msg} (kept the gold: ${r2.msg})` };
}
