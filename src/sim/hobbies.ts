// Hobbies: something done for its own sake. Each is learned by doing (like
// skills), costs an evening's energy and sometimes a little money for supplies,
// and eases stress; some keep you fit, some bring you into company.
import type { Citizen, World } from './types';
import { fail, ok, type Result } from '../engine/result';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { census } from './census';
import { controller, cref, hhref, jailed, player, today } from './query';
import { lifeOf, milestone } from './lifecycle';
import { adjustRel } from './social';
import { chance, pick } from '../engine/rng';

export interface Hobby { icon: string; label: string; doing: string; cost: number; fit?: boolean; social?: boolean; person: string }
export const HOBBIES: Record<string, Hobby> = {
  running: { icon: '🏃', label: 'Running', doing: 'went for a run', cost: 0, fit: true, person: 'runner' },
  reading: { icon: '📚', label: 'Reading', doing: 'read for an evening', cost: 0.4, person: 'reader' },
  chess: { icon: '♟️', label: 'Chess', doing: 'played chess at the club', cost: 0.4, social: true, person: 'chess player' },
  music: { icon: '🎸', label: 'Music', doing: 'practised guitar', cost: 0.8, person: 'musician' },
  painting: { icon: '🎨', label: 'Painting', doing: 'painted', cost: 1.2, person: 'painter' },
  cooking: { icon: '🍳', label: 'Cooking', doing: 'cooked something new', cost: 1.6, person: 'cook' },
  gardening: { icon: '🌱', label: 'Gardening', doing: 'worked in the garden', cost: 0.4, fit: true, person: 'gardener' },
  football: { icon: '⚽', label: 'Football', doing: 'played five-a-side', cost: 0.8, fit: true, social: true, person: 'footballer' },
};
export const HOBBY_ENERGY = 6;

const LEVELS: [number, string][] = [[75, 'accomplished'], [50, 'skilled'], [25, 'keen'], [0, 'beginner']];
/** "keen runner", "beginner painter". */
export const hobbyLevel = (v: number) => LEVELS.find(([min]) => v >= min)![1];
export const hobbyTitle = (key: string, v: number) => `${hobbyLevel(v)} ${HOBBIES[key].person}`;

export function hobbyCheck(w: World, c: Citizen, key: string): string | null {
  const h = HOBBIES[key];
  if (!h) return 'Unknown hobby.';
  if (c.gone) return 'No longer living.';
  if (jailed(w, c)) return 'Not in prison.';
  if (lifeOf(c).lastHobby === today(w)) return 'One hobby evening a day.';
  if (c.energy < HOBBY_ENERGY) return `Needs ${HOBBY_ENERGY} energy.`;
  const code = w.nations[controller(w.regions[c.loc])].cur;
  if (h.cost && (c.wallet[code] ?? 0) < cur(h.cost)) return `Supplies cost ${fmtAmt(code, cur(h.cost))}.`;
  return null;
}

/** An evening at a hobby: skill by practice (quick at first, slower later), calmer and happier. */
export function pursueHobby(w: World, key: string, c: Citizen = player(w)): Result {
  const why = hobbyCheck(w, c, key);
  if (why) return fail(why);
  const h = HOBBIES[key];
  const L = lifeOf(c);
  const nat = controller(w.regions[c.loc]);
  if (h.cost) pay(w, cref(c.id), hhref(nat), w.nations[nat].cur, cur(h.cost), `${h.label} supplies`);
  c.energy -= HOBBY_ENERGY;
  L.lastHobby = today(w);
  const before = L.hobbies[key] ?? 0;
  const after = Math.min(100, before + 4 / (1 + before / 25));
  L.hobbies[key] = after;
  L.stress = Math.max(0, L.stress - 2);
  L.happiness = Math.min(100, L.happiness + 1);
  const extra: string[] = [];
  if (h.fit && c.health != null) { c.health = Math.min(100, c.health + 0.5); extra.push('good for your health'); }
  if (h.social) {
    const others = (census(w).byLoc.get(c.loc) ?? []).filter((x) => !x.player && !x.gone && x.id !== c.id);
    if (others.length && chance(w, 0.5)) { const o = pick(w, others); adjustRel(o, c.id, 2); adjustRel(c, o.id, 2); extra.push(`with ${o.name}`); }
  }
  if (hobbyLevel(after) !== hobbyLevel(before)) milestone(w, c, 'hobby', `became a ${hobbyTitle(key, after)}`);
  return ok(`${h.icon} You ${h.doing}${extra.length ? ` (${extra.join(', ')})` : ''}. ${hobbyLevel(after) !== hobbyLevel(before) ? `You're now a ${hobbyTitle(key, after)}!` : `${h.label} ${Math.floor(after)}.`}`);
}
