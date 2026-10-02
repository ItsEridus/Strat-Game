// Heredity (3.0 Life 2.0: generations): what children take from their parents.
// - Looks blend across generations (sim/looks.ts blendLook).
// - Temperament: each of the five traits is about half inherited (twin studies put the
//   heritability of personality at 40–50%), pulled back towards the average (regression to the
//   mean), with a person's own share on top.
// - Talents run in families: a child often has one parent's talent; quirks are sometimes passed on.
// - Values: children grow up with something of their parents' outlook, and mostly keep the
//   family's faith.
import type { Citizen, World } from './types';
import { next } from '../engine/rng';
import { natureOf, type Nature } from './nature';
import { VALUES, mindOf, valuesOf } from './mind';
import { religionOf } from './faith';

type Trait = keyof Citizen['traits'];
const TRAITS: Trait[] = ['ambition', 'risk', 'loyalty', 'greed', 'activity'];
const MEAN: Record<Trait, number> = { ambition: 0.5, risk: 0.5, loyalty: 0.5, greed: 0.5, activity: 0.75 };
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

/** A child coming of age takes after their parents. */
export function inherit(w: World, c: Citizen, parents: Citizen[]) {
  const ps = parents.filter(Boolean);
  if (!ps.length) return;
  for (const k of TRAITS) {
    const mid = ps.reduce((t, p) => t + p.traits[k], 0) / ps.length;
    const lo = k === 'activity' ? 0.4 : 0;
    c.traits[k] = Math.round(clamp(MEAN[k] + 0.45 * (mid - MEAN[k]) + (next(w) - 0.5) * 0.4, lo) * 1000) / 1000;
  }
  const own = natureOf(c);
  const from = ps[Math.floor(next(w) * ps.length)];
  const pn = natureOf(from);
  const talent = next(w) < 0.45 ? pn.talent : own.talent;
  const quirks = [...new Set([...own.quirks, ...ps.flatMap((p) => natureOf(p).quirks.filter(() => next(w) < 0.3))])].slice(0, 2);
  const nature: Nature = { talent, weakness: own.weakness === talent ? pn.weakness : own.weakness, quirks };
  if (nature.weakness === nature.talent) nature.weakness = own.talent === talent ? pn.weakness : own.talent;
  c.nature = nature;
  // Values: something of the parents' outlook.
  const m = mindOf(w, c);
  for (const v of VALUES) { const pv = ps.reduce((t, p) => t + valuesOf(w, p)[v], 0) / ps.length; m.values[v] = Math.round(clamp(m.values[v] * 0.6 + pv * 0.4) * 100) / 100; }
  // Faith: mostly the family's.
  const fr = religionOf(w, from);
  if (next(w) < 0.85) c.religion = fr;
}

/** Whom someone takes after most (by temperament). */
export function takesAfter(w: World, c: Citizen): Citizen | null {
  const ps = (c.family?.parents ?? []).map((id) => w.citizens[id]).filter(Boolean);
  if (!ps.length) return null;
  const dist = (p: Citizen) => TRAITS.reduce((t, k) => t + Math.abs(p.traits[k] - c.traits[k]), 0);
  return ps.sort((a, b) => dist(a) - dist(b))[0];
}
