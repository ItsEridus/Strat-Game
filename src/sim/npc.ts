// A world that notices you. NPC ambitions (agendas) steer what AI citizens do;
// rivals and allies form around the player and act on it; NPCs make offers,
// requests and threats through the inbox; journalists investigate; NPCs build
// their own relationships and feuds; and everyone reacts to what the player does.
import type { Citizen, Id, World } from './types';
import { remember } from './story';
import { census, nationals, residents } from './census';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { DAY, dayOf } from '../engine/clock';
import { nid, notify, record, sendMsg } from '../engine/events';
import { chance, pick, rand, randInt } from '../engine/rng';
import { controller, cref, jailed, player } from './query';
import { govTemplate, headOf } from './stategov';
import { PRANKS } from './crime';
import { ARANKS } from './intel';
import { MINISTRY_INFO } from './authority';
import { publish } from './press';

// ---------- agendas ----------

export const GOAL_TEXT: Record<string, (w: World, c: Citizen) => string> = {
  governor: (w, c) => `become ${govTemplate(w, c.sec.goal!.target!)?.title ?? 'head'} of ${w.regions[c.sec.goal!.target!].name}`,
  president: (w, c) => `become ${w.nations[c.nation].leader} of ${w.nations[c.nation].name}`,
  tycoon: () => 'build a business empire (3+ companies)',
  fortune: () => 'make a fortune',
  boss: (w, c) => `take over ${w.syndicates[c.sec.syndicate ?? -1]?.name ?? 'the organisation'}`,
  chief: () => 'rise to police captain',
  spymaster: (w, c) => `rise in the ${w.nations[c.nation].agency.name}`,
  hero: () => 'become a decorated war hero',
  expose: () => 'expose corruption and crime',
  rival: (w, c) => `get the better of ${w.citizens[c.sec.goal!.target!]?.name ?? 'a rival'}`,
};

function pickGoal(w: World, c: Citizen): Citizen['sec']['goal'] {
  const since = w.time;
  const n = w.nations[c.nation];
  if (n.president === c.id || headOf(w, c.id) != null || Object.values(n.cabinet).includes(c.id)) return n.president === c.id ? { kind: 'fortune', since } : { kind: 'president', since };
  if (c.sec.syndicate != null && c.traits.ambition > 0.5) return { kind: 'boss', since };
  if (c.sec.police != null) return { kind: 'chief', since };
  if (c.sec.agency != null) return { kind: 'spymaster', since };
  switch (c.persona) {
    case 'politician': {
      const tpl = govTemplate(w, c.loc);
      if (c.influence > 60 && c.traits.ambition > 0.6) return { kind: 'president', since };
      if (tpl?.mode === 'elected' && w.regions[c.loc].owner === c.nation) return { kind: 'governor', target: c.loc, since };
      return { kind: 'president', since };
    }
    case 'industrialist': case 'investor': return { kind: 'tycoon', since };
    case 'soldier': return { kind: 'hero', since };
    case 'journalist': return { kind: 'expose', since };
    default: return { kind: 'fortune', since };
  }
}

function goalMet(w: World, c: Citizen): boolean {
  const g = c.sec.goal!;
  switch (g.kind) {
    case 'governor': return w.govs[g.target!]?.head.cit === c.id;
    case 'president': return w.nations[c.nation].president === c.id;
    case 'tycoon': return Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === c.id).length >= 3;
    case 'fortune': return (c.wallet[w.nations[c.nation].cur] ?? 0) > cur(1500);
    case 'boss': return c.sec.srank >= 4;
    case 'chief': return c.sec.prank >= 3;
    case 'spymaster': return c.sec.arank >= 3;
    case 'hero': return Object.values(c.medals).reduce((a, b) => a + b, 0) >= 3;
    case 'expose': return (c.flags.exposes ?? 0) >= 3;
    case 'rival': return (c.flags.rivalWins ?? 0) >= 3;
  }
  return false;
}

