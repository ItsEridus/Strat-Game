// Housing: everyone lives somewhere, as a tenant, an owner, or with family.
// Rents and prices follow each region's pull (jobs, safety, services), so
// sought-after places cost more; prices move slowly. Rent and upkeep are part
// of daily living costs (paid to the background economy, where landlords,
// builders and repairers are); buying and selling trade with it too.
import { homeUplift } from './homeLife';
import { MORTGAGE } from './mortgageHook';
import { addHeirloom } from './legacy';
import type { Citizen, Id, Region, World } from './types';
import { B } from '../data/balance';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { controller, cref, hhref, jailed, player } from './query';
import { ageOf } from './growth';
import { lifeGate, milestone } from './lifecycle';

export type HomeSize = 'room' | 'flat' | 'house';
export interface Home { kind: 'rent' | 'own' | 'family'; region: Id; size: HomeSize; since: number; paid?: number /* purchase price (minor) */; improved?: import('./homeLife').Improvement[] /* (2.8) */ }

export const SIZES: Record<HomeSize, { label: string; icon: string; comfort: number }> = {
  room: { label: 'Room in a shared house', icon: '🚪', comfort: -2 },
  flat: { label: 'Flat', icon: '🏢', comfort: 0 },
  house: { label: 'House', icon: '🏡', comfort: 3 },
};
/** Home ownership by country (share of households; Eurostat, US Census, national statistics, rounded). */
const OWNERSHIP: Record<string, number> = { USA: 0.65, CAN: 0.67, MEX: 0.8, BRA: 0.73, ARG: 0.68, GBR: 0.63, DEU: 0.47, RUS: 0.85, TUR: 0.58, SAU: 0.6, ZAF: 0.69, IND: 0.87, CHN: 0.9, JPN: 0.61, KOR: 0.57, AUS: 0.66 };

// ---------- prices ----------

/** Where a region's housing market is heading: pull (draw), staffing of services, disruption. */
function marketTarget(r: Region) {
  return Math.max(0.5, Math.min(2.5, 1 + (r.draw ?? 0) * 0.8 + ((r.staff?.school ?? 0.6) + (r.staff?.clinic ?? 0.6) - 1.2) * 0.2 - (r.occ ? 0.3 : 0)));
}
export const priceIndex = (r: Region) => r.housePx ?? marketTarget(r);
/** Rent per day (minor units). */
export const rentOf = (w: World, rid: Id, size: HomeSize) => Math.round(cur(B.housing.rent[size]) * priceIndex(w.regions[rid]));
/** Market price to buy (minor units): about twenty years of rent (a 5% gross yield). */
export const priceOf = (w: World, rid: Id, size: HomeSize) => Math.round((rentOf(w, rid, size) * 365) / B.housing.yield);
/** What a home costs its occupant per day: rent, an owner's upkeep and property tax, or nothing with family. */
export function housingCost(w: World, h: Home | undefined): number {
  if (!h || h.kind === 'family') return 0;
  if (h.kind === 'rent') return rentOf(w, h.region, h.size);
  return Math.round((priceOf(w, h.region, h.size) * B.housing.upkeep) / 365);
}

// ---------- genesis and moving ----------

/** A plausible home for someone (stable hash; no dice). */
export function assignHome(w: World, c: Citizen) {
  if (c.dwelling) return;
  const age = ageOf(w, c);
  const own = OWNERSHIP[w.nations[c.nation].iso] ?? 0.65;
  const h = hash01(c.id, 1313, 1);
  const married = c.family?.status === 'married';
  const kind: Home['kind'] = age < 18 ? 'family' : age < 25 && (c.family?.parents ?? []).some((id) => w.citizens[id]?.home === c.home && !w.citizens[id]?.gone) && h < 0.6 ? 'family'
    : h < own * Math.min(1, (age - 18) / 25) ? 'own' : 'rent';
  const size: HomeSize = kind === 'family' ? 'room' : married || (c.family?.kids.length ?? 0) > 0 ? (hash01(c.id, 1313, 2) < 0.6 ? 'house' : 'flat') : hash01(c.id, 1313, 3) < 0.25 ? 'room' : hash01(c.id, 1313, 4) < 0.8 ? 'flat' : 'house';
  c.dwelling = { kind, region: c.home, size, since: w.time, paid: kind === 'own' ? priceOf(w, c.home, size) : undefined };
}

