// A life, year by year. Stages of life, age gates for what people may do,
// milestones that make up a biography, birthdays, and the annual review the
// player gets on each one. There is one clock: people age as the world's time
// passes (Settings.lifeYearDays sets how many world days make a year of age).
import { BIZ } from './smallBusiness';
import { occupationLabel } from './labour';
import { SERVICES } from './services';
import type { AnnualReview, Citizen, LifeProfile, LifeState, Routine, World } from './types';
import { B } from '../data/balance';
import { fmtAmt } from '../engine/money';
import { nid, notify } from '../engine/events';
import { ageOf } from './growth';
import { player } from './query';
import { journal } from './story';

export const newLifeState = (): LifeState => ({ reviews: [], advance: null, snap: null, pregnancies: [], adoptions: [], orphans: [], pets: [] });

/** Fill in life state added after a save was made (saves made while this version was in development). */
export function normalizeLife(w: World) {
  const L = (w.life ??= newLifeState());
  L.pregnancies ??= []; L.adoptions ??= []; L.orphans ??= []; L.pets ??= []; L.reviews ??= [];
  for (const i of Object.values(w.story.instances)) i.who ??= w.playerId;
  for (const list of Object.values(w.story.memories)) for (const m of list) m.about ??= w.playerId;
}

// ---------- stages and gates ----------

export type Stage = 'infant' | 'child' | 'teen' | 'adult' | 'senior';
export const STAGE_INFO: Record<Stage, { label: string; icon: string; can: string }> = {
  infant: { label: 'Early childhood', icon: '🍼', can: 'growing, playing and bonding with family' },
  child: { label: 'Childhood', icon: '🎒', can: 'school, friends and first interests' },
  teen: { label: 'Adolescence', icon: '🎧', can: 'study, hobbies, friendships, a part-time job from 16' },
  adult: { label: 'Adulthood', icon: '🧑', can: 'work, vote, own businesses, marry, serve, run for office' },
  senior: { label: 'Later life', icon: '🧓', can: 'retirement if you wish, family, hobbies, estate planning' },
};

export function stageForAge(a: number): Stage {
  const s = B.life.stages;
  return a < s.child ? 'infant' : a < s.teen ? 'child' : a < s.adult ? 'teen' : a < s.senior ? 'adult' : 'senior';
}
export const lifeStage = (w: World, c: { born: number }): Stage => stageForAge(ageOf(w, c));

/** Alive and part of the world (the dead and emigrated stay on record for history). */
export const isLivingCitizen = (c: Citizen | null | undefined): c is Citizen => !!c && !c.gone;

/**
 * Age gate used by action validators (and therefore by AI and direct calls, not
 * only by hidden buttons). Returns why someone may not do `what`, or null.
 */
export function lifeGate(w: World, c: Citizen, min: number, what: string): string | null {
  if (c.gone) return `${c.name} is no longer living.`;
  const a = ageOf(w, c);
  if (a >= min) return null;
  return `${c.player ? 'You are' : `${c.name} is`} ${a}: ${what} is open from age ${min}.`;
}

// ---------- the personal profile ----------

/** A person's private life record (created on first use; values derived from the id, so no dice are rolled). */
export function lifeOf(c: Citizen): LifeProfile {
  return (c.life ??= {
    happiness: 62, stress: 25,
    aptitude: 35 + ((c.id * 37) % 45), confidence: 30 + ((c.id * 53) % 50),
    goals: [], milestones: [], hobbies: {},
  });
}

const CLOSE_CAP = 400, OTHER_CAP = 30;

/** Record a life event in someone's biography (durable; not the pruned journal). */
export function milestone(w: World, c: Citizen, kind: string, text: string) {
  const L = lifeOf(c);
  L.milestones.push({ t: w.time, age: ageOf(w, c), kind, text });
  const close = c.player || c.family?.partner === w.playerId || c.family?.parents.includes(w.playerId) || c.family?.children.includes(w.playerId);
  const cap = close ? CLOSE_CAP : OTHER_CAP;
  if (L.milestones.length > cap) L.milestones.splice(0, L.milestones.length - cap);
  if (c.player) journal(w, { title: 'Life', text, kind: 'fact' });
}

// ---------- routine ----------

export function routineOf(w: World): Routine {
  return (w.player.routine ??= { work: false, train: w.settings.autoTrain, family: false, rest: false, hobby: null, school: false });
}

/** Hours a routine takes out of a day, and what clashes. */
export function routineBudget(w: World, r: Routine) {
  const items: [string, number][] = [];
  if (r.work) items.push(['Work shift', 8]);
  if (r.school) items.push(['School / studies', 7]);
  if (r.train) items.push(['Training', 1]);
  if (r.family) items.push(['Family time', 2]);
  if (r.rest) items.push(['Rest', 1]);
  if (r.hobby) items.push(['Hobby', 2]);
  const hours = items.reduce((t, [, h]) => t + h, 0);
  const free = 24 - 8 /* sleep */ - 2 /* meals, errands */;
  const clashes: string[] = [];
  if (r.work && r.school) clashes.push('A full work shift and a full school day do not both fit: choose part-time study or part-time work.');
  if (hours > free) clashes.push(`${hours} hours planned, ${free} waking hours available: something will be skipped.`);
  return { items, hours, free, clashes };
}

// ---------- birthdays and the annual review ----------

const cash = (w: World, c: Citizen) => c.wallet[w.nations[c.nation].cur] ?? 0;

