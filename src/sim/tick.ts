// The simulation loop. Time advances only here, in 10-minute ticks. Scheduled
// events fire in (time, sequence) order, then per-tick, hourly and daily rules
// run. Advancing N days in one call processes exactly the same steps as N
// separate one-day calls, so results do not depend on how time is advanced.
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

function runQueue(w: World) {
  while (w.queue.length && w.queue[0].at <= w.time) {
    const ev = w.queue.shift()!;
    const h = HANDLERS[ev.type];
    if (h) h(w, ev.p);
  }
}

function tick10(w: World) {
  for (const id in w.citizens) regenTick(w, w.citizens[id]);
  for (const f of tickHooks) f(w);
}

function hourly(w: World) {
  const h = hourOf(w.time);
  const ids = Object.keys(w.citizens).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    const c = w.citizens[id];
    if (c && !c.player) citizenHourly(w, c);
  }
  if (h === 5) for (const co of Object.values(w.companies).sort((a, b) => a.id - b.id)) manageCompany(w, co);
  if (h === 12 || h === 19) householdsDaily(w, h === 12 ? 0 : 1);
  if (h === 7) entrepreneurship(w);
  if (h === 6) centralBank(w);
  const p = player(w);
  if (w.settings.autoTrain && h === p.trainHour && p.lastTrainDay !== dayOf(w.time) && p.energy >= B.cost.train) train(w, p);
  for (const f of hourlyHooks) f(w);
  checkProgress(w);
}

function daily(w: World) {
  closeCompanyDay(w);
  circulation(w);
  for (const c of Object.values(w.citizens)) { c.lastIncome = c.incomeToday; c.incomeToday = 0; }
  for (const r of w.regions) {
    r.prodWindow.push(0);
    while (r.prodWindow.length > B.pollution.windowDays) r.prodWindow.shift();
    const cap = r.pop * B.pollution.capacityPerPop * (1 + r.bld.industrial * B.pollution.industrialMitigation);
    const load = r.prodWindow.reduce((a, b) => a + b, 0);
    r.pollution = Math.max(0, Math.min(1, cap > 0 ? load / cap - 0.5 : 1));
  }
  for (const n of w.nations) {
    n.stats.revHist.push(n.stats.revToday);
    if (n.stats.revHist.length > 30) n.stats.revHist.shift();
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
