// Public services as careers: teachers at the schools, nurses and doctors at the
// clinic, civil servants at the offices and engineers on public works, paid a
// salary from the national treasury (with work tax, like any wage). Each post
// has a ladder of grades; promotions come with service, good work and the
// qualifications for the grade. Staffing feeds back into the service itself.
import { hasQuirk } from './nature';
import type { Citizen, Id, World } from './types';
import { B } from '../data/balance';
import { rank, type EduLevel, type Field } from '../data/education';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify } from '../engine/events';
import { chance, hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census, residents } from './census';
import { controller, cref, jailed, natref, player, today } from './query';
import { ageOf, practise } from './growth';
import { eduOfCitizen } from './education';
import { lifeGate, lifeOf, milestone } from './lifecycle';
import { workTaxFor, remitWorkTax } from './taxes';
import { quitJob } from './company';
import { leaveCheck } from './health';
import { contribute } from './pensions';
import { recordPay } from './wages';

export type Service = 'teacher' | 'nurse' | 'doctor' | 'clerk' | 'engineer' | 'prosecutor' | 'defender' | 'judge' | 'warden' | 'procurement' | 'emergency' | 'meteorology' | 'diplomat' | 'tradeneg' | 'intlcivil';
export interface Post { kind: Service; region: Id; grade: number; since: number; promoted: number; shifts: number; lastDay: number }

