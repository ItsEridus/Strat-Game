// Treaties (2.0 GEO 4): agreements between countries as real objects with parties,
// terms, a duration and a record of whether they were kept.
// - Defence alliances (collective defence; NATO and the US treaties in Asia at the start),
//   one-sided guarantees, non-aggression pacts, trade agreements, basing rights,
//   intelligence sharing, arms control and border agreements.
// - Each has effects: allies fight alongside each other and cannot be attacked; trade
//   partners drop import tariffs and grow closer economically; basing hosts and allies
//   feel less threatened; arms control lowers the threat between the parties; border
//   agreements halve old territorial grievances.
// - Treaties run out and are renewed if relations still allow, or lapse. A country may
//   renounce one, at a cost in trust. When an ally is attacked, its partners decide whether
//   to stand by it: those who do cut off the aggressor; those who do not lose the ally's
//   trust and the alliance's credibility. Attacking a country soon after renouncing a
//   treaty with it is remembered by everyone as a betrayal.
import type { Id, Nation, War, World } from './types';
import { BLOCS, GLOBAL_POWERS, TRADE_AGREEMENTS, WORLD_REGION } from '../data/diplomacy';
import { DAY } from '../engine/clock';
import { timeOfDate } from '../engine/calendar';
import { nid, notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { player } from './query';
import { relation } from './congress';
import { leaderProfile, noteTrust, tiesOfPair } from './relations';
import { militaryPower } from './war';
import { strategicOf } from './forceStructure';

export type TreatyKind = 'defence' | 'guarantee' | 'nonaggression' | 'trade' | 'basing' | 'intel' | 'armscontrol' | 'border';
export interface Treaty {
  id: Id; kind: TreatyKind; name: string; parties: Id[];
  guarantor?: Id; // guarantee: the country giving it
  host?: Id; // basing: the country hosting the bases
  signed: number; until: number | null;
  status: 'active' | 'lapsed' | 'ended' | 'broken';
  ended?: number; endedBy?: Id; why?: string;
  bloc?: string;
  historic?: boolean; // in force when the game began
  honoured: number; failed: number; // times partners stood by (or abandoned) an attacked member
}

export const TREATY_INFO: Record<TreatyKind, { name: string; icon: string; years: number | null; effect: string }> = {
  defence: { name: 'Defence alliance', icon: '🛡️', years: null, effect: 'An attack on one is an attack on all: members cannot be attacked by each other, fight alongside each other, and stand by a member that is attacked (or lose its trust).' },
  guarantee: { name: 'Security guarantee', icon: '☂️', years: 10, effect: 'One country promises to defend another, which counts as an ally of the guarantor.' },
  nonaggression: { name: 'Non-aggression pact', icon: '🤝', years: 5, effect: 'Neither side may attack the other while it is in force.' },
  trade: { name: 'Trade agreement', icon: '📦', years: null, effect: 'No import tariffs on goods from the other parties; trade and investment ties grow.' },
  basing: { name: 'Basing agreement', icon: '🏗️', years: 20, effect: 'The guest keeps forces in the host country; the two count as allied when judging threats, and the host earns rent.' },
  intel: { name: 'Intelligence sharing', icon: '👁️', years: null, effect: 'The parties share intelligence: trust stays high, and each agency gains from the others.' },
  armscontrol: { name: 'Arms control', icon: '☢️', years: 10, effect: 'Verified limits on strategic weapons: the parties see less threat in each other.' },
  border: { name: 'Border agreement', icon: '📍', years: null, effect: 'A settled border: old territorial grievances between the parties are halved.' },
};

/** Countries with a tradition of non-alignment (no formal military alliances). */
export const NONALIGNED = ['IND', 'BRA', 'ZAF', 'MEX', 'SAU', 'ARG'];
/** Neither can reach the other's region (and neither is a global power). */
const farApart = (a: string, b: string) => !GLOBAL_POWERS.includes(a) && !GLOBAL_POWERS.includes(b) && !(WORLD_REGION[a] ?? []).some((r) => (WORLD_REGION[b] ?? []).includes(r));
const isoId = (w: World, iso: string) => w.nations.find((n) => n.iso === iso)?.id;
export const allTreaties = (w: World): Treaty[] => Object.values(w.treaties ?? {});
export const activeTreaties = (w: World, nation?: Id, kind?: TreatyKind) =>
  allTreaties(w).filter((t) => t.status === 'active' && (nation == null || t.parties.includes(nation)) && (kind == null || t.kind === kind));
export const treatyBetween = (w: World, a: Id, b: Id, kind?: TreatyKind) =>
  allTreaties(w).find((t) => t.status === 'active' && t.parties.includes(a) && t.parties.includes(b) && (kind == null || t.kind === kind));
export const hasTreaty = (w: World, a: Id, b: Id, kind: TreatyKind) => !!treatyBetween(w, a, b, kind);

/** Alliances (what the battle and war rules read) follow the defence treaties and guarantees in force. */
export function syncAlliances(w: World) {
  const m = new Map<Id, Set<Id>>(w.nations.map((n) => [n.id, new Set<Id>()]));
  for (const t of allTreaties(w)) {
    if (t.status !== 'active' || (t.kind !== 'defence' && t.kind !== 'guarantee')) continue;
    for (const a of t.parties) for (const b of t.parties) if (a !== b) m.get(a)?.add(b);
  }
  for (const n of w.nations) n.alliances = [...(m.get(n.id) ?? [])].sort((a, b) => a - b);
}

export interface SignOpts { name?: string; years?: number | null; guarantor?: Id; host?: Id; bloc?: string; quiet?: boolean; signed?: number; until?: number | null }
export function signTreaty(w: World, kind: TreatyKind, parties: Id[], o: SignOpts = {}): Treaty {
  const info = TREATY_INFO[kind];
  const years = o.years !== undefined ? o.years : info.years;
  const names = parties.map((p) => w.nations[p]?.name ?? '?');
  const t: Treaty = {
    id: nid(w), kind, name: o.name ?? `${info.name}: ${names.join('–')}`, parties: [...parties].sort((a, b) => a - b),
    guarantor: o.guarantor, host: o.host, bloc: o.bloc, signed: o.signed ?? w.time, historic: o.signed != null && o.signed < w.time ? true : undefined,
    until: o.until !== undefined ? o.until : years == null ? null : w.time + Math.round(years * 365) * DAY,
    status: 'active', honoured: 0, failed: 0,
  };
  (w.treaties ??= {})[t.id] = t;
  if (kind === 'nonaggression' && t.until != null) for (const a of parties) for (const b of parties) if (a !== b) w.nations[a].pacts[b] = Math.max(w.nations[a].pacts[b] ?? 0, t.until);
  syncAlliances(w);
  if (!o.quiet) {
    const text = `${info.icon} ${t.name} signed${t.until != null ? ` (for ${Math.round((t.until - w.time) / DAY / 365)} years)` : ''}.`;
    record(w, 'diplomacy', text, { nation: parties[0], important: kind === 'defence' || kind === 'guarantee' });
    for (const p of parties) (w.nations[p].chronicle ??= []).push({ t: w.time, text });
    if (parties.includes(player(w).nation)) notify(w, 'diplomacy', text, { link: 'diplomacy' });
    for (let i = 0; i < parties.length; i++) for (let j = i + 1; j < parties.length; j++) relation(w, parties[i], parties[j], kind === 'defence' || kind === 'guarantee' ? 8 : 4, `${info.name.toLowerCase()} signed`);
  }
  return t;
}

export function endTreaty(w: World, t: Treaty, how: 'lapsed' | 'ended' | 'broken', by?: Id, why?: string) {
  if (t.status !== 'active') return;
  t.status = how; t.ended = w.time; t.endedBy = by; t.why = why;
  if (t.kind === 'nonaggression') for (const a of t.parties) for (const b of t.parties) if (a !== b && (w.nations[a].pacts[b] ?? 0) > w.time) w.nations[a].pacts[b] = w.time;
  syncAlliances(w);
  const verb = how === 'lapsed' ? 'lapsed' : how === 'broken' ? `was broken by ${w.nations[by!]?.name}` : `was renounced by ${w.nations[by!]?.name ?? 'its members'}`;
  const text = `${TREATY_INFO[t.kind].icon} ${t.name} ${verb}${why ? ` (${why})` : ''}.`;
  record(w, 'diplomacy', text, { nation: t.parties[0], important: t.kind === 'defence' || how === 'broken' });
  for (const p of t.parties) (w.nations[p].chronicle ??= []).push({ t: w.time, text });
  if (t.parties.includes(player(w).nation)) notify(w, 'diplomacy', text, { link: 'diplomacy', critical: how === 'broken' });
}

/** A country walks away from a treaty: its partners trust it less. */
export function renounce(w: World, n: Nation, t: Treaty, why = 'renounced') {
  const hard = t.kind === 'defence' || t.kind === 'guarantee' || t.kind === 'nonaggression' ? 20 : 8;
  for (const p of t.parties) if (p !== n.id) relation(w, n.id, p, -hard, `${TREATY_INFO[t.kind].name.toLowerCase()} renounced`);
  (n.renounced ??= {});
  for (const p of t.parties) if (p !== n.id) n.renounced[p] = w.time;
  endTreaty(w, t, 'ended', n.id, why);
}

// ---------- the starting order ----------

/** The treaties in force at the start of 2025 (and any alliances or pacts in an older save). */
export function seedTreaties(w: World) {
  if (w.treaties) return;
  w.treaties = {};
  const oldAlliances = w.nations.map((n) => [n.id, [...n.alliances]] as const);
  const oldPacts = w.nations.map((n) => [n.id, { ...n.pacts }] as const);
  const since = (y: number) => timeOfDate(y, 0, 1) - timeOfDate(2025, 0, 1); // signed before the game began (negative times)
  const year: Record<string, number> = { nato: 1949, usjp: 1960, uskr: 1953, anzus: 1951, usmca: 2020, mercosur: 1991, fiveeyes: 1946 };
  for (const b of BLOCS) {
    if (b.kind === 'political') continue;
    const ids = b.members.map((iso) => isoId(w, iso)).filter((x): x is Id => x != null);
    if (ids.length < 2) continue;
    signTreaty(w, b.kind === 'defence' ? 'defence' : b.kind === 'trade' ? 'trade' : 'intel', ids, { name: b.name, bloc: b.id, quiet: true, signed: since(year[b.id] ?? 2000), until: null });
  }
  for (const a of TRADE_AGREEMENTS) {
    const ids = a.members.map((iso) => isoId(w, iso)).filter((x): x is Id => x != null);
    if (ids.length >= 2) signTreaty(w, 'trade', ids, { name: a.name, quiet: true, signed: since(a.year), until: null });
  }
  const usa = isoId(w, 'USA');
  for (const iso of ['JPN', 'KOR', 'DEU', 'GBR', 'TUR', 'AUS']) {
    const h = isoId(w, iso);
    if (usa != null && h != null) signTreaty(w, 'basing', [usa, h], { name: `US forces in ${w.nations[h].name}`, host: h, quiet: true, signed: since(1960), until: w.time + 20 * 365 * DAY });
  }
  const rus = isoId(w, 'RUS'), chn = isoId(w, 'CHN');
  if (usa != null && rus != null) signTreaty(w, 'armscontrol', [usa, rus], { name: 'New START', quiet: true, signed: since(2011), until: timeOfDate(2026, 1, 5) });
  if (chn != null && rus != null) signTreaty(w, 'border', [chn, rus], { name: 'Sino-Russian border agreement', quiet: true, signed: since(2004), until: null });
  if (chn != null && rus != null) signTreaty(w, 'nonaggression', [chn, rus], { name: 'Treaty of Good-Neighbourliness', quiet: true, signed: since(2001), until: w.time + 5 * 365 * DAY });
  // An older save: keep its alliances and pacts as treaties.
  for (const [id, al] of oldAlliances) for (const a of al) if (a > id && !hasTreaty(w, id, a, 'defence')) signTreaty(w, 'defence', [id, a], { quiet: true });
  for (const [id, pacts] of oldPacts) {
    const n = w.nations[id];
    for (const [o, until] of Object.entries(pacts)) if (Number(o) > n.id && until > w.time && !hasTreaty(w, n.id, Number(o), 'nonaggression')) signTreaty(w, 'nonaggression', [n.id, Number(o)], { quiet: true, until });
  }
  syncAlliances(w);
}

// ---------- will they sign? ----------

/** How keen `n` is on a treaty of this kind with `other` (above 0.5 it signs). */
export function willingness(w: World, n: Nation, other: Nation, kind: TreatyKind): { p: number; why: string } {
  const rel = n.relations[other.id]?.score ?? 0;
  const t = tiesOfPair(w, n, other);
  const lp = leaderProfile(w, n);
  const summit = (n.summits?.[other.id] ?? -Infinity) > w.time - 60 * DAY ? 0.1 : 0;
  // A shared threat: someone both of them fear.
  let shared = 0;
  for (const x of w.nations) if (x.id !== n.id && x.id !== other.id && !x.exile) shared = Math.max(shared, Math.min(tiesOfPair(w, n, x).threat, tiesOfPair(w, other, x).threat));
  let p: number, why: string;
  switch (kind) {
    case 'defence': case 'guarantee': {
      // Alliances need a threat both sides fear, close relations and trust; non-aligned countries
      // guard their independence, and no one joins a friend's rival.
      const entangled = other.alliances.some((x) => (n.relations[x]?.score ?? 0) < -20) ? 0.4 : 0;
      const far = farApart(n.iso, other.iso) ? 0.3 : 0;
      p = -0.25 + rel / 150 + shared / 70 + t.trust / 250 - (lp.nationalism - 0.4) * 0.3 - (NONALIGNED.includes(n.iso) ? 0.35 : 0) - entangled - far;
      why = entangled ? `${other.name} is allied with our rivals` : NONALIGNED.includes(n.iso) ? 'a tradition of non-alignment' : far ? 'too far apart to defend each other' : shared > 25 ? 'a threat they share' : 'no common enemy';
      break;
    }
    case 'nonaggression':
      p = 0.3 + t.threat / 150 + rel / 200 - lp.hawk * 0.3 + (militaryPower(w, other.id) > militaryPower(w, n.id) ? 0.1 : 0);
      why = t.threat > 30 ? 'it fears the other side' : 'little reason for a pact';
      break;
    case 'trade':
      p = 0.05 + t.interdep / 130 + rel / 150 - lp.nationalism * 0.3;
      why = t.interdep > 40 ? 'strong trade ties' : 'modest trade ties';
      break;
    case 'basing':
      p = rel / 100 + shared / 100 - lp.nationalism * 0.4;
      why = shared > 25 ? 'protection against a shared threat' : 'sovereignty concerns';
      break;
    case 'intel':
      p = 0.05 + rel / 100 + t.trust / 200;
      why = t.trust > 40 ? 'deep trust' : 'not enough trust';
      break;
    case 'armscontrol':
      p = 0.35 + t.threat / 200 + rel / 200 - lp.hawk * 0.25;
      why = 'limits on an arms race';
      break;
    case 'border':
      p = 0.2 + rel / 150 - t.grievance / 200 - lp.nationalism * 0.3;
      why = t.grievance > 30 ? 'old claims stand in the way' : 'a chance to settle the border';
      break;
  }
  return { p: Math.max(0, Math.min(1, p + summit)), why };
}

export function proposeTreatyCheck(w: World, n: Nation, other: Nation | undefined, kind: TreatyKind): string | null {
  if (!other || other.id === n.id) return 'Pick another country.';
  if (other.exile || n.exile) return 'A government in exile cannot sign treaties.';
  if (kind !== 'basing' && kind !== 'guarantee' && treatyBetween(w, n.id, other.id, kind)) return 'A treaty of this kind is already in force.';
  if (kind === 'defence' && n.alliances.includes(other.id)) return 'You are already allied.';
  if (kind === 'armscontrol' && (!(strategicOf(n)?.warheads) || !(strategicOf(other)?.warheads))) return 'Arms control is between nuclear powers.';
  if (Object.values(w.wars).some((x) => x.status === 'active' && ((x.att === n.id && x.def === other.id) || (x.att === other.id && x.def === n.id)))) return 'You are at war with them.';
  return null;
}

/** Offer a treaty; the other government decides on its merits. */
export function offerTreaty(w: World, n: Nation, other: Nation, kind: TreatyKind, opts: SignOpts = {}): { ok: boolean; msg: string; treaty?: Treaty } {
  const why = proposeTreatyCheck(w, n, other, kind);
  if (why) return { ok: false, msg: why };
  const v = willingness(w, other, n, kind);
  const mine = willingness(w, n, other, kind);
  if (v.p < 0.5) {
    relation(w, n.id, other.id, -1, `${TREATY_INFO[kind].name.toLowerCase()} declined`);
    return { ok: false, msg: `${other.name} declined (${v.why}).` };
  }
  void mine;
  const t = signTreaty(w, kind, [n.id, other.id], kind === 'guarantee' ? { ...opts, guarantor: n.id } : kind === 'basing' ? { ...opts, host: other.id } : opts);
  return { ok: true, msg: `${other.name} agreed (${v.why}).`, treaty: t };
}

// ---------- effects ----------

/** Trade partners waive import tariffs (read by market.saleTaxes). */
export const freeTrade = (w: World, a: Id, b: Id) => !!w.treaties && hasTreaty(w, a, b, 'trade');

/** Allied for threat purposes: allies, guarantees and basing. */
export const securityPartners = (w: World, a: Id, b: Id) =>
  w.nations[a].alliances.includes(b) || hasTreaty(w, a, b, 'basing');

/** The deterrent weight of a country's allies (what an attacker must reckon with). */
export function alliedPower(w: World, target: Id): number {
  let s = 0;
  for (const t of activeTreaties(w, target)) {
    if (t.kind !== 'defence' && t.kind !== 'guarantee') continue;
    const cred = (t.honoured + 1) / (t.honoured + t.failed + 2);
    for (const p of t.parties) if (p !== target && !w.nations[p].exile) s += militaryPower(w, p) * cred * 0.5;
  }
  return s;
}

// ---------- when a member is attacked ----------

/** Called by declareWar: partners of the attacked country decide whether to stand by it; betrayals are remembered. */
export function onWarDeclared(w: World, war: War) {
  seedTreaties(w);
  const att = w.nations[war.att], def = w.nations[war.def];
  // Treaties between the two that the attack breaks (border agreements, trade, intelligence...).
  for (const t of activeTreaties(w, att.id)) if (t.parties.includes(def.id)) endTreaty(w, t, 'broken', att.id, 'war');
  // A betrayal: war soon after renouncing a treaty with the victim.
  if ((att.renounced?.[def.id] ?? -Infinity) > w.time - 365 * DAY) {
    for (const o of w.nations) if (o.id !== att.id && !o.exile) noteTrust(w, o.id, att.id, o.id === def.id ? -25 : -5);
    const text = `💔 ${att.name} attacked ${def.name} within a year of tearing up their treaty. Few will trust its word again.`;
    record(w, 'diplomacy', text, { nation: att.id, important: true });
    (att.chronicle ??= []).push({ t: w.time, text });
  }
  for (const t of activeTreaties(w, def.id)) {
    if (t.kind !== 'defence' && !(t.kind === 'guarantee' && t.guarantor !== def.id)) continue;
    for (const p of t.parties) {
      if (p === def.id || p === att.id) continue;
      const ally = w.nations[p];
      if (ally.exile) continue;
      const lp = leaderProfile(w, ally);
      const rel = ally.relations[def.id]?.score ?? 0;
      const fear = militaryPower(w, att.id) / Math.max(1, militaryPower(w, p));
      const stand = 0.55 + rel / 200 + lp.hawk * 0.2 - Math.max(0, fear - 1) * 0.15 + (t.honoured - t.failed) * 0.05;
      if (chance(w, Math.max(0.05, Math.min(0.97, stand)))) {
        t.honoured++;
        relation(w, p, att.id, -15, `attacked our ally ${def.name}`);
        if (!ally.embargoes.includes(att.id)) ally.embargoes.push(att.id);
        record(w, 'diplomacy', `🛡️ ${ally.name} stood by its ally ${def.name}: sanctions on ${att.name}, and its forces may fight at ${def.name}'s side.`, { nation: p });
      } else {
        t.failed++;
        relation(w, p, def.id, -20, 'left us alone when we were attacked');
        const text = `🫥 ${ally.name} did not stand by its ally ${def.name} against ${att.name}. The ${t.name} looks weaker for it.`;
        record(w, 'diplomacy', text, { nation: p, important: true });
        (ally.chronicle ??= []).push({ t: w.time, text });
      }
    }
  }
}

// ---------- daily: expiry, renewal and treaty effects ----------

export function treatiesDaily(w: World) {
  seedTreaties(w);
  for (const t of allTreaties(w)) {
    if (t.status !== 'active') continue;
    if (t.parties.some((p) => !w.nations[p] || w.nations[p].exile)) { endTreaty(w, t, 'lapsed', undefined, 'a party lost its government'); continue; }
    if (t.until != null && t.until <= w.time) {
      // Renewal: every party must still want it.
      let ok = true;
      for (const a of t.parties) for (const b of t.parties) if (a !== b && willingness(w, w.nations[a], w.nations[b], t.kind).p < 0.45) ok = false;
      if (ok) {
        const yrs = TREATY_INFO[t.kind].years ?? 10;
        t.until = w.time + yrs * 365 * DAY;
        if (t.kind === 'nonaggression') for (const a of t.parties) for (const b of t.parties) if (a !== b) w.nations[a].pacts[b] = t.until;
        record(w, 'diplomacy', `${TREATY_INFO[t.kind].icon} ${t.name} renewed for ${yrs} years.`, { nation: t.parties[0] });
      } else endTreaty(w, t, 'lapsed', undefined, 'not renewed');
    }
  }
}
