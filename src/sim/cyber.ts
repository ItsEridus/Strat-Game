// Cyber commands (2.4 Frontiers). Every country has a cyber command with an offensive and
// a defensive strength, built from its information technology, its frontier technologies
// (AI-driven cyber operations, quantum computers, post-quantum codes) and how well its
// state works. A command can attack:
// - a power grid: blackouts across a region for several days (the grids of 1.9);
// - companies: ransomware halts firms in a region;
// - an election: hacked and leaked material helps the attacker's favoured party.
// Attribution is uncertain. The victim investigates: a strong defender with a good network
// inside the attacker's country usually finds the culprit; otherwise the attack stays
// unexplained, or is blamed on someone else (the victim's worst rival), who then takes the
// diplomatic blame. A cyber attack that is attributed costs relations, but less than a
// bomb: it is not an act of war. AI commands strike rivals and enemies, more in wartime.
import type { Id, Nation, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { nid, notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { capsOf, historyPace } from './strategic';
import { hasTech } from './technology';
import { energyOf } from './energy';
import { relation } from './congress';
import { addGrievance, leaderProfile } from './relations';
import { activeWars, warBetween } from './war';
import { favouredParty } from './counterIntel';
import { nextElection } from './intel';
import { nationPerm } from './authority';
import { player } from './query';
import { dataIso } from '../data/isoAlias';

export type CyberKind = 'grid' | 'companies' | 'election';
export const CYBER_INFO: Record<CyberKind, { name: string; icon: string; desc: string }> = {
  grid: { name: 'Attack the power grid', icon: '⚡', desc: 'Blackouts across one of their regions for several days.' },
  companies: { name: 'Ransomware against companies', icon: '💾', desc: 'Firms in one of their regions are locked out of their systems and stop work for days.' },
  election: { name: 'Hack and leak in an election', icon: '🗳️', desc: 'Stolen material, released at the right time, helps the party you favour. Needs an election within 60 days.' },
};
export interface CyberIncident {
  id: Id; t: number; attacker: Id; target: Id; kind: CyberKind; region: Id | null; success: boolean;
  blamed: Id | null; // whom the victim blames (null: unexplained)
  text: string;
}

/** The 2025 investment in offensive cyber beyond what technology alone would give (published assessments,
 * such as the IISS 2021 Cyber Capabilities and National Power study, rounded). */
const POSTURE: Record<string, number> = { RUS: 20, CHN: 12, USA: 8, GBR: 6, KOR: 3, IND: 2 };
/** Offensive strength (0–100). */
export function cyberOffence(w: World, n: Nation): number {
  const c = capsOf(w, n);
  return Math.max(0, Math.min(100, c.tech.information * 0.55 + (POSTURE[dataIso(n.iso)] ?? 0) + (hasTech(n, 'cyberai') ? 15 : 0) + (hasTech(n, 'quantum') ? 8 : 0) + n.agency.budget * 400 - 10));
}
/** Defensive strength (0–100). */
export function cyberDefence(w: World, n: Nation): number {
  const c = capsOf(w, n);
  return Math.max(0, Math.min(100, c.tech.information * 0.45 + (hasTech(n, 'pqc') ? 10 : 0) + (hasTech(n, 'cyberai') ? 8 : 0) + c.inst.effectiveness * 20 + energyOf(n).grid * 10 - 15));
}

export function cyberCheck(w: World, n: Nation, kind: CyberKind, target: Id, region: Id | null): string | null {
  const t = w.nations[target];
  if (n.exile) return 'A government in exile has no cyber command.';
  if (!t || t.id === n.id || t.exile) return 'Pick another country.';
  if (kind !== 'election') {
    if (region == null || w.regions[region]?.owner !== t.id) return `Pick one of ${t.name}'s regions.`;
  } else if (!nextElection(w, t.id)) return `${t.name} has no election in the next 60 days.`;
  const last = n.cyberLast ?? -1e12;
  if (w.time - last < 14 * DAY) return `The command is still preparing; ready again in ${Math.ceil((last + 14 * DAY - w.time) / DAY)} days.`;
  return null;
}

/** Launch an attack (the AI and the player use the same function). */
export function cyberAttack(w: World, n: Nation, kind: CyberKind, target: Id, region: Id | null): CyberIncident | null {
  if (cyberCheck(w, n, kind, target, region)) return null;
  const t = w.nations[target];
  n.cyberLast = w.time;
  const off = cyberOffence(w, n), def = cyberDefence(w, t);
  const quantumEdge = hasTech(n, 'quantum') && !hasTech(t, 'pqc') ? 0.1 : 0;
  const success = chance(w, Math.max(0.1, Math.min(0.9, 0.5 + (off - def) / 100 + quantumEdge)));
  let effect = '';
  if (success) {
    if (kind === 'grid') {
      const r = w.regions[region!];
      r.cyberDown = w.time + (2 + Math.round(off / 25)) * DAY;
      r.blackout = dayOf(w.time);
      energyOf(t).blackouts++;
      effect = `the lights went out across ${r.name}`;
    } else if (kind === 'companies') {
      let k = 0;
      for (const co of Object.values(w.companies)) if (co.region === region && chance(w, 0.6)) { co.halt = { until: w.time + (2 + Math.round(off / 30)) * DAY, why: 'Ransomware' }; k++; }
      effect = `${k} firm${k === 1 ? '' : 's'} in ${w.regions[region!].name} were locked out of their systems`;
    } else {
      const pid = favouredParty(w, n, t);
      if (pid != null) w.parties[pid].support = Math.min(100, w.parties[pid].support + 3);
      t.approval = Math.max(5, t.approval - 2);
      effect = 'hacked emails were leaked days before the vote';
    }
  }
  // Attribution: the victim investigates.
  const net = (t.agency.network[n.id] ?? 0) / 100;
  const found = chance(w, Math.max(0.05, Math.min(0.85, 0.25 + (def - off) / 150 + net * 0.4 + (success ? 0 : 0.15))));
  let blamed: Id | null = found ? n.id : null;
  if (!found && chance(w, 0.3)) {
    const rival = w.nations.filter((o) => o.id !== t.id && o.id !== n.id && !o.exile).sort((a, b) => (t.relations[a.id]?.score ?? 0) - (t.relations[b.id]?.score ?? 0) || a.id - b.id)[0];
    if (rival) blamed = rival.id;
  }
  const what = CYBER_INFO[kind].name.toLowerCase();
  const text = success
    ? `💻 Cyber attack on ${t.name}: ${effect}. ${blamed != null ? `${t.name} blames ${w.nations[blamed].name}.` : 'Nobody has been able to say who did it.'}`
    : `💻 ${t.name} fended off a cyber attack (${what}). ${blamed != null ? `It blames ${w.nations[blamed].name}.` : 'The attackers covered their tracks.'}`;
  const inc: CyberIncident = { id: nid(w), t: w.time, attacker: n.id, target: t.id, kind, region, success, blamed, text };
  (w.cyber ??= []).push(inc);
  if (w.cyber.length > 120) w.cyber.shift();
  record(w, 'espionage', text, { nation: t.id, region: region ?? undefined, important: success && kind === 'grid' });
  if (blamed != null) {
    relation(w, t.id, blamed, success ? -10 : -5, 'a cyber attack');
    if (success) addGrievance(w, t.id, blamed, 5);
  }
  const pl = player(w);
  if (pl.nation === t.id && success) notify(w, 'politics', text, { critical: kind === 'grid' });
  if (pl.nation === n.id && nationPerm(w, pl.id, n.id, 'intel')) notify(w, 'politics', success ? `💻 Our cyber command struck ${t.name}: ${effect}.${blamed === n.id ? ' They know it was us.' : blamed != null ? ` They blame ${w.nations[blamed].name}.` : ' They do not know who did it.'}` : `💻 Our cyber attack on ${t.name} failed.${blamed === n.id ? ' They traced it to us.' : ''}`);
  return inc;
}

/** For the player's government. */
export function orderCyberAttack(w: World, actor: Id, kind: CyberKind, target: Id, region: Id | null): Result {
  const c = w.citizens[actor];
  if (!nationPerm(w, actor, c.nation, 'intel')) return fail('Only the president, vice president or intelligence minister can order cyber attacks.');
  const n = w.nations[c.nation];
  const why = cyberCheck(w, n, kind, target, region);
  if (why) return fail(why);
  const inc = cyberAttack(w, n, kind, target, region)!;
  return ok(inc.success ? 'The attack went through.' : 'The attack failed.');
}

/** AI commands strike rivals and enemies. */
function aiCyber(w: World) {
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const director = n.cabinet.intelligence ?? n.president;
    if (director === pl.id) continue;
    const lp = leaderProfile(w, n);
    const enemies = activeWars(w).filter((x) => x.att === n.id || x.def === n.id).map((x) => (x.att === n.id ? x.def : x.att));
    const rivals = w.nations.filter((o) => o.id !== n.id && !o.exile && ((n.relations[o.id]?.score ?? 0) < -45 || enemies.includes(o.id)));
    if (!rivals.length) continue;
    const t = rivals[Math.floor((dayOf(w.time) + n.id) % rivals.length)];
    const atWar = !!warBetween(w, n.id, t.id);
    if (!chance(w, (atWar ? 0.5 : 0.04) * (0.4 + lp.risk + lp.hawk * 0.5) * (cyberOffence(w, n) / 60))) continue;
    const regions = w.regions.filter((r) => r.owner === t.id);
    const region = regions.length ? regions[Math.floor((dayOf(w.time) * 7 + n.id) % regions.length)].id : null;
    const kind: CyberKind = nextElection(w, t.id) && !atWar && chance(w, 0.4) ? 'election' : atWar && chance(w, 0.6) ? 'grid' : 'companies';
    cyberAttack(w, n, kind, t.id, kind === 'election' ? null : region);
  }
}

export function cyberDaily(w: World) {
  // A grid that has been hacked stays down until it is restored.
  for (const r of w.regions) if (r.cyberDown != null) { if (r.cyberDown > w.time) r.blackout = dayOf(w.time); else delete r.cyberDown; }
  if (dateAt(w.time).day % 10 === 1) for (let k = 0; k < historyPace(w); k++) aiCyber(w);
}
