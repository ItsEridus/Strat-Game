import { useState } from 'preact/hooks';
import type { World } from '../../sim/types';
import { ActBtn, CitLink, Empty, Num, Panel, Select, Help } from '../common';
import { player } from '../../sim/query';
import { bidCheck, createAuction, createCheck, lotName, nextMinBid, placeBid } from '../../sim/auctions';
import { isEquipped, ownedGear, statText } from '../../sim/gear';
import { B } from '../../data/balance';
import { GOLD, fmtAmt, g } from '../../engine/money';
import { fmtWhen } from '../../engine/clock';
import { itemName } from '../../data/items';

export function Auctions({ w }: { w: World }) {
  const p = player(w);
  const open = Object.values(w.auctions).filter((a) => a.status === 'open').sort((a, b) => a.end - b.end);
  const done = Object.values(w.auctions).filter((a) => a.status !== 'open' && (a.seller === p.id || a.bid?.by === p.id)).slice(-10).reverse();
  const [bids, setBids] = useState<Record<number, number>>({});
  const lots: [string, string][] = [
    ...ownedGear(w, p).filter((x) => !isEquipped(p, x.id)).map((x) => [`g${x.id}`, `${x.name} (${statText(x)})`] as [string, string]),
    ...Object.keys(p.inv).filter((k) => k.startsWith('sp:')).map((k) => [`i${k}`, `${itemName(k)} (${p.inv[k]})`] as [string, string]),
  ];
  const [lot, setLot] = useState(lots[0]?.[0] ?? '');
  const [min, setMin] = useState(1);
  const [hours, setHours] = useState(24);
  const lotObj = lot.startsWith('g') ? { gear: Number(lot.slice(1)) } : { item: lot.slice(1), qty: 1 };
  return (
    <div class="grid">
      <Panel title="Auction house" class="wide">
        <Help>Equipment and special items sell to the highest gold bidder (level {B.auctions.level}+). Your winning bid is held in escrow; if outbid you are refunded immediately. A bid in the last {B.auctions.snipeWindow} minutes extends the auction. Sellers pay a {B.auctions.listFee}-gold listing fee and {B.auctions.sellerCut * 100}% of the sale.</Help>
        {open.length ? (
          <table class="table">
            <thead><tr><th>Lot</th><th>Seller</th><th>Ends</th><th class="num">Current</th><th>Bids</th><th /></tr></thead>
            <tbody>{open.map((a) => {
              const amt = bids[a.id] ?? nextMinBid(a) / 1000;
              return (
                <tr><td>{lotName(w, a)}{a.gear != null && <small class="muted"> — {statText(w.gear[a.gear])}</small>}</td><td><CitLink w={w} id={a.seller} /></td><td>{fmtWhen(w, a.end)}</td>
                  <td class="num">{a.bid ? <>{fmtAmt(GOLD, a.bid.amount)} {a.bid.by === p.id ? '(you)' : ''}</> : `min ${fmtAmt(GOLD, a.minBid)}`}</td><td>{a.bids}</td>
                  <td><Num value={amt} step={0.05} width={70} onInput={(v) => setBids({ ...bids, [a.id]: v })} />
                    <ActBtn small why={bidCheck(w, p, a, g(amt))} showWhy={false} run={(w) => placeBid(w, p, a.id, g(amt))}>Bid</ActBtn></td></tr>
              );
            })}</tbody>
          </table>
        ) : <Empty>No open auctions.</Empty>}
      </Panel>
      <Panel title="Sell at auction">
        <div class="form">
          <label>Lot <Select value={lot} options={lots.length ? lots : [['', 'nothing to sell']]} onChange={setLot} /></label>
          <label>Starting bid (gold) <Num value={min} step={0.1} onInput={setMin} /></label>
          <label>Hours <Num value={hours} min={B.auctions.minHours} max={B.auctions.maxHours} onInput={setHours} /></label>
        </div>
        <ActBtn why={!lot ? 'Nothing to sell.' : createCheck(w, p, lotObj, g(min), hours)} run={(w) => createAuction(w, p, lotObj, g(min), hours)}>Open auction</ActBtn>
      </Panel>
      <Panel title="Your finished auctions">
        {done.map((a) => <div class="small">{lotName(w, a)} — {a.status}{a.bid ? ` for ${fmtAmt(GOLD, a.bid.amount)} to ${w.citizens[a.bid.by]?.name}` : ''}</div>)}
        {!done.length && <Empty>None yet.</Empty>}
      </Panel>
    </div>
  );
}
