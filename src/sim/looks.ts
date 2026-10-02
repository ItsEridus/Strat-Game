// How people look. Every citizen has a stable appearance generated from a hash
// (so nobody needs saving until they change it): presentation follows the
// first name, skin tones follow each country's population, children blend
// their parents, and everyone ages (grey hair, lines, sometimes a bald head).
// The player can design and change theirs (character creation, 1.4.x).
import type { Citizen, World } from './types';
import { NAME_POOLS } from '../data/names';
import { EXTRA_NAMES } from '../data/names-extra';
import { hash01 } from '../engine/rng';
import { ageOf } from './growth';

export interface Look {
  sex: 'f' | 'm'; // presentation, for the portrait and pronouns
  pronouns?: 'she' | 'he' | 'they';
  skin: number; // 0 (lightest) .. 7 (darkest)
  face: number; // 0 oval, 1 round, 2 long
  hair: number; // style 0..9 (see HAIR_STYLES)
  hairColor: number; // 0..7 (HAIR_COLORS)
  eyes: number; // colour 0..4
  brows: number; // 0..2
  nose: number; // 0..2
  beard: number; // 0 none, 1 stubble, 2 moustache, 3 full beard
  glasses: boolean;
  freckles: boolean;
  mark?: 'scar' | 'tattoo' | 'piercing' | null;
  clothes?: number; // shirt colour 0..7 (changes with what one buys)
  tweak?: number; // 0..99: fine variation (eye spacing, face width, hair shade) so nobody looks quite alike
}

export const SKIN_TONES = ['#f6d7c3', '#efc3a4', '#e0ac85', '#c99168', '#ad7350', '#8d5638', '#6b3e26', '#4a2a18'];
export const HAIR_COLORS = ['#1b1612', '#3b2a1f', '#6b4a2b', '#9c6b3a', '#d4ad63', '#b5452f', '#8a8a8a', '#e6e2da'];
export const EYE_COLORS = ['#3b2414', '#6a4a2a', '#3d6b8c', '#4d7a45', '#6a7a86'];
export const SHIRTS = ['#35506b', '#5a3d2b', '#3d5a3a', '#5a5a5a', '#6b3550', '#2f4f6f', '#7a5a1f', '#2b2b38'];
export const HAIR_STYLES = ['Short', 'Side part', 'Buzz cut', 'Long', 'Bob', 'Curly', 'Ponytail', 'Bun', 'Afro', 'Shaved'];
export const FACE_SHAPES = ['Oval', 'Round', 'Long'];

/** Skin-tone weights by country (light → dark), roughly following each population. */
const SKIN_BY_ISO: Record<string, number[]> = {
  USA: [3, 4, 3, 2, 2, 2, 2, 1], CAN: [4, 5, 3, 2, 2, 1, 1, 0.5], MEX: [1, 2, 4, 5, 4, 2, 0.5, 0], BRA: [2, 3, 3, 3, 3, 3, 2, 1],
  ARG: [4, 5, 4, 2, 1, 0.5, 0, 0], GBR: [5, 5, 2, 1, 1, 1, 1, 0.5], DEU: [6, 5, 2, 1, 1, 0.5, 0.5, 0], RUS: [6, 5, 2, 1, 0.5, 0, 0, 0],
  TUR: [2, 4, 5, 3, 1, 0, 0, 0], SAU: [0.5, 2, 4, 5, 3, 1, 0.5, 0], ZAF: [1, 1, 1, 1, 2, 3, 5, 5], IND: [0, 1, 2, 4, 5, 4, 2, 0.5],
  CHN: [3, 5, 4, 2, 0.5, 0, 0, 0], JPN: [4, 5, 3, 1, 0, 0, 0, 0], KOR: [4, 5, 3, 1, 0, 0, 0, 0], AUS: [4, 5, 3, 2, 1, 1, 1, 0.5],
};
const DARK_HAIR_ISO = new Set(['MEX', 'BRA', 'TUR', 'SAU', 'ZAF', 'IND', 'CHN', 'JPN', 'KOR']);

const weighted = (ws: number[], r: number) => { const t = ws.reduce((a, b) => a + b, 0); let x = r * t; for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return i; } return ws.length - 1; };

