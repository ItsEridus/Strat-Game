// Defence data (1.8 Arsenal). Military spending as a share of GDP is SIPRI's 2024
// estimate (rounded); general government revenue as a share of GDP is the IMF's, so the
// defence line can be expressed as a share of revenue, as the game's budgets are.
// Budget splits follow NATO and national defence reports (personnel, operations and
// maintenance, procurement, R&D). Equipment generations are a 1–6 scale for each class
// (for fighters: 3 = MiG-21/F-5, 4 = F-16/Su-27, 4.5 = Rafale/Su-35, 5 = F-35/J-20,
// 6 = the next generation); 0 means the country does not field that class.
import { dataIso } from './isoAlias';
export type EquipClass =
  | 'smallarms' | 'armour' | 'artillery' | 'airdefence' | 'fighters' | 'bombers' | 'drones' | 'helicopters'
  | 'surface' | 'submarines' | 'carriers' | 'missiles' | 'c4isr' | 'ew';
export const EQUIP_CLASSES: EquipClass[] = ['smallarms', 'armour', 'artillery', 'airdefence', 'fighters', 'bombers', 'drones', 'helicopters', 'surface', 'submarines', 'carriers', 'missiles', 'c4isr', 'ew'];
export const CLASS_INFO: Record<EquipClass, { label: string; icon: string; life: number; build: [number, number] }> = {
  // life: service life in years before ageing bites; build: years from programme start to service (min, max)
  smallarms: { label: 'Small arms', icon: '🔫', life: 30, build: [3, 6] },
  armour: { label: 'Armour', icon: '🛡️', life: 35, build: [6, 12] },
  artillery: { label: 'Artillery', icon: '💥', life: 30, build: [5, 10] },
  airdefence: { label: 'Air defence', icon: '📡', life: 30, build: [8, 14] },
  fighters: { label: 'Fighters', icon: '✈️', life: 35, build: [10, 20] },
  bombers: { label: 'Bombers', icon: '💣', life: 45, build: [12, 20] },
  drones: { label: 'Drones', icon: '🛸', life: 15, build: [3, 7] },
  helicopters: { label: 'Helicopters', icon: '🚁', life: 35, build: [8, 14] },
  surface: { label: 'Surface combatants', icon: '🚢', life: 35, build: [5, 10] },
  submarines: { label: 'Submarines', icon: '🐋', life: 35, build: [8, 15] },
  carriers: { label: 'Carriers', icon: '🛳️', life: 50, build: [10, 15] },
  missiles: { label: 'Missiles', icon: '🚀', life: 25, build: [6, 12] },
  c4isr: { label: 'Command and surveillance', icon: '🛰️', life: 15, build: [4, 8] },
  ew: { label: 'Electronic warfare', icon: '📶', life: 15, build: [4, 8] },
};

export interface DefenceBaseline {
  milex: number; // military spending, % of GDP (SIPRI 2024)
  revenue: number; // general government revenue, % of GDP (IMF)
  split: { personnel: number; om: number; procurement: number; rd: number };
  gen: Partial<Record<EquipClass, number>>; // overrides of the default generation
  age: number; // average age of major equipment in years
}

