// Energy and resources (1.9 Sky & ground). Electricity mixes are IEA shares of
// generation for 2023 (rounded; "bio" includes other renewables and geothermal).
// Fuel self-sufficiency is domestic production over consumption (EIA/Energy Institute,
// 2023, rounded). Reserves are years of current production (reserves-to-production
// ratios). World production shares for minerals are USGS 2024 estimates. Grid
// reliability is a rough share of demand met without interruption.
export type Source = 'coal' | 'gas' | 'oil' | 'nuclear' | 'hydro' | 'wind' | 'solar' | 'bio';
export const SOURCES: Source[] = ['coal', 'gas', 'oil', 'nuclear', 'hydro', 'wind', 'solar', 'bio'];
export const SOURCE_INFO: Record<Source, { label: string; color: string; fossil: boolean }> = {
  coal: { label: 'Coal', color: '#5a5a5a', fossil: true }, gas: { label: 'Gas', color: '#e39b3a', fossil: true }, oil: { label: 'Oil', color: '#8a5a2b', fossil: true },
  nuclear: { label: 'Nuclear', color: '#9b6bd6', fossil: false }, hydro: { label: 'Hydro', color: '#3a8fe3', fossil: false }, wind: { label: 'Wind', color: '#7fd3e0', fossil: false },
  solar: { label: 'Solar', color: '#f2d24b', fossil: false }, bio: { label: 'Bioenergy and other', color: '#6bbf59', fossil: false },
};
export type Fuel = 'oil' | 'gas' | 'coal';
export type Mineral = 'oil' | 'gas' | 'coal' | 'uranium' | 'lithium' | 'rareearths' | 'copper' | 'iron';
export const MINERAL_LABEL: Record<Mineral, string> = { oil: 'Oil', gas: 'Natural gas', coal: 'Coal', uranium: 'Uranium', lithium: 'Lithium', rareearths: 'Rare earths', copper: 'Copper', iron: 'Iron ore' };

export interface EnergyBaseline {
  mix: Record<Source, number>;
  self: Record<Fuel, number>; // production / consumption
  reserves: Partial<Record<Mineral, number>>; // years of production
  share: Partial<Record<Mineral, number>>; // share of world production
  grid: number; // reliability
}
const M = (coal: number, gas: number, oil: number, nuclear: number, hydro: number, wind: number, solar: number, bio: number): Record<Source, number> => ({ coal, gas, oil, nuclear, hydro, wind, solar, bio });

