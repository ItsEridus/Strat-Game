// Special consumable items with explicit targets, durations and stacking rules.
import type { Citizen, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { SPECIALS } from '../data/items';
import { fail, ok, type Result } from '../engine/result';
import { burn, consume, produce } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { HOUR } from '../engine/clock';
import { allowanceCap, respec } from './citizen';
import { citizensOf, cref, maxEnergy } from './query';

const BUFFS: Record<string, { value: number; hours: number }> = {
  tank: { value: 0.3, hours: 1 }, bomber: { value: 0.3, hours: 1 }, bunker: { value: 0.2, hours: 1 },
  steroids: { value: 0.15, hours: 3 }, focus: { value: 1, hours: 24 }, hammer: { value: 0.5, hours: 3 }, cutlass: { value: 0.2, hours: 1 },
};

export function specialCheck(w: World, c: Citizen, id: string): string | null {
  if (!SPECIALS[id]) return 'Unknown item.';
  if ((c.inv[`sp:${id}`] ?? 0) < 1) return 'You have none.';
  if (id === 'adrenaline' && c.allowance >= allowanceCap(w, c)) return 'Eating allowance already full.';
  if (id === 'medic' && c.energy >= maxEnergy(w, c) + 50) return 'Energy already at the medic-bag limit.';
  if (id === 'permit') return 'Used automatically when relocating a company.';
  if (id === 'manual' && Object.values(c.attrs).every((v) => v === 0)) return 'No attribute points allocated.';
  return null;
}

/** Use a special item. Buffs of the same type refresh rather than stack. */
export function useSpecial(w: World, c: Citizen, id: string): Result {
  const why = specialCheck(w, c, id);
  if (why) return fail(why);
  if (id === 'manual') return respec(w, c);
  consume(w, cref(c.id), `sp:${id}`, 1, 'special used');
  if (id === 'adrenaline') { c.allowance = Math.min(allowanceCap(w, c), c.allowance + 5); return ok('Adrenaline: +5 eating allowance.'); }
  if (id === 'medic') { const before = c.energy; c.energy = Math.min(maxEnergy(w, c) + 50, c.energy + 50); return ok(`Medic bag: +${Math.round(c.energy - before)} energy.`); }
  if (id === 'coffee' || id === 'protein') {
    // Catch-up: close 25% of the gap to the best in your nation; never lowers.
    const top = Math.max(...citizensOf(w, c.nation).map((x) => (id === 'coffee' ? x.eco : x.power)));
    const cur = id === 'coffee' ? c.eco : c.power;
    const gain = Math.max(0, (top - cur) * 0.25);
    if (id === 'coffee') c.eco = +(c.eco + gain).toFixed(3); else c.power = +(c.power + gain).toFixed(3);
    return ok(`${SPECIALS[id].name}: +${gain.toFixed(2)} ${id === 'coffee' ? 'economic skill' : 'training power'}.`);
  }
  const b = BUFFS[id];
  if (b) {
    c.buffs = c.buffs.filter((x) => x.type !== id && x.until > w.time);
    c.buffs.push({ type: id, until: w.time + b.hours * HOUR, value: b.value, source: SPECIALS[id].name });
    return ok(`${SPECIALS[id].name} active for ${b.hours}h.`);
  }
  return ok('Used.');
}

/** Gold-priced shop ("bazaar"); pirate depots give a discount to their holders' citizens. */
export function shopPrice(w: World, c: Citizen, id: string) {
  let price = g(SPECIALS[id].price);
  let depot = 0;
  for (const e of Object.values(w.events)) if (e.status === 'active') for (const s of e.ships) if (s.holder === c.nation) depot += s.depot;
  price = Math.round(price * (1 - Math.min(0.5, depot * B.pirates.depotDiscount)));
  return price;
}

export function buySpecial(w: World, c: Citizen, id: string, n: number): Result {
  if (!SPECIALS[id]) return fail('Unknown item.');
  if (id === 'cutlass' && !Object.values(w.events).some((e) => e.status === 'active')) return fail('Cutlasses are only sold during a pirate invasion.');
  if (!Number.isInteger(n) || n < 1) return fail('Invalid quantity.');
  const cost = shopPrice(w, c, id) * n;
  if ((c.wallet[GOLD] ?? 0) < cost) return fail(`Costs ${(cost / 1000).toFixed(2)} gold.`);
  if (!produce(w, cref(c.id), `sp:${id}`, n, 'shop purchase')) return fail('Not enough storage.');
  burn(w, cref(c.id), GOLD, cost, 'Shop purchase');
  return ok(`Bought ${n}× ${SPECIALS[id].name}.`);
}

export function expireBuffs(w: World) {
  for (const c of census(w).all) if (c.buffs.length) c.buffs = c.buffs.filter((b) => b.until > w.time);
}

/** AI shoppers: soldiers at war buy combat consumables, builders hammers (a gold sink). */
export function aiShop(w: World) {
  for (const c of census(w).all) {
    if (c.player || (c.wallet[GOLD] ?? 0) < g(4)) continue;
    const atWar = Object.values(w.wars).some((x) => x.status === 'active' && (x.att === c.nation || x.def === c.nation));
    if (c.persona === 'soldier' && atWar && (c.inv['sp:steroids'] ?? 0) < 1) buySpecial(w, c, 'steroids', 1);
    else if (c.persona === 'builder' && (c.inv['sp:hammer'] ?? 0) < 1) buySpecial(w, c, 'hammer', 1);
    else if (c.persona === 'investor' && (c.wallet[GOLD] ?? 0) > g(30) && (c.inv['sp:coffee'] ?? 0) < 1) buySpecial(w, c, 'coffee', 1);
  }
  // Use what they bought: builders hammer before labour, soldiers steroids during battles.
  for (const c of census(w).all) {
    if (c.player) continue;
    if (c.persona === 'builder' && (c.inv['sp:hammer'] ?? 0) > 0 && !c.buffs.some((b) => b.type === 'hammer')) useSpecial(w, c, 'hammer');
    if (c.persona === 'investor' && (c.inv['sp:coffee'] ?? 0) > 0) useSpecial(w, c, 'coffee');
  }
}
