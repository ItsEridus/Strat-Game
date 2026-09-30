// Simulation clock. Time is integer minutes since day 0 00:00. The engine steps in
// 10-minute ticks; hourly and daily processing hang off tick boundaries.
import { fmtDate, fmtTime } from './calendar';
import type { World } from '../sim/types';

export const TICK = 10;
export const HOUR = 60;
export const DAY = 1440;

export const dayOf = (t: number) => Math.floor(t / DAY);
export const hourOf = (t: number) => Math.floor((t % DAY) / HOUR);
export const minuteOfDay = (t: number) => t % DAY;

export function monthOf(w: World, t = w.time) {
  const d = Math.max(0, dayOf(t) - 1); // day 1 is the first day of month 1
  const len = w.settings.monthLen;
  return { month: Math.floor(d / len) + 1, dom: (d % len) + 1 };
}

/** Date and time for logs and panels, e.g. "Tue 14 Mar 2030 · 9:40 am". */
export function fmtClock(w: World, t = w.time): string {
  return `${fmtDate(t, 'medium')} · ${fmtTime(t, !!w.settings.clock24)}`;
}

export function fmtDur(min: number): string {
  if (min <= 0) return 'now';
  const d = Math.floor(min / DAY);
  const h = Math.floor((min % DAY) / HOUR);
  const m = min % 60;
  if (d >= 730) return `${(d / 365).toFixed(1)} years`;
  if (d >= 60) return `${Math.round(d / 30.4)} months`;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export const fmtWhen = (w: World, t: number) => (t >= w.time ? `in ${fmtDur(t - w.time)}` : `${fmtDur(w.time - t)} ago`);

/** Time of the next occurrence of day-of-month `dom` at hour `h` strictly after now. */
export function nextDom(w: World, dom: number, h = 12): number {
  const len = w.settings.monthLen;
  const d = Math.max(0, dayOf(w.time) - 1);
  const start = d - (d % len) + 1;
  let t = (start + dom - 1) * DAY + h * HOUR;
  while (t <= w.time) t += len * DAY;
  return t;
}