export function goalText(w: World, c: Citizen): string {
  if (!c.sec.goal) return '';
  if ((c.sec.goal.kind === 'boss' || c.sec.goal.kind === 'spymaster') && !inTheKnow(w, c)) return 'get rich';
  return GOAL_TEXT[c.sec.goal.kind]?.(w, c) ?? c.sec.goal.kind;
}

function agendasDaily(w: World) {
  const p = player(w);
  for (const c of census(w).all) {
    if (c.player || (c.id + dayOf(w.time)) % 5 !== 0) continue;
    if (c.sec.goal && goalMet(w, c)) {
      const text = goalText(w, c);
      if (c.nation === p.nation && (c.influence > 20 || c.sec.goal.kind === 'governor' || c.sec.goal.kind === 'president')) record(w, 'people', `🌟 ${c.name} achieved a long ambition: to ${text}.`, { cit: c.id, nation: c.nation });
      c.sec.fame += 3;
      c.sec.goal = null;
    }
    if (!c.sec.goal || w.time - c.sec.goal.since > 90 * DAY) c.sec.goal = pickGoal(w, c);
    // Agendas drive behaviour: would-be governors move home and stand; would-be tycoons expand.
    const g = c.sec.goal!;
    if (g.kind === 'governor' && g.target != null) {
      const s = w.govs[g.target];
      if (s && !s.candidates.some((x) => x.cit === c.id) && s.candidates.length && c.level >= B.state.candLevel && c.loc === g.target && !jailed(w, c) && headOf(w, c.id) == null) {
        s.candidates.push({ name: c.name, ideo: c.ideo, cit: c.id, campaign: 0 });
        const cash = c.wallet[w.nations[c.nation].cur] ?? 0;
        if (cash > cur(200)) { const spend = Math.floor(cash * 0.2); if (pay(w, cref(c.id), { k: 'hh', id: c.nation }, w.nations[c.nation].cur, spend, 'Campaign')) s.candidates[s.candidates.length - 1].campaign += spend; }
      }
    }
  }
}

// ---------- rivals and allies ----------

function refreshRivals(w: World) {
  const p = player(w);
  const rivals = new Map<Id, number>();
  const bump = (id: Id | null | undefined, v: number) => { if (id != null && id !== p.id && w.citizens[id]) rivals.set(id, (rivals.get(id) ?? 0) + v); };
  for (const s of w.govs) if (s?.candidates.some((c) => c.cit === p.id)) for (const c of s.candidates) bump(c.cit, 30);
  for (const e of Object.values(w.elections)) if (!e.done && e.candidates.includes(p.id)) for (const c of e.candidates) bump(c, 30);
  const mine = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id);
  for (const co of Object.values(w.companies)) if (co.owner.k === 'cit' && mine.some((m) => m.industry === co.industry && controller(w.regions[m.region]) === controller(w.regions[co.region]))) bump(co.owner.id, 8);
  if (p.sec.syndicate != null) for (const f of w.syndicates[p.sec.syndicate]?.feuds ?? []) bump(w.syndicates[f]?.boss, 25);
  for (const c of census(w).all) if ((c.rel[p.id] ?? 0) <= -30) bump(c.id, -(c.rel[p.id] ?? 0) / 2);
  const before = new Set(p.sec.rivals);
  p.sec.rivals = [...rivals.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5).map(([id]) => id);
  for (const id of p.sec.rivals) {
    const c = w.citizens[id];
    if (!before.has(id)) {
      c.rel[p.id] = Math.min(c.rel[p.id] ?? 0, -10);
      if (!c.sec.goal || c.sec.goal.kind === 'fortune') c.sec.goal = { kind: 'rival', target: p.id, since: w.time };
      notify(w, 'personal', `😠 ${c.name} now sees you as a rival.`, { link: 'people' });
    }
  }
}

