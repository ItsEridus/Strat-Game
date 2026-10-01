// Food security (1.9 Sky & ground). Each country produces a share of the food it eats
// (FAO-style self-sufficiency: Argentina and Canada grow far more than they eat;
// Japan, Korea and Saudi Arabia import most of theirs). The harvest follows the
// growing season over its farm regions. Shortfalls are bought abroad; rich
// countries pay up, but poor ones that also lose their harvest risk hunger and,
// at worst, famine: unrest, deaths and aid from friends. The big exporters' harvests
// set the world grain price.
import type { Nation, World } from './types';
import { MONEY } from '../data/economy';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { player } from './query';
import { growingIndex } from './weather';
import { addCrisis } from './dynamics';
import { historyPace } from './strategic';

/** Food production over consumption (FAO food balance sheets, rounded). */
const SELF: Record<string, number> = { USA: 1.3, CAN: 1.8, MEX: 0.7, BRA: 1.6, ARG: 2.5, GBR: 0.6, DEU: 0.85, RUS: 1.4, TUR: 1.0, SAU: 0.2, ZAF: 1.0, IND: 1.05, CHN: 0.95, JPN: 0.38, KOR: 0.45, AUS: 2.0 };
/** The grain exporters whose harvests set the world price. */
const EXPORTERS = ['USA', 'CAN', 'BRA', 'ARG', 'RUS', 'AUS'];

export interface FoodState { harvest: number; supply: number; imports: number; hunger: number; hist: { t: number; harvest: number; supply: number }[] }
export const foodOf = (n: Nation): FoodState => (n.food ??= { harvest: 1, supply: 1, imports: 0, hunger: 0, hist: [] });
export const selfSufficiency = (n: Nation) => SELF[n.iso] ?? 0.9;

/** This season's harvest across a country's farm regions (1 = normal). */
export function harvestIndex(w: World, n: Nation): number {
  if (!w.weather) return 1;
  const farms = w.regions.filter((r) => r.owner === n.id && (r.res.grain ?? 0) + (r.res.cotton ?? 0) > 0);
  const rs = farms.length ? farms : w.regions.filter((r) => r.owner === n.id);
  if (!rs.length) return 1;
  return rs.reduce((t, r) => t + growingIndex(w, r.id), 0) / rs.length;
}

/** How much a country can afford to import (rich countries buy what they need). */
const buyingPower = (n: Nation) => Math.min(1, (MONEY[n.cur]?.gdpPc ?? 20) / 25);

/** Monthly: harvest, imports, hunger and the world grain price. */
function foodMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const f = foodOf(n);
    f.harvest = Math.round(harvestIndex(w, n) * 1000) / 1000;
    const own = selfSufficiency(n) * f.harvest;
    const gap = Math.max(0, 1 - own);
    const worldPrice = 1 / Math.max(0.3, (w.econ.commodity.grain ?? 1) * (w.econ.harvest ?? 1));
    // Imports cover the gap, less of it when grain is dear and the country is poor; embargoes by exporters bite.
    const embargoed = w.nations.filter((x) => EXPORTERS.includes(x.iso) && x.embargoes.includes(n.id)).length;
    const cover = Math.min(1, buyingPower(n) * 1.3 / worldPrice) * (1 - embargoed * 0.12);
    f.imports = Math.round(gap * Math.max(0, cover) * 1000) / 1000;
    f.supply = Math.round(Math.min(1.2, own + f.imports) * 1000) / 1000;
    f.hunger = Math.max(0, Math.round((1 - f.supply) * 1000) / 1000);
    f.hist.push({ t: w.time, harvest: f.harvest, supply: f.supply });
    if (f.hist.length > 60) f.hist.shift();
    if (f.hunger > 0.05) {
      n.approval = Math.max(0, n.approval - f.hunger * 20);
      for (const r of w.regions) if (r.owner === n.id) r.unrest = Math.min(100, r.unrest + f.hunger * 30);
      if (f.hunger > 0.15 && chance(w, 0.5) && !Object.values(w.crises).some((c) => c.status === 'active' && c.kind === 'drought' && c.nation === n.id && /famine/i.test(c.name))) {
        const rs = w.regions.filter((r) => r.owner === n.id).sort((a, b) => a.pop - b.pop).slice(0, 4).map((r) => r.id);
        const c = addCrisis(w, 'drought', `Famine in ${n.name}`, rs, n.id, 30, 3);
        let deaths = 0;
        for (const rid of rs) { const r = w.regions[rid]; const d = Math.round(r.pop * Math.min(0.01, f.hunger * 0.02)); r.pop = Math.max(2000, r.pop - d); deaths += d; }
        c.deaths = deaths;
        const text = `🌾 Famine in ${n.name}: harvests failed and imports could not fill the gap (${Math.round(f.hunger * 100)}% short). ${deaths.toLocaleString()} dead.`;
        (n.chronicle ??= []).push({ t: w.time, text });
        record(w, 'disaster', text, { nation: n.id, important: true });
      } else if (n.id === player(w).nation && f.hunger > 0.05) notify(w, 'politics', `🌾 Food is short in ${n.name}: supply at ${Math.round(f.supply * 100)}% of needs. Prices and tempers are rising.`, { link: 'country' });
    }
  }
  // The exporters' harvests set the world grain price (their farms' own output already follows the weather).
  const ex = w.nations.filter((n) => EXPORTERS.includes(n.iso) && !n.exile);
  if (ex.length) w.econ.harvest = Math.round(Math.max(0.7, Math.min(1.2, ex.reduce((t, n) => t + foodOf(n).harvest, 0) / ex.length)) * 1000) / 1000;
}

export function foodDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) foodMonth(w);
}
