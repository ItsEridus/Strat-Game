// Mental health in depth (2.6 Life 2.0).
// - Depression, anxiety and burnout come and go. Who is at risk follows what is known: a
//   person's own vulnerability (temperament, family history), earlier episodes, stress,
//   loneliness, losing work, grief, poor health, prison and war at home; women are more often
//   depressed and anxious, the young more often anxious; burnout comes from long strain at work.
//   About one adult in twenty is depressed at any time and a similar share anxious (WHO).
// - Episodes change month by month: mild, moderate or severe. Medication (from a doctor),
//   therapy and the support of people close to you speed recovery and stop things getting
//   worse; untreated depression under heavy stress deepens. Each episode makes the next more
//   likely. Moderate depression left untreated, severe depression and burnout keep people off work.
// - Grief has a course: raw at first, easing over months, coming back on anniversaries; for
//   about one bereaved person in ten (more after losing a child) it does not ease (prolonged
//   grief), until therapy helps.
// - Care and stigma by country: how many of those who need care get it (WHO World Mental
//   Health surveys: about half in rich countries, under one in ten in India), how long the
//   public waiting list for talking therapy is and what private therapy costs, and how much
//   shame attaches to it (high in Korea, Japan, China, India, Russia and Saudi Arabia). Stigma
//   keeps people from seeking help (men most of all); access grows slowly with time and with
//   government mental-health programmes, and stigma fades.
import type { Citizen, Id, Nation, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify, record } from '../engine/events';
import { chance, hash01, next } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { citizensOf, cref, hhref, isOfficial, jailed, natref, player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { adjustRel } from './social';
import { hasQuirk } from './nature';
import { sexOf } from './looks';
import { CONDITIONS, clinicCheck, conditionsOf, treated, visitClinic, type CondKey, type Condition } from './health';
import { loansOf } from './loans';
import { dailyRevenue } from './publicFinance';
import { historyPace } from './strategic';
import { active } from './habits';

export const isMental = (k: CondKey) => k === 'depression' || k === 'anxiety' || k === 'burnout';
export const SEVERITY = ['', 'mild', 'moderate', 'severe'];
const MAX_SEV: Partial<Record<CondKey, number>> = { depression: 3, anxiety: 2, burnout: 2 };

// ---------- care and stigma by country ----------

/** 2025: share of those in need who get care, stigma (0–1), the public waiting list for talking
 * therapy in weeks (null: none to speak of) and its charge, and a private session (US dollars). */
interface Care { access: number; stigma: number; pubWeeks: number | null; pubPrice: number; priv: number }
const CARE_2025: Record<string, Care> = {
  USA: { access: 0.45, stigma: 0.3, pubWeeks: null, pubPrice: 0, priv: 140 },
  CAN: { access: 0.45, stigma: 0.25, pubWeeks: 26, pubPrice: 0, priv: 130 },
  GBR: { access: 0.5, stigma: 0.3, pubWeeks: 10, pubPrice: 0, priv: 70 },
  DEU: { access: 0.45, stigma: 0.35, pubWeeks: 20, pubPrice: 0, priv: 100 },
  AUS: { access: 0.5, stigma: 0.25, pubWeeks: 4, pubPrice: 40, priv: 160 },
  JPN: { access: 0.25, stigma: 0.65, pubWeeks: 5, pubPrice: 15, priv: 80 },
  KOR: { access: 0.2, stigma: 0.7, pubWeeks: 4, pubPrice: 15, priv: 70 },
  CHN: { access: 0.1, stigma: 0.7, pubWeeks: 6, pubPrice: 20, priv: 60 },
  IND: { access: 0.08, stigma: 0.7, pubWeeks: 12, pubPrice: 2, priv: 20 },
  RUS: { access: 0.15, stigma: 0.65, pubWeeks: 8, pubPrice: 0, priv: 40 },
  TUR: { access: 0.2, stigma: 0.6, pubWeeks: 8, pubPrice: 0, priv: 40 },
  SAU: { access: 0.2, stigma: 0.7, pubWeeks: 8, pubPrice: 0, priv: 80 },
  BRA: { access: 0.25, stigma: 0.4, pubWeeks: 10, pubPrice: 0, priv: 40 },
  MEX: { access: 0.15, stigma: 0.5, pubWeeks: 12, pubPrice: 2, priv: 35 },
  ARG: { access: 0.35, stigma: 0.3, pubWeeks: 4, pubPrice: 0, priv: 25 }, // more psychologists per head than anywhere
  ZAF: { access: 0.15, stigma: 0.5, pubWeeks: 16, pubPrice: 0, priv: 50 },
};
const DEFAULT_CARE: Care = { access: 0.25, stigma: 0.5, pubWeeks: 10, pubPrice: 0, priv: 40 };
const careData = (n: Nation) => CARE_2025[dataIso(n.iso)] ?? DEFAULT_CARE;

export interface NationMH { access: number; stigma: number; programme?: number }
/** A country's mental health care (access and stigma drift from their 2025 values). */
export const nationMH = (n: Nation): NationMH => (n.mh ??= { access: careData(n).access, stigma: careData(n).stigma });
export const stigmaLabel = (s: number) => (s >= 0.6 ? 'high' : s >= 0.4 ? 'moderate' : 'low');

// ---------- a person's mental health ----------

export type LossOf = 'partner' | 'child' | 'parent' | 'friend';
export interface Loss { id: Id; name: string; t: number; depth: number; who: LossOf; slow?: boolean }
export interface Therapy { route: 'public' | 'private'; start: number; last?: number; sessions: number; of: number; price: number; nation: Id }
export interface MentalHealth { episodes?: number; losses?: Loss[]; therapy?: Therapy; lastSession?: number; talked?: number; talkDay?: number }
const mhOf = (c: Citizen): MentalHealth => (c.mh ??= {});

export const mentalConditions = (c: Citizen) => conditionsOf(c).filter((x) => isMental(x.key));
/** Therapy is helping: a session in the last two months (what was learnt lasts a while). */
const inTherapy = (w: World, c: Citizen) => c.mh?.lastSession != null && w.time - c.mh.lastSession < 60 * DAY;

// ---------- grief over time ----------

const DEPTH: Record<LossOf, number> = { partner: 30, child: 35, parent: 16, friend: 8 };
export const LOSS_LABEL: Record<LossOf, string> = { partner: 'your partner', child: 'your child', parent: 'your parent', friend: 'a close friend' };

/** How much one loss still weighs (fades over months; returns for a few days on each anniversary). */
export function mourningOf(w: World, l: Loss): number {
  const age = w.time - l.t;
  const months = age / (30 * DAY);
  let g = l.depth * Math.exp(-months / (l.slow ? 20 : 5));
  const years = Math.floor(age / (365 * DAY));
  if (years >= 1 && years <= 10 && age - years * 365 * DAY < 5 * DAY) g += (l.depth * 0.3) / years;
  return g;
}
/** All the grief a person carries: losses of people (with their course) and recent sorrows (a pet, an inheritance). */
export function griefOf(w: World, c: Citizen): number {
  let g = c.life?.grief ?? 0;
  for (const l of c.mh?.losses ?? []) g += mourningOf(w, l);
  return Math.min(40, Math.round(g * 10) / 10);
}
export function griefStage(w: World, l: Loss): string {
  const months = (w.time - l.t) / (30 * DAY);
  const g = mourningOf(w, l);
  if (months < 1) return 'raw grief';
  if (l.slow && months >= 12 && g > 6) return 'grief that has not eased';
  if (g > 10) return 'mourning';
  if (g > 3) return 'easing';
  return 'remembered';
}

/** Someone has died: those who loved them begin to grieve. */
export function mourn(w: World, dead: Citizen) {
  const f = dead.family;
  const seen = new Set<Id>();
  const add = (id: Id | null | undefined, who: LossOf, closeness = 1) => {
    if (id == null || seen.has(id)) return;
    const m = w.citizens[id];
    if (!m || m.gone) return;
    seen.add(id);
    const mh = mhOf(m);
    const slow = hash01(m.id, dead.id, 2613) < (who === 'child' ? 0.2 : who === 'partner' ? 0.12 : 0.06);
    (mh.losses ??= []).push({ id: dead.id, name: dead.name, t: w.time, depth: Math.round(DEPTH[who] * closeness), who, slow });
    if (mh.losses.length > 6) mh.losses.shift();
  };
  add(f?.partner, 'partner');
  for (const id of f?.parents ?? []) add(id, 'child'); // the dead person's parents have lost a child
  for (const id of f?.children ?? []) add(id, 'parent');
  for (const [k, v] of Object.entries(dead.rel)) {
    if (v < 50) continue;
    const m = w.citizens[+k];
    if (m && (m.player || (m.rel[dead.id] ?? 0) >= 50)) add(m.id, 'friend', v >= 75 ? 1.5 : 1);
  }
}

// ---------- support ----------

/** The people someone could confide in, closest first: their partner, family, friends. */
export function confidants(w: World, c: Citizen): Citizen[] {
  const f = c.family;
  const ids = new Set<Id>([...(f?.partner != null ? [f.partner] : []), ...(f?.parents ?? []), ...(f?.children ?? [])]);
  const out: [Citizen, number][] = [];
  for (const id of ids) { const x = w.citizens[id]; if (x && !x.gone && (x.rel[c.id] ?? 0) >= 20 && ageOf(w, x) >= 14) out.push([x, (x.rel[c.id] ?? 0) + (id === f?.partner ? 40 : 20)]); }
  if (c.player) { for (const x of census(w).all) if (!x.gone && !ids.has(x.id) && (x.rel[c.id] ?? 0) >= 50) out.push([x, x.rel[c.id]]); }
  else for (const [k, v] of Object.entries(c.rel)) { const x = w.citizens[+k]; if (v >= 50 && x && !x.gone && !ids.has(x.id) && (x.rel[c.id] ?? 0) >= 40) out.push([x, v]); }
  return out.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([x]) => x);
}
/** Someone who is not alone with it: a partner who cares, a close friend, or a talk lately. */
function supported(w: World, c: Citizen): boolean {
  if (c.mh?.talked != null && w.time - c.mh.talked < 14 * DAY) return true;
  const partner = c.family?.partner != null ? w.citizens[c.family.partner] : null;
  if (partner && !partner.gone && (partner.rel[c.id] ?? 0) >= 30) return true;
  if (c.player) return census(w).all.some((x) => !x.gone && (x.rel[c.id] ?? 0) >= 50);
  for (const v of Object.values(c.rel)) if (v >= 50) return true;
  return false;
}

