import type { World } from '../../sim/types';
import { ActBtn, Amt, Bar, Empty, Item, Panel, Help } from '../common';
import { cref, maxEnergy, player } from '../../sim/query';
import { eat, eatPreview } from '../../sim/citizen';
import { usedCap } from '../../engine/ledger';
import { B } from '../../data/balance';
import { kindOf, qualityOf, weightOf, SPECIALS } from '../../data/items';
import { fmtWhen } from '../../engine/clock';
import { GOLD } from '../../engine/money';
import { useSpecial, specialCheck } from '../../sim/specials';

export function Inventory({ w }: { w: World }) {
  const p = player(w);
  const used = usedCap(p.inv);
  const listed = Object.values(w.listings).filter((l) => l.seller.k === 'cit' && l.seller.id === p.id);
  const reserved: Record<string, number> = {};
  for (const l of listed) reserved[l.item] = (reserved[l.item] ?? 0) + l.qty;
  const items = Object.entries(p.inv).sort();
  return (
    <div class="grid">
      <Panel title="Storage" class="wide">
        <Bar v={used} max={B.storage.citizen} color="#5b8def" label={`${used.toLocaleString()} / ${B.storage.citizen.toLocaleString()} capacity used`} />
        <Help>Weights: raw 1, food 3, ground weapons 2, tickets & air weapons 4 (wiki). Listed goods sit in market escrow and are shown as reserved.</Help>
        {items.length ? (
          <table class="table">
            <thead><tr><th>Item</th><th>Available</th><th>Reserved (listed)</th><th>Weight</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(([k, n]) => {
                const kind = kindOf(k);
                const q = qualityOf(k);
                let action = null;
                if (kind === 'food') {
                  const pv = eatPreview(w, p, q);
                  const why = p.allowance < 1 ? 'No eating allowance.' : pv.gained <= 0 ? 'Energy full.' : null;
                  action = <ActBtn small why={why} showWhy={false} run={(w) => eat(w, p, q)} title={pv.wasted ? `${pv.wasted} energy would be wasted` : undefined}>Eat (+{pv.gained}{pv.wasted ? `, ${pv.wasted} wasted` : ''})</ActBtn>;
                }
                if (kind === 'sp') action = <ActBtn small why={specialCheck(w, p, k.slice(3))} showWhy={false} run={(w) => useSpecial(w, p, k.slice(3))}>Use</ActBtn>;
                return (
                  <tr><td><Item k={k} />{kind === 'sp' && <small class="muted"> — {SPECIALS[k.slice(3)]?.desc}</small>}</td><td>{n.toLocaleString()}</td><td>{reserved[k] ?? 0}</td><td>{weightOf(k) * n}</td><td>{action}</td></tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>Your storage is empty.</Empty>}
        {listed.length > 0 && <p class="small muted">Also listed on markets: {listed.map((l) => `${l.qty}× ${l.item}`).join(', ')}.</p>}
      </Panel>
      <Panel title="Wallet">
        <table class="table">
          <tbody>
            {Object.entries(p.wallet).sort().map(([a, v]) => <tr><td>{a === GOLD ? 'Gold' : a}</td><td class="num"><Amt asset={a} v={v} /></td></tr>)}
          </tbody>
        </table>
        <p class="small muted">Money has its own ledger and uses no storage capacity. Combat reward reserve: <Amt asset={GOLD} v={p.reserve} />.</p>
        <p class="small muted">Energy {Math.floor(p.energy)}/{maxEnergy(w, p)} · allowance {p.allowance}.</p>
      </Panel>
      <Panel title="Transaction history" class="wide">
        {w.ledger.length ? (
          <table class="table compact">
            <thead><tr><th>When</th><th>What</th><th class="num">Amount</th></tr></thead>
            <tbody>{w.ledger.slice(0, 60).map((e) => <tr><td class="small muted">{fmtWhen(w, e.t)}</td><td>{e.text}</td><td class="num"><Amt asset={e.asset} v={e.amount} sign /></td></tr>)}</tbody>
          </table>
        ) : <Empty>No transactions yet.</Empty>}
      </Panel>
    </div>
  );
  void cref;
}
