// Circles (2.7 Life 2.0: the social fabric). Everyone moves in several circles: family, friends,
// workmates, neighbours, a club (from a pastime), and for believers a congregation. Circles are
// worked out from who people are and where they live and work (nothing extra is saved), and a
// person's standing in a circle is simply what its members think of them on average.
// - People in a circle meet: each month some pairs of members spend time together and grow
//   closer, more so when their values are alike; now and then two rub each other up the wrong way.
//   Friendships form this way, among everyone, not only around the player.
// - Standing at work counts towards promotion in public service.
// - The player can do something with each circle once a week: have friends round, drinks after
//   work, help a neighbour, a club night, attend services.
import { RELIGION_INFO, devout, religionOf } from './faith';
import { startRumour } from './gossip';
import type { Citizen, Id, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { chance, hash01, next } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census, residents } from './census';
import { cref, hhref, jailed, player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { adjustRel } from './social';
import { valueDistance } from './mind';
import { HOBBIES } from './hobbies';
import { siblingsOf } from './kinship';

export type CircleKind = 'family' | 'friends' | 'work' | 'neighbours' | 'club' | 'faith';
export interface Circle { kind: CircleKind; name: string; members: Citizen[] }
export const CIRCLE_INFO: Record<CircleKind, { icon: string; label: string; act: string; actHint: string }> = {
  family: { icon: '👪', label: 'Family', act: 'Family dinner', actHint: 'a meal together' },
  friends: { icon: '🫂', label: 'Friends', act: 'Have friends round', actHint: 'food and drink for everyone' },
  work: { icon: '💼', label: 'Workmates', act: 'Drinks after work', actHint: 'a round for the team' },
  neighbours: { icon: '🏘️', label: 'Neighbours', act: 'Help out a neighbour', actHint: 'an evening of your time' },
  club: { icon: '🎯', label: 'Club', act: 'Club night', actHint: 'practice and company' },
  faith: { icon: '🕊️', label: 'Congregation', act: 'Attend services', actHint: 'peace, and the community' },
};

const alive = (x: Citizen | undefined): x is Citizen => !!x && !x.gone;
const near = (c: Citizen, list: readonly Citizen[], k: number) => {
  const h = hash01(c.id, 2801);
  return list.filter((x) => x.id !== c.id && alive(x)).sort((a, b) => Math.abs(hash01(a.id, 2801) - h) - Math.abs(hash01(b.id, 2801) - h)).slice(0, k);
};

/** A person's pastime: the player's best hobby; for others, one from their nature (most have one). */
export function pastimeOf(c: Citizen): string | null {
  if (c.player) { const e = Object.entries(c.life?.hobbies ?? {}).filter(([, v]) => v >= 10).sort((a, b) => b[1] - a[1])[0]; return e?.[0] ?? null; }
  const keys = Object.keys(HOBBIES);
  return hash01(c.id, 2802) < 0.6 ? keys[Math.floor(hash01(c.id, 2803) * keys.length)] : null;
}
const believer = (w: World, c: Citizen) => devout(w, c);

/** Colleagues in a public service: same service, same region (indexed once per census). */
const postIndex = new WeakMap<object, Map<string, Citizen[]>>();
function colleagues(w: World, c: Citizen): Citizen[] {
  const cs = census(w);
  let m = postIndex.get(cs);
  if (!m) { m = new Map(); for (const x of cs.all) if (x.post && !x.gone) { const k = `${x.post.kind}:${x.post.region}`; (m.get(k) ?? m.set(k, []).get(k)!).push(x); } postIndex.set(cs, m); }
  return c.post ? m.get(`${c.post.kind}:${c.post.region}`) ?? [] : [];
}

export function workmates(w: World, c: Citizen): Citizen[] {
  if (c.job != null && w.companies[c.job]) return near(c, w.companies[c.job].workers.map((id) => w.citizens[id]), 30);
  if (c.post) return near(c, colleagues(w, c), 30);
  return [];
}
export function friendsOf(w: World, c: Citizen): Citizen[] {
  if (c.player) return census(w).all.filter((x) => !x.player && alive(x) && (x.rel[c.id] ?? 0) >= 50);
  return Object.entries(c.rel).filter(([, v]) => v >= 50).map(([k]) => w.citizens[+k]).filter((x): x is Citizen => alive(x) && (x.rel[c.id] ?? 0) >= 30);
}

/** The circles a person moves in (those with at least one other member). */
export function circlesOf(w: World, c: Citizen): Circle[] {
  const out: Circle[] = [];
  const f = c.family;
  const kin = [...new Set([...(f?.partner != null ? [f.partner] : []), ...(f?.parents ?? []), ...(f?.children ?? [])])].map((id) => w.citizens[id]).filter(alive);
  kin.push(...siblingsOf(w, c).grown.filter((x) => alive(x) && !kin.includes(x)));
  if (kin.length) out.push({ kind: 'family', name: 'Family', members: kin });
  const friends = friendsOf(w, c);
  if (friends.length) out.push({ kind: 'friends', name: 'Friends', members: friends });
  const work = workmates(w, c);
  if (work.length) out.push({ kind: 'work', name: c.job != null ? w.companies[c.job].name : `the ${w.regions[c.post!.region].name} ${c.post!.kind}s`, members: work });
  const home = residents(w, c.home);
  const nb = near(c, home.filter((x) => ageOf(w, x) >= 16), 10);
  if (nb.length) out.push({ kind: 'neighbours', name: `Neighbours in ${w.regions[c.home].name}`, members: nb });
  const pt = pastimeOf(c);
  if (pt) { const club = near(c, home.filter((x) => pastimeOf(x) === pt && ageOf(w, x) >= 14), 20); if (club.length) out.push({ kind: 'club', name: `${HOBBIES[pt].label} club, ${w.regions[c.home].name}`, members: club }); }
  if (believer(w, c)) { const rel = religionOf(w, c); const cong = near(c, home.filter((x) => believer(w, x) && religionOf(w, x) === rel && ageOf(w, x) >= 14), 25); if (cong.length) out.push({ kind: 'faith', name: `${RELIGION_INFO[rel].people} congregation (${RELIGION_INFO[rel].place}), ${w.regions[c.home].name}`, members: cong }); }
  return out;
}

/** Standing in a circle: what its members think of someone, on average (−100 to 100). */
export const standingIn = (c: Citizen, circle: Circle) => circle.members.length ? Math.round(circle.members.reduce((t, x) => t + (x.rel[c.id] ?? 0), 0) / circle.members.length) : 0;
export const standingLabel = (v: number) => (v >= 50 ? 'much loved' : v >= 25 ? 'well liked' : v >= 8 ? 'liked' : v > -8 ? 'hardly known' : v > -25 ? 'not much liked' : 'disliked');
/** Standing among workmates (promotions in public service weigh it). */
export function workStanding(w: World, c: Citizen): number {
  const m = workmates(w, c);
  return m.length ? Math.round(m.reduce((t, x) => t + (x.rel[c.id] ?? 0), 0) / m.length) : 0;
}

// ---------- people meeting in their circles ----------

/** A month of company: pairs of members meet, mostly growing closer. */
export function circlesMonth(w: World) {
  const groups: Citizen[][] = [];
  for (const co of Object.values(w.companies)) if (co.workers.length > 1) groups.push(co.workers.map((id) => w.citizens[id]).filter(alive));
  const byHome = new Map<Id, Citizen[]>();
  for (const c of census(w).all) if (alive(c) && !c.player && ageOf(w, c) >= 14) (byHome.get(c.home) ?? byHome.set(c.home, []).get(c.home)!).push(c);
  for (const people of byHome.values()) {
    const clubs = new Map<string, Citizen[]>();
    for (const c of people) { const p = pastimeOf(c); if (p) (clubs.get(p) ?? clubs.set(p, []).get(p)!).push(c); }
    groups.push(...clubs.values());
    const congs = new Map<string, Citizen[]>();
    for (const c of people) if (believer(w, c)) { const r = religionOf(w, c); (congs.get(r) ?? congs.set(r, []).get(r)!).push(c); }
    groups.push(...congs.values());
    groups.push(people); // neighbours
  }
  for (const g of groups) {
    if (g.length < 2) continue;
    const meetings = Math.min(6, Math.ceil(g.length / 4));
    for (let k = 0; k < meetings; k++) {
      const a = g[Math.floor(next(w) * g.length)], b = g[Math.floor(next(w) * g.length)];
      if (a === b || a.player || b.player) continue;
      const fit = 0.5 - valueDistance(w, a, b) * 2; // like minds get on
      const d = chance(w, 0.12) ? -3 : Math.round((2 + fit * 2 + (a.traits.activity + b.traits.activity) - 1) * 10) / 10;
      adjustRel(a, b.id, d);
      adjustRel(b, a.id, d * (0.8 + next(w) * 0.4));
    }
  }
  // Keep everyone's address book to the people who matter (saves stay small).
  for (const c of census(w).all) {
    if (c.player) continue;
    const keys = Object.keys(c.rel);
    if (keys.length <= 40) continue;
    const keep = new Set<number>([w.playerId, ...(c.family?.partner != null ? [c.family.partner] : []), ...(c.family?.parents ?? []), ...(c.family?.children ?? []), ...(c.ties ?? []).map((t) => t.who)]);
    const drop = keys.map(Number).filter((k) => !keep.has(k)).sort((a, b) => Math.abs(c.rel[a]) - Math.abs(c.rel[b])).slice(0, keys.length - 40);
    for (const k of drop) delete c.rel[k];
  }
}

export function circlesDaily(w: World) {
  if (dateAt(w.time).day === 1) circlesMonth(w);
}

// ---------- the player's week ----------

const cost = (kind: CircleKind, n: number) => (kind === 'friends' ? cur(1.5) * Math.min(8, n) : kind === 'work' ? cur(1) * Math.min(8, n) : kind === 'family' ? cur(1) * Math.min(6, n) : kind === 'faith' ? cur(0.5) : 0);

export function circleActCheck(w: World, c: Citizen, kind: CircleKind): string | null {
  if (c.gone) return 'No longer living.';
  if (jailed(w, c)) return 'Not from prison.';
  const circle = circlesOf(w, c).find((x) => x.kind === kind);
  if (!circle) return 'You are not part of such a circle.';
  const last = c.flags[`circle:${kind}`];
  if (last != null && dayOf(w.time) - last < 7) return 'Once a week.';
  if (c.energy < 10) return 'Too tired.';
  const n = w.nations[c.nation];
  const amt = cost(kind, circle.members.length);
  if ((c.wallet[n.cur] ?? 0) < amt) return `That costs ${fmtAmt(n.cur, amt)}.`;
  return null;
}
/** Spend time with a circle: everyone in it thinks a little better of you. */
export function circleAct(w: World, kind: CircleKind, c: Citizen = player(w)): Result {
  const why = circleActCheck(w, c, kind);
  if (why) return fail(why);
  const circle = circlesOf(w, c).find((x) => x.kind === kind)!;
  const n = w.nations[c.nation];
  const amt = cost(kind, circle.members.length);
  if (amt) pay(w, cref(c.id), hhref(n.id), n.cur, amt, CIRCLE_INFO[kind].act);
  c.flags[`circle:${kind}`] = dayOf(w.time);
  c.energy -= 10;
  const L = lifeOf(c);
  const came = circle.members.slice(0, kind === 'neighbours' ? 1 : 8);
  for (const x of came) adjustRel(x, c.id, kind === 'neighbours' ? 6 : 3);
  if (kind === 'neighbours') startRumour(w, c, 'kindness', `${c.name} spent an evening helping ${came[0]?.name ?? 'a neighbour'}`, 1, 4, true, came[0]); // word gets round
  L.happiness = Math.min(100, L.happiness + 2);
  L.stress = Math.max(0, L.stress - (kind === 'faith' ? 5 : 3));
  if (kind === 'club') { const pt = pastimeOf(c); if (pt) L.hobbies[pt] = Math.min(100, (L.hobbies[pt] ?? 0) + 1); L.lastHobby = dayOf(w.time); }
  if (kind === 'family') L.lastFamily = dayOf(w.time);
  const names = came.slice(0, 3).map((x) => x.name.split(' ')[0]).join(', ') + (came.length > 3 ? ` and ${came.length - 3} more` : '');
  const text: Record<CircleKind, string> = {
    family: `A long dinner with ${names}. Old stories, and some new ones.`,
    friends: `${names} came round. Food, drink and laughter until late.`,
    work: `Drinks after work with ${names}. You hear the office gossip, and you buy a round.`,
    neighbours: `You spend the evening helping ${names}. They will not forget it.`,
    club: `Club night with ${names}.`,
    faith: `Services, and tea afterwards with ${names}.`,
  };
  return ok(`${CIRCLE_INFO[kind].icon} ${text[kind]}`);
}

export const sinceLast = (w: World, c: Citizen, kind: CircleKind) => { const d = c.flags[`circle:${kind}`]; return d == null ? null : (w.time - d * DAY) / DAY; };
