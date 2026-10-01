// Intelligence services as organisations (2.1 Shadows). Each service has eight
// directorates (human, signals, imagery, open sources, cyber, analysis, covert action,
// counter-intelligence) whose strength (0–100) starts from the real service in 2025 and
// then moves, month by month, towards what the country now gives it:
// - money: the intelligence budget, and how the director splits it between directorates;
// - technology: signals, open sources and cyber follow information technology; imagery
//   follows space technology (strategic.ts);
// - people: the citizens who serve in each directorate;
// - experience: failed and exposed operations teach lessons, and the directorate improves
//   faster for a while afterwards (tradecraft learns from failure).
// Operations draw on the directorate that runs them (intel.ts).
import type { Citizen, Id, Nation, OpKind, World } from './types';
import { DIRECTORATES, DIR_INFO, dirBaseline, type Directorate } from '../data/intelServices';
import { B } from '../data/balance';
import { dateAt } from '../engine/calendar';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { capsOf, historyPace } from './strategic';
import { baselineOf } from '../data/nationBaselines';
import { nationPerm } from './authority';
import { hash01 } from '../engine/rng';

export interface ServiceOrg {
  dirs: Record<Directorate, number>;
  split: Record<Directorate, number>; // share of the budget (sums to 1)
  lessons: Record<Directorate, number>; // lessons from failures still being learned
  prev?: Record<Directorate, number>; // last month's strengths (for trends)
  budget0?: number; // the budget the service had when the game began (its strengths assume it)
}
const even = (): Record<Directorate, number> => Object.fromEntries(DIRECTORATES.map((d) => [d, 1 / DIRECTORATES.length])) as Record<Directorate, number>;

export function orgOf(n: Nation): ServiceOrg {
  if (n.agency.org) return n.agency.org;
  const base = dirBaseline(n.iso);
  n.agency.org = { dirs: { ...base }, split: even(), lessons: Object.fromEntries(DIRECTORATES.map((d) => [d, 0])) as Record<Directorate, number> };
  return n.agency.org;
}
export const dirStrength = (n: Nation, d: Directorate) => orgOf(n).dirs[d];

/** The directorate that runs each kind of operation. */
export const OP_DIR: Record<OpKind, Directorate> = {
  intel: 'analysis', sabotage: 'covert', theft: 'cyber', unrest: 'covert', propaganda: 'covert', scandal: 'covert',
  recruit: 'humint', counter: 'counter', milintel: 'imagery', milsabotage: 'covert', cyber: 'cyber',
};

/** How much a directorate adds to an operation's odds (−0.2 .. +0.2 around an average service). */
export const dirEdge = (n: Nation, kind: OpKind) => (dirStrength(n, OP_DIR[kind]) - 50) / 250;

/** A failure or exposure teaches the directorate a lesson. */
export function noteLesson(n: Nation, d: Directorate, amount = 1) {
  const o = orgOf(n);
  o.lessons[d] = Math.min(5, o.lessons[d] + amount);
}

/** Staff in each directorate. */
export function staffByDir(w: World, nation: Id): Record<Directorate, number> {
  const out = Object.fromEntries(DIRECTORATES.map((d) => [d, 0])) as Record<Directorate, number>;
  for (const c of census(w).all) if (c.sec.agency === nation) out[dirOfAgent(c)]++;
  return out;
}
/** The directorate an officer serves in (chosen, or assigned by a stable draw). */
export function dirOfAgent(c: Citizen): Directorate {
  return c.sec.dir ?? DIRECTORATES[Math.floor(hash01(c.id, 2101, 7) * DIRECTORATES.length)];
}

/** What a directorate is heading towards with today's money, technology and people. */
export function dirTarget(w: World, n: Nation, d: Directorate, staff: Record<Directorate, number>): number {
  const o = orgOf(n);
  const base = dirBaseline(n.iso)[d];
  const money = Math.pow(Math.max(0.05, n.agency.budget / (o.budget0 ?? B.intel.budget)), 0.4) * Math.pow(Math.max(0.2, o.split[d] * DIRECTORATES.length), 0.3);
  const dom = DIR_INFO[d].tech;
  const tech = dom ? Math.pow(capsOf(w, n).tech[dom] / Math.max(1, baselineOf(n.iso).tech[dom]), 0.6) : 1;
  const total = DIRECTORATES.reduce((t, k) => t + staff[k], 0);
  // People: only a service with enough officers to compare its directorates (two each) is judged on them.
  const people = total >= 2 * DIRECTORATES.length ? 0.9 + 0.1 * Math.min(1.5, (staff[d] / total) * DIRECTORATES.length) : 1;
  return Math.max(5, Math.min(100, base * money * tech * people));
}

export function orgMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const o = orgOf(n);
    o.budget0 ??= Math.max(0.005, n.agency.budget);
    const staff = staffByDir(w, n.id);
    o.prev = { ...o.dirs };
    for (const d of DIRECTORATES) {
      const target = dirTarget(w, n, d, staff);
      // Services change slowly: a twentieth of the way each month. Learning from a failure speeds that up
      // and lifts what the directorate can reach, by up to a tenth.
      const learn = Math.min(1, o.lessons[d]);
      const goal = Math.min(100, target * (1 + 0.1 * learn));
      o.dirs[d] = Math.round((o.dirs[d] + (goal - o.dirs[d]) * (0.05 + 0.05 * learn)) * 10) / 10;
      o.dirs[d] = Math.max(0, Math.min(100, o.dirs[d]));
      o.lessons[d] = Math.max(0, o.lessons[d] * 0.7 - 0.1);
    }
  }
}

export function intelOrgDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) orgMonth(w);
}

// ---------- the director's choices ----------

export function setSplit(w: World, actor: Id, nation: Id, split: Partial<Record<Directorate, number>>): Result {
  if (!nationPerm(w, actor, nation, 'intel')) return fail('Only the Director of Intelligence or national leader divides the budget.');
  const o = orgOf(w.nations[nation]);
  const raw = Object.fromEntries(DIRECTORATES.map((d) => [d, Math.max(0, split[d] ?? o.split[d])])) as Record<Directorate, number>;
  const sum = DIRECTORATES.reduce((t, d) => t + raw[d], 0);
  if (sum <= 0) return fail('Give at least one directorate some money.');
  for (const d of DIRECTORATES) o.split[d] = Math.round((raw[d] / sum) * 1000) / 1000;
  return ok('Budget divided between the directorates.');
}
/** Shift a tenth of the budget towards one directorate (from the others, evenly). */
export function prioritise(w: World, actor: Id, nation: Id, d: Directorate): Result {
  const o = orgOf(w.nations[nation]);
  const next = { ...o.split };
  for (const k of DIRECTORATES) next[k] = k === d ? next[k] + 0.1 : Math.max(0, next[k] - 0.1 / (DIRECTORATES.length - 1));
  const r = setSplit(w, actor, nation, next);
  return r.ok ? ok(`${DIR_INFO[d].label} now gets ${Math.round(o.split[d] * 100)}% of the budget.`) : r;
}

/** An officer moves to another directorate. */
export function joinDirectorate(w: World, c: Citizen, d: Directorate): Result {
  if (c.sec.agency == null) return fail('Join the intelligence service first.');
  if (c.sec.dir === d) return fail(`You already serve in ${DIR_INFO[d].label.toLowerCase()}.`);
  c.sec.dir = d;
  return ok(`You transferred to the ${DIR_INFO[d].label.toLowerCase()} directorate.`);
}
