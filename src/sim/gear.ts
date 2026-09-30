// Wearable equipment: six slots, five rarities, families with defined stat pools.
// Separate from consumable weapons and from timed buffs. Loot uses the seeded RNG.
import type { Citizen, Gear, GearFamily, GearSlot, Id, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { mint } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { nid, notify } from '../engine/events';
import { chance, pick, rand, weighted } from '../engine/rng';
import { cref, studyActive } from './query';
import { bump } from './progress';

export const SLOTS: GearSlot[] = ['helmet', 'vest', 'elbows', 'gloves', 'pants', 'boots'];
export const SLOT_NAMES: Record<GearSlot, string> = { helmet: 'Helmet', vest: 'Vest', elbows: 'Elbow Pads', gloves: 'Gloves', pants: 'Pants', boots: 'Boots' };
export const FAMILIES: GearFamily[] = ['combat', 'construction', 'mining', 'plains', 'mountains', 'forest', 'desert'];
export const FAMILY_NAMES: Record<GearFamily, string> = { combat: 'Combat', construction: 'Builder’s', mining: 'Miner’s', plains: 'Plainsrunner', mountains: 'Highlander', forest: 'Woodland', desert: 'Dune' };
export const STAT_NAMES: Record<string, string> = {
  dmg: '% damage', acc: ' pt accuracy', crit: ' pt crit chance', critDmg: ' pt crit damage', build: '% construction', mine: '% mining yield', drop: '% drop chance',
  t_plains: '% damage on plains', t_mountains: '% damage in mountains', t_forest: '% damage in forest', t_desert: '% damage in desert',
};
/** Base stat per point of rarity multiplier (SOLO). */
const BASE: Record<string, number> = { dmg: 2, acc: 1, crit: 1, critDmg: 5, build: 3, mine: 4, drop: 0.2, t_plains: 4, t_mountains: 4, t_forest: 4, t_desert: 4 };

/** Stat pools by family and slot: [primary, secondary]. Terrain sets trade accuracy for terrain damage. */
function pool(family: GearFamily, slot: GearSlot): { main: string[]; second: string[]; drawback?: string } {
  if (family === 'combat') {
    const bySlot: Record<GearSlot, string[]> = { helmet: ['acc', 'crit'], vest: ['dmg'], elbows: ['critDmg', 'acc'], gloves: ['dmg', 'crit'], pants: ['dmg'], boots: ['acc', 'crit'] };
    return { main: bySlot[slot], second: ['dmg', 'acc', 'crit', 'critDmg'] };
  }
  if (family === 'construction') return { main: ['build'], second: ['drop', 'build'] };
  if (family === 'mining') return { main: ['mine'], second: ['drop', 'mine'] };
  return { main: [`t_${family}`], second: ['dmg', 'critDmg'], drawback: 'acc' };
}

export function makeGear(w: World, family: GearFamily, rarity: number, slot?: GearSlot): Gear {
  const s = slot ?? pick(w, SLOTS);
  const p = pool(family, s);
  const mult = B.gear.rarityMult[rarity];
  const stats: Record<string, number> = {};
  const main = pick(w, p.main);
  stats[main] = round(BASE[main] * mult * (0.85 + 0.3 * rngFrac(w)));
  if (rarity >= 2) {
    const sec = pick(w, p.second);
    stats[sec] = round((stats[sec] ?? 0) + BASE[sec] * mult * 0.5);
  }
  if (p.drawback) stats[p.drawback] = round((stats[p.drawback] ?? 0) - BASE[p.drawback] * (1 + rarity * 0.5));
  const gear: Gear = { id: nid(w), slot: s, rarity, family, stats, owner: null, name: `${B.gear.rarities[rarity]} ${FAMILY_NAMES[family]} ${SLOT_NAMES[s]}` };
  w.gear[gear.id] = gear;
  return gear;
}
function rngFrac(w: World) { return rand(w, 0, 1); }
const round = (v: number) => Math.round(v * 10) / 10;

export function rollRarity(w: World) {
  return weighted(w, [0, 1, 2, 3, 4], (r) => [60, 25, 10, 4, 1][r])!;
}

/** Seeded loot roll; the gear goes to the citizen. */
export function rollDrop(w: World, c: Citizen, p: number, source: 'combat' | 'construction' | 'mining', terrain?: string) {
  const gs = Object.values(c.gear).map((id) => (id != null ? w.gear[id] : null)).filter(Boolean) as Gear[];
  const bonus = gs.reduce((s, x) => s + (x.stats.drop ?? 0), 0) / 100;
  const loot = source === 'combat' && studyActive(w, c, 'specialloot') ? 1.5 : 1;
  if (!chance(w, p * (1 + bonus) * loot)) return null;
  const family: GearFamily = source === 'construction' ? 'construction' : source === 'mining' ? 'mining' : (terrain && chance(w, 0.3) ? terrain as GearFamily : 'combat');
  const gear = makeGear(w, family, rollRarity(w));
  gear.owner = cref(c.id);
  if (c.player) notify(w, 'progress', `🎁 Found ${gear.name} (${statText(gear)}).`, { link: 'equipment' });
  return gear;
}

export const statText = (gr: Gear) => Object.entries(gr.stats).map(([k, v]) => `${v > 0 ? '+' : ''}${v}${STAT_NAMES[k] ?? ' ' + k}`).join(', ');
export const ownedGear = (w: World, c: Citizen) => Object.values(w.gear).filter((x) => x.owner?.k === 'cit' && x.owner.id === c.id).sort((a, b) => b.rarity - a.rarity || a.id - b.id);
export const isEquipped = (c: Citizen, id: Id) => Object.values(c.gear).includes(id);

export function equip(w: World, c: Citizen, id: Id): Result {
  const gr = w.gear[id];
  if (!gr || gr.owner?.k !== 'cit' || gr.owner.id !== c.id) return fail('You do not own that item.');
  if (Object.values(w.auctions).some((a) => a.status === 'open' && a.gear === id)) return fail('That item is up for auction.');
  c.gear[gr.slot] = id;
  if (c.player) bump(w, 'equip');
  return ok(`Equipped ${gr.name}.`);
}
export function unequip(w: World, c: Citizen, slot: GearSlot): Result {
  if (c.gear[slot] == null) return fail('Nothing equipped there.');
  delete c.gear[slot];
  return ok('Unequipped.');
}

export function saveLoadout(w: World, c: Citizen, name: string): Result {
  const nm = name.trim().slice(0, 24) || `Set ${c.loadouts.length + 1}`;
  c.loadouts = c.loadouts.filter((l) => l.name !== nm);
  c.loadouts.push({ name: nm, gear: { ...c.gear } });
  return ok(`Loadout “${nm}” saved.`);
}
export function applyLoadout(w: World, c: Citizen, name: string): Result {
  const l = c.loadouts.find((x) => x.name === name);
  if (!l) return fail('Loadout not found.');
  const next: Partial<Record<GearSlot, Id>> = {};
  for (const [slot, id] of Object.entries(l.gear)) {
    const gr = id != null ? w.gear[id] : undefined;
    if (gr && gr.owner?.k === 'cit' && gr.owner.id === c.id) next[slot as GearSlot] = id!;
  }
  c.gear = next;
  return ok(`Loadout “${name}” equipped${Object.keys(next).length < Object.keys(l.gear).length ? ' (some items no longer owned)' : ''}.`);
}

/** Merge preview: five pieces of one rarity → one of the next rarity; majority family wins. */
export function mergePreview(w: World, ids: Id[]) {
  const items = ids.map((id) => w.gear[id]).filter(Boolean);
  if (items.length !== 5) return { error: 'Select exactly five items.' };
  const r = items[0].rarity;
  if (items.some((x) => x.rarity !== r)) return { error: 'All five must share a rarity.' };
  if (r >= 4) return { error: 'Legendary items cannot be merged further.' };
  const counts: Record<string, number> = {};
  for (const x of items) counts[x.family] = (counts[x.family] ?? 0) + 1;
  const fam = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] as GearFamily;
  return { error: null, rarity: r + 1, family: fam, odds: counts };
}