// ---------- onset and course ----------

const vulnerability = (c: Citizen, salt: number) => 0.4 + 1.6 * hash01(c.id, salt) ** 2; // temperament and family history

/** Yearly chances of each condition starting, from a person's life as it is. */
export function mentalRisks(w: World, c: Citizen, sup = supported(w, c)): Record<'depression' | 'anxiety' | 'burnout', number> {
  const stress = c.life?.stress ?? 25;
  const age = ageOf(w, c);
  const fem = sexOf(w, c) === 'f';
  const past = 1 + Math.min(2, (c.mh?.episodes ?? 0) * 0.5);
  const st = 1 + Math.max(0, stress - 25) / 15;
  const jobless = c.job == null && !c.post && !c.retired && !c.business && age < 66 && c.persona !== 'industrialist' && c.persona !== 'investor' && !c.edu?.enrolled;
  const grief = griefOf(w, c);
  const prison = jailed(w, c);
  const r = w.regions[c.home];
  const war = !!(r?.occ || (r?.disrupted ?? 0) > w.time);
  const arrears = loansOf(w, c).some((l) => l.missed > 0);
  const depression = 0.026 * vulnerability(c, 2611) * past * st * (fem ? 1.4 : 0.75) * (sup ? 1 : 1.5) * (jobless ? 1.6 : 1) * (grief > 8 ? 2 : 1) * ((c.health ?? 90) < 50 ? 1.5 : 1) * (prison ? 2 : 1) * (war ? 1.5 : 1);
  const anxiety = 0.026 * vulnerability(c, 2612) * past * st * (fem ? 1.5 : 0.75) * (hasQuirk(c, 'worrier') ? 2.5 : 1) * (age < 30 ? 1.3 : age > 60 ? 0.7 : 1) * (arrears ? 1.5 : 1) * (war ? 1.8 : 1) * (prison ? 1.5 : 1);
  const drink = active(c, 'drinking'), gamble = active(c, 'gambling');
  const habitsK = 1 + (drink >= 50 ? 0.6 : 0) + (gamble >= 50 ? 0.5 : 0) + (active(c, 'gaming') >= 50 ? 0.3 : 0); // addiction and depression feed each other
  const working = c.job != null || !!c.post || !!c.business;
  const burnout = working && !prison ? (0.015 + (Math.max(0, stress - 30) / 20) * 0.08) * (hasQuirk(c, 'workaholic') ? 2 : 1) * (isOfficial(w.nations[c.nation], c.id) ? 1.5 : 1) * vulnerability(c, 2614) : 0;
  return { depression: depression * habitsK, anxiety: anxiety * (gamble >= 50 ? 1.4 : 1), burnout };
}

