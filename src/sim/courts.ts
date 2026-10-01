// Courts (1.7 Law & Order). Prosecutors, public defenders and judges are public
// careers (sim/services.ts). Every trial is heard by a judge, argued by a prosecutor
// and, when the accused can afford one, a defence lawyer; their skill and experience
// move the verdict. Accused people can post bail and prepare a defence, or plead
// guilty for a lighter sentence: most convictions in the United States come from
// plea deals, few in Germany and almost none in Japan. Convictions can be appealed.
// Where police are under pressure and institutions are weak, cases that would go cold
// are sometimes pinned on the wrong person; some of them are later exonerated.
import type { Case, Citizen, Id, Nation, World } from './types';
import { B } from '../data/balance';
import { baselineOf } from '../data/nationBaselines';
import { DAY, dayOf } from '../engine/clock';
import { notify, record } from '../engine/events';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { chance, hash01, pick } from '../engine/rng';
import { census } from './census';
import { controller, cref, hhref, jailed, natref, player } from './query';
import { practise } from './growth';
import { SERVICES } from './services';
import { CRIME_NAME, SEVERITY, openCase } from './crime';
import { release } from './prisons';

/** Share of convictions that come from guilty pleas (approximate: US federal ~97%, England and Wales Crown Court ~70%, Germany's Absprachen ~20%, Japan rare). */
export const PLEA_RATE: Record<string, number> = { USA: 0.95, CAN: 0.8, MEX: 0.5, BRA: 0.3, ARG: 0.5, GBR: 0.7, DEU: 0.2, RUS: 0.6, TUR: 0.3, SAU: 0.3, ZAF: 0.4, IND: 0.3, CHN: 0.5, JPN: 0.05, KOR: 0.2, AUS: 0.7 };
export const pleaRate = (n: Nation) => PLEA_RATE[n.iso] ?? 0.5;

export interface CourtStats { trials: number; convictions: number; acquittals: number; pleas: number; appeals: number; quashed: number; exonerations: number; wrongful: number }
export const courtStats = (n: Nation): CourtStats => (n.courts ??= { trials: 0, convictions: 0, acquittals: 0, pleas: 0, appeals: 0, quashed: 0, exonerations: 0, wrongful: 0 });

// ---------- the court ----------

const officials = (w: World, nation: Id, kind: 'judge' | 'prosecutor' | 'defender') =>
  census(w).all.filter((c) => c.post?.kind === kind && controller(w.regions[c.post.region]) === nation && !jailed(w, c));

/** Who hears a case: officials of the case's region if there are any, else of the country (a stable pick per case). */
export function benchFor(w: World, k: Case): { judge: Citizen | null; prosecutor: Citizen | null; defender: Citizen | null } {
  const one = (kind: 'judge' | 'prosecutor' | 'defender') => {
    const all = officials(w, k.nation, kind).filter((c) => c.id !== k.suspect);
    const local = all.filter((c) => c.post!.region === k.region);
    const pool = local.length ? local : all;
    return pool.length ? pool[Math.floor(hash01(k.id, kind.length) * pool.length)] : null;
  };
  return { judge: one('judge'), prosecutor: one('prosecutor'), defender: one('defender') };
}

/** An official's courtroom skill, 0..1: grade and the skill the job uses. */
const skill = (c: Citizen | null) => (c ? Math.min(1, c.post!.grade * 0.12 + (c.attrs[SERVICES[c.post!.kind].skill] ?? 0) / 100) : 0.25);

/** The chance a trial ends in conviction. */
export function convictionChance(w: World, k: Case, lawyer: boolean): number {
  const b = benchFor(w, k);
  let p = k.evidence / 100;
  p *= 1 + (skill(b.prosecutor) - 0.3) * 0.3;
  if (lawyer) p *= 0.75 - (skill(b.defender) - 0.3) * 0.3;
  if (w.citizens[k.suspect]?.flags.bail === k.id && lawyer) p *= 0.9; // time to prepare a defence
  return Math.max(0.02, Math.min(0.98, p));
}

/** Pay the defence: to a defence lawyer if there is one, else to the wider economy. */
export function payDefence(w: World, k: Case, s: Citizen, fee: number): boolean {
  const code = w.nations[k.nation].cur;
  const d = benchFor(w, k).defender;
  if (!pay(w, cref(s.id), d ? cref(d.id) : hhref(k.nation), code, fee, 'Defence lawyer')) return false;
  if (d) { practise(w, d, 'lead', 0.3); if (d.player) notify(w, 'economy', `⚖️ You defended ${s.name} (${CRIME_NAME[k.kind]}): ${fmtAmt(code, fee)} in fees.`, { link: 'jobs' }); }
  return true;
}

