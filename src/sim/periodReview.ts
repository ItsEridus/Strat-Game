// What happened while time was skipped: a summary of a long advance (a year,
// a month) for the player and the world, built from the real records (the
// ledger budget, milestones and the world history), never invented.
import type { World } from './types';
import { dateAt, timeOfDate } from '../engine/calendar';
import { DAY } from '../engine/clock';
import { player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';

export interface PeriodStart { t: number; cash: number; cur: string; age: number; milestones: number; log: number; who: number }
export interface PeriodSummary { from: number; to: number; label: string; you: string[]; world: string[]; seen?: boolean }

/** The same date a year later (29 February becomes 28 February). */
export function oneYearOn(t: number): number {
  const d = dateAt(t);
  const day = d.month === 1 && d.day === 29 ? 28 : d.day;
  return timeOfDate(d.year + 1, d.month, day) + (t % DAY);
}

export function periodStart(w: World): PeriodStart {
  const p = player(w);
  const code = w.nations[p.nation].cur;
  return { t: w.time, cash: p.wallet[code] ?? 0, cur: code, age: ageOf(w, p), milestones: lifeOf(p).milestones.length, log: w.log.length, who: p.id };
}

const TYPES: Record<string, string> = { war: '⚔️ wars and battles', election: '🗳️ elections', people: '🕯️ notable lives', crime: '🚨 crime', crisis: '🌪️ crises and disasters', company: '🏭 business', politics: '🏛️ politics', military: '🎖️ the armed forces', job: '💼 jobs', press: '📰 the press' };

/** Summarise from `s` to now. */
export function periodSummary(w: World, s: PeriodStart, label: string): PeriodSummary {
  const p = player(w);
  const you: string[] = [];
  if (p.id !== s.who) you.push(`🕯️ ${w.citizens[s.who]?.name} died; you carry on as ${p.name}.`);
  const age = ageOf(w, p);
  if (age !== s.age && p.id === s.who) you.push(`🎂 You turned ${age}.`);
  const ms = lifeOf(p).milestones.slice(p.id === s.who ? s.milestones : 0).filter((m) => m.t >= s.t);
  for (const m of ms.slice(-8)) you.push(`⭐ You ${m.text}.`);
  const cash = p.wallet[s.cur] ?? 0;
  const diff = cash - s.cash;
  you.push(`💰 Savings ${diff >= 0 ? 'up' : 'down'} ${(Math.abs(diff) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${s.cur} (now ${(cash / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}).`);
  const events = w.log.filter((e) => e.t >= s.t);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const world: string[] = [];
  for (const e of events.filter((e) => e.important).slice(-10)) world.push(e.text);
  const tallies = [...counts.entries()].filter(([t]) => TYPES[t]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${TYPES[t]}: ${n}`);
  if (tallies.length) world.push(`In the records: ${tallies.join(' · ')}.`);
  if (!world.length) world.push('A quiet stretch for the world.');
  return { from: s.t, to: w.time, label, you, world };
}