interface ServiceDef { label: string; icon: string; place: string; ladder: string[]; pay: number[]; needs: { level: EduLevel; field?: Field[] }[]; per: number; skill: 'lead' | 'end' | 'eco' | 'cons' | 'acc' }
/** Grades, pay (× a reference wage of 5 units a shift, about 60% of typical pay) and the qualification each grade needs. */
export const SERVICES: Record<Service, ServiceDef> = {
  teacher: { label: 'Teacher', icon: '🍎', place: 'school', per: 25, skill: 'lead',
    ladder: ['Teaching assistant', 'Teacher', 'Senior teacher', 'Head of department', 'Head teacher'], pay: [1.3, 1.8, 2.2, 2.7, 3.3],
    needs: [{ level: 'school' }, { level: 'bachelor' }, { level: 'bachelor' }, { level: 'master' }, { level: 'master' }] },
  nurse: { label: 'Nurse', icon: '🩹', place: 'clinic', per: 30, skill: 'end',
    ladder: ['Healthcare assistant', 'Nurse', 'Senior nurse', 'Ward manager', 'Director of nursing'], pay: [1.3, 1.7, 2.1, 2.6, 3.1],
    needs: [{ level: 'school' }, { level: 'vocational', field: ['medicine'] }, { level: 'bachelor', field: ['medicine'] }, { level: 'bachelor', field: ['medicine'] }, { level: 'master', field: ['medicine'] }] },
  doctor: { label: 'Doctor', icon: '🩺', place: 'clinic', per: 90, skill: 'acc',
    ladder: ['Junior doctor', 'Resident', 'Physician', 'Consultant', 'Chief of medicine'], pay: [2.4, 3.0, 3.8, 4.8, 6.0],
    needs: [{ level: 'master', field: ['medicine'] }, { level: 'master', field: ['medicine'] }, { level: 'master', field: ['medicine'] }, { level: 'doctorate', field: ['medicine'] }, { level: 'doctorate', field: ['medicine'] }] },
  clerk: { label: 'Civil servant', icon: '🗂️', place: 'offices', per: 35, skill: 'eco',
    ladder: ['Clerk', 'Administrative officer', 'Senior officer', 'Deputy director', 'Director'], pay: [1.2, 1.6, 2.1, 2.8, 3.6],
    needs: [{ level: 'school' }, { level: 'school' }, { level: 'bachelor' }, { level: 'bachelor', field: ['law', 'business'] }, { level: 'master', field: ['law', 'business'] }] },
  engineer: { label: 'Public engineer', icon: '🏗️', place: 'public works', per: 60, skill: 'cons',
    ladder: ['Technician', 'Engineer', 'Senior engineer', 'Chief engineer', 'City engineer'], pay: [1.5, 2.2, 2.8, 3.4, 4.2],
    needs: [{ level: 'vocational', field: ['engineering', 'trades'] }, { level: 'bachelor', field: ['engineering'] }, { level: 'bachelor', field: ['engineering'] }, { level: 'master', field: ['engineering'] }, { level: 'master', field: ['engineering'] }] },
  // The courts (1.7): prosecutors and public defenders argue cases, judges hear them.
  prosecutor: { label: 'Prosecutor', icon: '📜', place: 'prosecution service', per: 150, skill: 'acc',
    ladder: ['Trainee prosecutor', 'Prosecutor', 'Senior prosecutor', 'Deputy chief prosecutor', 'Chief prosecutor'], pay: [1.8, 2.4, 3.0, 3.8, 4.6],
    needs: [{ level: 'bachelor', field: ['law'] }, { level: 'bachelor', field: ['law'] }, { level: 'master', field: ['law'] }, { level: 'master', field: ['law'] }, { level: 'master', field: ['law'] }] },
  defender: { label: 'Public defender', icon: '🛡️', place: 'public defender service', per: 200, skill: 'lead',
    ladder: ['Legal aid trainee', 'Public defender', 'Senior defender', 'Head of chambers', 'Leading counsel'], pay: [1.6, 2.1, 2.7, 3.4, 4.2],
    needs: [{ level: 'bachelor', field: ['law'] }, { level: 'bachelor', field: ['law'] }, { level: 'master', field: ['law'] }, { level: 'master', field: ['law'] }, { level: 'master', field: ['law'] }] },
  judge: { label: 'Judge', icon: '⚖️', place: 'courts', per: 300, skill: 'cons',
    ladder: ['Magistrate', 'District judge', 'Circuit judge', 'Appeal judge', 'Chief justice'], pay: [3.0, 3.8, 4.6, 5.6, 7.0],
    needs: [{ level: 'bachelor', field: ['law'] }, { level: 'master', field: ['law'] }, { level: 'master', field: ['law'] }, { level: 'master', field: ['law'] }, { level: 'doctorate', field: ['law'] }] },
  // The prison service (1.7): staffing keeps prisons safe and decent.
  warden: { label: 'Prison officer', icon: '🔑', place: 'prison', per: 120, skill: 'end',
    ladder: ['Prison officer', 'Senior prison officer', 'Supervising officer', 'Deputy governor', 'Governor (warden)'], pay: [1.2, 1.5, 1.9, 2.6, 3.4],
    needs: [{ level: 'school' }, { level: 'school' }, { level: 'vocational' }, { level: 'bachelor' }, { level: 'bachelor' }] },
  // Defence procurement (1.8): buying equipment and running R&D programmes.
  procurement: { label: 'Defence procurement', icon: '📑', place: 'defence ministry', per: 250, skill: 'eco',
    ladder: ['Procurement officer', 'Senior procurement officer', 'Programme manager', 'Director of programmes', 'Chief of defence procurement'], pay: [1.6, 2.1, 2.8, 3.6, 4.6],
    needs: [{ level: 'bachelor', field: ['engineering', 'business'] }, { level: 'bachelor', field: ['engineering', 'business'] }, { level: 'master', field: ['engineering', 'business'] }, { level: 'master', field: ['engineering', 'business'] }, { level: 'master', field: ['engineering', 'business'] }] },
  // Emergency services and the weather service (1.9): staffing saves lives in disasters and sharpens forecasts.
  emergency: { label: 'Emergency services', icon: '🚒', place: 'fire and rescue service', per: 80, skill: 'end',
    ladder: ['Firefighter', 'Crew commander', 'Station officer', 'Emergency coordinator', 'Chief fire officer'], pay: [1.2, 1.5, 1.9, 2.5, 3.3],
    needs: [{ level: 'school' }, { level: 'school' }, { level: 'vocational' }, { level: 'bachelor' }, { level: 'bachelor' }] },
  meteorology: { label: 'Weather service', icon: '🌦️', place: 'meteorological office', per: 300, skill: 'acc',
    ladder: ['Weather observer', 'Forecaster', 'Meteorologist', 'Senior meteorologist', 'Chief meteorologist'], pay: [1.3, 1.8, 2.3, 2.9, 3.8],
    needs: [{ level: 'vocational' }, { level: 'bachelor', field: ['science'] }, { level: 'bachelor', field: ['science'] }, { level: 'master', field: ['science'] }, { level: 'master', field: ['science'] }] },
  // Foreign affairs (2.0): diplomats build the country's diplomatic capital; trade negotiators win better agreements
  // and WTO cases; the country's people in international organisations carry its voice at the UN.
  diplomat: { label: 'Foreign service', icon: '🌐', place: 'foreign ministry', per: 400, skill: 'lead',
    ladder: ['Attaché', 'Third secretary', 'First secretary', 'Counsellor', 'Ambassador'], pay: [1.6, 2.1, 2.8, 3.6, 4.8],
    needs: [{ level: 'bachelor' }, { level: 'bachelor' }, { level: 'master' }, { level: 'master' }, { level: 'master' }] },
  tradeneg: { label: 'Trade negotiator', icon: '📦', place: 'trade ministry', per: 600, skill: 'eco',
    ladder: ['Trade officer', 'Trade negotiator', 'Senior negotiator', 'Deputy chief negotiator', 'Chief trade negotiator'], pay: [1.6, 2.2, 2.9, 3.7, 4.7],
    needs: [{ level: 'bachelor', field: ['business', 'law'] }, { level: 'bachelor', field: ['business', 'law'] }, { level: 'master', field: ['business', 'law'] }, { level: 'master', field: ['business', 'law'] }, { level: 'master', field: ['business', 'law'] }] },
  intlcivil: { label: 'International civil service', icon: '🇺🇳', place: 'UN and international agencies', per: 800, skill: 'acc',
    ladder: ['Junior professional officer', 'Programme officer', 'Senior officer', 'Director', 'Under-secretary-general'], pay: [2.0, 2.6, 3.4, 4.4, 5.8],
    needs: [{ level: 'bachelor' }, { level: 'master' }, { level: 'master' }, { level: 'master' }, { level: 'doctorate' }] },
};
export const SERVICE_KEYS = Object.keys(SERVICES) as Service[];