function onset(w: World, c: Citizen, key: CondKey, sev: number) {
  const list = (c.conditions ??= []);
  if (list.some((x) => x.key === key)) return;
  const d = CONDITIONS[key];
  list.push({ key, since: w.time, sev, until: d.acute ? w.time + Math.round(d.acute[0] + (d.acute[1] - d.acute[0]) * next(w)) * DAY : undefined });
  if (c.player) notify(w, 'personal', `${d.icon} You are struggling with ${d.label.toLowerCase()} (${SEVERITY[sev]}). Talking to someone you trust, therapy or a doctor can help${key === 'burnout' ? '; you need time off work' : ''}.`, { critical: sev >= 2, link: 'life' });
}

function recover(w: World, c: Citizen, x: Condition) {
  c.conditions = (c.conditions ?? []).filter((y) => y !== x);
  const mh = mhOf(c);
  if (x.key !== 'burnout') mh.episodes = (mh.episodes ?? 0) + 1;
  if (c.player) notify(w, 'personal', `🌤️ The ${CONDITIONS[x.key].label.toLowerCase()} has lifted. ${x.key === 'depression' ? 'It can come back; looking after yourself and the people around you helps.' : 'You feel like yourself again.'}`, { link: 'life' });
}

/** How likely someone is to seek help this month: access to care, stigma, how bad it is; men seek help less. */
export function helpSeeking(w: World, c: Citizen, x: Condition): number {
  const m = nationMH(w.nations[c.nation]);
  return Math.min(0.6, m.access * (1 - 0.6 * m.stigma) * 0.5 * (x.sev >= 2 ? 1.3 : 0.7) * (sexOf(w, c) === 'f' ? 1.2 : 0.85));
}

