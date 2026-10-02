// Climate over decades (2.5 A world of consequences).
// - Emissions: each country's carbon dioxide emissions start from 2025 (Global Carbon
//   Project, rounded) and follow its economy, the fossil share of its energy mix and a
//   steady fall in energy intensity. The rest of the world (not modelled country by country)
//   emits about ten billion tonnes a year, falling slowly.
// - Temperature follows cumulative emissions (about 0.45°C per thousand billion tonnes, the
//   IPCC's TCRE), from 1.3°C above pre-industrial in 2025. Sea level rises with it.
// - Effects: warmer weather everywhere (more at high latitudes); storms, floods, droughts
//   and wildfires more frequent; harvests fall in hot zones and improve a little in cold
//   ones; low-lying coasts flood; people leave the hottest and most flooded regions.
// - The energy transition: fossil fuels give way to wind, solar and nuclear, faster for
//   members of the climate treaty (the Paris Agreement) whose leaders mean it, and with
//   clean-energy technology (batteries, geothermal, small reactors, fusion). Green industry
//   adds a little growth. The treaty suffers from free-riding: nationalist governments and
//   fossil exporters leave or do little; others join as the world warms.
import type { Nation, Region, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { dataIso } from '../data/isoAlias';
import { SOURCES, type Source } from '../data/energy';
import { energyOf } from './energy';
import { capsOf, historyPace } from './strategic';
import { hasTech } from './technology';
import { leaderProfile } from './relations';
import { activeTreaties, signTreaty } from './treaties';
import { zoneOf } from './weather';
import { EARTH } from '../data/earth';
import { player } from './query';

/** CO2 emissions in 2025, billion tonnes a year. */
const CO2_2025: Record<string, number> = { CHN: 12, USA: 4.9, IND: 3.1, RUS: 1.8, JPN: 1.0, SAU: 0.7, DEU: 0.6, KOR: 0.6, CAN: 0.55, MEX: 0.48, BRA: 0.48, TUR: 0.45, ZAF: 0.4, AUS: 0.38, GBR: 0.3, ARG: 0.18 };
const REST_OF_WORLD = 10;
const TCRE = 0.00045; // °C per billion tonnes
const FOSSIL: Source[] = ['coal', 'gas', 'oil'];

export interface ClimateState { temp: number; cum: number; sea: number; rest: number; hist: { year: number; gt: number; temp: number }[] }
export const climateOf = (w: World): ClimateState => (w.climate ??= { temp: 1.3, cum: 0, sea: 0, rest: REST_OF_WORLD, hist: [] });
/** Warming since 2025 (°C). */
export const warming = (w: World) => (w.climate ? w.climate.temp - 1.3 : 0);

const fossilShare = (n: Nation) => FOSSIL.reduce((t, s) => t + (energyOf(n).mix[s] ?? 0), 0);
/** A country's emissions now (billion tonnes a year). */
export function emissionsOf(w: World, n: Nation): number {
  if (n.exile || n.dissolved != null) return 0;
  const e0 = (CO2_2025[dataIso(n.iso)] ?? 0.1) * (n.parent != null ? 0.1 : 1);
  const f0 = n.fossil0 ??= fossilShare(n);
  const years = Math.max(0, w.time / (365 * DAY) - (n.founded != null ? n.founded / (365 * DAY) : 0));
  return e0 * capsOf(w, n).productivity * (fossilShare(n) / Math.max(0.01, f0)) * Math.pow(0.988, Math.min(years, w.time / (365 * DAY)));
}

/** Does the country take part in the climate treaty, and how seriously (0–1)? */
export function climateCommitment(w: World, n: Nation): number {
  const member = activeTreaties(w, n.id, 'climate').length > 0;
  return member ? Math.max(0, 1 - leaderProfile(w, n).nationalism) : 0;
}

/** This year's fall in the fossil share of the energy mix (a share of the whole mix). */
export function transitionRate(w: World, n: Nation): number {
  let r = 0.004 + climateCommitment(w, n) * 0.006;
  if (hasTech(n, 'batteries')) r += 0.002;
  if (hasTech(n, 'geothermal')) r += 0.001;
  if (hasTech(n, 'smr')) r += 0.002;
  if (hasTech(n, 'fusion')) r += 0.02;
  return r;
}

function transition(w: World, n: Nation) {
  const mix = energyOf(n).mix;
  const fossil = fossilShare(n);
  if (fossil <= 0.02) return;
  const cut = Math.min(fossil - 0.02, transitionRate(w, n));
  // Coal goes first, then oil, then gas.
  const weight: Record<string, number> = { coal: 2 * (mix.coal ?? 0), oil: 1.2 * (mix.oil ?? 0), gas: mix.gas ?? 0 };
  const tw = weight.coal + weight.oil + weight.gas || 1;
  for (const s of FOSSIL) mix[s] = Math.max(0, (mix[s] ?? 0) - cut * (weight[s] / tw));
  // Replaced by wind and solar, nuclear (more with small reactors) and a little hydro and bio.
  const nuc = hasTech(n, 'smr') || hasTech(n, 'fusion') ? 0.3 : 0.15;
  mix.wind = (mix.wind ?? 0) + cut * (0.85 - nuc) * 0.5;
  mix.solar = (mix.solar ?? 0) + cut * (0.85 - nuc) * 0.5;
  mix.nuclear = (mix.nuclear ?? 0) + cut * nuc;
  mix.hydro = (mix.hydro ?? 0) + cut * 0.08;
  mix.bio = (mix.bio ?? 0) + cut * 0.07;
  // Keep the shares summing to one.
  const total = SOURCES.reduce((t, s) => t + (mix[s] ?? 0), 0);
  for (const s of SOURCES) mix[s] = Math.round(((mix[s] ?? 0) / total) * 10000) / 10000;
}

// ---------- the climate treaty ----------

function treatyYear(w: World) {
  let paris = Object.values(w.treaties ?? {}).find((t) => t.kind === 'climate' && t.status === 'active');
  if (!paris) {
    // The Paris Agreement (2015): everyone but the United States, which left in 2025.
    const parties = w.nations.filter((n) => !n.exile && dataIso(n.iso) !== 'USA').map((n) => n.id);
    paris = signTreaty(w, 'climate', parties, { name: 'Paris Agreement', quiet: true, years: null });
    paris.historic = true;
  }
  const temp = climateOf(w).temp;
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const lp = leaderProfile(w, n);
    const member = paris.parties.includes(n.id);
    const exporter = (energyOf(n).self.oil ?? 1) > 1.5 || (energyOf(n).self.gas ?? 1) > 1.5;
    if (member && lp.nationalism > 0.7 && chance(w, exporter ? 0.12 : 0.05)) {
      paris.parties = paris.parties.filter((x) => x !== n.id);
      const text = `🌡️ ${n.name} withdrew from the Paris Agreement.`;
      record(w, 'diplomacy', text, { nation: n.id, important: true });
      (n.chronicle ??= []).push({ t: w.time, text });
    } else if (!member && lp.nationalism < 0.5 && chance(w, 0.08 + Math.max(0, temp - 1.5) * 0.3)) {
      paris.parties.push(n.id);
      const text = `🌡️ ${n.name} rejoined the Paris Agreement.`;
      record(w, 'diplomacy', text, { nation: n.id, important: true });
      (n.chronicle ??= []).push({ t: w.time, text });
    }
  }
}

