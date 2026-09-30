// Seeding for systems added by later build stages, called at the end of world
// generation in a fixed order so generation stays deterministic.
import type { World } from './types';
import { seedUnits } from './units';
import { computeSupply } from './war';

export function seedLate(w: World) {
  seedUnits(w);
  computeSupply(w);
}