/** An owner died: the heir moves in if they live there and do not own a home; otherwise the home is sold for the estate. */
export function settleHome(w: World, c: Citizen, heir: Citizen | null) {
  const h = c.dwelling;
  if (h?.kind !== 'own') return;
  if (heir && heir.home === h.region && heir.dwelling?.kind !== 'own') { heir.dwelling = { ...h, since: w.time }; c.dwelling = undefined; return; }
  sellTo(w, c, h);
  c.dwelling = undefined;
}

export const initHousing = (w: World) => { for (const c of Object.values(w.citizens)) if (!c.gone) assignHome(w, c); };

/** Someone's home region changed (a move, a marriage): owners sell, and everyone finds a place of the same kind. */
export function rehouse(w: World, c: Citizen) {
  const h = c.dwelling;
  if (!h || h.region === c.home) return;
  if (h.kind === 'own') {
    // Owners swap: they sell and buy at the same time, so only the difference changes hands
    // (from savings, or a mortgage for the gap; a cheaper place leaves money over). Smaller homes if needed.
    const nat = controller(w.regions[c.home]);
    const code = w.nations[nat].cur;
    const sameMoney = w.nations[controller(w.regions[h.region])].cur === code;
    const net = Math.floor(priceOf(w, h.region, h.size) * (1 - B.housing.fees));
    if (sameMoney) {
      for (const size of [h.size, h.size === 'house' ? 'flat' : 'room', 'room'] as HomeSize[]) {
        const price = priceOf(w, c.home, size);
        const diff = Math.round(price * (1 + B.housing.fees)) - net;
        const done = (paid: boolean) => { if (!paid) return false; c.dwelling = { kind: 'own', region: c.home, size, since: w.time, paid: price }; return true; };
        if (diff <= 0) { if (done(diff === 0 || pay(w, hhref(nat), cref(c.id), code, -diff, 'Money left over from a home move') || true)) return; }
        if ((c.wallet[code] ?? 0) >= diff + cur(B.living.comfort) && done(pay(w, cref(c.id), hhref(nat), code, diff, 'Home move: the difference in price'))) return;
        if (!MORTGAGE.loanCheck?.(w, c, diff) && MORTGAGE.borrow?.(w, c, diff, `the move to ${w.regions[c.home].name}`) && done(pay(w, cref(c.id), hhref(nat), code, diff, 'Home move: the difference in price'))) return;
      }
    }
    sellTo(w, c, h); // moving abroad (or nothing fits): sell and rent
  }
  c.dwelling = { kind: 'rent', region: c.home, size: h.size, since: w.time };
}

function sellTo(w: World, c: Citizen, h: Home): number {
  const nat = controller(w.regions[h.region]);
  const code = w.nations[nat].cur;
  const gross = Math.round(priceOf(w, h.region, h.size) * homeUplift(c)); // improvements add value (homeLife.ts)
  const net = Math.floor(gross * (1 - B.housing.fees));
  return pay(w, hhref(nat), cref(c.id), code, net, `Sale of your ${SIZES[h.size].label.toLowerCase()}`) ? net : 0;
}

// ---------- the player's choices ----------

export function rentCheck(w: World, c: Citizen, size: HomeSize): string | null {
  const young = lifeGate(w, c, 18, 'Renting a home');
  if (young) return young;
  if (jailed(w, c)) return 'You are in prison.';
  const h = c.dwelling;
  if (h?.kind === 'rent' && h.size === size && h.region === c.loc) return 'You already rent this kind of place here.';
  if (h?.kind === 'own' && h.region === c.loc) return 'Sell your home first.';
  const code = w.nations[controller(w.regions[c.loc])].cur;
  const deposit = rentOf(w, c.loc, size) * B.housing.depositDays;
  if ((c.wallet[code] ?? 0) < deposit) return `The deposit and first month come to ${fmtAmt(code, deposit)}.`;
  return null;
}

/** Rent a place where you are now (it becomes your home region). The deposit is kept by the landlord. */
export function rentHome(w: World, size: HomeSize, c: Citizen = player(w)): Result {
  const why = rentCheck(w, c, size);
  if (why) return fail(why);
  const nat = controller(w.regions[c.loc]);
  const code = w.nations[nat].cur;
  if (c.dwelling?.kind === 'own') sellTo(w, c, c.dwelling);
  pay(w, cref(c.id), hhref(nat), code, rentOf(w, c.loc, size) * B.housing.depositDays, 'Rent deposit and first month');
  const moved = c.home !== c.loc;
  if (moved) moveTo(w, c, c.loc);
  c.dwelling = { kind: 'rent', region: c.loc, size, since: w.time };
  if (moved) milestone(w, c, 'home', `moved to ${w.regions[c.loc].name}`);
  return ok(`${SIZES[size].icon} You rent a ${SIZES[size].label.toLowerCase()} in ${w.regions[c.loc].name} for ${fmtAmt(code, rentOf(w, c.loc, size))} a day.`);
}