/** A month in the mind: conditions begin, deepen or lift; people seek help (or do not). */
export function mentalHealthMonth(w: World) {
  for (const c of census(w).all) {
    if (c.gone || ageOf(w, c) < 14) continue;
    const sup = supported(w, c);
    const stress = c.life?.stress ?? 25;
    const hard = stress > 55;
    const talk = inTherapy(w, c);
    for (const x of mentalConditions(c)) {
      if (x.key === 'burnout') { // burnout heals with time off (and faster with help)
        if (talk && x.until) x.until -= 7 * DAY;
        if ((x.until ?? 0) <= w.time + 15 * DAY) recover(w, c, x); // (also in skipped months, when the daily check does not run)
        continue;
      }
      const meds = treated(w, x);
      // About half of episodes lift within six months; treatment and support shorten them.
      const better = 0.14 + (meds ? 0.12 : 0) + (talk ? 0.15 : 0) + (sup ? 0.05 : 0) - (hard ? 0.06 : 0);
      const worse = (meds || talk ? 0.015 : 0.05) * (hard ? 2 : 1) * (sup ? 0.7 : 1);
      const r = next(w);
      if (r < better) {
        x.sev--;
        if (x.sev <= 0) { recover(w, c, x); continue; }
        if (c.player) notify(w, 'personal', `${CONDITIONS[x.key].icon} The ${CONDITIONS[x.key].label.toLowerCase()} is easing: ${SEVERITY[x.sev]} now.`, { link: 'life' });
      } else if (r < better + worse && x.sev < (MAX_SEV[x.key] ?? 2)) {
        x.sev++;
        if (c.player) notify(w, 'personal', `${CONDITIONS[x.key].icon} The ${CONDITIONS[x.key].label.toLowerCase()} is getting worse: ${SEVERITY[x.sev]} now.${!meds && !talk ? ' A doctor or a therapist can help.' : ''}`, { critical: true, link: 'life' });
      }
      // Seeking help (the player decides for themselves).
      if (!c.player && !x.sought && chance(w, helpSeeking(w, c, x))) {
        x.sought = true;
        if (!c.mh?.therapy && chance(w, 0.5)) {
          const o = therapyOptions(w, c).find((y) => y.route === 'public') ?? therapyOptions(w, c)[0];
          if (o && (!o.price || (c.wallet[o.code] ?? 0) > o.price * 24)) startTherapy(w, c, o.route);
        }
      }
      // Those who sought help keep their prescriptions up (in skipped months too).
      if (!c.player && x.sought && !meds && !clinicCheck(w, c)) visitClinic(w, c);
    }
    // New conditions.
    const risk = mentalRisks(w, c, sup);
    for (const key of ['depression', 'anxiety', 'burnout'] as const) {
      if (!risk[key] || !chance(w, risk[key] / 12)) continue;
      const r = next(w);
      onset(w, c, key, key === 'burnout' ? 2 : key === 'anxiety' ? (r < 0.7 ? 1 : 2) : r < 0.5 ? 1 : r < 0.85 ? 2 : 3);
    }
    // Old losses that weigh nothing any more are let go (the oldest first).
    const mh = c.mh;
    if (mh?.losses?.length) mh.losses = mh.losses.filter((l) => w.time - l.t < 3 * 365 * DAY || mourningOf(w, l) > 0.5 || (l.who !== 'friend' && w.time - l.t < 30 * 365 * DAY));
  }
}

