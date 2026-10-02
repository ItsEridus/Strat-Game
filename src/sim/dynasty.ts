// Generations (3.0 Life 2.0): the dynasty, its family tree and its chronicle.
// - The dynasty is the family the player's lives belong to, named for the first of the line. Each
//   life the player lives is a generation (an heir who is a child is the next generation; a spouse
//   or sibling who carries on is the same one).
// - The family tree is drawn from who is whose parent, child and spouse (people who have died stay
//   in the records, so the tree reaches back), with the children still growing up at home.
// - The family chronicle records the family's great moments as they happen: births, marriages,
//   deaths, successions, and each generation's life in summary.
import type { Citizen, Id, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { player } from './query';
import { ageOf } from './growth';

export interface DynastyEvent { t: number; kind: 'birth' | 'marriage' | 'death' | 'succession' | 'founding' | 'note'; text: string; who?: Id }
export interface Dynasty { name: string; founder: Id; started: number; gens: Record<Id, number>; events: DynastyEvent[] }

const surname = (name: string) => name.split(' ').slice(1).join(' ') || name;
/** The player's dynasty (founded with the first life). */
export function dynastyOf(w: World): Dynasty {
  const p = player(w);
  return (w.dynasty ??= { name: surname(p.name), founder: p.id, started: w.time, gens: { [p.id]: 1 }, events: [{ t: w.time, kind: 'founding', text: `${p.name} begins the ${surname(p.name)} family story in ${w.regions[p.home].name}.`, who: p.id }] });
}
/** Which generation of the line someone is (if known). */
export const generationOf = (w: World, id: Id) => dynastyOf(w).gens[id];

/** Record a moment in the family chronicle. */
export function chronicle(w: World, e: DynastyEvent) {
  const d = dynastyOf(w);
  d.events.push(e);
  if (d.events.length > 600) d.events.splice(1, d.events.length - 600); // (the founding stays)
}

/** The family: everyone within a few steps of the player by blood or marriage (cached per day). */
const famCache = new WeakMap<World, { day: number; set: Set<Id> }>();
export function familySet(w: World, depth = 3): Set<Id> {
  const day = Math.floor(w.time / DAY);
  const hit = famCache.get(w);
  if (hit && hit.day === day) return hit.set;
  const set = new Set<Id>([w.playerId]);
  let frontier = [w.playerId];
  for (let k = 0; k < depth; k++) {
    const next: Id[] = [];
    for (const id of frontier) {
      const c = w.citizens[id];
      const f = c?.family;
      if (!f) continue;
      for (const x of [f.partner, ...f.parents, ...f.children]) if (x != null && !set.has(x) && w.citizens[x]) { set.add(x); next.push(x); }
    }
    frontier = next;
  }
  for (const id of Object.keys(dynastyOf(w).gens)) set.add(+id);
  famCache.set(w, { day, set });
  return set;
}
export const inFamily = (w: World, c: Citizen) => familySet(w).has(c.id);

// ---------- hooks: the family's great moments ----------

export function noteBirth(w: World, parent: Citizen, other: Citizen | undefined, name: string) {
  if (!inFamily(w, parent) && !(other && inFamily(w, other))) return;
  chronicle(w, { t: w.time, kind: 'birth', text: `${name} was born to ${parent.name}${other ? ` and ${other.name}` : ''}.`, who: parent.id });
}
export function noteMarriage(w: World, a: Citizen, b: Citizen) {
  if (!inFamily(w, a) && !inFamily(w, b)) return;
  chronicle(w, { t: w.time, kind: 'marriage', text: `${a.name} married ${b.name} in ${w.regions[a.home].name}.`, who: a.id });
}
export function noteDeath(w: World, c: Citizen, cause: string) {
  if (!inFamily(w, c)) return;
  chronicle(w, { t: w.time, kind: 'death', text: `${c.name} died, aged ${ageOf(w, c)} (${cause}).`, who: c.id });
}
/** The player's line passes to an heir: a new generation if the heir is the dead player's child. */
export function noteSuccession(w: World, dead: Citizen, heir: Citizen) {
  const d = dynastyOf(w);
  const g = d.gens[dead.id] ?? 1;
  d.gens[heir.id] = (dead.family?.children ?? []).includes(heir.id) ? g + 1 : g;
  chronicle(w, { t: w.time, kind: 'succession', text: `${heir.name} carries the family on${d.gens[heir.id] > g ? `: generation ${d.gens[heir.id]}` : ''}.`, who: heir.id });
}

// ---------- the family tree ----------

export interface TreeNode { id?: Id; name: string; born: number; died?: number; spouse?: { id: Id; name: string }; children: TreeNode[]; you?: boolean; atHome?: boolean }
/** Ancestors of someone, nearest first (up to `depth` generations). */
export function ancestors(w: World, c: Citizen, depth = 3): Citizen[][] {
  const out: Citizen[][] = [];
  let gen = [c];
  for (let k = 0; k < depth; k++) {
    const up = gen.flatMap((x) => (x.family?.parents ?? []).map((id) => w.citizens[id]).filter(Boolean));
    if (!up.length) break;
    out.push(up);
    gen = up;
  }
  return out;
}
/** The tree down from someone: their spouse and children, and the children's own families. */
export function descendants(w: World, c: Citizen, depth = 3): TreeNode {
  const f = c.family;
  const spouse = f?.partner != null ? w.citizens[f.partner] : null;
  const node: TreeNode = { id: c.id, name: c.name, born: c.born, died: c.gone?.why === 'died' ? c.gone.t : undefined, spouse: spouse ? { id: spouse.id, name: spouse.name } : undefined, children: [], you: c.player };
  if (depth <= 0) return node;
  const kids = new Set<Id>([...(f?.children ?? []), ...(spouse?.family?.children ?? [])]);
  for (const id of kids) { const k = w.citizens[id]; if (k) node.children.push(descendants(w, k, depth - 1)); }
  for (const k of [...(f?.kids ?? []), ...(spouse?.family?.kids ?? [])]) node.children.push({ name: k.name, born: k.born, children: [], atHome: true });
  node.children.sort((a, b) => a.born - b.born);
  return node;
}
/** The root of the family as far back as the records go (for the whole tree). */
export function eldest(w: World, c: Citizen): Citizen {
  let x = c;
  for (let k = 0; k < 4; k++) { const p = (x.family?.parents ?? []).map((id) => w.citizens[id]).filter(Boolean).sort((a, b) => a.born - b.born)[0]; if (!p) break; x = p; }
  return x;
}

/** A summary of each generation the player has lived (from the legacy archive and the life now). */
export function generations(w: World): { gen: number; name: string; from: number; to?: number; summary: string[] }[] {
  const d = dynastyOf(w);
  const lives = (w.legacy ?? []).map((e) => ({ gen: d.gens[e.id] ?? 1, name: e.name, from: e.born, to: e.died, summary: e.milestones.slice(-5) }));
  const p = player(w);
  lives.push({ gen: d.gens[p.id] ?? 1, name: p.name, from: p.born, to: undefined as unknown as number, summary: (p.life?.milestones ?? []).slice(-5).map((m) => `${m.age}: ${m.text}`) });
  return lives;
}
export const yearsOfDynasty = (w: World) => dateAt(w.time).year - dateAt(dynastyOf(w).started).year;

/** Daily: the dynasty exists from the first day (cheap). */
export function dynastyDaily(w: World) {
  dynastyOf(w);
}
