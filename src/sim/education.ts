// Education: schools in every region and universities in the larger ones,
// funded from national revenue through the ledger (teachers' pay goes to the
// households); an education ladder from secondary school to a doctorate; and
// courses taken by studying, day by day, like any other skill.
import { hasQuirk } from './nature';
import { addHeirloom } from './legacy';
import { fmtDate } from '../engine/calendar';
const fmtDateL = (t: number) => fmtDate(t, 'long');
import type { Citizen, Id, Region, World } from './types';
import { B } from '../data/balance';
import { COURSES, FIELDS, LEVEL_LABEL, eduOf, rank, type Course, type EduLevel, type Field } from '../data/education';
import { DAY } from '../engine/clock';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify } from '../engine/events';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { controller, cref, hhref, jailed, natref, player, today } from './query';
import { ageOf, lifeYear, practise } from './growth';
import { lifeOf, milestone } from './lifecycle';
import { nationPerm } from './authority';
import { RANKS } from '../data/military';
import { borrow, loanCheck } from './loans';

export interface Education {
  level: EduLevel;
  field?: Field; // of the highest qualification
  enrolled?: { course: Course; field: Field; region: Id; since: number; days: number; need: number; lastDay: number; paidYears: number; loan?: boolean };
}

export const eduOfCitizen = (c: Citizen): Education => (c.edu ??= { level: 'school' });
export const levelLabel = (c: Citizen) => LEVEL_LABEL[eduOfCitizen(c).level] + (c.edu?.field && rank(c.edu.level) >= 2 ? ` (${FIELDS[c.edu.field].label.toLowerCase()})` : '');

// ---------- institutions ----------

/** A university town: the capital, or one of the larger regions of its country. */
export function hasUniversity(w: World, r: Region): boolean {
  const nat = controller(r);
  if (w.nations[nat]?.capital === r.id || w.nations[r.owner]?.capital === r.id) return true;
  const pops = w.regions.filter((x) => controller(x) === nat).map((x) => x.pop0 ?? x.pop).sort((a, b) => b - a);
  const cut = pops[Math.floor(pops.length * 0.4)] ?? 0;
  return (r.pop0 ?? r.pop) >= cut;
}

/** Quality of a region's schools and university, 0–100: national funding, plus local development. */
export function schoolQuality(w: World, r: Region): number {
  const n = w.nations[controller(r)];
  return Math.max(10, Math.min(100, Math.round((n.eduQ ?? 60) + (w.govs[r.id]?.dev ?? 0) * 3 + ((r.staff?.school ?? 0.6) - 0.6) * 25 - (r.occ ? 15 : 0))));
}

const feeFor = (w: World, c: Citizen, nation: Id, course: Course) => (course === 'bachelor' && c.life?.scholarship && rank(c.edu?.level ?? 'school') < rank('bachelor') ? 0 : tuitionYear(w, nation, course));
const tuitionYear = (w: World, nation: Id, course: Course) => cur(Math.round(eduOf(w.nations[nation].iso).tuition * COURSES[course].tuition));
/** Study days a course needs: about 180 a year of study, on the pace of life. */
export const courseDays = (w: World, course: Course) => Math.max(10, Math.round(COURSES[course].years * 180 * (lifeYear(w) / (365 * DAY))));

// ---------- enrolling and studying ----------

export function enrollCheck(w: World, c: Citizen, course: Course, field: Field, loan = false): string | null {
  const k = COURSES[course];
  if (!k || !FIELDS[field]) return 'Unknown course.';
  if (jailed(w, c)) return 'You are in prison.';
  if (ageOf(w, c) < 17) return 'Tertiary courses start at 17.';
  const e = eduOfCitizen(c);
  if (e.enrolled) return `You are already studying for a ${COURSES[e.enrolled.course].label.toLowerCase()}.`;
  if (rank(e.level) < rank(k.needs)) return `Needs a ${LEVEL_LABEL[k.needs].toLowerCase()} first.`;
  if (course === 'academy' || course === 'ocs') {
    if (commissioned(c)) return 'You already hold a commission.';
    if (course === 'academy' && ageOf(w, c) > 24) return 'Cadets enter the military academy by 24; graduates can take officer training instead.';
    if (ageOf(w, c) > B.forces.maxEnlistAge) return `Officer candidates must be ${B.forces.maxEnlistAge} or younger.`;
    if (c.sec.record.convictions > 0) return 'Officer candidates need a clean record.';
  } else if (rank(e.level) >= rank(course) && e.field === field) return 'You already hold this qualification.';
  const r = w.regions[courseRegion(w, c, course)];
  if (k.uni && !hasUniversity(w, r)) return `There is no university in ${r.name}; move to a larger city.`;
  const nat = controller(r);
  const fee = feeFor(w, c, nat, course);
  const code = w.nations[nat].cur;
  if (loan && fee > 0) return loanCheck(w, c, 'student', fee);
  if ((c.wallet[code] ?? 0) < fee) return `The first year's fees are ${fmtAmt(code, fee)}. A student loan can cover them.`;
  return null;
}

