// Collection (2.1 Shadows): where intelligence comes from.
// - Agents. Foreign citizens recruited by a service (the "recruit" operation) work for it
//   out of money, ideology, coercion or ego. The motive decides how reliable they are: an
//   ideological agent is steady, a mercenary goes where the money is, a coerced one may
//   confess, a vain one may drift away when neglected. What they can see depends on where
//   they sit: a minister or a fellow intelligence officer is worth far more than a clerk.
// - Defectors. Officials and intelligence officers of a failing or repressive government
//   sometimes cross to a rival, carrying what they know: the rival's picture of their
//   country sharpens at once, and their old service learns a hard lesson.
// - Diplomatic cover. Embassies shelter intelligence stations: networks grow faster in a
//   country where the embassy is open, and slowly where diplomats were expelled or there is
//   war.
// - Signals, imagery and open sources come from the directorates (intelOrg.ts, beliefs.ts);
//   cyber intrusions into ministries and companies are an operation (intel.ts).
import type { Citizen, Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { nid, notify, record } from '../engine/events';
import { chance, pick } from '../engine/rng';
import { census, invalidateCensus } from './census';
import { player } from './query';
import { relation } from './congress';
import { refresh } from './beliefs';
import { noteLesson } from './intelOrg';
import { changeCitizenship } from './travel';
import { warBetween } from './war';
import { capsOf, historyPace } from './strategic';
import { scoped } from './scope';

export type Motive = 'money' | 'ideology' | 'coercion' | 'ego';
export const MOTIVE_LABEL: Record<Motive, string> = { money: 'money', ideology: 'conviction', coercion: 'coercion', ego: 'vanity' };

/** Why a citizen would work for a foreign service. */
export function motiveFor(w: World, c: Citizen, sponsor: Nation): Motive {
  const home = w.nations[c.nation];
  const party = c.party != null ? w.parties[c.party] : null;
  const sponsorIdeo = Object.entries(seatsOf(w, sponsor)).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (party && sponsorIdeo && party.ideo === sponsorIdeo && home.approval < 45) return 'ideology';
  if (c.sec.record.convictions > 0 || c.sec.syndicate != null || c.sec.heat > 40) return 'coercion';
  if (c.influence > 300 && c.traits.greed < 0.5) return 'ego';
  return 'money';
}
function seatsOf(w: World, n: Nation): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pid, s] of Object.entries(n.seats)) { const p = w.parties[Number(pid)]; if (p) out[p.ideo] = (out[p.ideo] ?? 0) + s; }
  return out;
}

/** How much a placed agent sees (adds to the sponsor's collection quality on their country). */
export function placementOf(w: World, c: Citizen): { weight: number; label: string } {
  const n = w.nations[c.nation];
  if (n.president === c.id) return { weight: 0.3, label: 'head of government' };
  if (Object.values(n.cabinet).includes(c.id)) return { weight: 0.15, label: 'minister' };
  if (c.sec.agency === c.nation) return { weight: 0.12, label: 'intelligence officer' };
  if (n.deputies.includes(c.id)) return { weight: 0.06, label: 'member of congress' };
  if (c.mil?.commissioned && !c.mil.reserve) return { weight: 0.05, label: 'military officer' };
  if (c.post?.kind === 'diplomat' || c.post?.kind === 'procurement') return { weight: 0.04, label: c.post.kind === 'diplomat' ? 'diplomat' : 'defence official' };
  return { weight: 0.01, label: 'ordinary citizen' };
}

/** The extra quality `n`'s agents inside `t` give its estimates (0..0.35). */
export function agentQuality(w: World, n: Nation, t: Nation): number {
  const all = scoped('agentQuality', () => {
    const m = new Map<string, number>();
    for (const c of census(w).all) if (c.sec.asset != null && !c.gone) m.set(`${c.sec.asset}:${c.nation}`, (m.get(`${c.sec.asset}:${c.nation}`) ?? 0) + placementOf(w, c).weight);
    return m;
  });
  return Math.min(0.35, all.get(`${n.id}:${t.id}`) ?? 0);
}
export const agentsOf = (w: World, n: Id, t?: Id) => census(w).all.filter((c) => c.sec.asset === n && (t == null || c.nation === t) && !c.gone);

/** Diplomatic cover: an open embassy speeds up a network; expulsions and war slow it. */
export function coverFactor(w: World, n: Nation, t: Nation): number {
  if (warBetween(w, n.id, t.id)) return 0.5;
  const expelled = Math.max(n.dip?.last[`expel:${t.id}`] ?? -Infinity, t.dip?.last[`expel:${n.id}`] ?? -Infinity);
  return w.time - expelled < 365 * DAY ? 0.6 : 1.2;
}

