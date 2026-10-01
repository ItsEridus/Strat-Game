// Relations 2.0 (2.0 GEO 4). How one country sees another is built from:
// - trust: what each has done to the other, remembered and slowly fading;
// - affinity: similar governments, a shared language, shared blocs;
// - threat: the other's military power, how close it is, and how hostile its intentions;
// - interdependence: trade and investment ties;
// - grievances: territorial disputes and historical wrongs (new conquests add to them);
// - prestige: a country's standing in the world (its power, wealth and record).
// The relation score that the rest of the game reads moves towards a blend of these.
// The head of government's character colours the picture: hawks see more threat and
// trust less, doves the reverse.
import type { Id, Nation, World } from './types';
import { BLOCS, LANGUAGE, grievanceOf, startTrust, tiesOf, type Bloc } from '../data/diplomacy';
import { IDEOLOGIES } from '../data/ideologies';
import { controller, seatShare } from './query';
import { nationScores } from './forces';
import { activeWars, enemyOf } from './war';
import { activeTreaties, hasTreaty, securityPartners } from './treaties';

export interface Ties { trust: number; affinity: number; threat: number; interdep: number; grievance: number }
export const blocsOf = (n: Nation): Bloc[] => BLOCS.filter((b) => b.members.includes(n.iso));
export const sharedBlocs = (a: Nation, b: Nation) => BLOCS.filter((x) => x.members.includes(a.iso) && x.members.includes(b.iso));

/** The head of government's outlook, from the citizen in office (or a moderate default). */
export interface LeaderProfile { hawk: number; risk: number; ideologue: number; nationalism: number }
export function leaderProfile(w: World, n: Nation): LeaderProfile {
  const c = n.president != null ? w.citizens[n.president] : null;
  const share = seatShare(w, n);
  const imperial = share.imperialism ?? 0;
  if (!c) return { hawk: 0.4 + imperial * 0.4, risk: 0.4, ideologue: 0.4, nationalism: 0.4 + imperial * 0.3 };
  const party = c.party != null ? w.parties[c.party] : null;
  const ideoHawk = party?.ideo === 'imperialism' ? 0.35 : party?.ideo === 'capitalism' ? -0.05 : party?.ideo === 'socialism' ? -0.1 : 0;
  return {
    hawk: Math.max(0, Math.min(1, 0.3 + c.traits.risk * 0.3 + (1 - c.traits.loyalty) * 0.1 + ideoHawk + imperial * 0.2)),
    risk: c.traits.risk,
    ideologue: Math.max(0, Math.min(1, 0.3 + (party ? 0.3 : 0) + c.traits.greed * -0.1 + c.traits.loyalty * 0.2)),
    nationalism: Math.max(0, Math.min(1, 0.3 + imperial * 0.5 + ideoHawk)),
  };
}

export function tiesOfPair(w: World, a: Nation, b: Nation): Ties {
  const m = (a.ties ??= {});
  if (!m[b.id]) m[b.id] = { trust: startTrust(a.iso, b.iso), affinity: 0, threat: 0, interdep: tiesOf(a.iso, b.iso), grievance: grievanceOf(a.iso, b.iso) };
  return m[b.id];
}

/** Military weight (0..1 of the strongest) for threat assessments. */
function militaryWeights(w: World): Map<Id, number> {
  const s = nationScores(w);
  const top = Math.max(1, ...s.map((x) => x.military));
  return new Map(s.map((x) => [x.id, x.military / top]));
}

/** Which countries share a land border (built once per daily pass). */
let border = new Set<string>();
function buildBorders(w: World) {
  border = new Set();
  for (const r of w.regions) { const a = controller(r); for (const l of r.links) { const b = controller(w.regions[l]); if (a !== b) border.add(`${a}-${b}`); } }
}
const borders = (_w: World, a: Id, b: Id) => border.has(`${a}-${b}`);