/** Rivals act against the player; allies help. */
function rivalsAndAllies(w: World) {
  const p = player(w);
  const code = w.nations[p.nation].cur;
  for (const id of p.sec.rivals) {
    const c = w.citizens[id];
    if (!c || jailed(w, c) || !chance(w, 0.15)) continue;
    const moves: (() => void)[] = [];
    if (c.persona === 'politician' || c.influence > 20) moves.push(() => {
      const dmg = Math.min(p.influence * 0.05, 3);
      p.influence = Math.max(0, p.influence - dmg);
      record(w, 'politics', `🗣️ ${c.name} attacked ${p.name} in a speech${p.sec.record.convictions ? ', bringing up their criminal record' : ''}.`, { cit: p.id, player: true });
      notify(w, 'personal', `🗣️ ${c.name} publicly attacked you (−${dmg.toFixed(1)} influence). Endorsements and good press repair it.`, { link: 'people' });
      c.flags.rivalWins = (c.flags.rivalWins ?? 0) + 1;
    });
    const theirs = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === c.id);
    const mine = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id);
    const clash = theirs.find((t) => mine.some((m) => m.industry === t.industry));
    if (clash) moves.push(() => {
      for (const k of Object.keys(clash.prices)) clash.prices[k] = Math.max(1, Math.round(clash.prices[k] * 0.9));
      const mineCo = mine.find((m) => m.industry === clash.industry)!;
      const poach = mineCo.workers.find((wid) => !w.citizens[wid]?.player);
      if (poach != null && clash.offer && chance(w, 0.4)) {
        clash.offer.wage = Math.round((mineCo.offer?.wage ?? clash.offer.wage) * 1.1);
        notify(w, 'company', `💼 ${c.name} is undercutting your ${clash.industry} prices and offering your workers more.`, { link: 'companies' });
      } else notify(w, 'company', `💼 ${c.name} cut prices to squeeze your ${clash.industry} business.`, { link: 'companies' });
    });
    if (p.sec.heat > 15 || p.sec.notoriety > 3) moves.push(() => {
      const open = Object.values(w.cases).filter((k) => k.status === 'open' && k.suspect === p.id);
      if (open.length) { const k = pick(w, open); k.evidence = Math.min(100, k.evidence + 10); }
      else { const id = nid(w); w.cases[id] = { id, suspect: p.id, kind: 'fraud', region: p.loc, nation: controller(w.regions[p.loc]), evidence: 15, opened: w.time, status: 'open', detective: null, loot: 0 }; }
      notify(w, 'personal', `🐀 Someone tipped off the police about you. You suspect ${c.name}.`, { link: 'crime' });
    });
    if (moves.length) pick(w, moves)();
  }
  // Allies: friends warn, lend and vouch.
  const friends = census(w).all.filter((c) => !c.player && (c.rel[p.id] ?? 0) >= 40 && !jailed(w, c));
  if (friends.length && chance(w, 0.2)) {
    const f = pick(w, friends);
    const danger = Object.values(w.cases).find((k) => k.status === 'open' && k.suspect === p.id && k.evidence > 35);
    if (danger && f.sec.police != null) notify(w, 'personal', `🤫 ${f.name} (police) warns you: a ${danger.kind} case against you is at ${Math.round(danger.evidence)}% evidence. Lie low.`, { link: 'crime' });
    else if (danger) notify(w, 'personal', `🤫 ${f.name} heard the police are asking about you. Be careful.`, { link: 'crime' });
    else if ((p.wallet[code] ?? 0) < cur(30) && (f.wallet[code] ?? 0) > cur(300) && !w.inbox.some((m) => m.payload?.handler === 'loanOffer' && !m.resolved)) {
      const amount = cur(randInt(w, 50, 150));
      sendMsg(w, { from: f.id, subject: `${f.name} offers a loan`, kind: 'npc', body: `Things look tight for you. I can lend you ${fmtAmt(code, amount)}; pay me back ${fmtAmt(code, Math.round(amount * 1.1))} within 10 days.`, options: [{ id: 'accept', label: 'Accept the loan' }, { id: 'decline', label: 'No thanks' }], payload: { handler: 'loanOffer', from: f.id, amount } });
    } else if (p.influence > 5) {
      p.influence += 0.5 + f.influence / 100;
      notify(w, 'personal', `🤝 ${f.name} spoke up for you in public (+influence).`);
    }
  }
}

