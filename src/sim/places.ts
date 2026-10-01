// Places inside a region: districts and venues, where people are at each hour,
// whether they can be met, familiarity with a place, exploring, and
// appointments. `Citizen.loc` stays the authoritative region; the player's
// district and venue are a local position under it (w.story.local). Rule: when
// the player arrives in another region, the position resets to its station (or
// to home, in the home region). Layouts come from a hash of the region, never
// from the world's dice, so venues never move between saves or visits.
import { census } from './census';
import type { Citizen, Id, StoryInstance, World } from './types';
import { DISTRICTS, FAMILIARITY_UNLOCKS, VENUE_KINDS, type DistrictId, type VenueKind } from '../data/places';
import { EARTH } from '../data/earth';
import { INDUSTRY_INFO } from '../data/items';
import { B } from '../data/balance';
import { HOUR, hourOf } from '../engine/clock';
import { dateAt, fmtDate, fmtTime } from '../engine/calendar';
import { fail, ok, type Result } from '../engine/result';
import { nid, notify } from '../engine/events';
import { chance, pick } from '../engine/rng';
import { controller, cref, hhref, jailed, player } from './query';
import { pay } from '../engine/ledger';
import { lifeOf } from './lifecycle';
import { companiesIn, presentIn } from './census';
import { nowDoing, type Doing } from './life';
import { journal, offerAmbient, remember } from './story';
import { startTalk } from './interact';
import { adjustRel } from './social';

export interface Venue { id: string; kind: VenueKind; district: DistrictId; name: string; icon: string; desc: string; company?: Id; essential: boolean; minFamiliarity: number; screen?: string }

/** FNV-1a: a stable number from a string (layouts and names without using the world's dice). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export const pickStable = <T,>(xs: T[], key: string): T => xs[hash(key) % xs.length];

// ---------- layout ----------

/** The venues of a region. Static places are fixed; workplaces follow the region's real companies. */
export function venuesOf(w: World, rid: Id): Venue[] {
  const e = EARTH.regions[rid];
  const r = w.regions[rid];
  const city = e.city || e.seat || e.name;
  const out: Venue[] = [];
  const add = (kind: VenueKind, over: Partial<Venue> = {}) => {
    const k = VENUE_KINDS[kind];
    out.push({ id: kind, kind, district: k.district, name: k.names.length ? pickStable(k.names, `${rid}:${kind}`) : kind, icon: k.icon, desc: k.desc, essential: !!k.essential, minFamiliarity: k.minFamiliarity ?? 0, screen: k.screen, ...over });
  };
  // Cafés and restaurants run by local people take their owner's name and sign.
  const owned = (kind: 'cafe' | 'restaurant') => census(w).all.find((c) => c.business?.kind === kind && c.business.region === rid && !c.gone);
  const ownedOver = (kind: 'cafe' | 'restaurant') => { const o = owned(kind); return o ? { name: o.business!.name, desc: `${VENUE_KINDS[kind].desc} Run by ${o.name}.` } : {}; };
  add('home'); add('park'); add('cafe', ownedOver('cafe')); add('community'); add('gym'); add('library'); add('lookout');
  add('cityhall', { name: `${pickStable(VENUE_KINDS.cityhall.names, `${rid}:hall`)}, ${e.seat || city}` });
  add('parties'); add('police', { name: `${city} ${pickStable(VENUE_KINDS.police.names, `${rid}:pd`)}` });
  if (Object.values(w.papers).some((p) => p.nation === controller(r))) add('newsroom');
  add('clinic', { name: r.bld.hospital > 0 ? `${city} General Hospital` : `${city} Community Clinic` });
  add('market'); add('restaurant', ownedOver('restaurant')); add('bank'); add('backroom');
  const cos = companiesIn(w, rid);
  for (const co of cos) out.push({ id: `co:${co.id}`, kind: 'company', district: 'industrial', name: co.name, icon: INDUSTRY_INFO[co.industry]?.icon ?? '🏭', desc: `${INDUSTRY_INFO[co.industry]?.name ?? 'Company'} · ${co.workers.length} staff`, company: co.id, essential: true, minFamiliarity: 0, screen: 'companies' });
  if (cos.length) add('unionhall');
  add('station', { name: `${city} ${pickStable(VENUE_KINDS.station.names, `${rid}:st`)}` });
  if (e.seas?.length) add('harbour');
  if (r.bld.base > 0 || Object.values(w.forces).some((f) => f.loc === rid && f.nation === controller(r))) add('barracks');
  return out;
}

export const venueById = (w: World, rid: Id, id: string) => venuesOf(w, rid).find((v) => v.id === id) ?? null;

