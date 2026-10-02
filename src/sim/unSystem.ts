// The UN as an organisation (3.0.3 Diplomacy completed).
// - A budget: every member pays dues each January, on the real scale of assessments (the US a
//   fifth, China nearly as much, and so down). Governments that resent the UN, or cannot pay,
//   fall into arrears; two years behind, a country loses its vote in the General Assembly.
// - The budget pays for peacekeeping: each mission costs money every month and the countries
//   that send troops are reimbursed. When the money runs out, missions are cut short.
// - A Secretary-General, elected for five years: the Security Council recommends (each permanent
//   member can veto a candidate), the General Assembly appoints. Candidates are the leading public
//   figures of countries without a veto, in turn from different parts of the world. The
//   Secretary-General appeals for ceasefires in the wars of the day, with an authority that grows
//   with success. The player can stand, and if elected, makes those appeals.
// - Resolutions authorising force: when an aggressor ignores a ceasefire the Council demanded,
//   the Council can authorise members to use force; willing members join the war on the victim's
//   side, with the world's blessing.
import type { Citizen, Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt, timeOfDate } from '../engine/calendar';
import { GOLD, fmtAmt } from '../engine/money';
import { pay } from '../engine/ledger';
import { notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { WORLD_REGION } from '../data/diplomacy';
import { census } from './census';
import { natref, player } from './query';
import { ageOf } from './growth';
import { leaderProfile } from './relations';
import { activeWars, declareWar, settle, warBetween, warCheck } from './war';
import { intlOf, permanentIds, councilMembers } from './intlOrgs';
import type { War } from './types';

/** The UN's own account (dues in, peacekeeping out). */
export const orgref = { k: 'org' as const, id: 0 };
export const unFund = (w: World) => (intlOf(w).fund ??= { wallet: {}, inv: {} });

/** The scale of assessments 2025–27 (percent of the budget), for the countries in the game. */
const SCALE: Record<string, number> = { USA: 22, CHN: 20, JPN: 6.9, DEU: 5.7, GBR: 4.0, CAN: 2.5, KOR: 2.2, AUS: 2.0, RUS: 1.9, BRA: 1.4, SAU: 1.1, IND: 1.0, MEX: 1.0, TUR: 0.7, ARG: 0.5, ZAF: 0.2 };
/** The UN's yearly budget in gold (the regular budget; peacekeeping is paid from it here). */
export const UN_BUDGET = 60000;
export const PK_MONTHLY = 1700; // one mission, a month
export const duesOf = (w: World, n: Nation) => {
  const total = w.nations.filter((x) => !x.exile).reduce((s, x) => s + (SCALE[x.iso] ?? 0.1), 0);
  return Math.round(UN_BUDGET * (SCALE[n.iso] ?? 0.1) / Math.max(1, total));
};
export const arrearsOf = (w: World, n: Id) => intlOf(w).arrears?.[n] ?? 0;
/** Two years' dues behind: no vote in the General Assembly (Article 19). */
export const loses19 = (w: World, n: Nation) => arrearsOf(w, n.id) >= 2 * duesOf(w, n) && duesOf(w, n) > 0;

/** January: every member is billed; those who resent the UN (or are short of gold) hold some back. */
function duesYear(w: World) {
  const st = intlOf(w);
  unFund(w);
  st.arrears ??= {};
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const owed = duesOf(w, n) + (st.arrears[n.id] ?? 0);
    const lp = leaderProfile(w, n);
    const grudge = st.resolutions.some((r) => r.status === 'passed' && r.target === n.id && r.closes > w.time - 2 * 365 * DAY);
    // The player's government pays in full unless the player chooses otherwise (UN panel).
    const share = n.president === pl.id && n.id === pl.nation ? (n.unWithhold ? 0.5 : 1) : lp.nationalism > 0.7 || grudge ? 0.5 : 1;
    const want = Math.round(owed * share);
    const paid = Math.min(want, n.wallet[GOLD] ?? 0);
    if (paid > 0) pay(w, natref(n.id), orgref, GOLD, paid, 'UN dues');
    st.arrears[n.id] = owed - paid;
    if (st.arrears[n.id] > 0 && share < 1) record(w, 'diplomacy', `🇺🇳 ${n.name} held back part of its UN dues; it owes ${fmtAmt(GOLD, st.arrears[n.id])}.`, { nation: n.id });
    if (loses19(w, n)) record(w, 'diplomacy', `🇺🇳 ${n.name} is two years behind with its UN dues and has lost its vote in the General Assembly.`, { nation: n.id, important: true });
  }
}