export const postTitle = (p: Post) => SERVICES[p.kind].ladder[p.grade];
/** The highest grade someone's qualifications allow in a service (-1: none). */
export function maxGrade(c: Citizen, kind: Service): number {
  const e = eduOfCitizen(c);
  let g = -1;
  SERVICES[kind].needs.forEach((n, i) => { if (rank(e.level) >= rank(n.level) && (!n.field || (e.field && n.field.includes(e.field)))) g = i; });
  return g;
}
/** Posts in a region: one per `per` residents (about 13% of people work in these services, as in OECD countries); small places share a teacher, a nurse and a clerk. */
/** Courts sit in the larger places: the smallest number of residents for each court post. */
const COURT_MIN: Partial<Record<Service, number>> = { prosecutor: 30, defender: 30, judge: 30, warden: 30, procurement: 40, emergency: 20, meteorology: 40, diplomat: 50, tradeneg: 60, intlcivil: 60 };
export function postsIn(w: World, region: Id, kind: Service): number {
  const n = residents(w, region).length;
  const core = kind === 'teacher' || kind === 'nurse' || kind === 'clerk';
  const court = COURT_MIN[kind];
  if (court != null) return n >= court ? Math.max(1, Math.round(n / SERVICES[kind].per)) : 0;
  return Math.max(core && n >= 6 ? 1 : 0, Math.round(n / SERVICES[kind].per));
}
export const staffOf = (w: World, region: Id, kind: Service) => census(w).all.filter((c) => c.post?.kind === kind && c.post.region === region);
/** Salary per shift, in minor units. */
export const salary = (w: World, region: Id, kind: Service, grade: number) => Math.round(cur(B.wages.min) * SERVICES[kind].pay[grade]);

// ---------- joining, working, leaving ----------

export function postCheck(w: World, c: Citizen, kind: Service): string | null {
  const young = lifeGate(w, c, 18, 'A public post');
  if (young) return young;
  if (jailed(w, c)) return 'You are in prison.';
  if (c.post?.kind === kind && c.post.region === c.home) return `You already work as a ${postTitle(c.post).toLowerCase()}.`;
  if (kind === 'judge' && ageOf(w, c) < 30) return 'Judges are appointed from experienced lawyers (30 or older).';
  if (maxGrade(c, kind) < 0) { const n = SERVICES[kind].needs[0]; return `Needs a ${n.level === 'school' ? 'secondary school diploma' : `${n.level}${n.field ? ` in ${n.field.join(' or ')}` : ''}`}.`; }
  if (staffOf(w, c.home, kind).length >= postsIn(w, c.home, kind)) return `No vacancies for ${SERVICES[kind].label.toLowerCase()}s in ${w.regions[c.home].name} right now.`;
  return null;
}

