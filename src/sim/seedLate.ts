// Seeding for systems added by later build stages (units, newspapers, holdings,
// tournaments, recurring events), called at the end of world generation in a
// fixed order so generation stays deterministic.
import type { World } from './types';

export function seedLate(_w: World) {
  // Later stages add their seeders here.
}