// ---------- therapy ----------

export interface TherapyOption { route: 'public' | 'private'; weeks: number; price: number; code: string; nation: Id }
/** Talking therapy where someone lives: the public waiting list (if there is one) or private sessions. */
export function therapyOptions(w: World, c: Citizen): TherapyOption[] {
  const n = w.nations[c.nation];
  const d = careData(n);
  const m = nationMH(n);
  const out: TherapyOption[] = [];
  if (d.pubWeeks != null) out.push({ route: 'public', weeks: Math.max(1, Math.round(d.pubWeeks * Math.min(1.5, d.access / Math.max(0.05, m.access)) * (m.programme != null ? 0.5 : 1))), price: Math.round(cur(d.pubPrice) / 10), code: n.cur, nation: n.id });
  out.push({ route: 'private', weeks: 1, price: Math.round(cur(d.priv) / 10), code: n.cur, nation: n.id });
  return out;
}
/** Struggling enough for therapy: a mental condition, grief, or heavy stress. */
export const needsCare = (w: World, c: Citizen) => mentalConditions(c).length > 0 || griefOf(w, c) >= 8 || (c.life?.stress ?? 0) >= 55;

export function therapyCheck(w: World, c: Citizen, route: 'public' | 'private'): string | null {
  if (c.gone) return 'No longer living.';
  if (jailed(w, c)) return 'In prison, the counsellor sees whoever they can.';
  if (c.mh?.therapy) return 'You are already in therapy.';
  const o = therapyOptions(w, c).find((x) => x.route === route);
  if (!o) return 'There is no public talking therapy to speak of here.';
  if (!needsCare(w, c)) return 'Therapy is for when you are struggling: low mood, anxiety, burnout, grief or heavy stress.';
  if (o.price && (c.wallet[o.code] ?? 0) < o.price * 2) return `A session costs ${fmtAmt(o.code, o.price)}.`;
  return null;
}
/** Begin a course of twelve weekly sessions (after the waiting list, for public therapy). */
export function startTherapy(w: World, c: Citizen = player(w), route: 'public' | 'private' = 'public'): Result {
  const why = therapyCheck(w, c, route);
  if (why) return fail(why);
  const o = therapyOptions(w, c).find((x) => x.route === route)!;
  mhOf(c).therapy = { route, start: w.time + (o.weeks - 1) * 7 * DAY, sessions: 0, of: 12, price: o.price, nation: o.nation };
  for (const x of mentalConditions(c)) x.sought = true;
  return ok(`🛋️ ${route === 'public' ? `On the waiting list for talking therapy: about ${o.weeks} week${o.weeks > 1 ? 's' : ''} until the first session` : 'Your first session is booked for this week'}. Twelve weekly sessions${o.price ? `, ${fmtAmt(o.code, o.price)} each` : ', free'}.`);
}
export function stopTherapy(w: World, c: Citizen = player(w)): Result {
  if (!c.mh?.therapy) return fail('You are not in therapy.');
  delete c.mh.therapy;
  return ok('You stop going to therapy.');
}
function endTherapy(w: World, c: Citizen, text: string) {
  delete mhOf(c).therapy;
  if (c.player) notify(w, 'personal', text, { link: 'life' });
}
/** Sessions that are due (weekly; several at once after a skipped month). */
function sessions(w: World, c: Citizen) {
  const t = c.mh?.therapy;
  if (!t || w.time < t.start) return;
  const due = Math.min(5, Math.floor((w.time - (t.last ?? t.start - 7 * DAY)) / (7 * DAY)));
  const n = w.nations[t.nation];
  if (!n) { delete c.mh!.therapy; return; }
  for (let k = 0; k < due; k++) {
    if (t.price && !pay(w, cref(c.id), t.route === 'public' ? natref(n.id) : hhref(n.id), n.cur, t.price, 'Therapy session')) { endTherapy(w, c, '🛋️ You could not afford to carry on with therapy.'); return; }
    if (t.route === 'public') { const cost = Math.round(cur(careData(n).priv) / 20); if ((n.wallet[n.cur] ?? 0) > cost * 500) pay(w, natref(n.id), hhref(n.id), n.cur, cost, 'Public talking therapy'); }
    t.last = (t.last ?? t.start - 7 * DAY) + 7 * DAY;
    t.sessions++;
    c.mh!.lastSession = w.time;
    const L = lifeOf(c);
    L.stress = Math.max(0, L.stress - 4);
    for (const l of c.mh!.losses ?? []) if (l.slow && chance(w, 0.08)) l.slow = false; // therapy helps grief that has not eased
    if (t.sessions === 1 && c.player) notify(w, 'personal', '🛋️ Your first therapy session. It is hard to begin, and a relief to have begun.', { link: 'life' });
    if (t.sessions >= t.of) { endTherapy(w, c, '🛋️ You finished a course of therapy. What you learnt stays with you.'); return; }
  }
}