/** Take a public post in one's home region (leaving any other job), at the grade one's qualifications fit (up to the second rung). */
export function takePost(w: World, kind: Service, c: Citizen = player(w)): Result {
  const why = postCheck(w, c, kind);
  if (why) return fail(why);
  if (c.job != null) quitJob(w, c, true);
  if (c.post) leavePost(w, c, 'moved to another post');
  const grade = Math.min(1, maxGrade(c, kind));
  c.post = { kind, region: c.home, grade, since: w.time, promoted: w.time, shifts: 0, lastDay: -1 };
  logWork(w, c, `${SERVICES[kind].ladder[grade]} (${SERVICES[kind].place})`, w.regions[c.home].name);
  const code = w.nations[controller(w.regions[c.home])].cur;
  return ok(`${SERVICES[kind].icon} You start as a ${SERVICES[kind].ladder[grade].toLowerCase()} in ${w.regions[c.home].name}, at ${fmtAmt(code, salary(w, c.home, kind, grade))} a shift.`);
}

export function leavePost(w: World, c: Citizen = player(w), why = 'resigned'): Result {
  if (!c.post) return fail('You do not hold a public post.');
  endWork(w, c, why);
  delete c.post;
  return ok('You left public service.');
}

export function serviceShiftCheck(w: World, c: Citizen): string | null {
  const p = c.post;
  if (!p) return 'You do not hold a public post.';
  if (jailed(w, c)) return 'You are in prison.';
  if (p.lastDay === today(w) || c.lastWorkDay === today(w)) return 'You already worked a shift today (one per day).';
  const off = leaveCheck(w, c);
  if (off) return off;
  if (c.loc !== p.region) return `Your post is in ${w.regions[p.region].name}.`;
  if (c.energy < B.cost.work) return `Not enough energy (${Math.floor(c.energy)}/${B.cost.work}).`;
  const n = w.nations[controller(w.regions[p.region])];
  if ((n.wallet[n.cur] ?? 0) < salary(w, p.region, p.kind, p.grade)) return `The ${n.name} treasury cannot pay salaries today.`;
  return null;
}

/** A shift of public service: the state pays the salary (minus work tax), skills grow, the service improves. */
export function serviceShift(w: World, c: Citizen = player(w)): Result {
  const why = serviceShiftCheck(w, c);
  if (why) return fail(why);
  const p = c.post!;
  const n = w.nations[controller(w.regions[p.region])];
  const gross = salary(w, p.region, p.kind, p.grade);
  c.energy -= B.cost.work;
  pay(w, natref(n.id), cref(c.id), n.cur, gross, `Salary: ${postTitle(p)}`);
  const t = workTaxFor(w, p.region, c, gross);
  remitWorkTax(w, cref(c.id), n.cur, t.parts);
  recordPay(w, c, `${n.name}: ${SERVICES[p.kind].place}`, n.cur, gross, t.tax, contribute(w, c, gross, n.cur));
  n.stats.spendToday += gross;
  c.incomeToday += gross - t.tax;
  p.shifts++;
  p.lastDay = c.lastWorkDay = today(w);
  practise(w, c, SERVICES[p.kind].skill, B.practice.work * (hasQuirk(c, 'workaholic') ? 1.2 : 1));
  return ok(`${SERVICES[p.kind].icon} A day's work as a ${postTitle(p).toLowerCase()}: ${fmtAmt(n.cur, gross - t.tax)} net (${fmtAmt(n.cur, t.tax)} tax).`);
}

// ---------- work history ----------

export interface WorkEntry { what: string; where: string; from: number; to?: number; why?: string }
export function logWork(w: World, c: Citizen, what: string, where: string) {
  const L = lifeOf(c);
  const h = (L.work ??= []);
  const open = h.find((x) => x.to == null);
  if (open) { open.to = w.time; open.why ??= 'moved on'; }
  h.push({ what, where, from: w.time });
  if (h.length > 20) h.splice(0, h.length - 20);
}
export function endWork(w: World, c: Citizen, why: string) {
  const open = c.life?.work?.find((x) => x.to == null);
  if (open) { open.to = w.time; open.why = why; }
}

// ---------- promotions and staffing ----------