/** After a verdict: the bench gains experience; the player hears about cases they sat on. */
export function afterVerdict(w: World, k: Case, convicted: boolean, plea: boolean) {
  const b = benchFor(w, k);
  const s = w.citizens[k.suspect];
  const st = courtStats(w.nations[k.nation]);
  st.trials++;
  if (convicted) st.convictions++; else st.acquittals++;
  if (plea) st.pleas++;
  if (k.innocent && convicted) st.wrongful++;
  k.judge = b.judge?.id ?? null;
  for (const o of [b.judge, b.prosecutor]) if (o) practise(w, o, SERVICES[o.post!.kind].skill, 0.2);
  if (b.judge?.player) notify(w, 'economy', `⚖️ You heard the case against ${s?.name ?? 'a defendant'} (${CRIME_NAME[k.kind]}): ${convicted ? (plea ? 'a guilty plea' : 'convicted') : 'acquitted'}.`, { link: 'crime' });
  if (b.prosecutor?.player) notify(w, 'economy', `⚖️ Your case against ${s?.name ?? 'a defendant'} (${CRIME_NAME[k.kind]}): ${convicted ? (plea ? 'a guilty plea' : 'a conviction') : 'an acquittal'}.`, { link: 'crime' });
}

// ---------- bail ----------

export const bailAmount = (w: World, k: Case) => {
  const s = w.citizens[k.suspect];
  return Math.round(cur(B.justice.lawyer) * SEVERITY[k.kind] * 0.5 * (1 + (s?.sec.record.convictions ?? 0) * 0.5));
};
export function bailCheck(w: World, s: Citizen, k: Case): string | null {
  if (k.status !== 'open' || s.flags.pendingTrial !== k.id) return 'There is no trial to wait for.';
  if (s.flags.bail === k.id) return 'You are already out on bail.';
  if (SEVERITY[k.kind] >= 5) return 'No bail is granted for espionage.';
  if (k.kind === 'escape') return 'Escapees are not granted bail.';
  const code = w.nations[k.nation].cur;
  if ((s.wallet[code] ?? 0) < bailAmount(w, k)) return `Bail is ${fmtAmt(code, bailAmount(w, k))}.`;
  return null;
}
/** Post bail: the court holds the money, the trial moves to a later date, and the accused prepares a defence. */
export function postBail(w: World, s: Citizen, k: Case): Result {
  const why = bailCheck(w, s, k);
  if (why) return fail(why);
  const code = w.nations[k.nation].cur;
  const amt = bailAmount(w, k);
  pay(w, cref(s.id), natref(k.nation), code, amt, 'Bail (held by the court)');
  s.flags.bail = k.id;
  s.flags.bailAmt = amt;
  s.flags.trialAt = w.time + 4 * DAY;
  return ok(`Bail of ${fmtAmt(code, amt)} posted. Your trial is in four days; stay in ${w.nations[k.nation].name} or lose the money.`);
}
/** At trial: bail is returned if the accused turned up, forfeited if they left the country. */
export function settleBail(w: World, s: Citizen, k: Case): boolean {
  if (s.flags.bail !== k.id) return true;
  const code = w.nations[k.nation].cur;
  const amt = s.flags.bailAmt ?? 0;
  s.flags.bail = 0; s.flags.bailAmt = 0;
  if (controller(w.regions[s.loc]) !== k.nation) {
    if (s.player) notify(w, 'personal', `💸 You did not appear for trial in ${w.nations[k.nation].name}: your ${fmtAmt(code, amt)} bail is forfeit and a warrant is out.`, { critical: true, link: 'crime' });
    return false;
  }
  const n = w.nations[k.nation];
  pay(w, natref(n.id), cref(s.id), code, Math.min(amt, n.wallet[code] ?? 0), 'Bail returned');
  return true;
}
export function hireForTrialCheck(w: World, s: Citizen, k: Case): string | null {
  if (s.flags.bail !== k.id) return 'Only while out on bail.';
  if (s.flags.trialLawyer === k.id) return 'Your lawyer is preparing the case.';
  const code = w.nations[k.nation].cur;
  if ((s.wallet[code] ?? 0) < cur(B.justice.lawyer)) return `A lawyer costs ${fmtAmt(code, cur(B.justice.lawyer))}.`;
  return null;
}
export function hireForTrial(w: World, s: Citizen, k: Case): Result {
  const why = hireForTrialCheck(w, s, k);
  if (why) return fail(why);
  if (!payDefence(w, k, s, cur(B.justice.lawyer))) return fail('The payment failed.');
  s.flags.trialLawyer = k.id;
  return ok('A defence lawyer takes your case and starts on the evidence.');
}

// ---------- appeals ----------