export function buyCheck(w: World, c: Citizen, size: HomeSize): string | null {
  const young = lifeGate(w, c, 18, 'Buying a home');
  if (young) return young;
  if (jailed(w, c)) return 'You are in prison.';
  if (c.dwelling?.kind === 'own' && c.dwelling.region === c.loc && c.dwelling.size === size) return 'You already own one here.';
  const code = w.nations[controller(w.regions[c.loc])].cur;
  const need = Math.round(priceOf(w, c.loc, size) * (1 + B.housing.fees)) - (c.dwelling?.kind === 'own' ? Math.floor(priceOf(w, c.dwelling.region, c.dwelling.size) * (1 - B.housing.fees)) : 0);
  if ((c.wallet[code] ?? 0) < need) return `You need ${fmtAmt(code, need)} (price plus fees${c.dwelling?.kind === 'own' ? ', after selling your home' : ''}). A mortgage needs only a 10% deposit.`;
  return null;
}

/** Buy a home where you are now (your current home is sold first). */
export function buyHome(w: World, size: HomeSize, c: Citizen = player(w)): Result {
  const why = buyCheck(w, c, size);
  if (why) return fail(why);
  const nat = controller(w.regions[c.loc]);
  const code = w.nations[nat].cur;
  if (c.dwelling?.kind === 'own') sellTo(w, c, c.dwelling);
  const price = priceOf(w, c.loc, size);
  pay(w, cref(c.id), hhref(nat), code, Math.round(price * (1 + B.housing.fees)), `Home purchase: ${SIZES[size].label.toLowerCase()}`);
  if (c.home !== c.loc) moveTo(w, c, c.loc);
  c.dwelling = { kind: 'own', region: c.loc, size, since: w.time, paid: price };
  milestone(w, c, 'home', `bought a ${SIZES[size].label.toLowerCase()} in ${w.regions[c.loc].name}`);
  addHeirloom(w, c, 'Keys to the first family home', w.regions[c.loc].name);
  return ok(`🔑 You bought a ${SIZES[size].label.toLowerCase()} in ${w.regions[c.loc].name} for ${fmtAmt(code, price)}.`);
}

export function sellHome(w: World, c: Citizen = player(w)): Result {
  const h = c.dwelling;
  if (h?.kind !== 'own') return fail('You do not own your home.');
  const got = sellTo(w, c, h);
  if (!got) return fail('No buyer can afford it right now.');
  c.dwelling = { kind: 'rent', region: h.region, size: h.size, since: w.time };
  const code = w.nations[controller(w.regions[h.region])].cur;
  return ok(`Sold for ${fmtAmt(code, got)} after fees${h.paid ? ` (you paid ${fmtAmt(code, h.paid)})` : ''}. You now rent a similar place.`);
}

/** Move home to another region (the player's household goes too). */
function moveTo(w: World, c: Citizen, to: Id) {
  c.home = to; c.mineSite = to;
  const partner = c.family?.status === 'married' && c.family.partner != null ? w.citizens[c.family.partner] : null;
  if (partner && !partner.gone) { partner.home = partner.loc = partner.mineSite = to; partner.dwelling = { ...c.dwelling!, region: to }; }
}

// ---------- daily ----------

/** Daily: prices drift toward what each region is worth; young adults at home move out. */
export function housingDaily(w: World) {
  for (const r of w.regions) r.housePx = (r.housePx ?? marketTarget(r)) + (marketTarget(r) - (r.housePx ?? marketTarget(r))) * 0.003;
  for (const c of census(w).all) {
    if (!c.dwelling) { assignHome(w, c); continue; }
    if (c.dwelling.region !== c.home) rehouse(w, c);
    // Leaving the family home: at a job and 25+, or married.
    if (c.dwelling.kind === 'family' && !c.player && (c.family?.status === 'married' || (ageOf(w, c) >= 25 && c.job != null))) c.dwelling = { kind: 'rent', region: c.home, size: 'flat', since: w.time };
  }
}