/** Recompute affinity and threat for a pair (a's view of b). */
function assess(w: World, a: Nation, b: Nation, mil: Map<Id, number>, t: Ties) {
  const sa = seatShare(w, a), sb = seatShare(w, b);
  let sim = 0;
  for (const k of Object.keys(IDEOLOGIES)) sim += Math.min(sa[k] ?? 0, sb[k] ?? 0);
  const blocs = sharedBlocs(a, b).filter((x) => x.kind === 'political');
  const shared = activeTreaties(w, a.id).filter((x) => x.parties.includes(b.id)).length;
  t.affinity = Math.round(Math.min(100, sim * 60 + (LANGUAGE[a.iso] === LANGUAGE[b.iso] ? 20 : 0) + blocs.length * 10 + shared * 8 + (a.alliances.includes(b.id) ? 10 : 0)));
  // Threat: their power against ours, how close they are, and their intentions (hostility, their leader, their wars on our friends).
  const ratio = (mil.get(b.id) ?? 0) / Math.max(0.05, mil.get(a.id) ?? 0.05);
  const near = borders(w, a.id, b.id) ? 1 : 0.45;
  const hostile = Math.max(0, -(b.relations[a.id]?.score ?? 0)) / 100;
  const lb = leaderProfile(w, b);
  const warsOnFriends = activeWars(w).some((x) => (x.att === b.id || x.def === b.id) && (a.alliances.includes(enemyOf(x, b.id)) || enemyOf(x, b.id) === a.id)) ? 0.4 : 0;
  const allied = securityPartners(w, a.id, b.id);
  const la = leaderProfile(w, a);
  const limits = hasTreaty(w, a.id, b.id, 'armscontrol') ? 0.75 : 1;
  t.threat = Math.round(Math.min(100, Math.min(3, ratio) * 25 * near * (0.3 + hostile + lb.hawk * 0.4 + warsOnFriends) * (allied ? 0.2 : 1) * limits * (0.8 + la.hawk * 0.4)));
}

/** The blended view (−100..100) that the relation score moves towards. */
export function composite(w: World, a: Nation, b: Nation): number {
  const t = tiesOfPair(w, a, b);
  return Math.max(-100, Math.min(100, t.trust * 0.45 + t.affinity * 0.3 + t.interdep * 0.2 - t.threat * 0.35 - t.grievance * 0.4));
}

/** A country's standing in the world (0..100). */
export function prestigeOf(w: World, n: Nation): number {
  const s = nationScores(w).find((x) => x.id === n.id);
  const friends = Object.values(n.relations).filter((r) => r.score > 30).length;
  return Math.round(Math.min(100, (s?.total ?? 30) * 0.7 + friends * 2 + (n.exile ? -30 : 0)));
}

/** Something one country did to another: trust moves (and the relation with it). Called from congress.relation(). */
export function noteTrust(w: World, a: Id, b: Id, delta: number) {
  const A = w.nations[a], B2 = w.nations[b];
  if (!A || !B2) return;
  for (const [x, y] of [[A, B2], [B2, A]] as [Nation, Nation][]) { const t = tiesOfPair(w, x, y); t.trust = Math.max(-100, Math.min(100, t.trust + delta)); }
}
/** A conquest leaves a grievance that takes decades to fade. */
export function addGrievance(w: World, victim: Id, against: Id, amount: number) {
  const t = tiesOfPair(w, w.nations[victim], w.nations[against]);
  t.grievance = Math.min(100, t.grievance + amount);
}

/** Daily: reassess everyone, drift trust and grievances, and move relation scores towards the blend. */
export function relationsDaily(w: World, days = 1) {
  const k = (rate: number) => 1 - Math.pow(1 - rate, days);
  const mil = militaryWeights(w);
  buildBorders(w);
  for (const a of w.nations) {
    if (a.exile) continue;
    for (const b of w.nations) {
      if (b.id === a.id || b.exile) continue;
      const t = tiesOfPair(w, a, b);
      assess(w, a, b, mil, t);
      // Trust fades towards a baseline (allies keep a store of it); grievances fade over decades.
      const base = a.alliances.includes(b.id) || hasTreaty(w, a.id, b.id, 'intel') ? 30 : 0;
      t.trust += (base - t.trust) * k(0.002);
      t.grievance = Math.max(grievanceOf(a.iso, b.iso) * (hasTreaty(w, a.id, b.id, 'border') ? 0.25 : 0.5), t.grievance - 0.01 * days);
      // Trade ties grow under a trade agreement and wither under an embargo.
      const tieBase = tiesOf(a.iso, b.iso);
      const tieTarget = a.embargoes.includes(b.id) || b.embargoes.includes(a.id) ? tieBase * 0.3 : hasTreaty(w, a.id, b.id, 'trade') ? Math.min(100, tieBase + 15) : tieBase;
      t.interdep += (tieTarget - t.interdep) * k(0.005);
      const r = a.relations[b.id];
      if (!r) continue;
      const target = composite(w, a, b);
      if (!a.relInit) r.score = target; // the first day starts from the real picture
      else r.score += (target - r.score) * k(0.03);
    }
    a.relInit = true;
  }
}
