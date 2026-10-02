// Families that change, and dating (2.7 Life 2.0: the social fabric).
// - Custody: when parents of young children split up, the children live with one of them
//   (mostly the mother, as courts and couples still mostly decide); the other keeps visiting
//   rights and pays child support every month until they are grown (about a tenth of income for
//   each child, up to three).
// - Step-families: a parent who marries again brings their children into a blended family; the
//   new spouse becomes a step-parent.
// - Gatherings: the year's great holiday (Christmas, the Lunar New Year, Diwali, Eid, the New
//   Year) brings families together: closer, mostly, though old feuds can flare as well as heal.
//   Weddings and funerals do the same. Someone with no family near spends the holiday alone.
// - Inheritance quarrels: children passed over in a will may bear a grudge against the heir.
// - Dating: besides neighbours and workmates, people meet through friends and through dating
//   apps, which match people across the country by how well they would get on: age, outlook,
//   values and personality.
import type { Citizen, Id, Kid, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify } from '../engine/events';
import { chance, next } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { B } from '../data/balance';
import { census } from './census';
import { cref, hhref, jailed, player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { adjustRel } from './social';
import { valueDistance } from './mind';
import { sexOf } from './looks';
import { mutual } from './partnership';
import { note, tieWith } from './ties';
import { friendsOf } from './circles';

const alive = (w: World, id: Id | null | undefined) => { const c = id != null ? w.citizens[id] : undefined; return c && !c.gone ? c : undefined; };
const kinOf = (w: World, c: Citizen): Citizen[] => [...new Set([...(c.family?.partner != null ? [c.family.partner] : []), ...(c.family?.parents ?? []), ...(c.family?.children ?? [])])].map((id) => alive(w, id)).filter((x): x is Citizen => !!x);
const kidAge = (w: World, k: Kid) => (w.time - k.born) / (365 * DAY);

// ---------- custody and step-families ----------

/** Parents split up: the children live with one of them; the other visits and pays support. */
export function custody(w: World, a: Citizen, b: Citizen) {
  const kids = [...(a.family?.kids ?? []), ...(b.family?.kids ?? [])].filter((k) => !k.how || k.how === 'stepchild' || k.how === 'adopted');
  if (!kids.length || !a.family || !b.family) return;
  const mother = sexOf(w, a) === 'f' && sexOf(w, b) === 'm' ? a : sexOf(w, b) === 'f' && sexOf(w, a) === 'm' ? b : null;
  const home = mother && chance(w, 0.75) ? mother : chance(w, 0.5) ? a : b;
  const away = home === a ? b : a;
  away.family!.kids = away.family!.kids.filter((k) => !kids.includes(k));
  home.family!.kids = home.family!.kids.filter((k) => !kids.includes(k));
  for (const k of kids) { k.other = away.id; delete k.step; home.family!.kids.push(k); }
  if (away.player) notify(w, 'personal', `👧 The children will live with ${home.name}. You can see them every week, and you pay child support.`, { critical: true, link: 'life' });
  if (home.player) notify(w, 'personal', `👧 The children will live with you. ${away.name} will see them every week and pay child support.`, { critical: true, link: 'life' });
}
/** A parent marries again: the new spouse becomes a step-parent. */
export function blend(a: Citizen, b: Citizen) {
  for (const [x, y] of [[a, b], [b, a]]) for (const k of x.family?.kids ?? []) if (k.other !== y.id) k.step = y.id;
}
/** Children of someone that live with the other parent. */
export function childrenAway(w: World, c: Citizen): { kid: Kid; with: Citizen }[] {
  const out: { kid: Kid; with: Citizen }[] = [];
  for (const x of census(w).all) for (const k of x.family?.kids ?? []) if (k.other === c.id && !x.gone) out.push({ kid: k, with: x });
  return out;
}
/** Child support due each month from a parent who lives apart (about a tenth of income a child, up to three). */
export const supportDue = (c: Citizen, kids: number) => Math.round((c.incomeAvg ?? 0) * 30 * 0.1 * Math.min(3, kids));

function supportMonth(w: World) {
  const owed = new Map<Id, Map<Id, number>>(); // payer -> payee -> children
  for (const x of census(w).all) for (const k of x.family?.kids ?? []) {
    if (k.other == null) continue;
    if (kidAge(w, k) >= B.life.adultAge) { delete k.other; continue; }
    const m = owed.get(k.other) ?? owed.set(k.other, new Map()).get(k.other)!;
    m.set(x.id, (m.get(x.id) ?? 0) + 1);
  }
  for (const [payer, to] of owed) {
    const c = alive(w, payer);
    if (!c) continue;
    const code = w.nations[c.nation].cur;
    for (const [id, n] of to) {
      const amt = Math.min(supportDue(c, n), Math.floor((c.wallet[code] ?? 0) * 0.4));
      if (amt > 0) pay(w, cref(c.id), cref(id), code, amt, 'Child support');
    }
    // Not seeing the children hurts.
    if (c.life && (c.flags.sawKids == null || dayOf(w.time) - c.flags.sawKids > 30)) c.life.happiness = Math.max(0, c.life.happiness - 2);
  }
}

export function visitCheck(w: World, c: Citizen): string | null {
  const away = childrenAway(w, c);
  if (!away.length) return 'No children living apart from you.';
  if (jailed(w, c)) return 'Not from prison.';
  if (c.flags.sawKids != null && dayOf(w.time) - c.flags.sawKids < 7) return 'Your visiting day is once a week.';
  return null;
}
/** See the children who live with your ex. */
export function visitChildren(w: World, c: Citizen = player(w)): Result {
  const why = visitCheck(w, c);
  if (why) return fail(why);
  c.flags.sawKids = dayOf(w.time);
  const away = childrenAway(w, c);
  for (const { kid, with: ex } of away) { kid.bond = Math.min(100, (kid.bond ?? 50) + 3); adjustRel(ex, c.id, 1); }
  const L = lifeOf(c);
  L.happiness = Math.min(100, L.happiness + 4);
  return ok(`👧 A day with ${away.map((x) => x.kid.name.split(' ')[0]).join(' and ')}. The hand-over at ${away[0].with.name.split(' ')[0]}'s door is civil, mostly.`);
}

// ---------- gatherings ----------

/** The month of each country's great family holiday (0 = January). Eid moves about 11 days earlier each year. */
function holidayMonth(w: World, iso: string): { month: number; name: string } {
  const year = dateAt(w.time).year;
  switch (dataIso(iso)) {
    case 'CHN': case 'KOR': return { month: 0, name: 'the Lunar New Year' };
    case 'JPN': return { month: 0, name: 'the New Year holidays' };
    case 'IND': return { month: 9, name: 'Diwali' };
    case 'SAU': case 'TUR': return { month: ((2 - Math.floor((year - 2025) * 0.36)) % 12 + 12) % 12, name: 'Eid' };
    default: return { month: 11, name: 'the Christmas holidays' };
  }
}
export const holidayOf = holidayMonth;

/** Kin who see each other grow closer; feuds can flare or heal. */
function gather(w: World, people: Citizen[], heal: number) {
  for (const a of people) for (const b of people) {
    if (a === b || a.player) continue;
    if (tieWith(a, b.id, 'grudge')) {
      if (chance(w, heal)) { a.ties = a.ties!.filter((t) => !(t.who === b.id && t.kind === 'grudge')); note(w, a, b, 'gratitude', 15, 'making it up at a family gathering'); adjustRel(a, b.id, 15); }
      else if (chance(w, 0.15)) adjustRel(a, b.id, -5); // an old row at the table
    } else adjustRel(a, b.id, 2);
  }
}

function holidays(w: World) {
  const month = dateAt(w.time).month;
  const p = player(w);
  for (const c of census(w).all) {
    if (c.gone || holidayMonth(w, w.nations[c.nation].iso).month !== month) continue;
    const kin = kinOf(w, c).filter((x) => x.nation === c.nation);
    if (!c.player) { if (kin.length && c.id < Math.min(...kin.map((x) => x.id))) gather(w, [c, ...kin], 0.15); continue; }
    const h = holidayMonth(w, w.nations[c.nation].iso).name;
    if (kin.length) {
      gather(w, [c, ...kin], 0.15);
      for (const x of kin) adjustRel(x, c.id, 3);
      lifeOf(c).happiness = Math.min(100, lifeOf(c).happiness + 5);
      notify(w, 'personal', `🎉 ${h[0].toUpperCase()}${h.slice(1)} with ${kin.map((x) => x.name.split(' ')[0]).slice(0, 4).join(', ')}: food, noise and family.`, { link: 'life' });
    } else {
      lifeOf(c).happiness = Math.max(0, lifeOf(c).happiness - 3);
      notify(w, 'personal', `🕯️ You spent ${h} alone.`, { link: 'life' });
    }
  }
  void p;
}

/** A wedding brings both families together. */
export function weddingGathering(w: World, a: Citizen, b: Citizen) {
  const kin = [...kinOf(w, a), ...kinOf(w, b)].filter((x) => x !== a && x !== b);
  for (const x of kin) { adjustRel(x, a.id, 3); adjustRel(x, b.id, 3); }
  gather(w, kin, 0.2);
}
/** A death: the family comes together at the funeral; children passed over in the will may resent the heir. */
export function funeral(w: World, dead: Citizen, heir: Citizen | null) {
  const kin = kinOf(w, dead).filter((x) => !x.gone);
  gather(w, kin, 0.3);
  if (heir) for (const id of dead.family?.children ?? []) {
    const x = alive(w, id);
    if (x && x.id !== heir.id && chance(w, 0.3)) note(w, x, heir, 'grudge', 40, `${dead.name.split(' ')[0]}'s will`);
  }
}

// ---------- dating ----------

/** How well two people would get on (0–1): age, outlook, values and temperament. */
export function compatibility(w: World, a: Citizen, b: Citizen): number {
  const gap = Math.abs(ageOf(w, a) - ageOf(w, b));
  const outlook = a.ideo === b.ideo ? 0 : 0.15;
  const temper = Math.abs(a.traits.activity - b.traits.activity) * 0.3 + Math.abs(a.traits.risk - b.traits.risk) * 0.2;
  return Math.max(0, Math.min(1, 1 - gap / 20 - outlook - valueDistance(w, a, b) * 0.8 - temper));
}
const single = (w: World, c: Citizen) => !c.gone && c.family?.partner == null && ageOf(w, c) >= B.life.adultAge && ageOf(w, c) < 70 && !jailed(w, c);
const kinTo = (a: Citizen, b: Citizen) => (a.family?.parents ?? []).includes(b.id) || (a.family?.children ?? []).includes(b.id) || (a.family?.parents ?? []).some((x) => (b.family?.parents ?? []).includes(x));

export interface Match { id: Id; score: number }
/** A dating app: the best matches among singles across the country. */
export function appMatches(w: World, c: Citizen, k = 3): Match[] {
  const pool = census(w).all.filter((x) => x.nation === c.nation && x.id !== c.id && !x.player && single(w, x) && Math.abs(ageOf(w, x) - ageOf(w, c)) <= 10 && mutual(w, c, x) && !kinTo(c, x));
  return pool.map((x) => ({ id: x.id, score: Math.round(compatibility(w, c, x) * 100) / 100 })).sort((a, b) => b.score - a.score).slice(0, k);
}
export function appCheck(w: World, c: Citizen): string | null {
  if (!single(w, c)) return c.family?.partner != null ? 'You are seeing someone.' : 'Not now.';
  if (c.flags.app != null && dayOf(w.time) - c.flags.app < 7) return 'New matches come once a week.';
  const code = w.nations[c.nation].cur;
  if ((c.wallet[code] ?? 0) < cur(1)) return `A week on the app costs ${fmtAmt(code, cur(1))}.`;
  return null;
}
/** A week on a dating app: three matches to meet. */
export function useApp(w: World, c: Citizen = player(w)): Result {
  const why = appCheck(w, c);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  pay(w, cref(c.id), hhref(n.id), n.cur, cur(1), 'Dating app');
  c.flags.app = dayOf(w.time);
  const m = appMatches(w, c);
  c.matches = m;
  return m.length ? ok(`📱 ${m.length} new match${m.length > 1 ? 'es' : ''}: ${m.map((x) => `${w.citizens[x.id].name} (${Math.round(x.score * 100)}%)`).join(', ')}.`) : ok('📱 No matches this week.');
}
export function setUpCheck(w: World, c: Citizen): string | null {
  if (!single(w, c)) return 'Not now.';
  if (!friendsOf(w, c).length) return 'You need friends to set you up.';
  if (c.flags.setUp != null && dayOf(w.time) - c.flags.setUp < 14) return 'Your friends are still thinking (once a fortnight).';
  return null;
}
/** Ask friends to set you up with someone they know. */
export function askFriends(w: World, c: Citizen = player(w)): Result {
  const why = setUpCheck(w, c);
  if (why) return fail(why);
  c.flags.setUp = dayOf(w.time);
  const friends = friendsOf(w, c);
  const seen = new Set(friends.map((x) => x.id));
  const pool = friends.flatMap((f) => Object.entries(f.rel).filter(([, v]) => v >= 30).map(([k]) => w.citizens[+k]).filter((x) => x && !x.player && !seen.has(x.id) && single(w, x) && mutual(w, c, x) && !kinTo(c, x) && Math.abs(ageOf(w, x) - ageOf(w, c)) <= 10).map((x) => ({ x, by: f })));
  if (!pool.length) return ok('Your friends rack their brains, but cannot think of anyone.');
  const best = pool.sort((a, b) => compatibility(w, c, b.x) - compatibility(w, c, a.x))[0];
  adjustRel(best.x, c.id, 30 - Math.min(30, best.x.rel[c.id] ?? 0) + 5);
  c.matches = [{ id: best.x.id, score: Math.round(compatibility(w, c, best.x) * 100) / 100 }, ...(c.matches ?? []).filter((m) => m.id !== best.x.id)].slice(0, 4);
  return ok(`🫂 ${best.by.name.split(' ')[0]} introduces you to ${best.x.name} at a dinner party. You get on${compatibility(w, c, best.x) > 0.6 ? ' famously' : ' well enough'}.`);
}
export function meetCheck(w: World, c: Citizen, id: Id): string | null {
  const m = (c.matches ?? []).find((x) => x.id === id);
  const x = w.citizens[id];
  if (!m || !x) return 'Not one of your matches.';
  if (!single(w, c) || !single(w, x)) return `${x.name} is no longer single.`;
  if (c.energy < 15) return 'Needs 15 energy.';
  return null;
}
/** Meet a match: a first date, which goes as well as you would get on. */
export function meetMatch(w: World, id: Id, c: Citizen = player(w)): Result {
  const why = meetCheck(w, c, id);
  if (why) return fail(why);
  const m = c.matches!.find((x) => x.id === id)!;
  const x = w.citizens[id];
  c.energy -= 15;
  c.matches = c.matches!.filter((y) => y.id !== id);
  if (!chance(w, 0.25 + m.score * 0.6)) { adjustRel(x, c.id, 5); return ok(`☕ Coffee with ${x.name}. Pleasant, but no spark.`); }
  const fx = x.family!, fc = c.family!;
  fx.partner = c.id; fc.partner = x.id; fx.status = fc.status = 'dating'; fx.since = fc.since = w.time; fx.lastDate = fc.lastDate = w.time;
  adjustRel(x, c.id, 35); adjustRel(c, x.id, 35);
  return ok(`💕 A first date with ${x.name} that runs until the café closes. You are seeing each other.`);
}

/** A month of apps for everyone else: some singles meet someone across the country. */
function appMonth(w: World) {
  const singles = census(w).all.filter((x) => !x.player && single(w, x) && ageOf(w, x) >= 21 && ageOf(w, x) <= 45);
  for (let k = 0; k < Math.ceil(singles.length / 40); k++) {
    const a = singles[Math.floor(next(w) * singles.length)];
    if (!a || a.family?.partner != null) continue;
    let best: Citizen | null = null, bs = 0;
    for (let j = 0; j < 6; j++) {
      const b = singles[Math.floor(next(w) * singles.length)];
      if (!b || b === a || b.nation !== a.nation || b.family?.partner != null || !mutual(w, a, b) || kinTo(a, b)) continue;
      const s = compatibility(w, a, b);
      if (s > bs) { bs = s; best = b; }
    }
    if (best && chance(w, bs * 0.5)) {
      a.family!.partner = best.id; best.family!.partner = a.id;
      a.family!.status = best.family!.status = 'dating';
      a.family!.since = best.family!.since = w.time;
      adjustRel(a, best.id, 30); adjustRel(best, a.id, 30);
    }
  }
}

export function familyLifeMonth(w: World) {
  supportMonth(w);
  holidays(w);
  appMonth(w);
}
export function familyLifeDaily(w: World) {
  if (dateAt(w.time).day === 1) familyLifeMonth(w);
}
