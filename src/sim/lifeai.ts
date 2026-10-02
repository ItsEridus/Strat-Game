// Everyone lives by the same rules (AI parity for the life systems): people
// take up hobbies, adopt and look after pets, go back to study, take parental
// leave and spend time with their children, through the same validated actions
// the player uses. Decisions use a stable hash per person and day (no extra dice
// in the world's random stream), and each is rare enough to stay cheap.
import type { Citizen, World } from './types';
import { hash01 } from '../engine/rng';
import { census } from './census';
import { today } from './query';
import { ageOf } from './growth';
import { HOBBIES, hobbyCheck, pursueHobby } from './hobbies';
import { adoptCheck, adoptPet, careCheck, careForPet, petsOf } from './kinship';
import { enroll, enrollCheck } from './education';
import { parentalCheck, takeParentalLeave } from './health';
import { loanCheck } from './loans';
import type { Course, Field } from '../data/education';

const HOBBY_KEYS = Object.keys(HOBBIES);
const FIELDS: Field[] = ['business', 'engineering', 'medicine', 'law', 'teaching', 'science', 'arts', 'trades'];
/** Someone's favourite pastime (stable). */
export const favouriteHobby = (c: Citizen) => HOBBY_KEYS[Math.floor(hash01(c.id, 1322, 1) * HOBBY_KEYS.length)];

export function lifeAIDaily(w: World) {
  const d = today(w);
  for (const c of census(w).all) {
    if (c.player || c.gone) continue;
    const h = (salt: number) => hash01(c.id, d, salt);
    const age = ageOf(w, c);
    if (age < 16) continue;
    // A hobby evening now and then (more for the active).
    if (h(1) < 0.15 + c.traits.activity * 0.2) { const k = favouriteHobby(c); if (!hobbyCheck(w, c, k)) pursueHobby(w, k, c); }
    // Pets: some adopt one (about one adult in three over a life), and owners look after them most days.
    const pets = petsOf(w, c);
    if (!pets.length && age >= 22 && h(2) < 0.0008) { const kind = h(3) < 0.55 ? 'dog' : 'cat'; if (!adoptCheck(w, c, kind)) adoptPet(w, kind, c); }
    for (const pet of pets) if (h(4) < 0.8 && !careCheck(w, c, pet)) careForPet(w, pet.id, c);
    // Back to study: young adults out of work, or ambitious ones, enrol (with a student loan if needed).
    if (!c.edu?.enrolled && age >= 18 && age <= 35 && h(5) < (c.job == null ? 0.002 : 0.0004) * (0.5 + c.traits.ambition)) {
      const course: Course = (c.edu?.level === 'bachelor' ? 'master' : c.edu?.level === 'school' || c.edu?.level === 'vocational' ? (h(6) < 0.5 ? 'bachelor' : 'vocational') : 'vocational');
      const field = FIELDS[Math.floor(h(7) * FIELDS.length)];
      const loan = !!enrollCheck(w, c, course, field) && !loanCheck(w, c, 'student', 1);
      if (!enrollCheck(w, c, course, field, loan)) enroll(w, course, field, c, loan);
    }
    // New parents in work take parental leave (most do where it is paid).
    if ((c.family?.kids ?? []).some((k) => w.time - k.born < 30 * 1440) && h(8) < 0.3 && !parentalCheck(w, c)) takeParentalLeave(w, c);
    // Parents spend time with their children (the caring more often): closeness grows as the player's does.
    for (const k of c.family?.kids ?? []) {
      if (h(9 + (k.born % 7)) < 0.25 + c.traits.loyalty * 0.4) { k.lastTime = d; k.bond = Math.min(100, (k.bond ?? 50) + 1.5); }
    }
  }
}
