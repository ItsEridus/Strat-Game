// How people grow. There are no levels or experience points: a citizen gets
// better at what they actually do (training builds strength and endurance, shifts
// build economic aptitude, leading a team builds leadership, fighting builds
// accuracy…), with diminishing returns and the young learning fastest. What
// opens doors is who you are in the world: your age, your record, your
// reputation (influence and fame), your years of service. Used identically for
// the player and AI citizens.
import { learnFactor } from './nature';
import { calendarAge, dateAt, nextAnniversary, timeOfDate } from '../engine/calendar';
import type { Attr, Citizen, World } from './types';
import { B } from '../data/balance';
import { DAY } from '../engine/clock';
import { notify } from '../engine/events';

/**
 * Length of a life year in world time. Each campaign sets its pace of life
 * (Settings.lifeYearDays): the economy and politics keep their calendar, while
 * people age one year every `lifeYearDays` days, so a whole life (and the next
 * generation) fits in a campaign. Saves from before this setting use 365.
 */
export const lifeYear = (w: World) => (w.settings.lifeYearDays ?? 365) * DAY;

/** Is the pace of life the calendar's own (a year of age per calendar year)? */
export const calendarPace = (w: World) => (w.settings.lifeYearDays ?? 365) === 365;

/**
 * Age in whole years. At the calendar pace, ages and birthdays follow real dates
 * (leap years included); at a faster pace, a year of age is `lifeYearDays` days.
 * Negative birth times are people born before the campaign began.
 */
export const ageOf = (w: World, c: { born: number }) => (calendarPace(w) ? calendarAge(c.born, w.time) : Math.floor((w.time - c.born) / lifeYear(w)));
/** Exact age in years (fractional). */
export const ageExact = (w: World, c: { born: number }) => (w.time - c.born) / lifeYear(w);
/**
 * The birth time of someone who is `years` old today and had their last birthday
 * `sinceBirthday` days ago (0 = today is their birthday). Exact under the calendar
 * (leap years) and at any pace of life.
 */
export function bornYearsAgo(w: World, years: number, sinceBirthday = 0): number {
  if (!calendarPace(w)) return w.time - years * lifeYear(w) - Math.min(sinceBirthday, (w.settings.lifeYearDays ?? 365) - 1) * DAY;
  const last = w.time - Math.min(sinceBirthday, 364) * DAY; // the date of the last birthday
  const d = dateAt(last);
  const y = d.year - years;
  return timeOfDate(y, d.month, Math.min(d.day, new Date(Date.UTC(y, d.month + 1, 0)).getUTCDate()));
}

/** When someone next has a birthday. */
export const nextBirthday = (w: World, c: { born: number }) => (calendarPace(w) ? nextAnniversary(c.born, w.time) : c.born + (ageOf(w, c) + 1) * lifeYear(w));
export const isAdult = (w: World, c: Citizen) => ageOf(w, c) >= B.life.adultAge;
export const cleanRecord = (c: Citizen) => c.sec.record.convictions === 0;

export const SKILL_HOW: Record<Attr, string> = {
  str: 'training, fighting and hard physical work',
  acc: 'firing in battles and tournaments, police patrols',
  luck: 'taking risks: battles, the underworld, covert work',
  end: 'training, long shifts, volunteering, patrols',
  lead: 'managing staff, rallies, canvassing, writing, commanding',
  eco: 'working shifts and running businesses',
  cons: 'contributing to construction projects',
};

/**
 * Practice: raise a skill by doing. `effort` is roughly one day's worth of the
 * activity; the gain shrinks as the skill grows and with age.
 */
export function practise(w: World, c: Citizen, a: Attr, effort: number) {
  if (effort <= 0) return;
  const age = ageOf(w, c);
  const youth = age < 30 ? 1.2 : age < 50 ? 1 : age < 65 ? 0.75 : 0.5;
  const gain = (effort * B.growth.rate * youth * learnFactor(c, a)) / (1 + c.attrs[a] / B.growth.soft);
  const before = Math.floor(c.attrs[a]);
  c.attrs[a] = Math.round((c.attrs[a] + gain) * 1000) / 1000;
  const after = Math.floor(c.attrs[a]);
  if (c.player && after > before && after % 5 === 0) notify(w, 'progress', `💪 Your ${SKILL_NAME[a].toLowerCase()} has reached ${after} — practice pays off.`, { link: 'character' });
}

export const SKILL_NAME: Record<Attr, string> = { str: 'Strength', acc: 'Accuracy', luck: 'Luck', end: 'Endurance', lead: 'Leadership', eco: 'Economic Aptitude', cons: 'Construction' };

// ---------- reputation ----------

/** How well known and regarded someone is: influence plus fame. */
export const standing = (c: Citizen) => Math.max(0, c.influence + c.sec.fame * 2);

export const REPUTATION: { min: number; name: string; icon: string }[] = [
  { min: 0, name: 'Newcomer', icon: '🌱' },
  { min: 5, name: 'Known on your street', icon: '🏘️' },
  { min: 15, name: 'Known locally', icon: '📍' },
  { min: 35, name: 'Respected', icon: '🤝' },
  { min: 70, name: 'Prominent', icon: '📰' },
  { min: 130, name: 'Renowned', icon: '🏛️' },
  { min: 250, name: 'Famous', icon: '⭐' },
];

export function reputation(c: Citizen) {
  const s = standing(c);
  let i = 0;
  while (i + 1 < REPUTATION.length && s >= REPUTATION[i + 1].min) i++;
  return { tier: i, ...REPUTATION[i], standing: s, next: REPUTATION[i + 1] ?? null };
}

/** Human-readable requirement for a reputation threshold. */
export const repNeed = (min: number) => { const t = [...REPUTATION].reverse().find((x) => x.min <= min)!; return `a reputation of “${t.name}” (standing ${min})`; };

/** Earn standing for a public act (the player sees it on the reputation bar). */
export function gainStanding(c: Citizen, n: number) {
  c.influence = Math.round((c.influence + n) * 100) / 100;
}

/**
 * Experience from years lived: used to give generated citizens skills that
 * match their age (a 55-year-old foreman knows more than an 18-year-old).
 */
export function seniority(w: World, c: Citizen) {
  return Math.max(0, Math.min(40, ageOf(w, c) - B.life.adultAge));
}

/** Days served in the armed forces. */
export const serviceDays = (w: World, c: Citizen) => (c.mil.branch ? Math.floor(((c.mil.reserve ? (c.mil.reserveSince ?? w.time) : w.time) - c.mil.since) / DAY) : 0); // time in the reserve does not count