/** Monthly: the UN's own work (staff, agencies, aid) is paid for, mostly where it is based (New York, Geneva):
 *  a twelfth of the year's budget, keeping half a year's budget in reserve for peacekeeping. */
function operationsMonth(w: World) {
  const fund = unFund(w).wallet[GOLD] ?? 0;
  const spend = Math.min(Math.round(UN_BUDGET / 12), Math.max(0, fund - UN_BUDGET / 2));
  const host = w.nations.find((n) => n.iso === 'USA' && !n.exile) ?? w.nations.find((n) => !n.exile);
  if (spend > 0 && host) pay(w, orgref, natref(host.id), GOLD, spend, 'UN operations');
}

/** Monthly: peacekeeping missions cost money; the troop contributors are reimbursed; no money, no mission. */
function peacekeepingMonth(w: World) {
  const missions = Object.values(w.wars).filter((x) => x.status !== 'ended' && (x.peacekeepers?.until ?? 0) > w.time);
  for (const war of missions) {
    const fund = unFund(w).wallet[GOLD] ?? 0;
    if (fund < PK_MONTHLY) {
      war.peacekeepers!.until = w.time;
      record(w, 'diplomacy', `🇺🇳 The UN has run out of money for its mission between ${w.nations[war.att].name} and ${w.nations[war.def].name}: the peacekeepers are going home early.`, { nation: war.att, important: true });
      continue;
    }
    const by = war.peacekeepers!.by.filter((id) => w.nations[id] && !w.nations[id].exile);
    const each = by.length ? Math.floor(PK_MONTHLY / by.length) : 0;
    for (const id of by) if (each > 0) pay(w, orgref, natref(id), GOLD, each, 'UN peacekeeping reimbursement');
  }
}

// ---------- the Secretary-General ----------

export interface SecGen { name: string; cit?: Id; nation?: Id; from?: string; since: number; until: number; authority: number; terms: number }
export function secGen(w: World): SecGen {
  const st = intlOf(w);
  return (st.sg ??= { name: 'António Guterres', from: 'Portugal', since: timeOfDate(2017, 0, 1), until: timeOfDate(2027, 0, 1), authority: 55, terms: 2 });
}
const regionOf = (w: World, n: Id | undefined) => (n != null ? WORLD_REGION[w.nations[n]?.iso]?.[0] : 'europe') ?? 'other';

/** Who can stand: a leading public figure (influence) of 45 to 75 from a country without a veto, not holding its top office. */
export function sgEligible(w: World, c: Citizen): string | null {
  if (c.gone) return 'Not alive.';
  if (permanentIds(w).includes(c.nation)) return 'Citizens of the permanent members do not become Secretary-General.';
  const a = ageOf(w, c);
  if (a < 45 || a > 75) return 'Candidates are between 45 and 75.';
  if (w.nations[c.nation].president === c.id) return 'A serving head of government cannot stand.';
  if (c.influence < 40) return 'You need more standing (influence 40) to be taken seriously.';
  return null;
}
export function standCheck(w: World, c: Citizen): string | null {
  const st = intlOf(w);
  const sg = secGen(w);
  if (sg.cit === c.id) return 'You are the Secretary-General.';
  if (sg.until - w.time > 365 * DAY) return `The next election is in ${dateAt(sg.until).year - 1}.`;
  if (st.sgCandidates?.includes(c.id)) return 'You are already a candidate.';
  return sgEligible(w, c);
}
export function standForSg(w: World, c: Citizen = player(w)): Result {
  const why = standCheck(w, c);
  if (why) return fail(why);
  (intlOf(w).sgCandidates ??= []).push(c.id);
  record(w, 'diplomacy', `🇺🇳 ${c.name} of ${w.nations[c.nation].name} is standing for UN Secretary-General.`, { nation: c.nation, cit: c.id });
  return ok('Your candidacy is declared. The Security Council will hold its straw polls before the term ends.');
}

