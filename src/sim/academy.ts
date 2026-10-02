// Academy studies (DOC catalogue; effects, costs, durations and decay are SOLO
// data). Contributions of energy or items build progress; a study is unlocked
// at 75%. Passive studies work while unlocked; active ones grant a timed buff
// with a cooldown. Decay is gentle by default and can be set to 0.
import { lifeGate } from './lifecycle';
import type { Citizen, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { itemName } from '../data/items';
import { fail, ok, type Result } from '../engine/result';
import { consume } from '../engine/ledger';
import { HOUR } from '../engine/clock';
import { cref } from './query';
import { bump } from './progress';

export interface StudyDef { id: string; name: string; group: 'economic' | 'military' | 'special'; effect: string; active?: { buff: string; value: number; hours: number; cooldownH: number }; item: string; itemQty: number }

export const STUDIES: StudyDef[] = [
  { id: 'npcrise', name: 'NPC Rise', group: 'economic', effect: 'Your companies’ employees produce +10%', item: 'grain', itemQty: 40 },
  { id: 'hustler', name: 'Hustler', group: 'economic', effect: '+10% production on your own shifts', item: 'grain', itemQty: 40 },
  { id: 'lighter', name: 'Lighter Infrastructure', group: 'economic', effect: 'Company upgrades cost 15% less', item: 'iron', itemQty: 40 },
  { id: 'biggerincome', name: 'Bigger Income', group: 'economic', effect: 'Daily mission gold +25%', item: 'food:1', itemQty: 15 },
  { id: 'crafty', name: 'Crafty Worker', group: 'economic', effect: 'Effective economic skill +10%', item: 'food:1', itemQty: 15 },
  { id: 'blacksmith', name: 'Blacksmith', group: 'economic', effect: 'Hammer buff 50% stronger', item: 'iron', itemQty: 40 },
  { id: 'extrashift', name: 'Extra Shift', group: 'economic', effect: 'Double gear drop chance from construction', item: 'iron', itemQty: 30 },
  { id: 'specialtouch', name: 'Special Touch', group: 'economic', effect: 'Manager-shift gold charges −25%', item: 'grain', itemQty: 40 },
  { id: 'doubleshift', name: 'Double Shift', group: 'economic', effect: 'Mining rewards +50%', item: 'oil', itemQty: 20 },
  { id: 'berserk', name: 'Berserk', group: 'military', effect: 'Active: +30% damage for 1h (24h cooldown)', active: { buff: 'berserk', value: 0.3, hours: 1, cooldownH: 24 }, item: 'wg:1', itemQty: 20 },
  { id: 'reinforcements', name: 'Reinforcements', group: 'military', effect: 'Tank and Bomber buffs 50% stronger', item: 'wg:1', itemQty: 20 },
  { id: 'allin', name: 'All In', group: 'military', effect: 'Active: +60% damage for 20 minutes (24h cooldown)', active: { buff: 'allin', value: 0.6, hours: 1 / 3, cooldownH: 24 }, item: 'wg:1', itemQty: 25 },
  { id: 'infantry', name: 'Infantry Specialization', group: 'military', effect: 'Ground weapons +10% damage', item: 'wg:1', itemQty: 25 },
  { id: 'airforce', name: 'Air Force Specialization', group: 'military', effect: 'Air weapons +10% damage', item: 'titanium', itemQty: 20 },
  { id: 'gymrat', name: 'Gym Rat', group: 'military', effect: 'Training power growth +20%', item: 'food:1', itemQty: 20 },
  { id: 'provisions', name: 'Military Provisions', group: 'military', effect: 'Eating allowance cap +3', item: 'food:1', itemQty: 20 },
  { id: 'uplink', name: 'Tactical Uplink', group: 'military', effect: 'Active: +15% damage for your whole squad for 1h (24h cooldown)', active: { buff: 'uplink', value: 0.15, hours: 1, cooldownH: 24 }, item: 'wg:1', itemQty: 20 },
  { id: 'packinglight', name: 'Packing Light', group: 'special', effect: 'Travel costs 25% less energy', item: 'ticket:1', itemQty: 3 },
  { id: 'specialloot', name: 'Special Loot', group: 'special', effect: 'Combat gear drops +50%', item: 'wg:1', itemQty: 20 },
  { id: 'scavenger', name: 'Scavenger', group: 'special', effect: 'Recycling gear gives double gold', item: 'iron', itemQty: 30 },
  { id: 'secretagent', name: 'Secret Agent', group: 'special', effect: 'Unlocks reconnaissance and warhead defusal (espionage)', item: 'ticket:1', itemQty: 5 },
];
export const studyDef = (id: string) => STUDIES.find((s) => s.id === id);
export const ENERGY_PROGRESS = 6; // SOLO: progress per 10 energy
export const ITEM_PROGRESS = 15; // SOLO: progress per item bundle

export const progressOf = (c: Citizen, id: string) => c.studies[id]?.progress ?? 0;
export const unlocked = (c: Citizen, id: string) => progressOf(c, id) >= B.studies.unlockAt;

export function contributeCheck(w: World, c: Citizen, id: string, how: 'energy' | 'item'): string | null {
  const tooYoung = lifeGate(w, c, 16, 'National study programmes');
  if (tooYoung) return tooYoung;
  const d = studyDef(id);
  if (!d) return 'Unknown study.';
  if (progressOf(c, id) >= 100) return 'Study is at 100%.';
  if (how === 'energy' && c.energy < 10) return 'Needs 10 energy.';
  if (how === 'item' && (c.inv[d.item] ?? 0) < d.itemQty) return `Needs ${d.itemQty} ${itemName(d.item)}.`;
  return null;
}

export function contribute(w: World, c: Citizen, id: string, how: 'energy' | 'item'): Result {
  const why = contributeCheck(w, c, id, how);
  if (why) return fail(why);
  const d = studyDef(id)!;
  const st = (c.studies[id] = c.studies[id] ?? { progress: 0 });
  const before = st.progress;
  if (how === 'energy') { c.energy -= 10; st.progress = Math.min(100, st.progress + ENERGY_PROGRESS); }
  else { consume(w, cref(c.id), d.item, d.itemQty, 'academy study'); st.progress = Math.min(100, st.progress + ITEM_PROGRESS); }
  if (c.player) bump(w, 'study');
  const crossed = before < B.studies.unlockAt && st.progress >= B.studies.unlockAt;
  return ok(`${d.name}: ${Math.round(st.progress)}%${crossed ? ' — unlocked!' : ''}.`);
}

export function activateCheck(w: World, c: Citizen, id: string): string | null {
  const d = studyDef(id);
  if (!d?.active) return 'Not an active ability.';
  if (!unlocked(c, id)) return `Reach ${B.studies.unlockAt}% first.`;
  const cd = c.studies[id]?.cooldownUntil ?? 0;
  if (cd > w.time) return `On cooldown for ${Math.ceil((cd - w.time) / 60)}h.`;
  return null;
}

export function activate(w: World, c: Citizen, id: string): Result {
  const why = activateCheck(w, c, id);
  if (why) return fail(why);
  const d = studyDef(id)!;
  const a = d.active!;
  const st = c.studies[id];
  st.activeUntil = w.time + Math.round(a.hours * HOUR);
  st.cooldownUntil = w.time + a.cooldownH * HOUR;
  const targets = [c];
  if (id === 'uplink' && c.unit != null) {
    const u = w.units[c.unit];
    const sq = u?.squads.find((s) => s.members.includes(c.id));
    if (sq) for (const m of sq.members) if (m !== c.id && w.citizens[m]) targets.push(w.citizens[m]);
  }
  for (const t of targets) {
    t.buffs = t.buffs.filter((b) => b.type !== a.buff);
    t.buffs.push({ type: a.buff, until: st.activeUntil, value: a.value, source: d.name });
  }
  return ok(`${d.name} active for ${Math.round(a.hours * 60)} minutes${targets.length > 1 ? ` (${targets.length} squad members)` : ''}.`);
}

/** Hourly decay (SOLO: gentle; 0 disables upkeep). */
export function academyHourly(w: World) {
  const d = B.studies.decayPerHour;
  if (d <= 0) return;
  for (const c of census(w).all) for (const st of Object.values(c.studies)) if (st.progress > 0) st.progress = Math.max(0, st.progress - d);
}

/** AI citizens keep one persona-appropriate study going. */
export function aiStudies(w: World) {
  const pick: Record<string, string> = { soldier: 'infantry', worker: 'hustler', builder: 'blacksmith', industrialist: 'npcrise', merchant: 'crafty', investor: 'lighter', politician: 'gymrat', journalist: 'packinglight' };
  for (const c of census(w).all) {
    if (c.player || c.energy < 60) continue;
    const id = pick[c.persona];
    if (progressOf(c, id) < 90) contribute(w, c, id, 'energy');
  }
}