export const ENERGY: Record<string, EnergyBaseline> = {
  USA: { mix: M(0.16, 0.43, 0.01, 0.18, 0.06, 0.1, 0.05, 0.01), self: { oil: 1.0, gas: 1.1, coal: 1.1 }, reserves: { oil: 11, gas: 14, coal: 400, copper: 25, lithium: 60, rareearths: 45 }, share: { oil: 0.2, gas: 0.25, coal: 0.06, copper: 0.05, rareearths: 0.12, lithium: 0.01, iron: 0.02, uranium: 0.01 }, grid: 0.995 },
  CAN: { mix: M(0.04, 0.12, 0.01, 0.13, 0.61, 0.06, 0.01, 0.02), self: { oil: 2.5, gas: 1.5, coal: 2 }, reserves: { oil: 90, gas: 13, uranium: 60, copper: 20 }, share: { oil: 0.06, gas: 0.05, uranium: 0.15, copper: 0.02, iron: 0.03, lithium: 0.01 }, grid: 0.995 },
  MEX: { mix: M(0.05, 0.6, 0.08, 0.03, 0.08, 0.06, 0.07, 0.03), self: { oil: 1.2, gas: 0.35, coal: 0.6 }, reserves: { oil: 8, copper: 25 }, share: { oil: 0.02, copper: 0.03 }, grid: 0.97 },
  BRA: { mix: M(0.02, 0.06, 0.02, 0.02, 0.6, 0.13, 0.07, 0.08), self: { oil: 1.4, gas: 0.6, coal: 0.3 }, reserves: { oil: 12, iron: 70, lithium: 20, rareearths: 200 }, share: { oil: 0.04, iron: 0.17, lithium: 0.03 }, grid: 0.97 },
  ARG: { mix: M(0.01, 0.55, 0.03, 0.06, 0.25, 0.09, 0.01, 0.0), self: { oil: 1.1, gas: 0.9, coal: 0.1 }, reserves: { oil: 10, gas: 9, lithium: 80 }, share: { lithium: 0.05 }, grid: 0.95 },
  GBR: { mix: M(0.01, 0.34, 0.01, 0.14, 0.02, 0.29, 0.05, 0.14), self: { oil: 0.6, gas: 0.45, coal: 0.2 }, reserves: { oil: 5, gas: 6 }, share: { oil: 0.01 }, grid: 0.998 },
  DEU: { mix: M(0.26, 0.15, 0.01, 0.01, 0.04, 0.27, 0.12, 0.14), self: { oil: 0.03, gas: 0.05, coal: 0.7 }, reserves: { coal: 40 }, share: { coal: 0.01 }, grid: 0.999 },
  RUS: { mix: M(0.17, 0.43, 0.01, 0.19, 0.19, 0.01, 0.0, 0.0), self: { oil: 3.0, gas: 1.6, coal: 2 }, reserves: { oil: 25, gas: 60, coal: 400, uranium: 50, copper: 50, iron: 60 }, share: { oil: 0.12, gas: 0.15, coal: 0.05, uranium: 0.05, copper: 0.04, iron: 0.04, rareearths: 0.01 }, grid: 0.98 },
  TUR: { mix: M(0.36, 0.21, 0.0, 0.0, 0.2, 0.11, 0.06, 0.06), self: { oil: 0.08, gas: 0.01, coal: 0.5 }, reserves: { coal: 100 }, share: { coal: 0.01 }, grid: 0.98 },
  SAU: { mix: M(0.0, 0.64, 0.35, 0.0, 0.0, 0.0, 0.01, 0.0), self: { oil: 3.0, gas: 1.0, coal: 0 }, reserves: { oil: 70, gas: 50 }, share: { oil: 0.12, gas: 0.03 }, grid: 0.99 },
  ZAF: { mix: M(0.82, 0.0, 0.01, 0.04, 0.02, 0.06, 0.05, 0.0), self: { oil: 0.02, gas: 0.1, coal: 1.3 }, reserves: { coal: 40, iron: 30 }, share: { coal: 0.03, iron: 0.03 }, grid: 0.85 },
  IND: { mix: M(0.74, 0.03, 0.0, 0.03, 0.08, 0.05, 0.06, 0.01), self: { oil: 0.15, gas: 0.5, coal: 0.8 }, reserves: { coal: 110, iron: 40 }, share: { coal: 0.11, iron: 0.1, rareearths: 0.01, uranium: 0.01 }, grid: 0.93 },
  CHN: { mix: M(0.61, 0.03, 0.0, 0.05, 0.13, 0.09, 0.06, 0.03), self: { oil: 0.28, gas: 0.6, coal: 0.95 }, reserves: { oil: 18, gas: 40, coal: 40, rareearths: 200, lithium: 30 }, share: { oil: 0.05, gas: 0.06, coal: 0.5, rareearths: 0.69, lithium: 0.18, copper: 0.08, iron: 0.15, uranium: 0.03 }, grid: 0.99 },
  JPN: { mix: M(0.29, 0.33, 0.04, 0.08, 0.08, 0.01, 0.11, 0.06), self: { oil: 0.0, gas: 0.0, coal: 0 }, reserves: {}, share: {}, grid: 0.999 },
  KOR: { mix: M(0.34, 0.27, 0.01, 0.3, 0.01, 0.01, 0.05, 0.01), self: { oil: 0.0, gas: 0.0, coal: 0 }, reserves: {}, share: {}, grid: 0.999 },
  AUS: { mix: M(0.46, 0.17, 0.02, 0.0, 0.06, 0.12, 0.16, 0.01), self: { oil: 0.3, gas: 3.0, coal: 12 }, reserves: { coal: 300, gas: 30, iron: 60, lithium: 30, uranium: 120, rareearths: 70 }, share: { coal: 0.06, gas: 0.04, iron: 0.37, lithium: 0.47, rareearths: 0.05, uranium: 0.09, copper: 0.04 }, grid: 0.995 },
};
export const energyBaseline = (iso: string): EnergyBaseline => ENERGY[iso] ?? ENERGY.ARG;
/** The OPEC+ members on the map. */
export const OPEC_PLUS = ['SAU', 'RUS', 'MEX'];