// ---------- effects ----------

/** How much more often weather disasters strike than in 2025. */
export const hazardFactor = (w: World, kind: string) => (kind === 'earthquake' || kind === 'volcano' ? 1 : 1 + Math.max(0, warming(w)) * 0.3);

/** Harvests against 2025 in a climate zone: hot zones lose, cold ones gain a little. */
export function climateYield(w: World, zone: string): number {
  const d = warming(w);
  if (d <= 0) return 1;
  return zone === 'tropical' || zone === 'arid' ? 1 - d * 0.07 : zone === 'subarctic' || zone === 'continental' ? 1 + d * 0.04 : 1 - d * 0.015;
}

/** Low-lying coasts flood more as the sea rises; people leave the hottest and most flooded places. */
const coastal = (r: Region) => (EARTH.regions[r.id]?.seas ?? []).length > 0;
function coastsAndMigration(w: World) {
  const c = climateOf(w);
  const d = warming(w);
  if (d < 0.3) return;
  for (const n of w.nations) {
    if (n.exile) continue;
    const own = w.regions.filter((r) => r.owner === n.id);
    const hot = own.filter((r) => ['tropical', 'arid'].includes(zoneOf(w, r.id)));
    const cool = own.filter((r) => !['tropical', 'arid'].includes(zoneOf(w, r.id)));
    let moved = 0;
    for (const r of hot) { const k = Math.round(r.pop * 0.002 * d); r.pop -= k; moved += k; }
    if (moved > 0 && cool.length) for (const r of cool) r.pop += Math.round(moved / cool.length);
    else if (moved > 0) for (const r of hot) r.pop += Math.round(moved / hot.length); // nowhere cooler at home
    n.climateMigrants = (n.climateMigrants ?? 0) + (cool.length ? moved : 0);
    // Coastal floods once the sea has risen enough.
    if (c.sea > 0.15) for (const r of own) if (coastal(r) && chance(w, (c.sea - 0.15) * 0.3)) {
      r.unrest = Math.min(100, r.unrest + 5);
      r.bld.industrial = Math.max(0, r.bld.industrial - (chance(w, 0.3) ? 1 : 0));
      record(w, 'politics', `🌊 Coastal flooding in ${r.name} (${n.name}): the sea has risen ${Math.round(c.sea * 100)} cm since 2025.`, { nation: n.id, region: r.id });
    }
  }
}

function yearly(w: World) {
  const c = climateOf(w);
  for (const n of w.nations) if (!n.exile && n.dissolved == null) transition(w, n);
  treatyYear(w);
  let gt = c.rest;
  for (const n of w.nations) gt += emissionsOf(w, n);
  c.rest = Math.max(2, c.rest * 0.995);
  c.cum += gt;
  const before = c.temp;
  c.temp = Math.round((1.3 + c.cum * TCRE) * 1000) / 1000;
  c.sea = Math.round((c.sea + 0.0045 + Math.max(0, c.temp - 1.3) * 0.002) * 1000) / 1000;
  const year = dateAt(w.time).year;
  c.hist.push({ year, gt: Math.round(gt * 10) / 10, temp: c.temp });
  if (c.hist.length > 120) c.hist.shift();
  for (const mark of [1.5, 2, 2.5, 3]) if (before < mark && c.temp >= mark) {
    const text = `🌡️ The world has warmed ${mark}°C above pre-industrial levels.`;
    record(w, 'politics', text, { important: true });
    if (player(w)) notify(w, 'politics', text);
  }
}

function monthly(w: World) {
  const d = dateAt(w.time);
  if (d.month === 0) {
    yearly(w);
    coastsAndMigration(w);
  }
}

export function climateDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
