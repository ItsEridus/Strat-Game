// International organisations (2.0 GEO 4).
// - The United Nations: a General Assembly where every country votes, and a Security
//   Council of the four permanent members in the game (the US, China, Russia and Britain,
//   each with a veto) and four elected seats held for two years. Resolutions condemn
//   aggression, demand ceasefires, and impose binding sanctions for a year. Every country
//   votes on its interests: its relations with the target and the sponsor, its alliances,
//   and its own wars. The player's country votes as its head of government decides.
// - The G20: all sixteen countries meet once a year in November, hosted in turn. Leaders
//   get to know each other (a little more trust between those on speaking terms); an
//   aggressor at war is shunned.
// - The WTO: a country hit by sanctions that the Security Council never authorised may
//   bring a dispute. Panels rule after a year; a respondent that ignores a ruling against it
//   faces authorised retaliation. National security is a defence when the threat is real.
// - The IMF: a country whose reserves run out or whose debt reaches its limit gets an
//   emergency loan in gold from the largest economies, repaid over two years. The loan
//   comes with austerity (unpopular) and calms bond markets (a lower risk premium).
import type { Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt, timeOfDate } from '../engine/calendar';
import { GOLD, fmtAmt } from '../engine/money';
import { pay } from '../engine/ledger';
import { nid, notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { natref, player } from './query';
import { relation } from './congress';
import { noteTrust, prestigeOf } from './relations';
import { activeWars, settle } from './war';
import { freeze } from './warCourse';
import { nationScores } from './forces';
import { debtLimit, dailySpending } from './publicFinance';
import { B } from '../data/balance';
import { nationalStaffing } from './services';

export const PERMANENT = ['USA', 'CHN', 'RUS', 'GBR'];
export type ResKind = 'condemn' | 'ceasefire' | 'sanctions' | 'peacekeeping';
export type Vote = 'y' | 'n' | 'a';
export interface Resolution {
  id: Id; body: 'sc' | 'ga'; kind: ResKind; target: Id; war?: Id; sponsor: Id;
  tabled: number; closes: number; votes: Record<Id, Vote>;
  status: 'open' | 'passed' | 'failed' | 'vetoed'; vetoedBy?: Id[]; result?: string;
}
export interface UnSanctions { res: Id; target: Id; until: number; imposed: Id[] }
export interface Dispute { id: Id; complainant: Id; respondent: Id; filed: number; ruling: number; status: 'open' | 'won' | 'lost' | 'security' | 'complied' | 'retaliation'; deadline?: number }
export interface ImfProgramme { nation: Id; start: number; until: number; amount: number }
export interface IntlState {
  seats: { nation: Id; until: number }[]; // elected Security Council members
  resolutions: Resolution[];
  sanctions: UnSanctions[];
  g20: { year: number; host: Id; text: string }[];
  disputes: Dispute[];
  imf: ImfProgramme[];
}

export const RES_INFO: Record<ResKind, { name: string; desc: string }> = {
  condemn: { name: 'Condemn the aggression', desc: 'A formal condemnation: the target loses standing with the countries that voted for it.' },
  ceasefire: { name: 'Demand a ceasefire', desc: 'A call to stop fighting: the sides are pressed to accept an armistice.' },
  sanctions: { name: 'Impose sanctions', desc: 'Binding sanctions for a year: every member must cut trade with the target (its friends may not comply).' },
  peacekeeping: { name: 'Send peacekeepers', desc: 'A UN force separates the sides of a civil war or a war of secession for two years: the fighting stops along the line, and the sides are pushed towards reconciliation.' },
};

const isoId = (w: World, iso: string) => w.nations.find((n) => n.iso === iso)?.id;
export function intlOf(w: World): IntlState {
  if (w.intl) return w.intl;
  w.intl = { seats: [], resolutions: [], sanctions: [], g20: [], disputes: [], imf: [] };
  const kor = isoId(w, 'KOR');
  if (kor != null) w.intl.seats.push({ nation: kor, until: timeOfDate(2026, 0, 1) }); // elected for 2024–25
  electSeats(w, 3, [timeOfDate(2026, 0, 1), timeOfDate(2027, 0, 1), timeOfDate(2027, 0, 1)], [], true);
  return w.intl;
}
export const permanentIds = (w: World) => PERMANENT.map((iso) => isoId(w, iso)).filter((x): x is Id => x != null && !w.nations[x].exile);
export const councilMembers = (w: World) => [...permanentIds(w), ...intlOf(w).seats.map((s) => s.nation).filter((x) => !w.nations[x].exile)];

/** The General Assembly elects countries to the open Security Council seats: standing and goodwill count. */
function electSeats(w: World, count: number, terms: number[], leaving: Id[] = [], quiet = false) {
  const st = w.intl!;
  const taken = new Set([...permanentIds(w), ...st.seats.map((s) => s.nation), ...leaving]); // no immediate re-election
  for (let i = 0; i < count; i++) {
    const cands = w.nations.filter((n) => !n.exile && !taken.has(n.id));
    if (!cands.length) return;
    const score = (n: Nation) => prestigeOf(w, n) + w.nations.reduce((s, o) => s + Math.max(0, o.relations[n.id]?.score ?? 0), 0) / 20 + rand(w, 0, 25);
    const best = cands.map((n) => ({ n, s: score(n) })).sort((a, b) => b.s - a.s || a.n.id - b.n.id)[0].n;
    st.seats.push({ nation: best.id, until: terms[i] });
    taken.add(best.id);
    if (!quiet) record(w, 'diplomacy', `🇺🇳 ${best.name} was elected to the UN Security Council for two years.`, { nation: best.id });
  }
}

// ---------- resolutions ----------

/** How a country leans on a resolution (above 0.5 yes, below 0.2 no, between abstain). */
export function lean(w: World, v: Nation, r: Pick<Resolution, 'kind' | 'target' | 'sponsor' | 'war'>): number {
  if (v.id === r.target) return 0;
  if (v.id === r.sponsor) return 1;
  const t = w.nations[r.target];
  const relT = v.relations[t.id]?.score ?? 0, relS = v.relations[r.sponsor]?.score ?? 0;
  const war = r.war != null ? w.wars[r.war] : null;
  const victim = war && (war.def === v.id || v.alliances.includes(war.def));
  // Most countries oppose aggression on principle; only its friends and allies stand with the aggressor.
  let y = 0.6 - relT / 110 + relS / 300 + (victim ? 0.6 : 0) - (v.alliances.includes(t.id) ? 0.7 : 0);
  if (r.kind === 'sanctions') y -= 0.3 + Math.min(0.2, (v.ties?.[t.id]?.interdep ?? 0) / 300); // sanctions cost the sanctioner too
  if (r.kind === 'ceasefire') y += 0.15;
  if (r.kind === 'peacekeeping') y += 0.25 - (war && war.def !== v.id && (v.relations[war.def]?.score ?? 0) < -40 ? 0.3 : 0); // a cheap way to stop the killing, unless you want the rebels beaten
  if (activeWars(w).some((x) => x.att === v.id)) y -= 0.15; // those waging wars dislike precedents
  y += (nationalStaffing(w, r.sponsor, 'intl') - 0.6) * 0.15; // a sponsor well represented in the UN system lobbies better
  return y;
}
const voteOf = (y: number): Vote => (y > 0.5 ? 'y' : y < 0.2 ? 'n' : 'a');

export function tableCheck(w: World, n: Nation, body: 'sc' | 'ga', kind: ResKind, target: Id): string | null {
  const st = intlOf(w);
  if (n.exile) return 'A government in exile cannot table resolutions.';
  if (!w.nations[target] || target === n.id) return 'Pick another country.';
  if (body === 'sc' && !councilMembers(w).includes(n.id)) return 'Only Security Council members table resolutions there.';
  if (body === 'ga' && kind === 'sanctions') return 'Only the Security Council can impose binding sanctions.';
  if (st.resolutions.some((r) => r.status === 'open' && r.target === target && r.kind === kind)) return 'A resolution like it is already before the UN.';
  if (st.resolutions.some((r) => r.sponsor === n.id && w.time - r.tabled < 7 * DAY)) return 'You tabled a resolution in the last week.';
  if (kind === 'peacekeeping') {
    if (body !== 'sc') return 'Only the Security Council can send peacekeepers.';
    if (!activeWars(w).some((x) => x.att === target && (x.kind === 'civil' || x.kind === 'secession'))) return 'Peacekeepers are for a government fighting a civil war or a war of secession.';
  }
  if (kind !== 'condemn' && !activeWars(w).some((x) => x.att === target)) return 'This resolution is for a country waging war.';
  if (kind === 'condemn' && !Object.values(w.wars).some((x) => x.att === target && (x.status === 'active' || x.declared > w.time - 30 * DAY))) return 'Condemnation is for a country that has attacked another in the last month.';
  return null;
}

export function tableResolution(w: World, n: Nation, body: 'sc' | 'ga', kind: ResKind, target: Id): Resolution | null {
  if (tableCheck(w, n, body, kind, target)) return null;
  const war = (kind === 'peacekeeping' ? activeWars(w).find((x) => x.att === target && (x.kind === 'civil' || x.kind === 'secession')) : null) ?? activeWars(w).find((x) => x.att === target) ?? Object.values(w.wars).filter((x) => x.att === target).sort((a, b) => b.declared - a.declared)[0];
  const r: Resolution = { id: nid(w), body, kind, target, war: war?.id, sponsor: n.id, tabled: w.time, closes: w.time + 3 * DAY, votes: { [n.id]: 'y' }, status: 'open' };
  intlOf(w).resolutions.push(r);
  const text = `🇺🇳 ${n.name} tabled a resolution at the ${body === 'sc' ? 'Security Council' : 'General Assembly'}: ${RES_INFO[kind].name.toLowerCase()} — ${w.nations[target].name}. The vote is in three days.`;
  record(w, 'diplomacy', text, { nation: n.id });
  const pl = player(w), pn = w.nations[pl.nation];
  if (pn.president === pl.id && voters(w, r).includes(pn.id)) notify(w, 'diplomacy', `${text} Cast ${pn.name}'s vote on the Diplomacy screen.`, { link: 'diplomacy' });
  return r;
}
export const voters = (w: World, r: Resolution) => (r.body === 'sc' ? councilMembers(w) : w.nations.filter((n) => !n.exile).map((n) => n.id));

export function castCheck(w: World, n: Nation, r: Resolution | undefined): string | null {
  if (!r || r.status !== 'open') return 'The vote has closed.';
  if (!voters(w, r).includes(n.id)) return `${n.name} has no vote here.`;
  if (r.target === n.id) return 'You are the target.';
  if (r.votes[n.id] && n.id !== r.sponsor) return 'Already voted.';
  return null;
}
export function castVote(w: World, n: Nation, r: Resolution, v: Vote) {
  if (castCheck(w, n, r)) return;
  r.votes[n.id] = v;
}

function closeResolution(w: World, r: Resolution) {
  const ids = voters(w, r);
  const pl = player(w), pn = w.nations[pl.nation];
  for (const id of ids) {
    if (r.votes[id] || id === r.target) continue;
    if (id === pn.id && pn.president === pl.id) { r.votes[id] = 'a'; continue; } // the player did not vote
    r.votes[id] = voteOf(lean(w, w.nations[id], r));
  }
  const yes = ids.filter((i) => r.votes[i] === 'y').length, no = ids.filter((i) => r.votes[i] === 'n').length;
  const tName = w.nations[r.target].name;
  if (r.body === 'sc') {
    const vetoes = permanentIds(w).filter((i) => r.votes[i] === 'n' || i === r.target);
    if (vetoes.length) { r.status = 'vetoed'; r.vetoedBy = vetoes; }
    else r.status = yes >= Math.ceil(ids.length * 0.6) ? 'passed' : 'failed';
  } else r.status = yes > no ? 'passed' : 'failed';
  const where = r.body === 'sc' ? 'Security Council' : 'General Assembly';
  let text = `🇺🇳 ${where}: the resolution to ${RES_INFO[r.kind].name.toLowerCase()} — ${tName} — `;
  if (r.status === 'vetoed') text += `was vetoed by ${r.vetoedBy!.map((i) => w.nations[i].name).join(' and ')} (${yes} for, ${no} against).`;
  else if (r.status === 'failed') text += `failed (${yes} for, ${no} against).`;
  else {
    text += `passed (${yes} for, ${no} against). `;
    text += enactResolution(w, r);
  }
  r.result = text;
  record(w, 'diplomacy', text, { nation: r.target, important: r.status === 'passed' || r.status === 'vetoed' });
  for (const id of [r.target, r.sponsor]) (w.nations[id].chronicle ??= []).push({ t: w.time, text });
  if (ids.includes(pn.id) || r.target === pn.id) notify(w, 'diplomacy', text, { link: 'diplomacy' });
  // The sponsor and the vetoing powers are remembered.
  for (const v of r.vetoedBy ?? []) if (v !== r.target) relation(w, v, r.sponsor, -3, 'clashed at the Security Council');
}

function enactResolution(w: World, r: Resolution): string {
  const t = w.nations[r.target];
  const st = intlOf(w);
  switch (r.kind) {
    case 'condemn':
      for (const [id, v] of Object.entries(r.votes)) if (v === 'y' && Number(id) !== t.id) noteTrust(w, Number(id), t.id, -3);
      return `${t.name} stands condemned.`;
    case 'ceasefire': {
      const war = r.war != null ? w.wars[r.war] : null;
      if (!war || war.status !== 'active') return 'The war had already ended.';
      if (chance(w, 0.45)) { settle(w, war, 'armistice'); return 'Both sides accepted a ceasefire.'; }
      for (const n of w.nations) if (n.id !== t.id && !n.exile) noteTrust(w, n.id, t.id, -2);
      return `${t.name} ignored the call and fought on.`;
    }
    case 'sanctions': {
      const imposed: Id[] = [];
      const defied: string[] = [];
      for (const n of w.nations) {
        if (n.id === t.id || n.exile || n.embargoes.includes(t.id)) continue;
        if ((n.relations[t.id]?.score ?? 0) > 40 || n.alliances.includes(t.id)) { defied.push(n.name); noteTrust(w, n.id, r.sponsor, -2); continue; }
        n.embargoes.push(t.id);
        imposed.push(n.id);
      }
      st.sanctions.push({ res: r.id, target: t.id, until: w.time + 365 * DAY, imposed });
      return `${imposed.length} countries cut trade with ${t.name} for a year${defied.length ? `; ${defied.join(', ')} did not comply` : ''}.`;
    }
    case 'peacekeeping': {
      const war = r.war != null ? w.wars[r.war] : null;
      if (!war || war.status !== 'active') return 'The war had already ended.';
      const by = Object.entries(r.votes).filter(([, v]) => v === 'y').map(([id]) => Number(id)).filter((id) => id !== war.att && id !== war.def);
      freeze(w, war);
      war.peacekeepers = { until: w.time + 2 * 365 * DAY, by };
      return `A UN force${by.length ? ` (troops from ${by.slice(0, 4).map((id) => w.nations[id].name).join(', ')})` : ''} now holds the line between ${t.name} and ${w.nations[war.def].name}.`;
    }
  }
}

/** The AI powers bring wars of aggression before the UN. */
function aiTable(w: World) {
  const st = intlOf(w);
  const pl = player(w);
  // Wars under way, and aggressions of the last month that are already over (they can still be condemned).
  for (const war of Object.values(w.wars).filter((x) => x.status === 'active' || x.declared > w.time - 30 * DAY)) {
    const age = (w.time - war.declared) / DAY;
    const over = war.status !== 'active';
    const att = war.att;
    const about = (k: ResKind, body?: 'sc' | 'ga') => st.resolutions.some((r) => r.war === war.id && r.kind === k && (body == null || r.body === body));
    const vetoed = st.resolutions.some((r) => r.war === war.id && r.kind === 'condemn' && r.status === 'vetoed');
    // A sponsor: the council member most hostile to the aggressor (or friendliest to the victim).
    const council = councilMembers(w).filter((i) => i !== att && w.nations[i].president !== pl.id);
    const sponsor = council.map((i) => ({ i, s: -(w.nations[i].relations[att]?.score ?? 0) + (w.nations[i].relations[war.def]?.score ?? 0) / 2 + (i === war.def ? 100 : 0) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)[0];
    const gaSponsor = w.nations.filter((n) => n.id === war.def && n.president !== pl.id)[0];
    // A government fighting rebels is not condemned as an aggressor; the Council may send peacekeepers.
    if (war.kind === 'civil' || war.kind === 'secession') {
      if (!over && age >= 14 && !about('peacekeeping') && sponsor) tableResolution(w, w.nations[sponsor.i], 'sc', 'peacekeeping', att);
      continue;
    }
    if (age >= 2 && !about('condemn')) {
      if (sponsor && sponsor.s > 30) tableResolution(w, w.nations[sponsor.i], 'sc', 'condemn', att);
      else if (gaSponsor) tableResolution(w, gaSponsor, 'ga', 'condemn', att);
    } else if (vetoed && !about('condemn', 'ga')) {
      // Blocked in the Council, the matter goes to the General Assembly ("Uniting for Peace").
      const s = w.nations.filter((n) => !n.exile && n.id !== att && n.president !== pl.id).sort((a, b) => (a.relations[att]?.score ?? 0) - (b.relations[att]?.score ?? 0) || a.id - b.id)[0];
      if (s) tableResolution(w, s, 'ga', 'condemn', att);
    } else if (over) continue;
    else if (age >= 10 && !about('ceasefire') && sponsor) tableResolution(w, w.nations[sponsor.i], 'sc', 'ceasefire', att);
    else if (age >= 20 && war.occupied.length && !about('sanctions') && sponsor && sponsor.s > 50) tableResolution(w, w.nations[sponsor.i], 'sc', 'sanctions', att);
  }
}

// ---------- the G20 ----------

function g20Summit(w: World) {
  const st = intlOf(w);
  const year = dateAt(w.time).year;
  if (st.g20.some((g) => g.year === year)) return;
  const members = w.nations.filter((n) => !n.exile);
  const order = [...members].sort((a, b) => a.iso.localeCompare(b.iso));
  const host = order[(year - 2025 + order.findIndex((n) => n.iso === 'ZAF') + order.length) % order.length]; // South Africa hosted in 2025
  const shunned = members.filter((n) => activeWars(w).some((x) => x.att === n.id));
  const present = members.filter((n) => !shunned.includes(n));
  let warmed = 0;
  for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
    const a = present[i], b = present[j];
    if ((a.relations[b.id]?.score ?? 0) > -30) { noteTrust(w, a.id, b.id, 1); warmed++; }
  }
  const rels = present.flatMap((a) => present.filter((b) => b.id !== a.id).map((b) => a.relations[b.id]?.score ?? 0));
  const mood = rels.length ? rels.reduce((s, x) => s + x, 0) / rels.length : 0;
  const text = `🌐 G20 summit in ${host.name}: ${mood > 5 ? 'leaders agreed a joint statement on growth, trade and climate' : 'divisions kept the leaders from agreeing a joint statement'}${shunned.length ? `; ${shunned.map((n) => n.name).join(' and ')} ${shunned.length > 1 ? 'were' : 'was'} shunned over ${shunned.length > 1 ? 'their wars' : 'its war'}` : ''}.`;
  st.g20.push({ year, host: host.id, text });
  if (st.g20.length > 30) st.g20.shift();
  record(w, 'diplomacy', text, { nation: host.id, important: true });
  (host.chronicle ??= []).push({ t: w.time, text });
  notify(w, 'diplomacy', text, { link: 'diplomacy' });
  void warmed;
}

// ---------- the WTO ----------

function wtoDaily(w: World) {
  const st = intlOf(w);
  const unBacked = (a: Id, b: Id) => st.sanctions.some((s) => s.target === b && s.until > w.time && s.imposed.includes(a));
  for (const n of w.nations) {
    if (n.exile) continue;
    for (const t of n.embargoes) {
      if (unBacked(n.id, t) || activeWars(w).some((x) => (x.att === n.id && x.def === t) || (x.att === t && x.def === n.id))) continue;
      if (st.disputes.some((d) => d.complainant === t && d.respondent === n.id && (d.status === 'open' || w.time - d.filed < 3 * 365 * DAY))) continue;
      // Rivals who sanction each other do not bother with the WTO.
      if (w.nations[t].exile || w.nations[t].embargoes.includes(n.id) || (w.nations[t].relations[n.id]?.score ?? 0) < -40 || !chance(w, 0.01)) continue;
      st.disputes.push({ id: nid(w), complainant: t, respondent: n.id, filed: w.time, ruling: w.time + 365 * DAY, status: 'open' });
      record(w, 'diplomacy', `⚖️ ${w.nations[t].name} took ${n.name}'s sanctions to the WTO.`, { nation: t });
    }
  }
  for (const d of st.disputes) {
    const c = w.nations[d.complainant], r = w.nations[d.respondent];
    if (d.status === 'open' && w.time >= d.ruling) {
      if (!r.embargoes.includes(c.id)) { d.status = 'complied'; continue; }
      const threat = r.ties?.[c.id]?.threat ?? 0;
      if ((threat > 25 || (r.relations[c.id]?.score ?? 0) < -30) && chance(w, 0.8)) { d.status = 'security'; record(w, 'diplomacy', `⚖️ The WTO accepted ${r.name}'s national-security defence in its dispute with ${c.name}.`, { nation: r.id }); continue; }
      if (chance(w, 0.75 + (nationalStaffing(w, c.id, 'trade') - nationalStaffing(w, r.id, 'trade')) * 0.2)) { // the better trade lawyers
        d.status = 'won'; d.deadline = w.time + 90 * DAY;
        record(w, 'diplomacy', `⚖️ The WTO ruled for ${c.name}: ${r.name}'s sanctions break trade rules and must go within 90 days.`, { nation: c.id, important: true });
      } else { d.status = 'lost'; record(w, 'diplomacy', `⚖️ The WTO rejected ${c.name}'s complaint against ${r.name}.`, { nation: c.id }); }
    } else if (d.status === 'won' && d.deadline && w.time >= d.deadline) {
      if (!r.embargoes.includes(c.id)) { d.status = 'complied'; continue; }
      d.status = 'retaliation';
      if (!c.embargoes.includes(r.id)) c.embargoes.push(r.id);
      for (const o of w.nations) if (o.id !== r.id && !o.exile) noteTrust(w, o.id, r.id, -1);
      record(w, 'diplomacy', `⚖️ ${r.name} ignored the WTO ruling; ${c.name} was authorised to retaliate.`, { nation: c.id, important: true });
    }
  }
  if (st.disputes.length > 60) st.disputes.splice(0, st.disputes.length - 60);
}

// ---------- the IMF ----------

export const imfActive = (w: World, n: Id) => (w.intl?.imf ?? []).some((p) => p.nation === n && p.until > w.time);

function imfMonth(w: World) {
  const st = intlOf(w);
  const scores = nationScores(w);
  for (const n of w.nations) {
    if (n.exile || imfActive(w, n.id) || st.imf.some((p) => p.nation === n.id && w.time - p.start < 3 * 365 * DAY)) continue;
    const reserveLow = (n.wallet[GOLD] ?? 0) < (B.fx.reserveTarget * 1000) * 0.15;
    const debtCrisis = (n.debt ?? 0) >= debtLimit(n) * 0.95 && (n.wallet[n.cur] ?? 0) < dailySpending(n) * 10;
    if (!reserveLow && !debtCrisis) continue;
    // The largest economies lend, pro rata, unless they are at odds with the borrower.
    const lenders = scores.filter((s) => s.id !== n.id && !w.nations[s.id].exile && !w.nations[s.id].embargoes.includes(n.id) && (w.nations[s.id].relations[n.id]?.score ?? 0) > -40)
      .sort((a, b) => b.economy - a.economy).slice(0, 5);
    let total = 0;
    for (const l of lenders) {
      const L = w.nations[l.id];
      const amt = Math.floor((L.wallet[GOLD] ?? 0) * 0.03);
      if (amt <= 0 || !pay(w, natref(L.id), natref(n.id), GOLD, amt, `IMF programme for ${n.name}`)) continue;
      const due = Math.round(amt * 1.03);
      (w.intlLoans ??= []).push({ id: nid(w), from: L.id, to: n.id, left: due, monthly: Math.ceil(due / 24), imf: true });
      total += amt;
    }
    if (!total) continue;
    st.imf.push({ nation: n.id, start: w.time, until: w.time + 2 * 365 * DAY, amount: total });
    n.approval = Math.max(0, n.approval - 6); // austerity
    const text = `🏦 ${n.name} agreed an IMF programme: ${fmtAmt(GOLD, total)} in emergency loans${debtCrisis ? ' as its borrowing hit the limit' : ' to rebuild its reserves'}, in return for austerity.`;
    record(w, 'economy', text, { nation: n.id, important: true });
    (n.chronicle ??= []).push({ t: w.time, text });
    if (player(w).nation === n.id) notify(w, 'economy', text, { critical: true });
  }
}

// ---------- daily ----------

export function intlDaily(w: World, days = 1) {
  const st = intlOf(w);
  const d = dateAt(w.time);
  for (const r of st.resolutions) if (r.status === 'open' && w.time >= r.closes) closeResolution(w, r);
  if (st.resolutions.length > 80) st.resolutions.splice(0, st.resolutions.length - 80);
  // Expired UN sanctions are lifted by those who imposed them.
  for (const s of [...st.sanctions]) if (s.until <= w.time) {
    for (const id of s.imposed) w.nations[id].embargoes = w.nations[id].embargoes.filter((x) => x !== s.target);
    st.sanctions.splice(st.sanctions.indexOf(s), 1);
    record(w, 'diplomacy', `🇺🇳 UN sanctions on ${w.nations[s.target].name} expired.`, { nation: s.target });
  }
  // Security Council elections take effect on 1 January.
  const expired = st.seats.filter((s) => s.until <= w.time);
  if (expired.length) { st.seats = st.seats.filter((s) => s.until > w.time); electSeats(w, expired.length, expired.map(() => timeOfDate(d.year + 2, 0, 1)), expired.map((s) => s.nation)); }
  aiTable(w);
  if (d.month === 10 && d.day >= 15 || (days > 1 && d.month === 11)) g20Summit(w);
  wtoDaily(w);
  if (d.day === 1) imfMonth(w);
  for (const n of w.nations) { const on = imfActive(w, n.id); if (on) n.imfRelief = true; else delete n.imfRelief; }
}
