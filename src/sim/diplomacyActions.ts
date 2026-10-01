// Diplomatic actions (2.0 GEO 4). A government acts abroad with a limited store of
// diplomatic capital: it regenerates daily, faster for countries with standing, and every
// action spends some. Some also cost money. Actions:
// - statements (praise or condemn), summits (closer ties; treaties come easier for two months),
// - aid grants and loans (repaid monthly with interest; a default is a grievance),
// - sanctions and their lifting, expelling diplomats,
// - treaty offers and renunciations (sim/treaties.ts),
// - ultimatums (comply, or hand the issuer a cause for war),
// - mediation between countries at war.
// The AI governments use the same actions on the same terms.
import { believedPower } from './beliefs';
import type { Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { GOLD, fmtAmt } from '../engine/money';
import { pay } from '../engine/ledger';
import { nid, notify, record } from '../engine/events';
import { fail, ok, type Result } from '../engine/result';
import { chance, pick, weighted } from '../engine/rng';
import { natref, player } from './query';
import { nationalStaffing } from './services';
import { relation } from './congress';
import { addGrievance, leaderProfile, noteTrust, prestigeOf, tiesOfPair } from './relations';
import { TREATY_INFO, activeTreaties, alliedPower, allTreaties, offerTreaty, proposeTreatyCheck, willingness, renounce, treatyBetween, type TreatyKind } from './treaties';
import { activeWars, militaryPower, peaceAppetite, settle, warBetween } from './war';

export type DipAction = 'praise' | 'condemn' | 'summit' | 'aid' | 'loan' | 'sanction' | 'liftSanctions' | 'expel' | 'treaty' | 'renounce' | 'ultimatum' | 'mediate';
export type Demand = 'liftSanctions' | 'endWar' | 'leaveAlliance';
export interface DipParams { target: Id; kind?: TreatyKind; treaty?: Id; demand?: Demand; war?: Id; other?: Id }
export interface IntlLoan { id: Id; from: Id; to: Id; left: number; monthly: number; defaulted?: boolean; imf?: boolean }
export interface DipState { capital: number; last: Record<string, number>; casusBelli?: Record<Id, number> }

export const DIP_INFO: Record<DipAction, { name: string; capital: number; cooldown: number; desc: string }> = {
  praise: { name: 'Praise publicly', capital: 5, cooldown: 90, desc: 'A warm statement: a little more trust.' },
  condemn: { name: 'Condemn publicly', capital: 5, cooldown: 30, desc: 'A sharp statement: trust falls; popular at home if they are disliked.' },
  summit: { name: 'Hold a summit', capital: 20, cooldown: 120, desc: 'The leaders meet: trust grows, and for two months treaties come easier.' },
  aid: { name: 'Send aid', capital: 10, cooldown: 60, desc: 'A grant from the treasury (5% of its gold): trust grows with the size of the gift.' },
  loan: { name: 'Offer a loan', capital: 10, cooldown: 180, desc: 'Lend 10% of the treasury\'s gold, repaid over a year at 4%. A default leaves a grievance.' },
  sanction: { name: 'Impose sanctions', capital: 15, cooldown: 30, desc: 'Cut trade by decree (an embargo): trade ties wither and relations fall.' },
  liftSanctions: { name: 'Lift sanctions', capital: 5, cooldown: 30, desc: 'End the embargo.' },
  expel: { name: 'Expel diplomats', capital: 10, cooldown: 365, desc: 'Expel their diplomats (and lose yours): trust falls; their agency\'s networks here are hurt.' },
  treaty: { name: 'Offer a treaty', capital: 25, cooldown: 60, desc: 'Propose an agreement; they sign if it suits them.' },
  renounce: { name: 'Renounce a treaty', capital: 10, cooldown: 0, desc: 'Walk away from an agreement: partners trust you less, and attacking them within a year is a betrayal.' },
  ultimatum: { name: 'Issue an ultimatum', capital: 30, cooldown: 180, desc: 'A demand backed by force: they give in if weaker and cautious; refusal gives you a cause for war for 90 days.' },
  mediate: { name: 'Mediate a war', capital: 30, cooldown: 30, desc: 'Offer to broker a ceasefire between two countries at war; success raises your standing.' },
};
export const DEMAND_NAME: Record<Demand, string> = { liftSanctions: 'lift their sanctions on us', endWar: 'end the war they started', leaveAlliance: 'leave their alliance with our rival' };
/** The demand as the world reports it. */
export function demandText(w: World, n: Nation, p: DipParams): string {
  switch (p.demand) {
    case 'liftSanctions': return `lift its sanctions on ${n.name}`;
    case 'endWar': return 'end the war it started';
    case 'leaveAlliance': return `leave its alliance with ${w.nations[p.other!]?.name ?? 'a rival'}`;
  }
  return '';
}

export function dipOf(n: Nation): DipState {
  return (n.dip ??= { capital: 50, last: {} });
}
const key = (a: DipAction, t: Id) => `${a}:${t}`;

/** Who conducts foreign policy: the head of government. */
export const foreignActor = (n: Nation) => n.president;

export function dipCheck(w: World, n: Nation, a: DipAction, p: DipParams): string | null {
  const d = dipOf(n);
  const info = DIP_INFO[a];
  if (n.exile) return 'A government in exile has no diplomacy.';
  const t = w.nations[p.target];
  if (a !== 'mediate' && (!t || t.id === n.id)) return 'Pick another country.';
  if (t?.exile && a !== 'condemn' && a !== 'praise') return `${t.name} has no government at home.`;
  if (d.capital < info.capital) return `Needs ${info.capital} diplomatic capital (you have ${Math.floor(d.capital)}).`;
  const last = d.last[key(a, p.target)];
  if (info.cooldown && last != null && w.time - last < info.cooldown * DAY) return `Done recently; again in ${Math.ceil((last + info.cooldown * DAY - w.time) / DAY)} days.`;
  switch (a) {
    case 'aid': case 'loan':
      if ((n.wallet[GOLD] ?? 0) < 20000) return 'The treasury has too little gold.';
      if (warBetween(w, n.id, t.id)) return 'You are at war with them.';
      if (a === 'loan' && (w.intlLoans ?? []).some((l) => l.from === n.id && l.to === t.id && l.left > 0)) return 'They are still repaying a loan from you.';
      return null;
    case 'sanction': return n.embargoes.includes(t.id) ? 'Sanctions are already in force.' : null;
    case 'liftSanctions': return n.embargoes.includes(t.id) ? null : 'No sanctions to lift.';
    case 'treaty': return p.kind ? proposeTreatyCheck(w, n, t, p.kind) : 'Pick a kind of treaty.';
    case 'renounce': { const tr = w.treaties?.[p.treaty!]; return !tr || tr.status !== 'active' || !tr.parties.includes(n.id) ? 'Pick a treaty in force.' : null; }
    case 'ultimatum': {
      if (!p.demand) return 'Choose a demand.';
      if (p.demand === 'liftSanctions' && !t.embargoes.includes(n.id)) return 'They have no sanctions on you.';
      if (p.demand === 'endWar' && !activeWars(w).some((x) => x.att === t.id)) return 'They are not waging a war.';
      if (p.demand === 'leaveAlliance' && p.other == null) return 'Name the alliance partner.';
      return null;
    }
    case 'mediate': {
      const war = w.wars[p.war!];
      if (!war || war.status !== 'active') return 'Pick a war under way.';
      if (war.att === n.id || war.def === n.id) return 'You cannot mediate your own war.';
      return null;
    }
  }
  return null;
}

const spend = (w: World, n: Nation, a: DipAction, t: Id) => { const d = dipOf(n); d.capital -= DIP_INFO[a].capital; d.last[key(a, t)] = w.time; };
function note(w: World, n: Nation, text: string, important = false, also?: Id) {
  record(w, 'diplomacy', text, { nation: n.id, important });
  const pl = player(w).nation;
  if (pl === n.id || pl === also) notify(w, 'diplomacy', text, { link: 'diplomacy' });
}

export function doDiplomacy(w: World, n: Nation, a: DipAction, p: DipParams): Result {
  const why = dipCheck(w, n, a, p);
  if (why) return fail(why);
  spend(w, n, a, p.target);
  const t = w.nations[p.target];
  switch (a) {
    case 'praise': relation(w, n.id, t.id, 3, 'praised us'); note(w, n, `💬 ${n.name} praised ${t.name}.`, false, t.id); return ok(`${t.name} welcomed the words.`);
    case 'condemn': {
      relation(w, n.id, t.id, -6, 'condemned us');
      if ((n.relations[t.id]?.score ?? 0) < -20) n.approval = Math.min(100, n.approval + 1);
      note(w, n, `📢 ${n.name} condemned ${t.name}.`, false, t.id);
      return ok(`${t.name} protested.`);
    }
    case 'summit': {
      const rel = n.relations[t.id]?.score ?? 0;
      const warm = chance(w, 0.55 + rel / 200);
      relation(w, n.id, t.id, warm ? 6 : 1, warm ? 'a productive summit' : 'a frosty summit');
      (n.summits ??= {})[t.id] = w.time; (t.summits ??= {})[n.id] = w.time;
      note(w, n, `🤝 The leaders of ${n.name} and ${t.name} met for a summit${warm ? '; both sides spoke of a new chapter' : ', but it ended coldly'}.`, false, t.id);
      return ok(warm ? 'A productive summit. Treaties will come easier for two months.' : 'A frosty summit; little came of it.');
    }
    case 'aid': {
      const amt = Math.floor((n.wallet[GOLD] ?? 0) * 0.05);
      if (!pay(w, natref(n.id), natref(t.id), GOLD, amt, `Aid from ${n.name}`)) return fail('The payment failed.');
      const share = amt / Math.max(1, (t.wallet[GOLD] ?? 0));
      relation(w, n.id, t.id, Math.round(Math.min(12, 3 + share * 40)), 'sent us aid');
      note(w, n, `🎁 ${n.name} sent ${fmtAmt(GOLD, amt)} in aid to ${t.name}.`, false, t.id);
      return ok(`Sent ${fmtAmt(GOLD, amt)}.`);
    }
    case 'loan': {
      const amt = Math.floor((n.wallet[GOLD] ?? 0) * 0.1);
      if (!pay(w, natref(n.id), natref(t.id), GOLD, amt, `Loan from ${n.name}`)) return fail('The payment failed.');
      const total = Math.round(amt * 1.04);
      (w.intlLoans ??= []).push({ id: nid(w), from: n.id, to: t.id, left: total, monthly: Math.ceil(total / 12) });
      relation(w, n.id, t.id, 4, 'lent us money');
      note(w, n, `🏦 ${n.name} lent ${t.name} ${fmtAmt(GOLD, amt)}, to be repaid over a year.`, false, t.id);
      return ok(`Lent ${fmtAmt(GOLD, amt)}.`);
    }
    case 'sanction':
      n.embargoes.push(t.id);
      relation(w, n.id, t.id, -15, 'sanctions imposed');
      note(w, n, `⛔ ${n.name} imposed sanctions on ${t.name}.`, true, t.id);
      return ok('Sanctions in force.');
    case 'liftSanctions':
      n.embargoes = n.embargoes.filter((x) => x !== t.id);
      relation(w, n.id, t.id, 5, 'sanctions lifted');
      note(w, n, `✅ ${n.name} lifted its sanctions on ${t.name}.`, false, t.id);
      return ok('Sanctions lifted.');
    case 'expel': {
      relation(w, n.id, t.id, -10, 'expelled our diplomats');
      if (t.agency.network[n.id] != null) t.agency.network[n.id] = Math.floor(t.agency.network[n.id] / 2);
      note(w, n, `🚪 ${n.name} expelled ${t.name}'s diplomats; ${t.name} did the same.`, true, t.id);
      return ok('Diplomats expelled on both sides.');
    }
    case 'treaty': {
      const r = offerTreaty(w, n, t, p.kind!);
      if (!r.ok) dipOf(n).capital += DIP_INFO.treaty.capital / 2; // a refusal costs less
      return r.ok ? ok(r.msg) : fail(r.msg);
    }
    case 'renounce': {
      const tr = w.treaties![p.treaty!];
      renounce(w, n, tr);
      return ok(`${n.name} has left the ${tr.name}.`);
    }
    case 'ultimatum': return ultimatum(w, n, t, p);
    case 'mediate': return mediate(w, n, p.war!);
  }
  return fail('Unknown action.');
}

function ultimatum(w: World, n: Nation, t: Nation, p: DipParams): Result {
  const ratio = believedPower(w, t.id, n.id) / Math.max(1, militaryPower(w, t.id) + alliedPower(w, t.id)); // how strong they think we are; their allies stiffen their resolve
  const lp = leaderProfile(w, t);
  const comply = Math.max(0.03, Math.min(0.9, (ratio - 1) * 0.35 + 0.15 - lp.risk * 0.2 - lp.nationalism * 0.15));
  const what = demandText(w, n, p);
  if (chance(w, comply)) {
    if (p.demand === 'liftSanctions') t.embargoes = t.embargoes.filter((x) => x !== n.id);
    if (p.demand === 'endWar') for (const war of activeWars(w).filter((x) => x.att === t.id)) settle(w, war, 'armistice');
    if (p.demand === 'leaveAlliance') { const tr = treatyBetween(w, t.id, p.other!, 'defence'); if (tr) renounce(w, t, tr, `under pressure from ${n.name}`); }
    noteTrust(w, t.id, n.id, -10);
    note(w, n, `⚠️ ${t.name} gave in to ${n.name}'s ultimatum and agreed to ${what}.`, true, t.id);
    return ok(`${t.name} gave in.`);
  }
  relation(w, n.id, t.id, -15, 'issued us an ultimatum');
  (dipOf(n).casusBelli ??= {})[t.id] = w.time + 90 * DAY;
  note(w, n, `⚠️ ${t.name} rejected ${n.name}'s ultimatum to ${what}. ${n.name} now has a cause for war.`, true, t.id);
  return ok(`${t.name} refused. You have a cause for war against them for 90 days.`);
}

function mediate(w: World, n: Nation, warId: Id): Result {
  const war = w.wars[warId];
  const a = w.nations[war.att], d = w.nations[war.def];
  const p = 0.15 + prestigeOf(w, n) / 300 + (peaceAppetite(w, a, war, 'armistice') + peaceAppetite(w, d, war, 'armistice')) * 0.25
    + ((a.relations[n.id]?.score ?? 0) + (d.relations[n.id]?.score ?? 0)) / 400;
  if (chance(w, Math.max(0.03, Math.min(0.8, p)))) {
    settle(w, war, 'armistice');
    relation(w, n.id, a.id, 5, 'brokered peace'); relation(w, n.id, d.id, 5, 'brokered peace');
    for (const o of w.nations) if (o.id !== n.id) noteTrust(w, o.id, n.id, 1);
    note(w, n, `🕊️ ${n.name} brokered a ceasefire between ${a.name} and ${d.name}.`, true);
    return ok('Both sides accepted a ceasefire.');
  }
  note(w, n, `🕊️ ${n.name} tried to mediate between ${a.name} and ${d.name}, without success.`);
  return ok('The talks failed; the fighting goes on.');
}

/** A standing cause for war (from a rejected ultimatum). */
export const casusBelli = (w: World, n: Nation, t: Id) => (dipOf(n).casusBelli?.[t] ?? 0) > w.time;

// ---------- daily: capital, loan repayments, and the AI governments ----------

function loansMonth(w: World) {
  for (const l of w.intlLoans ?? []) {
    if (l.left <= 0 || l.defaulted) continue;
    const debtor = w.nations[l.to];
    const amt = Math.min(l.left, l.monthly);
    if (!debtor.exile && pay(w, natref(l.to), natref(l.from), GOLD, amt, `Loan repayment to ${w.nations[l.from].name}`)) l.left -= amt;
    else {
      l.defaulted = true;
      addGrievance(w, l.from, l.to, 10);
      relation(w, l.from, l.to, -10, 'defaulted on our loan');
      note(w, w.nations[l.from], `💸 ${debtor.name} defaulted on its loan from ${w.nations[l.from].name}.`, true, l.to);
    }
  }
  if (w.intlLoans) w.intlLoans = w.intlLoans.filter((l) => l.left > 0 && !l.defaulted);
}

export function diplomacyActionsDaily(w: World, days = 1) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const d = dipOf(n);
    d.capital = Math.min(100, d.capital + (0.5 + prestigeOf(w, n) / 100 + nationalStaffing(w, n.id, 'diplomacy') * 0.5) * days); // diplomats build it up
  }
  if (dateAt(w.time).day === 1) loansMonth(w);
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const head = foreignActor(n);
    if (head != null && head === pl.id) continue; // the player conducts their own country's diplomacy
    if (!chance(w, 1 - Math.pow(0.96, days))) continue;
    const opt = aiChoice(w, n);
    if (opt) doDiplomacy(w, n, opt[0], opt[1]);
  }
}

