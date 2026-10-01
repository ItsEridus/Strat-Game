// National baselines for the strategic engine (1.6 GEO 2): where each country stands
// at the start of 2025. Sources (rounded): IMF World Economic Outlook (October 2024 and
// April 2025: shares of world GDP at market rates, medium-term growth, gross government
// debt), UNESCO/OECD (R&D spending), World Bank Worldwide Governance Indicators (rule of
// law, control of corruption, government effectiveness; percentile / 100), RSF (press
// freedom, / 100), WIPO Global Innovation Index and SIPRI for the technology domains
// (0–100, the leader near 100).
export type TechDomain = 'industrial' | 'military' | 'information' | 'medical' | 'energy' | 'space';
export const TECH_DOMAINS: TechDomain[] = ['industrial', 'military', 'information', 'medical', 'energy', 'space'];
export const TECH_LABEL: Record<TechDomain, string> = { industrial: 'Industrial', military: 'Military', information: 'Information', medical: 'Medical', energy: 'Energy', space: 'Space' };

export interface Baseline {
  gdpShare: number; // % of world GDP
  growth: number; // potential real growth, % a year
  debt: number; // gross government debt, % of GDP
  rd: number; // R&D spending, % of GDP
  law: number; corruption: number; effectiveness: number; press: number; // institutions, 0..1
  tech: Record<TechDomain, number>;
}

const T = (industrial: number, military: number, information: number, medical: number, energy: number, space: number): Record<TechDomain, number> => ({ industrial, military, information, medical, energy, space });

export const BASELINES: Record<string, Baseline> = {
  USA: { gdpShare: 26.3, growth: 2.0, debt: 121, rd: 3.5, law: 0.88, corruption: 0.85, effectiveness: 0.88, press: 0.66, tech: T(92, 100, 100, 100, 90, 100) },
  CAN: { gdpShare: 2.0, growth: 1.6, debt: 107, rd: 1.7, law: 0.93, corruption: 0.93, effectiveness: 0.9, press: 0.81, tech: T(78, 62, 80, 82, 82, 55) },
  MEX: { gdpShare: 1.7, growth: 2.0, debt: 58, rd: 0.3, law: 0.25, corruption: 0.18, effectiveness: 0.4, press: 0.45, tech: T(55, 35, 48, 50, 50, 20) },
  BRA: { gdpShare: 2.1, growth: 2.2, debt: 87, rd: 1.2, law: 0.45, corruption: 0.4, effectiveness: 0.45, press: 0.63, tech: T(55, 45, 55, 58, 65, 35) },
  ARG: { gdpShare: 0.6, growth: 3.0, debt: 85, rd: 0.5, law: 0.4, corruption: 0.45, effectiveness: 0.4, press: 0.6, tech: T(50, 38, 52, 55, 55, 35) },
  GBR: { gdpShare: 3.4, growth: 1.4, debt: 101, rd: 2.9, law: 0.91, corruption: 0.91, effectiveness: 0.86, press: 0.78, tech: T(82, 85, 88, 92, 80, 65) },
  DEU: { gdpShare: 4.5, growth: 0.9, debt: 63, rd: 3.1, law: 0.93, corruption: 0.95, effectiveness: 0.88, press: 0.83, tech: T(92, 78, 82, 88, 85, 60) },
  RUS: { gdpShare: 2.0, growth: 1.2, debt: 20, rd: 1.0, law: 0.13, corruption: 0.12, effectiveness: 0.35, press: 0.25, tech: T(62, 85, 60, 55, 75, 80) },
  TUR: { gdpShare: 1.3, growth: 3.2, debt: 25, rd: 1.3, law: 0.35, corruption: 0.35, effectiveness: 0.5, press: 0.32, tech: T(62, 62, 55, 58, 55, 35) },
  SAU: { gdpShare: 1.0, growth: 3.3, debt: 26, rd: 0.5, law: 0.55, corruption: 0.6, effectiveness: 0.62, press: 0.3, tech: T(50, 55, 52, 55, 70, 30) },
  ZAF: { gdpShare: 0.4, growth: 1.4, debt: 75, rd: 0.6, law: 0.48, corruption: 0.45, effectiveness: 0.48, press: 0.72, tech: T(50, 40, 50, 55, 50, 30) },
  IND: { gdpShare: 3.9, growth: 6.3, debt: 83, rd: 0.7, law: 0.52, corruption: 0.45, effectiveness: 0.62, press: 0.31, tech: T(60, 65, 72, 62, 58, 70) },
  CHN: { gdpShare: 16.9, growth: 3.6, debt: 90, rd: 2.6, law: 0.45, corruption: 0.5, effectiveness: 0.72, press: 0.23, tech: T(90, 85, 85, 75, 90, 88) },
  JPN: { gdpShare: 3.9, growth: 0.5, debt: 237, rd: 3.4, law: 0.9, corruption: 0.9, effectiveness: 0.92, press: 0.63, tech: T(90, 72, 85, 90, 82, 70) },
  KOR: { gdpShare: 1.7, growth: 2.0, debt: 54, rd: 4.9, law: 0.85, corruption: 0.78, effectiveness: 0.88, press: 0.64, tech: T(88, 75, 90, 82, 78, 50) },
  AUS: { gdpShare: 1.6, growth: 2.2, debt: 50, rd: 1.7, law: 0.94, corruption: 0.93, effectiveness: 0.9, press: 0.77, tech: T(72, 68, 78, 85, 75, 45) },
};
export const baselineOf = (iso: string): Baseline => BASELINES[iso] ?? BASELINES.ARG;
