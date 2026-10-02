// New states (2.3 Rise & fall) inherit the real-world data of the country they left
// (economic baselines, energy, defence, intelligence) until they build their own.
// Their economic weight is their share of the old country's people, and the old country
// keeps the rest (gdpScale).
const ALIAS: Record<string, string> = {};
const SCALE: Record<string, number> = {};
export const setIsoAlias = (iso: string, parent: string) => { ALIAS[iso] = ALIAS[parent] ?? parent; };
export const dataIso = (iso: string) => ALIAS[iso] ?? iso;
/** The share of its data country's economy a country has (1 for the original countries). */
export const gdpScale = (iso: string) => SCALE[iso] ?? 1;
export const resetGdpScales = () => { for (const k of Object.keys(SCALE)) delete SCALE[k]; };
/** A state leaving `parent` with `share` of its people. */
export const splitGdp = (iso: string, parent: string, share: number) => { SCALE[iso] = gdpScale(parent) * share; SCALE[parent] = gdpScale(parent) * (1 - share); };