export function districtsOf(w: World, rid: Id): DistrictId[] {
  const set = new Set(venuesOf(w, rid).map((v) => v.district));
  return (Object.keys(DISTRICTS) as DistrictId[]).filter((d) => set.has(d));
}

// ---------- familiarity and discovery ----------

/** Familiarity with a region, 0–100 (your home region starts somewhat familiar). */
export function familiarity(w: World, rid: Id): number {
  const f = w.story.local.familiarity[rid];
  return f ?? (rid === player(w).home ? 15 : 0);
}

/** Grow familiarity with diminishing returns; returns the places this opened up. */
export function gainFamiliarity(w: World, rid: Id, amount: number): string[] {
  const before = familiarity(w, rid);
  const after = Math.min(100, Math.round((before + amount * (1 - before / 100)) * 100) / 100);
  w.story.local.familiarity[rid] = after;
  return FAMILIARITY_UNLOCKS.filter((u) => before < u.at && after >= u.at).map((u) => u.text);
}

export function isKnown(w: World, rid: Id, v: Venue): boolean {
  return v.essential || familiarity(w, rid) >= v.minFamiliarity || !!w.story.local.discovered[`${rid}:${v.id}`];
}

/** The next place familiarity will reveal, as a hint. */
export function nextDiscovery(w: World, rid: Id): { at: number; text: string } | null {
  const f = familiarity(w, rid);
  return FAMILIARITY_UNLOCKS.find((u) => u.at > f) ?? null;
}

// ---------- position ----------

/** The player's local position, reset when they arrive in another region. */
export function position(w: World): { region: Id; district: DistrictId; venue: string | null } {
  const p = player(w);
  const L = w.story.local;
  if (L.region !== p.loc) {
    L.region = p.loc;
    const home = p.home === p.loc;
    L.district = home ? 'residential' : 'transport';
    L.venue = home ? 'home' : 'station';
  }
  return { region: L.region!, district: (L.district as DistrictId) ?? 'residential', venue: L.venue };
}

export function goToCheck(w: World, venueId: string): string | null {
  const p = player(w);
  if (jailed(w, p)) return 'You are in prison.';
  const v = venueById(w, p.loc, venueId);
  if (!v) return 'No such place here.';
  if (!isKnown(w, p.loc, v)) return 'You have not found this place yet: explore more.';
  if (v.kind === 'home' && p.home !== p.loc) return 'You do not live here.';
  return null;
}

/** Walk to a place in the current region. */
export function goTo(w: World, venueId: string): Result {
  const why = goToCheck(w, venueId);
  if (why) return fail(why);
  const p = player(w);
  const v = venueById(w, p.loc, venueId)!;
  position(w);
  w.story.local.district = v.district;
  w.story.local.venue = v.id;
  const key = `${p.loc}:${v.id}`;
  const first = !w.story.local.discovered[key];
  if (first) w.story.local.discovered[key] = w.time;
  const opened = gainFamiliarity(w, p.loc, first ? 1.5 : 0.4);
  const here = peopleAt(w, p.loc, v.id).length;
  return ok(`You are at ${v.name}. ${here ? `${here} ${here === 1 ? 'person' : 'people'} here.` : 'Nobody you know is around.'}${opened.length ? ` You now know ${opened.join(' and ')}.` : ''}`);
}

export function exploreCheck(w: World): string | null {
  const p = player(w);
  if (jailed(w, p)) return 'You are in prison.';
  if (p.energy < B.places.exploreEnergy) return `Needs ${B.places.exploreEnergy} energy.`;
  if ((w.story.local.lastExplore ?? -Infinity) > w.time - HOUR) return 'You just explored; give it an hour.';
  return null;
}

/** Wander the district: learn the place, meet someone, stumble on a situation. */
export function explore(w: World): Result {
  const why = exploreCheck(w);
  if (why) return fail(why);
  const p = player(w);
  const pos = position(w);
  p.energy -= B.places.exploreEnergy;
  w.story.local.lastExplore = w.time;
  const opened = gainFamiliarity(w, p.loc, B.places.exploreGain);
  const lines: string[] = [];
  if (opened.length) lines.push(`You find ${opened.join(' and ')}.`);
  // Meeting someone around this part of town.
  const around = presentIn(w, p.loc).filter((c) => !c.player && !c.gone && DISTRICT_OF[venueOf(w, c) ?? ''] === pos.district);
  if (around.length && chance(w, 0.6)) {
    const c = pick(w, around);
    adjustRel(c, p.id, 2);
    lines.push(`You get talking with ${c.name}, who ${activityText(nowDoing(w, c))}.`);
  }
  if (chance(w, B.places.exploreStory) && offerAmbient(w, p)) lines.push('Something catches your attention…');
  if (!lines.length) lines.push(pick(w, ['You walk the streets and get a feel for the place.', 'You take a long look around. Every corner has a story.', 'You learn the shortcuts and the names of a few shops.']));
  return ok(`${lines.join(' ')} (Familiarity ${Math.round(familiarity(w, p.loc))}.)`);
}

