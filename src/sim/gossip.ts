// Gossip, rumours and feuds (2.7 Life 2.0: the social fabric).
// - Rumours start from what people see (a drinker, a gambler in debt, someone in prison, a
//   promotion, a kindness to a neighbour) and from grudges: people who bear a grudge talk, and
//   not always truthfully. A rumour spreads through the circles of the person it is about
//   (workmates, neighbours, club, congregation, friends), a few more people each month, and each
//   who hears it thinks a little better or worse of them. Juicy rumours travel further; after
//   half a year they are old news.
// - Feuds: two people who bear each other a grudge feud. They talk each other down, and their
//   families take sides. Most feuds end in time; people who value community make peace sooner.
// - The player hears what is said about them (when a friend passes it on), can set the record
//   straight (a false rumour may be scotched, depending on their standing) or own up to a true
//   one, and can spread a rumour of their own about a rival: a true one if there is something to
//   tell, or an invention, which may be traced back to them.
import type { Citizen, Id, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify } from '../engine/events';
import { chance } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { jailed, player } from './query';
import { adjustRel } from './social';
import { valueOf } from './mind';
import { active } from './habits';
import { circlesOf } from './circles';
import { note, tieWith } from './ties';

export type RumourKind = 'drink' | 'debt' | 'prison' | 'praise' | 'kindness' | 'slander';
export interface Rumour { id: Id; about: Id; by?: Id; kind: RumourKind; text: string; sign: 1 | -1; size: number; truth: boolean; t: number; heard: Id[]; done?: boolean; told?: boolean }

const first = (c: Citizen) => c.name.split(' ')[0];
export const rumoursOf = (w: World): Rumour[] => (w.rumours ??= []);
export const rumoursAbout = (w: World, id: Id) => rumoursOf(w).filter((r) => r.about === id && !r.done);

/** Start a rumour (one live rumour of a kind about a person at a time). */
export function startRumour(w: World, about: Citizen, kind: RumourKind, text: string, sign: 1 | -1, size: number, truth: boolean, by?: Citizen): Rumour | null {
  const list = rumoursOf(w);
  if (list.some((r) => r.about === about.id && r.kind === kind && !r.done)) return null;
  const r: Rumour = { id: (w.nextRumour = (w.nextRumour ?? 0) + 1), about: about.id, by: by?.id, kind, text, sign, size, truth, t: w.time, heard: by ? [by.id] : [] };
  list.push(r);
  if (list.length > 200) w.rumours = list.filter((x) => !x.done).slice(-200);
  return r;
}

/** What people notice about each other this month, and what those with grudges say. */
function newRumours(w: World) {
  for (const c of census(w).all) {
    if (c.gone) continue;
    if (active(c, 'drinking') >= 60 && chance(w, 0.05)) startRumour(w, c, 'drink', `${c.name} was seen drunk again`, -1, 6, true);
    if (active(c, 'gambling') >= 60 && chance(w, 0.05)) startRumour(w, c, 'debt', `${c.name} owes money all over town from gambling`, -1, 6, true);
    if (jailed(w, c) && chance(w, 0.04)) startRumour(w, c, 'prison', `${c.name} is in prison, you know`, -1, 8, true);
    if (c.post && w.time - c.post.promoted < 31 * DAY && c.post.grade >= 2 && chance(w, 0.3)) startRumour(w, c, 'praise', `${c.name} has been promoted, and deserved it`, 1, 4, true);
    // Those who bear a grudge talk.
    for (const t of c.ties ?? []) {
      if ((t.kind !== 'grudge' && t.kind !== 'rival') || t.s < 40 || !chance(w, 0.04)) continue;
      const o = w.citizens[t.who];
      if (o && !o.gone) startRumour(w, o, 'slander', `${first(c)} says ${o.name} cannot be trusted`, -1, 5, chance(w, 0.4), c);
    }
  }
}