export function replyLoan(w: World, payload: Record<string, any>, option: string): Result {
  if (option !== 'accept') return ok('You declined.');
  const f = w.citizens[payload.from];
  const p = player(w);
  const code = w.nations[p.nation].cur;
  if (!f || !pay(w, cref(f.id), cref(p.id), code, payload.amount, `Loan from ${f.name}`)) return fail(`${f?.name ?? 'They'} can no longer lend.`);
  p.flags[`loan_${f.id}`] = Math.round(payload.amount * 1.1);
  p.flags[`loanDue_${f.id}`] = w.time + 10 * DAY;
  delete p.flags[`loanResult_${f.id}`];
  remember(w, f, 5, `borrowed ${fmtAmt(code, payload.amount)}, to repay ${fmtAmt(code, Math.round(payload.amount * 1.1))}`);
  return ok(`Borrowed ${fmtAmt(code, payload.amount)} from ${f.name}. Repay ${fmtAmt(code, Math.round(payload.amount * 1.1))} by day ${dayOf(w.time + 10 * DAY)} (automatic).`);
}

function loansDaily(w: World) {
  const p = player(w);
  const code = w.nations[p.nation].cur;
  for (const k of Object.keys(p.flags)) {
    if (!k.startsWith('loan_')) continue;
    const id = Number(k.slice(5));
    const due = p.flags[`loanDue_${id}`] ?? 0;
    if (w.time < due) continue;
    const f = w.citizens[id];
    const amount = p.flags[k];
    if (f && pay(w, cref(p.id), cref(f.id), code, amount, `Loan repaid to ${f.name}`)) { notify(w, 'personal', `💸 You repaid ${f.name} ${fmtAmt(code, amount)}.`); remember(w, f, 4, `repaid the ${fmtAmt(code, amount)} loan on time`); p.flags[`loanResult_${id}`] = 1; }
    else if (f) { remember(w, f, -40, `defaulted on the ${fmtAmt(code, amount)} they lent you`); notify(w, 'personal', `💢 You defaulted on ${f.name}'s loan. They won't forget it.`, { link: 'people' }); p.flags[`loanResult_${id}`] = -amount; }
    delete p.flags[k];
    delete p.flags[`loanDue_${id}`];
  }
}

// ---------- offers to officials: bribes ----------

function bribeOffers(w: World) {
  const p = player(w);
  if (w.inbox.some((m) => m.payload?.handler === 'bribeOffer' && !m.resolved) || !chance(w, 0.12)) return;
  const code = w.nations[p.nation].cur;
  const gov = headOf(w, p.id);
  const crooks = census(w).all.filter((c) => !c.player && c.nation === p.nation && c.traits.greed > 0.6 && (c.wallet[code] ?? 0) > cur(200) && !jailed(w, c));
  if (!crooks.length) return;
  const c = pick(w, crooks);
  const amount = cur(randInt(w, 60, 200));
  if (gov != null) {
    sendMsg(w, { from: c.id, subject: `${c.name} would like a word`, kind: 'npc', body: `As ${govTemplate(w, gov)?.title} of ${w.regions[gov].name}, you could steer the state's business support toward the right companies. ${fmtAmt(code, amount)} for your trouble, discreetly.`, options: [{ id: 'accept', label: `Take ${fmtAmt(code, amount)}` }, { id: 'decline', label: 'Decline' }, { id: 'report', label: 'Report the bribe' }], payload: { handler: 'bribeOffer', from: c.id, amount, region: gov } });
  } else if (p.sec.police != null) {
    const theirCase = Object.values(w.cases).find((k) => k.status === 'open' && w.regions[k.region].owner === p.nation && w.citizens[k.suspect] && !w.citizens[k.suspect].player);
    if (!theirCase) return;
    const s = w.citizens[theirCase.suspect];
    sendMsg(w, { from: s.id, subject: `${s.name} needs a favour`, kind: 'npc', body: `Officer, the ${theirCase.kind} case against me could just… stall. ${fmtAmt(code, amount)} says it does.`, options: [{ id: 'accept', label: `Take ${fmtAmt(code, amount)} and bury it` }, { id: 'decline', label: 'Decline' }, { id: 'report', label: 'Add attempted bribery to the charges' }], payload: { handler: 'bribeOffer', from: s.id, amount, case: theirCase.id } });
  } else if (w.nations[p.nation].deputies.includes(p.id)) {
    const pr = Object.values(w.proposals).find((x) => x.status === 'open' && x.nation === p.nation && !x.votes[p.id]);
    if (!pr) return;
    sendMsg(w, { from: c.id, subject: `${c.name}: about the vote on “${pr.type}”`, kind: 'npc', body: `Vote YES and ${fmtAmt(code, amount)} finds its way to you. Nobody needs to know.`, options: [{ id: 'accept', label: `Take it (you still vote yourself)` }, { id: 'decline', label: 'Decline' }, { id: 'report', label: 'Report the bribe' }], payload: { handler: 'bribeOffer', from: c.id, amount, proposal: pr.id } });
  }
}

