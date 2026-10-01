// Weather and climate (1.9 Sky & ground). Every region has a climate zone from its
// latitude, terrain and coast: tropical, arid, temperate (maritime), continental,
// subarctic or alpine. Each day brings weather that follows the seasons of the calendar
// (they are reversed south of the equator): temperature, rain or snow, wind and
// storms. Temperature anomalies persist for days, so heatwaves and cold snaps last.
// Tomorrow's forecast is uncertain, and less so where meteorology is better.
//
// Weather matters: it moves the player's mood, farm output over the growing season,
// work outdoors, the energy bill for heating and cooling, travel (storms ground flights;
// snow makes overland travel harder), and military operations (mud, winter, sea state
// and flying weather).
import type { Formation, Id, World } from './types';
import { EARTH } from '../data/earth';
import { DAY, dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { hash01 } from '../engine/rng';
import { player } from './query';
import { lifeOf } from './lifecycle';

export type Zone = 'tropical' | 'arid' | 'temperate' | 'continental' | 'subarctic' | 'alpine';
export const ZONE_LABEL: Record<Zone, string> = { tropical: 'Tropical', arid: 'Arid', temperate: 'Temperate', continental: 'Continental', subarctic: 'Subarctic', alpine: 'Alpine' };
export type WxKind = 'clear' | 'cloudy' | 'rain' | 'heavyrain' | 'snow' | 'storm' | 'heat' | 'fog';
export const WX_INFO: Record<WxKind, { icon: string; label: string }> = {
  clear: { icon: '☀️', label: 'Clear' }, cloudy: { icon: '☁️', label: 'Cloudy' }, rain: { icon: '🌧️', label: 'Rain' }, heavyrain: { icon: '⛈️', label: 'Heavy rain' },
  snow: { icon: '🌨️', label: 'Snow' }, storm: { icon: '🌪️', label: 'Storm' }, heat: { icon: '🥵', label: 'Heatwave' }, fog: { icon: '🌫️', label: 'Fog' },
};
export interface Wx { t: number; mm: number; wind: number; kind: WxKind }
export interface WeatherState { day: number; today: Record<Id, Wx>; tomorrow: Record<Id, Wx>; anom: Record<Id, number>; grow: Record<Id, number>; wet: Record<Id, number> }

const coastal = (rid: Id) => (EARTH.regions[rid].seas ?? []).length > 0;
const latOf = (rid: Id) => EARTH.regions[rid].lat;

/** The climate zone of a region. */
export function zoneOf(w: World, rid: Id): Zone {
  const r = w.regions[rid];
  const lat = Math.abs(latOf(rid));
  if (r.terrain === 'mountains') return 'alpine';
  if (r.terrain === 'desert') return 'arid';
  if (lat < 23) return 'tropical';
  if (lat >= 60) return 'subarctic';
  if (lat >= 45 && !coastal(rid)) return 'continental';
  return 'temperate';
}

/** Climate normals for a region and day of the year: mean temperature, chance of a wet day and mm on a wet day. */
export function normals(w: World, rid: Id, doy: number): { t: number; wet: number; mm: number } {
  const lat = latOf(rid);
  const a = Math.abs(lat);
  const zone = zoneOf(w, rid);
  const coast = coastal(rid);
  // Maritime climates (Europe west of Russia, the western coasts of the Americas, the southern hemisphere) are mild
  // with small seasons; continental and east-coast climates (Moscow, Ottawa, Beijing, Seoul) are colder with big ones.
  const lon = EARTH.regions[rid].lon;
  const maritime = lat < 0 || (lon >= -15 && lon <= 30) || lon < -115;
  const mean = 28 - (maritime ? 0.45 : 0.55) * Math.max(0, a - 15) + (maritime && coast ? 1 : 0) - (zone === 'alpine' ? 4 : 0) - (zone === 'continental' && !maritime ? 1 : 0) + (zone === 'arid' ? 1 : 0);
  const amp = (maritime ? 0.2 : 0.32) * Math.max(0, a - 6) * (zone === 'arid' ? 1.3 : 1);
  // Coldest about 15 January in the north, 15 July in the south.
  const phase = ((doy - 15) / 365) * 2 * Math.PI;
  const season = -Math.cos(phase) * (lat >= 0 ? 1 : -1); // +1 in northern midsummer
  const t = mean + amp * season;
  const summer = season > 0;
  // Wet days and rain per wet day, roughly as observed (London ~110 wet days and ~600 mm; Delhi a monsoon summer).
  const wet = zone === 'tropical' ? (summer ? 0.45 : 0.12) : zone === 'arid' ? 0.04 : zone === 'temperate' ? (coast ? 0.32 : 0.27) : zone === 'continental' ? (summer ? 0.3 : 0.22) : zone === 'subarctic' ? 0.28 : 0.3;
  let mm = zone === 'tropical' ? 11 : zone === 'arid' ? 6 : 4.5;
  // The Asian summer monsoon (India to Japan) brings most of the year's rain.
  const monsoon = summer && lat >= 8 && lat <= 38 && lon >= 70 && lon <= 145 && zone !== 'arid';
  if (monsoon) { mm *= 2; }
  const wetP = monsoon ? Math.min(0.7, wet + 0.2) : wet;
  return { t, wet: wetP, mm };
}

/** A standard normal draw from a stable hash (weather does not disturb the world's random stream). */
const gauss = (a: number, b: number, c: number) => { const u = Math.max(1e-9, hash01(a, b, c)), v = hash01(a, b, c + 1); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function generate(w: World, s: WeatherState, rid: Id, day: number): Wx {
  const d = dateAt(day * DAY);
  const doy = Math.floor((Date.UTC(d.year, d.month, d.day) - Date.UTC(d.year, 0, 1)) / 86400000);
  const n = normals(w, rid, doy);
  const anom = (s.anom[rid] = Math.round(((s.anom[rid] ?? 0) * 0.75 + gauss(rid, day, 11) * 2.2) * 10) / 10);
  const t = Math.round(n.t + anom);
  const zone = zoneOf(w, rid);
  const wetDay = hash01(rid, day, 21) < n.wet;
  let mm = wetDay ? Math.round(n.mm * (0.3 + -Math.log(Math.max(1e-6, hash01(rid, day, 22))))) : 0;
  let wind = Math.max(0, Math.round(12 + gauss(rid, day, 31) * 7 + (coastal(rid) ? 5 : 0)));
  // Storms: winter gales on mid-latitude coasts, thunderstorms in the tropical wet season.
  const winter = n.t < (Math.abs(latOf(rid)) < 23 ? 0 : 8);
  const stormP = zone === 'tropical' && wetDay ? 0.05 : coastal(rid) && winter && (zone === 'temperate' || zone === 'subarctic') ? 0.04 : 0.008;
  const storm = hash01(rid, day, 41) < stormP;
  if (storm) { wind = 65 + Math.round(hash01(rid, day, 42) * 50); mm = Math.max(mm, 15 + Math.round(hash01(rid, day, 43) * 40)); }
  const kind: WxKind = storm ? 'storm' : mm > 0 && t <= 1 ? 'snow' : mm >= 20 ? 'heavyrain' : mm > 0 ? 'rain' : t >= 35 ? 'heat' : coastal(rid) && winter && hash01(rid, day, 51) < 0.06 ? 'fog' : hash01(rid, day, 52) < 0.4 ? 'cloudy' : 'clear';
  return { t, mm, wind, kind };
}

export function weatherOf(w: World): WeatherState {
  if (w.weather && w.weather.day === dayOf(w.time)) return w.weather;
  const day = dayOf(w.time);
  const s: WeatherState = w.weather ?? { day: day - 1, today: {}, tomorrow: {}, anom: {}, grow: {}, wet: {} };
  if (s.day !== day) {
    for (const r of w.regions) {
      s.today[r.id] = s.day === day - 1 && s.tomorrow[r.id] ? s.tomorrow[r.id] : generate(w, s, r.id, day);
      s.tomorrow[r.id] = generate(w, s, r.id, day + 1);
    }
    s.day = day;
  }
  w.weather = s;
  return s;
}
export const weatherAt = (w: World, rid: Id): Wx => weatherOf(w).today[rid];

/** Tomorrow's forecast: the true weather blurred by forecasting skill (better where meteorology is better). */
export function forecast(w: World, rid: Id): { t: number; rainChance: number; kind: WxKind } {
  const s = weatherOf(w);
  const x = s.tomorrow[rid];
  const n = w.nations[w.regions[rid].owner];
  const skill = n?.caps ? Math.min(1, n.caps.tech.information / 100) : 0.6;
  const err = (1 - skill) * 3 + 1;
  const t = Math.round(x.t + gauss(rid, s.day, 61) * err * 0.7);
  const truth = x.mm > 0 ? 1 : 0;
  const rainChance = Math.round(Math.max(0, Math.min(1, truth * (0.55 + skill * 0.35) + (1 - truth) * (0.35 - skill * 0.25) + gauss(rid, s.day, 62) * 0.1)) * 10) * 10;
  const kind: WxKind = x.kind === 'storm' && hash01(rid, s.day, 63) < 0.4 + skill * 0.5 ? 'storm' : x.kind === 'storm' ? 'heavyrain' : x.kind;
  return { t, rainChance, kind };
}

/** The growing-season index for farms (0.7 poor .. 1.15 excellent): rain against normal, frost and heat. */
export const growingIndex = (w: World, rid: Id) => weatherOf(w).grow[rid] ?? 1;

// ---------- effects ----------

/** Production: farms follow the growing season; storms and snow stop outdoor work. */
export function weatherFactor(w: World, rid: Id, industry: string): { label: string; mult: number } | null {
  const x = weatherAt(w, rid);
  const farm = industry === 'grain' || industry === 'cotton' || industry === 'timber';
  let mult = 1;
  const labels: string[] = [];
  if (farm) { const g = growingIndex(w, rid); if (Math.abs(g - 1) > 0.02) { mult *= g; labels.push(g < 1 ? 'poor growing season' : 'good growing season'); } }
  if (x.kind === 'storm') { mult *= farm || industry === 'materials' || industry === 'timber' ? 0.6 : 0.85; labels.push('storm'); }
  else if (x.kind === 'snow' && (farm || industry === 'materials')) { mult *= 0.8; labels.push('snow'); }
  else if (x.kind === 'heat' && farm) { mult *= 0.9; labels.push('heatwave'); }
  return labels.length ? { label: `Weather: ${labels.join(', ')}`, mult } : null;
}
/** Heating and cooling: energy use rises in cold and hot weather. */
export const energyDemand = (w: World, rid: Id) => { const t = weatherAt(w, rid).t; return 1 + Math.max(0, 15 - t) / 40 + Math.max(0, t - 26) / 30; };
/** Construction slows in storms, heavy rain and snow. */
export const constructionFactor = (w: World, rid: Id) => { const k = weatherAt(w, rid).kind; return k === 'storm' ? 0.3 : k === 'snow' || k === 'heavyrain' ? 0.7 : 1; };
/** Why a flight cannot leave today (storms ground flights). */
export const flightsGrounded = (w: World, a: Id, b: Id) => (weatherAt(w, a).kind === 'storm' ? `Flights from ${w.regions[a].name} are grounded by a storm.` : weatherAt(w, b).kind === 'storm' ? `Flights to ${w.regions[b].name} are grounded by a storm.` : null);
/** Overland travel costs more energy in snow and storms. */
export const overlandFactor = (w: World, rid: Id) => { const k = weatherAt(w, rid).kind; return k === 'snow' || k === 'storm' ? 1.5 : k === 'heavyrain' ? 1.2 : 1; };

/** Military operations: mud, winter, sea state and flying weather. */
export function combatWeather(w: World, f: Formation): { mult: number; why: string | null } {
  if (!w.weather) return { mult: 1, why: null };
  const x = weatherAt(w, f.loc);
  if (!x) return { mult: 1, why: null };
  if (f.branch === 'air') {
    if (x.kind === 'storm') return { mult: 0.6, why: 'grounded by storms' };
    if (x.kind === 'fog' || x.kind === 'snow') return { mult: 0.75, why: 'poor flying weather' };
    return { mult: 1, why: null };
  }
  if (f.branch === 'navy') return x.kind === 'storm' || x.wind >= 60 ? { mult: 0.7, why: 'heavy seas' } : { mult: 1, why: null };
  if (x.t <= -10 && f.kind !== 'mountain') return { mult: 0.85, why: 'bitter winter' };
  if (f.kind === 'armored' && x.mm >= 10 && x.t > 1) return { mult: 0.8, why: 'mud' };
  if (x.kind === 'snow') return { mult: 0.9, why: 'snow' };
  return { mult: 1, why: null };
}

// ---------- daily ----------

export function weatherDaily(w: World) {
  const s = weatherOf(w);
  const d = dateAt(w.time);
  const doy = Math.floor((Date.UTC(d.year, d.month, d.day) - Date.UTC(d.year, 0, 1)) / 86400000);
  for (const r of w.regions) {
    const x = s.today[r.id];
    const n = normals(w, r.id, doy);
    // Rolling 30-day rain against normal, and a growing-season score.
    s.wet[r.id] = (s.wet[r.id] ?? n.wet) * (29 / 30) + (x.mm > 0 ? 1 : 0) / 30;
    const rainRatio = s.wet[r.id] / Math.max(0.03, n.wet);
    const growing = n.t > 5; // a growing season worth the name
    let score = 1;
    if (growing) {
      if (rainRatio < 0.5) score -= (0.5 - rainRatio) * 0.6; // drought
      if (rainRatio > 1.8) score -= (rainRatio - 1.8) * 0.1; // waterlogging
      if (x.t >= 35) score -= 0.25; // heat stress
      if (x.t <= 0) score -= 0.3; // frost
      if (rainRatio < 0.8) score -= 0.05; // a dry spell
      if (rainRatio >= 0.8 && rainRatio <= 1.3 && x.t > 10 && x.t < 30) score += 0.04;
    }
    s.grow[r.id] = Math.max(0.7, Math.min(1.15, Math.round(((s.grow[r.id] ?? 1) * 0.95 + score * 0.05) * 1000) / 1000));
  }
  // The player feels the weather.
  const p = player(w);
  const x = s.today[p.loc];
  if (x) {
    const l = lifeOf(p);
    const nice = (x.kind === 'clear' || x.kind === 'cloudy') && x.t >= 15 && x.t <= 28;
    const grim = x.kind === 'storm' || x.kind === 'heat' || x.t <= -10;
    if (nice) l.happiness = Math.min(100, l.happiness + 0.5);
    if (grim) { l.happiness = Math.max(0, l.happiness - 0.5); l.stress = Math.min(100, l.stress + 0.5); }
  }
}
