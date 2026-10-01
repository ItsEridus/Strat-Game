// The arsenal (1.8 GEO 3: militaries get better). Each country's defence budget starts
// at its real share of GDP and splits into personnel, operations and maintenance,
// procurement and R&D. Equipment is tracked by class (fighters, armour, submarines…),
// each with a generation and an average age. Formations field a mix of generations,
// and quality counts in combat. Procurement renews equipment, bringing the average age
// down and the generation up towards the best the country can field. Without
// procurement, equipment ages, wears faster and fights worse.
import type { Formation, FormationKind, Id, Nation, World } from './types';
import { B } from '../data/balance';
import { CLASS_INFO, EQUIP_CLASSES, defenceBaseline, defenceShare, type EquipClass } from '../data/arsenal';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { companyCurrency, coref, hhref, natref } from './query';
import { capsOf, historyPace } from './strategic';
import { dailyRevenue } from './publicFinance';
import { cutOff, defenceIndustryMonth, deliveryInputs, orderInstalments } from './defenceIndustry';

export interface ClassState { gen: number; age: number; frontier: number; supplier?: Id } // supplier: the country it was bought from (spare parts)
export type Arsenal = Record<EquipClass, ClassState>;
export interface DefenceSplit { personnel: number; om: number; procurement: number; rd: number }

/** Which equipment classes each kind of formation fights with (weights). */
export const KIND_CLASSES: Record<FormationKind, Partial<Record<EquipClass, number>>> = {
  infantry: { smallarms: 0.45, artillery: 0.25, helicopters: 0.1, drones: 0.1, c4isr: 0.1 },
  armored: { armour: 0.5, artillery: 0.2, airdefence: 0.1, drones: 0.1, c4isr: 0.1 },
  mountain: { smallarms: 0.5, artillery: 0.2, helicopters: 0.2, c4isr: 0.1 },
  marines: { smallarms: 0.4, armour: 0.2, helicopters: 0.2, c4isr: 0.2 },
  fleet: { surface: 0.55, missiles: 0.2, ew: 0.1, c4isr: 0.15 },
  carrier: { carriers: 0.45, fighters: 0.3, surface: 0.1, c4isr: 0.15 },
  submarine: { submarines: 0.7, missiles: 0.2, c4isr: 0.1 },
  fighter: { fighters: 0.65, ew: 0.15, c4isr: 0.2 },
  bomber: { bombers: 0.55, missiles: 0.3, ew: 0.15 },
};

/** Default generation of a class from the country's military technology (used where no override is given). */
function defaultGen(n: Nation, w: World, cls: EquipClass): number {
  if (cls === 'bombers' || cls === 'carriers') return 0;
  const tech = capsOf(w, n).tech.military;
  return Math.round((2.5 + (tech / 100) * 2) * 2) / 2;
}

export function arsenalOf(w: World, n: Nation): Arsenal {
  if (n.arsenal) return n.arsenal;
  const d = defenceBaseline(n.iso);
  const a = {} as Arsenal;
  EQUIP_CLASSES.forEach((cls, i) => {
    const gen = d.gen[cls] ?? defaultGen(n, w, cls);
    // Ages vary a little by class around the national average.
    const age = gen ? Math.max(3, Math.round(d.age * (0.75 + ((i * 37 + n.id * 11) % 50) / 100))) : 0;
    a[cls] = { gen, age, frontier: gen };
  });
  n.arsenal = a;
  return a;
}

/** The defence budget's split (and, on first use, the real budget share). */
export function splitOf(n: Nation): DefenceSplit {
  if (n.defense.split) return n.defense.split;
  // Worlds made before 1.8 used one default share for everyone: start from the real one instead.
  if (Math.abs(n.defense.budget - B.forces.budget) < 1e-9) n.defense.budget = defenceShare(n.iso);
  n.defense.split = { ...defenceBaseline(n.iso).split };
  return n.defense.split;
}
/** The usual defence line for a country (its real 2025 share of revenue). */
export const defenceNorm = (n: Nation) => defenceShare(n.iso);
/** Defence spending as a share of GDP, from the share of revenue. */
export const milexOfGdp = (n: Nation) => n.defense.budget * defenceBaseline(n.iso).revenue;

/** Effective generation of a class: late in its service life (past 85%), equipment loses its edge. */
export function effectiveGen(cls: EquipClass, s: ClassState): number {
  if (!s.gen) return 0;
  const over = Math.max(0, s.age - CLASS_INFO[cls].life * 0.85);
  return Math.max(1, s.gen - over * 0.04);
}