const activityText = (d: Doing) => ({ work: 'is on a break from work', train: 'is heading to the gym', shop: 'is out shopping', out: 'is out and about', home: 'is walking home', sleep: 'can not sleep', prison: 'is between visits', front: 'is between deployments', away: 'is visiting', mining: 'is back from the mines', duty: 'is off duty for an hour' }[d]);

const DISTRICT_OF: Record<string, DistrictId> = Object.fromEntries(Object.entries(VENUE_KINDS).map(([k, v]) => [k, v.district]));
DISTRICT_OF.company = 'industrial';

// ---------- where people are ----------

/** The venue where someone is at a time (in their current region), or null if not at a public place. */
export function venueOf(w: World, c: Citizen, t = w.time): string | null {
  const d = nowDoing(w, c, t);
  const h = hourOf(t);
  const s = w.govs[c.loc];
  const weekday = dateAt(t).weekday;
  if (s?.head.cit === c.id && weekday >= 1 && weekday <= 5 && h >= 9 && h < 17 && d !== 'prison' && d !== 'away') return 'cityhall';
  switch (d) {
    case 'work': return c.job != null && w.companies[c.job]?.region === c.loc ? `co:${c.job}` : null;
    case 'train': return 'gym';
    case 'duty': return c.sec.police === c.loc ? 'police' : 'barracks';
    case 'shop': return pickStable(['market', 'market', 'bank', 'restaurant'], `${c.id}:${h}`);
    case 'out': {
      if (c.sec.police === c.loc && h < 20) return 'police';
      if (c.persona === 'politician' && h >= 18 && c.party != null) return 'parties';
      if (c.persona === 'journalist' && h < 19 && (c.id + h) % 3 === 0) return 'newsroom';
      if (c.persona === 'soldier' && c.mil.branch && (c.id + h) % 4 === 0) return 'barracks';
      return pickStable(['cafe', 'park', 'community', 'restaurant', 'park', 'cafe', 'unionhall', 'library'], `${c.id}:${h}`);
    }
    case 'home': return c.id === player(w).id || c.home === player(w).home && isHousehold(w, c) ? 'home' : null;
    default: return null;
  }
}

function isHousehold(w: World, c: Citizen) {
  const p = player(w);
  const f = p.family;
  return !!f && (f.partner === c.id || f.children.includes(c.id) || f.parents.includes(c.id));
}

/** People at a venue right now. */
export function peopleAt(w: World, rid: Id, venueId: string): Citizen[] {
  const valid = new Set(venuesOf(w, rid).map((v) => v.id));
  return presentIn(w, rid).filter((c) => !c.player && !c.gone && c.loc === rid && (() => { const v = venueOf(w, c); return v != null && valid.has(v) && v === venueId; })());
}

const UNAVAILABLE: Partial<Record<Doing, string>> = { sleep: 'asleep', prison: 'in prison', front: 'at the front', mining: 'away at the mines', away: 'away from home' };

/** Can the player meet someone now? If not, why, and when next. */
export function availability(w: World, c: Citizen): { now: boolean; where: string | null; why: string | null; next: number | null } {
  const p = player(w);
  if (c.gone) return { now: false, where: null, why: c.gone.why === 'died' ? 'no longer living' : 'moved abroad', next: null };
  if (c.loc !== p.loc) return { now: false, where: null, why: `in ${w.regions[c.loc].name}`, next: null };
  const d = nowDoing(w, c);
  if (UNAVAILABLE[d]) {
    let next: number | null = null;
    const start = Math.floor(w.time / HOUR) * HOUR;
    for (let k = 1; k <= 72; k++) { const t = start + k * HOUR; if (!UNAVAILABLE[nowDoing(w, c, t)]) { next = t; break; } }
    return { now: false, where: null, why: UNAVAILABLE[d]!, next };
  }
  return { now: true, where: venueOf(w, c), why: null, next: null };
}

// ---------- appointments ----------

