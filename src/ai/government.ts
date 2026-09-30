// AI ministers carry out their portfolios with the same permission-checked
// actions a player minister would use: construction, public trade, budgets.
import type { BuildingType, Nation, World } from '../sim/types';
import { B } from '../data/balance';
import { RAWS, qualityOf, refValue } from '../data/items';
import { chance } from '../engine/rng';
import { GRADED, activeProjects, delivered, fundProject, needFor, projectNeeds, startProject } from '../sim/construction';
import { buyBest, list, listingsFor, refPrice } from '../sim/market';
import { natref, player } from '../sim/query';

function actorFor(n: Nation, role: 'development' | 'labor'): number | null {
  const id = n.cabinet[role] ?? n.president;
  return id ?? null;
}

/** Choose a project that fits the nation's needs. */
function pickProject(w: World, n: Nation): { region: number; type: BuildingType } | null {
  const own = w.regions.filter((r) => r.owner === n.id && !r.occ && (r.project == null || w.projects[r.project]?.done));
  if (!own.length) return null;
  const frontier = own.filter((r) => r.links.some((l) => w.regions[l].owner !== n.id));
  const atWar = Object.values(w.wars).some((x) => x.status === 'active' && (x.att === n.id || x.def === n.id));
  const scored: { region: number; type: BuildingType; s: number }[] = [];
  for (const r of own) {
    const cos = Object.values(w.companies).filter((c) => c.region === r.id);
    const raw = cos.filter((c) => (RAWS as string[]).includes(c.industry)).length;
    const fac = cos.length - raw;
    if (r.bld.fields < 5) scored.push({ region: r.id, type: 'fields', s: raw * 2 - r.bld.fields * 2 });
    if (r.bld.industrial < 5) scored.push({ region: r.id, type: 'industrial', s: fac * 2 + r.pollution * 10 - r.bld.industrial * 2 });
    if (r.bld.hospital < 5) scored.push({ region: r.id, type: 'hospital', s: (r.id === n.capital ? 4 : 0) + r.pop / 30000 - r.bld.hospital * 2 });
    if (r.bld.base < 5) scored.push({ region: r.id, type: 'base', s: (frontier.includes(r) ? 3 : 0) + (atWar ? 4 : 0) + (r.id === n.capital ? 2 : 0) - r.bld.base * 1.5 });
  }
  scored.sort((a, b) => b.s - a.s || a.region - b.region);
  return scored[0] ?? null;
}

/** The grade of building materials offering the most construction per unit of money on this market. */
function cheapestGrade(w: World, market: number): string {
  let best = `${GRADED}:1`, bestCost = Infinity;
  for (let q = 1; q <= 5; q++) {
    const k = `${GRADED}:${q}`;
    const l = listingsFor(w, market, k)[0];
    const cost = (l?.price ?? refValue(k) * 1.5) / q;
    if (cost < bestCost) { best = k; bestCost = cost; }
  }
  return best;
}

/** Development ministry: keep one priority project going and supply it. */
export function developmentAI(w: World) {
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const actor = actorFor(n, 'development');
    if (actor == null || actor === pl.id) continue;
    const mine = activeProjects(w, n.id);
    if (!mine.length) {
      const cash = n.wallet[n.cur] ?? 0;
      if (cash < 3000 * 100 || !chance(w, 0.25)) continue;
      const pick = pickProject(w, n);
      if (pick) startProject(w, actor, n.id, pick.region, pick.type);
      continue;
    }
    const p = mine[0];
    n.priorities.project = p.id;
    // Buy missing materials on the home market with treasury money (budget-capped), then deliver.
    const budget = Math.floor((n.wallet[n.cur] ?? 0) * 0.08);
    let spent = 0;
    n.procure = {};
    for (const [need, amount] of Object.entries(p.needMats)) {
      // Building materials: buy whichever grade is cheapest per unit of work (a premium unit counts 4).
      const graded = need === GRADED;
      const stock = graded ? Object.entries(n.inv).reduce((t, [k, v]) => t + (needFor(k) === GRADED ? v * qualityOf(k) : 0), 0) : (n.inv[need] ?? 0);
      let missing = amount - delivered(p, need) - stock;
      if (missing <= 0) continue;
      const k = graded ? cheapestGrade(w, n.id) : need;
      const per = graded ? qualityOf(k) : 1;
      const price = Math.max(refPrice(w, n.id, k) ?? 0, refValue(k));
      const afford = Math.floor((budget - spent) / Math.max(1, price));
      if (afford > 0) {
        const r = buyBest(w, actor, natref(n.id), n.id, k, Math.min(Math.ceil(missing / per), afford), Math.round(price * 2.5));
        if (r.ok) { spent += r.data.spent; n.stats.spendToday += r.data.spent; missing -= r.data.bought * per; }
      }
      if (missing > 0) n.procure[k] = Math.ceil(missing / per); // unmet: producers see this as demand
    }
    fundProject(w, actor, p.id);
    void projectNeeds;
  }
}

/** Labour ministry: sell surplus national storage; keep food reserves for public use. */
export function laborAI(w: World) {
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const actor = actorFor(n, 'labor');
    if (actor == null || actor === pl.id) continue;
    const reserved = new Set(activeProjects(w, n.id).flatMap((p) => Object.keys(p.needMats)));
    for (const [k, q] of Object.entries(n.inv)) {
      if (reserved.has(needFor(k)) || !k.includes(':') || k.startsWith('sp:') || q < 50) continue; // raw materials are kept for construction
      const already = listingsFor(w, n.id, k).some((l) => l.seller.k === 'nat' && l.seller.id === n.id);
      if (already) continue;
      const price = Math.round((refPrice(w, n.id, k) ?? refValue(k)) * 1.05);
      list(w, actor, natref(n.id), n.id, k, Math.floor(q / 2), price);
    }
  }
  void B;
}
