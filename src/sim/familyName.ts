// The family name (3.0 Life 2.0: generations): reputation that outlives people.
// - Political dynasties: a candidate whose family has given the country heads of government before
//   carries the name into the campaign (voters remember it, for better or worse).
// - Old money and new money: wealth inherited across generations is old money (it opens doors
//   among the establishment and the right, and is resented on the left); wealth made in one life
//   is new money.
// - Family firms: a company handed down from parent to child stays a family firm and counts its
//   generations; its staff know whose name is over the door.
// - The family's standing: what a name is worth is what its living members are worth to people
//   (influence and fame), and what the dead left behind (offices held, firms founded).
import type { Citizen, Company, Ideology, World } from './types';
import { almanacOf } from './almanac';

export const surnameOf = (name: string) => name.split(' ').slice(1).join(' ') || name;

/** Heads of government of a country who shared someone's family name (the almanac records them). */
export function dynastyLeaders(w: World, c: Citizen): number {
  const s = surnameOf(c.name);
  const list = almanacOf(w).leaders[c.nation] ?? [];
  return list.filter((l) => l.id !== c.id && surnameOf(l.name) === s && w.citizens[l.id] && isKin(w, c, w.citizens[l.id])).length;
}
/** Kin by blood or marriage within three steps. */
function isKin(w: World, a: Citizen, b: Citizen): boolean {
  const seen = new Set([a.id]);
  let front = [a.id];
  for (let k = 0; k < 3; k++) {
    const next: number[] = [];
    for (const id of front) { const f = w.citizens[id]?.family; if (!f) continue; for (const x of [f.partner, ...f.parents, ...f.children]) if (x != null && !seen.has(x)) { if (x === b.id) return true; seen.add(x); next.push(x); } }
    front = next;
  }
  return false;
}
/** What the family name adds to a candidate (sim/politics.ts). */
const memo = new WeakMap<World, { day: number; dyn: Map<number, number>; money: Map<number, 'old' | 'new' | null> }>();
function cache(w: World) {
  const day = Math.floor(w.time / 1440);
  let m = memo.get(w);
  if (!m || m.day !== day) { m = { day, dyn: new Map(), money: new Map() }; memo.set(w, m); }
  return m;
}
export function dynastyVote(w: World, cand: Citizen, voterIdeo: Ideology): number {
  const m = cache(w);
  let n = m.dyn.get(cand.id);
  if (n == null) { n = dynastyLeaders(w, cand); m.dyn.set(cand.id, n); }
  if (!n) return 0;
  return Math.min(12, n * 6) * (voterIdeo === 'socialism' || voterIdeo === 'communism' ? 0.5 : 1);
}

/** Old money (inherited across generations) or new money (made in one life), for the well-off. */
export function moneyKind(w: World, c: Citizen): 'old' | 'new' | null {
  const code = w.nations[c.nation]?.cur;
  const rich = (c.wallet[code] ?? 0) > 200000 || Object.values(w.companies).some((co) => co.owner.k === 'cit' && co.owner.id === c.id);
  if (!rich) return null;
  return (c.flags.inherited ?? 0) > 50000 || Object.values(w.companies).some((co) => co.owner.k === 'cit' && co.owner.id === c.id && (co.family?.gen ?? 1) >= 2) ? 'old' : 'new';
}
/** Old money in a voter's eyes (sim/politics.ts). */
export function moneyVote(w: World, cand: Citizen, voterIdeo: Ideology): number {
  const m = cache(w);
  let k = m.money.get(cand.id);
  if (k === undefined) { k = moneyKind(w, cand); m.money.set(cand.id, k); }
  if (k !== 'old') return 0;
  return voterIdeo === 'capitalism' || voterIdeo === 'imperialism' ? 3 : voterIdeo === 'socialism' || voterIdeo === 'communism' ? -5 : 0;
}

// ---------- family firms ----------

/** A company passes on a death: if to a child, it stays a family firm and gains a generation. */
export function handDown(w: World, co: Company, from: Citizen, to: Citizen | null) {
  if (!to) return;
  const child = (from.family?.children ?? []).includes(to.id) || (to.family?.parents ?? []).includes(from.id);
  const spouse = from.family?.partner === to.id;
  if (child) co.family = { name: surnameOf(from.name), gen: (co.family?.gen ?? 1) + 1, since: co.family?.since ?? co.ownerHist[0]?.t ?? 0 };
  else if (!spouse) delete co.family;
}
export const familyFirmLabel = (co: Company) => (co.family && co.family.gen >= 2 ? `a ${co.family.name} family firm, generation ${co.family.gen}` : null);

/** What a family name is worth in a country (living members' influence and fame, and the offices held). */
export function nameStanding(w: World, nation: number, surname: string): number {
  let s = 0;
  for (const c of Object.values(w.citizens)) if (c.nation === nation && !c.gone && surnameOf(c.name) === surname) s += c.influence / 10 + (c.sec?.fame ?? 0) / 5;
  s += (almanacOf(w).leaders[nation] ?? []).filter((l) => surnameOf(l.name) === surname).length * 15;
  return Math.round(s);
}
