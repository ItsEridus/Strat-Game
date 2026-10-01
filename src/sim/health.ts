// Health conditions, treatment and leave. People catch the flu, hurt their
// backs, get injured at work or in battle, and with age develop chronic
// illnesses; stress can turn into depression. A clinic visit (priced by each
// country's health system) treats them: acute illnesses heal faster, chronic
// ones are kept in check while the prescription lasts. The badly ill go on
// sick leave (paid by the employer or the state), and new parents can take
// parental leave on their country's terms.
import type { Citizen, Id, World } from './types';
import { DAY } from '../engine/clock';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify } from '../engine/events';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { controller, cref, coref, hhref, jailed, natref, player, today } from './query';
import { ageOf } from './growth';
import { lifeOf, milestone } from './lifecycle';
import { schoolQuality } from './education';
import { INDUSTRY_INFO } from '../data/items';
import { activeCrises } from './dynamics';

export type CondKey = 'flu' | 'injury' | 'back' | 'depression' | 'diabetes' | 'heart' | 'cancer' | 'wound';
export interface Condition { key: CondKey; since: number; until?: number; treatedUntil?: number; sev: number }
export interface Leave { kind: 'sick' | 'parental'; from: number; until: number }

interface CondDef { label: string; icon: string; sev: number; acute?: [number, number]; chronic?: boolean; work?: boolean }
export const CONDITIONS: Record<CondKey, CondDef> = {
  flu: { label: 'Flu', icon: '🤒', sev: 1, acute: [4, 10] },
  injury: { label: 'Work injury', icon: '🩼', sev: 2, acute: [10, 30], work: true },
  back: { label: 'Back pain', icon: '🦴', sev: 1, acute: [20, 60] },
  depression: { label: 'Depression', icon: '🌧️', sev: 2, chronic: true },
  diabetes: { label: 'Diabetes', icon: '🩸', sev: 1, chronic: true },
  heart: { label: 'Heart disease', icon: '🫀', sev: 2, chronic: true },
  cancer: { label: 'Cancer', icon: '🎗️', sev: 3, chronic: true },
  wound: { label: 'Battle wound', icon: '🩹', sev: 2, acute: [15, 45], work: true },
};

/** Health systems (2025, simplified): what a clinic visit costs the patient, and who is paid. Parental leave: weeks and pay rate. */
export const SYSTEMS: Record<string, { visit: number; publicShare: number; leaveWeeks: number; leavePay: number }> = {
  USA: { visit: 120, publicShare: 0.3, leaveWeeks: 12, leavePay: 0 },
  CAN: { visit: 0, publicShare: 1, leaveWeeks: 52, leavePay: 0.55 },
  MEX: { visit: 15, publicShare: 0.6, leaveWeeks: 12, leavePay: 1 },
  BRA: { visit: 0, publicShare: 1, leaveWeeks: 17, leavePay: 1 },
  ARG: { visit: 0, publicShare: 1, leaveWeeks: 13, leavePay: 1 },
  GBR: { visit: 0, publicShare: 1, leaveWeeks: 39, leavePay: 0.3 },
  DEU: { visit: 5, publicShare: 1, leaveWeeks: 52, leavePay: 0.65 },
  RUS: { visit: 0, publicShare: 1, leaveWeeks: 70, leavePay: 0.4 },
  TUR: { visit: 5, publicShare: 1, leaveWeeks: 16, leavePay: 0.66 },
  SAU: { visit: 0, publicShare: 1, leaveWeeks: 12, leavePay: 1 },
  ZAF: { visit: 25, publicShare: 0.5, leaveWeeks: 17, leavePay: 0.6 },
  IND: { visit: 10, publicShare: 0.4, leaveWeeks: 26, leavePay: 1 },
  CHN: { visit: 15, publicShare: 0.7, leaveWeeks: 14, leavePay: 1 },
  JPN: { visit: 20, publicShare: 1, leaveWeeks: 52, leavePay: 0.67 },
  KOR: { visit: 15, publicShare: 1, leaveWeeks: 52, leavePay: 0.8 },
  AUS: { visit: 10, publicShare: 1, leaveWeeks: 22, leavePay: 0.6 },
};
const sys = (w: World, nation: Id) => SYSTEMS[w.nations[nation].iso] ?? { visit: 20, publicShare: 0.8, leaveWeeks: 16, leavePay: 0.6 };

export const conditionsOf = (c: Citizen) => (c.conditions ?? []).filter((x) => x);
export const treated = (w: World, x: Condition) => (x.treatedUntil ?? -1) > w.time;
/** How much ill health conditions take off the health a person drifts toward. */
export const conditionToll = (w: World, c: Citizen) => conditionsOf(c).reduce((t, x) => t + x.sev * (treated(w, x) ? 2 : 6), 0);
/** Too ill to work: a serious acute condition, untreated cancer, or bad depression. */
export const tooIll = (w: World, c: Citizen) => conditionsOf(c).some((x) => x.sev >= 3 || (x.sev >= 2 && !treated(w, x) && (CONDITIONS[x.key].acute || x.key === 'depression')));
/** Why someone cannot work today (sick or on leave), or null. */
export function leaveCheck(w: World, c: Citizen): string | null {
  if (c.leave && c.leave.until > w.time) return c.leave.kind === 'parental' ? 'You are on parental leave.' : 'You are on sick leave.';
  if (tooIll(w, c)) return 'You are too ill to work. See a doctor.';
  return null;
}

