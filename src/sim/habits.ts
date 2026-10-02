// Habits and addictions (2.6 Life 2.0): smoking, drinking, gambling and gaming.
// - Who has them follows each country (2025): daily smoking from about one man in eight in
//   Britain, Brazil and the United States to nearly half of men in China (WHO); alcohol
//   dependence from almost none in Saudi Arabia to about one adult in eleven in Russia; problem
//   gambling around 1% (more in Australia and Japan); gaming disorder in a few per cent of the
//   young (more in Korea and China). Men smoke, drink and gamble more; faith keeps people from
//   drink and gambling; the young take up habits, mostly before 25.
// - A habit has a strength (0–100): at 50 and above it is an addiction. It drifts towards each
//   person's own set point, pushed up by stress, depression, grief and an appetite for risk.
// - They cost money every month (cigarettes from about $2 a pack in India to $35 in Australia,
//   most of it excise), harm health (smoking: cancer and heart disease; heavy drinking: the
//   liver and the heart), strain families, cost drinkers their jobs and gamblers their savings.
// - Quitting: smokers try about once in three years, most relapse within months; help (from a
//   doctor) about doubles the chance of staying off. After a year without, the habit is behind them.
// - Tobacco duty rises over the years (governments raise it; the head of government can too),
//   so fewer start and more quit; smoking declines as it has since the 1970s.
import type { Citizen, Id, Nation, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify, record } from '../engine/events';
import { chance, hash01, next } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { citizensOf, cref, hhref, jailed, natref, player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { sexOf } from './looks';
import { valueOf, shape } from './mind';
import { griefOf, mentalConditions } from './mentalHealth';
import { visitCost } from './health';
import { quitJob } from './company';
import { historyPace } from './strategic';

export type Habit = 'smoking' | 'drinking' | 'gambling' | 'gaming';
export const HABIT_KEYS: Habit[] = ['smoking', 'drinking', 'gambling', 'gaming'];
export const HABITS: Record<Habit, { label: string; icon: string; levels: [string, string, string]; help: string; tax: number }> = {
  smoking: { label: 'Smoking', icon: '🚬', levels: ['a few a day', 'a daily smoker', 'hooked on nicotine'], help: 'nicotine patches and a stop-smoking service', tax: 0.6 },
  drinking: { label: 'Drinking', icon: '🍺', levels: ['a social drinker', 'drinking heavily', 'dependent on alcohol'], help: 'a detox programme and support group', tax: 0.35 },
  gambling: { label: 'Gambling', icon: '🎰', levels: ['an occasional flutter', 'gambling regularly', 'a gambling addiction'], help: 'counselling and a self-exclusion scheme', tax: 0.15 },
  gaming: { label: 'Gaming', icon: '🎮', levels: ['a casual gamer', 'gaming for hours', 'a gaming disorder'], help: 'counselling', tax: 0 },
};
export const habitLevel = (h: Habit, level: number) => HABITS[h].levels[level >= 50 ? 2 : level >= 30 ? 1 : 0];

export interface HabitState { level: number; since: number; quit?: number; tries?: number; helped?: boolean }

/** 2025: daily smokers (% of men, of women), alcohol dependence, problem gambling, gaming disorder
 * among the young (% of adults), a pack of cigarettes and a drink (US dollars). */
const HAB_2025: Record<string, [number, number, number, number, number, number, number]> = {
  USA: [13, 10, 6, 1.5, 3, 9, 4], CAN: [12, 9, 4.5, 1, 3, 13, 5], GBR: [13, 11, 4.5, 0.8, 3, 18, 6], DEU: [22, 17, 5, 0.8, 3, 9, 4],
  AUS: [12, 10, 4.5, 1.5, 3, 35, 7], JPN: [27, 7, 4, 2.2, 4, 4, 4], KOR: [33, 5, 6, 1.5, 5, 3.5, 3], CHN: [48, 2, 4, 1, 5, 3, 2],
  IND: [20, 2, 3, 1, 3, 2, 2], RUS: [40, 15, 9, 1, 3, 2.5, 2], TUR: [40, 18, 1.5, 1, 3, 2.5, 5], SAU: [25, 2, 0.3, 0.1, 4, 5, 15],
  BRA: [12, 8, 6, 1, 3, 2.5, 2], MEX: [14, 4, 5, 0.8, 3, 4, 2], ARG: [22, 16, 5, 1, 3, 3, 2], ZAF: [33, 7, 8, 1.5, 2, 4, 2],
};
const habData = (n: Nation) => HAB_2025[dataIso(n.iso)] ?? [20, 8, 4, 1, 3, 4, 3];
/** Where alcohol or gambling is against the law. */
const BANNED: Record<string, Habit[]> = { SAU: ['drinking', 'gambling'] };
export const banned = (n: Nation, h: Habit) => (BANNED[dataIso(n.iso)] ?? []).includes(h);

export const habitsOf = (c: Citizen): [Habit, HabitState][] => Object.entries(c.habits ?? {}) as [Habit, HabitState][];
export const habit = (c: Citizen, h: Habit) => c.habits?.[h];
/** The strength of a habit someone is living with now (0 when they have quit or never had it). */
export const active = (c: Citizen, h: Habit) => { const s = c.habits?.[h]; return s && s.quit == null ? s.level : 0; };

/** A country's tobacco duty against 2025 (1 = as then). */
export const tobaccoDuty = (n: Nation) => n.tobacco ?? 1;
/** What a pack costs (and a drink), in local money. */
export function prices(w: World, n: Nation) {
  const d = habData(n);
  return { pack: Math.max(1, Math.round((cur(d[5]) / 10) * tobaccoDuty(n))), drink: Math.max(1, Math.round(cur(d[6]) / 10)) };
}

// ---------- who has which habit ----------

/** The share of people like this one who have the habit (at seed time), and the share of those who are addicted. */
function prevalence(w: World, c: Citizen, h: Habit): number {
  const n = w.nations[c.nation];
  const d = habData(n);
  const age = ageOf(w, c);
  const male = sexOf(w, c) === 'm';
  const faith = valueOf(w, c, 'faith');
  const ageK = age < 18 ? 0.25 : age < 25 ? 0.85 : age < 65 ? 1.1 : 0.6;
  switch (h) {
    case 'smoking': return ((male ? d[0] : d[1]) / 100) * ageK;
    case 'drinking': return banned(n, h) ? 0.002 : ((d[2] * 2.5) / 100) * (male ? 1.6 : 0.45) * (age < 18 ? 0.2 : 1) * (1.4 - faith);
    case 'gambling': return banned(n, h) ? 0.001 : age < 18 ? 0 : ((d[3] * 3) / 100) * (male ? 1.5 : 0.5) * (1.4 - faith);
    case 'gaming': return age > 40 ? ((d[4] * 1.5) / 100) * 0.3 : ((d[4] * 5) / 100) * (male ? 1.6 : 0.5);
  }
}
/** Each person's own pull towards a habit (a set point 0–100 the strength drifts to). */
function setPoint(w: World, c: Citizen, h: Habit): number {
  const i = HABIT_KEYS.indexOf(h);
  let x = 22 + 45 * hash01(c.id, 2701 + i) + (c.traits.risk - 0.5) * 20;
  const stress = c.life?.stress ?? 25;
  x += Math.max(0, stress - 40) * 0.5;
  if (h === 'smoking' || h === 'drinking') { if (mentalConditions(c).length) x += 10; if (griefOf(w, c) > 8) x += 8; }
  if (h === 'gaming') x -= Math.max(0, ageOf(w, c) - 28) * 1.5; // most grow out of it
  if (h === 'smoking') x += 15; // nicotine holds on
  return Math.max(5, Math.min(100, x));
}

function begin(w: World, c: Citizen, h: Habit, level: number) {
  (c.habits ??= {})[h] = { level: Math.round(level), since: w.time };
}

/** People new to the world (at the start, arrivals, those coming of age) have the habits of people like them. */
function seed(w: World) {
  const from = w.habitsSeeded ?? 0;
  let top = from;
  for (const c of census(w).all) {
    if (c.id < from) continue;
    top = Math.max(top, c.id + 1); // (children born here take up habits as they grow instead)
    if (c.gone || c.player || c.habits || ageOf(w, c) < 14) continue;
    for (const h of HABIT_KEYS) {
      if (hash01(c.id, 2711 + HABIT_KEYS.indexOf(h)) >= prevalence(w, c, h)) continue;
      begin(w, c, h, Math.min(100, setPoint(w, c, h) * (0.8 + next(w) * 0.3)));
    }
  }
  w.habitsSeeded = top;
}

// ---------- harm ----------

/** Health a person's habits take off what they would otherwise drift towards. */
export function habitToll(c: Citizen): number {
  return (active(c, 'smoking') / 100) * 10 + (Math.max(0, active(c, 'drinking') - 30) / 70) * 12 + (Math.max(0, active(c, 'gaming') - 50) / 50) * 3;
}
/** How much habits multiply the risk of cancer and heart disease. */
export function habitRisk(c: Citizen, what: 'cancer' | 'heart'): number {
  const s = active(c, 'smoking'), d = active(c, 'drinking');
  return what === 'cancer' ? 1 + s / 35 + d / 120 : 1 + s / 60 + d / 100;
}
/** Habits in the reckoning of happiness and stress (sim/wellbeing.ts). */
export function habitParts(w: World, c: Citizen): { happy: [string, number][]; stress: [string, number][] } {
  const happy: [string, number][] = [], stress: [string, number][] = [];
  for (const [h, s] of habitsOf(c)) {
    if (s.quit != null) { if (w.time - s.quit < 30 * DAY) stress.push([`craving (${HABITS[h].label.toLowerCase()})`, Math.round(4 + s.level / 10)]); continue; }
    if (s.level >= 50) happy.push([HABITS[h].levels[2], -3]); else happy.push([HABITS[h].label.toLowerCase(), 1]);
    if (h === 'gambling' && s.level >= 50) stress.push(['gambling losses', 6]);
  }
  return { happy, stress };
}

// ---------- the monthly course ----------

/** What the habits cost this month (minor units) and where the money goes. */
function monthlyCost(w: World, c: Citizen, h: Habit, level: number): number {
  const n = w.nations[c.nation];
  const p = prices(w, n);
  const cash = c.wallet[n.cur] ?? 0;
  switch (h) {
    case 'smoking': return Math.round(30 * (level / 60) * p.pack);
    case 'drinking': return Math.round(30 * (level / 25) * p.drink);
    case 'gambling': return Math.round(cash * (level / 100) * 0.12) + Math.round(cur(2) * level / 50);
    case 'gaming': return Math.round((cur(15) / 10) * (level / 50));
  }
}
function payFor(w: World, c: Citizen, h: Habit, amt: number) {
  const n = w.nations[c.nation];
  amt = Math.min(amt, Math.floor((c.wallet[n.cur] ?? 0) * 0.3)); // what they can find
  if (amt <= 0) return;
  const tax = Math.round(amt * HABITS[h].tax);
  if (tax > 0) pay(w, cref(c.id), natref(n.id), n.cur, tax, h === 'smoking' ? 'Tobacco duty' : h === 'drinking' ? 'Alcohol duty' : 'Gambling duty');
  if (amt - tax > 0) pay(w, cref(c.id), hhref(n.id), n.cur, amt - tax, h === 'smoking' ? 'Cigarettes' : h === 'drinking' ? 'Drink' : h === 'gambling' ? 'Gambling losses' : 'Games');
}

/** Monthly chances of trying to quit, and of relapsing (by the months since quitting). */
const QUIT: Record<Habit, number> = { smoking: 0.02, drinking: 0.012, gambling: 0.015, gaming: 0.02 };
const RELAPSE: Record<Habit, number> = { smoking: 0.6, drinking: 0.5, gambling: 0.45, gaming: 0.35 };

/** Monthly chance someone without a habit takes it up (young people, mostly; stress and grief drive drinking). */
function startHazard(w: World, c: Citizen, h: Habit): number {
  const age = ageOf(w, c);
  const p = prevalence(w, c, h);
  const years = (w.time / (365 * DAY));
  if (h === 'smoking') return age < 14 || age > 40 ? 0 : (-Math.log(Math.max(0.05, 1 - Math.min(0.9, p * 1.3))) / 130) * (age > 25 ? 0.15 : 1) * Math.pow(tobaccoDuty(w.nations[c.nation]), -0.6) * Math.pow(0.98, years);
  const stress = c.life?.stress ?? 25;
  const push = (1 + Math.max(0, stress - 40) / 20) * (griefOf(w, c) > 8 ? 2 : 1);
  if (h === 'drinking') return age < 16 ? 0 : (p / 300) * push;
  if (h === 'gambling') return age < 18 ? 0 : (p / 300) * (0.5 + c.traits.risk);
  return age < 10 || age > 40 ? 0 : p / 120;
}

export function habitsMonth(w: World) {
  seed(w);
  for (const c of census(w).all) {
    if (c.gone || ageOf(w, c) < 14) continue;
    const n = w.nations[c.nation];
    if (!n) continue;
    for (const h of HABIT_KEYS) {
      const s = c.habits?.[h];
      if (!s) {
        if (!c.player && !banned(n, h) && chance(w, startHazard(w, c, h))) begin(w, c, h, 10 + next(w) * 15);
        continue;
      }
      if (s.quit != null) {
        const months = (w.time - s.quit) / (30 * DAY);
        const hard = (c.life?.stress ?? 25) > 55 ? 1.5 : 1;
        if (chance(w, RELAPSE[h] * Math.exp(-months / 3) * hard * (s.helped ? 0.55 : 1) * (s.level >= 50 ? 1 : 0.6))) {
          delete s.quit;
          s.level = Math.max(s.level, 35);
          if (c.player) notify(w, 'personal', `${HABITS[h].icon} You have started ${h === 'gaming' ? 'gaming' : h} again. Most people need several tries; next time may be the one.`, { link: 'life' });
        } else if (months >= 12) {
          const was = s.level;
          delete c.habits![h];
          if (was >= 50) shape(w, c, 'activity', 0.03, `beating ${h === 'smoking' ? 'nicotine' : h === 'drinking' ? 'drink' : h}`);
          if (c.player) notify(w, 'personal', `${HABITS[h].icon} A year without ${h}: the habit is behind you.`, { link: 'life' });
        }
        continue;
      }
      // The habit drifts towards the person's own pull, and costs money.
      s.level = Math.round(Math.max(1, Math.min(100, s.level + (setPoint(w, c, h) - s.level) * 0.1 + (next(w) - 0.5) * 6)));
      payFor(w, c, h, monthlyCost(w, c, h, s.level));
      if (s.level < 3 && h !== 'smoking') { delete c.habits![h]; continue; } // drifted away from it
      // Harm beyond health: jobs lost to drink, families strained.
      if (h === 'drinking' && s.level >= 60 && c.job != null && !c.player && chance(w, 0.012)) quitJob(w, c, true);
      if ((h === 'drinking' || h === 'gambling') && s.level >= 60) {
        const partner = c.family?.partner != null ? w.citizens[c.family.partner] : null;
        if (partner && !partner.gone) partner.rel[c.id] = Math.max(-100, (partner.rel[c.id] ?? 0) - 1.5);
      }
      // Trying to quit (the player decides for themselves).
      if (!c.player && chance(w, QUIT[h] * (h === 'smoking' ? Math.pow(tobaccoDuty(n), 0.5) : 1) * ((c.health ?? 90) < 60 ? 2 : 1) * (s.level >= 50 ? 0.8 : 1.3))) {
        s.quit = w.time;
        s.tries = (s.tries ?? 0) + 1;
        s.helped = chance(w, 0.3);
      }
    }
    if (c.habits && !Object.keys(c.habits).length) delete c.habits;
  }
}

function nationsYear(w: World) {
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null || n.president === pl.id) continue;
    // Governments raise tobacco duty over the years (faster where health care is public and money is tight).
    if (chance(w, 0.3)) n.tobacco = Math.round(tobaccoDuty(n) * (1.05 + next(w) * 0.1) * 100) / 100;
  }
}