/** Daily: promotions (a review about monthly), NPCs filling vacancies, and the effect of staffing. */
export function servicesDaily(w: World, fill = false) {
  const d = today(w);
  for (const c of census(w).all) {
    const p = c.post;
    if (!p) continue;
    if (c.retired || ageOf(w, c) >= B.life.retireAge + 3) { leavePost(w, c, 'retired'); continue; }
    if ((d + c.id) % 30 !== 0 || p.grade >= maxGrade(c, p.kind) || p.grade >= 4) continue;
    const need = 40 + p.grade * 60; // shifts at this grade before the next
    const since = p.shifts;
    const merit = (c.attrs[SERVICES[p.kind].skill] ?? 0) / 20 + c.traits.ambition;
    if (since >= need && chance(w, Math.min(0.9, 0.35 + merit * 0.2))) {
      p.grade++; p.promoted = w.time; p.shifts = 0;
      logWork(w, c, `${postTitle(p)} (${SERVICES[p.kind].place})`, w.regions[p.region].name);
      milestone(w, c, 'career', `promoted to ${postTitle(p).toLowerCase()}`);
      if (c.player) notify(w, 'economy', `⬆️ Promoted: you are now ${postTitle(p).toLowerCase()} in ${w.regions[p.region].name}.`, { critical: true, link: 'jobs' });
    }
  }
  // Vacancies are filled by qualified local people who are out of work (a stable hash, no churn).
  const staff = new Map<string, number>();
  for (const c of census(w).all) if (c.post) staff.set(`${c.post.region}:${c.post.kind}`, (staff.get(`${c.post.region}:${c.post.kind}`) ?? 0) + 1);
  for (const r of w.regions) {
    const ratio = (kinds: Service[]) => { let have = 0, want = 0; for (const k of kinds) { have += staff.get(`${r.id}:${k}`) ?? 0; want += postsIn(w, r.id, k); } return want ? Math.min(1, have / want) : 0.6; }; // nothing to staff: neutral
    r.staff = { school: ratio(['teacher']), clinic: ratio(['nurse', 'doctor']), offices: ratio(['clerk', 'engineer']), courts: ratio(['prosecutor', 'defender', 'judge']), prison: ratio(['warden']), emergency: ratio(['emergency']), meteorology: ratio(['meteorology']), diplomacy: ratio(['diplomat']), trade: ratio(['tradeneg']), intl: ratio(['intlcivil']) };
    for (const kind of SERVICE_KEYS) {
      const open = postsIn(w, r.id, kind) - (staff.get(`${r.id}:${kind}`) ?? 0);
      if (open < 0 && !fill) { // more staff than posts (people moved away, budgets): the newest NPC hire is let go
        const extra = residents(w, r.id).filter((c) => c.post?.kind === kind && c.post.region === r.id && !c.player).sort((a, b) => b.post!.since - a.post!.since)[0];
        if (extra) leavePost(w, extra, 'post cut');
        continue;
      }
      if (open <= 0 || (!fill && hash01(r.id, d, kind.length) > 0.3)) continue;
      const nat = w.nations[controller(r)];
      if (!fill && (nat.wallet[nat.cur] ?? 0) < salary(w, r.id, kind, 1) * 90) continue; // no hiring without three months of pay in the treasury
      const cand = residents(w, r.id).find((c) => !c.player && !c.gone && !c.post && !c.retired && (c.job == null || COURT_MIN[kind] != null) && !c.edu?.enrolled && ageOf(w, c) >= 18 && ageOf(w, c) < B.life.retireAge && !jailed(w, c) && maxGrade(c, kind) >= 0 && !c.unit && (kind !== 'judge' || ageOf(w, c) >= 30));
      if (cand) { takePost(w, kind, cand); if (fill) { cand.post!.grade = Math.min(maxGrade(cand, kind), Math.floor(hash01(cand.id, 11) * 4)); cand.post!.since = w.time - Math.floor(hash01(cand.id, 12) * 3000) * 1440; } }
    }
  }
}
/** Genesis and upgrades: public services start staffed from qualified local people. */
export const initServices = (w: World) => { for (let i = 0; i < 3; i++) servicesDaily(w, true); };

/** A nation's staffing of a service (0..1, averaged over the regions that have posts; 0.6 where none do). */
export function nationalStaffing(w: World, nation: Id, key: 'diplomacy' | 'trade' | 'intl' | 'emergency' | 'meteorology' | 'courts'): number {
  let t = 0, k = 0;
  for (const r of w.regions) if (r.owner === nation && r.staff?.[key] != null) { t += r.staff[key]!; k++; }
  return k ? t / k : 0.6;
}