// ---------- talking to someone ----------

const BRUSH_OFF = ['"Everyone has bad days. Pull yourself together."', '"You just need to keep busy."', '"Don\'t let people hear you talk like that."', '"It\'s all in your head."'];
export function talkCheck(w: World, c: Citizen): string | null {
  if (c.gone) return 'No longer living.';
  if (c.mh?.talkDay === dayOf(w.time)) return 'You already talked to someone today.';
  if (!confidants(w, c).length) return 'There is nobody close enough to confide in.';
  return null;
}
/** Confide in someone close. It usually helps; where stigma runs high, some people do not want to hear it. */
export function talkToSomeone(w: World, c: Citizen = player(w), who?: Id): Result {
  const why = talkCheck(w, c);
  if (why) return fail(why);
  const x = (who != null ? w.citizens[who] : null) ?? confidants(w, c)[0];
  const mh = mhOf(c);
  mh.talkDay = dayOf(w.time);
  const L = lifeOf(c);
  const st = nationMH(w.nations[c.nation]).stigma;
  if (x.id !== c.family?.partner && chance(w, st * 0.35)) {
    L.stress = Math.min(100, L.stress + 2);
    adjustRel(x, c.id, -1);
    return ok(`You try to tell ${x.name} how you have been feeling. They don't know what to say: ${BRUSH_OFF[Math.floor(hash01(c.id, x.id, dayOf(w.time)) * BRUSH_OFF.length)]} Talking about it is not easy here.`);
  }
  mh.talked = w.time;
  L.stress = Math.max(0, L.stress - 5);
  adjustRel(x, c.id, 2);
  adjustRel(c, x.id, 2);
  return ok(`💬 You talk to ${x.name} about how you have been feeling. It helps to say it out loud, and to be heard.`);
}

