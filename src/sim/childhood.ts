// Childhood and parenting. A player who starts young goes to school (grades
// grow with attendance and the school's quality), plays, gets pocket money and
// lives on their parents' budget; at 18 school ends with a diploma by grades,
// and top grades win a scholarship. Parents spend time with their children:
// closeness and school results shape who the child becomes at 18.
import type { Citizen, Kid, World } from './types';
import { B } from '../data/balance';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify } from '../engine/events';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { cref, jailed, player, today } from './query';
import { ageOf, practise } from './growth';
import { lifeOf, milestone } from './lifecycle';
import { courseDays, eduOfCitizen, hasUniversity, schoolQuality } from './education';
import { census } from './census';

export const isMinor = (w: World, c: Citizen) => ageOf(w, c) < B.life.adultAge;
const schoolAge = (w: World, c: { born: number }) => { const a = ageOf(w, c); return a >= B.life.stages.child && a < B.life.adultAge; };

// ---------- the player as a child ----------

export function schoolDayCheck(w: World, c: Citizen): string | null {
  if (!schoolAge(w, c)) return ageOf(w, c) < B.life.stages.child ? 'School starts at 5.' : 'You have finished school.';
  if (lifeOf(c).lastSchool === today(w)) return 'You have been at school today.';
  if (c.energy < 4) return 'Too tired.';
  return null;
}
/** A day at school: grades follow effort and the school's quality; a little learning in everything. */
export function schoolDay(w: World, c: Citizen = player(w)): Result {
  const why = schoolDayCheck(w, c);
  if (why) return fail(why);
  const L = lifeOf(c);
  L.lastSchool = today(w);
  c.energy -= 4;
  const q = schoolQuality(w, w.regions[c.home]);
  L.grades = Math.min(100, (L.grades ?? 50) + (0.25 + q / 400) * (1 - (L.grades ?? 50) / 120));
  practise(w, c, 'acc', 0.3); practise(w, c, 'lead', 0.2);
  return ok(`🎒 A day at school (grades ${Math.round(L.grades)}).`);
}

export function playCheck(w: World, c: Citizen): string | null {
  if (!isMinor(w, c)) return 'Grown-ups have hobbies instead.';
  if (lifeOf(c).lastPlay === today(w)) return 'You have played today.';
  if (c.energy < 3) return 'Too tired.';
  return null;
}
export function play(w: World, c: Citizen = player(w)): Result {
  const why = playCheck(w, c);
  if (why) return fail(why);
  const L = lifeOf(c);
  L.lastPlay = today(w);
  c.energy -= 3;
  L.happiness = Math.min(100, L.happiness + 2);
  L.stress = Math.max(0, L.stress - 2);
  practise(w, c, 'end', 0.2);
  return ok(ageOf(w, c) < 13 ? '⚽ An afternoon playing with friends.' : '🎧 Hanging out with friends.');
}

/** The player turns 18: school ends with a diploma by grades (a scholarship for the best). */
export function leaveSchool(w: World, c: Citizen) {
  const L = lifeOf(c);
  if (L.schoolDone) return;
  L.schoolDone = true;
  const g = L.grades ?? 50;
  const e = eduOfCitizen(c);
  e.level = g >= 35 ? 'school' : 'none';
  if (g >= 85) L.scholarship = true;
  milestone(w, c, 'education', g >= 35 ? `finished school (grades ${Math.round(g)})` : 'left school without a diploma');
  if (c.player) notify(w, 'personal', `🎓 School is over: ${g >= 35 ? `a secondary diploma with grades of ${Math.round(g)}` : 'no diploma (grades under 35)'}${g >= 85 ? '. Your grades earned a scholarship: university fees are paid for your first degree' : ''}. College, university, work or the armed forces: your choice.`, { critical: true, link: 'life' });
}

// ---------- parenting ----------

