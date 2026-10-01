// New states (2.3 Rise & fall) inherit the real-world data of the country they left
// (economic baselines, energy, defence, intelligence) until they build their own.
const ALIAS: Record<string, string> = {};
export const setIsoAlias = (iso: string, parent: string) => { ALIAS[iso] = ALIAS[parent] ?? parent; };
export const dataIso = (iso: string) => ALIAS[iso] ?? iso;
