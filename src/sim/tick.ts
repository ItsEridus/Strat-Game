// The simulation loop. Time advances only here, in 10-minute ticks. Scheduled
// events fire in (time, sequence) order, then per-tick, hourly and daily rules
// run. Advancing N days in one call processes exactly the same steps as N
// separate one-day calls, so results do not depend on how time is advanced.
import { routineOf } from './lifecycle';
import type { World } from './types';
import { B } from '../data/balance';
import { DAY, HOUR, TICK, dayOf, hourOf } from '../engine/clock';
import { pauseRequest } from '../engine/events';
import { regenTick } from './citizen';
import { closeCompanyDay } from './company';
import { checkProgress, rollDailies } from './quests';
import { citizenHourly } from '../ai/citizens';
import { centralBank, circulation, entrepreneurship, householdsDaily, manageCompany } from '../ai/economy';
import { player } from './query';
import { train } from './citizen';
import { HANDLERS, dailyHooks, hourlyHooks, tickHooks } from './hooks';
import { census, nationals, referenceSociety } from './census';

function runQueue(w: World) {
  while (w.queue.length && w.queue[0].at <= w.time) {
    const ev = w.queue.shift()!;
    const h = HANDLERS[ev.type];
    if (h) h(w, ev.p);
  }
}

// The player (and anyone fighting) recovers every tick; the rest of society in
// hourly steps, which is the same amount of energy for a fraction of the work.
function tick10(w: World) {
  const p = player(w);
  if (p) regenTick(w, p);
  for (const f of tickHooks) f(w);
}

/**
 * Level of detail: during long advances (a week or more at once), people in other countries recover energy in one
 * daily step, and are only visited in the hours when they act (work, training, project work, shopping, savings).
 * What they do is the same; only the bookkeeping is coarser. The player's own country is always simulated in full.
 */
/** coarse: long advances; local: only the player's own region in full (top speed and skipping a year). */
export const lod = { coarse: false, local: false };
const acts = (c: { workHour: number; trainHour: number }, h: number) => h === c.workHour || h === c.trainHour || h === (c.trainHour + 2) % 24 || h === 18 || h === 20;

/** Who acts in each hour of the day (rebuilt daily): their work, training, project and evening hours. */
const ACT = new WeakMap<World, { day: number; byHour: import('./types').Citizen[][] }>();
function actingAt(w: World, h: number) {
  const d = dayOf(w.time);
  let x = ACT.get(w);
  if (!x || x.day !== d) {
    x = { day: d, byHour: Array.from({ length: 24 }, () => []) };
    for (const c of census(w).all) { if (c.player) continue; for (let k = 0; k < 24; k++) if (acts(c, k)) x.byHour[k].push(c); }
    ACT.set(w, x);
  }
  return x.byHour[h];
}

function hourly(w: World) {
  const h = hourOf(w.time);
  const p0 = player(w);
  const home = lod.coarse ? p0?.nation : -1;
  const full = (c: { nation: number; loc: number }) => !lod.coarse || (lod.local ? c.loc === p0?.loc : c.nation === home);
  if (!lod.coarse) {
    for (const c of census(w).all) if (!c.player) regenTick(w, c, 6);
    for (const c of census(w).all) if (w.citizens[c.id] && !c.player) citizenHourly(w, c);
  } else {
    // Coarse: people outside full detail recover in one daily step and are visited only in the hours they act.
    const cs = census(w);
    const near = (lod.local ? cs.byLoc.get(p0?.loc ?? -1) : cs.byNation.get(home ?? -1)) ?? [];
    if (h === 0) for (const c of cs.all) if (!c.player && !full(c)) regenTick(w, c, 144);
    for (const c of near) if (!c.player) regenTick(w, c, 6);
    const due = actingAt(w, h).filter((c) => !full(c));
    const todo = [...near.filter((c) => !c.player), ...due].sort((a, b) => a.id - b.id);
    for (const c of todo) if (w.citizens[c.id] && !c.gone) citizenHourly(w, c);
  }
  if (h === 5) for (const co of Object.values(w.companies).sort((a, b) => a.id - b.id)) manageCompany(w, co);
  if (h === 12 || h === 19) householdsDaily(w, h === 12 ? 0 : 1);
  if (h === 7) entrepreneurship(w);
  if (h === 6) centralBank(w);
  const p = player(w);
  if (routineOf(w).train && h === p.trainHour && p.lastTrainDay !== dayOf(w.time) && p.energy >= B.cost.train) train(w, p);
  for (const f of hourlyHooks) f(w);
  checkProgress(w);
}