export function parentTimeCheck(w: World, p: Citizen, kid: Kid | undefined): string | null {
  if (!kid) return 'No such child.';
  if (jailed(w, p)) return 'You are in prison.';
  if (kid.lastTime === today(w)) return `You have spent time with ${kid.name.split(' ')[0]} today.`;
  if (p.energy < 4) return 'Needs 4 energy.';
  return null;
}
/** Time with a child: reading, homework, a trip to the park. Closeness and (at school age) grades grow. */
export function parentTime(w: World, kidName: string, p: Citizen = player(w)): Result {
  const kid = (p.family?.kids ?? []).find((k) => k.name === kidName);
  const why = parentTimeCheck(w, p, kid);
  if (why) return fail(why);
  const k = kid!;
  k.lastTime = today(w);
  p.energy -= 4;
  k.bond = Math.min(100, (k.bond ?? 50) + 5);
  if (schoolAge(w, k)) k.grades = Math.min(100, (k.grades ?? 50) + 1.5);
  lifeOf(p).happiness = Math.min(100, lifeOf(p).happiness + 1);
  const age = ageOf(w, k);
  const what = age < 5 ? 'played and read stories' : age < 13 ? 'helped with homework and went to the park' : 'talked, cooked dinner and went to a match';
  return ok(`👨‍👧 You ${what} with ${k.name.split(' ')[0]} (closeness ${Math.round(k.bond)}).`);
}

/** Daily: children's grades drift with school and attention; closeness fades without time together; pocket money; school ends at 18. */
export function childhoodDaily(w: World) {
  const d = today(w);
  for (const c of census(w).all) {
    for (const k of c.family?.kids ?? []) {
      if (k.bond != null && d - (k.lastTime ?? d) > 3) k.bond = Math.max(0, k.bond - 0.3);
      if (schoolAge(w, k)) {
        const q = schoolQuality(w, w.regions[c.home]);
        const target = 30 + q * 0.4 + ((k.bond ?? 50) - 50) * 0.3 + (hash01(c.id, k.born, 7) - 0.5) * 30;
        k.grades = (k.grades ?? 50) + (target - (k.grades ?? 50)) * 0.01;
      }
    }
    if (!c.player) continue;
    const L = lifeOf(c);
    if (isMinor(w, c)) {
      // Pocket money from a parent, about weekly, rising with age.
      if (d % 7 === 0 && ageOf(w, c) >= 6) {
        const parent = (c.family?.parents ?? []).map((id) => w.citizens[id]).find((x) => x && !x.gone);
        const code = w.nations[c.nation].cur;
        const amt = cur(Math.round(ageOf(w, c) / 2));
        if (parent && pay(w, cref(parent.id), cref(c.id), code, amt, 'Pocket money')) notify(w, 'personal', `🪙 Pocket money from ${parent.name.split(' ')[0]}: ${fmtAmt(code, amt)}.`);
      }
      if (schoolAge(w, c) && L.lastSchool != null && d - L.lastSchool > 5) L.grades = Math.max(0, (L.grades ?? 50) - 0.3); // truancy shows
    } else if (L.grades != null && !L.schoolDone) leaveSchool(w, c);
  }
}

/** Who a child becomes at 18: education from their grades, and how close they feel to their parent. */
export function comeOfAgeFrom(w: World, kid: Kid, c: Citizen, parent: Citizen) {
  if (kid.grades != null) {
    const g = kid.grades;
    c.edu = { level: g >= 35 ? 'school' : 'none' };
    // Good students go on to college or university (where there is one), as their grades allow.
    if (g >= 60 && hash01(c.id, 18, 3) < (g - 40) / 60) {
      const course = hasUniversity(w, w.regions[c.home]) && g >= 70 ? 'bachelor' : 'vocational';
      c.edu.enrolled = { course, field: (['business', 'engineering', 'medicine', 'law', 'teaching', 'science', 'arts', 'trades'] as const)[Math.floor(hash01(c.id, 18, 4) * 8)], region: c.home, since: w.time, days: 0, need: courseDays(w, course), lastDay: -1, paidYears: 1 };
    }
  }
  if (kid.bond != null) c.rel[parent.id] = Math.round(kid.bond - 10);
}