export function replyBribe(w: World, payload: Record<string, any>, option: string): Result {
  const p = player(w);
  const c = w.citizens[payload.from];
  const code = w.nations[p.nation].cur;
  if (!c) return ok('They are gone.');
  if (option === 'accept') {
    if (!pay(w, cref(c.id), cref(p.id), code, payload.amount, 'Consulting fee')) return fail('The money never arrived.');
    p.sec.notoriety += 2;
    p.sec.record.crimes++;
    c.rel[p.id] = Math.min(100, (c.rel[p.id] ?? 0) + 20);
    if (payload.case != null && w.cases[payload.case]) w.cases[payload.case].evidence = Math.max(0, w.cases[payload.case].evidence - 30);
    if (payload.region != null) { const s = w.govs[payload.region]; if (s) { s.budget.business = Math.min(0.6, s.budget.business + 0.1); s.budget.welfare = Math.max(0, s.budget.welfare - 0.1); } }
    // Corruption can surface later through journalists or the police.
    if (chance(w, 0.25)) { const id = nid(w); w.cases[id] = { id, suspect: p.id, kind: 'corruption', region: p.loc, nation: p.nation, evidence: 25, opened: w.time, status: 'open', detective: null, loot: payload.amount }; }
    return ok(`You took ${fmtAmt(code, payload.amount)}. Corruption has a way of coming out.`);
  }
  if (option === 'report') {
    const id = nid(w);
    w.cases[id] = { id, suspect: c.id, kind: 'bribery', region: c.loc, nation: p.nation, evidence: 55, opened: w.time, status: 'open', detective: null, loot: payload.amount };
    p.sec.fame += 2;
    c.rel[p.id] = -60;
    return ok(`You reported ${c.name}. The police opened a bribery case.`);
  }
  return ok('You declined.');
}

// ---------- journalists ----------

/**
 * Journalists dig into people with something to hide in their own patch (home
 * region and next door), or anyone prominent in the country.
 */
