// Energy and resources (1.9 Sky & ground). Each country generates electricity from
// its real mix of coal, gas, oil, nuclear, hydro, wind, solar and bioenergy. Its energy
// price follows world fuel prices, more so the more fuel it imports. Grids fail
// where they are weak (South Africa's load shedding, India's outages), more often in
// heat and cold. Deposits of oil, gas, coal, uranium, lithium, rare earths, copper and
// iron are measured in years of production: extraction depletes them, exploration
// finds more, and as they run down output falls and imports rise. OPEC+ (here Saudi
// Arabia, Russia and Mexico) cuts output when oil is cheap and raises it when oil is
// dear. Countries without their own rare earths or lithium are exposed when the main
// producer embargoes them.
import type { Company, Id, Nation, World } from './types';
import { ENERGY, OPEC_PLUS, SOURCES, energyBaseline, type Fuel, type Mineral, type Source } from '../data/energy';
import { dateAt } from '../engine/calendar';
import { dayOf } from '../engine/clock';
import { notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { controller, player } from './query';
import { capsOf, historyPace } from './strategic';
import { worldPriceRatio } from './trade';
import { energyDemand } from './weather';

export interface EnergyState {
  mix: Record<Source, number>;
  self: Record<Fuel, number>;
  reserves: Partial<Record<Mineral, number>>;
  share: Partial<Record<Mineral, number>>;
  grid: number;
  blackouts: number; // region-days without power this year
  lastYear?: number; // and last year
  finds: number;
}
export function energyOf(n: Nation): EnergyState {
  if (n.energy) return n.energy;
  const b = energyBaseline(n.iso);
  n.energy = { mix: { ...b.mix }, self: { ...b.self }, reserves: { ...b.reserves }, share: { ...b.share }, grid: b.grid, blackouts: 0, finds: 0 };
  return n.energy;
}

/** Fuel self-sufficiency now: falls as reserves run low. */
export function selfSufficiency(n: Nation, fuel: Fuel): number {
  const e = energyOf(n);
  const r = e.reserves[fuel];
  return e.self[fuel] * (r == null ? 1 : Math.min(1, r / 8));
}
/** The share of a fuel bought abroad (0..1). */
export const importShare = (n: Nation, fuel: Fuel) => Math.max(0, Math.min(1, 1 - selfSufficiency(n, fuel)));

/** World fuel prices against their long-run level. */
export function fuelRatios(w: World): Record<Fuel, number> {
  const oil = worldPriceRatio(w, 'oil');
  return { oil, gas: Math.pow(oil, 0.8), coal: 1 + (oil - 1) * 0.3 };
}

/** The national energy price (1 = 2025): world fuel prices pass through, more for importers; low-carbon power does not move. */
export function energyPrice(w: World, n: Nation): number {
  const e = energyOf(n);
  const r = fuelRatios(w);
  let p = 0;
  for (const s of SOURCES) {
    const fuel = s === 'coal' || s === 'gas' || s === 'oil' ? s : null;
    p += e.mix[s] * (fuel ? 1 + (r[fuel] - 1) * (0.4 + 0.6 * importShare(n, fuel)) : 1);
  }
  return Math.round(p * 1000) / 1000;
}

// ---------- blackouts ----------

/** Daily: weak grids fail, more often under heat or cold stress. */
function blackoutsDaily(w: World) {
  for (const r of w.regions) {
    const n = w.nations[r.owner];
    if (!n || n.exile) continue;
    const e = energyOf(n);
    const stress = w.weather ? energyDemand(w, r.id) : 1;
    if (chance(w, (1 - e.grid) * 0.5 * stress)) { r.blackout = dayOf(w.time); e.blackouts++; }
  }
}
export const inBlackout = (w: World, rid: Id) => w.regions[rid].blackout === dayOf(w.time);

/** Production effects: blackouts, depleting deposits and cut-off minerals. */
export function energyFactors(w: World, co: Company): { label: string; mult: number }[] {
  const out: { label: string; mult: number }[] = [];
  const n = w.nations[controller(w.regions[co.region])];
  if (!n) return out;
  if (inBlackout(w, co.region)) out.push({ label: 'Blackout', mult: 0.75 });
  const e = energyOf(n);
  const mineral = co.industry === 'oil' ? 'oil' : co.industry === 'iron' ? 'iron' : co.industry === 'copper' ? 'copper' : null;
  if (mineral && e.reserves[mineral] != null && e.reserves[mineral]! < 8) out.push({ label: `Depleting ${mineral} reserves (${Math.round(e.reserves[mineral]!)} years left)`, mult: Math.max(0.3, e.reserves[mineral]! / 8) });
  if (co.industry === 'electronics' || co.industry === 'wa') {
    const cut = mineralCutOff(w, n, 'rareearths') || mineralCutOff(w, n, 'lithium');
    if (cut) out.push({ label: `${cut} supply cut off`, mult: 0.85 });
  }
  return out;
}
/** When the main producer of a critical mineral embargoes a country that has little of its own. */
export function mineralCutOff(w: World, n: Nation, m: Mineral): string | null {
  if ((energyOf(n).share[m] ?? 0) >= 0.02) return null;
  let top: Nation | null = null;
  for (const x of w.nations) if (!top || (energyOf(x).share[m] ?? 0) > (energyOf(top).share[m] ?? 0)) top = x;
  if (!top || top.id === n.id) return null;
  return top.embargoes.includes(n.id) ? (m === 'rareearths' ? 'Rare earth' : 'Lithium') : null;
}

// ---------- the monthly turn: depletion, exploration, OPEC+ ----------

function energyMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const e = energyOf(n);
    for (const m of Object.keys(e.reserves) as Mineral[]) {
      e.reserves[m] = Math.max(0, (e.reserves[m] ?? 0) - 1 / 12);
      // Exploration finds more, faster with better energy technology and when reserves are low.
      const tech = capsOf(w, n).tech.energy / 100;
      if (chance(w, 0.004 * tech * (e.reserves[m]! < 15 ? 3 : 1))) {
        const add = Math.round(rand(w, 3, 15));
        e.reserves[m] = (e.reserves[m] ?? 0) + add;
        e.finds++;
        const text = `⛏️ Geologists found new ${m === 'rareearths' ? 'rare earth' : m} deposits in ${n.name}: about ${add} more years of production.`;
        (n.chronicle ??= []).push({ t: w.time, text });
        record(w, 'economy', text, { nation: n.id });
      }
    }
  }
  opecMonth(w);
}