// ---------- onset ----------

function catchCondition(w: World, c: Citizen, key: CondKey) {
  const list = (c.conditions ??= []);
  if (list.some((x) => x.key === key)) return;
  const d = CONDITIONS[key];
  const h = hash01(c.id, today(w), key.length);
  list.push({ key, since: w.time, sev: d.sev, until: d.acute ? w.time + Math.round(d.acute[0] + (d.acute[1] - d.acute[0]) * h) * DAY : undefined });
  if (c.player) notify(w, 'personal', `${d.icon} You have ${d.label.toLowerCase()}${d.chronic ? ' (a long-term condition)' : ''}. A clinic visit helps${tooIll(w, c) ? '; you are too ill to work for now' : ''}.`, { critical: d.sev >= 2, link: 'life' });
}
/** A battle wound (called from war damage for those who fight). */
export const wound = (w: World, c: Citizen) => catchCondition(w, c, 'wound');

/** Yearly chances (calendar for acute illnesses; on the pace of life for age-related ones). */
function onsetRates(w: World, c: Citizen, epidemic: boolean): [CondKey, number][] {
  const age = ageOf(w, c);
  const stress = c.life?.stress ?? 25;
  const manual = c.persona === 'soldier' || c.persona === 'builder' || (c.job != null && !!w.companies[c.job] && INDUSTRY_INFO[w.companies[c.job].industry]?.raw);
  const life = 365 / (w.settings.lifeYearDays ?? 365);
  return [
    ['flu', (epidemic ? 1.5 : 0.25) / 365],
    ['injury', (manual ? 0.06 : 0.01) / 365],
    ['back', (age > 35 ? 0.03 : 0.01) / 365],
    ['depression', (stress > 70 ? 0.25 : stress > 55 ? 0.05 : 0.01) / 365],
    ['diabetes', (age > 40 ? 0.006 : 0.001) * life / 365],
    ['heart', (age > 50 ? 0.003 * (age - 45) / 5 : 0) * life / 365],
    ['cancer', (age > 50 ? 0.002 * (age - 40) / 10 : 0.0002) * life / 365],
  ];
}

// ---------- treatment ----------

export function visitCost(w: World, c: Citizen): { total: number; patient: number; code: string; nation: Id } {
  const nation = controller(w.regions[c.loc]);
  const s = sys(w, nation);
  const total = cur(Math.max(30, s.visit * 2));
  return { total, patient: cur(s.visit), code: w.nations[nation].cur, nation };
}
export function clinicCheck(w: World, c: Citizen): string | null {
  if (jailed(w, c)) return 'The prison doctor sees inmates on Mondays.';
  if (!conditionsOf(c).length) return 'You are not ill.';
  if (conditionsOf(c).every((x) => treated(w, x) && (x.treatedUntil ?? 0) - w.time > 7 * DAY)) return 'Your treatment is up to date.';
  const v = visitCost(w, c);
  if ((c.wallet[v.code] ?? 0) < v.patient) return `The visit costs ${fmtAmt(v.code, v.patient)}.`;
  return null;
}
/** See a doctor: everything you have is treated (acute illnesses heal faster; prescriptions for 30 days). */
export function visitClinic(w: World, c: Citizen = player(w)): Result {
  const why = clinicCheck(w, c);
  if (why) return fail(why);
  const v = visitCost(w, c);
  const n = w.nations[v.nation];
  if (v.patient) pay(w, cref(c.id), sys(w, v.nation).publicShare >= 1 ? natref(v.nation) : hhref(v.nation), v.code, v.patient, 'Clinic visit');
  const publicPart = Math.round((v.total - v.patient) * sys(w, v.nation).publicShare);
  if (publicPart > 0 && (n.wallet[n.cur] ?? 0) > publicPart * 10) pay(w, natref(v.nation), hhref(v.nation), n.cur, publicPart, 'Public health care');
  const q = (schoolQuality(w, w.regions[c.loc]) + (w.regions[c.loc].staff?.clinic ?? 0.6) * 100) / 200; // care quality 0..1
  const notes: string[] = [];
  for (const x of conditionsOf(c)) {
    x.treatedUntil = w.time + 30 * DAY;
    if (x.until) x.until = w.time + Math.round((x.until - w.time) * (0.6 - q * 0.2));
    if (x.key === 'cancer' && hash01(c.id, today(w), 99) < 0.08 + q * 0.12) { x.until = w.time + 30 * DAY; notes.push('the cancer is responding to treatment'); }
    if (x.key === 'depression' && (c.life?.stress ?? 0) < 50 && hash01(c.id, today(w), 98) < 0.3) { x.until = w.time + 14 * DAY; notes.push('the depression is lifting'); }
  }
  return ok(`🏥 Seen at the clinic${v.patient ? ` (${fmtAmt(v.code, v.patient)})` : ' (free at the point of use)'}: ${conditionsOf(c).map((x) => CONDITIONS[x.key].label.toLowerCase()).join(', ')} treated${notes.length ? `; ${notes.join('; ')}` : ''}.`);
}

