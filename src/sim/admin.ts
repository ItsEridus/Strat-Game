// Admin (cheat) tools for the player. Hidden in the UI (Ctrl+Shift+A, or type
// "admin" anywhere). Money and items are minted or burned through the ledger
// with the reason "Admin", so the asset audit stays balanced. Using them marks
// the campaign (settings.adminUsed).
import { YEAR, reputation } from './growth';
import { census } from './census';
import type { Attr, Id, ItemKey, World } from './types';
import { fail, ok, type Result } from '../engine/result';
import { burn, consume, mint, produce } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { itemName } from '../data/items';
import { RANKS } from '../data/military';
import { cref, maxEnergy, natref, player } from './query';
import { allowanceCap } from './citizen';
import { invalidateCensus } from './census';

const mark = (w: World) => { w.settings.adminUsed = true; };

/** Set the player's balance of a currency (or GOLD) to an exact amount in minor units. */
export function adminSetMoney(w: World, asset: string, amount: number): Result {
  if (!Number.isFinite(amount) || amount < 0) return fail('Enter an amount of zero or more.');
  const p = player(w);
  const have = p.wallet[asset] ?? 0;
  const target = Math.round(amount);
  if (target > have) mint(w, cref(p.id), asset, target - have, 'Admin');
  else if (target < have) burn(w, cref(p.id), asset, have - target, 'Admin');
  mark(w);
  return ok(`Balance set to ${fmtAmt(asset, target)}.`);
}

/** Top up the player's nation's treasury. */
export function adminTreasury(w: World, asset: string, amount: number): Result {
  if (!Number.isFinite(amount) || amount <= 0) return fail('Enter a positive amount.');
  const p = player(w);
  mint(w, natref(p.nation), asset, Math.round(amount), 'Admin');
  mark(w);
  return ok(`Added ${fmtAmt(asset, Math.round(amount))} to the ${w.nations[p.nation].name} treasury.`);
}

/** Set standing (influence; fame is left as is). */
export function adminSetStanding(w: World, value: number): Result {
  if (!Number.isFinite(value) || value < 0 || value > 10000) return fail('Standing must be 0–10000.');
  const p = player(w);
  p.influence = Math.max(0, value - p.sec.fame * 2);
  mark(w);
  return ok(`Standing set to ${value} (${reputation(p).name}).`);
}

export function adminSetAge(w: World, years: number): Result {
  if (!Number.isInteger(years) || years < 16 || years > 100) return fail('Age must be 16–100.');
  const p = player(w);
  p.born = w.time - years * YEAR;
  mark(w);
  return ok(`You are now ${years}.`);
}

export function adminSetAttr(w: World, attr: Attr, value: number): Result {
  if (!Number.isFinite(value) || value < 0 || value > 500) return fail('Skill must be 0–500.');
  player(w).attrs[attr] = value;
  mark(w);
  return ok(`${attr} set to ${value}.`);
}

/** Set a numeric stat: training power, economic skill, influence, fame, notoriety, heat. */
export function adminSetStat(w: World, stat: 'power' | 'eco' | 'influence' | 'fame' | 'notoriety' | 'heat', value: number): Result {
  if (!Number.isFinite(value) || value < 0) return fail('Enter zero or more.');
  const p = player(w);
  if (stat === 'power' || stat === 'eco' || stat === 'influence') p[stat] = value;
  else if (stat === 'heat') p.sec.heat = Math.min(100, value);
  else p.sec[stat] = value;
  mark(w);
  return ok(`${stat} set to ${value}.`);
}

export function adminRefill(w: World): Result {
  const p = player(w);
  p.energy = maxEnergy(w, p);
  p.allowance = allowanceCap(w, p);
  p.allowAcc = 0;
  mark(w);
  return ok('Energy and eating allowance refilled.');
}

export function adminGiveItem(w: World, key: ItemKey, qty: number): Result {
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 100000) return fail('Quantity must be a non-zero whole number.');
  const p = player(w);
  if (qty > 0) produce(w, cref(p.id), key, qty, 'Admin');
  else if (!consume(w, cref(p.id), key, Math.min(-qty, p.inv[key] ?? 0), 'Admin')) return fail('Not enough to remove.');
  mark(w);
  return ok(`${qty > 0 ? 'Added' : 'Removed'} ${Math.abs(qty)} ${itemName(key)}.`);
}

/** Move instantly (and optionally make it home). */
export function adminTeleport(w: World, region: Id, makeHome: boolean): Result {
  const r = w.regions[region];
  if (!r) return fail('Unknown region.');
  const p = player(w);
  p.loc = region;
  p.mineSite = region;
  if (makeHome) p.home = region;
  invalidateCensus(w);
  mark(w);
  return ok(`You are now in ${r.name}${makeHome ? ' (your new home)' : ''}.`);
}

export function adminFreedom(w: World): Result {
  const p = player(w);
  p.sec.jailUntil = 0;
  p.sec.heat = 0;
  for (const k of Object.values(w.cases)) if (k.suspect === p.id && k.status === 'open') { k.status = 'closed'; k.outcome = 'dropped'; }
  mark(w);
  return ok('Released, record cleared of open cases, heat reset.');
}

export function adminMilRank(w: World, rank: number): Result {
  const p = player(w);
  if (!p.mil.branch) return fail('Enlist first (Armed Forces).');
  const ladder = RANKS[p.mil.branch];
  if (!Number.isInteger(rank) || rank < 0 || rank >= ladder.length) return fail(`Rank must be 0–${ladder.length - 1}.`);
  p.mil.rank = rank;
  p.mil.sp = ladder[rank].sp;
  if (ladder[rank].flag) p.mil.commands = Math.max(p.mil.commands, 10);
  mark(w);
  return ok(`Rank set to ${ladder[rank].name}.`);
}

/** Relationship with every citizen of a nation (or everyone). */
export function adminCharm(w: World, value: number): Result {
  const p = player(w);
  for (const c of census(w).all) if (!c.player) c.rel[p.id] = Math.max(-100, Math.min(100, value));
  mark(w);
  return ok(`Everyone's opinion of you set to ${value}.`);
}