/** OPEC+ meets monthly: cut output when oil is cheap, raise it when oil is dear. */
function opecMonth(w: World) {
  const o = (w.opec ??= { quota: 1, hist: [] });
  const r = worldPriceRatio(w, 'oil');
  const before = o.quota;
  if (r < 0.9) o.quota = Math.max(0.8, o.quota - 0.05);
  else if (r > 1.25) o.quota = Math.min(1.1, o.quota + 0.05);
  else o.quota += (1 - o.quota) * 0.2;
  o.quota = Math.round(o.quota * 1000) / 1000;
  o.hist.push(o.quota);
  if (o.hist.length > 60) o.hist.shift();
  if (Math.abs(o.quota - before) >= 0.04) {
    const text = o.quota < before ? `🛢️ OPEC+ agreed to cut oil output by ${Math.round((before - o.quota) * 100)}% to support prices.` : `🛢️ OPEC+ agreed to raise oil output by ${Math.round((o.quota - before) * 100)}% as prices climbed.`;
    for (const n of w.nations) if (OPEC_PLUS.includes(n.iso)) { (n.chronicle ??= []).push({ t: w.time, text }); }
    record(w, 'economy', text, {});
    if (OPEC_PLUS.includes(w.nations[player(w).nation].iso)) notify(w, 'economy', text);
  }
}
/** How OPEC+ output moves the world oil price (cutting 5% raises it about 10%). */
export const opecPriceFactor = (w: World) => 1 / Math.pow(w.opec?.quota ?? 1, 2);
/** OPEC+ members produce to quota (their oil companies' output). */
export const opecOutput = (w: World, n: Nation) => (OPEC_PLUS.includes(n.iso) ? w.opec?.quota ?? 1 : 1);

export function energyDaily(w: World) {
  blackoutsDaily(w);
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) energyMonth(w);
  if (dateAt(w.time).day === 1 && dateAt(w.time).month === 0) for (const n of w.nations) if (n.energy) { n.energy.lastYear = n.energy.blackouts; n.energy.blackouts = 0; }
}

export const hasEnergyData = (iso: string) => iso in ENERGY;
