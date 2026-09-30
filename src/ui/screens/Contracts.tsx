import { useState } from 'preact/hooks';
import type { Consideration, World } from '../../sim/types';
import { ActBtn, CitLink, Empty, Num, Panel, Select, Help } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import { acceptCheck, acceptContract, closeContract, contractFee, createCheck, createContract, describeContract, emptyCons, valueOf } from '../../sim/contracts';
import { isEquipped, ownedGear } from '../../sim/gear';
import { GOLD, fmtAmt, toMinor } from '../../engine/money';
import { itemName } from '../../data/items';
import { fmtWhen } from '../../engine/clock';

function SideEditor({ w, owner, value, onChange, label }: { w: World; owner: number; value: Consideration; onChange: (c: Consideration) => void; label: string }) {
  const c = w.citizens[owner];
  const assets = [GOLD, ...w.nations.map((n) => n.cur)];
  const [asset, setAsset] = useState(GOLD);
  const [amt, setAmt] = useState(1);
  const items = Object.keys(c?.inv ?? {}).filter((k) => (c.inv[k] ?? 0) > 0);
  const [item, setItem] = useState(items[0] ?? 'food:1');
  const [qty, setQty] = useState(1);
  const cos = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === owner && co.locked == null);
  const gear = c ? ownedGear(w, c).filter((x) => !isEquipped(c, x.id)) : [];
  const holds = Object.values(w.holdings).filter((h) => (h.shares[owner] ?? 0) > 0);
  const set = (patch: Partial<Consideration>) => onChange({ ...value, ...patch });
  return (
    <div class="card">
      <h4>{label}</h4>
      <div class="form row"><Select value={asset} options={assets.map((a) => [a, a])} onChange={setAsset} /><Num value={amt} step={0.5} onInput={setAmt} />
        <button class="btn sm" onClick={() => set({ money: { ...value.money, [asset]: toMinor(asset, amt) } })}>Set money</button></div>
      <div class="form row"><Select value={item} options={[...new Set([...items, 'food:1', 'wg:1', 'grain', 'iron'])].map((k) => [k, itemName(k)])} onChange={setItem} /><Num value={qty} onInput={setQty} />
        <button class="btn sm" onClick={() => set({ items: { ...value.items, [item]: qty } })}>Set items</button></div>
      {cos.length > 0 && <div class="row small">Companies: {cos.map((co) => <label class="check"><input type="checkbox" checked={value.companies.includes(co.id)} onChange={() => set({ companies: value.companies.includes(co.id) ? value.companies.filter((x) => x !== co.id) : [...value.companies, co.id] })} />{co.name}</label>)}</div>}
      {gear.length > 0 && <div class="row small">Gear: {gear.slice(0, 8).map((x) => <label class="check"><input type="checkbox" checked={value.gear.includes(x.id)} onChange={() => set({ gear: value.gear.includes(x.id) ? value.gear.filter((y) => y !== x.id) : [...value.gear, x.id] })} />{x.name}</label>)}</div>}
      {holds.length > 0 && <div class="row small">Shares: {holds.map((h) => <button class="btn sm ghost" onClick={() => set({ shares: [...value.shares.filter((s) => s.holding !== h.id), { holding: h.id, qty: Math.max(1, Math.floor((h.shares[owner] ?? 0) / 2)) }] })}>{h.name} (half)</button>)}</div>}
      <p class="small muted">{describeSide(w, value)} <button class="btn sm ghost" onClick={() => onChange(emptyCons())}>Clear</button></p>
    </div>
  );
}

const describeSide = (w: World, x: Consideration) => describeContract(w, { id: 0, from: 0, to: 0, give: x, want: emptyCons(), fee: 0, status: 'open', created: 0, expires: 0, note: '' }).split('\n')[0].replace(/^.*gives: /, '');

export function Contracts({ w }: { w: World }) {
  const p = player(w);
  const people = Object.values(w.citizens).filter((c) => !c.player).sort((a, b) => (a.nation === p.nation ? 0 : 1) - (b.nation === p.nation ? 0 : 1) || a.name.localeCompare(b.name));
  const [to, setTo] = useState<number>(store.sel.contractTo ?? people[0].id);
  const [give, setGive] = useState<Consideration>(emptyCons());
  const [want, setWant] = useState<Consideration>(emptyCons());
  const [note, setNote] = useState('');
  const mine = Object.values(w.contracts).filter((c) => c.from === p.id || c.to === p.id).sort((a, b) => b.created - a.created);
  const fee = contractFee(w, p, w.citizens[to], give, want);
  return (
    <div class="grid">
      <Panel title="New contract" class="wide">
        <Help>Your side is escrowed when you send; acceptance moves both sides at once; cancelling, rejection or expiry returns your escrow. NPCs accept when the deal is worth it to them (relationships help). Fees are burned; unconditional gifts to citizens under level 10 are exempt.</Help>
        <div class="form row"><label>Counterparty <Select value={to} options={people.map((c) => [c.id, `${c.name} (${w.nations[c.nation].name}, ${c.persona})`])} onChange={setTo} /></label></div>
        <div class="book">
          <SideEditor w={w} owner={p.id} value={give} onChange={setGive} label="You give" />
          <SideEditor w={w} owner={to} value={want} onChange={setWant} label="You ask for" />
        </div>
        <p class="small">Value to them ≈ {fmtAmt(GOLD, valueOf(w, give, w.citizens[to].nation))} offered vs {fmtAmt(GOLD, valueOf(w, want, w.citizens[to].nation))} asked. Fee {fmtAmt(GOLD, fee)}.</p>
        <input placeholder="Note (optional)" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} style={{ width: '100%' }} />
        <ActBtn kind="primary" why={createCheck(w, p, to, give, want)} run={(w) => { const r = createContract(w, p, to, give, want, note); if (r.ok) { setGive(emptyCons()); setWant(emptyCons()); } return r; }}>Send contract</ActBtn>
      </Panel>
      <Panel title="Your contracts" class="wide">
        {mine.length ? mine.map((ct) => (
          <div class="card">
            <b>{ct.from === p.id ? <>To <CitLink w={w} id={ct.to} /></> : <>From <CitLink w={w} id={ct.from} /></>}</b> · {ct.status} · {fmtWhen(w, ct.created)}{ct.status === 'open' ? ` · expires ${fmtWhen(w, ct.expires)}` : ''}
            <p class="small prewrap">{describeContract(w, ct)}</p>
            {ct.status === 'open' && ct.to === p.id && <><ActBtn small kind="primary" why={acceptCheck(w, ct, p.id)} run={(w) => acceptContract(w, p.id, ct.id)}>Accept</ActBtn><ActBtn small kind="danger" run={(w) => closeContract(w, p.id, ct.id, 'rejected')}>Reject</ActBtn></>}
            {ct.status === 'open' && ct.from === p.id && <ActBtn small kind="ghost" run={(w) => closeContract(w, p.id, ct.id, 'cancelled')}>Cancel</ActBtn>}
          </div>
        )) : <Empty>No contracts.</Empty>}
      </Panel>
    </div>
  );
}