// ---------- agents' loyalty, month by month ----------

function agentsMonth(w: World) {
  const p = player(w);
  for (const c of census(w).all) {
    if (c.sec.asset == null || c.player || c.gone) continue;
    const handler = w.nations[c.sec.asset];
    const motive = c.sec.motive ?? 'money';
    // Each motive has its own way of ending.
    const quit = motive === 'ideology' ? 0.005 : motive === 'money' ? ((handler.wallet[handler.cur] ?? 0) <= 0 ? 0.3 : 0.02) : motive === 'ego' ? 0.04 : 0.01;
    const confess = motive === 'coercion' ? 0.03 : 0;
    if (chance(w, confess)) {
      c.sec.asset = null;
      const home = w.nations[c.nation];
      handler.agency.network[home.id] = Math.max(0, (handler.agency.network[home.id] ?? 0) - 12);
      noteLesson(handler, 'humint', 1);
      relation(w, home.id, handler.id, -6, 'an agent confessed to our counter-intelligence');
      record(w, 'espionage', `🕵️ ${c.name} walked into the ${home.agency.name} and confessed to spying for ${handler.name} under pressure.`, { nation: home.id, cit: c.id, important: home.id === p.nation || handler.id === p.nation });
    } else if (chance(w, quit)) {
      c.sec.asset = null;
      delete c.sec.motive;
    }
  }
}

// ---------- defectors ----------

function defectorsMonth(w: World) {
  const p = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    // Those who know things, in a government that is failing or feared at home.
    const strain = (n.approval < 35 ? 0.5 : 0) + (n.unemployment > 0.15 ? 0.2 : 0);
    // Officers far more often than ministers; and rarely from open societies, where leaving is easier than defecting.
    const officers = census(w).all.filter((c) => c.nation === n.id && !c.player && !c.gone && c.sec.agency === n.id && c.traits.loyalty < 0.8); // services recruit the loyal, so disaffection is relative
    const ministers = census(w).all.filter((c) => c.nation === n.id && !c.player && !c.gone && Object.values(n.cabinet).includes(c.id) && c.traits.loyalty < 0.25);
    const open = capsOf(w, n).inst.press;
    if (!officers.length && !ministers.length) continue;
    if (!chance(w, (0.002 + strain * 0.03) * (1 - open * 0.8))) continue;
    const c = officers.length && (!ministers.length || chance(w, 0.85)) ? pick(w, officers) : pick(w, ministers);
    // They go to the most capable rival of their country.
    const rivals = w.nations.filter((o) => o.id !== n.id && !o.exile && (o.relations[n.id]?.score ?? 0) < 0).sort((a, b) => (a.relations[n.id]?.score ?? 0) - (b.relations[n.id]?.score ?? 0));
    const dest = rivals[0];
    if (!dest) continue;
    defect(w, c, dest);
    if (n.id === p.nation || dest.id === p.nation) notify(w, 'politics', `🕵️ ${c.name} of ${n.name} has defected to ${dest.name}.`, { link: 'intel' });
  }
}

/** A citizen crosses over to `dest`, carrying what they know. */
export function defect(w: World, c: Citizen, dest: Nation) {
  const from = w.nations[c.nation];
  const officer = c.sec.agency === from.id;
  const what = officer ? 'an intelligence officer' : Object.values(from.cabinet).includes(c.id) ? 'a minister' : 'an official';
  if (officer) { c.sec.agency = null; c.sec.arank = 0; }
  c.sec.asset = null;
  changeCitizenship(w, c, dest.id);
  const cap = w.regions[dest.capital];
  if (cap) c.loc = cap.id;
  invalidateCensus(w);
  refresh(w, dest, from, 0.9); // a debriefing is worth a year of collection
  dest.agency.network[from.id] = Math.min(100, (dest.agency.network[from.id] ?? 0) + (officer ? 20 : 10));
  noteLesson(from, 'counter', 2);
  relation(w, from.id, dest.id, -5, 'gave asylum to a defector');
  const text = `🛬 ${c.name}, ${what} of ${from.name}, defected to ${dest.name}.`;
  record(w, 'espionage', text, { nation: from.id, cit: c.id, important: true });
  (from.chronicle ??= []).push({ t: w.time, text });
  (w.defections ??= []).push({ id: nid(w), t: w.time, cit: c.id, from: from.id, to: dest.id, what });
  if (w.defections.length > 50) w.defections.shift();
}

export function collectionDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) { agentsMonth(w); defectorsMonth(w); }
}
