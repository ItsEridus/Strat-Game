// Damage formula (a consistent, configurable SOLO interpretation — see docs/DESIGN.md):
//   base    = damage.base + Strength × 5            (Strength before the power multiplier, DOC Sept 19)
//   dmg     = base × (1 + power/divisor) × weapon × rank × (1 + gear%) × buffs × terrain × politics × penalties
//   hit %   = damage.hitChance + Accuracy×0.1 + gear + Focus + base accuracy − forest, clamped 0..100 (no cap, DOC)
//   crit %  = critChance + Luck×0.1 + gear + Focus;  crit damage = 200% + Luck×0.2 pt + gear
import type { Battle, Citizen, World } from './types';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { buffValue, seatShare, studyActive } from './query';

export function rankOf(dmg: number) {
  const t = B.ranks.thresholds;
  let i = 0;
  while (i + 1 < t.length && dmg >= t[i + 1]) i++;
  return { index: i, name: B.ranks.names[i], mult: 1 + i * B.ranks.multStep, next: t[i + 1] ?? null, nextName: B.ranks.names[i + 1] ?? null };
}

export function builderRank(pts: number) {
  const s = B.construction.builderRankStep;
  let i = 0;
  while (i + 1 < s.length && pts >= s[i + 1]) i++;
  return { index: i, bonus: i * B.construction.builderRankBonus, next: s[i + 1] ?? null };
}