// ---------- the nation ----------

export function programmeCheck(w: World, n: Nation, c: Citizen = player(w)): string | null {
  if (n.president !== c.id) return 'Only the head of government can do this.';
  return null;
}
/** Start or end a national mental-health programme (about 0.4% of revenue: more therapists, shorter waits, campaigns against stigma). */
export function setProgramme(w: World, on: boolean, c: Citizen = player(w)): Result {
  const n = w.nations[c.nation];
  const why = programmeCheck(w, n, c);
  if (why) return fail(why);
  const m = nationMH(n);
  if (on === (m.programme != null)) return fail(on ? 'The programme is already running.' : 'There is no programme to end.');
  if (on) m.programme = w.time; else delete m.programme;
  record(w, 'politics', on ? `🧠 ${n.name} launched a national mental-health programme: more therapists, shorter waiting lists and a campaign against stigma.` : `🧠 ${n.name} ended its mental-health programme.`, { nation: n.id });
  return ok(on ? '🧠 The programme begins: talking-therapy waiting lists halve, and access grows and stigma fades faster each year.' : 'The programme is wound down.');
}
const programmeCost = (n: Nation) => Math.round(dailyRevenue(n) * 30 * 0.004);

function nationsMonth(w: World) {
  const yearly = dateAt(w.time).month === 0;
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const m = nationMH(n);
    if (m.programme != null) {
      const cost = programmeCost(n);
      if (cost > 0 && !pay(w, natref(n.id), hhref(n.id), n.cur, cost, 'Mental health programme')) {
        delete m.programme;
        record(w, 'politics', `🧠 ${n.name} could no longer pay for its mental-health programme.`, { nation: n.id });
      }
    }
    if (!yearly) continue;
    const prog = m.programme != null;
    m.access = Math.round(Math.min(0.8, m.access + 0.004 + (prog ? 0.015 : 0)) * 1000) / 1000;
    m.stigma = Math.round(Math.max(0.05, m.stigma - 0.005 - (prog ? 0.012 : 0)) * 1000) / 1000;
    if (n.president === pl.id) continue;
    // Governments of the left, and any facing a visible crisis, start programmes; austerity ends them.
    const pres = n.president != null ? w.citizens[n.president] : null;
    const ideo = pres?.party != null ? w.parties[pres.party]?.ideo : undefined;
    if (!prog && chance(w, 0.025 + (ideo === 'socialism' ? 0.04 : 0) + (m.stigma < 0.4 ? 0.02 : 0))) {
      m.programme = w.time;
      record(w, 'politics', `🧠 ${n.name} launched a national mental-health programme: more therapists, shorter waiting lists and a campaign against stigma.`, { nation: n.id });
      if (pl.nation === n.id) notify(w, 'politics', `🧠 The government launched a mental-health programme: shorter waits for talking therapy.`);
    } else if (prog && w.time - m.programme! > 5 * 365 * DAY && chance(w, (ideo === 'capitalism' ? 0.08 : 0.03) + ((n.credit?.score ?? 60) < 40 ? 0.1 : 0))) {
      delete m.programme;
      record(w, 'politics', `🧠 ${n.name} wound down its mental-health programme.`, { nation: n.id });
    }
  }
}

