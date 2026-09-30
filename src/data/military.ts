// Armed-forces data: rank ladders per branch, formation types and each
// country's relative force posture (SOLO weights loosely following real
// military size and naval reach). Formation strengths, equipment and positions
// are rolled per seed from these.
import type { Branch, FormationKind } from '../sim/types';

export interface RankDef { name: string; sp: number; days: number; command?: boolean; flag?: boolean } // days: minimum time in service

const ladder = (names: string[], commandFrom: number, flagFrom: number): RankDef[] => {
  const sp = [0, 10, 25, 45, 70, 100, 140, 190, 250, 320, 400, 500, 620, 760, 920];
  const days = [0, 2, 4, 7, 10, 14, 20, 26, 33, 40, 50, 60, 75, 90, 110];
  return names.map((name, i) => ({ name, sp: sp[i], days: days[i], command: i >= commandFrom, flag: i >= flagFrom }));
};

/** Rank ladders. Officers from index 5; formation command from `command`; flag ranks need prior command. */
export const RANKS: Record<Branch, RankDef[]> = {
  army: ladder(['Private', 'Private First Class', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General', 'Lieutenant General', 'General'], 10, 11),
  navy: ladder(['Seaman Recruit', 'Seaman', 'Petty Officer 3rd Class', 'Petty Officer 1st Class', 'Chief Petty Officer', 'Ensign', 'Lieutenant (junior grade)', 'Lieutenant', 'Lieutenant Commander', 'Commander', 'Captain', 'Commodore', 'Rear Admiral', 'Vice Admiral', 'Admiral'], 10, 11),
  air: ladder(['Airman Basic', 'Airman', 'Senior Airman', 'Staff Sergeant', 'Master Sergeant', 'Second Lieutenant', 'First Lieutenant', 'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General', 'Lieutenant General', 'Air Chief Marshal'], 10, 11),
};
export const BRANCH_NAME: Record<Branch, string> = { army: 'Army', navy: 'Navy', air: 'Air Force' };
export const BRANCH_ICON: Record<Branch, string> = { army: '🪖', navy: '⚓', air: '✈️' };

export interface KindDef {
  branch: Branch; name: string; icon: string;
  power: number; // base combat power at full strength
  upkeep: number; // currency per day at full strength
  raise: { money: number; items: Record<string, number> }; // cost to raise
  supply: Record<string, number>; // national storage consumed per day to keep equipment up (full strength)
  terrain?: Partial<Record<string, number>>; // multipliers by terrain
  amphibious?: number; // bonus in amphibious assaults
  naval?: number; // multiplier in naval engagements
  support?: number; // multiplier when supporting a land battle
  desc: string;
}

export const KINDS: Record<FormationKind, KindDef> = {
  infantry: { branch: 'army', name: 'Infantry Division', icon: '🪖', power: 1, upkeep: 6, raise: { money: 300, items: { 'wg:1': 60 } }, supply: { 'wg:1': 1 }, terrain: { forest: 1.15, mountains: 1.1 }, desc: 'Holds ground well in any terrain.' },
  armored: { branch: 'army', name: 'Armored Division', icon: '🛡️', power: 1.6, upkeep: 11, raise: { money: 600, items: { 'wg:2': 40, iron: 150, oil: 60 } }, supply: { 'wg:1': 1, oil: 2 }, terrain: { plains: 1.25, desert: 1.2, mountains: 0.7, forest: 0.8 }, desc: 'Decisive on open ground, poor in mountains and forest.' },
  mountain: { branch: 'army', name: 'Mountain Division', icon: '⛰️', power: 1.1, upkeep: 7, raise: { money: 380, items: { 'wg:1': 70 } }, supply: { 'wg:1': 1 }, terrain: { mountains: 1.4, forest: 1.1, plains: 0.9 }, desc: 'Specialists in mountains and rough terrain.' },
  marines: { branch: 'army', name: 'Marine Division', icon: '⚓', power: 1.15, upkeep: 8, raise: { money: 450, items: { 'wg:1': 70, oil: 20 } }, supply: { 'wg:1': 1 }, amphibious: 1.5, desc: 'Amphibious assault troops: +50% landing from the sea.' },
  fleet: { branch: 'navy', name: 'Surface Fleet', icon: '🚢', power: 1.3, upkeep: 12, raise: { money: 700, items: { iron: 300, oil: 120, titanium: 20 } }, supply: { oil: 3, iron: 1 }, naval: 1, support: 0.5, desc: 'Controls sea zones, escorts landings and bombards coasts.' },
  carrier: { branch: 'navy', name: 'Carrier Strike Group', icon: '🛳️', power: 1.7, upkeep: 20, raise: { money: 1200, items: { iron: 400, oil: 200, titanium: 60, 'wa:1': 30 } }, supply: { oil: 4, 'wa:1': 1 }, naval: 1.2, support: 1, desc: 'Projects air power over coasts: strong in sea battles and landings.' },
  submarine: { branch: 'navy', name: 'Submarine Flotilla', icon: '🐋', power: 1, upkeep: 8, raise: { money: 500, items: { iron: 180, oil: 60, titanium: 30 } }, supply: { oil: 2 }, naval: 1.3, support: 0, desc: 'Hunts fleets and enforces blockades; hard to find.' },
  fighter: { branch: 'air', name: 'Fighter Wing', icon: '✈️', power: 1.1, upkeep: 9, raise: { money: 550, items: { 'wa:1': 50, oil: 60, titanium: 20 } }, supply: { 'wa:1': 1, oil: 2 }, support: 0.6, desc: 'Wins air superiority (+10% to all of your side in a battle).' },
  bomber: { branch: 'air', name: 'Bomber Wing', icon: '💣', power: 1.4, upkeep: 12, raise: { money: 700, items: { 'wa:2': 40, oil: 80, titanium: 20 } }, supply: { 'wa:1': 1, oil: 3 }, support: 1.2, desc: 'Strikes battlefields anywhere in range; needed for strong air assaults.' },
};

/** Relative force posture (land, naval, air) by country code. */
export const POSTURE: Record<string, { land: number; sea: number; air: number }> = {
  USA: { land: 1.3, sea: 2, air: 1.8 }, CHN: { land: 1.6, sea: 1.5, air: 1.3 }, RUS: { land: 1.6, sea: 1.2, air: 1.3 }, IND: { land: 1.5, sea: 1, air: 1 },
  KOR: { land: 1.1, sea: 0.8, air: 0.9 }, TUR: { land: 1.1, sea: 0.8, air: 0.8 }, JPN: { land: 0.7, sea: 1.2, air: 0.9 }, GBR: { land: 0.6, sea: 1.2, air: 0.8 },
  DEU: { land: 0.8, sea: 0.5, air: 0.7 }, BRA: { land: 0.9, sea: 0.7, air: 0.6 }, SAU: { land: 0.8, sea: 0.5, air: 0.9 }, AUS: { land: 0.5, sea: 0.8, air: 0.7 },
  CAN: { land: 0.5, sea: 0.6, air: 0.5 }, MEX: { land: 0.7, sea: 0.5, air: 0.4 }, ARG: { land: 0.6, sea: 0.5, air: 0.4 }, ZAF: { land: 0.6, sea: 0.4, air: 0.4 },
};

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export const ALERT_NAMES = ['', 'Normal', 'Elevated', 'High', 'Severe', 'Maximum'];
