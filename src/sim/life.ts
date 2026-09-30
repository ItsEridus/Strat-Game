// Local life: what people are doing at this hour, the news of each region, and
// people moving house for work. Everything here is derived from the same state
// the rest of the simulation uses (jobs, schedules, prisons, battles, travel).
import type { Citizen, Id, World } from './types';
import { DAY, HOUR } from '../engine/clock';
import { chance, pick } from '../engine/rng';
import { controller, jailed, player, today } from './query';
import { census, companiesIn, invalidateCensus, residents } from './census';
import { activeBattles } from './battle';

export type Doing = 'work' | 'train' | 'home' | 'shop' | 'out' | 'sleep' | 'prison' | 'front' | 'away' | 'mining' | 'duty';
export const DOING_INFO: Record<Doing, { icon: string; label: string }> = {
  work: { icon: '🛠️', label: 'at work' },
  train: { icon: '🏋️', label: 'training' },
  shop: { icon: '🛒', label: 'shopping' },
  out: { icon: '☕', label: 'out and about' },
  home: { icon: '🏠', label: 'at home' },
  sleep: { icon: '😴', label: 'asleep' },
  prison: { icon: '⛓️', label: 'in prison' },
  front: { icon: '⚔️', label: 'at the front' },
  away: { icon: '🧳', label: 'away' },
  mining: { icon: '⛏️', label: 'mining' },
  duty: { icon: '🎖️', label: 'on duty' },
};

/** What a citizen is doing at this hour, from their schedule and circumstances. */
export function nowDoing(w: World, c: Citizen, t = w.time): Doing {
  if (c.sec.jailUntil > t) return 'prison';
  if (c.mining && c.mining.end > t) return 'mining';
  if (c.loc !== c.home) return 'away';
  const h = Math.floor((t % DAY) / HOUR);
  const battle = activeBattles(w).find((b) => b.region === c.loc || w.regions[c.loc]?.links.includes(b.region));
  if (battle && (c.persona === 'soldier' || c.mil.branch) && (battle.att === c.nation || battle.def === c.nation)) return 'front';
  if (h < 6 || h >= 23) return 'sleep';
  if (c.job != null && h >= c.workHour && h < c.workHour + 8) return 'work';
  if (c.mil.branch && c.mil.lastDuty === Math.floor(t / DAY) && h >= 8 && h < 17) return 'duty';
  if (h === c.trainHour) return 'train';
  if (h >= 17 && h < 20) return (c.id + h) % 3 === 0 ? 'shop' : 'out';
  if (h >= 20) return (c.id % 2) ? 'home' : 'out';
  return c.job == null ? 'out' : 'home';
}

/** Add a line to a region's local news. */
export function localNews(w: World, rid: Id, text: string) {
  const r = w.regions[rid];
  if (!r) return;
  const list = (r.news ??= []);
  list.push({ t: w.time, text });
  if (list.length > 14) list.splice(0, list.length - 14);
}

/**
 * Daily: people who cannot find work where they live move to a neighbouring
 * region that is hiring (and some who got a job further away move closer to it).
 */
export function lifeDaily(w: World) {
  const p = player(w);
  let moved = 0;
  for (const c of census(w).all) {
    if (c.player || jailed(w, c) || c.loc !== c.home || moved > 60) continue;
    const r = w.regions[c.home];
    // Commuters settle near their job after a while.
    if (c.job != null) {
      const co = w.companies[c.job];
      if (co && co.region !== c.home && !r.links.includes(co.region) && w.time - c.jobSince > 5 * DAY && chance(w, 0.08)) {
        move(w, c, co.region, `for a job at ${co.name}`);
        moved++;
      }
      continue;
    }
    if (c.persona === 'industrialist' || c.persona === 'investor' || (c.id + today(w)) % 5 !== 0) continue;
    if (companiesIn(w, c.home).some((co) => co.offer && co.workers.length < co.offer.slots)) continue;
    const nat = controller(r);
    const dest = r.links.filter((l) => controller(w.regions[l]) === nat && w.regions[l].owner === c.nation)
      .map((l) => ({ l, open: companiesIn(w, l).filter((co) => co.offer && co.workers.length < co.offer.slots).length }))
      .filter((x) => x.open > 0).sort((a, b) => b.open - a.open)[0];
    if (dest && chance(w, 0.35)) { move(w, c, dest.l, 'looking for work'); moved++; }
  }
  if (moved) invalidateCensus(w);
  void p;
}

function move(w: World, c: Citizen, to: Id, why: string) {
  const from = c.home;
  c.home = to;
  c.loc = to;
  c.mineSite = to;
  const verb = pick(w, ['packed up and moved', 'moved', 'relocated']);
  localNews(w, from, `🧳 ${c.name} ${verb} to ${w.regions[to].name}, ${why}.`);
  localNews(w, to, `👋 ${c.name} arrived from ${w.regions[from].name}, ${why}.`);
}

/** How many people of a region are doing what right now. */
export function activityCounts(w: World, rid: Id): Record<Doing, number> {
  const out = {} as Record<Doing, number>;
  for (const k of Object.keys(DOING_INFO) as Doing[]) out[k] = 0;
  for (const c of residents(w, rid)) if (!c.player) out[nowDoing(w, c)]++;
  return out;
}