// ---------- leave ----------

export function parentalCheck(w: World, c: Citizen): string | null {
  if (c.leave && c.leave.until > w.time) return 'You are already on leave.';
  const baby = (c.family?.kids ?? []).some((k) => w.time - k.born < 365 * DAY);
  if (!baby) return 'Parental leave is for parents of a child under one.';
  if (c.job == null && !c.post) return 'Parental leave is for people in work.';
  if (lifeOf(c).parentalTaken && w.time - lifeOf(c).parentalTaken! < 365 * DAY) return 'You have taken your parental leave for this child.';
  return null;
}
/** Take parental leave on your country's terms (the state pays the leave allowance). */
export function takeParentalLeave(w: World, c: Citizen = player(w)): Result {
  const why = parentalCheck(w, c);
  if (why) return fail(why);
  const s = sys(w, c.nation);
  c.leave = { kind: 'parental', from: w.time, until: w.time + s.leaveWeeks * 7 * DAY };
  lifeOf(c).parentalTaken = w.time;
  milestone(w, c, 'family', 'took parental leave');
  return ok(`👶 ${s.leaveWeeks} weeks of parental leave${s.leavePay ? ` at ${Math.round(s.leavePay * 100)}% of your pay, from the state` : ' (unpaid in your country)'}. Your job is kept for you.`);
}
export function endLeave(w: World, c: Citizen = player(w)): Result {
  if (!c.leave || c.leave.until <= w.time) return fail('You are not on leave.');
  c.leave.until = w.time;
  return ok('Back to work.');
}

/** The pay someone's job gives for a day (minor units). */
function dayPay(w: World, c: Citizen): number {
  if (c.job != null && w.companies[c.job]) return w.companies[c.job].offer?.wage ?? 0;
  if (c.post) return Math.round(w.nations[controller(w.regions[c.post.region])].minWage * 1.8);
  return 0;
}

// ---------- daily ----------

/** Daily: illnesses start and end, sick pay and leave pay, NPCs see a doctor. */
export function healthDaily(w: World) {
  const d = today(w);
  const epi = new Set(activeCrises(w).filter((k) => k.kind === 'epidemic').flatMap((k) => k.regions));
  for (const c of census(w).all) {
    // Recoveries.
    if (c.conditions?.length) c.conditions = c.conditions.filter((x) => {
      if (x.until && x.until <= w.time) { if (c.player) notify(w, 'personal', `${CONDITIONS[x.key].icon} You have recovered from ${CONDITIONS[x.key].label.toLowerCase()}.`, { link: 'life' }); return false; }
      return true;
    });
    // New conditions.
    for (const [key, p] of onsetRates(w, c, epi.has(c.home))) if (hash01(c.id, d, 500 + key.length * 7 + key.charCodeAt(0)) < p) catchCondition(w, c, key);
    // Sick leave: the badly ill are off work; employers (or the state) pay sick pay for up to four weeks.
    const ill = tooIll(w, c);
    if (ill && (!c.leave || c.leave.until <= w.time) && (c.job != null || c.post)) c.leave = { kind: 'sick', from: w.time, until: w.time + DAY };
    else if (ill && c.leave?.kind === 'sick') c.leave.until = w.time + DAY;
    if (c.leave && c.leave.until > w.time) {
      const wage = dayPay(w, c);
      const n = w.nations[c.nation];
      if (c.leave.kind === 'sick' && w.time - c.leave.from < 28 * DAY && wage) {
        const sick = Math.round(wage * 0.6);
        if (c.job != null && w.companies[c.job]) pay(w, coref(c.job), cref(c.id), n.cur, sick, 'Sick pay');
        else pay(w, natref(c.nation), cref(c.id), n.cur, sick, 'Sick pay');
      }
      if (c.leave.kind === 'parental' && wage) {
        const amt = Math.round(wage * sys(w, c.nation).leavePay);
        if (amt && pay(w, natref(c.nation), cref(c.id), n.cur, amt, 'Parental leave pay')) n.stats.spendToday += amt;
        lifeOf(c).happiness = Math.min(100, lifeOf(c).happiness + 0.3);
      }
    }
    // NPCs see a doctor when they need to and can afford it.
    if (!c.player && c.conditions?.some((x) => !treated(w, x)) && hash01(c.id, d, 501) < 0.3 && !clinicCheck(w, c)) visitClinic(w, c);
  }
}