/** Presentation from the first name (the name lists alternate), else a stable coin. */
let anyPool: Map<string, 'f' | 'm'> | null = null;
export function sexOf(w: World, c: Citizen): 'f' | 'm' {
  if (c.look?.sex) return c.look.sex; // a designed look says so
  const first = c.name.split(' ')[0];
  const code = w.nations[c.nation]?.cur;
  for (const list of [NAME_POOLS[code]?.first, EXTRA_NAMES[code]?.first]) {
    const i = list?.indexOf(first) ?? -1;
    if (i >= 0) return i % 2 === 0 ? 'm' : 'f';
  }
  // A name from another country (people who moved, or arrived from abroad).
  if (!anyPool) { anyPool = new Map(); for (const pools of [NAME_POOLS, EXTRA_NAMES]) for (const pool of Object.values(pools)) pool?.first?.forEach((n: string, i: number) => { if (!anyPool!.has(n)) anyPool!.set(n, i % 2 === 0 ? 'm' : 'f'); }); }
  return anyPool.get(first) ?? (hash01(c.id, 1401, 1) < 0.5 ? 'f' : 'm');
}

/** The look someone was born with (stable), unless they have designed or changed it. */
export function lookOf(w: World, c: Citizen): Look {
  if (c.look) return c.look;
  const r = (k: number) => hash01(c.id, 1401, k);
  const iso = w.nations[c.nation]?.iso ?? 'USA';
  const sex = sexOf(w, c);
  const skin = weighted(SKIN_BY_ISO[iso] ?? SKIN_BY_ISO.USA, r(2));
  const darkHair = DARK_HAIR_ISO.has(iso) || skin >= 4;
  const hairColor = darkHair ? (r(3) < 0.7 ? 0 : 1) : weighted([2, 3, 3, 2, 2, 0.6, 0, 0], r(3));
  const styles = sex === 'f' ? [1, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 5, 8, 9];
  return {
    sex, skin, face: Math.floor(r(4) * 3), hair: styles[Math.floor(r(5) * styles.length)], hairColor,
    eyes: darkHair ? (r(6) < 0.85 ? 0 : 1) : weighted([2, 2, 3, 2, 1], r(6)), brows: Math.floor(r(7) * 3), nose: Math.floor(r(8) * 3),
    beard: sex === 'm' && r(9) < 0.4 ? 1 + Math.floor(r(10) * 3) : 0, glasses: r(11) < 0.22, freckles: skin <= 2 && r(12) < 0.15,
    mark: r(13) < 0.06 ? (['scar', 'tattoo', 'piercing'] as const)[Math.floor(r(14) * 3)] : null, clothes: Math.floor(r(15) * SHIRTS.length), tweak: Math.floor(r(16) * 100),
  };
}

/** A child's look, blended from both parents (with a little of their own). */
export function blendLook(w: World, child: Citizen, a: Citizen, b?: Citizen): Look {
  const la = lookOf(w, a), lb = b ? lookOf(w, b) : la;
  const own = lookOf(w, { ...child, look: undefined } as Citizen);
  const pick = <T,>(k: number, x: T, y: T) => (hash01(child.id, 1402, k) < 0.5 ? x : y);
  return {
    ...own,
    skin: Math.round((la.skin + lb.skin) / 2 + (hash01(child.id, 1402, 1) - 0.5)),
    hairColor: pick(2, la.hairColor, lb.hairColor) % 6, eyes: pick(3, la.eyes, lb.eyes), face: pick(4, la.face, lb.face), nose: pick(5, la.nose, lb.nose),
    glasses: own.glasses || (la.glasses && lb.glasses),
  };
}

/** How age shows: grey hair from about 45, lines from 40, thinning for some men after 40. */
export function ageing(w: World, c: Citizen) {
  const age = ageOf(w, c);
  const grey = Math.max(0, Math.min(1, (age - 45) / 25 + (hash01(c.id, 1403, 1) - 0.5) * 0.3));
  const lines = Math.max(0, Math.min(3, Math.floor((age - 38) / 12)));
  const bald = lookOf(w, c).sex === 'm' && age > 40 && hash01(c.id, 1403, 2) < (age - 40) / 60;
  return { age, grey, lines, bald, child: age < 13 };
}
