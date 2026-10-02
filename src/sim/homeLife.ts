// Home life (2.8 Life 2.0: the everyday): furniture and improvements, bills, appliances and chores.
// - Furnishing: from bare essentials to a stylish home; a comfortable home is a happier one.
// - Improvements (owners): a new kitchen or bathroom, insulation, solar panels, an extension.
//   They cost a share of the home's value and raise what it sells for; insulation and solar panels
//   cut the energy bill.
// - Bills: electricity, heating, water and internet every month, by the size of the home and the
//   country's energy price (which follows the world fuel markets, from 1.9); tenants pay their own.
// - Appliances (a washing machine, a dishwasher, a robot vacuum) save hours of chores.
// - Chores: about ten hours a week for one person, more with children. Couples share them; how
//   evenly depends on the couple and the country (women still do most of the housework almost
//   everywhere: about 60% in Britain and America, 80% or more in Japan, Korea and India). A partner
//   who does far more than their share grows resentful; hiring a cleaner costs money and saves time.
import type { Citizen, World } from './types';
import { dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { cref, hhref, player } from './query';
import { adjustRel } from './social';
import { sexOf } from './looks';
import { priceOf } from './housing';
import { energyPrice } from './energy';

export const FURNISH = ['bare essentials', 'basic furniture', 'a comfortable home', 'a stylish home'];
const FURNISH_USD = [0, 1500, 6000, 18000];
export type Improvement = 'kitchen' | 'bathroom' | 'insulation' | 'solar' | 'extension';
export const IMPROVE: Record<Improvement, { label: string; icon: string; cost: number; value: number; bills?: number; comfort?: number }> = {
  kitchen: { label: 'A new kitchen', icon: '🍳', cost: 0.05, value: 0.04, comfort: 1 },
  bathroom: { label: 'A new bathroom', icon: '🛁', cost: 0.04, value: 0.03, comfort: 1 },
  insulation: { label: 'Insulation', icon: '🧱', cost: 0.03, value: 0.02, bills: 0.25 },
  solar: { label: 'Solar panels', icon: '☀️', cost: 0.05, value: 0.03, bills: 0.4 },
  extension: { label: 'An extension', icon: '🏗️', cost: 0.1, value: 0.12, comfort: 1 },
};
export type Appliance = 'washer' | 'dishwasher' | 'robovac';
export const APPLIANCES: Record<Appliance, { label: string; icon: string; usd: number; saves: number }> = {
  washer: { label: 'A washing machine', icon: '🧺', usd: 500, saves: 2 },
  dishwasher: { label: 'A dishwasher', icon: '🍽️', usd: 600, saves: 2.5 },
  robovac: { label: 'A robot vacuum', icon: '🤖', usd: 300, saves: 1 },
};
/** Women's share of a couple's housework (2025, time-use surveys, rounded). */
const WOMEN_SHARE: Record<string, number> = { USA: 0.62, CAN: 0.6, GBR: 0.6, DEU: 0.6, AUS: 0.6, JPN: 0.8, KOR: 0.78, IND: 0.85, CHN: 0.7, TUR: 0.8, SAU: 0.85, RUS: 0.7, BRA: 0.7, MEX: 0.75, ARG: 0.7, ZAF: 0.7 };
/** Monthly bills by home size (US dollars at 2025 energy prices). */
const BILLS_USD: Record<string, number> = { room: 30, flat: 90, house: 160 };

export interface Household { furnish: number; appliances: Appliance[]; cleaner?: boolean; split?: 'fair' | 'mine' | 'theirs' }
export const householdOf = (c: Citizen): Household => c.household ?? { furnish: 1, appliances: [] };
const hh = (c: Citizen) => (c.household ??= { furnish: 1, appliances: [] });

/** What improvements add to a home's sale price (1 = none). */
export const homeUplift = (c: Citizen) => 1 + (c.dwelling?.improved ?? []).reduce((t, k) => t + IMPROVE[k].value, 0);
/** Comfort from furnishing and improvements (happiness, in sim/wellbeing.ts). */
export const homeComfort = (c: Citizen) => householdOf(c).furnish - 1 + (c.dwelling?.improved ?? []).reduce((t, k) => t + (IMPROVE[k].comfort ?? 0), 0);

/** A month of bills (local money). */
export function billsOf(w: World, c: Citizen): number {
  const h = c.dwelling;
  if (!h || h.kind === 'family') return 0;
  const n = w.nations[c.nation];
  const save = (h.improved ?? []).reduce((t, k) => t + (IMPROVE[k].bills ?? 0), 0);
  return Math.round((cur(BILLS_USD[h.size] ?? 90) / 10) * energyPrice(w, n) * (1 - Math.min(0.6, save)));
}

/** Hours of chores a week for the household, and the share this person does. */
export function choresOf(w: World, c: Citizen): { total: number; mine: number; share: number } {
  const kids = c.family?.kids.length ?? 0;
  const size = c.dwelling?.size === 'house' ? 3 : c.dwelling?.size === 'room' ? -3 : 0;
  const saves = householdOf(c).appliances.reduce((t, a) => t + APPLIANCES[a].saves, 0);
  const partner = c.family?.status === 'married' && c.family.partner != null ? w.citizens[c.family.partner] : null;
  const total = Math.max(2, (partner ? 16 : 10) + kids * 5 + size - saves) * (householdOf(c).cleaner ? 0.5 : 1);
  if (!partner || partner.gone) return { total, mine: total, share: 1 };
  const split = householdOf(c).split;
  const women = WOMEN_SHARE[dataIso(w.nations[c.nation].iso)] ?? 0.65;
  const custom = sexOf(w, c) === sexOf(w, partner) ? 0.5 : sexOf(w, c) === 'f' ? women : 1 - women;
  const share = split === 'fair' ? 0.5 : split === 'mine' ? 0.75 : split === 'theirs' ? 0.25 : custom;
  return { total, mine: Math.round(total * share * 10) / 10, share };
}

/** Home life in the reckoning of happiness and stress. */
export function homeParts(w: World, c: Citizen): { happy: [string, number][]; stress: [string, number][] } {
  const happy: [string, number][] = [], stress: [string, number][] = [];
  const comfort = homeComfort(c);
  if (comfort) happy.push([comfort > 0 ? 'a comfortable home' : 'a bare home', comfort]);
  if (c.player) { const ch = choresOf(w, c); if (ch.mine > 12) stress.push(['the housework', Math.min(8, Math.round((ch.mine - 12) / 2))]); }
  return { happy, stress };
}

// ---------- the player ----------

export const furnishCost = (w: World, c: Citizen, tier: number) => Math.round((cur(FURNISH_USD[tier] - FURNISH_USD[householdOf(c).furnish]) / 10));
export function furnishCheck(w: World, c: Citizen, tier: number): string | null {
  if (tier <= householdOf(c).furnish) return 'Your home is already furnished so.';
  if (!c.dwelling || c.dwelling.kind === 'family') return 'You live with your family.';
  const n = w.nations[c.nation];
  if ((c.wallet[n.cur] ?? 0) < furnishCost(w, c, tier)) return `That costs ${fmtAmt(n.cur, furnishCost(w, c, tier))}.`;
  return null;
}
export function furnish(w: World, tier: number, c: Citizen = player(w)): Result {
  const why = furnishCheck(w, c, tier);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  const cost = furnishCost(w, c, tier);
  pay(w, cref(c.id), hhref(n.id), n.cur, cost, 'Furniture');
  hh(c).furnish = tier;
  return ok(`🛋️ Your home is now ${FURNISH[tier]} (${fmtAmt(n.cur, cost)}).`);
}
export const improveCost = (w: World, c: Citizen, k: Improvement) => (c.dwelling ? Math.round(priceOf(w, c.dwelling.region, c.dwelling.size) * IMPROVE[k].cost) : 0);
export function improveCheck(w: World, c: Citizen, k: Improvement): string | null {
  if (c.dwelling?.kind !== 'own') return 'Only owners can improve their home.';
  if ((c.dwelling.improved ?? []).includes(k)) return 'Done already.';
  const n = w.nations[c.nation];
  if ((c.wallet[n.cur] ?? 0) < improveCost(w, c, k)) return `That costs ${fmtAmt(n.cur, improveCost(w, c, k))}.`;
  return null;
}
export function improveHome(w: World, k: Improvement, c: Citizen = player(w)): Result {
  const why = improveCheck(w, c, k);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  const cost = improveCost(w, c, k);
  pay(w, cref(c.id), hhref(n.id), n.cur, cost, IMPROVE[k].label);
  (c.dwelling!.improved ??= []).push(k);
  return ok(`${IMPROVE[k].icon} ${IMPROVE[k].label} (${fmtAmt(n.cur, cost)}): your home is worth about ${Math.round(IMPROVE[k].value * 100)}% more${IMPROVE[k].bills ? ` and your bills fall by ${Math.round(IMPROVE[k].bills! * 100)}%` : ''}.`);
}
export const applianceCost = (w: World, c: Citizen, a: Appliance) => Math.round((cur(APPLIANCES[a].usd) / 10));
export function applianceCheck(w: World, c: Citizen, a: Appliance): string | null {
  if (householdOf(c).appliances.includes(a)) return 'You have one.';
  if (!c.dwelling || c.dwelling.kind === 'family') return 'You live with your family.';
  const n = w.nations[c.nation];
  if ((c.wallet[n.cur] ?? 0) < applianceCost(w, c, a)) return `That costs ${fmtAmt(n.cur, applianceCost(w, c, a))}.`;
  return null;
}
export function buyAppliance(w: World, a: Appliance, c: Citizen = player(w)): Result {
  const why = applianceCheck(w, c, a);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  pay(w, cref(c.id), hhref(n.id), n.cur, applianceCost(w, c, a), APPLIANCES[a].label);
  hh(c).appliances.push(a);
  return ok(`${APPLIANCES[a].icon} ${APPLIANCES[a].label}: about ${APPLIANCES[a].saves} hours of chores a week saved.`);
}
export function setSplit(w: World, split: Household['split'], c: Citizen = player(w)): Result {
  hh(c).split = split;
  return ok(split === 'fair' ? 'You agree to share the housework equally.' : split === 'mine' ? 'You take on most of the housework.' : 'You leave most of the housework to your partner.');
}
export const cleanerCost = (w: World, c: Citizen) => Math.round((cur(160) / 10));
export function setCleaner(w: World, on: boolean, c: Citizen = player(w)): Result {
  hh(c).cleaner = on;
  return ok(on ? `A cleaner comes once a week (about ${fmtAmt(w.nations[c.nation].cur, cleanerCost(w, c))} a month): half the housework done.` : 'No more cleaner.');
}

// ---------- monthly ----------

/** A month: bills, the cleaner, and how a partner feels about the housework. */
export function homeMonth(w: World) {
  for (const c of census(w).all) {
    if (c.gone) continue;
    const n = w.nations[c.nation];
    const bill = billsOf(w, c);
    if (bill > 0) pay(w, cref(c.id), hhref(n.id), n.cur, Math.min(bill, Math.floor((c.wallet[n.cur] ?? 0) * 0.3)), 'Household bills');
    if (!c.player) continue;
    if (c.household?.cleaner) pay(w, cref(c.id), hhref(n.id), n.cur, Math.min(cleanerCost(w, c), Math.floor((c.wallet[n.cur] ?? 0) * 0.3)), 'Cleaner');
    const partner = c.family?.status === 'married' && c.family.partner != null ? w.citizens[c.family.partner] : null;
    if (partner && !partner.gone) {
      const share = choresOf(w, c).share;
      if (share < 0.4) adjustRel(partner, c.id, -Math.round((0.4 - share) * 10)); // doing far more than their share
      else if (share >= 0.5) adjustRel(partner, c.id, 1);
    }
    c.flags.homeMonth = dayOf(w.time);
  }
}
export function homeDaily(w: World) {
  if (dateAt(w.time).day === 1) homeMonth(w);
}