/** Raise tobacco duty by a quarter (the head of government): fewer start, more quit; smokers are not pleased. */
export function raiseTobaccoDuty(w: World, c: Citizen = player(w)): Result {
  const n = w.nations[c.nation];
  if (n.president !== c.id) return fail('Only the head of government can do this.');
  n.tobacco = Math.round(tobaccoDuty(n) * 1.25 * 100) / 100;
  n.approval = Math.max(5, n.approval - 1);
  record(w, 'politics', `🚬 ${n.name} raised tobacco duty by a quarter.`, { nation: n.id });
  return ok(`🚬 Tobacco duty up by a quarter: a pack now costs ${fmtAmt(n.cur, prices(w, n).pack)}.`);
}

// ---------- the player's choices ----------

const LEGAL_AGE: Record<Habit, number> = { smoking: 18, drinking: 18, gambling: 18, gaming: 0 };
export function indulgeCheck(w: World, c: Citizen, h: Habit): string | null {
  if (c.gone) return 'No longer living.';
  const n = w.nations[c.nation];
  if (banned(n, h)) return `${HABITS[h].label} is against the law in ${n.name}.`;
  if (ageOf(w, c) < LEGAL_AGE[h]) return `You are too young.`;
  if (jailed(w, c) && h !== 'smoking') return 'Not in prison.';
  if (c.habitDay?.[h] === dayOf(w.time)) return 'Enough for today.';
  if (h === 'gaming' && c.energy < 10) return 'Too tired.';
  const cost = h === 'smoking' ? prices(w, n).pack : h === 'drinking' ? prices(w, n).drink * 3 : 0;
  if ((c.wallet[n.cur] ?? 0) < cost) return `That costs ${fmtAmt(n.cur, cost)}.`;
  return null;
}
/** A smoke, a night out drinking, an evening of games: a little happier and calmer now; the habit grows. */
export function indulge(w: World, c: Citizen = player(w), h: Habit = 'drinking'): Result {
  const why = indulgeCheck(w, c, h);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  (c.habitDay ??= {})[h] = dayOf(w.time);
  const cost = h === 'smoking' ? prices(w, n).pack : h === 'drinking' ? prices(w, n).drink * 3 : 0;
  if (cost) payFor(w, c, h, cost);
  const s = c.habits?.[h];
  const relapse = s?.quit != null;
  if (!s) begin(w, c, h, 8); else { delete s.quit; s.level = Math.min(100, s.level + (relapse ? 10 : 2)); }
  const L = lifeOf(c);
  L.happiness = Math.min(100, L.happiness + 1.5);
  L.stress = Math.max(0, L.stress - 3);
  if (h === 'gaming') c.energy = Math.max(0, c.energy - 10);
  const what = h === 'smoking' ? 'You light up' : h === 'drinking' ? 'A night out drinking' : h === 'gaming' ? 'An evening of games' : 'A flutter';
  return ok(`${HABITS[h].icon} ${what}${relapse ? ', and the craving is back' : ''}. ${active(c, h) >= 50 ? `You are ${HABITS[h].levels[2]}.` : ''}`.trim());
}
export function quitCheck(w: World, c: Citizen, h: Habit, help: boolean): string | null {
  const s = c.habits?.[h];
  if (!s) return `You have no ${h} habit.`;
  if (s.quit != null) return 'You have already quit.';
  if (help) { const v = visitCost(w, c); if ((c.wallet[v.code] ?? 0) < v.patient) return `Help costs ${fmtAmt(v.code, v.patient)}.`; }
  return null;
}
/** Try to quit (with help from a doctor, about twice as likely to last). */
export function quitHabit(w: World, c: Citizen = player(w), h: Habit = 'smoking', help = false): Result {
  const why = quitCheck(w, c, h, help);
  if (why) return fail(why);
  const s = c.habits![h]!;
  if (help) { const v = visitCost(w, c); if (v.patient) pay(w, cref(c.id), natref(v.nation), v.code, v.patient, `Help to stop ${h}`); }
  s.quit = w.time;
  s.tries = (s.tries ?? 0) + 1;
  s.helped = help;
  return ok(`${HABITS[h].icon} You are stopping ${h}${help ? ` with ${HABITS[h].help}` : ', on your own'}. The first weeks are the hardest${s.tries > 1 ? `; this is try number ${s.tries}` : ''}.`);
}