/** The election, in the autumn before the term ends: straw polls in the Council (a permanent member's
 *  "discourage" is a veto), then appointment by the Assembly. An incumbent who has done well may serve again. */
function sgElection(w: World) {
  const st = intlOf(w);
  const sg = secGen(w);
  const perm = permanentIds(w);
  const council = councilMembers(w);
  const last = regionOf(w, sg.nation);
  // Candidates: declared ones, and each region's best-known figure (the turn of a different region is favoured).
  const pool = new Set<Id>(st.sgCandidates ?? []);
  if (sg.cit != null && sg.terms < 2 && sg.authority > 50 && w.citizens[sg.cit] && !sgEligible(w, w.citizens[sg.cit])) pool.add(sg.cit);
  const best = new Map<Id, Citizen>();
  for (const c of census(w).all) if (!c.player && !sgEligible(w, c) && (!best.get(c.nation) || c.influence > best.get(c.nation)!.influence)) best.set(c.nation, c);
  for (const c of [...best.values()].filter((c) => c.nation !== sg.nation).sort((a, b) => b.influence - a.influence).slice(0, 5)) pool.add(c.id); // (a successor from another country)
  if (sg.cit != null && sg.terms >= 2) pool.delete(sg.cit); // two terms at most
  const scored = [...pool].map((id) => w.citizens[id]).filter((c) => c && !sgEligible(w, c) || (c && c.id === sg.cit)).map((c) => {
    const vetoed = perm.filter((p) => (w.nations[p].relations[c.nation]?.score ?? 0) < -20);
    const support = council.reduce((s, p) => s + Math.max(-20, w.nations[p].relations[c.nation]?.score ?? 0), 0) + c.influence + (regionOf(w, c.nation) !== last ? 30 : 0) + (c.id === sg.cit ? sg.authority : 0) + rand(w, 0, 20);
    return { c, vetoed, support };
  });
  const ok_ = scored.filter((x) => !x.vetoed.length).sort((a, b) => b.support - a.support || a.c.id - b.c.id);
  const pick = ok_[0] ?? scored.sort((a, b) => a.vetoed.length - b.vetoed.length || b.support - a.support)[0];
  st.sgCandidates = [];
  if (!pick) { sg.until += 365 * DAY; return; }
  const c = pick.c;
  const again = c.id === sg.cit;
  Object.assign(sg, { name: c.name, cit: c.id, nation: c.nation, from: undefined, since: sg.until, until: sg.until + 5 * 365 * DAY, authority: again ? sg.authority : 50, terms: again ? sg.terms + 1 : 1 });
  const text = `🇺🇳 ${c.name} of ${w.nations[c.nation].name} was ${again ? 're-elected' : 'appointed'} UN Secretary-General for five years${pick.vetoed.length ? '' : ', with no permanent member opposed'}.`;
  record(w, 'diplomacy', text, { nation: c.nation, cit: c.id, important: true });
  c.influence += 10;
  if (c.player) notify(w, 'diplomacy', `${text} You take office on 1 January.`, { critical: true, link: 'diplomacy' });
}

