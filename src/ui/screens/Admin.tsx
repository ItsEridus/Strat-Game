// Secret admin panel (Ctrl+Shift+A, or type "admin"). Not listed in the menu.
import { ageOf, reputation, standing } from '../../sim/growth';
import { useState } from 'preact/hooks';
import type { Attr, World } from '../../sim/types';
import { ActBtn, Amt, Num, Panel, Select } from '../common';
import { player } from '../../sim/query';
import { GOLD, fromLocal as toMinor, toLocal as toWhole } from '../../engine/money';
import { MARKET_KEYS, SPECIALS, itemName } from '../../data/items';
import { RANKS } from '../../data/military';
import { store } from '../store';
import {
  adminCharm, adminFreedom, adminGiveItem, adminMilRank, adminRefill, adminSetAttr, adminSetAge, adminSetStanding, adminSetMoney, adminSetStat, adminTeleport, adminTreasury,
} from '../../sim/admin';

const ATTRS: [Attr, string][] = [['str', 'Strength'], ['acc', 'Accuracy'], ['luck', 'Luck'], ['end', 'Endurance'], ['lead', 'Leadership'], ['eco', 'Economic aptitude'], ['cons', 'Construction']];
const STATS = [['power', 'Training power'], ['eco', 'Economic skill'], ['influence', 'Influence'], ['fame', 'Fame'], ['notoriety', 'Notoriety'], ['heat', 'Police heat']] as const;

export function Admin({ w }: { w: World }) {
  const p = player(w);
  const home = w.nations[p.nation].cur;
  const currencies = [GOLD, home, ...w.nations.map((n) => n.cur).filter((c) => c !== home)];
  const [asset, setAsset] = useState(home);
  const [amount, setAmount] = useState(Math.round(toWhole(home, p.wallet[home] ?? 0)));
  const [rep, setRep] = useState(Math.floor(standing(p)));
  const [age, setAge] = useState(ageOf(w, p));
  const [attr, setAttr] = useState<Attr>('str');
  const [attrV, setAttrV] = useState(p.attrs.str);
  const [stat, setStat] = useState<(typeof STATS)[number][0]>('power');
  const [statV, setStatV] = useState(Math.round(p.power));
  const [item, setItem] = useState('food:5');
  const [qty, setQty] = useState(10);
  const [region, setRegion] = useState(p.loc);
  const [home_, setHome] = useState(false);
  const [rank, setRank] = useState(p.mil.rank);
  const [treasury, setTreasury] = useState(10000);
  const items = [...MARKET_KEYS, ...Object.keys(SPECIALS).map((k) => `sp:${k}`)];
  return (
    <div class="grid admin">
      <Panel title="🛠️ Admin panel" class="wide" right={<button class="btn sm ghost" onClick={() => store.go('dashboard')}>Close</button>}>
        <p class="small muted">Changes apply to your citizen immediately. Money and items go through the ledger as “Admin”, and the campaign is marked as edited{w.settings.adminUsed ? ' (it already is)' : ''}.</p>
        <div class="row small">{currencies.slice(0, 2).map((c) => <span class="chip"><Amt asset={c} v={p.wallet[c] ?? 0} /></span>)}<span class="chip">{reputation(p).name}</span><span class="chip">Age {ageOf(w, p)}</span><span class="chip">⚡ {Math.floor(p.energy)}</span></div>
      </Panel>

      <Panel title="💰 Money">
        <div class="row small">
          <Select value={asset} options={currencies.map((c) => [c, c === GOLD ? 'Gold' : c])} onChange={(c) => { setAsset(c); setAmount(Math.round(toWhole(c, p.wallet[c] ?? 0))); }} />
          <Num value={amount} onInput={setAmount} min={0} width={140} />
          <ActBtn small kind="primary" run={(w) => adminSetMoney(w, asset, toMinor(asset, amount))}>Set balance</ActBtn>
        </div>
        <div class="row small">
          {[1000, 100000, 1000000].map((x) => <ActBtn small run={(w) => adminSetMoney(w, asset, (player(w).wallet[asset] ?? 0) + toMinor(asset, x))}>+{x.toLocaleString()}</ActBtn>)}
        </div>
        <div class="row small">Treasury of {w.nations[p.nation].name}: <Num value={treasury} onInput={setTreasury} min={1} width={120} />
          <ActBtn small run={(w) => adminTreasury(w, home, toMinor(home, treasury))}>Add {home}</ActBtn>
          <ActBtn small run={(w) => adminTreasury(w, GOLD, toMinor(GOLD, treasury / 100))}>Add {treasury / 100} gold</ActBtn></div>
      </Panel>

      <Panel title="⭐ Reputation, age & skills">
        <div class="row small">Standing <Num value={rep} onInput={setRep} min={0} max={10000} width={80} /><ActBtn small kind="primary" run={(w) => adminSetStanding(w, rep)}>Set standing</ActBtn></div>
        <div class="row small">Age <Num value={age} onInput={setAge} min={16} max={100} width={80} /><ActBtn small run={(w) => adminSetAge(w, age)}>Set age</ActBtn></div>
        <div class="row small"><Select value={attr} options={ATTRS} onChange={(a) => { setAttr(a); setAttrV(p.attrs[a]); }} />
          <Num value={attrV} onInput={setAttrV} min={0} max={500} width={80} /><ActBtn small run={(w) => adminSetAttr(w, attr, attrV)}>Set skill</ActBtn></div>
        <div class="row small"><Select value={stat} options={STATS.map(([k, l]) => [k, l] as [typeof k, string])} onChange={(s) => setStat(s)} />
          <Num value={statV} onInput={setStatV} min={0} width={100} /><ActBtn small run={(w) => adminSetStat(w, stat, statV)}>Set</ActBtn></div>
        <div class="row small"><ActBtn small run={adminRefill}>Refill energy & allowance</ActBtn></div>
      </Panel>

      <Panel title="📦 Items">
        <div class="row small">
          <Select value={item} options={items.map((k) => [k, itemName(k)])} onChange={setItem} />
          <Num value={qty} onInput={setQty} width={90} />
          <ActBtn small kind="primary" run={(w) => adminGiveItem(w, item, qty)}>{qty >= 0 ? 'Give' : 'Remove'}</ActBtn>
        </div>
        <p class="small muted">You have {p.inv[item] ?? 0}. A negative quantity removes items.</p>
      </Panel>

      <Panel title="🧭 Travel & status">
        <div class="row small">
          <Select value={region} options={w.regions.map((r) => [r.id, `${r.name} (${w.nations[r.owner].name})`] as [number, string]).sort((a, b) => a[1].localeCompare(b[1]))} onChange={setRegion} />
          <label><input type="checkbox" checked={home_} onChange={() => setHome(!home_)} /> make it home</label>
          <ActBtn small kind="primary" run={(w) => adminTeleport(w, region, home_)}>Teleport</ActBtn>
        </div>
        <div class="row small">
          <ActBtn small run={adminFreedom}>Release from prison & clear cases</ActBtn>
          <ActBtn small run={(w) => adminCharm(w, 60)}>Everyone likes you</ActBtn>
        </div>
        {p.mil.branch && <div class="row small">Rank <Select value={rank} options={RANKS[p.mil.branch].map((r, i) => [i, r.name] as [number, string])} onChange={setRank} />
          <ActBtn small run={(w) => adminMilRank(w, rank)}>Set rank</ActBtn></div>}
      </Panel>
    </div>
  );
}
