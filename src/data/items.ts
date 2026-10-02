// Item catalogue. Raw materials have no grade; finished goods, and the companies
// that make them, come in five grades from Basic to Top-grade (stored as 1..5).
import { B } from './balance';
import type { Industry, ItemKey, Product, RawRes } from '../sim/types';

export const RAWS: RawRes[] = ['grain', 'iron', 'titanium', 'oil', 'timber', 'cotton', 'copper'];
export const PRODUCTS: Product[] = ['food', 'wg', 'wa', 'ticket', 'materials', 'clothing', 'electronics', 'medicine'];
export const INDUSTRIES: Industry[] = [...RAWS, ...PRODUCTS];
export const INPUT_OF: Record<Product, RawRes> = {
  food: 'grain', wg: 'iron', wa: 'titanium', ticket: 'oil', materials: 'timber', clothing: 'cotton', electronics: 'copper', medicine: 'oil',
};

/** Grades of finished goods and of the companies that make them, lowest first. */
export const GRADES = ['Basic', 'Standard', 'Good', 'Premium', 'Top-grade'];
export const grade = (q: number) => GRADES[Math.min(5, Math.max(1, Math.round(q) || 1)) - 1];
/** For running text: "premium food". */
export const gradeLc = (q: number) => grade(q).toLowerCase();
export const stars = (q: number) => '★'.repeat(Math.min(5, Math.max(1, q))) + '☆'.repeat(5 - Math.min(5, Math.max(1, q)));

export const INDUSTRY_INFO: Record<Industry, { name: string; icon: string; raw: boolean }> = {
  grain: { name: 'Grain Farm', icon: '🌾', raw: true },
  iron: { name: 'Iron Mine', icon: '⛏️', raw: true },
  titanium: { name: 'Titanium Quarry', icon: '💠', raw: true },
  oil: { name: 'Oil Rig', icon: '🛢️', raw: true },
  timber: { name: 'Logging Camp', icon: '🌲', raw: true },
  cotton: { name: 'Cotton Farm', icon: '🌿', raw: true },
  copper: { name: 'Copper Mine', icon: '🔶', raw: true },
  food: { name: 'Food Factory', icon: '🍲', raw: false },
  wg: { name: 'Arms Factory', icon: '🔫', raw: false },
  wa: { name: 'Aerospace Works', icon: '✈️', raw: false },
  ticket: { name: 'Transit Company', icon: '🎫', raw: false },
  materials: { name: 'Building Supplies', icon: '🧱', raw: false },
  clothing: { name: 'Clothing Factory', icon: '👕', raw: false },
  electronics: { name: 'Electronics Plant', icon: '📱', raw: false },
  medicine: { name: 'Pharmaceuticals', icon: '💊', raw: false },
};

/** What each kind of good is for (shown on the market and in storage). */
export const GOOD_USE: Record<string, string> = {
  grain: 'Raw material for food factories.', iron: 'Raw material for arms factories; construction.', titanium: 'Raw material for aerospace works; military bases.',
  oil: 'Raw material for transit companies and pharmaceuticals; construction.', timber: 'Raw material for building supplies.',
  cotton: 'Raw material for clothing factories.', copper: 'Raw material for electronics plants.',
  food: 'Eat to restore energy: 10 (basic) to 50 (top-grade).', wg: 'Ground combat: better grades hit harder.', wa: 'Air combat: better grades hit harder.',
  ticket: 'Travel: better grades go farther.', materials: 'Construction: each unit counts as its grade (a premium unit does the work of four basic ones).',
  clothing: 'New clothes lift your spirits for a month (more for better grades).', electronics: 'A new gadget lifts your spirits for three months (more for better grades).',
  medicine: 'Restores health; helps the sick recover (more for better grades).',
};

const RAW_NAME: Record<RawRes, string> = { grain: 'Grain', iron: 'Iron', titanium: 'Titanium', oil: 'Oil', timber: 'Timber', cotton: 'Cotton', copper: 'Copper' };
/** Finished goods by name: the kind in general ("Clothing") and a unit in running text ("premium clothing"). */
export const PRODUCT_NAME: Record<Product, { kind: string; noun: string }> = {
  food: { kind: 'Food', noun: 'food' }, wg: { kind: 'Ground weapons', noun: 'ground weapon' }, wa: { kind: 'Air weapons', noun: 'air weapon' },
  ticket: { kind: 'Tickets', noun: 'ticket' }, materials: { kind: 'Building materials', noun: 'building materials' },
  clothing: { kind: 'Clothing', noun: 'clothing' }, electronics: { kind: 'Electronics', noun: 'electronics' }, medicine: { kind: 'Medicine', noun: 'medicine' },
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
  manual: { name: 'Study Manual', icon: '📘', desc: 'A few evenings of study: improves your weakest skill', price: 5 },
  cutlass: { name: 'Cutlass', icon: '🗡️', desc: '+20% damage against pirate ships for 1h (event)', price: 0.5 },
};

export function itemName(key: ItemKey): string {
  const [kind, q] = key.split(':');
  if (kind === 'sp') return SPECIALS[q]?.name ?? key;
  if (kind in RAW_NAME) return RAW_NAME[kind as RawRes];
  const p = PRODUCT_NAME[kind as Product];
  if (p) return q ? `${grade(Number(q))} ${p.noun}` : `${p.kind} (any grade)`;
  return key;
}

export function itemIcon(key: ItemKey): string {
  const [kind, q] = key.split(':');
  if (kind === 'sp') return SPECIALS[q]?.icon ?? '✨';
  return ({ grain: '🌾', iron: '🪨', titanium: '💠', oil: '🛢️', timber: '🪵', cotton: '🌿', copper: '🔶', food: '🍲', wg: '🔫', wa: '🚀', ticket: '🎫', materials: '🧱', clothing: '👕', electronics: '📱', medicine: '💊' } as Record<string, string>)[kind] ?? '📦';
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
  const base: Record<string, number> = { grain: 0.9, iron: 1, titanium: 1.6, oil: 1.3, timber: 0.8, cotton: 0.9, copper: 1.4 };
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
