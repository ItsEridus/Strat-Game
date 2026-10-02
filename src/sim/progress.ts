// Player activity counters that drive missions, campaigns and the tutorial.
import type { World } from './types';

export function bump(w: World, metric: string, n = 1) {
  const c = w.player.counters;
  c[metric] = (c[metric] ?? 0) + n;
}

export const counter = (w: World, metric: string) => w.player.counters[metric] ?? 0;