export const STAKES = [5, 20, 100];
export function betCheck(w: World, c: Citizen, stake: number): string | null {
  const n = w.nations[c.nation];
  if (banned(n, 'gambling')) return `Gambling is against the law in ${n.name}.`;
  if (ageOf(w, c) < 18) return 'You are too young.';
  if (jailed(w, c)) return 'Not in prison.';
  if ((c.wallet[n.cur] ?? 0) < stake) return `You do not have ${fmtAmt(n.cur, stake)}.`;
  if ((c.betsToday?.day === dayOf(w.time) ? c.betsToday.n : 0) >= 5) return 'The bookmaker is closed for you today.';
  return null;
}
/** Place a bet: a little under even odds of doubling the stake, a rare long shot; the house always wins in the end. */
export function placeBet(w: World, c: Citizen = player(w), stake = cur(2)): Result {
  const why = betCheck(w, c, stake);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  const d = dayOf(w.time);
  c.betsToday = { day: d, n: (c.betsToday?.day === d ? c.betsToday.n : 0) + 1 };
  pay(w, cref(c.id), hhref(n.id), n.cur, stake, 'Bet');
  const r = next(w);
  const mult = r < 0.003 ? 25 : r < 0.43 ? 2 : 0;
  const s = c.habits?.gambling;
  if (!s) begin(w, c, 'gambling', 5); else { delete s.quit; s.level = Math.min(100, s.level + 2); }
  if (mult) {
    const win = stake * mult;
    if (!pay(w, hhref(n.id), cref(c.id), n.cur, win, 'Winnings')) return ok('🎰 You won, but the bookmaker could not pay out.');
    return ok(`🎰 ${mult > 2 ? 'A long shot comes in!' : 'You win.'} ${fmtAmt(n.cur, win)} back on a ${fmtAmt(n.cur, stake)} stake.`);
  }
  return ok(`🎰 You lose ${fmtAmt(n.cur, stake)}.`);
}