export function gearStats(w: World, c: Citizen): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.values(c.gear)) {
    const gr = id != null ? w.gear[id] : undefined;
    if (!gr) continue;
    for (const [k, v] of Object.entries(gr.stats)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export type WeaponSel = { kind: 'wg' | 'wa'; q: number } | null;

/** Nation the citizen is fighting for on `side`. */
export const sideNation = (b: Battle, side: 'a' | 'd') => (side === 'a' ? b.att : b.def);

/** Is fighting for `nation` "own or allied flag" for this citizen? */
export function ownOrAllied(w: World, c: Citizen, nation: number) {
  if (nation === c.nation) return true;
  if (nation < 0) return true; // event factions: no flag penalty
  return w.nations[c.nation]?.alliances.includes(nation) ?? false;
}

export function hitPreview(w: World, c: Citizen, b: Battle | null, side: 'a' | 'd', weapon: WeaponSel | number) {
  const parts: string[] = [];
  const gs = gearStats(w, c);
  const wsel: WeaponSel = typeof weapon === 'number' ? (weapon > 0 ? { kind: 'wg', q: weapon } : null) : weapon;
  let base = B.damage.base + c.attrs.str * B.attrs.str;
  parts.push(`Base ${B.damage.base} + Strength ${c.attrs.str}×${B.attrs.str} = ${base}`);
  let mult = 1 + c.power / B.damage.powerDivisor;
  parts.push(`Training power ${c.power.toFixed(1)} → ×${mult.toFixed(2)}`);
  let wm = B.damage.unarmed;
  if (wsel) {
    wm = (wsel.kind === 'wa' ? B.damage.air : B.damage.ground)[wsel.q - 1];
    if (wsel.kind === 'wg' && studyActive(w, c, 'infantry')) wm *= 1.1;
    if (wsel.kind === 'wa' && studyActive(w, c, 'airforce')) wm *= 1.1;
    const tb = buffValue(w, c, wsel.kind === 'wa' ? 'bomber' : 'tank');
    if (tb) wm *= 1 + tb * (studyActive(w, c, 'reinforcements') ? 1.5 : 1);
    parts.push(`${wsel.kind === 'wa' ? 'Air' : 'Ground'} weapon Q${wsel.q} → ×${wm.toFixed(2)}`);
  } else parts.push('Unarmed → ×1');
  if (b?.airOnly && (!wsel || wsel.kind !== 'wa')) { wm = B.damage.unarmed; parts.push('Non-border (air-only) battle: ground weapons count as unarmed'); }
  mult *= wm;
  const rk = rankOf(c.dmgTotal);
  mult *= rk.mult;
  parts.push(`Rank ${rk.name} → ×${rk.mult.toFixed(1)}`);
  let pct = (gs.dmg ?? 0) / 100;
  if (b) pct += (gs[`t_${w.regions[b.region]?.terrain}`] ?? 0) / 100;
  const ster = buffValue(w, c, 'steroids');
  if (ster) pct += ster;
  if (pct) parts.push(`Gear & buffs → +${Math.round(pct * 100)}%`);
  mult *= 1 + pct;
  let hit = B.damage.hitChance + c.attrs.acc * B.attrs.acc + (gs.acc ?? 0);
  let crit = B.damage.critChance + c.attrs.luck * B.attrs.luckCrit + (gs.crit ?? 0);
  const critDmg = B.damage.critDamage + c.attrs.luck * B.attrs.luckCritDmg + (gs.critDmg ?? 0);
  if (buffValue(w, c, 'focus')) { hit += 5; crit += 10; parts.push('Focus: +5 accuracy, +10 pt crit'); }
  let energy = B.cost.hit;
  if (b) {
    const r = w.regions[b.region];
    const nat = sideNation(b, side);
    if (r.terrain === 'plains' && side === 'a') { mult *= 1 + B.damage.terrain.plainsAtk; parts.push('Plains: attacker +20%'); }
    if (r.terrain === 'mountains' && side === 'd') { mult *= 1 + B.damage.terrain.mountainsDef; parts.push('Mountains: defender +20%'); }
    if (r.terrain === 'forest') { hit -= B.damage.terrain.forestAcc; parts.push('Forest: −10 accuracy (both sides)'); }
    if (r.terrain === 'desert') { energy *= B.damage.terrain.desertEnergyMult; parts.push('Desert: hits cost double energy'); }
    if (side === 'd' && r.bld.base) { mult *= 1 + r.bld.base * B.buildings.baseDefense; hit += r.bld.base * B.buildings.baseAccuracy; parts.push(`Military base L${r.bld.base}: defender +${Math.round(r.bld.base * B.buildings.baseDefense * 100)}%, +${r.bld.base} accuracy`); }
    if (side === 'd' && buffValue(w, c, 'bunker')) { mult *= 1 + buffValue(w, c, 'bunker'); parts.push('Bunker buff'); }
    if (b.kind === 'event' && buffValue(w, c, 'cutlass')) { mult *= 1 + buffValue(w, c, 'cutlass'); parts.push('Cutlass: +20% vs ships'); }
    if (nat >= 0 && w.nations[nat]) {
      const sh = seatShare(w, w.nations[nat]);
      let ideo = 0;
      if (side === 'd') {
        if (r.core === nat) ideo += (sh.nationalism ?? 0) * IDEOLOGIES.nationalism.fx.coreDefense;
        ideo += (sh.imperialism ?? 0) * IDEOLOGIES.imperialism.fx.homeDefense;
      } else if (r.core !== nat) {
        ideo += (sh.imperialism ?? 0) * IDEOLOGIES.imperialism.fx.abroadDamage + (sh.nationalism ?? 0) * IDEOLOGIES.nationalism.fx.abroadDamage;
      }
      ideo += (sh.centralism ?? 0) * IDEOLOGIES.centralism.fx.citizenDamage;
      if (Math.abs(ideo) > 0.001) { mult *= 1 + ideo; parts.push(`National ideology → ${ideo > 0 ? '+' : ''}${Math.round(ideo * 100)}%`); }
      if (b.kind === 'war' && side === 'd' && !r.supplied) { mult *= 1 - B.damage.supplyPenalty; parts.push('Supply route to capital cut: −10%'); }
    }
    if (b.kind === 'war' && !ownOrAllied(w, c, nat)) { mult *= 1 - B.damage.foreignPenalty; parts.push('Foreign flag (not own/allied): −30%'); }
    // Military unit order bonus
    const u = c.unit != null ? w.units[c.unit] : null;
    if (u && u.order && u.order.battle === b.id && u.order.side === side) {
      const sq = u.squads.find((s) => s.members.includes(c.id));
      let bonus = B.units.orderBonus;
      if (sq && sq.spec !== 'general') {
        if (sq.spec === r.terrain) bonus += B.units.specBonus * sq.level;
        if (sq.spec === 'ground' && wsel?.kind === 'wg') bonus += B.units.specBonus * sq.level;
        if (sq.spec === 'air' && wsel?.kind === 'wa') bonus += B.units.specBonus * sq.level;
      }
      mult *= 1 + bonus;
      parts.push(`Unit order (${u.name}) → +${Math.round(bonus * 100)}%`);
    }
  }
  hit = Math.max(0, Math.min(100, hit));
  crit = Math.max(0, Math.min(100, crit));
  const dmg = base * mult;
  const expected = (hit / 100) * dmg * (1 + (crit / 100) * (critDmg / 100 - 1));
  return { dmg, hit, crit, critDmg, expected, parts, energy };
}
