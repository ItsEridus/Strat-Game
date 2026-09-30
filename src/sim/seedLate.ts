// Seeding for systems added by later build stages, called at the end of world
// generation in a fixed order so generation stays deterministic.
import type { World } from './types';
import { seedUnits } from './units';
import { computeSupply } from './war';
import { seedHoldings } from './holdings';
import { assignSite } from './mining';

export function seedLate(w: World) {
  seedUnits(w);
  seedHoldings(w);
  computeSupply(w);
  assignSite(w, w.citizens[w.playerId]);
}