// ---------- statistics ----------

export function habitStats(w: World, nid: Id) {
  let adults = 0, men = 0, women = 0, smokeM = 0, smokeF = 0, heavy = 0, dependent = 0, gambling = 0, gaming = 0;
  for (const c of citizensOf(w, nid)) {
    if (c.gone || ageOf(w, c) < 18) continue;
    adults++;
    const male = sexOf(w, c) === 'm';
    if (male) men++; else women++;
    if (active(c, 'smoking') > 0) { if (male) smokeM++; else smokeF++; }
    const d = active(c, 'drinking');
    if (d >= 30) heavy++;
    if (d >= 50) dependent++;
    if (active(c, 'gambling') >= 50) gambling++;
    if (active(c, 'gaming') >= 50) gaming++;
  }
  const a = Math.max(1, adults);
  return { adults, smokersMen: smokeM / Math.max(1, men), smokersWomen: smokeF / Math.max(1, women), heavyDrinking: heavy / a, alcoholDependence: dependent / a, problemGambling: gambling / a, gamingDisorder: gaming / a };
}

export function habitsDaily(w: World) {
  if (w.habitsSeeded == null) seed(w); // the world as it stands at the start
  if (dateAt(w.time).day !== 1) return;
  habitsMonth(w);
  if (dateAt(w.time).month === 0) for (let k = 0; k < historyPace(w); k++) nationsYear(w);
}
