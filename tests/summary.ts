import type { World } from '../src/sim/types';

export function summarize(w: World): string {
  const cits = Object.values(w.citizens);
  const employed = cits.filter((c) => c.job != null).length;
  const cos = Object.values(w.companies);
  const producing = cos.filter((c) => (c.hist[c.hist.length - 1]?.produced ?? 0) > 0).length;
  const unmet = w.households.reduce((s, h) => s + h.unmet, 0);
  const hh = w.households.reduce((s, h) => s + (h.wallet[w.nations[h.nation].cur] ?? 0), 0);
  const treas = w.nations.reduce((s, n) => s + (n.wallet[n.cur] ?? 0), 0);
  const citCash = cits.reduce((s, c) => s + (c.wallet[w.nations[c.nation].cur] ?? 0), 0);
  const coCash = cos.reduce((s, c) => s + Object.entries(c.wallet).filter(([k]) => k !== 'GOLD').reduce((a, [, v]) => a + v, 0), 0);
  const gold = w.stats.supply.GOLD ?? 0;
  return `emp ${employed}/${cits.length} cos ${producing}/${cos.length} unmet ${Math.round(unmet / 100)} | cash: cit ${Math.round(citCash / 100)} co ${Math.round(coCash / 100)} hh ${Math.round(hh / 100)} treas ${Math.round(treas / 100)} | gold ${Math.round(gold / 1000)} wars ${Object.values(w.wars).filter((x) => x.status === 'active').length} battles ${Object.values(w.battles).filter((b) => !b.done).length}`;
}