/** A good time to meet someone: the next evening they are free (within three days). */
export function meetingSlot(w: World, c: Citizen): number | null {
  const start = Math.floor(w.time / HOUR) * HOUR;
  for (let k = 2; k <= 72; k++) {
    const t = start + k * HOUR;
    const h = hourOf(t);
    if (h < 12 || h > 20) continue;
    const d = nowDoing(w, c, t);
    if (d === 'out' || d === 'home' || d === 'shop') return t;
  }
  return null;
}

export function arrangeMeetingCheck(w: World, c: Citizen | undefined): string | null {
  const p = player(w);
  if (!c || c.player || c.gone) return 'Nobody to meet.';
  if (jailed(w, p)) return 'You are in prison.';
  if (c.home !== p.loc && c.loc !== p.loc) return `${c.name} is in ${w.regions[c.loc].name}.`;
  if ((c.rel[p.id] ?? 0) < -10) return `${c.name} does not want to see you.`;
  if (w.story.appointments.some((a) => a.npc === c.id)) return `You already have a meeting with ${c.name}.`;
  if (meetingSlot(w, c) == null) return `${c.name} has no free evening in the next three days.`;
  return null;
}

/** Ask someone to meet at a place and time that suits them. */
export function arrangeMeeting(w: World, npcId: Id, kind: VenueKind = 'cafe', what = 'meet for a coffee', story?: Id): Result {
  const c = w.citizens[npcId];
  const why = arrangeMeetingCheck(w, c);
  if (why) return fail(why);
  const at = meetingSlot(w, c)!;
  const p = player(w);
  const v = venuesOf(w, p.loc).find((x) => x.kind === kind) ?? venuesOf(w, p.loc).find((x) => x.kind === 'cafe')!;
  w.story.appointments.push({ id: nid(w), npc: npcId, at, venue: v.id, region: p.loc, story, what });
  return ok(`${c.name} will ${what.replace(/^meet/, 'meet you')} at ${v.name}, ${fmtDate(at, 'medium')} at ${fmtTime(at, !!w.settings.clock24)}.`);
}

export function keepAppointmentCheck(w: World, id: Id): string | null {
  const p = player(w);
  const a = w.story.appointments.find((x) => x.id === id);
  if (!a) return 'That appointment is gone.';
  if (jailed(w, p)) return 'You are in prison.';
  if (p.loc !== a.region) return `The meeting is in ${w.regions[a.region].name}.`;
  if (w.time < a.at - HOUR) return `Not yet: ${fmtDate(a.at, 'medium')} at ${fmtTime(a.at, !!w.settings.clock24)}.`;
  if (w.time > a.at + 2 * HOUR) return 'Too late: they have gone.';
  return null;
}

/** Go to the meeting: they are there, glad you came, and the conversation begins. */
export function keepAppointment(w: World, id: Id): Result {
  const why = keepAppointmentCheck(w, id);
  if (why) return fail(why);
  const a = w.story.appointments.find((x) => x.id === id)!;
  w.story.appointments = w.story.appointments.filter((x) => x !== a);
  const c = w.citizens[a.npc];
  const p = player(w);
  w.story.local.region = p.loc;
  w.story.local.venue = a.venue;
  w.story.local.district = venueById(w, p.loc, a.venue)?.district ?? 'residential';
  if (c.loc !== p.loc) c.loc = p.loc; // they came to meet you
  remember(w, c, 3, 'kept our appointment');
  if (a.story != null) { const inst = w.story.instances[a.story]; if (inst) { inst.data.met = 1; if (inst.status === 'waiting') inst.waitUntil = w.time; } }
  const talk = startTalk(w, c.id);
  return ok(`You meet ${c.name} at ${venueById(w, p.loc, a.venue)?.name ?? 'the meeting place'}. ${talk.ok ? '' : talk.msg}`);
}

export function cancelAppointment(w: World, id: Id): Result {
  const a = w.story.appointments.find((x) => x.id === id);
  if (!a) return fail('That appointment is gone.');
  w.story.appointments = w.story.appointments.filter((x) => x !== a);
  const c = w.citizens[a.npc];
  if (c && a.at - w.time < 6 * HOUR) remember(w, c, -1, 'cancelled on me at short notice');
  return ok(`Cancelled your meeting with ${c?.name ?? 'them'}.`);
}