export function occupation(w: World, c: Citizen): string {
  if (c.gone) return c.gone.why === 'died' ? 'Deceased' : 'Emigrated';
  if (c.job != null && w.companies[c.job]) { const t = occupationLabel(w, c); return t ? `${t} at ${w.companies[c.job].name}` : w.companies[c.job].name; }
  if (c.post) return `${SERVICES[c.post.kind].ladder[c.post.grade]} (${w.regions[c.post.region].name})`;
  if (c.business) return `${BIZ[c.business.kind].title}, ${c.business.name}`;
  if (c.retired) return 'Retired';
  if (c.edu?.enrolled) return c.edu.enrolled.course === 'vocational' ? 'Student (college)' : 'Student (university)';
  const a = ageOf(w, c);
  if (a < B.life.stages.child) return 'At home';
  if (a < B.life.adultAge) return 'At school';
  if (c.mil?.branch && !c.mil.reserve) return occupationLabel(w, c) ?? 'In the forces';
  return c.benefit ? 'Unemployed (claiming benefit)' : 'Not working';
}

function snapshot(w: World, c: Citizen): LifeState['snap'] {
  const L = lifeOf(c);
  return {
    who: c.id, t: w.time, age: ageOf(w, c), cash: cash(w, c), cur: w.nations[c.nation].cur,
    job: occupation(w, c), status: c.family?.status ?? 'single', kids: (c.family?.kids.length ?? 0) + (c.family?.children.length ?? 0),
    health: Math.round(c.health ?? 90), happiness: Math.round(L.happiness),
  };
}

/** Called every tick: notices the player's birthday exactly when it comes. */
export function lifecycleTick(w: World) {
  const p = player(w);
  if (!p || p.gone) return;
  const L = lifeOf(p);
  const age = ageOf(w, p);
  if (L.lastAge == null || !w.life.snap || w.life.snap.who !== p.id) { L.lastAge = age; w.life.snap = snapshot(w, p); return; }
  if (age <= L.lastAge) return;
  for (let a = L.lastAge + 1; a <= age; a++) birthday(w, p, a);
  L.lastAge = age;
}

function birthday(w: World, p: Citizen, age: number) {
  const snap = w.life.snap!;
  const now = snapshot(w, p)!;
  const lines: AnnualReview['lines'] = [];
  const before = stageForAge(snap.age), after = stageForAge(age);
  if (before !== after) lines.push({ kind: 'stage', text: `${STAGE_INFO[after].icon} A new stage of life: ${STAGE_INFO[after].label.toLowerCase()} — ${STAGE_INFO[after].can}.` });
  if (age === B.life.adultAge) lines.push({ kind: 'stage', text: '🗳️ You are an adult: you can vote, work full time, sign contracts, own a business, serve and stand for office.' });
  if (snap.job !== now.job) lines.push({ kind: 'work', text: `💼 ${snap.job} → ${now.job}.` });
  if (snap.status !== now.status) lines.push({ kind: 'family', text: `💞 Relationship: ${snap.status} → ${now.status}.` });
  if (now.kids > snap.kids) lines.push({ kind: 'family', text: `👶 ${now.kids - snap.kids} new child${now.kids - snap.kids > 1 ? 'ren' : ''} in the family.` });
  const dh = now.health - snap.health, dj = now.happiness - snap.happiness;
  if (Math.abs(dh) >= 3) lines.push({ kind: 'health', text: `${dh > 0 ? '💪' : '🩺'} Health ${dh > 0 ? 'improved' : 'declined'}: ${snap.health} → ${now.health}.` });
  if (Math.abs(dj) >= 5) lines.push({ kind: 'mind', text: `${dj > 0 ? '🙂' : '😔'} Happiness ${dj > 0 ? 'rose' : 'fell'}: ${snap.happiness} → ${now.happiness}.` });
  for (const m of lifeOf(p).milestones) if (m.t > snap.t && m.kind !== 'birthday') lines.push({ kind: m.kind, text: m.text });
  const world = w.log.filter((e) => e.t > snap.t && e.important && (e.nation == null || e.nation === p.nation)).slice(-8).map((e) => e.text);
  const r: AnnualReview = { id: nid(w), who: p.id, age, from: snap.t, to: w.time, lines, world, money: { start: snap.cash, end: now.cash, cur: now.cur } };
  w.life.reviews.push(r);
  if (w.life.reviews.length > 150) w.life.reviews.splice(0, w.life.reviews.length - 150);
  lifeOf(p).milestones.push({ t: w.time, age, kind: 'birthday', text: `Turned ${age}.` });
  w.life.snap = now;
  const delta = now.cash - snap.cash;
  notify(w, 'life', `🎂 Happy birthday: you are ${age}! ${lines.length ? `${lines.length} things changed this year` : 'A quiet year'}; savings ${delta >= 0 ? '+' : '−'}${fmtAmt(now.cur, Math.abs(delta))}.`, { critical: true, link: 'life' });
}

/** The review to show now (the newest unseen one of the current player). */
export const pendingReview = (w: World) => [...w.life.reviews].reverse().find((r) => r.who === w.playerId && !r.seen) ?? null;

// ---------- pace of life ----------

/** Change the pace of life, keeping everyone's age as it is. */
export function setLifePace(w: World, days: number) {
  const old = (w.settings.lifeYearDays ?? 365);
  if (!Number.isFinite(days) || days < 12 || days > 365) return false;
  const k = days / old;
  for (const c of Object.values(w.citizens)) {
    c.born = Math.round(w.time - (w.time - c.born) * k);
    for (const kid of c.family?.kids ?? []) kid.born = Math.round(w.time - (w.time - kid.born) * k);
  }
  w.settings.lifeYearDays = days;
  if (w.life.snap) w.life.snap.t = w.time;
  return true;
}