/** Enrol at the local college or university: the first year's fees go to the state. */
export function enroll(w: World, course: Course, field: Field, c: Citizen = player(w), loan = false): Result {
  const why = enrollCheck(w, c, course, field, loan);
  if (why) return fail(why);
  const r = w.regions[courseRegion(w, c, course)];
  const nat = controller(r);
  const fee = feeFor(w, c, nat, course);
  if (fee > 0 && loan) borrow(w, c, 'student', fee, `${COURSES[course].label}, year 1`);
  if (fee > 0) pay(w, cref(c.id), natref(nat), w.nations[nat].cur, fee, `Tuition: ${COURSES[course].label}`);
  eduOfCitizen(c).enrolled = { course, field, region: r.id, since: w.time, days: 0, need: courseDays(w, course), lastDay: -1, paidYears: 1, loan };
  if (c.player) { routineOfPlayer(w).school = true; }
  return ok(`${COURSES[course].icon} Enrolled: ${COURSES[course].label} in ${FIELDS[field].label.toLowerCase()} at ${course === 'academy' || course === 'ocs' ? `the ${w.nations[c.nation].adj} military academy in ${r.name}` : hasUniversity(w, r) && COURSES[course].uni ? `the University of ${r.name}` : `${r.name} College`}. Study days needed: ${courseDays(w, course)}.`);
}
/** Military courses are held at the national academy in the capital; the rest locally. */
const courseRegion = (w: World, c: Citizen, course: Course) => (course === 'academy' || course === 'ocs' ? w.nations[c.nation].capital : c.home);
const commissionRank = (c: Citizen) => RANKS[c.mil.branch!][5].name;
export const commissioned = (c: Citizen) => !!c.mil?.commissioned || (c.mil?.branch != null && c.mil.rank >= 5);
const routineOfPlayer = (w: World) => (w.player.routine ??= { work: false, train: w.settings.autoTrain, family: false, rest: false, hobby: null, school: false });

export function studyCheck(w: World, c: Citizen): string | null {
  const e = c.edu?.enrolled;
  if (!e) return 'You are not enrolled on a course.';
  if (jailed(w, c)) return 'You are in prison.';
  if (e.lastDay === today(w)) return 'You have studied today.';
  if (c.loc !== e.region) return `Your classes are in ${w.regions[e.region].name}.`;
  if (c.energy < B.edu.studyEnergy) return `Needs ${B.edu.studyEnergy} energy.`;
  return null;
}

/** A day of classes and study: progress (faster at a good school), skills of the field, a little stress. */
export function study(w: World, c: Citizen = player(w)): Result {
  const why = studyCheck(w, c);
  if (why) return fail(why);
  const e = c.edu!.enrolled!;
  c.energy -= B.edu.studyEnergy;
  e.lastDay = today(w);
  const q = schoolQuality(w, w.regions[e.region]);
  e.days += (0.8 + q / 250) * (hasQuirk(c, 'bookworm') ? 1.2 : 1);
  for (const a of FIELDS[e.field].skills) practise(w, c, a, B.practice.study);
  const L = lifeOf(c);
  L.stress = Math.min(100, L.stress + 0.5);
  if (e.days >= e.need) return ok(graduate(w, c));
  return ok(`📚 A day of classes (${Math.floor((e.days / e.need) * 100)}% of your ${COURSES[e.course].label.toLowerCase()}).`);
}

function graduate(w: World, c: Citizen): string {
  const ed = eduOfCitizen(c);
  const e = ed.enrolled!;
  const military = e.course === 'academy' || e.course === 'ocs';
  if (e.course === 'academy' && rank('bachelor') >= rank(ed.level)) { ed.level = 'bachelor'; ed.field = e.field; }
  else if (!military && rank(e.course as EduLevel) >= rank(ed.level)) { ed.level = e.course as EduLevel; ed.field = e.field; }
  delete ed.enrolled;
  if (military) {
    c.mil.commissioned = true;
    if (c.mil.branch && c.mil.rank < 5 && !c.mil.reserve) { c.mil.rank = 5; if (c.player) notify(w, 'progress', `⭐ Commissioned as ${commissionRank(c)}.`, { critical: true, link: 'forces' }); }
  }
  c.influence += e.course === 'doctorate' ? 5 : e.course === 'master' ? 3 : 2;
  const text = military ? `passed ${e.course === 'academy' ? `the military academy (a degree in ${FIELDS[e.field].label.toLowerCase()})` : 'officer training'} and earned a commission` : `graduated with a ${COURSES[e.course].label.toLowerCase()} in ${FIELDS[e.field].label.toLowerCase()}`;
  milestone(w, c, 'education', text);
  if (military) addHeirloom(w, c, "Officer's sword", `commissioned ${fmtDateL(w.time)}`);
  else if (rank(ed.level) >= rank('bachelor') && ed.level === e.course) addHeirloom(w, c, `${COURSES[e.course].label} certificate`, `${FIELDS[e.field].label}, ${fmtDateL(w.time)}`);
  if (c.player) { notify(w, 'personal', `🎓 You ${text}!`, { critical: true, link: 'life' }); routineOfPlayer(w).school = false; }
  return `🎓 You ${text}!`;
}