/** The people a rumour can reach: those in the circles of the person it is about. */
const audience = (w: World, about: Citizen) => circlesOf(w, about).filter((x) => x.kind !== 'family').flatMap((x) => x.members);

/** A month of talk: each live rumour reaches a few more people. */
function spread(w: World) {
  const p = player(w);
  for (const r of rumoursOf(w)) {
    if (r.done) continue;
    const about = w.citizens[r.about];
    if (!about || about.gone || w.time - r.t > 180 * DAY) { r.done = true; continue; }
    const heard = new Set(r.heard);
    const fresh = audience(w, about).filter((x) => !heard.has(x.id) && x.id !== about.id);
    if (!fresh.length) { r.done = true; continue; }
    for (const x of fresh.slice(0, Math.ceil(2 + r.size / 3))) {
      const source = r.by != null ? w.citizens[r.by] : null;
      const belief = source ? ((x.rel[source.id] ?? 0) >= 0 ? 1 : 0.4) : 1; // people believe those they like
      adjustRel(x, about.id, r.sign * r.size * 0.5 * belief);
      r.heard.push(x.id);
      // A friend tells the player what is being said about them.
      if (about.player && !r.told && (x.rel[p.id] ?? 0) >= 50) { r.told = true; notify(w, 'personal', `🗣️ ${first(x)} tells you what people are saying: "${r.text}."${r.truth ? '' : ' It is not true.'}`, { link: 'life' }); }
    }
    if (r.heard.length > 80) r.heard = r.heard.slice(-80);
  }
}

/** Feuds: two people with grudges against each other talk each other down; families take sides; most make peace in time. */
function feuds(w: World) {
  for (const c of census(w).all) {
    for (const t of c.ties ?? []) {
      if (t.kind !== 'grudge' || c.id > t.who) continue;
      const o = w.citizens[t.who];
      if (!o || o.gone || !tieWith(o, c.id, 'grudge')) continue;
      // Families take sides.
      for (const [me, other] of [[c, o], [o, c]] as [Citizen, Citizen][]) for (const k of [me.family?.partner, ...(me.family?.children ?? []), ...(me.family?.parents ?? [])]) { const x = k != null ? w.citizens[k] : null; if (x && !x.gone && !x.player) adjustRel(x, other.id, -1); }
      // Peace.
      const willing = (valueOf(w, c, 'community') + valueOf(w, o, 'community')) / 2;
      if (chance(w, 0.015 + willing * 0.03)) {
        c.ties = c.ties!.filter((x) => !(x.who === o.id && x.kind === 'grudge'));
        o.ties = (o.ties ?? []).filter((x) => !(x.who === c.id && x.kind === 'grudge'));
        note(w, c, o, 'gratitude', 15, 'making peace'); note(w, o, c, 'gratitude', 15, 'making peace');
        adjustRel(c, o.id, 20); adjustRel(o, c.id, 20);
        if (c.player || o.player) notify(w, 'personal', `🤝 ${c.player ? o.name : c.name} and you have made your peace.`);
        break;
      }
    }
  }
}

/** People who bear a grudge against someone or see them as a rival. */
export function enemiesOf(w: World, c: Citizen): Citizen[] {
  return census(w).all.filter((x) => !x.gone && x.id !== c.id && (x.ties ?? []).some((t) => t.who === c.id && (t.kind === 'grudge' || t.kind === 'rival')));
}
/** Feuding: grudges both ways. */
export const feuding = (w: World, a: Citizen, b: Citizen) => !!tieWith(a, b.id, 'grudge') && !!tieWith(b, a.id, 'grudge');

export function gossipMonth(w: World) {
  newRumours(w);
  spread(w);
  feuds(w);
  w.rumours = rumoursOf(w).filter((r) => !r.done || w.time - r.t < 60 * DAY);
}
export function gossipDaily(w: World) {
  if (dateAt(w.time).day === 1) gossipMonth(w);
}

// ---------- the player ----------