function journalistsDaily(w: World) {
  const p = player(w);
  const corrupt = new Set(Object.values(w.cases).filter((k) => k.kind === 'corruption' && k.status === 'open').map((k) => k.suspect));
  const shady = (c: Citizen) => c.sec.notoriety > 4 || c.sec.heat > 30 || corrupt.has(c.id);
  const prominent = w.nations.map((n) => nationals(w, n.id).filter((c) => shady(c) && c.influence > 40));
  const papers = Object.values(w.papers);
  for (const j of census(w).all) {
    if (j.player || j.persona !== 'journalist' || jailed(w, j) || (j.id + dayOf(w.time)) % 4 !== 0) continue;
    const paper = papers.find((x) => x.owner.k === 'cit' && x.owner.id === j.id) ?? papers.find((x) => x.nation === j.nation);
    if (!paper) continue;
    const patch = [j.home, ...w.regions[j.home].links].flatMap((r) => residents(w, r)).filter((c) => c.nation === j.nation && c.id !== j.id && shady(c));
    const suspects = [...patch, ...prominent[j.nation].filter((c) => c.id !== j.id)];
    if (!suspects.length || !chance(w, 0.4)) continue;
    const t = suspects.sort((a, b) => (b.influence + b.sec.notoriety * 3) - (a.influence + a.sec.notoriety * 3))[0];
    const k = Object.values(w.cases).find((x) => x.suspect === t.id && x.status === 'open');
    if (k) k.evidence = Math.min(100, k.evidence + 15);
    t.influence = Math.max(0, t.influence - 3);
    j.flags.exposes = (j.flags.exposes ?? 0) + 1;
    j.sec.fame += 1;
    const title = `Investigation: questions about ${t.name}'s dealings`;
    j.energy = Math.max(j.energy, B.cost.article);
    j.flags.articleDay = -1;
    publish(w, j, paper.id, 'politics', 'report', title, '', t.id);
    if (t.player) notify(w, 'personal', `📰 ${j.name} (${paper.name}) published an investigation into you. Influence −3${k ? `, police evidence now ${Math.round(k.evidence)}%` : ''}.`, { critical: !!k, link: 'press' });
    else if (t.nation === p.nation) record(w, 'press', `📰 ${paper.name}: ${title}.`, { cit: t.id, nation: t.nation });
  }
  // Interview requests for well-known players.
  if (p.sec.fame > 8 && chance(w, 0.08) && !w.inbox.some((m) => m.payload?.handler === 'interview' && !m.resolved)) {
    const j = census(w).all.find((c) => c.persona === 'journalist' && c.nation === p.nation && !c.player);
    if (j) sendMsg(w, { from: j.id, subject: `${j.name} requests an interview`, kind: 'npc', body: `Readers want to hear from you. Talk to me for tomorrow's edition?`, options: [{ id: 'bold', label: 'Give a bold interview' }, { id: 'safe', label: 'Play it safe' }, { id: 'decline', label: 'Decline' }], payload: { handler: 'interview', j: j.id } });
  }
}

export function replyInterview(w: World, payload: Record<string, any>, option: string): Result {
  const p = player(w);
  const j = w.citizens[payload.j];
  if (option === 'decline') return ok('You declined.');
  if (option === 'safe') { p.influence += 1; p.sec.fame += 1; return ok('A solid, unremarkable interview (+1 influence).'); }
  if (chance(w, 0.65)) { p.influence += 4; p.sec.fame += 3; if (j) j.rel[p.id] = (j.rel[p.id] ?? 0) + 10; return ok('The interview went viral (+4 influence, +3 fame).'); }
  p.influence = Math.max(0, p.influence - 3);
  return ok('A gaffe made the headlines (−3 influence).');
}

// ---------- debates ----------

function debates(w: World) {
  const p = player(w);
  for (const s of w.govs) {
    if (!s || !s.candidates.some((c) => c.cit === p.id) || s.nextElection - w.time > 2 * DAY || w.inbox.some((m) => m.payload?.handler === 'debate' && m.payload.region === s.region)) continue;
    const rival = s.candidates.filter((c) => c.cit !== p.id).sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
    if (!rival) continue;
    sendMsg(w, { from: rival.cit, subject: `Debate challenge: ${rival.name}`, kind: 'npc', body: `${rival.name} (${IDEOLOGIES[rival.ideo].name}) challenges you to a televised debate before the ${w.regions[s.region].name} election.`, options: [{ id: 'accept', label: 'Accept' }, { id: 'decline', label: 'Decline' }], payload: { handler: 'debate', region: s.region, rival: rival.name } });
  }
}