export function dropOut(w: World, c: Citizen = player(w)): Result {
  const e = c.edu?.enrolled;
  if (!e) return fail('You are not enrolled.');
  delete c.edu!.enrolled;
  if (c.player) routineOfPlayer(w).school = false;
  return ok(`You left your ${COURSES[e.course].label.toLowerCase()} after ${Math.floor(e.days)} study days.`);
}

// ---------- daily ----------

/** Daily: public education spending, fees for a new year of study, and NPC students' progress. */
export function educationDaily(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    n.eduFunding ??= eduOf(n.iso).funding;
    const amt = Math.min(Math.floor((n.stats.revHist[n.stats.revHist.length - 1] ?? 0) * n.eduFunding), Math.floor((n.wallet[n.cur] ?? 0) * 0.05));
    if (amt > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, amt, 'Schools and universities')) n.stats.spendToday += amt;
    // Quality follows funding slowly (years of under-funding show).
    const target = Math.max(20, Math.min(95, 35 + n.eduFunding * 800));
    n.eduQ = (n.eduQ ?? target) + (target - (n.eduQ ?? target)) * 0.01;
  }
  const d = today(w);
  for (const c of census(w).all) {
    const e = c.edu?.enrolled;
    if (!e) continue;
    // A new academic year: the next year's fees (or the course ends).
    if (w.time - e.since >= e.paidYears * lifeYear(w)) {
      const nat = controller(w.regions[e.region]);
      const fee = feeFor(w, c, nat, e.course);
      if (fee > 0 && e.loan && !loanCheck(w, c, 'student', fee)) borrow(w, c, 'student', fee, `${COURSES[e.course].label}, year ${e.paidYears + 1}`);
      if (fee > 0 && !pay(w, cref(c.id), natref(nat), w.nations[nat].cur, fee, `Tuition: ${COURSES[e.course].label}`)) {
        delete c.edu!.enrolled;
        if (c.player) { notify(w, 'personal', `🎓 You could not pay next year's fees (${fmtAmt(w.nations[nat].cur, fee)}) and had to leave your course.`, { critical: true, link: 'life' }); routineOfPlayer(w).school = false; }
        continue;
      }
      e.paidYears++;
    }
    // NPC students study on weekdays (as the player's routine does).
    if (!c.player && e.lastDay !== d && hash01(c.id, d, 77) < 0.7) {
      e.lastDay = d;
      e.days += 0.8 + schoolQuality(w, w.regions[e.region]) / 250;
      if (e.days >= e.need) graduate(w, c);
    }
  }
}

/** Genesis and upgrades: a plausible education for everyone, by country and age (no dice: a stable hash). */
export function assignEducation(w: World, c: Citizen) {
  if (c.edu) return;
  const age = ageOf(w, c);
  if (age < B.life.adultAge) { c.edu = { level: 'none' }; return; } // still at school (sim/childhood.ts)
  const share = eduOf(w.nations[c.nation].iso).tertiary;
  const h = hash01(c.id, 1310, 3);
  const fields = Object.keys(FIELDS) as Field[];
  const field = fields[Math.floor(hash01(c.id, 1310, 4) * fields.length)];
  const byPersona = c.persona === 'industrialist' || c.persona === 'investor' ? 1.4 : c.persona === 'politician' || c.persona === 'journalist' ? 1.3 : 1;
  const t = Math.min(0.95, share * byPersona * (age > 60 ? 0.7 : 1));
  let level: EduLevel = h < 0.06 ? 'none' : 'school';
  if (h > 1 - t) level = h > 1 - t * 0.12 ? (h > 1 - t * 0.02 ? 'doctorate' : 'master') : h > 1 - t * 0.55 ? 'bachelor' : 'vocational';
  c.edu = { level, field: rank(level) >= 2 ? (level === 'vocational' && field !== 'trades' && hash01(c.id, 5) < 0.5 ? 'trades' : field) : undefined };
  // Some of the young are students now.
  if (!c.player && age >= 18 && age <= 23 && level === 'school' && hash01(c.id, 1310, 6) < share) {
    const r = w.regions[c.home];
    const course: Course = hasUniversity(w, r) ? 'bachelor' : 'vocational';
    c.edu.enrolled = { course, field, region: r.id, since: w.time, days: Math.round(courseDays(w, course) * hash01(c.id, 7) * 0.8), need: courseDays(w, course), lastDay: -1, paidYears: 1 };
  }
}
export const initEducation = (w: World) => { for (const c of Object.values(w.citizens)) assignEducation(w, c); };

/** The government sets education funding (head of government, vice-president or economy minister). */
export function setEduFunding(w: World, actor: Id, nation: Id, share: number): Result {
  if (!nationPerm(w, actor, nation, 'money')) return fail('Only the head of government or the economy minister sets education funding.');
  if (!(share >= 0 && share <= 0.15)) return fail('Between 0% and 15% of daily revenue.');
  w.nations[nation].eduFunding = share;
  return ok(`Education funding set to ${Math.round(share * 100)}% of daily revenue. Quality follows over the coming years.`);
}