function daily(w: World) {
  closeCompanyDay(w);
  circulation(w);
  for (const c of census(w).all) { c.lastIncome = c.incomeToday; c.incomeAvg = Math.round((c.incomeAvg ?? c.incomeToday) * 0.967 + c.incomeToday * 0.033); c.incomeToday = 0; }
  // A region absorbs pollution in proportion to its population and to the size of the national
  // economy (more citizens run more companies than the 24-citizen economy the capacity was set for).
  // Sparsely populated regions absorb at least as much as the nation's average region.
  const econScale = w.nations.map((n) => Math.max(1, (nationals(w, n.id).length / referenceSociety(n.id)) * B.population.companiesPerCitizen));
  const meanPop = w.nations.map((n) => { const own = w.regions.filter((r) => r.owner === n.id); return own.reduce((t, r) => t + r.pop, 0) / Math.max(1, own.length); });
  for (const r of w.regions) {
    r.prodWindow.push(0);
    while (r.prodWindow.length > B.pollution.windowDays) r.prodWindow.shift();
    const cap = Math.max(r.pop, meanPop[r.owner]) * B.pollution.capacityPerPop * econScale[r.owner] * (1 + r.bld.industrial * B.pollution.industrialMitigation);
    const load = r.prodWindow.reduce((a, b) => a + b, 0);
    r.pollution = Math.max(0, Math.min(1, cap > 0 ? load / cap - 0.5 : 1));
  }
  for (const n of w.nations) {
    n.stats.revHist.push(n.stats.revToday);
    if (n.stats.revHist.length > 30) n.stats.revHist.shift();
    n.stats.spendHist.push(n.stats.spendToday);
    if (n.stats.spendHist.length > 30) n.stats.spendHist.shift();
    n.stats.revenue += n.stats.revToday;
    n.stats.spending += n.stats.spendToday;
    n.stats.revToday = 0;
    n.stats.spendToday = 0;
  }
  rollDailies(w);
  for (const f of dailyHooks) f(w);
}

/** Advance exactly one tick. */
export function step(w: World) {
  w.time += TICK;
  runQueue(w);
  tick10(w);
  if (w.time % HOUR === 0) hourly(w);
  if (w.time % DAY === 0) daily(w);
}

/**
 * Advance up to `minutes` of simulated time. Stops early when a notification in a
 * pausing category fires (if `respectPause`). Returns minutes actually advanced.
 */
export function advance(w: World, minutes: number, respectPause = true): { advanced: number; stopped: boolean } {
  const target = w.time + minutes;
  if (minutes >= 7 * DAY) lod.coarse = true;
  try { return advanceSteps(w, target, respectPause); } finally { if (minutes >= 7 * DAY) lod.coarse = false; }
}
function advanceSteps(w: World, target: number, respectPause: boolean): { advanced: number; stopped: boolean } {
  pauseRequest.flag = false;
  let advanced = 0;
  while (w.time + TICK <= target) {
    step(w);
    advanced += TICK;
    if (respectPause && pauseRequest.flag) { pauseRequest.flag = false; return { advanced, stopped: true }; }
  }
  return { advanced, stopped: false };
}

/** Advance until simulated time reaches `t` (rounded up to a tick). */
export function advanceTo(w: World, t: number, respectPause = true) {
  const minutes = Math.max(0, Math.ceil((t - w.time) / TICK) * TICK);
  return advance(w, minutes, respectPause);
}