export function replyDebate(w: World, payload: Record<string, any>, option: string): Result {
  const p = player(w);
  const s = w.govs[payload.region];
  const me = s?.candidates.find((c) => c.cit === p.id);
  if (!s || !me) return ok('The race is over.');
  if (option === 'decline') { me.campaign = Math.max(0, me.campaign * 0.9); return ok('You ducked the debate. Commentators noticed.'); }
  const skill = 0.45 + Math.min(0.3, p.influence / 200) + Math.min(0.1, p.level / 200);
  if (chance(w, skill)) { me.campaign += cur(Math.max(20, w.regions[s.region].pop / 800)); p.influence += 2; return ok(`You won the debate against ${payload.rival} (+standing in the race, +2 influence).`); }
  const other = s.candidates.find((c) => c.name === payload.rival);
  if (other) other.campaign += cur(Math.max(20, w.regions[s.region].pop / 800));
  return ok(`${payload.rival} had the better night.`);
}

// ---------- NPC society ----------

function npcSocial(w: World) {
  const p = player(w);
  const pool = census(w).all.filter((c) => !c.player && !jailed(w, c) && c.nation === p.nation);
  if (pool.length < 4) return;
  for (let i = 0; i < 2; i++) {
    const a = pick(w, pool);
    const b = pick(w, pool.filter((x) => x.id !== a.id));
    if (a.persona === 'politician' && b.persona === 'politician' && a.ideo !== b.ideo && a.influence > 15 && b.influence > 15 && chance(w, 0.4)) {
      a.rel[b.id] = Math.max(-100, (a.rel[b.id] ?? 0) - 20); b.rel[a.id] = Math.max(-100, (b.rel[a.id] ?? 0) - 20);
      const [win, lose] = a.influence * rand(w, 0.7, 1.3) > b.influence * rand(w, 0.7, 1.3) ? [a, b] : [b, a];
      win.influence += 1; lose.influence = Math.max(0, lose.influence - 1);
      record(w, 'politics', `🗣️ ${a.name} (${IDEOLOGIES[a.ideo].name}) and ${b.name} (${IDEOLOGIES[b.ideo].name}) clashed publicly; ${win.name} came out ahead.`, { nation: a.nation });
    } else if (a.level > b.level + 10 && a.persona === b.persona && chance(w, 0.4)) {
      b.xp += 10; b.eco += 0.1; a.rel[b.id] = Math.min(100, (a.rel[b.id] ?? 0) + 10); b.rel[a.id] = Math.min(100, (b.rel[a.id] ?? 0) + 15);
      if (chance(w, 0.3)) record(w, 'people', `🤝 ${a.name} has taken ${b.name} under their wing.`, { nation: a.nation });
    } else if ((a.persona === 'investor' || a.persona === 'industrialist') && (b.persona === 'industrialist' || b.persona === 'merchant') && chance(w, 0.3)) {
      const code = w.nations[a.nation].cur;
      const amt = Math.floor((a.wallet[code] ?? 0) * 0.08);
      if (amt > cur(20) && pay(w, cref(a.id), cref(b.id), code, amt, `Investment from ${a.name}`)) {
        a.rel[b.id] = Math.min(100, (a.rel[b.id] ?? 0) + 8);
        record(w, 'economy', `💼 ${a.name} invested ${fmtAmt(code, amt)} in ${b.name}'s ventures.`, { nation: a.nation });
      }
    }
  }
}

// ---------- reacting to the player ----------

