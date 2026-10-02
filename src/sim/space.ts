// Space (2.4 Frontiers). Every country has a space agency and three constellations:
// communications, reconnaissance and navigation (0–100, starting from 2025).
// - Launches: countries that can launch build up their constellations towards what their
//   space technology and economy can support, faster with reusable rockets; others buy
//   launches abroad, more slowly.
// - What satellites do: reconnaissance sharpens the intelligence service's collection;
//   navigation and communications make armed forces more effective.
// - Anti-satellite weapons: in a war at the level of a general war, a country with them
//   may shoot down the enemy's satellites. Every strike, and every peacetime test, leaves
//   debris; debris wears down everyone's satellites, and too much of it cascades (the
//   Kessler syndrome). Debris falls out of orbit slowly.
// - Prestige missions (a space station, an asteroid sample, astronauts on the Moon, a
//   probe to the outer planets) lift approval at home and standing abroad; some fail.
import type { Id, Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { DAY } from '../engine/clock';
import { notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { SPACE_2025, MISSIONS, type Mission } from '../data/space';
import { BASELINES, baselineOf } from '../data/nationBaselines';
import { dataIso } from '../data/isoAlias';
import { capsOf, historyPace } from './strategic';
import { hasTech } from './technology';
import { relation } from './congress';
import { activeWars } from './war';
import { levelOf } from './warCourse';
import { leaderProfile } from './relations';
import { player } from './query';

export type Constellation = 'comms' | 'recon' | 'nav';
export const CONST_LABEL: Record<Constellation, string> = { comms: 'Communications', recon: 'Reconnaissance', nav: 'Navigation' };
export interface SpaceState { agency: string; launcher: boolean; sats: Record<Constellation, number>; launches: number; missions: Record<string, number>; asatTests: number; lastTest?: number }

const SPACE_LEAD = Math.max(...Object.values(BASELINES).map((b) => b.tech.space));

export function spaceOf(n: Nation): SpaceState {
  if (n.space) return n.space;
  const s = SPACE_2025[dataIso(n.iso)] ?? { agency: `${n.adj} Space Agency`, launcher: false, comms: 3, recon: 2, nav: 0 };
  const done = n.parent == null ? Object.fromEntries((s.done ?? []).map((m) => [m, -1])) : {};
  n.space = { agency: n.parent != null ? `${n.adj} Space Agency` : s.agency, launcher: n.parent == null && s.launcher, sats: n.parent != null ? { comms: 0, recon: 0, nav: 0 } : { comms: s.comms, recon: s.recon, nav: s.nav }, launches: 0, missions: done, asatTests: 0 };
  return n.space;
}
export const orbitOf = (w: World) => (w.orbit ??= { debris: 5, cascades: 0 });

/** Collection quality added by reconnaissance satellites (up to 0.08). */
export const reconBonus = (n: Nation) => (n.space ? n.space.sats.recon : SPACE_2025[dataIso(n.iso)]?.recon ?? 0) / 1250;
/** Combat effectiveness added by navigation and communications satellites (up to 0.08). */
export function satBonus(n: Nation): number {
  const s = n.space?.sats ?? SPACE_2025[dataIso(n.iso)];
  return s ? (s.nav + s.comms) / 2500 : 0;
}

/** Space capability for missions (the United States in 2025 is 100): technology, weighted by the size of the economy. */
export function spaceCapability(w: World, n: Nation): number {
  return 100 * (capsOf(w, n).tech.space / SPACE_LEAD) * (0.5 + 0.5 * Math.sqrt(Math.max(0.05, baselineOf(n.iso).gdpShare) / 26));
}
/** How large a constellation the country can sustain (0–100). */
function capacity(w: World, n: Nation, k: Constellation): number {
  const lvl = capsOf(w, n).tech.space / SPACE_LEAD;
  const mass = Math.sqrt(Math.max(0.05, baselineOf(n.iso).gdpShare) / 26);
  const base = Math.min(100, 100 * lvl * lvl * mass * (k === 'nav' ? 1.1 : 1));
  return base * (hasTech(n, 'megaconst') && k !== 'nav' ? 1.3 : 1);
}

function launches(w: World) {
  const orbit = orbitOf(w);
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const s = spaceOf(n);
    const speed = (s.launcher ? 0.06 : 0.025) * (hasTech(n, 'reusable') ? 1.6 : 1);
    for (const k of ['comms', 'recon', 'nav'] as Constellation[]) {
      const cap = Math.min(100, capacity(w, n, k));
      // Debris wears satellites down; launches replace and add.
      s.sats[k] = Math.max(0, s.sats[k] * (1 - orbit.debris / 2500));
      if (s.sats[k] < cap) { s.sats[k] = Math.min(cap, s.sats[k] + (cap - s.sats[k]) * speed + 0.3); s.launches++; }
      else s.sats[k] -= (s.sats[k] - cap) * 0.01; // more than it can sustain: old satellites are not all replaced
    }
    // A country with the know-how develops its own launcher.
    if (!s.launcher && capsOf(w, n).tech.space >= SPACE_LEAD * 0.8 && chance(w, 0.02)) {
      s.launcher = true;
      const text = `🚀 ${n.name} launched a satellite on a rocket of its own for the first time.`;
      record(w, 'politics', text, { nation: n.id, important: true });
      (n.chronicle ??= []).push({ t: w.time, text });
    }
  }
  orbit.debris = Math.max(0, orbit.debris * 0.99);
  // The Kessler syndrome: too much debris, and collisions make more of it.
  if (orbit.debris > 60 && chance(w, (orbit.debris - 60) / 100)) {
    orbit.cascades++;
    orbit.debris = Math.min(100, orbit.debris + 15);
    for (const n of w.nations) if (n.space) for (const k of ['comms', 'recon', 'nav'] as Constellation[]) n.space.sats[k] *= 0.8;
    record(w, 'politics', '💥 A cascade of collisions in low orbit destroyed satellites of every nation: debris begets debris.', { important: true });
  }
}

/** Anti-satellite strikes in wartime, and the occasional test in peacetime. */
function asat(w: World) {
  const orbit = orbitOf(w);
  for (const war of activeWars(w)) {
    if (levelOf(war) < 3) continue;
    for (const [side, enemy] of [[war.att, war.def], [war.def, war.att]] as [Id, Id][]) {
      const n = w.nations[side], e = w.nations[enemy];
      if (!hasTech(n, 'asat') || !chance(w, 0.3)) continue;
      const es = spaceOf(e);
      const k: Constellation = es.sats.recon >= es.sats.nav ? 'recon' : 'nav';
      const lost = Math.round(es.sats[k] * 0.25);
      if (lost < 1) continue;
      es.sats[k] -= lost;
      orbit.debris = Math.min(100, orbit.debris + 4);
      const text = `💥 ${n.name} shot down ${e.adj} ${CONST_LABEL[k].toLowerCase()} satellites; the debris will circle the Earth for years.`;
      record(w, 'war', text, { nation: n.id, important: true });
      for (const o of w.nations) if (o.id !== n.id && o.id !== e.id && !o.exile) relation(w, o.id, n.id, -2, 'debris in orbit');
      if (player(w).nation === e.id || player(w).nation === n.id) notify(w, 'warHome', text);
    }
  }
  // A peacetime test: a hawkish government shows what it can do.
  for (const n of w.nations) {
    if (n.exile || !hasTech(n, 'asat') || leaderProfile(w, n).hawk < 0.55) continue;
    const s = spaceOf(n);
    if (w.time - (s.lastTest ?? -1e12) < 10 * 365 * DAY || !chance(w, 0.003)) continue;
    s.asatTests++;
    s.lastTest = w.time;
    orbit.debris = Math.min(100, orbit.debris + 3);
    const text = `💥 ${n.name} destroyed one of its own satellites in an anti-satellite weapons test, scattering debris across low orbit.`;
    record(w, 'diplomacy', text, { nation: n.id, important: true });
    for (const o of w.nations) if (o.id !== n.id && !o.exile) relation(w, o.id, n.id, -4, 'an anti-satellite test');
  }
}

/** Prestige missions. */
function missions(w: World) {
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const s = spaceOf(n);
    if (!s.launcher) continue;
    for (const m of MISSIONS) {
      if (s.missions[m.id] != null || dateAt(w.time).year < m.notBefore || spaceCapability(w, n) < m.level) continue;
      if (!chance(w, 0.01 * Math.sqrt(Math.max(0.1, baselineOf(n.iso).gdpShare)))) continue;
      flyMission(w, n, m);
      break;
    }
  }
}
export function flyMission(w: World, n: Nation, m: Mission): boolean {
  const s = spaceOf(n);
  const pl = player(w);
  if (chance(w, m.crewed ? 0.12 : 0.18)) {
    n.approval = Math.max(5, n.approval - 2);
    const text = `💥 ${n.name}'s attempt at ${m.name.toLowerCase()} failed${m.crewed ? '; the crew survived' : ''}. Engineers will try again.`;
    record(w, 'politics', text, { nation: n.id, important: true });
    if (pl.nation === n.id) notify(w, 'politics', text);
    return false;
  }
  s.missions[m.id] = w.time;
  n.approval = Math.min(100, n.approval + 3);
  const first = !w.nations.some((o) => o.id !== n.id && o.space?.missions[m.id] != null);
  for (const o of w.nations) { const rel = o.relations[n.id]; if (o.id !== n.id && !o.exile && rel) rel.score = Math.min(100, rel.score + (first ? 3 : 1)); }
  const text = `${m.icon} ${n.name} achieved ${m.name.toLowerCase()}${first ? ', a first for any country' + (m.id === 'moon' ? ' since Apollo' : '') : ''}.`;
  record(w, 'politics', text, { nation: n.id, important: true });
  (n.chronicle ??= []).push({ t: w.time, text });
  if (pl.nation === n.id) notify(w, 'politics', text, { critical: first });
  return true;
}

function monthly(w: World) {
  launches(w);
  asat(w);
  missions(w);
}

export function spaceDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
