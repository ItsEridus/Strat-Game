// Item catalogue. Raw materials have no quality; finished goods carry Q1..Q5.
import { B } from './balance';
import type { Industry, ItemKey, Product, RawRes } from '../sim/types';

export const RAWS: RawRes[] = ['grain', 'iron', 'titanium', 'oil'];
export const PRODUCTS: Product[] = ['food', 'wg', 'wa', 'ticket'];
export const INDUSTRIES: Industry[] = [...RAWS, ...PRODUCTS];
export const INPUT_OF: Record<Product, RawRes> = { food: 'grain', wg: 'iron', wa: 'titanium', ticket: 'oil' };

export const INDUSTRY_INFO: Record<Industry, { name: string; icon: string; raw: boolean }> = {
  grain: { name: 'Grain Farm', icon: '🌾', raw: true },
  iron: { name: 'Iron Mine', icon: '⛏️', raw: true },
  titanium: { name: 'Titanium Quarry', icon: '💠', raw: true },
  oil: { name: 'Oil Rig', icon: '🛢️', raw: true },
  food: { name: 'Food Factory', icon: '🍲', raw: false },
  wg: { name: 'Arms Factory', icon: '🔫', raw: false },
  wa: { name: 'Aerospace Works', icon: '✈️', raw: false },
  ticket: { name: 'Transit Company', icon: '🎫', raw: false },
};

export const SPECIALS: Record<string, { name: string; icon: string; desc: string; price: number }> = {
  adrenaline: { name: 'Adrenaline', icon: '💉', desc: '+5 eating allowance (stacks up to the cap)', price: 0.6 },
  medic: { name: 'Medic Bag', icon: '🩹', desc: 'Restore 50 energy immediately (may exceed max by up to 50)', price: 0.8 },
  tank: { name: 'Tank', icon: '🛡️', desc: '+30% ground-weapon damage for 1h (does not stack; refreshes)', price: 1.5 },
  bomber: { name: 'Bomber', icon: '🛩️', desc: '+30% air-weapon damage for 1h (refreshes)', price: 1.5 },
  bunker: { name: 'Bunker', icon: '🏚️', desc: '+20% damage when defending for 1h (refreshes)', price: 1.2 },
  steroids: { name: 'Steroids', icon: '💪', desc: '+15% damage for 3h (refreshes)', price: 1 },
  focus: { name: 'Focus', icon: '🎯', desc: '+5 accuracy and +10 pt crit chance for 24h (DOC; refreshes)', price: 1.2 },
  hammer: { name: 'Hammer', icon: '🔨', desc: '+50% construction points for 3h (refreshes)', price: 0.8 },
  permit: { name: 'Relocation Permit', icon: '📜', desc: 'Waives the fee and cooldown for one company move', price: 3 },
  coffee: { name: 'Coffee', icon: '☕', desc: 'Catch-up: economic skill +25% of gap to national top (capped, never lowers)', price: 2 },
  protein: { name: 'Protein Bar', icon: '🍫', desc: 'Catch-up: training power +25% of gap to national top (capped, never lowers)', price: 2 },
  manual: { name: 'Retraining Manual', icon: '📘', desc: 'Refund all attribute points for reallocation', price: 5 },
  cutlass: { name: 'Cutlass', icon: '🗡️', desc: '+20% damage against pirate ships for 1h (event)', price: 0.5 },
};

export function itemName(key: ItemKey): string {
  const [kind, q] = key.split(':');
  if (kind === 'sp') return SPECIALS[q]?.name ?? key;
  switch (kind) {
    case 'grain': return 'Grain';
    case 'iron': return 'Iron';
    case 'titanium': return 'Titanium';
    case 'oil': return 'Oil';
    case 'food': return `Food Q${q}`;
    case 'wg': return `Ground Weapon Q${q}`;
    case 'wa': return `Air Weapon Q${q}`;
    case 'ticket': return `Ticket Q${q}`;
  }
  return key;
}

export function itemIcon(key: ItemKey): string {
  const [kind, q] = key.split(':');
  if (kind === 'sp') return SPECIALS[q]?.icon ?? '✨';
  return ({ grain: '🌾', iron: '🪨', titanium: '💠', oil: '🛢️', food: '🍲', wg: '🔫', wa: '🚀', ticket: '🎫' } as Record<string, string>)[kind] ?? '📦';
}

export const kindOf = (key: ItemKey) => key.split(':')[0];
export const qualityOf = (key: ItemKey) => Number(key.split(':')[1] || 0);
export const isRaw = (key: ItemKey) => (RAWS as string[]).includes(key);

export function weightOf(key: ItemKey): number {
  const kind = kindOf(key);
  const w = B.storage.weights as Record<string, number>;
  if (isRaw(key)) return w.raw;
  if (kind === 'sp') return w.special;
  return w[kind] ?? 1;
}

export function outputKey(industry: Industry, q: number): ItemKey {
  return (RAWS as string[]).includes(industry) ? industry : `${industry}:${q}`;
}

/** All tradeable goods keys (raw + finished goods by quality). */
export const MARKET_KEYS: ItemKey[] = [
  ...RAWS,
  ...PRODUCTS.flatMap((p) => [1, 2, 3, 4, 5].map((q) => `${p}:${q}`)),
];

/** Rough reference cost used by AI valuations before market history exists (currency minor units). */
export function refValue(key: ItemKey, curPerGold = 100): number {
  const kind = kindOf(key);
  const q = qualityOf(key);
  const base: Record<string, number> = { grain: 0.9, iron: 1, titanium: 1.6, oil: 1.3 };
  if (base[kind] !== undefined) return Math.round(base[kind] * 100);
  const rec = (B.company.recipes as any)[kind];
  if (rec) {
    const input = base[rec.input] * rec.perQ * q;
    const labour = B.wages.start / rec.perShift;
    return Math.round((input + labour) * 1.2 * 100);
  }
  if (kind === 'sp') return Math.round((SPECIALS[q]?.price ?? 1) * curPerGold * 100);
  return 100;
}
