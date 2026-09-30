// Military units: named AI citizens in squads, a commander with orders and a
// doctrine, a shared supply store, and squad specialisations. Bonuses apply only
// when fighting on the ordered side in the assigned battle.
import { repNeed, standing } from './growth';
import type { Citizen, Id, Unit, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { UNIT_WORDS } from '../data/names';
import { fail, ok, type Result } from '../engine/result';
import { burn, moveItems, pay } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { nid, notify, record, sendMsg } from '../engine/events';
import { pick } from '../engine/rng';
import { authorize } from './authority';
import { cref, player } from './query';
import { bump } from './progress';

export const SQUAD_SPECS: Record<string, string> = {
  general: 'General — order bonus only',
  ground: 'Ground — bonus with ground weapons',
  air: 'Air — bonus with air weapons',
  plains: 'Plains terrain', mountains: 'Mountain terrain', forest: 'Forest terrain', desert: 'Desert terrain',
};

export const unitRef = (id: Id) => ({ k: 'unit' as const, id });
export const members = (u: Unit) => u.squads.flatMap((s) => s.members);

export function createUnit(w: World, commander: Citizen, name?: string): Unit {
  const u: Unit = {
    id: nid(w), nation: commander.nation, name: name || `${w.nations[commander.nation].adj} ${pick(w, UNIT_WORDS)}`, commander: commander.id, officers: [],
    squads: [{ spec: 'general', members: [commander.id], level: 1 }], doctrine: 'steady', order: null, wallet: {}, inv: {}, founded: w.time, battlesFought: 0,
  };
  w.units[u.id] = u;
  commander.unit = u.id;
  return u;
}

export function foundUnitCheck(w: World, c: Citizen): string | null {
  if (c.unit != null) return 'Leave your current unit first.';
  if (standing(c) < 15 && c.mil.rank < 3 && c.power < 20) return `Nobody would enlist with you yet: you need ${repNeed(15)}, a military rank, or a fighter's name (training power 20+).`;
  if ((c.wallet[GOLD] ?? 0) < g(B.units.cost)) return `Founding a unit costs ${B.units.cost} gold.`;
  return null;
}
export function foundUnit(w: World, c: Citizen, name: string): Result {
  const why = foundUnitCheck(w, c);
  if (why) return fail(why);
  burn(w, cref(c.id), GOLD, g(B.units.cost), 'Military unit founding');
  const u = createUnit(w, c, name.trim().slice(0, 40) || undefined);
  record(w, 'unit', `${c.name} founded the military unit ${u.name}.`, { cit: c.id, nation: c.nation, player: c.player });
  return ok(`Founded ${u.name}. Recruit soldiers and set orders.`);
}

function addMember(u: Unit, c: Citizen) {
  let sq = u.squads.find((s) => s.members.length < B.units.squadSize);
  if (!sq) {
    if (u.squads.length >= B.units.maxSquads) return false;
    sq = { spec: 'general', members: [], level: 1 };
    u.squads.push(sq);
  }
  sq.members.push(c.id);
  c.unit = u.id;
  return true;
}

export function joinCheck(w: World, c: Citizen, u: Unit | undefined): string | null {
  if (!u) return 'Unit not found.';
  if (c.unit != null) return 'Leave your current unit first.';
  if (u.nation !== c.nation) return 'Units recruit their own citizens only.';
  if (members(u).length >= B.units.maxSquads * B.units.squadSize) return 'The unit is full.';
  return null;
}

/** Ask to join. AI commanders accept based on your record and their opinion of you. */
export function requestJoin(w: World, c: Citizen, uid: Id): Result {
  const u = w.units[uid];
  const why = joinCheck(w, c, u);
  if (why) return fail(why);
  const cmd = w.citizens[u.commander];
  if (cmd.player) return fail('You command this unit.');
  const score = (cmd.rel[c.id] ?? 0) + standing(c) / 2 + c.dmgTotal / 50000 + 10;
  if (score < 5) return fail(`${cmd.name} turned you down (they don’t know you well — build a record or relationship).`);
  addMember(u, c);
  cmd.rel[c.id] = (cmd.rel[c.id] ?? 0) + 3;
  if (c.player) bump(w, 'unitJoin');
  return ok(`Welcome to ${u.name}, soldier.`);
}

export function leaveUnit(w: World, c: Citizen): Result {
  const u = c.unit != null ? w.units[c.unit] : null;
  if (!u) return fail('You are not in a unit.');
  for (const s of u.squads) s.members = s.members.filter((x) => x !== c.id);
  u.officers = u.officers.filter((x) => x !== c.id);
  c.unit = null;
  if (u.commander === c.id) {
    const next = members(u).map((id) => w.citizens[id]).sort((a, b) => b.dmgTotal - a.dmgTotal)[0];
    if (next) u.commander = next.id;
    else {
      // disband: return funds and supplies to the leaving commander
      for (const [k, v] of Object.entries(u.wallet)) pay(w, unitRef(u.id), cref(c.id), k, v, 'Unit disbanded');
      for (const [k, v] of Object.entries(u.inv)) moveItems(w, unitRef(u.id), cref(c.id), k, v);
      delete w.units[u.id];
    }
  }
  return ok('You left the unit.');
}

/** Commander invites an AI citizen (they accept by opinion, persona and unit record). */
export function invite(w: World, actor: Citizen, uid: Id, target: Id): Result {
  const u = w.units[uid];
  if (!u || authorize(w, actor.id, unitRef(uid), 'manage')) return fail('Only unit officers can recruit.');
  const c = w.citizens[target];
  const why = joinCheck(w, c, u);
  if (why) return fail(why);
  if (c.player) return fail('That is you.');
  const appeal = (c.rel[actor.id] ?? 0) / 4 + (c.persona === 'soldier' ? 25 : 5) + u.battlesFought + actor.influence / 5;
  if (appeal < 15 || c.traits.loyalty > 0.9) {
    c.rel[actor.id] = (c.rel[actor.id] ?? 0) + 1;
    return fail(`${c.name} declined for now (appeal ${Math.round(appeal)}/15). Relationships, a fighting record and influence help.`);
  }
  addMember(u, c);
  c.rel[actor.id] = (c.rel[actor.id] ?? 0) + 5;
  return ok(`${c.name} joined ${u.name}.`);
}

export function setOrder(w: World, actor: Citizen, uid: Id, battle: Id | null, side: 'a' | 'd'): Result {
  const u = w.units[uid];
  if (!u || authorize(w, actor.id, unitRef(uid), 'manage')) return fail('Only unit officers can issue orders.');
  if (battle == null) { u.order = null; return ok('Orders cleared.'); }
  const b = w.battles[battle];
  if (!b || b.done) return fail('Battle is over.');
  u.order = { battle, side };
  const pl = player(w);
  if (members(u).includes(pl.id) && actor.id !== pl.id) notify(w, 'war', `📣 ${u.name} orders: fight for ${side === 'a' ? w.nations[b.att]?.name : w.nations[b.def]?.name ?? 'defenders'} in ${w.regions[b.region]?.name}.`, { link: 'battle' });
  return ok('Orders issued. Members fighting there on that side gain the unit bonus.');
}

export function setDoctrine(w: World, actor: Citizen, uid: Id, d: Unit['doctrine']): Result {
  const u = w.units[uid];
  if (!u || authorize(w, actor.id, unitRef(uid), 'manage')) return fail('Only unit officers can set doctrine.');
  u.doctrine = d;
  return ok(`Doctrine: ${d}.`);
}

export function squadUpgrade(w: World, actor: Citizen, uid: Id, idx: number, spec?: string): Result {
  const u = w.units[uid];
  if (!u || authorize(w, actor.id, unitRef(uid), 'manage')) return fail('Only unit officers can manage squads.');
  const sq = u.squads[idx];
  if (!sq) return fail('No such squad.');
  if (spec) { if (!SQUAD_SPECS[spec]) return fail('Unknown specialisation.'); sq.spec = spec; return ok(`Squad ${idx + 1} is now ${spec}.`); }
  if (sq.level >= 3) return fail('Squad at max level.');
  if (!burn(w, unitRef(uid), GOLD, g(B.units.upgradeCost * sq.level), 'Squad upgrade')) return fail(`Needs ${B.units.upgradeCost * sq.level} gold in unit funds.`);
  sq.level++;
  return ok(`Squad ${idx + 1} upgraded to level ${sq.level}.`);
}

export function donate(w: World, c: Citizen, uid: Id, asset: string | null, item: string | null, n: number): Result {
  const u = w.units[uid];
  if (!u || c.unit !== uid) return fail('You can only supply your own unit.');
  if (c.mining) return fail('Donations are blocked while mining.');
  if (asset) return pay(w, cref(c.id), unitRef(uid), asset, n, `Donation to ${u.name}`) ? ok('Donated to unit funds.') : fail('Insufficient funds.');
  if (item) return moveItems(w, cref(c.id), unitRef(uid), item, n) ? ok('Supplies delivered to the unit store.') : fail('Not enough items or unit storage.');
  return fail('Nothing to donate.');
}

/** Split the unit store's weapons and food equally among members. */
export function distribute(w: World, actor: Citizen, uid: Id): Result {
  const u = w.units[uid];
  if (!u || authorize(w, actor.id, unitRef(uid), 'manage')) return fail('Only unit officers can distribute supplies.');
  const ms = members(u).filter((id) => w.citizens[id]);
  if (!ms.length) return fail('No members.');
  let moved = 0;
  for (const [k, total] of Object.entries(u.inv)) {
    if (!(k.startsWith('wg:') || k.startsWith('wa:') || k.startsWith('food:'))) continue;
    const each = Math.floor(total / ms.length);
    if (each <= 0) continue;
    for (const id of ms) if (moveItems(w, unitRef(uid), cref(id), k, each)) moved += each;
  }
  return moved ? ok(`Distributed ${moved} supply items.`) : fail('Not enough supplies to split.');
}

export function promote(w: World, actor: Citizen, uid: Id, target: Id): Result {
  const u = w.units[uid];
  if (!u || u.commander !== actor.id) return fail('Only the commander appoints officers.');
  if (!members(u).includes(target)) return fail('Not a member.');
  if (!u.officers.includes(target)) u.officers.push(target);
  return ok(`${w.citizens[target].name} is now an officer.`);
}

/** Seed one or two AI units per nation from its soldiers. */
export function seedUnits(w: World) {
  for (const n of w.nations) {
    const soldiers = census(w).all.filter((c) => c.nation === n.id && !c.player && (c.persona === 'soldier' || (c.persona === 'builder' && c.traits.risk > 0.7))).sort((a, b) => b.power - a.power || a.id - b.id);
    if (soldiers.length < 3) continue;
    const u = createUnit(w, soldiers[0]);
    for (const s of soldiers.slice(1, 12)) addMember(u, s);
    if (soldiers.length > 14) {
      const u2 = createUnit(w, soldiers[12]);
      for (const s of soldiers.slice(13, 20)) addMember(u2, s);
    }
  }
  void sendMsg;
}
