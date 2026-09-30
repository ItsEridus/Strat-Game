import { useState } from 'preact/hooks';
import type { Unit, World } from '../../sim/types';
import { ActBtn, CitLink, Empty, NationChip, Num, Panel, Select, Help } from '../common';
import { player } from '../../sim/query';
import { SQUAD_SPECS, distribute, donate, foundUnit, foundUnitCheck, invite, joinCheck, leaveUnit, members, promote, requestJoin, setDoctrine, setOrder, squadUpgrade } from '../../sim/units';
import { activeBattles } from '../../sim/battle';
import { B } from '../../data/balance';
import { rankOf } from '../../sim/combatMath';
import { c as cur } from '../../engine/money';
import { itemName } from '../../data/items';

export function Units({ w }: { w: World }) {
  const p = player(w);
  const my = p.unit != null ? w.units[p.unit] : null;
  const units = Object.values(w.units).filter((u) => u.nation === p.nation);
  const [name, setName] = useState('');
  return (
    <div class="grid">
      {my ? <MyUnit w={w} u={my} /> : (
        <Panel title="Military units" class="wide">
          <Help>Units coordinate soldiers: fighting on the ordered side in the assigned battle gives +{B.units.orderBonus * 100}% damage, plus squad specialisation bonuses. Founding costs {B.units.cost} gold; up to {B.units.maxSquads} squads of {B.units.squadSize}.</Help>
          <table class="table"><tbody>{units.map((u) => (
            <tr><td><b>{u.name}</b></td><td>cmdr <CitLink w={w} id={u.commander} /></td><td>{members(u).length} members</td><td>{u.doctrine}</td>
              <td><ActBtn small why={joinCheck(w, p, u)} run={(w) => requestJoin(w, p, u.id)}>Ask to join</ActBtn></td></tr>
          ))}</tbody></table>
          {!units.length && <Empty>No units in your nation.</Empty>}
          <div class="form row"><input placeholder="Unit name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <ActBtn why={foundUnitCheck(w, p)} run={(w) => foundUnit(w, p, name)}>Found unit ({B.units.cost} gold)</ActBtn></div>
        </Panel>
      )}
    </div>
  );
}

function MyUnit({ w, u }: { w: World; u: Unit }) {
  const p = player(w);
  const officer = u.commander === p.id || u.officers.includes(p.id);
  const battles = activeBattles(w).filter((b) => b.kind === 'war' && (b.att === u.nation || b.def === u.nation));
  const [bsel, setB] = useState(u.order?.battle ?? battles[0]?.id ?? -1);
  const recruits = Object.values(w.citizens).filter((c) => c.nation === u.nation && c.unit == null && !c.player).sort((a, b) => (b.persona === 'soldier' ? 1 : 0) - (a.persona === 'soldier' ? 1 : 0) || b.power - a.power).slice(0, 12);
  const [amt, setAmt] = useState(50);
  const [item, setItem] = useState(Object.keys(p.inv).find((k) => k.startsWith('wg') || k.startsWith('food')) ?? 'wg:1');
  const n = w.nations[u.nation];
  return (
    <>
      <Panel title={`🎖️ ${u.name}`} class="wide" right={<ActBtn small kind="danger" run={(w) => leaveUnit(w, p)} confirm="Leave the unit?">Leave</ActBtn>}>
        <p><NationChip w={w} id={u.nation} /> · commander <CitLink w={w} id={u.commander} /> · {members(u).length} members · doctrine <b>{u.doctrine}</b> · funds {Object.entries(u.wallet).map(([k, v]) => `${(v / (k === 'GOLD' ? 1000 : 100)).toFixed(0)} ${k}`).join(', ') || '0'}</p>
        <p>Orders: {u.order ? <>fight for {u.order.side === 'a' ? 'attackers' : 'defenders'} in {w.regions[w.battles[u.order.battle]?.region]?.name}</> : 'none'}</p>
        <p class="small">Supplies: {Object.entries(u.inv).map(([k, v]) => `${v} ${itemName(k)}`).join(', ') || 'none'}</p>
        <div class="form row">
          <label>Donate {n.cur} <Num value={amt} onInput={setAmt} /></label>
          <ActBtn small run={(w) => donate(w, p, u.id, n.cur, null, cur(amt))}>Give money</ActBtn>
          <Select value={item} options={Object.keys(p.inv).filter((k) => /^(wg|wa|food):/.test(k)).map((k) => [k, `${itemName(k)} (${p.inv[k]})`])} onChange={setItem} />
          <ActBtn small run={(w) => donate(w, p, u.id, null, item, Math.min(amt, p.inv[item] ?? 0))}>Give items</ActBtn>
        </div>
      </Panel>
      {officer && (
        <Panel title="Command">
          <div class="form">
            <label>Battle <select value={bsel} onChange={(e) => setB(Number((e.target as HTMLSelectElement).value))}>{battles.map((b) => <option value={b.id}>{w.regions[b.region]?.name} ({w.nations[b.att]?.name} vs {w.nations[b.def]?.name})</option>)}</select></label>
            <ActBtn small why={!battles.length ? 'No battles.' : null} run={(w) => { const b = w.battles[bsel]; return setOrder(w, p, u.id, bsel, b?.att === u.nation ? 'a' : 'd'); }}>Order</ActBtn>
            <ActBtn small kind="ghost" run={(w) => setOrder(w, p, u.id, null, 'a')}>Clear</ActBtn>
          </div>
          <div class="row">Doctrine: {(['conserve', 'steady', 'surge'] as const).map((d) => <ActBtn small kind={u.doctrine === d ? 'primary' : undefined} run={(w) => setDoctrine(w, p, u.id, d)}>{d}</ActBtn>)}</div>
          <ActBtn small run={(w) => distribute(w, p, u.id)}>Distribute supplies</ActBtn>
          <h4>Recruit</h4>
          {recruits.map((c) => <div class="row small"><CitLink w={w} id={c.id} /> {c.persona} · power {c.power.toFixed(0)} <ActBtn small run={(w) => invite(w, p, u.id, c.id)}>Invite</ActBtn></div>)}
        </Panel>
      )}
      <Panel title="Squads">
        {u.squads.map((s, i) => (
          <div class="card">
            <b>Squad {i + 1}</b> · {SQUAD_SPECS[s.spec]} · level {s.level}
            <div class="small">{s.members.map((id) => <span><CitLink w={w} id={id} /> ({rankOf(w.citizens[id]?.dmgTotal ?? 0).name}{u.officers.includes(id) ? ', officer' : ''}) </span>)}</div>
            {officer && <div class="row">
              <span class="small muted">Specialise:</span>
              {Object.keys(SQUAD_SPECS).filter((k) => k !== s.spec).slice(0, 7).map((k) => <ActBtn small kind="ghost" run={(w) => squadUpgrade(w, p, u.id, i, k)}>{k}</ActBtn>)}
              <ActBtn small run={(w) => squadUpgrade(w, p, u.id, i)}>Upgrade ({B.units.upgradeCost * s.level} g)</ActBtn>
            </div>}
            {u.commander === p.id && <div class="row small">{s.members.filter((id) => id !== p.id && !u.officers.includes(id)).map((id) => <ActBtn small kind="ghost" run={(w) => promote(w, p, u.id, id)}>Make {w.citizens[id]?.name.split(' ')[0]} officer</ActBtn>)}</div>}
          </div>
        ))}
      </Panel>
    </>
  );
}
