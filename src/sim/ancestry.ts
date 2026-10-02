// Ancestral places (3.0 Life 2.0: generations).
// - The family home: a home handed down to an heir who lives there stays the family home and counts
//   its generations; selling it is a wrench for the family.
// - Graves: everyone who dies is buried where they lived. Visiting a grave eases grief that has not
//   eased; raising a memorial honours the dead, and the family name with them.
// - Birthplaces: everyone was born somewhere. Going back to where you were born, after years away,
//   is a homecoming: happier, and closer to the place.
import type { Citizen, Id, World } from './types';
import { dayOf } from '../engine/clock';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { cref, hhref, player } from './query';
import { lifeOf } from './lifecycle';
import { adjustRel } from './social';
import { chronicle } from './dynasty';

/** Where someone was born (recorded at birth or arrival; otherwise, for those already here, their home). */
export const birthplaceOf = (c: Citizen): Id => c.birthplace ?? c.home;

// ---------- the family home ----------

export const familyHomeLabel = (c: Citizen) => (c.dwelling?.kind === 'own' && (c.dwelling.gens ?? 1) >= 2 ? `the family home, generation ${c.dwelling.gens}` : null);

// ---------- graves and memorials ----------

/** The family's dead, and where they lie. */
export function gravesOf(w: World, c: Citizen): Citizen[] {
  const ids = new Set<Id>([...(c.family?.parents ?? []), ...(c.family?.children ?? []), ...(c.family?.partner != null ? [c.family.partner] : []), ...(c.mh?.losses ?? []).map((l) => l.id)]);
  for (const id of [...ids]) for (const g of w.citizens[id]?.family?.parents ?? []) ids.add(g); // grandparents
  return [...ids].map((id) => w.citizens[id]).filter((x) => x && x.gone?.why === 'died');
}
export function visitGraveCheck(w: World, c: Citizen, id: Id): string | null {
  const g = w.citizens[id];
  if (!g || g.gone?.why !== 'died') return 'No grave to visit.';
  if (c.loc !== g.home) return `${g.name} lies in ${w.regions[g.home].name}.`;
  if (c.flags[`grave:${id}`] != null && dayOf(w.time) - c.flags[`grave:${id}`] < 30) return 'You were here this month.';
  return null;
}
/** Visit a grave: grief eases, and a loss that would not ease begins to. */
export function visitGrave(w: World, id: Id, c: Citizen = player(w)): Result {
  const why = visitGraveCheck(w, c, id);
  if (why) return fail(why);
  const g = w.citizens[id];
  c.flags[`grave:${id}`] = dayOf(w.time);
  const loss = c.mh?.losses?.find((l) => l.id === id);
  if (loss) { loss.depth = Math.round(loss.depth * 0.85); if (loss.slow && dayOf(w.time) % 2 === 0) loss.slow = false; }
  const L = lifeOf(c);
  L.stress = Math.max(0, L.stress - 4);
  L.happiness = Math.min(100, L.happiness + 1);
  return ok(`🕯️ Flowers at ${g.name}'s grave in ${w.regions[g.home].name}. You stay a while.${g.memorial ? ' The memorial is weathering well.' : ''}`);
}
export const memorialCost = () => Math.round(cur(2000) / 10);
export function memorialCheck(w: World, c: Citizen, id: Id): string | null {
  const g = w.citizens[id];
  if (!g || g.gone?.why !== 'died') return 'No one to remember.';
  if (g.memorial) return 'There is a memorial already.';
  const code = w.nations[c.nation].cur;
  if ((c.wallet[code] ?? 0) < memorialCost()) return `A memorial costs ${fmtAmt(code, memorialCost())}.`;
  return null;
}
/** Raise a memorial (a bench, a plaque, a stone): the dead are honoured, and the family name with them. */
export function raiseMemorial(w: World, id: Id, c: Citizen = player(w)): Result {
  const why = memorialCheck(w, c, id);
  if (why) return fail(why);
  const g = w.citizens[id];
  const n = w.nations[c.nation];
  pay(w, cref(c.id), hhref(n.id), n.cur, memorialCost(), `A memorial to ${g.name}`);
  g.memorial = w.time;
  c.influence += 2;
  for (const id2 of [...(c.family?.children ?? []), ...(c.family?.parents ?? []), ...(c.family?.partner != null ? [c.family.partner] : [])]) { const x = w.citizens[id2]; if (x && !x.gone) adjustRel(x, c.id, 3); }
  chronicle(w, { t: w.time, kind: 'note', text: `${c.name} raised a memorial to ${g.name} in ${w.regions[g.home].name}.`, who: c.id });
  return ok(`🪦 A memorial to ${g.name} in ${w.regions[g.home].name}: a bench by the path, with their name and dates.`);
}

// ---------- birthplaces ----------

export function homecomingCheck(w: World, c: Citizen): string | null {
  const b = birthplaceOf(c);
  if (c.home === b) return 'You live where you were born.';
  if (c.loc !== b) return `You were born in ${w.regions[b].name}: travel there first.`;
  if (c.flags.homecoming != null && dayOf(w.time) - c.flags.homecoming < 365) return 'Once a year.';
  return null;
}
/** Go back to where you were born: the old streets, the school, the people who remember you. */
export function homecoming(w: World, c: Citizen = player(w)): Result {
  const why = homecomingCheck(w, c);
  if (why) return fail(why);
  c.flags.homecoming = dayOf(w.time);
  const L = lifeOf(c);
  L.happiness = Math.min(100, L.happiness + 6);
  L.stress = Math.max(0, L.stress - 5);
  chronicle(w, { t: w.time, kind: 'note', text: `${c.name} went back to ${w.regions[birthplaceOf(c)].name}, where they were born.`, who: c.id });
  return ok(`🏡 ${w.regions[birthplaceOf(c)].name}: the old streets are smaller than you remember. Someone at the corner shop knows your face.`);
}
