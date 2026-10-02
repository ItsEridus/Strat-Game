// The everyday (2.8 Life 2.0): a day planner, sleep, and getting to work.
// - The day planner lays a person's day out hour by hour: sleep, the commute, the work shift,
//   classes, family, a hobby, rest. What does not fit shows as a clash.
// - Sleep: everyone chooses (or keeps) a bedtime and how long they sleep. Adults need about seven
//   to nine hours; too little raises stress and wears health down, a good night's sleep helps.
// - Commuting: how long it takes to get from home to work depends on where the work is (the same
//   region, the next one, or further), how you travel (on foot or by bike, public transport, or a
//   car) and the country: Japan, Korea and Germany have fast, dense public transport; American,
//   Saudi and Australian cities are built for cars; traffic is heaviest in India, Brazil and
//   Turkey. A long commute is a daily strain. Public transport costs a fare (from about 20 US cents
//   a trip in India to $3 in Germany and Australia), paid monthly.
import type { Citizen, Id, World } from './types';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur } from '../engine/money';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { cref, hhref, player } from './query';
import { routineOf } from './lifecycle';

export type Mode = 'walk' | 'transit' | 'car';
/** A car someone owns (bought, running costs and accidents: sim/cars.ts). */
export interface Car { model: string; bought: number; price: number; value: number; tier: number }
export const MODE_LABEL: Record<Mode, string> = { walk: 'on foot or by bike', transit: 'by public transport', car: 'by car' };

/** 2025: a public-transport fare (US dollars), how good public transport is (0–1), cars per person, traffic (1 = free-flowing). */
const TRANSPORT_2025: Record<string, [number, number, number, number]> = {
  USA: [2.75, 0.35, 0.85, 1.0], CAN: [3.3, 0.5, 0.7, 1.0], MEX: [0.5, 0.5, 0.3, 1.4], BRA: [1, 0.5, 0.25, 1.5], ARG: [0.3, 0.55, 0.32, 1.3],
  GBR: [2.5, 0.75, 0.52, 1.2], DEU: [3, 0.8, 0.58, 1.1], RUS: [0.7, 0.8, 0.33, 1.4], TUR: [0.5, 0.6, 0.18, 1.4], SAU: [1, 0.2, 0.4, 1.2],
  ZAF: [1, 0.3, 0.18, 1.3], IND: [0.2, 0.4, 0.03, 1.7], CHN: [0.4, 0.75, 0.22, 1.4], JPN: [1.5, 0.95, 0.62, 1.1], KOR: [1, 0.9, 0.5, 1.2], AUS: [3, 0.5, 0.75, 1.1],
};
export const transportOf = (w: World, nation: Id) => { const d = TRANSPORT_2025[dataIso(w.nations[nation].iso)] ?? [1, 0.5, 0.3, 1.2]; return { fare: d[0], quality: d[1], cars: d[2], traffic: d[3] }; };

// ---------- the commute ----------

