// The calendar: world time as real dates. World day 1 is Wednesday 1 January
// 2025 (the present day, so the economy can be anchored to real data); each world day is one calendar day (Gregorian, with leap years). Times
// of day and seasons are descriptive, and seasons follow the hemisphere of the
// place (so it is summer in Sydney when it is winter in Chicago).
import { DAY, dayOf, hourOf } from './clock';

/** Midnight UTC of world day 1. */
export const EPOCH_MS = Date.UTC(2025, 0, 1);
const MS_DAY = 86400000;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const short = (s: string) => s.slice(0, 3);

export interface CalDate { year: number; month: number; day: number; weekday: number; yday: number } // month 0-11, day 1-31, yday 0-365

/** The calendar date of a world time (minutes). Works for times before the campaign began. */
const dateCache = new Map<number, CalDate>();
export function dateAt(t: number): CalDate {
  const k = dayOf(t);
  const hit = dateCache.get(k);
  if (hit) return hit;
  const d = new Date(EPOCH_MS + (k - 1) * MS_DAY);
  const year = d.getUTCFullYear();
  const r: CalDate = Object.freeze({ year, month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay(), yday: Math.round((d.getTime() - Date.UTC(year, 0, 1)) / MS_DAY) });
  if (dateCache.size > 4096) dateCache.clear();
  dateCache.set(k, r);
  return r;
}

/** World time (minutes) at the start of a calendar date. */
export function timeOfDate(year: number, month: number, day: number): number {
  return (Math.round((Date.UTC(year, month, day) - EPOCH_MS) / MS_DAY) + 1) * DAY;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];

// ---------- formatting ----------

/** "Friday, 14 March 2025" / "Fri 14 Mar 2025" / "14 Mar 2025" / "14 March" */
export function fmtDate(t: number, style: 'long' | 'medium' | 'short' | 'dayMonth' = 'short'): string {
  const d = dateAt(t);
  switch (style) {
    case 'long': return `${WEEKDAYS[d.weekday]}, ${d.day} ${MONTHS[d.month]} ${d.year}`;
    case 'medium': return `${short(WEEKDAYS[d.weekday])} ${d.day} ${short(MONTHS[d.month])} ${d.year}`;
    case 'dayMonth': return `${d.day} ${MONTHS[d.month]}`;
    default: return `${d.day} ${short(MONTHS[d.month])} ${d.year}`;
  }
}

/** A date for lists and logs, e.g. "6 Feb 2025". */
export const fmtDay = (t: number) => fmtDate(t, 'short');

/** "9:40 am" (or "09:40" on a 24-hour clock). */
export function fmtTime(t: number, h24 = false): string {
  const h = hourOf(t), m = String(((t % 60) + 60) % 60).padStart(2, '0');
  if (h24) return `${String(h).padStart(2, '0')}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

export const PARTS_OF_DAY: { from: number; name: string; icon: string }[] = [
  { from: 0, name: 'Night', icon: '🌙' },
  { from: 5, name: 'Dawn', icon: '🌅' },
  { from: 7, name: 'Morning', icon: '🌤️' },
  { from: 12, name: 'Midday', icon: '☀️' },
  { from: 14, name: 'Afternoon', icon: '🌤️' },
  { from: 18, name: 'Evening', icon: '🌆' },
  { from: 21, name: 'Late evening', icon: '🌙' },
];

/** The descriptive part of the day at a time. */
export function partOfDay(t: number) {
  const h = hourOf(t);
  let p = PARTS_OF_DAY[0];
  for (const x of PARTS_OF_DAY) if (h >= x.from) p = x;
  return p;
}

// ---------- seasons ----------

export type Season = 'Winter' | 'Spring' | 'Summer' | 'Autumn' | 'Wet season' | 'Dry season';
export const SEASON_ICON: Record<Season, string> = { Winter: '❄️', Spring: '🌱', Summer: '☀️', Autumn: '🍂', 'Wet season': '🌧️', 'Dry season': '🌾' };

/**
 * The season at a time and latitude (degrees, north positive). Temperate
 * seasons follow the meteorological calendar and flip south of the equator;
 * the tropics have a wet and a dry season instead.
 */
export function seasonAt(t: number, lat: number): Season {
  const m = dateAt(t).month;
  if (Math.abs(lat) < 20) {
    const wetNorth = m >= 4 && m <= 9; // May–October in the northern tropics
    return (lat >= 0 ? wetNorth : !wetNorth) ? 'Wet season' : 'Dry season';
  }
  const north: Season[] = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
  const s = north[m];
  if (lat >= 0) return s;
  return ({ Winter: 'Summer', Summer: 'Winter', Spring: 'Autumn', Autumn: 'Spring' } as Record<string, Season>)[s];
}

// ---------- ages and anniversaries ----------

/** Whole years between a birth time and now, by the calendar (birthdays on the date of birth; 29 Feb → 28 Feb). */
export function calendarAge(born: number, now: number): number {
  const b = dateAt(born), n = dateAt(now);
  let age = n.year - b.year;
  const bm = b.month, bd = Math.min(b.day, daysIn(n.year, b.month));
  if (n.month < bm || (n.month === bm && n.day < bd)) age--;
  return age;
}

/** World time of the next birthday after `now` (at midnight of the anniversary date). */
export function nextAnniversary(born: number, now: number): number {
  const b = dateAt(born);
  const age = calendarAge(born, now);
  const y = b.year + age + 1;
  return timeOfDate(y, b.month, Math.min(b.day, daysIn(y, b.month)));
}

