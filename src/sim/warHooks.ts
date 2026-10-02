// Dispatch battle outcomes to the system that owns the battle (wars, events).
import type { Battle, World } from './types';

export const battleWonHandlers: Record<string, (w: World, b: Battle, winner: 'a' | 'd') => void> = {};

export function onBattleWon(w: World, b: Battle, winner: 'a' | 'd') {
  battleWonHandlers[b.kind]?.(w, b, winner);
}
