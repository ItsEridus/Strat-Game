// Intelligence services as organisations (2.1 Shadows): the eight directorates of a
// modern service and how strong each country's was at the start of 2025 (0–100).
// Rough judgements from public sources (budgets, reported capabilities, the size of
// signals and satellite programmes, known operations), rounded; they are a starting
// point that budgets, technology, staff and experience then move.
export type Directorate = 'humint' | 'sigint' | 'imagery' | 'osint' | 'cyber' | 'analysis' | 'covert' | 'counter';
export const DIRECTORATES: Directorate[] = ['humint', 'sigint', 'imagery', 'osint', 'cyber', 'analysis', 'covert', 'counter'];
export const DIR_INFO: Record<Directorate, { label: string; icon: string; desc: string; tech: 'information' | 'space' | null }> = {
  humint: { label: 'Human intelligence', icon: '🧑‍💼', desc: 'Case officers recruit and run agents abroad: builds networks.', tech: null },
  sigint: { label: 'Signals intelligence', icon: '📡', desc: 'Intercepts communications: reconnaissance and estimates.', tech: 'information' },
  imagery: { label: 'Imagery and geospatial', icon: '🛰️', desc: 'Satellites and aircraft photograph forces: the order of battle.', tech: 'space' },
  osint: { label: 'Open sources', icon: '📰', desc: 'Reads the press, trade data and the internet: cheap, broad estimates.', tech: 'information' },
  cyber: { label: 'Cyber', icon: '💻', desc: 'Breaks into networks: theft and quiet collection.', tech: 'information' },
  analysis: { label: 'Analysis', icon: '🧠', desc: 'Turns raw reports into judgements: the quality of dossiers and estimates.', tech: null },
  covert: { label: 'Covert action', icon: '🎭', desc: 'Sabotage, influence and scandals: deniable action abroad.', tech: null },
  counter: { label: 'Counter-intelligence', icon: '🛡️', desc: 'Vetting, mole hunts and catching foreign agents at home.', tech: null },
};
type Row = [number, number, number, number, number, number, number, number]; // in DIRECTORATES order
const BASE: Record<string, Row> = {
  USA: [75, 98, 98, 85, 95, 85, 80, 75],
  GBR: [80, 90, 60, 80, 85, 85, 70, 80],
  RUS: [85, 75, 60, 60, 85, 65, 85, 85],
  CHN: [80, 85, 80, 75, 92, 70, 60, 90],
  DEU: [55, 60, 45, 70, 60, 70, 30, 60],
  JPN: [35, 60, 55, 70, 50, 65, 15, 50],
  KOR: [55, 65, 50, 65, 60, 65, 40, 70],
  IND: [60, 55, 55, 55, 55, 55, 50, 60],
  TUR: [60, 50, 40, 50, 50, 50, 55, 65],
  SAU: [50, 45, 35, 40, 45, 40, 50, 60],
  AUS: [55, 75, 50, 70, 65, 70, 40, 65],
  CAN: [45, 70, 40, 70, 60, 65, 20, 55],
  BRA: [35, 35, 30, 45, 35, 40, 20, 35],
  ARG: [30, 25, 20, 40, 25, 35, 15, 30],
  MEX: [30, 30, 20, 40, 25, 35, 15, 30],
  ZAF: [30, 30, 20, 40, 25, 35, 15, 30],
};
export function dirBaseline(iso: string): Record<Directorate, number> {
  const r = BASE[iso] ?? [35, 35, 25, 45, 30, 40, 20, 35];
  return Object.fromEntries(DIRECTORATES.map((d, i) => [d, r[i]])) as Record<Directorate, number>;
}
