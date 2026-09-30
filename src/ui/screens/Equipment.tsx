import { useState } from 'preact/hooks';
import type { Gear, GearSlot, World } from '../../sim/types';
import { ActBtn, Empty, Panel, Help } from '../common';
import { player } from '../../sim/query';
import { FAMILY_NAMES, SLOTS, SLOT_NAMES, applyLoadout, dismantle, equip, isEquipped, merge, mergePreview, ownedGear, saveLoadout, statText, unequip } from '../../sim/gear';
import { gearStats, hitPreview } from '../../sim/combatMath';
import { B } from '../../data/balance';

const RARITY_COLORS = ['#b0b8c4', '#46b873', '#5b8def', '#b36be0', '#e0a526'];

export function Equipment({ w }: { w: World }) {
  const p = player(w);
  const gear = ownedGear(w, p);
  const [sel, setSel] = useState<number[]>([]);
  const [name, setName] = useState('');
  const pv = mergePreview(w, sel);
  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-5));
  const totals = gearStats(w, p);
  const dmgNow = hitPreview(w, p, null, 'a', null).expected;
  return (
    <div class="grid">
      <Panel title="Equipped" class="wide">
        <Help>Six slots. Gear is separate from consumable weapons and timed buffs. Drops: {B.gear.dropAttack * 100}% per attack, {B.gear.dropBuild * 100}% per construction shift, {B.gear.dropMine * 100}% per mining shift (wiki). Five pieces of one rarity merge into the next; the majority family wins.</Help>
        <div class="stats">
          {SLOTS.map((s) => {
            const g = p.gear[s] != null ? w.gear[p.gear[s]!] : null;
            return (
              <div class="stat"><small>{SLOT_NAMES[s]}</small>
                {g ? <><b style={{ color: RARITY_COLORS[g.rarity] }}>{g.name}</b><small>{statText(g)}</small><ActBtn small kind="ghost" run={(w) => unequip(w, p, s as GearSlot)}>Unequip</ActBtn></> : <b class="muted">empty</b>}
              </div>
            );
          })}
        </div>
        <p class="small">Totals: {Object.entries(totals).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join(', ') || 'none'} · expected unarmed hit {Math.round(dmgNow).toLocaleString()}</p>
        <div class="form row">
          <input placeholder="Loadout name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <ActBtn small run={(w) => saveLoadout(w, p, name)}>Save loadout</ActBtn>
          {p.loadouts.map((l) => <ActBtn small kind="ghost" run={(w) => applyLoadout(w, p, l.name)}>{l.name}</ActBtn>)}
        </div>
      </Panel>
      <Panel title={`Owned gear (${gear.length})`} class="wide">
        {gear.length ? (
          <table class="table compact">
            <thead><tr><th /><th>Item</th><th>Family</th><th>Stats</th><th>vs equipped</th><th /></tr></thead>
            <tbody>{gear.map((g) => <GearRow w={w} g={g} checked={sel.includes(g.id)} onToggle={() => toggle(g.id)} />)}</tbody>
          </table>
        ) : <Empty>No gear yet — fight, build and mine for drops, or buy at auctions.</Empty>}
        <div class="row">
          <b>Merge ({sel.length}/5):</b> {pv.error ? <span class="why">{pv.error}</span> : <span>→ {B.gear.rarities[pv.rarity!]} {FAMILY_NAMES[pv.family!]} piece (random slot)</span>}
          <ActBtn small why={pv.error} showWhy={false} run={(w) => { const r = merge(w, p, sel); setSel([]); return r; }}>Merge</ActBtn>
        </div>
      </Panel>
    </div>
  );
}

function GearRow({ w, g, checked, onToggle }: { w: World; g: Gear; checked: boolean; onToggle: () => void }) {
  const p = player(w);
  const eq = p.gear[g.slot] != null ? w.gear[p.gear[g.slot]!] : null;
  const diff = Object.keys({ ...g.stats, ...(eq?.stats ?? {}) }).map((k) => {
    const d = (g.stats[k] ?? 0) - (eq?.stats[k] ?? 0);
    return d ? `${k} ${d > 0 ? '+' : ''}${d.toFixed(1)}` : '';
  }).filter(Boolean).join(', ');
  const equipped = isEquipped(p, g.id);
  return (
    <tr>
      <td><input type="checkbox" checked={checked} onChange={onToggle} disabled={equipped} /></td>
      <td style={{ color: RARITY_COLORS[g.rarity] }}>{g.name}{equipped ? ' ✓' : ''}</td>
      <td>{FAMILY_NAMES[g.family]}</td>
      <td class="small">{statText(g)}</td>
      <td class="small">{equipped ? '—' : diff || 'same'}</td>
      <td>
        {!equipped && <ActBtn small run={(w) => equip(w, p, g.id)}>Equip</ActBtn>}
        <ActBtn small kind="ghost" why={equipped ? 'Unequip first.' : g.rarity === 0 ? 'Common gear can only be recycled.' : null} showWhy={false} run={(w) => dismantle(w, p, g.id, false)}>Dismantle</ActBtn>
        <ActBtn small kind="ghost" why={equipped ? 'Unequip first.' : null} showWhy={false} run={(w) => dismantle(w, p, g.id, true)}>Recycle ({B.gear.dismantleGold[g.rarity]} g)</ActBtn>
      </td>
    </tr>
  );
}
