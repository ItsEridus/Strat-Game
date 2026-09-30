// Seeded deterministic RNG (mulberry32). The generator state lives in the world
// save, so reloading and replaying produces identical outcomes.
import type { World } from '../sim/types';

export function next(w: { rng: number }): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = (w: World, a = 0, b = 1) => a + next(w) * (b - a);
export const randInt = (w: World, a: number, b: number) => Math.floor(a + next(w) * (b - a + 1));
export const chance = (w: World, p: number) => next(w) < p;
export const pick = <T>(w: World, arr: readonly T[]): T => arr[Math.floor(next(w) * arr.length)];

export function shuffle<T>(w: World, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(w) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function weighted<T>(w: World, items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return items.length ? items[Math.floor(next(w) * items.length)] : undefined;
  let r = next(w) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Deterministic hash → [0,1) for stateless per-entity variation (does not advance the RNG). */
export function hash01(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return ((h >>> 0) % 1000003) / 1000003;
}