/** Hourly: reminders an hour before, and missed meetings two hours after. */
export function appointmentsHourly(w: World) {
  const list = w.story.appointments;
  if (!list.length) return;
  for (const a of [...list]) {
    const c = w.citizens[a.npc];
    if (!c || c.gone) { w.story.appointments = w.story.appointments.filter((x) => x !== a); continue; }
    const place = venueById(w, a.region, a.venue)?.name ?? 'the meeting place';
    if (!a.reminded && a.at - w.time <= HOUR && a.at > w.time - HOUR) {
      a.reminded = true;
      notify(w, 'personal', `⏰ At ${fmtTime(a.at, !!w.settings.clock24)}: ${a.what} with ${c.name} at ${place}${player(w).loc !== a.region ? ` (in ${w.regions[a.region].name})` : ''}.`, { link: 'local', critical: true });
    }
    if (w.time > a.at + 2 * HOUR) {
      w.story.appointments = w.story.appointments.filter((x) => x !== a);
      remember(w, c, -4, 'stood me up');
      journal(w, { title: 'A missed meeting', text: `You did not turn up to ${a.what} with ${c.name} at ${place}.`, kind: 'note', npc: c.id });
      if (a.story != null) { const inst = w.story.instances[a.story]; if (inst && inst.status === 'waiting') { inst.data.met = 0; inst.waitUntil = w.time; } }
    }
  }
}

/** Stories ask for a meeting through here (see Outcome.meet in story.ts; registered by registerSystems). */
export const meetForStory = (w: World, inst: StoryInstance, meet: { role: string; venue: string; what: string }): number | null => {
  const npc = inst.bind[meet.role];
  const c = typeof npc === 'number' ? w.citizens[npc] : undefined;
  if (!c || arrangeMeetingCheck(w, c)) return null;
  const r = arrangeMeeting(w, c.id, meet.venue as VenueKind, meet.what, inst.id);
  return r.ok ? w.story.appointments[w.story.appointments.length - 1].at : null;
};

// ---------- everyday things to do at a place ----------

export const LOCAL_ACTS = {
  coffee: { venue: 'cafe', label: '☕ Have a coffee', energy: 0, cost: 3 },
  walk: { venue: 'park', label: '🌳 Walk in the park', energy: 3, cost: 0 },
  volunteer: { venue: 'community', label: '🤝 Volunteer for an hour', energy: 10, cost: 0 },
} as const;
export type LocalAct = keyof typeof LOCAL_ACTS;

export function localActCheck(w: World, act: LocalAct): string | null {
  const p = player(w);
  const a = LOCAL_ACTS[act];
  if (jailed(w, p)) return 'You are in prison.';
  if (position(w).venue !== a.venue) return `Go to the ${{ cafe: 'café', park: 'park', community: 'community centre' }[a.venue]} first.`;
  if ((w.story.local.done?.[act] ?? -1) === Math.floor(w.time / 1440)) return 'Once a day is enough.';
  if (p.energy < a.energy) return `Needs ${a.energy} energy.`;
  const code = w.nations[controller(w.regions[p.loc])].cur;
  if (a.cost && (p.wallet[code] ?? 0) < a.cost * 100) return 'You cannot afford it.';
  return null;
}

/** Small everyday acts: a coffee, a walk, an hour of volunteering. They build familiarity, mood and acquaintances. */
export function localAct(w: World, act: LocalAct): Result {
  const why = localActCheck(w, act);
  if (why) return fail(why);
  const p = player(w);
  const a = LOCAL_ACTS[act];
  (w.story.local.done ??= {})[act] = Math.floor(w.time / 1440);
  p.energy -= a.energy;
  const nat = controller(w.regions[p.loc]);
  if (a.cost) pay(w, cref(p.id), hhref(nat), w.nations[nat].cur, a.cost * 100, act === 'coffee' ? 'A coffee' : 'Local spending');
  const L = lifeOf(p);
  const here = peopleAt(w, p.loc, a.venue);
  const met = here.length ? pick(w, here) : null;
  if (met) adjustRel(met, p.id, act === 'volunteer' ? 3 : 1);
  gainFamiliarity(w, p.loc, act === 'volunteer' ? 1.5 : 0.8);
  if (act === 'coffee') { L.happiness = Math.min(100, L.happiness + 1); return ok(`A good coffee${met ? ` and a chat with ${met.name}` : ''}.`); }
  if (act === 'walk') { L.stress = Math.max(0, L.stress - 3); return ok(`A long walk clears your head${met ? `; you bump into ${met.name}` : ''}.`); }
  p.influence += 0.3;
  L.happiness = Math.min(100, L.happiness + 2);
  L.stress = Math.max(0, L.stress - 1);
  return ok(`You help sort donations and serve lunch${met ? ` alongside ${met.name}` : ''}. People notice (+standing).`);
}

/** Daily: being somewhere makes it familiar. */
export function placesDaily(w: World) {
  const p = player(w);
  gainFamiliarity(w, p.loc, p.loc === p.home ? 0.4 : 0.8);
}
