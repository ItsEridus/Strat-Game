// The body (2.8 Life 2.0: the everyday): diet, fitness and weight, all feeding health.
// - Weight: body-mass index as in each country (WHO 2022 adult obesity, BMI 30 or more: about 42%
//   in the United States, a third in Mexico, Argentina, Saudi Arabia and Australia, a fifth in
//   Germany, under a tenth in China, Korea, Japan and India), higher in middle age.
// - Diet: cooking at home (cheapest, healthiest, an hour a day), a mix, eating out, or fast food
//   (quick, cheap-ish, fattening). Meals out cost what they do in each country.
// - Fitness: exercise, active hobbies (running, gardening, football), walking or cycling to work
//   and a sporty nature build it; age and sitting still wear it down.
// - Health: obesity raises the risk of diabetes and heart disease and lowers the health a person
//   drifts towards; fitness raises it and eases stress.
import type { Citizen, World } from './types';
import { dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { cref, hhref, player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { hasQuirk } from './nature';
import { HOBBIES } from './hobbies';
import { modeOf, workRegion } from './everyday';

export type Diet = 'cook' | 'mixed' | 'out' | 'fast';
export const DIET_LABEL: Record<Diet, string> = { cook: 'cooking at home', mixed: 'a mix of home cooking and meals out', out: 'eating out', fast: 'mostly fast food' };
const DIET: Record<Diet, { meals: number; health: number; bmi: number; hours: number }> = {
  cook: { meals: 0, health: 2, bmi: -0.12, hours: 1 },
  mixed: { meals: 0.4, health: 1, bmi: 0, hours: 0.5 },
  out: { meals: 1, health: 0, bmi: 0.08, hours: 0 },
  fast: { meals: 0.6, health: -4, bmi: 0.25, hours: 0 }, // (cheaper meals, but more of them)
};
/** 2025: adult obesity (share with BMI 30+), and an inexpensive restaurant meal (US dollars). */
const BODY_2025: Record<string, [number, number]> = {
  USA: [0.42, 20], CAN: [0.3, 18], MEX: [0.36, 8], BRA: [0.26, 8], ARG: [0.35, 9], GBR: [0.28, 18], DEU: [0.22, 15], RUS: [0.24, 8],
  TUR: [0.32, 7], SAU: [0.35, 8], ZAF: [0.28, 9], IND: [0.04, 3], CHN: [0.08, 5], JPN: [0.05, 8], KOR: [0.07, 8], AUS: [0.32, 18],
};
const bodyData = (w: World, c: Citizen) => BODY_2025[dataIso(w.nations[c.nation].iso)] ?? [0.2, 8];

/** A normal deviate from a person's nature (stable). */
const gauss = (c: Citizen, salt: number) => { let s = 0; for (let i = 0; i < 4; i++) s += hash01(c.id, salt + i); return (s - 2) * Math.sqrt(3); };
/** The inverse of the normal tail (approximate): z such that P(Z > z) = p. */
const tailZ = (p: number) => { const t = Math.sqrt(-2 * Math.log(Math.max(1e-4, Math.min(0.5, p)))); return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t); };

export function dietOf(w: World, c: Citizen): Diet {
  if (c.body?.diet) return c.body.diet;
  const h = hash01(c.id, 3201);
  const rich = (c.incomeAvg ?? 0) > cur(12);
  return h < 0.45 ? 'cook' : h < 0.75 ? 'mixed' : h < (rich ? 0.92 : 0.85) ? 'out' : 'fast';
}
/** Body-mass index: the player's own (it changes with how they live); others' from their country, age and nature. */
export function bmiOf(w: World, c: Citizen): number {
  if (c.body?.bmi != null) return c.body.bmi;
  const ob = bodyData(w, c)[0];
  const mu = 30 - 4.5 * tailZ(ob);
  const age = ageOf(w, c);
  const ageK = age < 18 ? -3 : age < 30 ? -1.2 : age < 60 ? 0.6 : 0;
  return Math.round((mu + ageK + 4.5 * gauss(c, 3210) + (dietOf(w, c) === 'fast' ? 1.5 : 0)) * 10) / 10;
}
export const bmiLabel = (b: number) => (b < 18.5 ? 'underweight' : b < 25 ? 'a healthy weight' : b < 30 ? 'overweight' : b < 35 ? 'obese' : 'severely obese');
const ACTIVE_HOBBIES = Object.entries(HOBBIES).filter(([, h]) => h.fit).map(([k]) => k);
/** Fitness (0–100). */
export function fitnessOf(w: World, c: Citizen): number {
  if (c.body?.fitness != null) return c.body.fitness;
  const age = ageOf(w, c);
  let f = 30 + hash01(c.id, 3202) * 40 - Math.max(0, age - 40) * 0.6;
  if (hasQuirk(c, 'sporty')) f += 15;
  if (workRegion(w, c) != null && modeOf(w, c) === 'walk') f += 10;
  return Math.round(Math.max(0, Math.min(100, f)));
}

/** Health a person's body takes off (or adds to) what they drift towards (sim/population.ts). */
export function bodyToll(w: World, c: Citizen): number {
  const b = bmiOf(w, c);
  const fat = b >= 30 ? Math.min(10, (b - 30) * 0.8 + 2) : b < 18.5 ? 4 : 0;
  return fat + 1 - DIET[dietOf(w, c)].health - (fitnessOf(w, c) - 45) / 15; // centred: the average person loses nothing
}
/** How much weight multiplies the risk of diabetes and heart disease. */
export const weightRisk = (w: World, c: Citizen) => 1 + Math.max(0, bmiOf(w, c) - 27) / 8;
/** The body in the reckoning of happiness and stress. */
export function bodyParts(w: World, c: Citizen): { happy: [string, number][]; stress: [string, number][] } {
  const f = fitnessOf(w, c);
  return { happy: f >= 60 ? [['feeling fit', 2]] : [], stress: f >= 50 ? [['exercise', -Math.round((f - 40) / 15)]] : [] };
}

// ---------- the player ----------

const bodyOf = (w: World, c: Citizen) => (c.body ??= { bmi: bmiOf(w, c), fitness: fitnessOf(w, c), diet: dietOf(w, c) });
export const mealPrice = (w: World, c: Citizen) => Math.round(cur(bodyData(w, c)[1]) / 10);
/** What a diet costs a month beyond the groceries in living costs. */
export const dietCost = (w: World, c: Citizen, d: Diet = dietOf(w, c)) => Math.round(mealPrice(w, c) * DIET[d].meals * 30);
export const dietHours = (d: Diet) => DIET[d].hours;

export function setDiet(w: World, d: Diet, c: Citizen = player(w)): Result {
  bodyOf(w, c).diet = d;
  return ok(`From now on: ${DIET_LABEL[d]}${dietCost(w, c, d) ? ` (about ${fmtAmt(w.nations[c.nation].cur, dietCost(w, c, d))} a month)` : ''}.`);
}
export function exerciseCheck(w: World, c: Citizen): string | null {
  if (c.gone) return 'No longer living.';
  if (c.flags.exercised === dayOf(w.time)) return 'You already exercised today.';
  if (c.energy < 10) return 'Too tired.';
  return null;
}
/** An hour of exercise: fitter, calmer, a little lighter. */
export function exercise(w: World, c: Citizen = player(w)): Result {
  const why = exerciseCheck(w, c);
  if (why) return fail(why);
  const b = bodyOf(w, c);
  c.flags.exercised = dayOf(w.time);
  c.energy -= 10;
  b.fitness = Math.min(100, Math.round((b.fitness + 1.2) * 10) / 10);
  b.bmi = Math.round((b.bmi - 0.02) * 100) / 100;
  lifeOf(c).stress = Math.max(0, lifeOf(c).stress - 3);
  return ok(`🏃 An hour of exercise. Fitness ${Math.round(b.fitness)}.`);
}

/** A month: meals out paid for; the player's body follows how they live. */
export function bodyMonth(w: World) {
  for (const c of census(w).all) {
    if (c.gone || ageOf(w, c) < 16) continue;
    const cost = dietCost(w, c);
    if (cost > 0) { const n = w.nations[c.nation]; pay(w, cref(c.id), hhref(n.id), n.cur, Math.min(cost, Math.floor((c.wallet[n.cur] ?? 0) * 0.2)), 'Meals out'); }
    if (!c.body) continue;
    const b = c.body;
    const L = c.life;
    const activeHobby = L?.lastHobby != null && dayOf(w.time) - L.lastHobby <= 10 && ACTIVE_HOBBIES.some((k) => (L.hobbies[k] ?? 0) >= 10);
    b.fitness = Math.round(Math.max(0, Math.min(100, b.fitness - 3 - Math.max(0, ageOf(w, c) - 50) * 0.05 + (activeHobby ? 2 : 0) + (modeOf(w, c) === 'walk' && workRegion(w, c) != null ? 1 : 0))) * 10) / 10;
    b.bmi = Math.round(Math.max(15, Math.min(50, b.bmi + DIET[b.diet].bmi - (b.fitness - 40) / 250 + (ageOf(w, c) < 55 ? 0.02 : 0))) * 100) / 100;
  }
}
export function bodyDaily(w: World) {
  if (dateAt(w.time).day === 1) bodyMonth(w);
}