const S = (personnel: number, om: number, procurement: number, rd: number) => ({ personnel, om, procurement, rd });
export const DEFENCE: Record<string, DefenceBaseline> = {
  USA: { milex: 3.4, revenue: 30, split: S(0.27, 0.38, 0.2, 0.15), age: 22, gen: { fighters: 5, bombers: 5, drones: 5, armour: 4.5, airdefence: 5, surface: 4.5, submarines: 5, carriers: 5, missiles: 4.5, c4isr: 5.5, ew: 5.5, helicopters: 4.5 } },
  CAN: { milex: 1.3, revenue: 41, split: S(0.45, 0.3, 0.2, 0.05), age: 28, gen: { fighters: 4, bombers: 0, submarines: 3.5, carriers: 0, missiles: 3.5 } },
  MEX: { milex: 0.7, revenue: 24, split: S(0.65, 0.25, 0.08, 0.02), age: 30, gen: { fighters: 3, bombers: 0, submarines: 0, carriers: 0, missiles: 2.5, armour: 3 } },
  BRA: { milex: 1.1, revenue: 40, split: S(0.75, 0.13, 0.1, 0.02), age: 28, gen: { fighters: 4.5, bombers: 0, carriers: 0, submarines: 4 } },
  ARG: { milex: 0.5, revenue: 34, split: S(0.8, 0.12, 0.06, 0.02), age: 38, gen: { fighters: 3.5, bombers: 0, carriers: 0, submarines: 2.5, missiles: 2.5 } },
  GBR: { milex: 2.3, revenue: 40, split: S(0.33, 0.3, 0.27, 0.1), age: 20, gen: { fighters: 5, bombers: 0, carriers: 4.5, submarines: 5, c4isr: 5, ew: 5 } },
  DEU: { milex: 1.9, revenue: 46, split: S(0.38, 0.32, 0.24, 0.06), age: 24, gen: { fighters: 4.5, bombers: 0, carriers: 0, armour: 4.5, artillery: 4.5, submarines: 4.5 } },
  RUS: { milex: 7.1, revenue: 35, split: S(0.3, 0.3, 0.32, 0.08), age: 25, gen: { fighters: 4.5, bombers: 4, armour: 4, carriers: 3, missiles: 5, submarines: 4.5, airdefence: 5, ew: 4.5, drones: 4 } },
  TUR: { milex: 1.8, revenue: 30, split: S(0.45, 0.25, 0.25, 0.05), age: 25, gen: { fighters: 4, bombers: 0, carriers: 0, drones: 4.5, armour: 4 } },
  SAU: { milex: 7.3, revenue: 30, split: S(0.4, 0.3, 0.28, 0.02), age: 18, gen: { fighters: 4.5, bombers: 0, carriers: 0, submarines: 0, airdefence: 4.5 } },
  ZAF: { milex: 0.7, revenue: 28, split: S(0.65, 0.25, 0.07, 0.03), age: 32, gen: { fighters: 4, bombers: 0, carriers: 0, submarines: 3.5 } },
  IND: { milex: 2.3, revenue: 20, split: S(0.55, 0.17, 0.23, 0.05), age: 26, gen: { fighters: 4.5, bombers: 0, carriers: 3.5, submarines: 4, missiles: 4.5 } },
  CHN: { milex: 1.7, revenue: 26, split: S(0.3, 0.3, 0.3, 0.1), age: 14, gen: { fighters: 5, bombers: 3.5, carriers: 4, submarines: 4, missiles: 5, drones: 4.5, surface: 4.5, airdefence: 4.5 } },
  JPN: { milex: 1.4, revenue: 37, split: S(0.38, 0.32, 0.25, 0.05), age: 20, gen: { fighters: 5, bombers: 0, carriers: 3.5, submarines: 4.5, surface: 4.5, airdefence: 4.5 } },
  KOR: { milex: 2.6, revenue: 35, split: S(0.38, 0.22, 0.32, 0.08), age: 18, gen: { fighters: 4.5, bombers: 0, carriers: 0, armour: 4.5, artillery: 4.5, submarines: 4 } },
  AUS: { milex: 2.0, revenue: 36, split: S(0.35, 0.3, 0.3, 0.05), age: 20, gen: { fighters: 5, bombers: 0, carriers: 0, submarines: 3.5 } },
};
export const defenceBaseline = (iso: string): DefenceBaseline => DEFENCE[dataIso(iso)] ?? DEFENCE.ARG;
/** The defence line as a share of government revenue. */
export const defenceShare = (iso: string) => { const d = defenceBaseline(iso); return Math.round((d.milex / d.revenue) * 1000) / 1000; };