/** The state of a country's mental health, from its people (adults). */
export function mentalHealthStats(w: World, nid: Id) {
  let adults = 0, dep = 0, anx = 0, burn = 0, workers = 0, ill = 0, care = 0, therapy = 0, grieving = 0;
  for (const c of citizensOf(w, nid)) {
    if (c.gone || ageOf(w, c) < 18) continue;
    adults++;
    if (c.job != null || c.post || c.business) workers++;
    const ms = mentalConditions(c);
    if (ms.some((x) => x.key === 'depression')) dep++;
    if (ms.some((x) => x.key === 'anxiety')) anx++;
    if (ms.some((x) => x.key === 'burnout')) burn++;
    if (ms.length) { ill++; if (ms.some((x) => x.sought || treated(w, x)) || inTherapy(w, c)) care++; }
    if (c.mh?.therapy) therapy++;
    if (griefOf(w, c) > 5) grieving++;
  }
  const d = Math.max(1, adults);
  return { adults, depression: dep / d, anxiety: anx / d, burnout: burn / Math.max(1, workers), ill: ill / d, treated: ill ? care / ill : 0, therapy, grieving: grieving / d };
}

/** The world as it stands at the start: people already ill (about as many as the risks sustain),
 * some of them in care, and some with episodes behind them. */
function seed(w: World) {
  w.mhSeeded = true;
  for (const c of census(w).all) {
    if (c.gone || c.player || ageOf(w, c) < 14) continue;
    if (hash01(c.id, 2615) < 0.1 * vulnerability(c, 2611)) mhOf(c).episodes = 1;
    const risk = mentalRisks(w, c);
    for (const key of ['depression', 'anxiety'] as const) {
      if (!chance(w, risk[key] * 0.9)) continue;
      const r = next(w);
      const x: Condition = { key, since: w.time - Math.round(next(w) * 300) * DAY, sev: key === 'anxiety' ? (r < 0.7 ? 1 : 2) : r < 0.5 ? 1 : r < 0.85 ? 2 : 3 };
      if (chance(w, 1 - (1 - helpSeeking(w, c, x)) ** 4)) { x.sought = true; x.treatedUntil = w.time + Math.round(next(w) * 30) * DAY; }
      (c.conditions ??= []).push(x);
    }
  }
}

/** Daily: therapy sessions; on the first of the month, the month in the mind and the national turn. */
export function mentalHealthDaily(w: World) {
  if (!w.mhSeeded) seed(w);
  for (const c of census(w).all) if (c.mh?.therapy) sessions(w, c);
  if (dateAt(w.time).day === 1) {
    mentalHealthMonth(w);
    for (let k = 0; k < historyPace(w); k++) nationsMonth(w);
  }
}