/** The national generation for a kind of formation (weighted over its classes; missing classes count as generation 1). */
export function kindGen(w: World, n: Nation, kind: FormationKind): number {
  const a = arsenalOf(w, n);
  let t = 0, wsum = 0;
  for (const [cls, wt] of Object.entries(KIND_CLASSES[kind]) as [EquipClass, number][]) { t += (effectiveGen(cls, a[cls]) || 1) * wt; wsum += wt; }
  return wsum ? t / wsum : 3;
}
export const formationGen = (w: World, f: Formation) => f.gen ?? kindGen(w, w.nations[f.nation], f.kind);
/** Combat multiplier from equipment quality: generation 3 = 1.0, each generation ±15%. */
export const qualityFactor = (gen: number) => Math.max(0.6, 0.55 + 0.15 * gen);
/** Extra wear on old equipment. */
export function wearFactor(w: World, f: Formation): number {
  const a = arsenalOf(w, w.nations[f.nation]);
  let over = 0;
  let cut = false;
  for (const cls of Object.keys(KIND_CLASSES[f.kind]) as EquipClass[]) if (a[cls].gen) { over = Math.max(over, a[cls].age - CLASS_INFO[cls].life * 0.85); cut ||= cutOff(w, w.nations[f.nation], cls); }
  return (1 + Math.max(0, over) * 0.03) * (cut ? 2 : 1);
}

// ---------- money ----------

/** The domestic defence contractor (the largest aerospace or ground-weapons maker), if any. */
export function contractorOf(w: World, nation: Id) {
  let best = null as null | { id: Id; v: number };
  for (const co of Object.values(w.companies)) {
    if ((co.industry !== 'wa' && co.industry !== 'wg') || w.regions[co.region].owner !== nation) continue;
    const v = co.workers.length * 10 + co.q;
    if (!best || v > best.v) best = { id: co.id, v };
  }
  return best ? w.companies[best.id] : null;
}

/** Upkeep scale: personnel and operations take their share of the budget at the start (set on first use). */
export function upkeepScale(w: World, n: Nation, needRaw: number): number {
  if (n.defense.upkeepK != null) return n.defense.upkeepK;
  const rev = dailyRevenue(n);
  if (rev <= 0 || needRaw <= 0) return 1;
  const s = splitOf(n);
  n.defense.upkeepK = Math.max(0.05, Math.min(10, ((s.personnel + s.om) * rev * n.defense.budget) / needRaw));
  return n.defense.upkeepK;
}

/** Daily: procurement contracts and R&D, paid to the domestic contractor (or into the economy). Returns what was spent. */
export function defenceContracts(w: World, n: Nation, available: number): { procurement: number; rd: number } {
  const s = splitOf(n);
  const base = Math.max(0, Math.round(dailyRevenue(n) * n.defense.budget));
  const want = { procurement: Math.max(0, Math.round(base * s.procurement * 0.7 - orderInstalments(n) / 30)), rd: Math.round(base * s.rd) }; // the rest of procurement buys supplies and spares (forces.ts)
  const out = { procurement: 0, rd: 0 };
  const co = contractorOf(w, n.id);
  const to = co && companyCurrency(w, co) === n.cur ? coref(co.id) : hhref(n.id);
  let left = Math.max(0, Math.min(available, n.wallet[n.cur] ?? 0));
  for (const k of ['procurement', 'rd'] as const) {
    const amt = Math.min(want[k], left);
    if (amt > 0 && pay(w, natref(n.id), to, n.cur, amt, k === 'rd' ? 'Defence R&D contracts' : 'Defence procurement contracts')) { out[k] = amt; left -= amt; n.stats.spendToday += amt; }
  }
  const d = (n.defense.month ??= { procurement: 0, rd: 0, days: 0 });
  d.procurement += out.procurement; d.rd += out.rd; d.days++;
  return out;
}

// ---------- monthly: ageing and renewal ----------

/** One month: equipment ages; procurement renews it in proportion to spending against the country's usual level. */
export function arsenalMonth(w: World, n: Nation, reset = true) {
  const a = arsenalOf(w, n);
  splitOf(n);
  const m = n.defense.month ?? { procurement: 0, rd: 0, days: 0 };
  const norm = Math.max(1, dailyRevenue(n) * defenceNorm(n) * defenceBaseline(n.iso).split.procurement * 0.7 * Math.max(1, m.days));
  // Renewal follows procurement spending, and needs the contractor's goods to build with.
  const effort = (m.days ? Math.min(3, m.procurement / norm) : 1) * deliveryInputs(w, n, m.procurement);
  defenceIndustryMonth(w, n, m.rd, m.days ? m.procurement : Infinity);
  for (const cls of EQUIP_CLASSES) {
    const st = a[cls];
    if (!st.gen) continue;
    st.age += 1 / 12;
    // At the usual level of spending the average age settles near half the service life.
    const r = Math.min(0.2, ((2 * effort) / CLASS_INFO[cls].life) / 12);
    st.age = Math.max(0, st.age * (1 - r));
    st.gen = Math.round((st.gen + (st.frontier - st.gen) * r * 1.5) * 1000) / 1000;
  }
  if (reset) n.defense.month = { procurement: 0, rd: 0, days: 0 };
  // Formations drift towards the national mix as deliveries reach them.
  for (const f of Object.values(w.forces)) if (f.nation === n.id) { const g = kindGen(w, n, f.kind); f.gen = f.gen == null ? g : Math.round((f.gen + (g - f.gen) * 0.15) * 1000) / 1000; }
}

export function arsenalDaily(w: World) {
  if (dateAt(w.time).day !== 1) return;
  const pace = historyPace(w);
  for (let k = 0; k < pace; k++) for (const n of w.nations) if (!n.exile) arsenalMonth(w, n, k === pace - 1);
}

