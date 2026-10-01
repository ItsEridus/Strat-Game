// Wars (DOC "War 2.0" structure, solo implementation):
//  - Congress declares a war with a deadline (8/14/21/30 days) and 0–2 goal regions.
//  - Won battles create provisional occupation (owner ≠ occupier); work tax splits 80/20.
//  - Holding the quota of occupations settles the war: held goals transfer, other
//    occupations return, retained regions lose one building level, a 7-day pact follows.
//  - Deadlines and peace terms (armistice, surrender, demand, trade) also settle wars.
import { alliedPower, onWarDeclared } from './treaties';
import { casusBelli } from './diplomacyActions';
import { addGrievance } from './relations';
import { afterActionReview } from './forceStructure';
import type { Battle, Id, Nation, PeaceOffer, Proposal, War, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { DAY } from '../engine/clock';
import { nid, notify, record, schedule } from '../engine/events';
import { authorize } from './authority';
import { createBattle, finishBattle } from './battle';
import { controller, natref, player } from './query';
import { relation, propose, eligibleVoters } from './congress';
import type { ExtraProposal } from './congressExtra';
import { partyOf } from './politics';
import { bump } from './progress';
import { cancelProject } from './construction';
import { canLand, power, routeBlocked } from './forces';
import { landNeighbour } from './travel';
import { battleEnded, battleStarted, exiled, explainDeclaration, note, offerAnswered, offerMade, warDeclared, warEnded } from './warChronicle';

export const MAX_BATTLES_PER_SIDE = 2; // SOLO

export const activeWars = (w: World) => Object.values(w.wars).filter((x) => x.status === 'active').sort((a, b) => a.id - b.id);
export const warBetween = (w: World, a: Id, b: Id) => activeWars(w).find((x) => (x.att === a && x.def === b) || (x.att === b && x.def === a));
export const warsOf = (w: World, n: Id) => activeWars(w).filter((x) => x.att === n || x.def === n);
export const enemyOf = (war: War, n: Id) => (war.att === n ? war.def : war.att);

/** Seat of government: the rightful capital if held, otherwise the most populous controlled region. */
export function seatOf(w: World, n: Nation): Id | null {
  const cap = w.regions[n.capital];
  if (cap.owner === n.id && controller(cap) === n.id) return cap.id;
  const own = w.regions.filter((r) => r.owner === n.id && controller(r) === n.id).sort((a, b) => b.pop - a.pop || a.id - b.id);
  return own[0]?.id ?? null;
}

/** Supply: a region is supplied if connected to its controller's seat through controlled regions, or protected by a L4+ base. */
export function computeSupply(w: World) {
  const reached = new Set<Id>();
  for (const n of w.nations) {
    const seat = seatOf(w, n);
    if (seat == null) continue;
    const q = [seat];
    reached.add(seat);
    while (q.length) {
      const id = q.shift()!;
      for (const l of w.regions[id].links) if (!reached.has(l) && controller(w.regions[l]) === n.id && !routeBlocked(w, n.id, id, l)) { reached.add(l); q.push(l); }
    }
  }
  for (const r of w.regions) r.supplied = reached.has(r.id) || (r.bld.base >= B.buildings.baseSupplyLevel && controller(r) === r.owner);
}

/** Supply route from a region to its controller's seat (for the map). */
export function supplyRoute(w: World, rid: Id): Id[] {
  const ctl = controller(w.regions[rid]);
  const seat = seatOf(w, w.nations[ctl]);
  if (seat == null) return [];
  const prev = new Map<Id, Id>([[rid, -1]]);
  const q = [rid];
  while (q.length) {
    const id = q.shift()!;
    if (id === seat) break;
    for (const l of w.regions[id].links) if (!prev.has(l) && controller(w.regions[l]) === ctl) { prev.set(l, id); q.push(l); }
  }
  if (!prev.has(seat)) return [];
  const path: Id[] = [];
  for (let c: Id = seat; c !== -1; c = prev.get(c)!) path.push(c);
  return path.reverse();
}

export function updateExile(w: World) {
  for (const n of w.nations) {
    const owned = w.regions.some((r) => r.owner === n.id);
    if (!owned && !n.exile) {
      n.exile = true;
      exiled(w, n);
      record(w, 'war', `🏳️ ${n.name} has lost all territory and continues as a nation in exile.`, { nation: n.id, important: true });
      if (player(w).nation === n.id) notify(w, 'warHome', `🏳️ ${n.name} is now a nation in exile. Citizenship, parties and leadership continue; hosts holding your rightful regions grant tax relief. Retake your cores to return.`, { critical: true });
    } else if (owned && n.exile) {
      n.exile = false;
      record(w, 'war', `🎉 ${n.name} has regained territory and ended its exile.`, { nation: n.id, important: true });
    }
  }
}

export function quotaFor(w: World, target: Id, goals: Id[], attacker: Id) {
  let q = B.war.quota[Math.min(goals.length, 2)];
  // Exile special: a sole goal of retaking the rightful capital completes with that capital alone (DOC).
  if (w.nations[attacker].exile && goals.length === 1 && goals[0] === w.nations[attacker].capital) q = 1;
  if (B.war.smallNationCap) q = Math.min(q, Math.max(1, w.regions.filter((r) => r.owner === target).length));
  return q;
}

// ---------- declaration (congress proposal) ----------
export function warCheck(w: World, n: Nation, params: Record<string, any>): string | null {
  const t = w.nations[params.target];
  if (!t || t.id === n.id) return 'Pick a target nation.';
  if (warBetween(w, n.id, t.id)) return 'Already at war.';
  if ((n.pacts[t.id] ?? 0) > w.time) return 'A non-aggression pact is in force.';
  if (n.alliances.includes(t.id)) return 'You are allied with that nation.';
  if (!B.war.durations.includes(params.days)) return `Duration must be one of ${B.war.durations.join('/')} days.`;
  const goals: Id[] = params.goals ?? [];
  if (goals.length > 2) return 'At most two goal regions.';
  if (!w.regions.some((r) => r.owner === t.id)) return `${t.name} holds no territory to invade.`;
  for (const g of goals) {
    const r = w.regions[g];
    if (!r || r.owner !== t.id) return 'Goals must be regions owned by the target.';
    if (n.exile && r.core !== n.id) return 'A nation in exile may only claim its rightful regions.';
  }
  if (new Set(goals).size !== goals.length) return 'Goals must differ.';
  return null;
}

export function declareWar(w: World, n: Nation, params: Record<string, any>, p?: Proposal): War {
  const t = w.nations[params.target];
  const goals: Id[] = params.goals ?? [];
  // The reasons are read before the declaration changes anything (relations, alliances' anger).
  const cause = explainDeclaration(w, n, t, goals, params.days, [militaryPower(w, n.id), militaryPower(w, t.id)], p, eligibleVoters(n).length);
  const war: War = {
    id: nid(w), att: n.id, def: t.id, declared: w.time, deadline: w.time + params.days * DAY, goals,
    quota: quotaFor(w, t.id, goals, n.id), occupied: [], counter: [], maxOcc: 0, status: 'active', battles: [], offers: [],
  };
  w.wars[war.id] = war;
  warDeclared(w, war, cause);
  schedule(w, war.deadline, 'warDeadline', { war: war.id });
  relation(w, n.id, t.id, -25, 'war declared');
  onWarDeclared(w, war); // allies decide whether to stand by the victim (sim/treaties.ts)
  record(w, 'war', `🔥 ${n.name} declared war on ${t.name}${goals.length ? `, claiming ${goals.map((g) => w.regions[g].name).join(' and ')}` : ''} (${params.days} days, ${war.quota} occupations to win).`, { nation: n.id, important: true });
  const pl = player(w);
  if (t.id === pl.nation) notify(w, 'warHome', `🔥 ${n.name} declared war on ${t.name}! Goals: ${goals.map((g) => w.regions[g].name).join(', ') || 'none'}.`, { link: 'wars', critical: true });
  else if (n.id === pl.nation) notify(w, 'war', `🔥 ${n.name} is now at war with ${t.name}.`, { link: 'wars' });
  return war;
}

export const WAR_PROPOSAL: ExtraProposal = {
  info: { name: 'Declare war', fullTerm: true },
  describe(w, n, p) {
    const t = w.nations[p.target];
    if (!t) return { effect: 'Pick a target.', cost: 0 };
    const goals: Id[] = p.goals ?? [];
    return { effect: `War on ${t.name} for ${p.days} days. Goals: ${goals.map((g) => w.regions[g]?.name).join(', ') || 'none'}. Win by holding ${quotaFor(w, t.id, goals, n.id)} occupations at once; held goals then transfer permanently, other occupations return, retained regions lose one building level, and a ${B.war.pactDays}-day pact follows. At the deadline without the quota, all occupations return.`, cost: 0 };
  },
  check: (w, n, _c, p) => warCheck(w, n, p),
  support(w, n, d, p) {
    const party = partyOf(w, d);
    const hawk = IDEOLOGIES[party?.ideo ?? d.ideo].hawk;
    const ratio = militaryPower(w, n.id) / Math.max(1, militaryPower(w, p.target) + alliedPower(w, p.target));
    const rel = n.relations[p.target]?.score ?? 0;
    const busy = activeWars(w).filter((x) => x.att === n.id || x.def === n.id).length;
    return (casusBelli(w, n, p.target) ? 0.2 : 0) + (hawk - 0.55) * 0.8 + Math.max(-0.4, Math.min(0.3, (ratio - 1) * 0.3)) - rel / 150 - busy * 0.2 + n.warMood * 0.05;
  },
  enact(w, n, p) {
    const why = warCheck(w, n, p.params);
    if (why) return `Could not declare: ${why}`;
    const war = declareWar(w, n, p.params, p);
    return `War declared; deadline in ${p.params.days} days (quota ${war.quota}).`;
  },
  aiOptions(w, n, a) {
    const party = partyOf(w, a);
    const hawk = IDEOLOGIES[party?.ideo ?? a.ideo].hawk;
    if (hawk < 0.5 || warsOf(w, n.id).length > 0) return [];
    const targets = neighborNations(w, n.id).filter((t) => !warCheck(w, n, { target: t, days: 14, goals: [] }));
    const out: { params: Record<string, any>; weight: number }[] = [];
    for (const t of targets) {
      const ratio = militaryPower(w, n.id) / Math.max(1, militaryPower(w, t) + alliedPower(w, t)); // its allies deter
      const rel = n.relations[t]?.score ?? 0;
      const cb = casusBelli(w, n, t);
      if (ratio < 1.1 || (rel > 0 && !cb)) continue;
      const border = w.regions.filter((r) => r.owner === t && r.links.some((l) => controller(w.regions[l]) === n.id));
      const goal = border.sort((x, y) => resourceValue(y) - resourceValue(x) || x.id - y.id)[0];
      out.push({ params: { target: t, days: ratio > 1.6 ? 21 : 14, goals: goal ? [goal.id] : [] }, weight: (hawk - 0.4) * (ratio - 1) * (1 - rel / 50) * (cb ? 2 : 1) });
    }
    return out;
  },
};

const resourceValue = (r: { res: Record<string, number | undefined>; pop: number }) => Object.values(r.res).reduce((s: number, v) => s + (v ?? 0), 0) + r.pop / 50000;

export function neighborNations(w: World, n: Id): Id[] {
  const s = new Set<Id>();
  for (const r of w.regions) if (controller(r) === n) for (const l of r.links) { const o = controller(w.regions[l]); if (o !== n) s.add(o); }
  return [...s].sort((a, b) => a - b);
}

/** Rough military strength used by AI decisions: citizens' power, levels and weapon stocks, plus treasury. */
export function militaryPower(w: World, n: Id): number {
  let s = 0;
  for (const c of census(w).all) {
    if (c.nation !== n) continue;
    const weapons = Object.entries(c.inv).filter(([k]) => k.startsWith('wg:') || k.startsWith('wa:')).reduce((a, [, v]) => a + v, 0);
    s += (1 + c.power / 100) * (1 + (c.attrs.str + c.attrs.acc) / 40) * (c.persona === 'soldier' ? 2 : 1) + Math.min(50, weapons) * 0.05;
  }
  const nat = w.nations[n];
  for (const f of Object.values(w.forces)) if (f.nation === n) s += power(w, f) * 15;
  return s + (nat.wallet[nat.cur] ?? 0) / 1e6;
}

// ---------- invasions ----------
export function invasionCheck(w: World, actor: Id, war: War | undefined, rid: Id): string | null {
  if (!war || war.status !== 'active') return 'No active war.';
  const actorNat = w.citizens[actor]?.nation;
  if (actorNat == null || (actorNat !== war.att && actorNat !== war.def)) return 'Your nation is not part of this war.';
  if (authorize(w, actor, natref(actorNat), 'war')) return 'Launching invasions requires the president, vice president or defense minister.';
  const r = w.regions[rid];
  const enemy = enemyOf(war, actorNat);
  const liberation = r.owner === actorNat && r.occ?.nation === enemy;
  if (!liberation && !(r.owner === enemy && controller(r) === enemy)) return 'Target must be an enemy-held region or your own occupied region.';
  if (Object.values(w.battles).some((b) => !b.done && b.region === rid)) return 'A battle is already underway there.';
  const mine = Object.values(w.battles).filter((b) => !b.done && b.war === war.id && b.att === actorNat).length;
  if (mine >= MAX_BATTLES_PER_SIDE) return `At most ${MAX_BATTLES_PER_SIDE} simultaneous offensives per side.`;
  return null;
}

/** A shared land border (sea lanes and straits don't count). */
export function landBorder(w: World, nation: Id, rid: Id) {
  return w.regions[rid].links.some((l) => controller(w.regions[l]) === nation && landNeighbour(w, l, rid));
}

/** Ground invasion possible: over a land border, or by sea where the navy has superiority. */
export function isBorder(w: World, nation: Id, rid: Id) {
  return landBorder(w, nation, rid) || canLand(w, nation, rid, controller(w.regions[rid]));
}

/** Open a battle in a war (shared by political invasions and military advances). */
export function launchBattle(w: World, nat: Id, warId: Id, rid: Id) {
  const war = w.wars[warId];
  const r = w.regions[rid];
  const exileCore = w.nations[nat].exile && r.core === nat;
  const land = landBorder(w, nat, rid);
  const amphibious = !land && canLand(w, nat, rid, controller(r));
  const airOnly = !land && !amphibious && !exileCore;
  const b = createBattle(w, 'war', rid, nat, controller(r), war.id, airOnly);
  war.battles.push(b.id);
  battleStarted(w, war, b, { airOnly, amphibious });
  const pl = player(w);
  record(w, 'war', `⚔️ ${w.nations[nat].name} attacks ${r.name}${amphibious ? ' with an amphibious landing' : airOnly ? ' (air assault: only air weapons count)' : ''}.`, { nation: nat, region: rid });
  if (controller(r) === pl.nation) notify(w, 'warHome', `⚔️ ${w.nations[nat].name} is attacking ${r.name}! Defend it.`, { link: 'wars', critical: false });
  return { b, airOnly, amphibious };
}

export function startInvasion(w: World, actor: Id, warId: Id, rid: Id): Result {
  const war = w.wars[warId];
  const why = invasionCheck(w, actor, war, rid);
  if (why) return fail(why);
  const nat = w.citizens[actor].nation;
  const r = w.regions[rid];
  const { b, airOnly, amphibious } = launchBattle(w, nat, war.id, rid);
  return ok(`Invasion of ${r.name} launched${amphibious ? ' as an amphibious landing' : airOnly ? ' as an air assault (no land border and no naval superiority)' : ''}.`, { id: b.id });
}

/** Battle won in a war: occupation or liberation, then settlement checks. */
export function onWarBattleWon(w: World, b: Battle, winner: 'a' | 'd') {
  const war = b.war != null ? w.wars[b.war] : null;
  const r = w.regions[b.region];
  const winNat = winner === 'a' ? b.att : b.def;
  const loseNat = winner === 'a' ? b.def : b.att;
  w.nations[winNat].warScore = Math.min(100, w.nations[winNat].warScore + 8);
  w.nations[loseNat].warScore = Math.max(-100, w.nations[loseNat].warScore - 8);
  if (!war || war.status !== 'active' || winner === 'd') {
    record(w, 'war', `🛡️ ${w.nations[b.def].name} held ${r.name} against ${w.nations[b.att].name}.`, { region: r.id, nation: b.def });
    if (war) battleEnded(w, war, b, winner, `${w.nations[b.def].name} kept ${r.name}; ${w.nations[b.att].name}'s war score fell to ${Math.round(w.nations[b.att].warScore)}.`);
    return;
  }
  if (r.owner === b.att) {
    // liberation of an own region
    r.occ = null;
    war.occupied = war.occupied.filter((x) => x !== r.id);
    war.counter = war.counter.filter((x) => x !== r.id);
    record(w, 'war', `🎉 ${w.nations[b.att].name} liberated ${r.name}.`, { region: r.id, nation: b.att, important: true });
    battleEnded(w, war, b, winner, `${w.nations[b.att].name} liberated its own region ${r.name}.`);
    const pl = player(w);
    if (b.att === pl.nation && (b.total[pl.id]?.a ?? 0) > 0) bump(w, 'liberations');
  } else {
    r.occ = { nation: b.att, war: war.id };
    if (b.att === war.att) war.occupied.push(r.id); else war.counter.push(r.id);
    war.maxOcc = Math.max(war.maxOcc, war.occupied.length);
    record(w, 'war', `🏴 ${w.nations[b.att].name} occupied ${r.name} (${w.nations[r.owner].name})${war.goals.includes(r.id) ? ' — a war goal' : ''}. Occupations: ${war.occupied.length}/${war.quota}.`, { region: r.id, nation: b.att, important: true });
    battleEnded(w, war, b, winner, b.att === war.att ? `${w.nations[b.att].name} occupied ${r.name}${war.goals.includes(r.id) ? ', a war goal' : ''}: ${war.occupied.length} of ${war.quota} occupations needed.` : `${w.nations[b.att].name} counter-occupied ${r.name}.`);
    if (r.owner === player(w).nation) notify(w, 'warHome', `🏴 ${r.name} was occupied by ${w.nations[b.att].name}.`, { link: 'wars', critical: true });
  }
  computeSupply(w);
  if (war.occupied.length >= war.quota) settle(w, war, 'conquest');
}

// ---------- settlement ----------
export type Terms = { kind: 'conquest' | 'deadline' | PeaceOffer['kind']; keepAtt?: Id[]; keepDef?: Id[] };

export function settle(w: World, war: War, kind: Terms['kind'], offer?: PeaceOffer) {
  if (war.status !== 'active') return;
  const att = w.nations[war.att], def = w.nations[war.def];
  let keepAtt: Id[] = [];
  let keepDef: Id[] = [];
  const heldGoals = war.goals.filter((g) => war.occupied.includes(g));
  if (kind === 'conquest') keepAtt = heldGoals;
  if (kind === 'deadline') keepAtt = war.occupied.length >= war.quota ? heldGoals : [];
  if (kind === 'surrender' && offer) keepAtt = offer.from === war.def ? heldGoals : [];
  if (kind === 'demand' && offer) keepAtt = offer.from === war.att ? heldGoals : [];
  if (kind === 'demand' && offer && offer.from === war.def) keepDef = [...war.counter];
  if (kind === 'trade' && offer) { if (offer.take != null) keepAtt = [offer.take]; if (offer.give != null) keepDef = [offer.give]; }
  const transferred: string[] = [];
  const relBefore = att.relations[def.id]?.score ?? 0;
  for (const rid of [...war.occupied, ...war.counter]) {
    const r = w.regions[rid];
    const toAtt = keepAtt.includes(rid) && war.occupied.includes(rid);
    const toDef = keepDef.includes(rid) && war.counter.includes(rid);
    if (toAtt || toDef) {
      r.owner = toAtt ? war.att : war.def;
      transferred.push(`${r.name} → ${w.nations[r.owner].name}`);
      for (const k of Object.keys(r.bld) as (keyof typeof r.bld)[]) r.bld[k] = Math.max(0, r.bld[k] - B.war.buildingDamage);
      if (r.project != null) { const p = w.projects[r.project]; if (p && !p.done) cancelProject(w, p, 'region changed hands'); r.project = null; }
    }
    r.occ = null;
  }
  for (const bid of war.battles) { const b = w.battles[bid]; if (b && !b.done) { finishBattle(w, b, null); battleEnded(w, war, b, null, 'called off by the peace'); } }
  war.status = 'ended';
  const label = { conquest: 'conquest', deadline: 'deadline', armistice: 'armistice', surrender: 'surrender', demand: 'demand', trade: 'territorial trade' }[kind];
  war.outcome = `${label}${transferred.length ? `: ${transferred.join(', ')}` : ': no territory changed hands'}`;
  const until = w.time + B.war.pactDays * DAY;
  att.pacts[def.id] = until;
  def.pacts[att.id] = until;
  relation(w, att.id, def.id, 8, `peace (${label})`);
  if (kind === 'conquest' || keepAtt.length) { att.warScore = Math.min(100, att.warScore + 20); def.warScore = Math.max(-100, def.warScore - 20); }
  warEnded(w, war, kind, offer, transferred, keepAtt, relBefore);
  if (keepAtt.length) addGrievance(w, war.def, war.att, Math.min(60, 20 * keepAtt.length)); // lost land is not forgotten
  if (keepDef.length) addGrievance(w, war.att, war.def, Math.min(60, 20 * keepDef.length));
  afterActionReview(w, war, kind === 'conquest' || keepAtt.length ? war.att : keepDef.length || kind === 'surrender' ? war.def : null);
  record(w, 'war', `🕊️ War between ${att.name} and ${def.name} ended by ${war.outcome}. ${B.war.pactDays}-day non-aggression pact.`, { nation: att.id, important: true });
  const pl = player(w);
  if (pl.nation === att.id || pl.nation === def.id) notify(w, 'warHome', `🕊️ War with ${pl.nation === att.id ? def.name : att.name} ended by ${war.outcome}.`, { link: 'wars', critical: true });
  updateExile(w);
  computeSupply(w);
  const pn = w.nations[pl.nation];
  if (pn.president === pl.id && w.player.counters.regionsAtOffice != null) {
    w.player.counters.growthInOffice = Math.max(w.player.counters.growthInOffice ?? 0, w.regions.filter((r) => r.owner === pn.id).length - w.player.counters.regionsAtOffice);
  }
}

export function onWarDeadline(w: World, warId: Id) {
  const war = w.wars[warId];
  if (war && war.status === 'active') settle(w, war, 'deadline');
}

// ---------- peace terms (congress proposals) ----------
export function peaceCheck(w: World, n: Nation, p: Record<string, any>): string | null {
  const war = w.wars[p.war];
  if (!war || war.status !== 'active') return 'No such active war.';
  if (war.att !== n.id && war.def !== n.id) return 'Not a party to this war.';
  if (!['armistice', 'surrender', 'demand', 'trade', 'accept'].includes(p.kind)) return 'Unknown terms.';
  if (p.kind === 'trade') {
    const mineHeld = war.att === n.id ? war.occupied : war.counter;
    const theirsHeld = war.att === n.id ? war.counter : war.occupied;
    if (!mineHeld.includes(p.take)) return 'Trade: pick an enemy region you occupy to keep.';
    if (!theirsHeld.includes(p.give)) return 'Trade: pick one of your regions they occupy to give up.';
  }
  if (p.kind === 'accept') {
    const offer = war.offers.find((o) => o.id === p.offer);
    if (!offer || offer.status !== 'open' || offer.from === n.id) return 'No open offer to accept.';
  }
  return null;
}

export function describePeace(w: World, n: Nation, p: Record<string, any>): string {
  const war = w.wars[p.war];
  if (!war) return 'Pick a war.';
  const enemy = w.nations[enemyOf(war, n.id)];
  const held = war.goals.filter((g) => war.occupied.includes(g)).map((g) => w.regions[g].name);
  switch (p.kind) {
    case 'armistice': return `Offer ${enemy.name} an armistice: all occupations return. Requires their congress.`;
    case 'surrender': return war.def === n.id ? `Surrender to ${enemy.name}: they keep held goals (${held.join(', ') || 'none'}), everything else returns. Unilateral — takes effect on passage.` : `Withdraw from the war: all occupations return. Unilateral.`;
    case 'demand': return war.att === n.id ? `Demand ${enemy.name} cede held goals (${held.join(', ') || 'none'}). Requires their congress.` : `Demand to keep the regions we occupy. Requires their congress.`;
    case 'trade': return `Keep ${w.regions[p.take]?.name ?? '?'} and cede ${w.regions[p.give]?.name ?? '?'}; all else returns. Requires their congress.`;
    case 'accept': { const o = war.offers.find((x) => x.id === p.offer); return o ? `Accept ${w.nations[o.from].name}'s ${o.kind} offer.` : 'Offer not found.'; }
  }
  return '';
}

/** AI appetite for peace terms from military position, costs, time left and treasury. */
export function peaceAppetite(w: World, n: Nation, war: War, kind: string, offerFrom?: Id): number {
  const mine = n.id === war.att;
  const progress = war.occupied.length / Math.max(1, war.quota);
  const timeLeft = (war.deadline - w.time) / Math.max(1, war.deadline - war.declared);
  const treasuryStress = (n.wallet[n.cur] ?? 0) < 2000 * 100 ? 0.2 : 0;
  const losing = mine ? 1 - progress - (1 - timeLeft) * 0.5 : progress;
  let s = losing * 0.6 + treasuryStress + (-n.warScore / 200);
  if (kind === 'armistice') s += mine ? -0.1 + (1 - timeLeft) * 0.4 : 0.1;
  if (kind === 'demand') s += offerFrom === war.att ? (mine ? 0 : progress - 0.7) : -0.3;
  if (kind === 'surrender') s += 0.3;
  if (kind === 'trade') s += 0.05;
  return s;
}

export const PEACE_PROPOSAL: ExtraProposal = {
  info: { name: 'Peace terms', fullTerm: true },
  describe: (w, n, p) => ({ effect: describePeace(w, n, p), cost: 0 }),
  check: (w, n, _c, p) => peaceCheck(w, n, p),
  support(w, n, d, p) {
    const war = w.wars[p.war];
    if (!war) return -1;
    const party = partyOf(w, d);
    const hawk = IDEOLOGIES[party?.ideo ?? d.ideo].hawk;
    const offer = p.kind === 'accept' ? war.offers.find((o) => o.id === p.offer) : undefined;
    return peaceAppetite(w, n, war, offer?.kind ?? p.kind, offer?.from) - (hawk - 0.5) * 0.5;
  },
  enact(w, n, p) {
    const why = peaceCheck(w, n, p.params);
    if (why) return `Not enacted: ${why}`;
    const war = w.wars[p.params.war];
    if (p.params.kind === 'surrender') {
      note(w, war, '🏳️', `${n.name}'s congress voted to ${n.id === war.def ? 'surrender' : 'withdraw'}${voteOf(p)}.`, { side: n.id === war.att ? 'att' : 'def' });
      settle(w, war, 'surrender', { id: 0, from: n.id, kind: 'surrender', t: w.time, status: 'accepted' });
      return `Surrender: ${war.outcome}.`;
    }
    if (p.params.kind === 'accept') {
      const offer = war.offers.find((o) => o.id === p.params.offer)!;
      offer.status = 'accepted';
      offerAnswered(w, war, offer, true, p);
      settle(w, war, offer.kind, offer);
      return `Peace accepted: ${war.outcome}.`;
    }
    const offer: PeaceOffer = { id: nid(w), from: n.id, kind: p.params.kind, give: p.params.give, take: p.params.take, t: w.time, status: 'open' };
    war.offers.push(offer);
    offerMade(w, war, n, offer, p);
    const enemy = w.nations[enemyOf(war, n.id)];
    submitResponse(w, enemy, war, offer);
    return `Terms sent to ${enemy.name}; their congress will vote.`;
  },
  aiOptions(w, n) {
    const out: { params: Record<string, any>; weight: number }[] = [];
    for (const war of warsOf(w, n.id)) {
      for (const o of war.offers) if (o.status === 'open' && o.from !== n.id) out.push({ params: { war: war.id, kind: 'accept', offer: o.id }, weight: 1 + peaceAppetite(w, n, war, o.kind, o.from) * 3 });
      const app = peaceAppetite(w, n, war, 'armistice');
      if (app > 0.3 && !war.offers.some((o) => o.status === 'open' && o.from === n.id)) out.push({ params: { war: war.id, kind: 'armistice' }, weight: app * 2 });
      if (n.id === war.def && war.occupied.length >= war.quota - 1 && peaceAppetite(w, n, war, 'surrender') > 0.8) out.push({ params: { war: war.id, kind: 'surrender' }, weight: 0.5 });
      if (n.id === war.att && war.goals.some((g) => war.occupied.includes(g))) out.push({ params: { war: war.id, kind: 'demand' }, weight: 0.4 });
    }
    return out;
  },
};

const voteOf = (p: Proposal) => { const yes = Object.values(p.votes).filter((v) => v === 'y').length; return ` (${yes}–${Object.values(p.votes).length - yes})`; };

/** The other side's congress gets an "accept" proposal authored by its head of government. */
function submitResponse(w: World, enemy: Nation, war: War, offer: PeaceOffer) {
  const authorId = enemy.president ?? eligibleVoters(enemy)[0];
  const author = authorId != null ? w.citizens[authorId] : null;
  if (!author) return;
  const r = propose(w, author, 'peace' as any, { war: war.id, kind: 'accept', offer: offer.id });
  if (!r.ok) {
    // the head of government may have exhausted proposals: create the vote directly
    const p: Proposal = { id: nid(w), nation: enemy.id, type: 'peace', params: { war: war.id, kind: 'accept', offer: offer.id }, author: author.id, created: w.time, closes: w.time + B.politics.voteHours * 60, votes: {}, status: 'open', effect: describePeace(w, enemy, { war: war.id, kind: 'accept', offer: offer.id }), cost: 0, fullTerm: true };
    w.proposals[p.id] = p;
  }
  if (player(w).nation === enemy.id) notify(w, 'warHome', `🕊️ ${w.nations[offer.from].name} offers ${offer.kind}. Congress is voting on it.`, { link: 'congress', critical: true });
}

/** Expire stale peace offers when their response vote failed. */
export function peaceHousekeeping(w: World) {
  for (const war of activeWars(w)) for (const o of war.offers) {
    if (o.status !== 'open') continue;
    const pending = Object.values(w.proposals).some((p) => p.status === 'open' && p.type === 'peace' && p.params.offer === o.id);
    if (!pending && w.time - o.t > 2 * 60) {
      o.status = 'rejected';
      const vote = Object.values(w.proposals).find((p) => p.type === 'peace' && p.params.offer === o.id && p.status === 'failed');
      offerAnswered(w, war, o, false, vote);
    }
  }
}