export function answerCheck(w: World, c: Citizen, r: Rumour | undefined): string | null {
  if (!r || r.done || r.about !== c.id) return 'Nothing to answer.';
  if (c.energy < 10) return 'Too tired.';
  if (c.flags.answered === dayOf(w.time)) return 'Once a day.';
  return null;
}
/** Set the record straight (a false rumour) or own up (a true one). */
export function answerRumour(w: World, id: Id, c: Citizen = player(w)): Result {
  const r = rumoursOf(w).find((x) => x.id === id);
  const why = answerCheck(w, c, r);
  if (why) return fail(why);
  c.energy -= 10;
  c.flags.answered = dayOf(w.time);
  const hearers = r!.heard.map((h) => w.citizens[h]).filter((x) => x && !x.gone && x.id !== r!.by);
  r!.done = true;
  if (r!.truth) {
    for (const x of hearers) adjustRel(x, c.id, Math.abs(r!.size) * 0.2);
    return ok(r!.sign < 0 ? '🗣️ You own up to it. People respect the honesty, a little; the story loses its sting.' : '🗣️ You accept the compliment with good grace.');
  }
  const standing = hearers.length ? hearers.reduce((t, x) => t + (x.rel[c.id] ?? 0), 0) / hearers.length : 0;
  if (chance(w, Math.max(0.15, Math.min(0.9, 0.45 + standing / 150)))) {
    for (const x of hearers) { adjustRel(x, c.id, r!.size * 0.5); if (r!.by != null) adjustRel(x, r!.by, -3); }
    return ok(`🗣️ You set the record straight. People believe you${r!.by != null ? `, and think less of ${first(w.citizens[r!.by])} for spreading it` : ''}.`);
  }
  return ok('🗣️ You deny it, but denials only keep a story going. Some believe you; most shrug.');
}

/** What could truthfully be said about someone. */
export function dirtOn(w: World, o: Citizen): RumourKind | null {
  if (active(o, 'drinking') >= 50) return 'drink';
  if (active(o, 'gambling') >= 50) return 'debt';
  if (jailed(w, o)) return 'prison';
  return null;
}
export function spreadCheck(w: World, c: Citizen, o: Citizen | undefined, invent: boolean): string | null {
  if (!o || o.gone || o.id === c.id) return 'Pick someone.';
  if (c.flags.spread != null && dayOf(w.time) - c.flags.spread < 7) return 'Once a week.';
  if (!invent && !dirtOn(w, o)) return `There is nothing true to tell about ${first(o)}.`;
  if (rumoursAbout(w, o.id).some((r) => r.by === c.id)) return 'Your last story about them is still going round.';
  return null;
}
/** Spread a rumour about someone (a true one, or an invention that may be traced back to you). */
export function spreadRumour(w: World, about: Id, invent: boolean, c: Citizen = player(w)): Result {
  const o = w.citizens[about];
  const why = spreadCheck(w, c, o, invent);
  if (why) return fail(why);
  c.flags.spread = dayOf(w.time);
  const kind = invent ? 'slander' : dirtOn(w, o)!;
  const text = invent ? `${o.name} has been fiddling the books` : kind === 'drink' ? `${o.name} is a drunk` : kind === 'debt' ? `${o.name} is up to their neck in gambling debts` : `${o.name} is in prison, you know`;
  startRumour(w, o, kind, text, -1, invent ? 7 : 6, !invent, c);
  if (chance(w, invent ? 0.3 : 0.1)) {
    note(w, o, c, 'grudge', 55, invent ? 'lies you spread about them' : 'the stories you told about them');
    for (const x of circlesOf(w, c).flatMap((k) => k.members).slice(0, 15)) adjustRel(x, c.id, invent ? -4 : -2);
    return ok(`🗣️ The story goes round, and it is traced back to you. ${first(o)} will not forget it, and people think less of you${invent ? ' for the lie' : ' for telling it'}.`);
  }
  return ok(`🗣️ A word here, a word there. "${text}." By next month half of ${first(o)}'s circle will have heard it.`);
}
