// Ideologies as explicit data-driven modifiers (WIKI directions; magnitudes SOLO).
// A nation's combined effect is the congress-seat-weighted average: each value
// below is the full effect at 100% of congress.
import type { Ideology } from '../sim/types';

export interface IdeoEffects {
  production: number; // private company output
  stateProduction: number; // state-owned company output
  coreDefense: number; // damage defending own core regions
  abroadDamage: number; // damage attacking outside own cores
  homeDefense: number; // damage defending own regions (non-core included)
  construction: number; // construction points
  constructionCost: number; // construction material requirement
  nukeCost: number; // nuclear material/time
  citizenDamage: number; // all citizen damage
  importTaxFloor: number; // minimum import tax (percentage points)
  domestic: number; // bonus to trades between compatriots (VAT relief, fraction)
}

const Z: IdeoEffects = { production: 0, stateProduction: 0, coreDefense: 0, abroadDamage: 0, homeDefense: 0, construction: 0, constructionCost: 0, nukeCost: 0, citizenDamage: 0, importTaxFloor: 0, domestic: 0 };

export const IDEOLOGIES: Record<Ideology, { name: string; color: string; desc: string; fx: IdeoEffects; hawk: number; taxPref: number }> = {
  capitalism: { name: 'Capitalism', color: '#3d8fd6', desc: 'Production and lower taxation (lowers tax ceilings).', fx: { ...Z, production: 0.1 }, hawk: 0.35, taxPref: -1 },
  nationalism: { name: 'Nationalism', color: '#c0392b', desc: 'Core-region defense; weaker abroad.', fx: { ...Z, coreDefense: 0.15, abroadDamage: -0.1 }, hawk: 0.6, taxPref: 0 },
  centralism: { name: 'Centralism', color: '#7f8c8d', desc: 'Construction and nuclear development; costlier construction; citizen damage tradeoff.', fx: { ...Z, construction: 0.2, constructionCost: 0.15, nukeCost: -0.3, citizenDamage: -0.05 }, hawk: 0.5, taxPref: 0.5 },
  socialism: { name: 'Socialism', color: '#e67e22', desc: 'State production and domestic cooperation.', fx: { ...Z, stateProduction: 0.2, domestic: 0.5 }, hawk: 0.3, taxPref: 0.6 },
  imperialism: { name: 'Imperialism', color: '#8e44ad', desc: 'Expansion abroad; weaker homeland defense.', fx: { ...Z, abroadDamage: 0.15, homeDefense: -0.1 }, hawk: 0.9, taxPref: 0.2 },
  communism: { name: 'Communism', color: '#a93226', desc: 'Trade restrictions and higher tax ceilings.', fx: { ...Z, importTaxFloor: 10 }, hawk: 0.55, taxPref: 1 },
};

export const IDEOLOGY_LIST = Object.keys(IDEOLOGIES) as Ideology[];
