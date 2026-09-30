// Parameter editors for proposal types owned by later systems (war, peace, nuclear).
import type { World } from '../../sim/types';

export function ProposalParams(_: { w: World; type: string; params: Record<string, any>; setParams: (p: Record<string, any>) => void }) {
  return null;
}