export function merge(w: World, c: Citizen, ids: Id[]): Result {
  const items = ids.map((id) => w.gear[id]);
  if (items.some((x) => !x || x.owner?.k !== 'cit' || x.owner.id !== c.id)) return fail('You must own all five items.');
  if (ids.some((id) => isEquipped(c, id))) return fail('Unequip items before merging.');
  const pv = mergePreview(w, ids);
  if (pv.error) return fail(pv.error);
  for (const id of ids) delete w.gear[id];
  const out = makeGear(w, pv.family!, pv.rarity!);
  out.owner = cref(c.id);
  if (c.player) bump(w, 'merge');
  return ok(`Merged into ${out.name} (${statText(out)}).`);
}

export function dismantle(w: World, c: Citizen, id: Id, forGold: boolean): Result {
  const gr = w.gear[id];
  if (!gr || gr.owner?.k !== 'cit' || gr.owner.id !== c.id) return fail('You do not own that item.');
  if (isEquipped(c, id)) return fail('Unequip it first.');
  delete w.gear[id];
  if (forGold || gr.rarity === 0) {
    const amt = g(B.gear.dismantleGold[gr.rarity] * (studyActive(w, c, 'scavenger') ? 2 : 1));
    mint(w, cref(c.id), GOLD, amt, 'Gear recycling');
    return ok(`Recycled ${gr.name} for ${(amt / 1000).toFixed(3)} gold.`);
  }
  for (let i = 0; i < 2; i++) { const x = makeGear(w, gr.family, gr.rarity - 1); x.owner = cref(c.id); }
  return ok(`Dismantled ${gr.name} into two ${B.gear.rarities[gr.rarity - 1]} pieces.`);
}