/** Where someone works (a region), if anywhere. */
export function workRegion(w: World, c: Citizen): Id | null {
  if (c.job != null && w.companies[c.job]) return w.companies[c.job].region;
  if (c.post) return c.post.region;
  if (c.business) return c.business.region;
  return null;
}
/** Does someone have a car (2.8: real cars come with the next part; until then, by country). */
export const hasCar = (w: World, c: Citizen) => c.car != null || (!c.player && hash01(c.id, 3001) < transportOf(w, c.nation).cars);
/** How someone gets to work: their choice, or what people like them do. */
export function modeOf(w: World, c: Citizen): Mode {
  if (c.commute && (c.commute !== 'car' || hasCar(w, c))) return c.commute;
  const wr = workRegion(w, c);
  if (hasCar(w, c) && transportOf(w, c.nation).quality < 0.7 + hash01(c.id, 3002) * 0.3) return 'car';
  return wr === c.home && hash01(c.id, 3003) < 0.4 ? 'walk' : 'transit';
}
export type Reach = 'none' | 'local' | 'near' | 'far';
export function reachOf(w: World, c: Citizen): Reach {
  const wr = workRegion(w, c);
  if (wr == null) return 'none';
  if (wr === c.home) return 'local';
  return w.regions[c.home].links.includes(wr) ? 'near' : 'far';
}
/** Minutes each way. */
export function commuteMinutes(w: World, c: Citizen, mode = modeOf(w, c)): number {
  const reach = reachOf(w, c);
  if (reach === 'none') return 0;
  const t = transportOf(w, c.nation);
  if (reach === 'far') return mode === 'car' ? Math.round(110 * t.traffic) : 120;
  if (reach === 'local') return Math.round(mode === 'walk' ? 25 : mode === 'transit' ? 20 + 25 * (1 - t.quality) : 15 * t.traffic);
  return Math.round(mode === 'walk' ? 90 : mode === 'transit' ? 40 + 40 * (1 - t.quality) : 35 * t.traffic);
}
/** A month of fares (about 21 working days, there and back). */
export const monthlyFares = (w: World, c: Citizen) => (modeOf(w, c) === 'transit' && reachOf(w, c) !== 'none' ? Math.round((cur(transportOf(w, c.nation).fare) / 10) * 42) : 0);

export function setCommute(w: World, mode: Mode, c: Citizen = player(w)): Result {
  if (mode === 'car' && !hasCar(w, c)) return fail('You need a car.');
  if (mode === 'walk' && reachOf(w, c) === 'far') return fail('Too far to walk.');
  c.commute = mode;
  return ok(`You will travel to work ${MODE_LABEL[mode]}: about ${commuteMinutes(w, c, mode)} minutes each way.`);
}

// ---------- sleep ----------

export interface Sleep { bed: number; hours: number }
/** Bedtime and hours of sleep (the player's choice; for others, their habit). */
export function sleepOf(w: World, c: Citizen): Sleep {
  if (c.sleep) return c.sleep;
  const h = hash01(c.id, 3004);
  const commute = commuteMinutes(w, c) / 60;
  return { bed: 22 + Math.floor(h * 3), hours: Math.round((8.2 - h * 1.6 - Math.max(0, commute - 0.75) * 0.8) * 2) / 2 };
}
export function setSleep(w: World, bed: number, hours: number, c: Citizen = player(w)): Result {
  if (hours < 4 || hours > 11 || bed < 0 || bed > 23) return fail('That is not a night\'s sleep.');
  c.sleep = { bed, hours };
  return ok(`Bed at ${String(bed).padStart(2, '0')}:00, ${hours} hours of sleep.`);
}
export const sleepLabel = (h: number) => (h < 6 ? 'not enough sleep' : h < 7 ? 'a little short of sleep' : h <= 9 ? 'well rested' : 'sleeping long');

/** The everyday in the reckoning of happiness and stress (sim/wellbeing.ts). */
export function everydayParts(w: World, c: Citizen): { happy: [string, number][]; stress: [string, number][] } {
  const happy: [string, number][] = [], stress: [string, number][] = [];
  const s = sleepOf(w, c);
  if (s.hours < 6) { stress.push(['not enough sleep', 10]); happy.push(['tiredness', -4]); }
  else if (s.hours < 7) stress.push(['a little short of sleep', 4]);
  else if (s.hours <= 9) stress.push(['a good night\'s sleep', -3]);
  const m = commuteMinutes(w, c);
  if (m >= 30) { stress.push([`a ${m}-minute commute`, Math.min(10, Math.round(m / 15))]); happy.push(['commuting', -Math.min(6, Math.round(m / 25))]); }
  return { happy, stress };
}
/** Health lost to short sleep (sim/population.ts). */
export const sleepToll = (w: World, c: Citizen) => Math.max(0, 7 - sleepOf(w, c).hours) * 3;

