// A seam between housing and loans (each needs the other): loans fills it in.
import type { Citizen, World } from './types';
export const MORTGAGE: { loanCheck?: (w: World, c: Citizen, amount: number) => string | null; borrow?: (w: World, c: Citizen, amount: number, note: string) => boolean } = {};