/** What an AI government would do abroad today (weighted options, chosen by how pressing they are). */
export function aiChoice(w: World, n: Nation): [DipAction, DipParams] | null {
  const opts: [DipAction, DipParams, number][] = [];
  const lp = leaderProfile(w, n);
  const others = w.nations.filter((x) => x.id !== n.id && !x.exile);
  const recentTreaty = activeTreaties(w, n.id).some((t) => t.signed > w.time - 365 * DAY) || Object.entries(dipOf(n).last).some(([k, t]) => k.startsWith('treaty:') && t > w.time - 180 * DAY);
  for (const t of others) {
    const rel = n.relations[t.id]?.score ?? 0;
    const ties = tiesOfPair(w, n, t);
    const aggressor = activeWars(w).some((x) => x.att === t.id && (x.def === n.id || n.alliances.includes(x.def) || (n.relations[x.def]?.score ?? 0) > 30));
    if (rel > 40) opts.push(['praise', { target: t.id }, 0.04]);
    if (aggressor) opts.push(['condemn', { target: t.id }, 0.8]);
    else if (rel < -40 && lp.hawk > 0.6) opts.push(['condemn', { target: t.id }, 0.03]);
    if (rel > 15 && rel < 45 && ties.interdep > 25) opts.push(['summit', { target: t.id }, 0.15]);
    if (rel > 20 && (t.wallet[GOLD] ?? 0) < (n.wallet[GOLD] ?? 0) * 0.3) opts.push(['aid', { target: t.id }, 0.2]);
    if (rel < -50 && !n.embargoes.includes(t.id)) opts.push(['sanction', { target: t.id }, 0.3 + lp.hawk * 0.4]);
    if (rel > -5 && n.embargoes.includes(t.id)) opts.push(['liftSanctions', { target: t.id }, 0.8]);
    // Allies of victims sanction the aggressor.
    if (!n.embargoes.includes(t.id) && activeWars(w).some((x) => x.att === t.id && n.alliances.includes(x.def))) opts.push(['sanction', { target: t.id }, 2]);
    // Treaties: alliances against a shared threat, trade deals with partners, pacts with the feared.
    for (const kind of ['defence', 'trade', 'nonaggression', 'intel', 'armscontrol', 'border'] as TreatyKind[]) {
      if (proposeTreatyCheck(w, n, t, kind)) continue;
      // Only offer what it wants itself and the other might accept.
      if (recentTreaty) break; // a government concludes at most one new treaty a year
      if (willingness(w, n, t, kind).p < 0.55) continue; // only what it wants itself
      const p = kind === 'defence' ? 0.8 : kind === 'trade' ? (ties.interdep > 40 ? 0.4 : 0) : kind === 'nonaggression' ? (ties.threat > 35 ? 0.4 : 0)
        : kind === 'intel' ? (n.alliances.includes(t.id) ? 0.2 : 0) : kind === 'armscontrol' ? (ties.threat > 30 ? 0.3 : 0) : (ties.grievance > 10 ? 0.2 : 0);
      if (p > 0) opts.push(['treaty', { target: t.id, kind }, p]);
    }
    if (ties.trust < -40 && rel < -50) opts.push(['expel', { target: t.id }, 0.02]);
    if (lp.hawk > 0.6 && t.embargoes.includes(n.id) && militaryPower(w, n.id) > believedPower(w, n.id, t.id) * 1.5) opts.push(['ultimatum', { target: t.id, demand: 'liftSanctions' }, 0.05]);
  }
  // Renounce treaties with those it has come to hate.
  for (const tr of activeTreaties(w, n.id)) {
    // A pact with one partner goes when that partner is hated; a multilateral one only when most members are.
    const rels = tr.parties.filter((x) => x !== n.id).map((x) => n.relations[x]?.score ?? 0);
    const worst = rels.length > 1 ? rels.reduce((a, b) => a + b, 0) / rels.length : rels[0] ?? 0;
    if (worst < (tr.historic ? -75 : -45)) opts.push(['renounce', { target: tr.parties.find((x) => x !== n.id)!, treaty: tr.id }, 0.6]);
  }
  // A respected neutral offers to mediate.
  const wars = activeWars(w).filter((x) => x.att !== n.id && x.def !== n.id);
  if (wars.length && prestigeOf(w, n) > 40) { const war = pick(w, wars); opts.push(['mediate', { target: war.att, war: war.id }, 0.4]); }
  const valid = opts.filter(([a, p]) => !dipCheck(w, n, a, p));
  if (!valid.length) return null;
  const c = weighted(w, valid, (o) => o[2])!;
  return [c[0], c[1]];
}

export const loansOf = (w: World, n: Id) => (w.intlLoans ?? []).filter((l) => l.from === n || l.to === n);
export { allTreaties, TREATY_INFO };
