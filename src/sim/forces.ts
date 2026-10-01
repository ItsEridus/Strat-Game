// Standing armed forces: army divisions, navy fleets and air wings.
//
// Formations have strength, equipment, readiness, morale and experience. They
// cost upkeep from the military budget and consume national stocks (weapons,
// oil, iron) to keep their equipment up. Armies hold and take ground: they fight
// in battles in (or next to) their region, move one region a day over land,
// and cross the sea only where the navy rules the waves. Fleets contest the
// real seas: naval superiority enables amphibious landings, blockades enemy
// coasts (production and supply), and fleets bombard coasts in support. Air
// wings fight for air superiority and strike battlefields within range.
//
// Citizens (AI and player) enlist in a branch, report for duty, fight, and rise
// through real rank ladders to command formations; the most senior officer
// becomes chief of staff. AI defence ministries raise, supply, deploy and order
// forces by the same rules the player's government uses.
import { conscriptionOf, doctrineFactor, serviceShareFactor, upkeepFactor } from './forceStructure';
import { capsOf, techAvg } from './strategic';
import { defenceContracts, formationGen, kindGen, qualityFactor, upkeepScale, wearFactor } from './arsenal';
import { baselineOf } from '../data/nationBaselines';
import { recordPay } from './wages';
import { wound } from './health';
import { hash01 } from '../engine/rng';
import { enroll, enrollCheck } from './education';
import { rank } from '../data/education';
import { lifeGate, milestone } from './lifecycle';
import { ageOf, seniority, serviceDays } from './growth';
import type { Battle, Branch, Citizen, Formation, FormationKind, Id, Ministry, World } from './types';
import { census, nationals, referenceSociety } from './census';
import { B } from '../data/balance';
import { EARTH } from '../data/earth';
import { ALERT_NAMES, BRANCH_NAME, KINDS, POSTURE, RANKS, ordinal } from '../data/military';
import { fail, ok, type Result } from '../engine/result';
import { consume, pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { DAY, dayOf } from '../engine/clock';
import { nid, notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { controller, cref, hhref, jailed, natref, player } from './query';
import { MINISTRY_INFO, nationPerm } from './authority';
import { govTemplate } from './stategov';
import { activeWars, enemyOf, launchBattle, warBetween } from './war';
import { kmBetween } from './travel';
import { buyBest } from './market';
import { refValue } from '../data/items';
import { AUTH_ANY, withAuthority } from './worldgen';

// ---------- geography helpers ----------

export const seasOf = (rid: Id): string[] => EARTH.regions[rid].seas ?? [];
export const coastal = (rid: Id) => seasOf(rid).length > 0;
const SEA = new Map(EARTH.seas.map((s) => [s.name, s]));
export const seaAdj = (zone: string) => SEA.get(zone)?.adj ?? [];
const isRoute = (a: Id, b: Id) => EARTH.routes.some((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
const friendly = (w: World, nation: Id, other: Id) => other === nation || w.nations[nation].alliances.includes(other);

export const formationsOf = (w: World, nation: Id) => Object.values(w.forces).filter((f) => f.nation === nation);

/** Effective combat power (before terrain/situation modifiers). */
export function power(w: World, f: Formation): number {
  const k = KINDS[f.kind];
  let p = k.power * (f.strength / 100) * (0.5 + f.equipment / 200) * (0.5 + f.readiness / 200) * (0.6 + f.morale / 250) * (1 + f.experience / 200);
  const cmd = f.commander != null ? w.citizens[f.commander] : null;
  if (cmd) p *= 1 + cmd.mil.rank * 0.02;
  if (w.nations[f.nation].defense.chief != null) p *= 1 + B.forces.chiefBonus;
  return p * qualityFactor(formationGen(w, f)) * doctrineFactor(w, f);
}

/** Naval power a nation (and its allies) has in a sea zone. */
export function navalPower(w: World, nation: Id, zone: string): number {
  let p = 0;
  for (const id in w.forces) { // (no array allocation: this runs very often in wartime)
    const f = w.forces[id];
    if (f.branch === 'navy' && f.zone === zone && friendly(w, nation, f.nation)) p += power(w, f) * (KINDS[f.kind].naval ?? 1);
  }
  return p;
}

/** Naval superiority: clearly stronger than the opponent in that zone. */
export const superiority = (w: World, nation: Id, vs: Id, zone: string) => {
  const mine = navalPower(w, nation, zone);
  return mine > 0 && mine > navalPower(w, vs, zone) * 1.2;
};

/** Can `nation` land troops on coastal region `rid` held by `vs`? */
export const canLand = (w: World, nation: Id, rid: Id, vs: Id) => seasOf(rid).some((z) => superiority(w, nation, vs, z));

/** Sea lanes and straits are cut when an enemy at war rules the waters they cross. */
export function routeBlocked(w: World, nation: Id, a: Id, b: Id): boolean {
  if (!isRoute(a, b)) return false;
  const sa = seasOf(a), sb = seasOf(b);
  const shared = sa.filter((z) => sb.includes(z));
  const zones = shared.length ? shared : [...sa, ...sb];
  for (const war of activeWars(w)) {
    if (war.att !== nation && war.def !== nation) continue;
    const enemy = enemyOf(war, nation);
    if (zones.some((z) => superiority(w, enemy, nation, z))) return true;
  }
  return false;
}

/** Fog of war: can `viewer` see this formation? */
export function visible(w: World, viewer: Id, f: Formation): boolean {
  if (friendly(w, viewer, f.nation)) return true;
  if ((w.nations[viewer].agency.milIntel[f.nation] ?? 0) > w.time) return true;
  if ((w.nations[viewer].agency.network[f.nation] ?? 0) >= 50) return true;
  if (f.branch === 'navy') return f.zone != null && (navalPower(w, viewer, f.zone) > 0 || w.regions.some((r) => controller(r) === viewer && seasOf(r.id).includes(f.zone!)));
  const r = w.regions[f.loc];
  return controller(r) === viewer || r.links.some((l) => controller(w.regions[l]) === viewer);
}

// ---------- genesis ----------

function makeFormation(w: World, nation: Id, kind: FormationKind, loc: Id, name: string, strength = 100): Formation {
  const k = KINDS[kind];
  const f: Formation = {
    id: nid(w), nation, branch: k.branch, kind, name, loc, zone: k.branch === 'navy' ? seasOf(loc)[0] ?? null : null,
    strength, equipment: rand(w, 70, 95), readiness: rand(w, 55, 80), morale: rand(w, 60, 80), experience: rand(w, 0, 20),
    commander: null, order: { kind: k.branch === 'navy' ? 'patrol' : 'garrison', target: null }, path: [], created: w.time, kills: 0,
    gen: kindGen(w, w.nations[nation], kind),
  };
  w.forces[f.id] = f;
  return f;
}

export function initForces(w: World) {
  for (const n of w.nations) {
    const post = POSTURE[EARTH.nations[n.id].iso] ?? { land: 0.6, sea: 0.5, air: 0.5 };
    const own = w.regions.filter((r) => r.owner === n.id).sort((a, b) => b.pop - a.pop);
    const count = { army: Math.round(3 + 4 * post.land), air: Math.round(1 + 3 * post.air), navy: Math.round(1 + 2.5 * post.sea) };
    // Army: spread over the capital, big cities and border regions; terrain decides the type.
    const border = own.filter((r) => r.links.some((l) => w.regions[l].owner !== n.id && !isRoute(r.id, l)));
    const posts = [n.capital, ...border.map((r) => r.id), ...own.map((r) => r.id)];
    const counters = { infantry: 0, armored: 0, mountain: 0, marines: 0 };
    for (let i = 0; i < count.army; i++) {
      const loc = posts[i % posts.length];
      const t = w.regions[loc].terrain;
      const kind: FormationKind = t === 'mountains' && i % 2 ? 'mountain' : i % 4 === 1 ? 'armored' : coastal(loc) && i % 5 === 4 ? 'marines' : 'infantry';
      const idx = ++counters[kind as keyof typeof counters];
      makeFormation(w, n.id, kind, loc, `${ordinal(idx === 1 && kind === 'mountain' ? 10 : idx)} ${KINDS[kind].name}`, Math.round(rand(w, 75, 100)));
    }
    // Navy: one fleet per home sea (the busiest coasts first); big navies add carriers and submarines.
    const ports = own.filter((r) => coastal(r.id));
    const seen = new Set<string>();
    const homes = ports.filter((r) => { const z = seasOf(r.id)[0]; if (seen.has(z)) return false; seen.add(z); return true; });
    for (let i = 0; i < count.navy && ports.length; i++) {
      const port = homes[i % Math.max(1, homes.length)] ?? ports[0];
      const zone = seasOf(port.id)[0];
      const kind: FormationKind = i >= homes.length && post.sea >= 1.2 && i % 2 === 0 ? 'carrier' : i >= homes.length ? 'submarine' : 'fleet';
      const name = kind === 'fleet' ? `${zone.replace(/ &.*/, '')} Fleet` : kind === 'carrier' ? `${ordinal(i)} Carrier Strike Group` : `${ordinal(i)} Submarine Flotilla`;
      makeFormation(w, n.id, kind, port.id, name, Math.round(rand(w, 70, 100)));
    }
    // Air: wings at the capital and major cities.
    for (let i = 0; i < count.air; i++) {
      const kind: FormationKind = i % 3 === 2 ? 'bomber' : 'fighter';
      makeFormation(w, n.id, kind, own[i % Math.min(own.length, 5)].id, `${ordinal(i + 1)} ${KINDS[kind].name}`, Math.round(rand(w, 70, 100)));
    }
    n.inv['wg:1'] = n.inv['wg:1']; // stocks for upkeep come from genesis storage
  }
}

// ---------- raising, disbanding, orders, command ----------

export function raiseCheck(w: World, actor: Id, nation: Id, kind: FormationKind, rid: Id): string | null {
  const n = w.nations[nation];
  const k = KINDS[kind];
  if (!nationPerm(w, actor, nation, 'war')) return 'Only the defence minister, vice president or national leader raises forces.';
  if (controller(w.regions[rid]) !== nation || w.regions[rid].owner !== nation) return 'Raise forces in your own territory.';
  if (k.branch === 'navy' && !coastal(rid)) return 'Fleets need a coastal region as home port.';
  const money = cur(k.raise.money);
  if ((n.wallet[n.cur] ?? 0) < money) return `Needs ${fmtAmt(n.cur, money)} in the treasury.`;
  for (const [item, q] of Object.entries(k.raise.items)) if ((n.inv[item] ?? 0) < q) return `Needs ${q} ${item} in national storage (have ${n.inv[item] ?? 0}).`;
  return null;
}

export function raiseFormation(w: World, actor: Id, nation: Id, kind: FormationKind, rid: Id): Result {
  const why = raiseCheck(w, actor, nation, kind, rid);
  if (why) return fail(why);
  const n = w.nations[nation];
  const k = KINDS[kind];
  pay(w, natref(nation), hhref(nation), n.cur, cur(k.raise.money), `Raising a ${k.name}`);
  for (const [item, q] of Object.entries(k.raise.items)) consume(w, natref(nation), item, q, 'military procurement');
  const same = formationsOf(w, nation).filter((f) => f.kind === kind).length;
  const name = k.branch === 'navy' && kind === 'fleet' ? `${seasOf(rid)[0].replace(/ &.*/, '')} Fleet ${ordinal(same + 1)}` : `${ordinal(same + 1)} ${k.name}`;
  const f = makeFormation(w, nation, kind, rid, name, 60);
  f.readiness = 30; f.experience = 0; f.equipment = 90;
  record(w, 'military', `🎖️ ${n.name} raised the ${f.name} in ${w.regions[rid].name}.`, { nation, region: rid });
  return ok(`${f.name} raised in ${w.regions[rid].name}. It needs time to train (readiness 30).`);
}

export function disband(w: World, actor: Id, fid: Id): Result {
  const f = w.forces[fid];
  if (!f || !nationPerm(w, actor, f.nation, 'war')) return fail('Only the defence ministry disbands formations.');
  delete w.forces[fid];
  return ok(`${f.name} was disbanded.`);
}

/** Commanders give their own formation orders; the defence ministry can order any. */
export function canOrder(w: World, actor: Id, f: Formation) {
  return f.commander === actor || nationPerm(w, actor, f.nation, 'war');
}

export function orderCheck(w: World, actor: Id, fid: Id, kind: Formation['order']['kind'], target: Id | string | null): string | null {
  const f = w.forces[fid];
  if (!f) return 'Unknown formation.';
  if (!canOrder(w, actor, f)) return 'You neither command this formation nor sit in the defence ministry.';
  const valid: Record<Branch, Formation['order']['kind'][]> = { army: ['garrison', 'move', 'support'], navy: ['patrol', 'move', 'support'], air: ['garrison', 'strike', 'superiority'] };
  if (!valid[f.branch].includes(kind)) return `A ${BRANCH_NAME[f.branch].toLowerCase()} formation cannot ${kind}.`;
  if (kind === 'move') {
    if (f.branch === 'navy') { if (typeof target !== 'string' || !SEA.has(target)) return 'Choose a sea zone.'; if (!seaPath(f.zone, target).length && f.zone !== target) return 'No sea route there.'; }
    else if (typeof target !== 'number' || !armyPath(w, f, target).length) return 'No route: go overland through friendly or enemy territory at war (sea crossings need naval superiority).';
  }
  if ((kind === 'support' || kind === 'strike' || kind === 'superiority') && typeof target === 'number') {
    if (f.branch === 'air' && kmBetween(f.loc, target) > B.forces.airRangeKm) return `Out of range (${B.forces.airRangeKm.toLocaleString()} km from base).`;
    if (f.branch === 'army' && f.loc !== target && !w.regions[f.loc].links.includes(target)) return 'Armies support battles in their own or a neighbouring region.';
    if (f.branch === 'navy' && !(f.zone && seasOf(target).includes(f.zone))) return 'The fleet must be in a sea that touches that coast.';
  }
  return null;
}

export function setOrder(w: World, actor: Id, fid: Id, kind: Formation['order']['kind'], target: Id | string | null): Result {
  const why = orderCheck(w, actor, fid, kind, target);
  if (why) return fail(why);
  const f = w.forces[fid];
  f.order = { kind, target };
  f.path = kind === 'move' ? (f.branch === 'navy' ? seaPath(f.zone, target as string) : armyPath(w, f, target as number)) : [];
  const dest = typeof target === 'number' ? w.regions[target].name : target ?? '';
  return ok(`${f.name}: ${kind}${dest ? ` → ${dest}` : ''}${f.path.length ? ` (${f.path.length} day${f.path.length > 1 ? 's' : ''})` : ''}.`);
}

function seaPath(from: string | null, to: string): string[] {
  if (!from || from === to) return [];
  const prev = new Map<string, string>([[from, '']]);
  const q = [from];
  while (q.length) { const z = q.shift()!; if (z === to) break; for (const a of seaAdj(z)) if (!prev.has(a)) { prev.set(a, z); q.push(a); } }
  if (!prev.has(to)) return [];
  const out: string[] = [];
  for (let z = to; z !== from; z = prev.get(z)!) out.unshift(z);
  return out;
}

/** Overland route through friendly territory (or into an enemy region at war); sea crossings need superiority. */
export function armyPath(w: World, f: Formation, to: Id): Id[] {
  if (f.loc === to) return [];
  const prev = new Map<Id, Id>([[f.loc, -1]]);
  const q = [f.loc];
  const passable = (from: Id, id: Id) => {
    const ctl = controller(w.regions[id]);
    const ok_ = friendly(w, f.nation, ctl) || (id === to && !!warBetween(w, f.nation, ctl));
    if (!ok_) return false;
    if (isRoute(from, id)) { const zones = [...new Set([...seasOf(from), ...seasOf(id)])]; return zones.some((z) => navalPower(w, f.nation, z) > 0 && !activeWars(w).some((x) => (x.att === f.nation || x.def === f.nation) && superiority(w, enemyOf(x, f.nation), f.nation, z))); }
    return true;
  };
  while (q.length) {
    const id = q.shift()!;
    if (id === to) break;
    for (const l of w.regions[id].links) if (!prev.has(l) && passable(id, l)) { prev.set(l, id); q.push(l); }
  }
  if (!prev.has(to)) return [];
  const path: Id[] = [];
  for (let c = to; c !== f.loc; c = prev.get(c)!) path.unshift(c);
  return path;
}

export function commandCheck(w: World, c: Citizen, fid: Id): string | null {
  const tooYoung = lifeGate(w, c, 18, 'Military command');
  if (tooYoung) return tooYoung;
  const f = w.forces[fid];
  if (!f || f.nation !== c.nation) return 'Command formations of your own nation.';
  if (c.mil.branch !== f.branch) return `Only ${BRANCH_NAME[f.branch]} officers command it.`;
  if (c.mil.reserve) return publicOffice(w, c) ? `As ${publicOffice(w, c)} you give orders as Commander-in-Chief or minister, not as a field commander.` : 'Reservists do not command formations: return to active duty first.';
  const r = RANKS[f.branch][c.mil.rank];
  if (!r.command) return `Requires the rank of ${RANKS[f.branch].find((x) => x.command)!.name}.`;
  if (jailed(w, c)) return 'You are in prison.';
  if (Object.values(w.forces).some((x) => x.commander === c.id && x.id !== fid)) return 'You already command a formation.';
  if (f.commander != null && f.commander !== c.id && (w.citizens[f.commander]?.mil.rank ?? -1) >= c.mil.rank) return `${w.citizens[f.commander].name} (${rankName(w.citizens[f.commander])}) already commands it.`;
  if (f.commander === c.id) return 'You already command it.';
  return null;
}

export function takeCommand(w: World, c: Citizen, fid: Id): Result {
  const why = commandCheck(w, c, fid);
  if (why) return fail(why);
  const f = w.forces[fid];
  f.commander = c.id;
  if (c.player) record(w, 'military', `🎖️ ${rankName(c)} ${c.name} took command of the ${f.name}.`, { cit: c.id, nation: c.nation, player: true });
  return ok(`You command the ${f.name}.`);
}

// ---------- service and ranks ----------

// Civilian control of the armed forces: a public office and active service do not
// mix. Office holders go to the reserve (rank and record kept) and may return to
// active duty when they leave office. The head of government is Commander-in-Chief
// for as long as they hold office: supreme command, not a service rank.

/** The public office someone holds that is incompatible with active duty, if any. */
export function publicOffice(w: World, c: Citizen): string | null {
  const n = w.nations[c.nation];
  if (!n) return null;
  if (n.president === c.id) return n.leader;
  for (const [m, id] of Object.entries(n.cabinet)) if (id === c.id) return MINISTRY_INFO[m as Ministry].name;
  if (n.deputies.includes(c.id)) return `member of the ${n.legislature}`;
  const s = w.govs.find((g) => g?.head.cit === c.id);
  if (s) return `${govTemplate(w, s.region)?.title ?? 'head of government'} of ${w.regions[s.region].name}`;
  return null;
}

export const onActiveDuty = (c: Citizen) => !!c.mil.branch && !c.mil.reserve;

/** The nation's Commander-in-Chief (its head of government), if any. */
export const commanderInChief = (w: World, nation: Id): Citizen | null => {
  const id = w.nations[nation]?.president;
  return id != null && w.citizens[id] && !w.citizens[id].gone ? w.citizens[id] : null;
};

/** How someone appears in the chain of command. */
export function militaryTitle(w: World, c: Citizen): string {
  if (w.nations[c.nation]?.president === c.id) return 'Commander-in-Chief';
  if (!c.mil.branch) return 'Civilian';
  return c.mil.reserve ? `${rankName(c)} (reserve)` : rankName(c);
}

/** Move someone to the reserve: commands and the chief of staff post are handed over. */
export function toReserve(w: World, c: Citizen, why: string) {
  if (!c.mil.branch || c.mil.reserve) return;
  c.mil.reserve = true;
  c.mil.reserveSince = w.time;
  for (const f of Object.values(w.forces)) if (f.commander === c.id) f.commander = null;
  const n = w.nations[c.nation];
  if (n.defense.chief === c.id) { n.defense.chief = null; n.defense.appointed = false; }
  if (c.player) notify(w, 'office', `🎖️ Civilian control: as ${why} you pass to the reserve as ${rankName(c)}. Your rank and record are kept; you can return to active duty after leaving office.`, { link: 'forces' });
}

export function returnToDutyCheck(w: World, c: Citizen): string | null {
  if (!c.mil.branch) return 'You are not in the armed forces.';
  if (!c.mil.reserve) return 'Already on active duty.';
  const office = publicOffice(w, c);
  if (office) return `A serving ${office} cannot be on active duty: leave office first.`;
  if (jailed(w, c)) return 'You are in prison.';
  return null;
}

export function returnToDuty(w: World, c: Citizen): Result {
  const why = returnToDutyCheck(w, c);
  if (why) return fail(why);
  c.mil.since += w.time - (c.mil.reserveSince ?? w.time); // time in the reserve does not count as service
  c.mil.reserve = false;
  delete c.mil.reserveSince;
  return ok(`Back on active duty as ${rankName(c)}.`);
}

/** Serving personnel retire at the service age limit (flag officers a little later), as veterans. */
export function serviceRetirements(w: World) {
  for (const c of census(w).all) {
    if (!c.mil.branch) continue;
    const limit = RANKS[c.mil.branch][c.mil.rank].flag ? B.forces.retireAgeFlag : B.forces.retireAge;
    if (ageOf(w, c) < limit) continue;
    const title = rankName(c);
    discharge(w, c);
    milestone(w, c, 'service', `Retired from the armed forces as ${title} after ${c.veteran?.days ?? 0} days of service.`);
    if (c.player) notify(w, 'personal', `🎖️ At ${ageOf(w, c)} you retire from the armed forces as ${title}: a veteran now.`, { critical: true, link: 'forces' });
  }
}

/** Hourly: anyone holding public office who is still on active duty passes to the reserve. */
export function civilianControl(w: World) {
  const holders = new Set<Id>();
  for (const n of w.nations) {
    if (n.president != null) holders.add(n.president);
    for (const id of Object.values(n.cabinet)) if (id != null) holders.add(id);
    for (const id of n.deputies) holders.add(id);
  }
  for (const s of w.govs) if (s?.head.cit != null) holders.add(s.head.cit);
  for (const id of holders) {
    const c = w.citizens[id];
    if (c && !c.gone && onActiveDuty(c)) toReserve(w, c, publicOffice(w, c) ?? 'an office holder');
  }
}

/** The Commander-in-Chief chooses the Chief of Staff from serving officers of command rank. */
export function appointChiefCheck(w: World, actor: Id, nation: Id, cid: Id): string | null {
  const n = w.nations[nation];
  if (!n || n.president !== actor) return `Only the Commander-in-Chief (the ${n?.leader ?? 'head of government'}) appoints the Chief of Staff.`;
  const c = w.citizens[cid];
  if (!c || c.gone || c.nation !== nation) return 'Choose a serving officer of this nation.';
  if (!onActiveDuty(c)) return `${c.name} is not on active duty.`;
  if (!RANKS[c.mil.branch!][c.mil.rank].command) return `${c.name} (${rankName(c)}) does not hold a command rank.`;
  if (jailed(w, c)) return `${c.name} is in prison.`;
  if (n.defense.chief === cid) return `${c.name} already is Chief of Staff.`;
  return null;
}

export function appointChief(w: World, actor: Id, nation: Id, cid: Id): Result {
  const why = appointChiefCheck(w, actor, nation, cid);
  if (why) return fail(why);
  const n = w.nations[nation];
  const c = w.citizens[cid];
  n.defense.chief = cid;
  n.defense.appointed = true;
  record(w, 'military', `🎖️ ${w.citizens[actor].name}, Commander-in-Chief, appointed ${rankName(c)} ${c.name} Chief of Staff of the ${n.adj} armed forces.`, { nation, cit: cid, important: true });
  if (c.player) notify(w, 'progress', `🎖️ You have been appointed Chief of Staff of the ${n.adj} armed forces (+${B.forces.chiefBonus * 100}% to every formation).`, { link: 'forces', critical: true });
  return ok(`${c.name} is now Chief of Staff.`);
}

export const rankName = (c: Citizen) => (c.mil.branch ? RANKS[c.mil.branch][c.mil.rank].name : 'Civilian');

export function enlistCheck(w: World, c: Citizen, branch: Branch): string | null {
  const tooYoung = lifeGate(w, c, 18, 'Enlisting');
  if (tooYoung) return tooYoung;
  if (c.mil.branch) return c.mil.reserve ? `You are in the ${BRANCH_NAME[c.mil.branch]} reserve.` : `You already serve in the ${BRANCH_NAME[c.mil.branch]}.`;
  const office = publicOffice(w, c);
  if (office) return `As ${office} you cannot enlist: public office and active service do not mix.`;
  if (ageOf(w, c) > B.forces.maxEnlistAge) return `The armed forces take new recruits up to age ${B.forces.maxEnlistAge}.`;
  if (jailed(w, c)) return 'You are in prison.';
  if (c.sec.record.convictions > 1) return 'Repeat offenders are not accepted.';
  if (w.nations[c.nation].exile && branch !== 'army') return 'A government in exile only has its army.';
  return null;
}

export function enlist(w: World, c: Citizen, branch: Branch): Result {
  const why = enlistCheck(w, c, branch);
  if (why) return fail(why);
  c.mil = { branch, rank: 0, sp: 0, since: w.time, lastDuty: -1, commands: 0 };
  return ok(`You enlisted in the ${w.nations[c.nation].adj} ${BRANCH_NAME[branch]} as ${RANKS[branch][0].name}.`);
}

export function discharge(w: World, c: Citizen): Result {
  if (!c.mil.branch) return fail('You are not in the armed forces.');
  for (const f of Object.values(w.forces)) if (f.commander === c.id) f.commander = null;
  const n = w.nations[c.nation];
  if (n.defense.chief === c.id) { n.defense.chief = null; n.defense.appointed = false; }
  const was = rankName(c);
  const days = serviceDays(w, c);
  if (days >= 30) c.veteran = { branch: c.mil.branch, rank: c.mil.rank, title: was, days: days + (c.veteran?.days ?? 0), until: w.time };
  c.mil = { branch: null, rank: 0, sp: 0, since: 0, lastDuty: -1, commands: 0 };
  return ok(`Honourably discharged (${was}).`);
}

export function dutyCheck(w: World, c: Citizen): string | null {
  const tooYoung = lifeGate(w, c, 18, 'Military duty');
  if (tooYoung) return tooYoung;
  if (!c.mil.branch) return 'Enlist first.';
  if (c.mil.reserve) return publicOffice(w, c) ? `You are in the reserve while serving as ${publicOffice(w, c)}.` : 'You are in the reserve: return to active duty first.';
  if (jailed(w, c)) return 'You are in prison.';
  if (c.mil.lastDuty === dayOf(w.time)) return 'You already reported for duty today.';
  if (c.energy < B.forces.dutyEnergy) return `Needs ${B.forces.dutyEnergy} energy.`;
  return null;
}

/** Daily duty: drill, pay, service points, and your formation's readiness. */
export function reportForDuty(w: World, c: Citizen): Result {
  const why = dutyCheck(w, c);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  c.energy -= B.forces.dutyEnergy;
  c.mil.lastDuty = dayOf(w.time);
  addSp(w, c, B.forces.dutySp);
  const payAmt = cur(B.forces.salary[c.mil.rank] ?? 1);
  const paid = pay(w, natref(n.id), cref(c.id), n.cur, payAmt, `${BRANCH_NAME[c.mil.branch!]} pay`);
  if (paid) { n.stats.spendToday += payAmt; recordPay(w, c, `${n.adj} ${BRANCH_NAME[c.mil.branch!]}`, n.cur, payAmt, 0, 0); }
  const f = Object.values(w.forces).find((x) => x.commander === c.id) ?? Object.values(w.forces).filter((x) => x.nation === c.nation && x.branch === c.mil.branch).sort((a, b) => a.readiness - b.readiness)[0];
  if (f) f.readiness = Math.min(100, f.readiness + 1 + c.mil.rank * 0.1);
  return ok(`Reported for duty${paid ? ` (+${fmtAmt(n.cur, payAmt)})` : ' (pay delayed: treasury empty)'}; +${B.forces.dutySp} service points${f ? `, ${f.name} readiness ${Math.round(f.readiness)}` : ''}.`);
}

export function addSp(w: World, c: Citizen, sp: number) {
  if (!c.mil.branch) return;
  c.mil.sp += sp;
  const ladder = RANKS[c.mil.branch];
  while (c.mil.rank + 1 < ladder.length) {
    const next = ladder[c.mil.rank + 1];
    if (c.mil.sp < next.sp || serviceDays(w, c) < next.days) break;
    if (next.flag && c.mil.commands < 10) break; // flag ranks need 10 days of formation command
    if (c.mil.rank + 1 === 5 && !c.mil.commissioned) { // officer ranks need a commission (academy or officer training)
      if (!c.player && !c.edu?.enrolled) {
        const course = rank(c.edu?.level ?? 'school') >= rank('bachelor') ? 'ocs' : 'academy'; // graduates train as officers; young NCOs go to the academy
        if (!enrollCheck(w, c, course, c.edu?.field ?? 'engineering')) enroll(w, course, c.edu?.field ?? 'engineering', c);
      }
      if (c.player && !c.mil.hinted) { c.mil.hinted = true; notify(w, 'progress', `🎖️ You have the service for an officer's rank. Officer ranks need a commission: officer training for graduates, or the military academy (Life → Education).`, { link: 'life' }); }
      break;
    }
    c.mil.rank++;
    if (c.player) notify(w, 'progress', `🎖️ Promoted to ${next.name}${next.command && !ladder[c.mil.rank - 1].command ? ' — you can now command a formation' : ''}.`, { link: 'forces' });
    else if (next.flag && c.nation === player(w).nation) record(w, 'military', `🎖️ ${c.name} was promoted to ${next.name}.`, { cit: c.id, nation: c.nation });
  }
}

/** Service points from war damage (called by the battle system). */
export const serviceFromDamage = (w: World, c: Citizen, dmg: number) => { if (c.mil.branch) addSp(w, c, dmg / B.forces.dmgPerSp); if (dmg > 0 && hash01(c.id, w.time, 4242) < 0.004) wound(w, c); };

export function onBattleOver(w: World, b: Battle, winner: 'a' | 'd') {
  for (const [id, v] of Object.entries(b.total)) {
    const c = w.citizens[Number(id)];
    if (c && c.mil.branch && v[winner] > 0) addSp(w, c, B.forces.victorySp);
  }
  // Formations: morale and experience; the winners take the ground, the losers fall back.
  const win = winner === 'a' ? b.att : b.def;
  const lose = winner === 'a' ? b.def : b.att;
  for (const f of engaged(w, b, 'a').concat(engaged(w, b, 'd'))) {
    const won = f.nation === win || w.nations[win]?.alliances.includes(f.nation);
    f.morale = Math.max(0, Math.min(100, f.morale + (won ? 10 : -15)));
    f.experience = Math.min(100, f.experience + 5);
    if (f.branch !== 'army') continue;
    if (won && winner === 'a' && b.kind === 'war' && controller(w.regions[b.region]) === win) { f.loc = b.region; f.order = { kind: 'garrison', target: null }; f.path = []; }
    if (!won && f.loc === b.region) retreat(w, f);
  }
  void lose;
}

function retreat(w: World, f: Formation) {
  const back = w.regions[f.loc].links.find((l) => friendly(w, f.nation, controller(w.regions[l])) && !isRoute(f.loc, l));
  if (back != null) f.loc = back;
  else { f.strength = Math.max(5, f.strength * 0.5); f.loc = w.nations[f.nation].capital; }
  f.order = { kind: 'garrison', target: null };
  f.path = [];
}

// ---------- battle participation (per 10-minute tick) ----------

/** Formations fighting in a battle on one side. */
export function engaged(w: World, b: Battle, side: 'a' | 'd'): Formation[] {
  const nat = side === 'a' ? b.att : b.def;
  if (nat < 0 || b.kind !== 'war') return [];
  const out: Formation[] = [];
  for (const f of Object.values(w.forces)) {
    if (!friendly(w, nat, f.nation) || f.strength < 5) continue;
    if (f.nation !== nat && !(f.order.target === b.region)) continue; // allies only when ordered
    if (f.branch === 'army') {
      if (b.airOnly) continue;
      const ordered = f.order.kind === 'support' && f.order.target === b.region;
      if ((side === 'd' && f.loc === b.region) || (ordered && (f.loc === b.region || w.regions[f.loc].links.includes(b.region)))) out.push(f);
    } else if (f.branch === 'air') {
      if ((f.order.kind === 'strike' || f.order.kind === 'superiority') && f.order.target === b.region && kmBetween(f.loc, b.region) <= B.forces.airRangeKm) out.push(f);
    } else if (f.order.kind === 'support' && f.order.target === b.region && f.zone && seasOf(b.region).includes(f.zone) && (KINDS[f.kind].support ?? 0) > 0) out.push(f);
  }
  return out;
}

function airPower(fs: Formation[], w: World) {
  return fs.filter((f) => f.branch === 'air' || f.kind === 'carrier').reduce((s, f) => s + power(w, f) * (f.kind === 'fighter' ? 1.5 : 0.7), 0);
}

export function forcesTick(w: World) {
  for (const b of Object.values(w.battles)) {
    if (b.done || b.kind !== 'war') continue;
    const A = engaged(w, b, 'a'), D = engaged(w, b, 'd');
    const prev = b.prevDmg ?? { a: b.dmg.a, d: b.dmg.d };
    // Attrition from what the other side dealt last tick.
    const dealt = { a: Math.max(0, b.dmg.a - prev.a), d: Math.max(0, b.dmg.d - prev.d) };
    const tot = dealt.a + dealt.d;
    if (tot > 0) {
      for (const [fs, enemyShare] of [[A, dealt.d / tot], [D, dealt.a / tot]] as [Formation[], number][]) {
        for (const f of fs) {
          const before = f.strength;
          f.strength = Math.max(0, f.strength - (B.forces.attrition * enemyShare) / Math.max(1, fs.length / 2));
          f.equipment = Math.max(0, f.equipment - 0.25);
          f.experience = Math.min(100, f.experience + 0.02);
          const lost = before - f.strength;
          for (const e of fs === A ? D : A) e.kills += lost / Math.max(1, (fs === A ? D : A).length);
        }
      }
    }
    // Baseline for next tick's attrition: includes the formation damage added below.
    b.prevDmg = { a: b.dmg.a, d: b.dmg.d };
    if (!A.length && !D.length) continue;
    const airA = airPower(A, w), airD = airPower(D, w);
    const r = w.regions[b.region];
    const landing = b.att >= 0 && !r.links.some((l) => controller(w.regions[l]) === b.att && !isRoute(l, b.region));
    for (const [fs, side, air, oppAir] of [[A, 'a', airA, airD], [D, 'd', airD, airA]] as [Formation[], 'a' | 'd', number, number][]) {
      let dmg = 0;
      for (const f of fs) {
        const k = KINDS[f.kind];
        let m = power(w, f) * (k.terrain?.[r.terrain] ?? 1);
        if (f.branch === 'navy' || (f.branch === 'air' && f.order.kind === 'strike')) m *= k.support ?? 1;
        if (f.branch === 'air' && f.order.kind === 'superiority') m *= 0.4;
        if (side === 'a' && landing && f.branch === 'army') m *= (k.amphibious ?? 1) * 0.8;
        if (side === 'd' && f.branch === 'army') m *= 1.1 + r.bld.base * 0.05; // prepared defences
        if (!r.supplied && side === 'd' && controller(r) === b.def) m *= 0.9;
        dmg += m * B.forces.dmgPerTick;
      }
      if (air > oppAir * 1.2 && air > 0) dmg *= 1 + B.forces.airSuperiority;
      dmg = Math.round(dmg * rand(w, 0.85, 1.15));
      b.dmg[side] += dmg;
      b.forceDmg = b.forceDmg ?? { a: 0, d: 0 };
      b.forceDmg[side] += dmg;
    }
  }
}

// ---------- daily: movement, upkeep, supply, navies, AI ----------

export function forcesDaily(w: World) {
  const p = player(w);
  movement(w);
  navalEngagements(w);
  blockades(w);
  for (const n of w.nations) {
    const fs = formationsOf(w, n.id);
    // Upkeep from the military budget (capped at a share of yesterday's revenue plus a reserve draw).
    const alertMult = 1 + (n.alert - 1) * B.forces.alertUpkeep;
    const needRaw = fs.reduce((s, f) => s + cur(KINDS[f.kind].upkeep * B.forces.upkeepScale) * (f.strength / 100), 0);
    const need = Math.round(needRaw * upkeepScale(w, n, needRaw) * upkeepFactor(n) * alertMult);
    const cap = Math.floor((n.stats.revHist[n.stats.revHist.length - 1] ?? 0) * n.defense.budget) + Math.floor((n.wallet[n.cur] ?? 0) * 0.01);
    const amt = Math.min(need, cap, n.wallet[n.cur] ?? 0);
    if (amt > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, amt, 'Military upkeep')) n.stats.spendToday += amt;
    const supplies = procurement(w, n.id, cap - amt); // spares and supplies for formations first
    defenceContracts(w, n, cap - amt - supplies); // then procurement and R&D contracts
    const funded = need > 0 ? amt / need : 1;
    n.defense.unpaid = funded < 0.8 ? n.defense.unpaid + 1 : 0;
    for (const f of fs) {
      const k = KINDS[f.kind];
      // Supplies: national stocks keep equipment up.
      // Wear and repair: equipment wears slowly (fast in battle); repairs draw national stocks.
      f.equipment = Math.max(0, f.equipment - 0.3 * wearFactor(w, f));
      if (f.equipment < 80 && (dayOf(w.time) + f.id) % 3 === 0) {
        const parts = Object.entries(k.supply).map(([item, q]) => [item, Math.max(1, Math.round((q * f.strength) / 100))] as [string, number]);
        if (parts.every(([item, q]) => (n.inv[item] ?? 0) >= q)) {
          for (const [item, q] of parts) consume(w, natref(n.id), item, q, 'military repairs');
          f.equipment = Math.min(100, f.equipment + 8);
        }
      }
      const home = f.branch === 'navy' ? true : controller(w.regions[f.loc]) === n.id && w.regions[f.loc].supplied;
      const fighting = Object.values(w.battles).some((b) => !b.done && b.kind === 'war' && (engaged(w, b, 'a').includes(f) || engaged(w, b, 'd').includes(f)));
      if (funded > 0.8 && home && !fighting) f.strength = Math.min(100, f.strength + B.forces.reinforce);
      const target = 45 + (n.alert - 1) * 8 + (funded > 0.8 ? 15 : -20) + (f.commander != null ? 5 : 0);
      f.readiness = Math.max(0, Math.min(100, f.readiness + (target - f.readiness) * B.forces.readinessDrift));
      f.morale = Math.max(0, Math.min(100, f.morale + (funded < 0.8 ? -3 : 1) + (n.warScore > 0 ? 0.5 : n.warScore < -20 ? -1 : 0)));
      if (f.commander != null) { const c = w.citizens[f.commander]; if (!c || c.gone || c.nation !== n.id || !onActiveDuty(c)) f.commander = null; else { c.mil.commands++; addSp(w, c, B.forces.commandSp); } }
      if (f.strength < 1) { record(w, 'military', `💀 The ${f.name} (${n.name}) was destroyed.`, { nation: n.id, important: n.id === p.nation }); delete w.forces[f.id]; }
    }
    if (n.defense.unpaid === 3 && n.id === p.nation) notify(w, 'politics', `⚠️ The armed forces have gone unpaid for 3 days: morale and readiness are falling.`, { link: 'forces' });
    // Security alert effects.
    if (n.alert > 1) n.approval = Math.max(5, n.approval - (n.alert - 1) * 0.15);
    n.agency.counter = Math.min(100, n.agency.counter + (n.alert - 1) * B.forces.alertCounter * 0.08);
    // Chief of staff: whom the Commander-in-Chief appointed, while they remain eligible;
    // otherwise the most senior officer on active duty.
    const officers = nationals(w, n.id).filter((c) => onActiveDuty(c) && RANKS[c.mil.branch!][c.mil.rank].command && !jailed(w, c));
    const current = n.defense.chief != null ? w.citizens[n.defense.chief] : null;
    const keep = n.defense.appointed && current && officers.includes(current);
    if (!keep) n.defense.appointed = false;
    const chief = keep ? current : officers.sort((a, b) => b.mil.rank - a.mil.rank || b.mil.sp - a.mil.sp || a.id - b.id)[0];
    if ((chief?.id ?? null) !== n.defense.chief) {
      n.defense.chief = chief?.id ?? null;
      if (chief?.player) notify(w, 'progress', `🎖️ You are now Chief of Staff of the ${n.adj} armed forces (+${B.forces.chiefBonus * 100}% to every formation).`, { link: 'forces' });
    }
  }
  defenseMinistryAI(w);
  militaryCareersAI(w);
}

function movement(w: World) {
  for (const f of Object.values(w.forces)) {
    if (!f.path.length) continue;
    const next = f.path[0];
    if (f.branch === 'navy') { f.zone = next as string; f.path.shift(); continue; }
    const rid = next as Id;
    const ctl = controller(w.regions[rid]);
    if (!friendly(w, f.nation, ctl)) {
      // The next step is enemy ground: attack it (or support the battle already there).
      const war = warBetween(w, f.nation, ctl);
      f.path = [];
      if (!war) { f.order = { kind: 'garrison', target: null }; continue; }
      if (!Object.values(w.battles).some((b) => !b.done && b.region === rid)) launchBattle(w, f.nation, war.id, rid);
      f.order = { kind: 'support', target: rid };
      continue;
    }
    f.loc = rid;
    f.path.shift();
    if (!f.path.length && f.order.kind === 'move') f.order = { kind: 'garrison', target: null };
  }
}

function navalEngagements(w: World) {
  const p = player(w);
  const zones = new Set(Object.values(w.forces).filter((f) => f.branch === 'navy' && f.zone).map((f) => f.zone!));
  for (const z of zones) {
    for (const war of activeWars(w)) {
      const A = Object.values(w.forces).filter((f) => f.branch === 'navy' && f.zone === z && friendly(w, war.att, f.nation));
      const D = Object.values(w.forces).filter((f) => f.branch === 'navy' && f.zone === z && friendly(w, war.def, f.nation));
      if (!A.length || !D.length) continue;
      const pa = A.reduce((s, f) => s + power(w, f) * (KINDS[f.kind].naval ?? 1), 0) * rand(w, 0.75, 1.25);
      const pd = D.reduce((s, f) => s + power(w, f) * (KINDS[f.kind].naval ?? 1), 0) * rand(w, 0.75, 1.25);
      const [win, lose, wn, ln] = pa > pd ? [A, D, war.att, war.def] : [D, A, war.def, war.att];
      const loss = rand(w, B.forces.naval[0], B.forces.naval[1]) * 100;
      for (const f of lose) { f.strength = Math.max(0, f.strength - loss); f.morale = Math.max(0, f.morale - 15); retreatFleet(w, f); }
      for (const f of win) { f.strength = Math.max(0, f.strength - loss / 3); f.morale = Math.min(100, f.morale + 8); f.experience = Math.min(100, f.experience + 6); f.kills += loss * lose.length / win.length; }
      const text = `⚓ Naval battle in the ${z}: the ${w.nations[wn].adj} navy defeated ${w.nations[ln].name}'s ${lose.map((f) => f.name).join(' and ')}, which withdrew.`;
      w.navalLog.unshift({ t: w.time, zone: z, text });
      if (w.navalLog.length > 50) w.navalLog.length = 50;
      record(w, 'war', text, { nation: wn, important: wn === p.nation || ln === p.nation });
    }
  }
}

function retreatFleet(w: World, f: Formation) {
  const home = seasOf(f.loc)[0];
  f.zone = home && home !== f.zone ? home : seaAdj(f.zone ?? '')[0] ?? f.zone;
  f.order = { kind: 'patrol', target: null };
  f.path = [];
}

function blockades(w: World) {
  for (const r of w.regions) r.blockade = null;
  for (const war of activeWars(w)) {
    for (const [nat, enemy] of [[war.att, war.def], [war.def, war.att]]) {
      for (const r of w.regions) {
        if (controller(r) !== enemy || !coastal(r.id)) continue;
        if (seasOf(r.id).every((z) => superiority(w, nat, enemy, z))) r.blockade = nat;
      }
    }
  }
}

/** Military procurement within the remaining budget, at sensible prices (by policy, for any government). */
function procurement(w: World, nation: Id, budget: number): number {
  const n = w.nations[nation];
  if (budget <= 0 || n.exile) return 0;
  const need: Record<string, number> = {};
  for (const f of formationsOf(w, nation)) if (f.equipment < 80) for (const [item, q] of Object.entries(KINDS[f.kind].supply)) need[item] = (need[item] ?? 0) + q * 2;
  let left = budget;
  for (const [item, q] of Object.entries(need).sort((a, b) => a[0].localeCompare(b[0]))) {
    const short = q - (n.inv[item] ?? 0);
    if (short <= 0 || left <= 0) continue;
    n.procure[item] = Math.max(n.procure[item] ?? 0, short); // signals arms makers and producers
    const maxPrice = Math.round(refValue(item) * 3);
    const before = n.wallet[n.cur] ?? 0;
    withAuthority(w, nation, () => buyBest(w, AUTH_ANY, natref(nation), nation, item, Math.min(short, Math.floor(left / maxPrice)), maxPrice));
    const spent = before - (n.wallet[n.cur] ?? 0);
    left -= spent;
    n.stats.spendToday += spent;
  }
  return budget - left;
}

/** Genesis: career officers and NCOs already serving, with ranks that fit their experience. */
export function seedOfficers(w: World) {
  for (const n of w.nations) {
    // About 3% of the population serves as career officers and NCOs (at least 7).
    const people = nationals(w, n.id);
    const pool = people.filter((c) => !c.player && !publicOffice(w, c) && ageOf(w, c) < B.forces.retireAge - 2 && (c.persona === 'soldier' || (c.traits.loyalty > 0.7 && seniority(w, c) > 15))).sort((a, b) => seniority(w, b) - seniority(w, a) || a.id - b.id).slice(0, Math.max(7, Math.round(people.length * B.forces.careerShare)));
    pool.forEach((c, i) => {
      const branch: Branch = i % 4 === 1 && formationsOf(w, n.id).some((f) => f.branch === 'navy') ? 'navy' : i % 4 === 3 ? 'air' : 'army';
      const ladder = RANKS[branch];
      // Years in uniform: career soldiers joined young, others later in life.
      const served = Math.max(30, Math.round(seniority(w, c) * (c.persona === 'soldier' ? 7 : 3)));
      let rank = 0;
      while (rank + 1 < ladder.length && ladder[rank + 1].days <= served && ladder[rank + 1].sp <= served * 6 && !(ladder[rank + 1].flag && i > 1)) rank++;
      c.mil = { branch, rank, sp: ladder[rank].sp, since: w.time - served * DAY, lastDuty: -1, commands: ladder[rank].flag ? 30 : 0 };
    });
    assignCommanders(w, n.id);
    const chief = nationals(w, n.id).filter((c) => onActiveDuty(c) && RANKS[c.mil.branch!][c.mil.rank].command).sort((a, b) => b.mil.rank - a.mil.rank || b.mil.sp - a.mil.sp || a.id - b.id)[0];
    n.defense.chief = chief?.id ?? null;
  }
}

/** Vacant formations get the most senior eligible officer. */
function assignCommanders(w: World, nation: Id) {
  const vacant = formationsOf(w, nation).filter((f) => f.commander == null);
  if (!vacant.length) return;
  const officers = nationals(w, nation).filter((x) => !x.player && onActiveDuty(x) && RANKS[x.mil.branch!][x.mil.rank].command).sort((a, b) => b.mil.rank - a.mil.rank || a.id - b.id);
  for (const f of vacant) {
    const c = officers.find((x) => !commandCheck(w, x, f.id));
    if (c) f.commander = c.id;
  }
}

// ---------- AI defence ministries ----------

const defenseActor = (w: World, nation: Id) => { const n = w.nations[nation]; return n.cabinet.defense ?? n.cabinet.vp ?? n.president; };

function defenseMinistryAI(w: World) {
  const p = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const actor = defenseActor(w, n.id);
    const playerRuns = actor === p.id;
    // Security alert follows threats.
    const wars = activeWars(w).filter((x) => x.att === n.id || x.def === n.id);
    const exposed = Object.values(w.ops).some((o) => o.target === n.id && o.status === 'exposed' && w.time - o.ends < 5 * DAY);
    if (!playerRuns) n.alert = Math.min(5, 1 + (wars.length ? 2 : 0) + (exposed ? 1 : 0) + (wars.some((x) => x.def === n.id) ? 1 : 0));
    if (actor == null || playerRuns || !w.citizens[actor]) continue;
    if ((dayOf(w.time) + n.id) % 2) continue;
    // Commanders: the best eligible officers take command.
    assignCommanders(w, n.id);
    // War: armies to the front, fleets to enemy seas, air over battles.
    for (const war of wars) {
      const enemy = enemyOf(war, n.id);
      const battles = Object.values(w.battles).filter((b) => !b.done && b.war === war.id);
      const army = formationsOf(w, n.id).filter((f) => f.branch === 'army' && f.strength > 30);
      for (const b of battles) {
        const side = b.att === n.id ? 'a' : 'd';
        const near = army.filter((f) => (f.loc === b.region || w.regions[f.loc].links.includes(b.region)) && !(f.order.kind === 'support' && f.order.target !== b.region));
        for (const f of near.slice(0, 2)) if (!(side === 'd' && f.loc === b.region)) f.order = { kind: 'support', target: b.region };
        const air = formationsOf(w, n.id).filter((f) => f.branch === 'air' && f.order.kind === 'garrison' && kmBetween(f.loc, b.region) <= B.forces.airRangeKm);
        for (const f of air.slice(0, 2)) f.order = { kind: f.kind === 'fighter' ? 'superiority' : 'strike', target: b.region };
        const fleets = formationsOf(w, n.id).filter((f) => f.branch === 'navy' && f.zone && seasOf(b.region).includes(f.zone) && f.order.kind === 'patrol');
        for (const f of fleets.slice(0, 1)) f.order = { kind: 'support', target: b.region };
      }
      // Idle divisions march on the nearest enemy border region.
      for (const f of army.filter((x) => x.order.kind === 'garrison' && !x.path.length).slice(0, 2)) {
        if (w.regions[f.loc].id === n.capital && army.length < 4) continue;
        const targets = w.regions.filter((r) => controller(r) === enemy && r.links.some((l) => friendly(w, n.id, controller(w.regions[l]))));
        const t = targets.sort((a, b) => kmBetween(f.loc, a.id) - kmBetween(f.loc, b.id))[0];
        if (t) { const path = armyPath(w, f, t.id); if (path.length && path.length <= 8) { f.order = { kind: 'move', target: t.id }; f.path = path; } }
      }
      // Navies seek the enemy's seas.
      const enemySeas = [...new Set(w.regions.filter((r) => controller(r) === enemy).flatMap((r) => seasOf(r.id)))];
      for (const f of formationsOf(w, n.id).filter((x) => x.branch === 'navy' && x.order.kind === 'patrol' && !x.path.length && x.strength > 40)) {
        if (f.zone && enemySeas.includes(f.zone)) continue;
        const dest = enemySeas.map((z) => ({ z, path: seaPath(f.zone, z) })).filter((x) => x.path.length && x.path.length <= 5).sort((a, b) => a.path.length - b.path.length)[0];
        if (dest) { f.order = { kind: 'move', target: dest.z }; f.path = dest.path; }
      }
    }
    // Peace: formations return to garrison; weak fleets go home to refit.
    if (!wars.length) for (const f of formationsOf(w, n.id)) {
      if (f.order.kind === 'support' || f.order.kind === 'strike' || f.order.kind === 'superiority') f.order = { kind: f.branch === 'navy' ? 'patrol' : 'garrison', target: null };
      if (f.branch === 'navy' && f.zone !== seasOf(f.loc)[0] && !f.path.length) { f.order = { kind: 'move', target: seasOf(f.loc)[0] }; f.path = seaPath(f.zone, seasOf(f.loc)[0]); }
    }
    // Rebuild: replace destroyed formations when the treasury allows.
    const post = POSTURE[EARTH.nations[n.id].iso] ?? { land: 0.6, sea: 0.5, air: 0.5 };
    const armyCount = formationsOf(w, n.id).filter((f) => f.branch === 'army').length;
    if (armyCount < Math.round(3 + 4 * post.land) && chance(w, 0.3)) {
      const rid = w.regions.filter((r) => controller(r) === n.id && r.owner === n.id).sort((a, b) => b.pop - a.pop)[0]?.id;
      if (rid != null && !raiseCheck(w, actor, n.id, 'infantry', rid)) raiseFormation(w, actor, n.id, 'infantry', rid);
    }
  }
}

/** AI citizens enlist (soldiers first), report for duty and rise through the ranks. */
function militaryCareersAI(w: World) {
  const serving = w.nations.map((n) => nationals(w, n.id).filter((x) => x.mil.branch).length);
  const cap = w.nations.map((n) => Math.max(8, Math.round(nationals(w, n.id).length * B.forces.serviceShare * serviceShareFactor(n))));
  for (const c of census(w).all) {
    if (c.player || jailed(w, c)) continue;
    if (!c.mil.branch) {
      if ((c.id + dayOf(w.time)) % 20 !== 0) continue;
      if (serving[c.nation] >= cap[c.nation]) continue;
      const fit = (c.persona === 'soldier' ? 0.6 : 0) + c.traits.loyalty * 0.3 + (c.job == null ? 0.2 : 0);
      if (fit > 0.55 && !enlistCheck(w, c, 'army') && ++serving[c.nation]) enlist(w, c, c.traits.risk > 0.7 ? 'air' : c.id % 3 === 0 && formationsOf(w, c.nation).some((f) => f.branch === 'navy') ? 'navy' : 'army');
      continue;
    }
    if (c.mil.reserve) { if ((c.id + dayOf(w.time)) % 10 === 0 && !returnToDutyCheck(w, c)) returnToDuty(w, c); continue; }
    // Retention: unpaid volunteers leave (conscripts cannot).
    if (w.nations[c.nation].defense.unpaid > 3 && !conscriptionOf(w.nations[c.nation]) && (c.id + dayOf(w.time)) % 10 === 0 && chance(w, 0.2)) { discharge(w, c); continue; }
    if (c.energy >= B.forces.dutyEnergy + 20 && !dutyCheck(w, c)) reportForDuty(w, c);
  }
}

// ---------- rankings ----------

export interface NationScore { id: Id; military: number; army: number; navy: number; air: number; economy: number; stability: number; intel: number; population: number; tech: number; total: number; tier: Tier }
export type Tier = 'superpower' | 'great' | 'middle' | 'regional' | 'minor';
export const TIER_LABEL: Record<Tier, string> = { superpower: 'Superpower', great: 'Great power', middle: 'Middle power', regional: 'Regional power', minor: 'Minor power' };
/** Tiers by power index (0–100). */
export const tierOf = (total: number): Tier => (total >= 80 ? 'superpower' : total >= 58 ? 'great' : total >= 45 ? 'middle' : total >= 35 ? 'regional' : 'minor');

export function nationScores(w: World): NationScore[] {
  const rows = w.nations.map((n) => {
    const fs = formationsOf(w, n.id);
    const sum = (b: Branch) => fs.filter((f) => f.branch === b).reduce((s, f) => s + power(w, f), 0) * 10;
    // Citizen soldiers count relative to the society they come from (see referenceSociety).
    const people = nationals(w, n.id);
    const soldiers = people.reduce((s, c) => s + (c.persona === 'soldier' || c.mil.branch ? 1 + c.power / 50 : 0.1), 0) * (referenceSociety(n.id) / Math.max(1, people.length));
    // Military capability: quantity × quality (military technology) × readiness.
    const caps = capsOf(w, n);
    const quality = caps.tech.military / 100;
    const ready = fs.length ? fs.reduce((t, f) => t + f.readiness, 0) / fs.length / 100 : 0.6;
    const army = (sum('army') + soldiers) * quality * (0.5 + ready / 2), navy = sum('navy') * quality * (0.5 + ready / 2), air = sum('air') * quality * (0.5 + ready / 2);
    // Economic mass: the real 2025 share of world GDP, grown by productivity since.
    const economy = baselineOf(n.iso).gdpShare * caps.productivity;
    const tech = techAvg(caps);
    const own = w.regions.filter((r) => controller(r) === n.id);
    const stability = own.length ? n.approval - own.reduce((s, r) => s + r.unrest + r.crime / 2, 0) / own.length : 0;
    const nets = Object.values(n.agency.network);
    const intel = n.agency.counter / 2 + (nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0);
    const population = w.households[n.id]?.pop ?? 0;
    return { id: n.id, military: army + navy + air, army, navy, air, economy, stability, intel, population, tech, total: 0, tier: 'minor' as Tier };
  });
  const max = (k: keyof NationScore) => Math.max(1e-9, ...rows.map((r) => r[k] as number));
  // Power index 2.0: economic mass and military capability count most; then technology, intelligence, cohesion and people.
  for (const r of rows) { r.total = Math.round(30 * Math.sqrt(r.economy / max('economy')) + 30 * r.military / max('military') + 15 * r.tech / max('tech') + 8 * r.intel / max('intel') + 10 * Math.max(0, r.stability) / max('stability') + 7 * Math.sqrt(r.population / max('population'))); r.tier = tierOf(r.total); }
  return rows.sort((a, b) => b.total - a.total);
}

export function setDefenseBudget(w: World, actor: Id, nation: Id, share: number): Result {
  if (!nationPerm(w, actor, nation, 'war')) return fail('Only the defence minister, vice president or national leader sets the military budget.');
  if (!(share >= 0 && share <= 0.5)) return fail('Between 0% and 50% of daily revenue.');
  w.nations[nation].defense.budget = share;
  return ok(`Military budget set to ${Math.round(share * 100)}% of daily revenue.`);
}

export function setAlert(w: World, actor: Id, nation: Id, level: number): Result {
  if (!nationPerm(w, actor, nation, 'war') && !nationPerm(w, actor, nation, 'intel')) return fail('Only the national security leadership sets the alert level.');
  if (!(level >= 1 && level <= 5)) return fail('Alert levels run from 1 to 5.');
  w.nations[nation].alert = Math.round(level);
  return ok(`National security alert: ${ALERT_NAMES[Math.round(level)]} (${Math.round(level)}). Readiness and counter-intelligence rise with the level; so do upkeep and public anxiety.`);
}

export { BRANCH_NAME };