function reactToPlayer(w: World) {
  const p = player(w);
  const snap = {
    cos: Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id).length,
    office: (headOf(w, p.id) != null ? 1 : 0) + (w.nations[p.nation].president === p.id ? 2 : 0) + (Object.values(w.nations[p.nation].cabinet).includes(p.id) ? 4 : 0),
    conv: p.sec.record.convictions,
    level: p.level,
  };
  const prev = { cos: p.flags.snapCos ?? snap.cos, office: p.flags.snapOffice ?? snap.office, conv: p.flags.snapConv ?? snap.conv };
  const locals = census(w).all.filter((c) => !c.player && c.nation === p.nation);
  if (snap.office > prev.office) {
    const well = locals.filter((c) => c.ideo === p.ideo).slice(0, 3);
    const foes = locals.filter((c) => c.persona === 'politician' && c.ideo !== p.ideo).slice(0, 2);
    for (const c of well) c.rel[p.id] = Math.min(100, (c.rel[p.id] ?? 0) + 8);
    for (const c of foes) c.rel[p.id] = Math.max(-100, (c.rel[p.id] ?? 0) - 8);
    if (well[0]) sendMsg(w, { from: well[0].id, subject: `Congratulations from ${well[0].name}`, kind: 'npc', body: `Well done. People like us finally have a voice. Count on my support.`, options: [{ id: 'ok', label: 'Thank them' }] });
    if (foes[0]) record(w, 'politics', `🗣️ ${foes[0].name} vowed to oppose ${p.name} "at every turn".`, { cit: p.id, player: true });
  }
  if (snap.cos > prev.cos) {
    const rivals = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && !w.citizens[co.owner.id]?.player && controller(w.regions[co.region]) === p.nation);
    const newest = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id).sort((a, b) => b.id - a.id)[0];
    const same = rivals.find((co) => co.industry === newest?.industry);
    if (same) { const o = w.citizens[(same.owner as { id: Id }).id]; o.rel[p.id] = Math.max(-100, (o.rel[p.id] ?? 0) - 10); notify(w, 'company', `🏭 ${o.name} (${same.name}) has noticed your new ${newest.industry} business.`, { link: 'people' }); }
  }
  if (snap.conv > prev.conv) for (const c of locals.filter((x) => (x.rel[p.id] ?? 0) > 0)) c.rel[p.id] = Math.max(-100, (c.rel[p.id] ?? 0) - 10 + (c.sec.syndicate != null ? 15 : 0));
  p.flags.snapCos = snap.cos; p.flags.snapOffice = snap.office; p.flags.snapConv = snap.conv;
}

// ---------- activity descriptions (People screen) ----------

/** Whether the player would know about someone's secret affiliations. */
export function inTheKnow(w: World, c: Citizen): boolean {
  const p = player(w);
  if (c.id === p.id) return true;
  if (c.sec.syndicate != null && (p.sec.syndicate === c.sec.syndicate || p.sec.prank >= 2 || c.sec.record.convictions > 0)) return true;
  if (c.sec.agency != null && p.sec.agency === c.sec.agency && p.sec.arank >= 2) return true;
  return false;
}

export function activityOf(w: World, c: Citizen): string {
  if (jailed(w, c)) return `In prison until day ${dayOf(c.sec.jailUntil)}`;
  const n = w.nations[c.nation];
  if (n.president === c.id) return `${n.leader} of ${n.name}`;
  const gov = headOf(w, c.id);
  if (gov != null) return `${govTemplate(w, gov)?.title} of ${w.regions[gov].name}`;
  const run = w.govs.find((s) => s?.candidates.some((x) => x.cit === c.id));
  if (run) return `Campaigning in ${w.regions[run.region].name}`;
  for (const [m, id] of Object.entries(n.cabinet)) if (id === c.id) return MINISTRY_INFO[m as keyof typeof MINISTRY_INFO].name;
  if (c.sec.police != null) return `${PRANKS[c.sec.prank]}, ${w.regions[c.sec.police].name} police`;
  const know = inTheKnow(w, c);
  if (c.sec.agency != null && know) return `${ARANKS[c.sec.arank]}, ${n.agency.name}`;
  if (c.sec.syndicate != null && know) return `${c.sec.srank >= 4 ? 'Head' : 'Member'} of ${w.syndicates[c.sec.syndicate]?.name}`;
  if (c.mining) return 'Mining gold';
  if (c.job != null && w.companies[c.job]) return `Works at ${w.companies[c.job].name}`;
  return c.persona === 'industrialist' || c.persona === 'investor' ? 'Managing investments' : 'Looking for work';
}


// ---------- entry points ----------

export function npcDaily(w: World) {
  agendasDaily(w);
  if (dayOf(w.time) % 3 === 0) refreshRivals(w);
  rivalsAndAllies(w);
  loansDaily(w);
  bribeOffers(w);
  journalistsDaily(w);
  debates(w);
  npcSocial(w);
  reactToPlayer(w);
}