// ---------- the day planner ----------

export interface Block { from: number; to: number; what: string; icon: string; kind: string }
/** The player's day, hour by hour (hours may run past midnight: 23 to 30 is 23:00 to 06:00). */
export function dayPlan(w: World, c: Citizen = player(w)): { blocks: Block[]; clashes: string[] } {
  const r = routineOf(w);
  const blocks: Block[] = [];
  const s = sleepOf(w, c);
  blocks.push({ from: s.bed, to: s.bed + s.hours, what: `Sleep (${s.hours} h)`, icon: '😴', kind: 'sleep' });
  const work = r.work && workRegion(w, c) != null;
  if (work) {
    const m = commuteMinutes(w, c) / 60;
    if (m > 0) blocks.push({ from: c.workHour - m, to: c.workHour, what: `Commute ${MODE_LABEL[modeOf(w, c)]}`, icon: modeOf(w, c) === 'car' ? '🚗' : modeOf(w, c) === 'transit' ? '🚇' : '🚲', kind: 'commute' });
    blocks.push({ from: c.workHour, to: c.workHour + 8, what: 'Work', icon: '💼', kind: 'work' });
    if (m > 0) blocks.push({ from: c.workHour + 8, to: c.workHour + 8 + m, what: 'Commute home', icon: modeOf(w, c) === 'car' ? '🚗' : modeOf(w, c) === 'transit' ? '🚇' : '🚲', kind: 'commute' });
  }
  if (r.school) blocks.push({ from: 9, to: 16, what: 'Classes', icon: '📚', kind: 'school' });
  if (r.train) blocks.push({ from: c.trainHour, to: c.trainHour + 1, what: 'Training', icon: '🏋️', kind: 'train' });
  blocks.push({ from: 12.5, to: 13, what: 'Lunch', icon: '🥪', kind: 'meal' }, { from: 18.5, to: 19, what: 'Dinner', icon: '🍽️', kind: 'meal' });
  if (r.family) blocks.push({ from: 19, to: 21, what: 'Family time', icon: '👪', kind: 'family' });
  if (r.hobby) blocks.push({ from: 20, to: 22, what: 'Hobby', icon: '🎯', kind: 'hobby' });
  if (r.rest) blocks.push({ from: 21, to: 22, what: 'Rest', icon: '🛋️', kind: 'rest' });
  blocks.sort((a, b) => a.from - b.from);
  // Clashes: overlaps (the 24-hour clock wraps).
  const clashes: string[] = [];
  const norm = (b: Block) => [((b.from % 24) + 24) % 24, ((b.from % 24) + 24) % 24 + (b.to - b.from)] as const;
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const [a0, a1] = norm(blocks[i]), [b0, b1] = norm(blocks[j]);
    const over = Math.min(a1, b1) - Math.max(a0, b0) > 0.01 || Math.min(a1, b1 + 24) - Math.max(a0, b0 + 24) > 0.01 || Math.min(a1 + 24, b1) - Math.max(a0 + 24, b0) > 0.01;
    if (over && blocks[i].kind !== 'meal' && blocks[j].kind !== 'meal') clashes.push(`${blocks[i].what} and ${blocks[j].what.toLowerCase()} overlap.`);
  }
  return { blocks, clashes };
}

// ---------- monthly ----------

/** A month of fares for everyone who commutes by public transport. */
export function everydayMonth(w: World) {
  for (const c of census(w).all) {
    if (c.gone) continue;
    const fare = monthlyFares(w, c);
    if (!fare) continue;
    const n = w.nations[c.nation];
    pay(w, cref(c.id), hhref(n.id), n.cur, Math.min(fare, Math.floor((c.wallet[n.cur] ?? 0) * 0.2)), 'Public transport');
  }
}
export function everydayDaily(w: World) {
  if (dateAt(w.time).day === 1) everydayMonth(w);
}
