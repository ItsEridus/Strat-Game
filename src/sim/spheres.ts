// Spheres of influence and hedging (3.0.4 Diplomacy completed).
// - The great powers (the US, China and Russia, and any country holding a large share of world
//   power) each pull on every other country: through alliances and bases, trade, closeness of
//   relations, the same part of the world, and a weaker country making its peace with them.
// - A country pulled clearly hardest by one power is in its sphere. One pulled almost equally by
//   two is hedging: it keeps on good terms with both and joins neither side's alliance.
// - A power resents a rival's move into its sphere: an alliance, bases, military access, an
//   offensive pact or intelligence sharing between a member and a rival power costs relations
//   with both. Members side with their patron at the UN.
import type { Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { record } from '../engine/events';
import { WORLD_REGION } from '../data/diplomacy';
import { relation } from './congress';
import { tiesOfPair } from './relations';
import { activeTreaties, hasTreaty } from './treaties';

export interface Spheres { t: number; powers: Id[]; of: Record<Id, Id>; hedging: Record<Id, [Id, Id]> }

const BIG = ['USA', 'CHN', 'RUS'];
/** The great powers: the three historic ones, and any country with an eighth of world power. */
export function greatPowers(w: World): Id[] {
  const ids = new Set(w.nations.filter((n) => BIG.includes(n.iso) && !n.exile).map((n) => n.id));
  const last = w.bop?.[w.bop.length - 1];
  for (const s of last?.shares ?? []) if (s.share >= 0.125 && !w.nations[s.id]?.exile) ids.add(s.id);
  return [...ids].sort((a, b) => a - b);
}

/** How hard a power pulls on a country (0..100+). */
export function pull(w: World, power: Nation, n: Nation): number {
  if (power.id === n.id) return 0;
  const rel = n.relations[power.id]?.score ?? 0;
  const ties = tiesOfPair(w, n, power);
  const sameRegion = (WORLD_REGION[n.iso] ?? []).some((r) => (WORLD_REGION[power.iso] ?? []).includes(r));
  return Math.max(0, rel * 0.5 + ties.interdep * 0.35 + (n.alliances.includes(power.id) ? 30 : 0) + (hasTreaty(w, n.id, power.id, 'basing') ? 15 : 0)
    + (sameRegion ? 10 : 0) + (n.alignment?.choice === 'bandwagon' && n.alignment.towards === power.id ? 25 : 0) - (n.alignment?.choice === 'balance' && n.alignment.towards === power.id ? 30 : 0));
}

export function spheresOf(w: World): Spheres {
  return (w.spheres ??= compute(w));
}
function compute(w: World): Spheres {
  const powers = greatPowers(w);
  const s: Spheres = { t: w.time, powers, of: {}, hedging: {} };
  for (const n of w.nations) {
    if (n.exile || powers.includes(n.id)) continue;
    const p = powers.map((id) => ({ id, v: pull(w, w.nations[id], n) })).sort((a, b) => b.v - a.v || a.id - b.id);
    if (!p.length || p[0].v < 20) continue;
    if (p[1] && p[1].v >= 20 && p[0].v - p[1].v < 15) s.hedging[n.id] = [p[0].id, p[1].id];
    else if (p[0].v >= 40) s.of[n.id] = p[0].id;
  }
  return s;
}
/** The power whose sphere a country is in (if any). */
export const patronOf = (w: World, n: Id): Id | undefined => spheresOf(w).of[n];
export const hedging = (w: World, n: Id) => spheresOf(w).hedging[n];

/** Monthly: the map of spheres is redrawn; changes are news; powers resent rivals' moves into their spheres. */
export function spheresDaily(w: World) {
  if (dateAt(w.time).day !== 1) { spheresOf(w); return; }
  const old = w.spheres;
  const now = compute(w);
  w.spheres = now;
  if (old) for (const n of w.nations) {
    if (n.exile) continue;
    const a = old.of[n.id], b = now.of[n.id];
    if (a !== b && b != null) record(w, 'diplomacy', `🧲 ${n.name} has drifted into ${w.nations[b].name}'s sphere of influence${a != null ? `, out of ${w.nations[a].name}'s` : ''}.`, { nation: n.id });
    else if (a != null && b == null && now.hedging[n.id]) record(w, 'diplomacy', `⚖️ ${n.name} is hedging between ${w.nations[now.hedging[n.id][0]].name} and ${w.nations[now.hedging[n.id][1]].name}.`, { nation: n.id });
  }
  // Intrusions: security treaties signed this month between a power's sphere member and a rival power.
  for (const [mid, pid] of Object.entries(now.of)) {
    const m = +mid;
    for (const t of activeTreaties(w, m)) {
      if (t.signed <= w.time - 31 * DAY || !['defence', 'basing', 'access', 'offensive', 'intel'].includes(t.kind)) continue;
      for (const q of t.parties) {
        if (q === m || q === pid || !now.powers.includes(q)) continue;
        relation(w, pid, q, -10, `moved into our sphere (${w.nations[m].name})`);
        relation(w, pid, m, -6, `let ${w.nations[q].name} in`);
        record(w, 'diplomacy', `🧲 ${w.nations[pid].name} warned ${w.nations[q].name} to keep out of its sphere after the ${t.name}.`, { nation: pid, important: true });
      }
    }
  }
}
