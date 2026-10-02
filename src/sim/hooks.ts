// Registry of per-tick/hourly/daily rules and scheduled-event handlers
// contributed by each subsystem. Populated by sim/systems.ts at startup in a
// fixed order (the order is part of determinism).
import type { World } from './types';

export const tickHooks: ((w: World) => void)[] = [];
export const hourlyHooks: ((w: World) => void)[] = [];
export const dailyHooks: ((w: World) => void)[] = [];
export const HANDLERS: Record<string, (w: World, p: Record<string, any>) => void> = {};