export const APPEAL_DAYS = 14;
export const appealFee = () => cur(B.justice.lawyer) * 2;
export function appealCheck(w: World, c: Citizen, k: Case | undefined): string | null {
  if (!k || k.suspect !== c.id || !k.outcome?.startsWith('convicted')) return 'There is no conviction to appeal.';
  if (k.appealed) return 'This conviction has already been appealed.';
  if (k.plea) return 'You pleaded guilty: there is nothing to appeal.';
  if (w.time - (k.closedAt ?? 0) > APPEAL_DAYS * DAY) return `Appeals must be lodged within ${APPEAL_DAYS} days.`;
  const code = w.nations[k.nation].cur;
  if ((c.wallet[code] ?? 0) < appealFee()) return `An appeal costs ${fmtAmt(code, appealFee())} in legal fees.`;
  return null;
}
/** Courts of appeal overturn weak and wrongful convictions. */
export const appealChance = (w: World, k: Case) => Math.max(0.03, Math.min(0.85, 0.02 + (1 - k.evidence / 100) * 0.3 + (k.innocent ? 0.4 : 0) + baselineOf(w.nations[k.nation].iso).law * 0.05));
export function appeal(w: World, c: Citizen, k: Case): Result {
  const why = appealCheck(w, c, k);
  if (why) return fail(why);
  k.appealed = true;
  payDefence(w, k, c, appealFee());
  courtStats(w.nations[k.nation]).appeals++;
  if (!chance(w, appealChance(w, k))) return ok('The Court of Appeal upholds the conviction. The judgment runs to nine pages; the last line is the one that matters.');
  quash(w, k, false);
  return ok('Conviction quashed. The Court of Appeal finds the verdict unsafe.');
}

/** Overturn a conviction: release, a clean record and the fine back (with compensation for the wrongly convicted). */
function quash(w: World, k: Case, exonerated: boolean) {
  const s = w.citizens[k.suspect];
  const n = w.nations[k.nation];
  const st = courtStats(n);
  k.outcome = exonerated ? 'exonerated' : 'conviction quashed on appeal';
  st.quashed++;
  if (exonerated) st.exonerations++;
  if (!s) return;
  if (jailed(w, s)) release(w, s, 'quashed');
  s.sec.releasedAt = undefined;
  s.sec.record.convictions = Math.max(0, s.sec.record.convictions - 1);
  const back = Math.min((k.fine ?? 0) + (exonerated ? cur(B.justice.lawyer) * 3 : 0), n.wallet[n.cur] ?? 0);
  if (back > 0) pay(w, natref(n.id), cref(s.id), n.cur, back, exonerated ? 'Compensation for wrongful conviction' : 'Fine refunded on appeal');
  const text = exonerated ? `🕊️ ${s.name} was exonerated of ${CRIME_NAME[k.kind]} in ${n.name} after new evidence emerged.` : `⚖️ ${s.name}'s conviction for ${CRIME_NAME[k.kind]} was quashed on appeal.`;
  if (s.player) { notify(w, 'personal', text, { critical: true, link: 'crime' }); record(w, 'justice', text, { cit: s.id, player: true, important: true }); }
  else if (exonerated || n.id === player(w).nation) record(w, 'justice', text, { nation: n.id, cit: s.id });
}

// ---------- wrongful convictions ----------

/** When a case is about to go cold: under pressure, weak police may pin it on someone with a record. */
export function maybeFrame(w: World, k: Case): boolean {
  const r = w.regions[k.region];
  const n = w.nations[k.nation];
  const law = baselineOf(n.iso).law;
  if (r.crime < 40 || !chance(w, 0.12 * (1 - law))) return false;
  const pool = census(w).all.filter((c) => !c.player && c.id !== k.suspect && c.home === k.region && c.sec.record.convictions > 0 && !jailed(w, c) && !c.flags.pendingTrial);
  if (!pool.length) return false;
  const v = pick(w, pool);
  const fake = openCase(w, v, k.kind, k.region, 85, k.loot);
  fake.innocent = true;
  return true;
}

/** Daily: NPC appeals and the slow work of exoneration (innocence projects, new evidence). */
export function courtsDaily(w: World) {
  if (dayOf(w.time) % 7 !== 0) return;
  for (const k of Object.values(w.cases)) {
    if (k.status !== 'closed' || !k.outcome?.startsWith('convicted')) continue;
    const s = w.citizens[k.suspect];
    if (!s || s.player) continue;
    // NPCs appeal weak convictions within the window.
    if (!k.appealed && !k.plea && w.time - (k.closedAt ?? 0) <= APPEAL_DAYS * DAY && k.evidence < 85 && chance(w, 0.3)) {
      k.appealed = true;
      courtStats(w.nations[k.nation]).appeals++;
      if (chance(w, appealChance(w, k))) quash(w, k, false);
      continue;
    }
    // The wrongly convicted are sometimes cleared later (DNA, recanted testimony, a confession).
    if (k.innocent && chance(w, 0.02 + baselineOf(w.nations[k.nation].iso).press * 0.03)) quash(w, k, true);
  }
}