export function appealCheck(w: World, c: Citizen, war: War | undefined): string | null {
  const sg = secGen(w);
  if (sg.cit !== c.id || sg.since > w.time) return 'Only the Secretary-General makes these appeals.';
  if (!war || war.status !== 'active') return 'Pick a war under way.';
  if ((c.flags.sgAppeal ?? -Infinity) > Math.floor(w.time / DAY) - 30) return 'Once a month.';
  return null;
}
/** A ceasefire appeal by the Secretary-General: success builds authority, failure costs a little. */
export function sgAppeal(w: World, war: War, c?: Citizen): Result {
  const sg = secGen(w);
  if (c) { const why = appealCheck(w, c, war); if (why) return fail(why); c.flags.sgAppeal = Math.floor(w.time / DAY); }
  const a = w.nations[war.att], d = w.nations[war.def];
  const p = 0.04 + sg.authority / 600 + (c ? c.influence / 1000 : 0) + ((war.level ?? 1) <= 1 ? 0.03 : 0);
  if (chance(w, Math.min(0.4, p))) {
    settle(w, war, 'armistice');
    sg.authority = Math.min(100, sg.authority + 8);
    if (c) c.influence += 5;
    record(w, 'diplomacy', `🕊️ After an appeal by UN Secretary-General ${sg.name}, ${a.name} and ${d.name} agreed a ceasefire.`, { nation: a.id, important: true });
    return ok('Both sides agreed to a ceasefire. Your authority grows.');
  }
  sg.authority = Math.max(10, sg.authority - 1);
  return ok(`${a.name} and ${d.name} heard the appeal, and fought on.`);
}

// ---------- authorising force ----------

/** A Council resolution authorising force: willing members join the war on the victim's side. */
export function enactForce(w: World, war: War, yes: Id[]): string {
  const target = w.nations[war.att];
  const joined: string[] = [];
  for (const id of yes) {
    const n = w.nations[id];
    if (!n || n.exile || id === war.att || id === war.def || warBetween(w, id, war.att)) continue;
    const lp = leaderProfile(w, n);
    if (!chance(w, 0.25 + lp.hawk * 0.4 - (n.relations[war.att]?.score ?? 0) / 200)) continue;
    if (warCheck(w, n, { target: war.att, days: 30, goals: [] })) continue;
    const days = Math.max(30, Math.round((war.deadline - w.time) / DAY));
    const x = declareWar(w, n, { target: war.att, days, goals: [] });
    x.kind = 'limited'; x.authorised = true; x.joined = war.id;
    joined.push(n.name);
  }
  war.authorised = true;
  return joined.length ? `Force is authorised: ${joined.join(', ')} joined the war against ${target.name}.` : `Force is authorised against ${target.name}, but no member was willing to send its forces.`;
}

/** The AI Council: force, once a demanded ceasefire has been ignored for a month. */
export function forceCase(w: World, war: War): boolean {
  const st = intlOf(w);
  return war.status === 'active' && war.kind !== 'civil' && war.kind !== 'secession' && !war.authorised
    && st.resolutions.some((r) => r.war === war.id && r.kind === 'ceasefire' && r.status === 'passed' && r.closes < w.time - 30 * DAY)
    && !st.resolutions.some((r) => r.war === war.id && r.kind === 'force');
}

export function unSystemDaily(w: World) {
  const d = dateAt(w.time);
  const sg = secGen(w);
  if (d.month === 0 && d.day === 1) duesYear(w);
  if (d.day === 1) {
    peacekeepingMonth(w);
    operationsMonth(w);
    // The Secretary-General's appeal in the oldest war (the AI one; the player makes their own).
    const holder = sg.cit != null ? w.citizens[sg.cit] : null;
    if (!holder?.player) { const war = activeWars(w).filter((x) => x.kind !== 'civil' && x.kind !== 'secession').sort((a, b) => a.declared - b.declared)[0]; if (war && chance(w, 0.5)) sgAppeal(w, war); }
    // A Secretary-General who has died or left office early is replaced at the next election.
    if (holder && holder.gone) { sg.until = Math.min(sg.until, w.time + 60 * DAY); sg.cit = undefined; }
  }
  if (d.month === 9 && d.day === 1 && sg.until - w.time < 120 * DAY && sg.until > w.time) sgElection(w);
  if (sg.until <= w.time) sgElection(w); // (overdue)
}
