// Extension point for proposal types owned by later systems (war, peace, nuclear).
import type { Citizen, Nation, Proposal, World } from './types';

export interface ExtraProposal {
  info: { name: string; fullTerm: boolean };
  describe(w: World, n: Nation, params: Record<string, any>): { effect: string; cost: number };
  check(w: World, n: Nation, c: Citizen, params: Record<string, any>): string | null;
  support(w: World, n: Nation, d: Citizen, params: Record<string, any>): number;
  enact(w: World, n: Nation, p: Proposal): string;
  aiOptions(w: World, n: Nation, author: Citizen): { params: Record<string, any>; weight: number }[];
}

export const EXTRA_PROPOSALS: Record<string, ExtraProposal> = {};
