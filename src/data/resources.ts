// Where the raw materials added in 1.3.3 come from. Regions named here are
// notable real producers and get rich deposits; elsewhere terrain and climate
// decide (sim/worldgen.ts placeNewDeposits).
import type { Industry, RawRes, Terrain } from '../sim/types';

export const NEW_RAWS: RawRes[] = ['timber', 'cotton', 'copper'];
/** Every industry added in 1.3.3 (they start small in new worlds and grow with demand). */
export const NEW_INDUSTRIES: Industry[] = [...NEW_RAWS, 'materials', 'clothing', 'electronics', 'medicine'];

export const HOTSPOTS: Partial<Record<RawRes, string[]>> = {
  timber: [
    'Oregon', 'Washington', 'Georgia', 'Maine', 'Mississippi', 'Alaska', 'British Columbia', 'Quebec', 'Ontario', 'New Brunswick',
    'Pará', 'Amazonas', 'Paraná', 'Krasnoyarsk Krai', 'Irkutsk Oblast', 'Arkhangelsk Oblast', 'Komi Republic', 'Republic of Karelia',
    'Heilongjiang', 'Yunnan', 'Guangxi', 'Bavaria', 'Baden-Württemberg', 'Hokkaidō', 'Akita', 'Aomori', 'Gangwon', 'Tasmania',
    'Misiones', 'Mpumalanga', 'Chihuahua', 'Durango', 'Kastamonu', 'Madhya Pradesh',
  ],
  cotton: [
    'Texas', 'Georgia', 'Mississippi', 'Arkansas', 'Gujarat', 'Maharashtra', 'Telangana', 'Xinjiang', 'Shandong', 'Hebei',
    'Mato Grosso', 'Bahia', 'Şanlıurfa', 'New South Wales', 'Queensland', 'Chaco', 'Chihuahua',
  ],
  copper: [
    'Arizona', 'Utah', 'Nevada', 'New Mexico', 'Montana', 'Alaska', 'Sonora', 'British Columbia', 'Ontario', 'Krasnoyarsk Krai',
    'Sverdlovsk Oblast', 'Chelyabinsk Oblast', 'Chukotka Autonomous Okrug', 'Jiangxi', 'Yunnan', 'Tibet', 'South Australia', 'Queensland',
    'Western Australia', 'Limpopo', 'Northern Cape', 'San Juan', 'Catamarca', 'Pará', 'Jharkhand', 'Rajasthan', 'Artvin',
  ],
};

/** Chance that a region without a notable deposit has a small one, by terrain (cotton needs a warm climate). */
export function depositChance(k: RawRes, terrain: Terrain, lat: number): number {
  switch (k) {
    case 'timber': return { forest: 0.55, mountains: 0.2, plains: 0.06, desert: 0 }[terrain];
    case 'cotton': return Math.abs(lat) < 38 ? { plains: 0.3, desert: 0.1, forest: 0.04, mountains: 0.02 }[terrain] : 0;
    case 'copper': return { mountains: 0.3, desert: 0.2, plains: 0.03, forest: 0.05 }[terrain];
    default: return 0;
  }
}
