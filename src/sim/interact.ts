// Face-to-face politics and social life. The player talks with the people who
// live around them (conversations with real topics drawn from the world), holds
// rallies on the issues that matter locally, and canvasses door to door. AI
// residents stand for a slice of their region's electorate, so persuading them
// moves real votes: state elections blend the residents' choices with the
// region's standing mood, and national voters weigh relationships and pledges.
import type { Citizen, Convo, Id, Ideology, World } from './types';
import { localNews } from './life';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { dayOf } from '../engine/clock';
import { record } from '../engine/events';
import { chance, pick, rand, randInt } from '../engine/rng';
import { controller, cref, hhref, jailed, player, today } from './query';
import { companiesIn, presentIn, residents } from './census';
import { adjustRel } from './social';
import { goalText } from './npc';
import { joinPartyRaw, partyOf } from './politics';
import { govTemplate } from './stategov';
import { netWage } from './company';
import { listingsFor } from './market';
import { activeWars } from './war';
import { activeCrises } from './dynamics';
import { addXp } from './citizen';

// ---------- issues ----------

export type Issue = 'jobs' | 'wages' | 'prices' | 'crime' | 'taxes' | 'war' | 'peace' | 'health' | 'pollution' | 'order';
export const ISSUE_INFO: Record<Issue, { icon: string; name: string; pitch: string; ideo: Ideology[] }> = {
  jobs: { icon: '🏭', name: 'Jobs', pitch: 'Good jobs for everyone who wants one', ideo: ['socialism', 'centralism', 'capitalism'] },
  wages: { icon: '💵', name: 'Wages', pitch: 'A fair wage for a fair day’s work', ideo: ['socialism', 'communism'] },
  prices: { icon: '🛒', name: 'Cost of living', pitch: 'Bring down the price of bread', ideo: ['socialism', 'communism', 'nationalism'] },
  crime: { icon: '🚓', name: 'Crime', pitch: 'Safe streets and a police force that shows up', ideo: ['nationalism', 'centralism', 'capitalism'] },
  taxes: { icon: '🧾', name: 'Taxes', pitch: 'Lower taxes, let people keep what they earn', ideo: ['capitalism', 'nationalism'] },
  war: { icon: '🎖️', name: 'Victory', pitch: 'Stand firm and win this war', ideo: ['imperialism', 'nationalism'] },
  peace: { icon: '🕊️', name: 'Peace', pitch: 'Bring our soldiers home', ideo: ['socialism', 'capitalism', 'communism'] },
  health: { icon: '🏥', name: 'Healthcare', pitch: 'A hospital within reach of every family', ideo: ['socialism', 'communism', 'centralism'] },
  pollution: { icon: '🌫️', name: 'Clean air', pitch: 'Clean up the air our children breathe', ideo: ['socialism', 'centralism'] },
  order: { icon: '🛡️', name: 'Order', pitch: 'End the unrest and restore order', ideo: ['nationalism', 'centralism', 'imperialism'] },
};
export const ISSUES = Object.keys(ISSUE_INFO) as Issue[];

/** What worries a region, most pressing first (severity 0..1). */
export function localIssues(w: World, rid: Id): { issue: Issue; severity: number; why: string }[] {
  const r = w.regions[rid];
  const n = w.nations[controller(r)];
  const people = residents(w, rid).filter((c) => !c.player);
  const jobless = people.length ? people.filter((c) => c.job == null && c.persona !== 'industrialist' && c.persona !== 'investor').length / people.length : 0;
  const food = listingsFor(w, controller(r), 'food:1')[0]?.price ?? 0;
  const atWar = activeWars(w).some((x) => x.att === n.id || x.def === n.id);
  const s = w.govs[rid];
  const out: { issue: Issue; severity: number; why: string }[] = [
    { issue: 'crime', severity: r.crime / 100, why: `crime ${Math.round(r.crime)}/100` },
    { issue: 'order', severity: r.unrest / 90, why: `unrest ${Math.round(r.unrest)}/100` },
    { issue: 'jobs', severity: Math.min(1, jobless * 3), why: `${Math.round(jobless * 100)}% of residents out of work` },
    { issue: 'pollution', severity: r.pollution, why: `pollution ${Math.round(r.pollution * 100)}%` },
    { issue: 'health', severity: Math.max(0, 0.6 - r.bld.hospital * 0.15), why: r.bld.hospital ? `hospital level ${r.bld.hospital}` : 'no hospital' },
    { issue: 'taxes', severity: Math.min(1, (n.taxes.work + (s?.tax ?? 0)) / 40), why: `${n.taxes.work + (s?.tax ?? 0)}% tax on wages` },
    { issue: 'prices', severity: food ? Math.min(1, food / (n.minWage * 1.2)) : 0.2, why: food ? `bread at ${fmtAmt(n.cur, food)}` : 'empty shelves' },
    { issue: 'wages', severity: Math.min(1, Math.max(0, 1 - n.minWage / (8 * 100))), why: `minimum wage ${fmtAmt(n.cur, n.minWage)}` },
  ];
  if (atWar) out.push({ issue: n.warMood >= 0 ? 'war' : 'peace', severity: 0.6 + Math.abs(n.warMood) / 12, why: 'the country is at war' });
  return out.sort((a, b) => b.severity - a.severity);
}

/** The issue that matters most to one person. */
export function concernOf(w: World, c: Citizen): Issue {
  const n = w.nations[c.nation];
  if (c.job == null && c.persona !== 'industrialist' && c.persona !== 'investor') return 'jobs';
  if ((c.wallet[n.cur] ?? 0) < cur(40)) return 'prices';
  if (activeWars(w).some((x) => x.att === c.nation || x.def === c.nation)) return IDEOLOGIES[c.ideo].hawk > 0.5 ? 'war' : 'peace';
  const r = w.regions[c.home];
  if (r.crime > 55) return 'crime';
  if (c.persona === 'industrialist' || c.persona === 'investor' || c.persona === 'merchant') return 'taxes';
  if (c.persona === 'worker' || c.persona === 'builder') return c.lastIncome < n.minWage * 1.3 ? 'wages' : 'prices';
  if (r.pollution > 0.5) return 'pollution';
  return localIssues(w, c.home)[0].issue;
}

// ---------- attitudes and pledges ----------

export const attitude = (rel: number) => (rel >= 60 ? 'devoted' : rel >= 30 ? 'friendly' : rel >= 10 ? 'warm' : rel > -10 ? 'neutral' : rel > -30 ? 'cool' : 'hostile');

/** Ideological distance 0 (same) .. 1 (opposed). */
export function ideoDistance(a: Ideology, b: Ideology) {
  if (a === b) return 0;
  return Math.min(1, Math.abs(IDEOLOGIES[a].hawk - IDEOLOGIES[b].hawk) + Math.abs(IDEOLOGIES[a].taxPref - IDEOLOGIES[b].taxPref) / 2);
}

/** Candidate a citizen has promised to vote for (pledges last 30 days). */
export const pledgeOf = (w: World, c: Citizen): Id | null => (c.flags.pledge != null && today(w) - (c.flags.pledgeDay ?? -99) <= 30 ? c.flags.pledge : null);
function pledge(w: World, c: Citizen, cand: Id) { c.flags.pledge = cand; c.flags.pledgeDay = today(w); }

/** Is the player standing in any election (national or state)? */
export function playerCandidacy(w: World): { kind: 'state' | 'national'; region?: Id; label: string } | null {
  const p = player(w);
  const s = w.govs.find((g) => g?.candidates.some((c) => c.cit === p.id));
  if (s) return { kind: 'state', region: s.region, label: `${govTemplate(w, s.region)?.title} of ${w.regions[s.region].name}` };
  const e = Object.values(w.elections).find((x) => !x.done && x.nation === p.nation && x.candidates.includes(p.id));
  if (e) return { kind: 'national', label: e.kind === 'president' ? w.nations[p.nation].leader : e.kind === 'congress' ? 'Congress' : 'party office' };
  return null;
}

// ---------- conversations ----------

const say = (c: Convo, who: Convo['lines'][number]['who'], text: string) => { c.lines.push({ who, text }); if (c.lines.length > 40) c.lines.splice(0, c.lines.length - 40); };

export function talkCheck(w: World, p: Citizen, npc: Citizen | undefined): string | null {
  if (!npc || npc.player) return 'Nobody to talk to.';
  if (jailed(w, p)) return 'You are in prison.';
  if (jailed(w, npc)) return `${npc.name} is in prison.`;
  if (npc.loc !== p.loc) return `${npc.name} is in ${w.regions[npc.loc].name}; travel there to talk.`;
  if (p.energy < B.social.talkEnergy) return `Needs ${B.social.talkEnergy} energy.`;
  return null;
}

/** Strike up a conversation. The first chat of the day with someone can warm them to you. */
export function startTalk(w: World, npcId: Id): Result {
  const p = player(w);
  const npc = w.citizens[npcId];
  const why = talkCheck(w, p, npc);
  if (why) return fail(why);
  p.energy -= B.social.talkEnergy;
  const talked = (w.player.talked ??= {});
  const first = talked[npc.id] !== today(w);
  talked[npc.id] = today(w);
  const rel = npc.rel[p.id] ?? 0;
  const convo: Convo = { npc: npc.id, lines: [], choices: [], used: [] };
  const greet = rel <= -30 ? `${npc.name} folds their arms. “What do you want?”`
    : rel >= 30 ? `${npc.name} brightens. “${p.name.split(' ')[0]}! Good to see you.”`
    : pick(w, [`“Hello there,” says ${npc.name}.`, `${npc.name} nods at you. “Can I help you?”`, `“Afternoon,” says ${npc.name}, looking up from ${npc.job != null ? 'work' : 'the paper'}.`]);
  say(convo, 'npc', greet);
  if (first) {
    const warmth = Math.round(2 + p.attrs.lead * 0.3 + (npc.ideo === p.ideo ? 2 : 0) + (p.sec.fame > 10 ? 1 : 0) - (p.sec.notoriety > 10 ? 2 : 0));
    adjustRel(npc, p.id, warmth);
    if (warmth > 0) say(convo, 'note', `${npc.name} warms to you a little (+${warmth}).`);
  }
  w.player.convo = convo;
  offerChoices(w, convo);
  addXp(w, p, 1);
  return ok('');
}

function offerChoices(w: World, convo: Convo) {
  const p = player(w);
  const npc = w.citizens[convo.npc];
  const rel = npc.rel[p.id] ?? 0;
  const ch: Convo['choices'] = [];
  const add = (id: string, label: string, why?: string | null) => { if (!convo.used.includes(id)) ch.push({ id, label, why: why ?? undefined }); };
  add('life', '“How is life treating you?”');
  add('news', '“Heard anything interesting lately?”');
  add('views', `“What do you make of ${w.nations[npc.nation].president != null ? 'the government' : 'the state of the country'}?”`);
  add('ambition', '“What are you working towards?”', rel < 10 ? 'They don’t know you well enough yet (needs a warm relationship).' : null);
  const cand = playerCandidacy(w);
  if (cand && npc.nation === p.nation) add('vote', `“Can I count on your vote? I’m running for ${cand.label}.”`, pledgeOf(w, npc) === p.id ? 'They already promised you their vote.' : null);
  const party = partyOf(w, p);
  if (party && npc.party !== party.id && npc.nation === p.nation) add('party', `“Have you thought about joining the ${party.name}?”`, npc.level < B.politics.partyLevel ? `They are too new to politics (level ${B.politics.partyLevel}+).` : null);
  const mine = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id && co.offer && co.workers.length < co.offer.slots && controller(w.regions[co.region]) === controller(w.regions[npc.loc]));
  if (mine.length && npc.job == null ? true : mine.length && npc.persona === 'worker') add('hire', `“Come and work for me at ${mine[0].name}.”`);
  const n = w.nations[controller(w.regions[p.loc])];
  add('treat', `Buy them a coffee (${fmtAmt(n.cur, cur(B.social.treatCost))})`, (p.wallet[n.cur] ?? 0) < cur(B.social.treatCost) ? `You need ${fmtAmt(n.cur, cur(B.social.treatCost))}.` : null);
  if (npc.job != null || Object.values(w.companies).some((co) => co.owner.k === 'cit' && co.owner.id === npc.id)) add('job', '“Any openings where you work?”', rel < 20 ? 'Needs a friendly relationship.' : null);
  add('argue', `Argue for ${IDEOLOGIES[p.ideo].name.toLowerCase()}`, npc.ideo === p.ideo ? 'You already agree.' : null);
  add('insult', 'Tell them what you really think of them');
  ch.push({ id: 'bye', label: 'Say goodbye' });
  convo.choices = ch;
}

/** Answer in the current conversation. */
export function converse(w: World, choice: string): Result {
  const p = player(w);
  const convo = w.player.convo;
  if (!convo) return fail('You are not talking to anyone.');
  const npc = w.citizens[convo.npc];
  if (!npc || npc.loc !== p.loc) { w.player.convo = null; return fail('They have gone.'); }
  const opt = convo.choices.find((c) => c.id === choice);
  if (!opt) return fail('Choose one of the options.');
  if (opt.why) return fail(opt.why);
  say(convo, 'you', opt.label.replace(/^“|”$/g, ''));
  convo.used.push(choice);
  const n = w.nations[npc.nation];
  const rel = npc.rel[p.id] ?? 0;
  switch (choice) {
    case 'bye': {
      say(convo, 'npc', rel >= 20 ? '“Take care. Drop by any time.”' : '“See you around.”');
      w.player.convo = null;
      return ok(`You finished talking with ${npc.name}.`);
    }
    case 'life': {
      const issue = concernOf(w, npc);
      const job = npc.job != null ? w.companies[npc.job] : null;
      const line = issue === 'jobs' ? `“Honestly? Rough. I've been out of work${npc.flags.joblessDays ? ` for ${npc.flags.joblessDays} days` : ''}. Nobody around here is hiring.”`
        : issue === 'prices' ? '“Everything costs more every week. Bread, rent… my wage doesn’t stretch.”'
        : issue === 'wages' ? `“${job ? `${job.name} pays` : 'They pay'} ${job ? fmtAmt(w.nations[controller(w.regions[job.region])].cur, netWage(w, job, npc).net) : 'next to nothing'} a shift after tax. Try raising a family on that.”`
        : issue === 'crime' ? `“My neighbour got robbed last week. ${w.regions[npc.home].name} isn't safe after dark any more.”`
        : issue === 'taxes' ? '“Business would be fine if the government stopped taking a bite out of everything.”'
        : issue === 'war' ? '“We have to see this war through. Too many have given too much.”'
        : issue === 'peace' ? '“My cousin is at the front. When does it end?”'
        : issue === 'pollution' ? '“You can taste the factories in the air. My kid has a cough that won’t quit.”'
        : issue === 'health' ? `“The nearest decent hospital is hours away from ${w.regions[npc.home].name}.”`
        : '“Something has to give around here. People are angry.”';
      say(convo, 'npc', line);
      say(convo, 'note', `${ISSUE_INFO[issue].icon} ${npc.name} cares most about ${ISSUE_INFO[issue].name.toLowerCase()}.`);
      npc.flags.toldIssue = ISSUES.indexOf(issue);
      // Listening helps.
      adjustRel(npc, p.id, 2);
      break;
    }
    case 'news': {
      say(convo, 'npc', rumour(w, npc));
      break;
    }
    case 'views': {
      const pres = n.president != null ? w.citizens[n.president] : null;
      const mood = npc.mood;
      const line = !pres ? '“Nobody’s running the country right now, and it shows.”'
        : pres.id === p.id ? (mood > 0.1 ? '“You’re doing all right, I’ll give you that.”' : '“Since you ask: you’re letting people down.”')
        : mood > 0.2 ? `“${pres.name}? Could be worse. Things are ticking along.”`
        : mood < -0.2 ? `“${pres.name} has no idea what life is like out here.”`
        : `“${pres.name}… some good, some bad. Mostly talk.”`;
      say(convo, 'npc', line);
      const s = w.govs[npc.home];
      if (s?.head.name) say(convo, 'npc', s.approval > 55 ? `“${s.head.name} runs ${w.regions[npc.home].name} well enough.”` : `“And ${s.head.name}? Don’t get me started.”`);
      say(convo, 'note', `${npc.name} leans ${IDEOLOGIES[npc.ideo].name.toLowerCase()}${npc.party != null ? ` (member of the ${w.parties[npc.party]?.name})` : ''}.`);
      break;
    }
    case 'ambition': {
      const goal = goalText(w, npc);
      say(convo, 'npc', goal ? `“Between us? I want to ${goal}.”` : '“Just getting by, really.”');
      if (npc.sec.goal?.kind === 'governor' || npc.sec.goal?.kind === 'president') say(convo, 'note', 'Endorsing them publicly (their profile) would earn their gratitude.');
      if (npc.sec.goal?.kind === 'fortune' || npc.sec.goal?.kind === 'tycoon') say(convo, 'note', 'A job or a business partner would win them over.');
      adjustRel(npc, p.id, 1);
      break;
    }
    case 'vote': {
      const cand = playerCandidacy(w);
      const agree = 20 - ideoDistance(npc.ideo, p.ideo) * 30 + rel * 0.6 + p.influence / 10 + (npc.flags.toldIssue != null ? 5 : 0);
      if (agree > 10 + rand(w, 0, 20)) {
        pledge(w, npc, p.id);
        say(convo, 'npc', rel > 30 ? '“For you? Of course. You have my vote.”' : '“Alright. You’ve convinced me — you have my vote.”');
        say(convo, 'note', `🗳️ ${npc.name} promised to vote for you${cand ? ` (${cand.label})` : ''}. Their neighbours listen to them.`);
        // A pledged resident brings a few of their neighbours along.
        for (const x of residents(w, npc.home).filter((y) => y.id !== npc.id && !y.player && (y.rel[npc.id] ?? 0) > 20 && pledgeOf(w, y) == null).slice(0, 2)) if (chance(w, 0.4)) pledge(w, x, p.id);
      } else {
        say(convo, 'npc', rel < -10 ? '“Not a chance.”' : `“I’ll think about it. ${IDEOLOGIES[npc.ideo].name} is where I stand, though.”`);
        adjustRel(npc, p.id, -1);
      }
      break;
    }
    case 'party': {
      const party = partyOf(w, p)!;
      const d = ideoDistance(npc.ideo, party.ideo);
      if (npc.party == null && d < 0.35 && rel + rand(w, 0, 40) > 30) {
        joinPartyRaw(w, npc, party);
        say(convo, 'npc', `“You know what? Sign me up.”`);
        say(convo, 'note', `🎉 ${npc.name} joined the ${party.name}.`);
        adjustRel(npc, p.id, 5);
      } else if (npc.party != null && npc.party !== party.id) say(convo, 'npc', `“I’m with the ${w.parties[npc.party]?.name}. Always have been.”`);
      else say(convo, 'npc', d >= 0.35 ? `“Your lot? We don’t see eye to eye.”` : '“Maybe one day. I’m not much of a joiner.”');
      break;
    }
    case 'hire': {
      const co = Object.values(w.companies).find((x) => x.owner.k === 'cit' && x.owner.id === p.id && x.offer && x.workers.length < x.offer.slots && controller(w.regions[x.region]) === controller(w.regions[npc.loc]))!;
      const better = !npc.job || !w.companies[npc.job] || netWage(w, co, npc).net > netWage(w, w.companies[npc.job], npc).net * 0.95 || rel > 40;
      if (better) {
        if (npc.job != null) { const old = w.companies[npc.job]; if (old) old.workers = old.workers.filter((x) => x !== npc.id); }
        co.workers.push(npc.id);
        npc.job = co.id;
        npc.jobSince = w.time;
        adjustRel(npc, p.id, 8);
        say(convo, 'npc', `“You’ve got yourself a worker. When do I start?”`);
        say(convo, 'note', `${npc.name} now works at ${co.name}.`);
      } else say(convo, 'npc', '“Thanks, but I’m better off where I am.”');
      break;
    }
    case 'treat': {
      const nat = controller(w.regions[p.loc]);
      const code = w.nations[nat].cur;
      pay(w, cref(p.id), hhref(nat), code, cur(B.social.treatCost), 'Coffee and a chat');
      const d = 4 + Math.round(npc.traits.greed * 4);
      adjustRel(npc, p.id, d);
      say(convo, 'npc', pick(w, ['“Oh, that’s kind of you.”', '“Well, I won’t say no.”', '“Now that’s a proper conversation starter.”']));
      say(convo, 'note', `+${d} relationship.`);
      break;
    }
    case 'job': {
      const employer = npc.job != null ? w.companies[npc.job] : Object.values(w.companies).find((co) => co.owner.k === 'cit' && co.owner.id === npc.id);
      const open = employer?.offer && employer.workers.length < employer.offer.slots;
      if (employer && open) {
        say(convo, 'npc', `“${employer.name} is hiring, as it happens. Tell them I sent you — ${fmtAmt(w.nations[controller(w.regions[employer.region])].cur, employer.offer!.wage)} a shift.”`);
        say(convo, 'note', `Apply from Employment (it's in ${w.regions[employer.region].name}).`);
      } else {
        const best = companiesIn(w, npc.home).filter((co) => co.offer && co.workers.length < co.offer.slots).sort((a, b) => b.offer!.wage - a.offer!.wage)[0];
        say(convo, 'npc', best ? `“Not where I am, but ${best.name} was looking for people last I heard.”` : '“It’s tight everywhere right now, sorry.”');
      }
      break;
    }
    case 'argue': {
      const d = ideoDistance(npc.ideo, p.ideo);
      const odds = 0.08 + p.attrs.lead * 0.01 + Math.max(0, rel) / 250 + (1 - npc.ideoStr) * 0.3 - d * 0.25;
      if (chance(w, Math.max(0.02, Math.min(0.6, odds)))) {
        const old = npc.ideo;
        npc.ideo = p.ideo;
        npc.ideoStr = Math.max(0.2, npc.ideoStr * 0.7);
        say(convo, 'npc', '“Huh. I never thought of it that way. Maybe you’re right.”');
        say(convo, 'note', `💡 ${npc.name} came round to ${IDEOLOGIES[p.ideo].name.toLowerCase()} (was ${IDEOLOGIES[old].name.toLowerCase()}).`);
        addXp(w, p, 3);
      } else if (chance(w, 0.4 + d * 0.3)) {
        adjustRel(npc, p.id, -4);
        say(convo, 'npc', '“We’ll have to agree to disagree. Strongly.”');
      } else say(convo, 'npc', '“Interesting point. Not convinced, though.”');
      npc.ideoStr = Math.min(1, npc.ideoStr + 0.02);
      break;
    }
    case 'insult': {
      adjustRel(npc, p.id, -15);
      say(convo, 'npc', pick(w, ['“How dare you!”', '“Get out of my sight.”', '“You’ll regret that.”']));
      if ((npc.rel[p.id] ?? 0) < -40 && !p.sec.rivals.includes(npc.id) && chance(w, 0.5)) {
        p.sec.rivals.push(npc.id);
        say(convo, 'note', `😠 ${npc.name} is now your rival.`);
      }
      w.player.convo = null;
      return ok(`${npc.name} stormed off.`);
    }
  }
  offerChoices(w, convo);
  return ok('');
}

/** Something true about the world, as local gossip. */
function rumour(w: World, c: Citizen): string {
  const p = player(w);
  const rel = c.rel[p.id] ?? 0;
  const opts: (() => string | null)[] = [
    () => {
      const best = companiesIn(w, c.home).filter((co) => co.offer && co.workers.length < co.offer.slots).sort((a, b) => b.offer!.wage - a.offer!.wage)[0];
      return best ? `“${best.name} is hiring and paying ${fmtAmt(w.nations[controller(w.regions[best.region])].cur, best.offer!.wage)} a shift. Best money in ${w.regions[c.home].name}.”` : null;
    },
    () => {
      const s = w.govs[c.home];
      return s && s.nextElection - w.time < 12 * 1440 ? `“${w.regions[c.home].name} votes on day ${dayOf(s.nextElection)}. ${s.candidates.length ? `${s.candidates.map((x) => x.name).join(', ')} are in the running.` : 'Nobody’s declared yet.'}”` : null;
    },
    () => {
      const synd = Object.values(w.syndicates).find((x) => x.turf.includes(c.home) || x.home === c.home);
      return synd && rel >= 15 ? `“Keep it quiet, but ${synd.name} runs things around here. Shopkeepers pay them to stay open.”` : null;
    },
    () => {
      const war = activeWars(w).find((x) => x.att === c.nation || x.def === c.nation);
      return war ? `“They say the fighting with ${w.nations[war.att === c.nation ? war.def : war.att].name} will get worse before it gets better.”` : null;
    },
    () => {
      const cr = activeCrises(w).find((x) => x.nation === c.nation);
      return cr ? `“Have you heard about the ${cr.name}? Terrible business.”` : null;
    },
    () => {
      const here = w.lastPrice[`${controller(w.regions[c.loc])}|food:1`];
      const cheaper = w.nations.filter((n) => n.id !== c.nation && !n.exile).map((n) => ({ n, price: w.lastPrice[`${n.id}|food:1`] })).filter((x) => x.price && here && x.price * (x.n.fxAnchor || 1) < here * (w.nations[c.nation].fxAnchor || 1) * 0.7)[0];
      return cheaper ? `“Food’s dirt cheap in ${cheaper.n.name}, apparently. Traders are making a killing.”` : null;
    },
    () => {
      const crook = residents(w, c.home).find((x) => x.sec.notoriety > 6 && x.id !== c.id && !x.player);
      return crook && rel >= 25 ? `“Watch out for ${crook.name}. Everybody knows what they’re into.”` : null;
    },
  ];
  const lines = opts.map((f) => f()).filter(Boolean) as string[];
  return lines.length ? pick(w, lines) : pick(w, ['“Quiet week, really.”', '“Not much. Same old, same old.”', '“Nothing I’d repeat.”']);
}

// ---------- rallies and canvassing ----------

export const rallyCost = (w: World, rid: Id) => cur(Math.round(20 + Math.sqrt(w.regions[rid].pop / 1000) * 6));

export function rallyCheck(w: World, p: Citizen, issue: Issue): string | null {
  if (jailed(w, p)) return 'You are in prison.';
  if (!ISSUE_INFO[issue]) return 'Pick an issue.';
  if (w.regions[p.loc].owner !== p.nation && controller(w.regions[p.loc]) !== p.nation) return 'Rallies are held in your own country.';
  if (p.level < B.politics.voteLevel) return `Reach level ${B.politics.voteLevel} to hold rallies.`;
  if (w.player.lastRally === today(w)) return 'You already held a rally today.';
  if (p.energy < B.social.rallyEnergy) return `Needs ${B.social.rallyEnergy} energy.`;
  const code = w.nations[controller(w.regions[p.loc])].cur;
  if ((p.wallet[code] ?? 0) < rallyCost(w, p.loc)) return `Hiring the hall, posters and sound costs ${fmtAmt(code, rallyCost(w, p.loc))}.`;
  return null;
}

/** Speak to a crowd about one issue. Residents who care about it (and share your views) warm to you. */
export function holdRally(w: World, issue: Issue): Result {
  const p = player(w);
  const why = rallyCheck(w, p, issue);
  if (why) return fail(why);
  const r = w.regions[p.loc];
  const nat = controller(r);
  const code = w.nations[nat].cur;
  const cost = rallyCost(w, p.loc);
  pay(w, cref(p.id), hhref(nat), code, cost, `Rally in ${r.name}`);
  p.energy -= B.social.rallyEnergy;
  w.player.lastRally = today(w);
  const top = localIssues(w, p.loc);
  const rank = top.findIndex((x) => x.issue === issue);
  const resonance = rank < 0 ? 0.3 : [1, 0.8, 0.6, 0.45][rank] ?? 0.35;
  const draw = 0.35 + Math.min(0.4, p.influence / 250 + p.sec.fame / 60 + p.attrs.lead * 0.01);
  const crowd = Math.round(r.pop * 0.004 * draw * (0.6 + resonance) * rand(w, 0.8, 1.2)) + 30;
  const cand = playerCandidacy(w);
  let won = 0, lost = 0, pledges = 0;
  const local = presentIn(w, p.loc).filter((c) => !c.player && c.nation === p.nation);
  for (const c of local) {
    if (!chance(w, draw)) continue;
    const cares = concernOf(w, c) === issue;
    const fit = ISSUE_INFO[issue].ideo.includes(c.ideo) ? 1 : 0;
    const d = Math.round((cares ? 6 : 2) * (0.5 + resonance) + fit * 3 - ideoDistance(c.ideo, p.ideo) * 4);
    adjustRel(c, p.id, d);
    if (d > 0) won++; else if (d < 0) lost++;
    if (cand && d >= 5 && pledgeOf(w, c) == null && chance(w, 0.35)) { pledge(w, c, p.id); pledges++; }
  }
  const gain = +(crowd / 400 * (0.5 + resonance)).toFixed(1);
  p.influence += gain;
  p.sec.fame += 0.3 + resonance * 0.5;
  // The region's standing mood drifts toward the ideologies that own the issue.
  const s = w.govs[p.loc];
  if (s) { for (const i of ISSUE_INFO[issue].ideo) s.lean[i] = (s.lean[i] ?? 0) + 0.004 * resonance; if (cand?.region === p.loc) { const me = s.candidates.find((x) => x.cit === p.id); if (me) me.campaign += Math.round(cost * (0.5 + resonance)); } }
  addXp(w, p, 6);
  const verdict = resonance >= 0.8 ? 'The crowd roared' : resonance >= 0.6 ? 'The speech landed well' : 'The crowd was polite but distracted';
  localNews(w, p.loc, `📣 ${p.name} spoke to ${crowd.toLocaleString()} people about ${ISSUE_INFO[issue].name.toLowerCase()}.`);
  record(w, 'politics', `📣 ${p.name} held a rally on ${ISSUE_INFO[issue].name.toLowerCase()} in ${r.name} (${crowd.toLocaleString()} attended).`, { cit: p.id, region: p.loc, nation: nat, player: true });
  return ok(`${verdict}: ${crowd.toLocaleString()} came to hear “${ISSUE_INFO[issue].pitch}”. +${gain} influence; ${won} residents warmed to you${lost ? `, ${lost} were put off` : ''}${pledges ? `; ${pledges} promised their vote` : ''}.`);
}

export function canvassCheck(w: World, p: Citizen): string | null {
  if (jailed(w, p)) return 'You are in prison.';
  if (w.player.lastCanvass === today(w)) return 'You already went door to door today.';
  if (p.energy < B.social.canvassEnergy) return `Needs ${B.social.canvassEnergy} energy.`;
  if (!residents(w, p.loc).some((c) => !c.player && c.nation === p.nation)) return 'None of your compatriots live here.';
  return null;
}

/** Knock on doors: meet a handful of residents, hear their concerns and ask for their support. */
export function canvass(w: World): Result {
  const p = player(w);
  const why = canvassCheck(w, p);
  if (why) return fail(why);
  p.energy -= B.social.canvassEnergy;
  w.player.lastCanvass = today(w);
  const cand = playerCandidacy(w);
  const pool = residents(w, p.loc).filter((c) => !c.player && c.nation === p.nation && !jailed(w, c));
  const visits = Math.min(pool.length, randInt(w, 3, 5) + Math.floor(p.attrs.lead / 5));
  const lines: string[] = [];
  let pledges = 0;
  const seen = new Set<Id>();
  for (let i = 0; i < visits * 3 && seen.size < visits; i++) {
    const c = pool[randInt(w, 0, pool.length - 1)];
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const issue = concernOf(w, c);
    c.flags.toldIssue = ISSUES.indexOf(issue);
    const d = Math.round(4 + p.attrs.lead * 0.3 + p.influence / 40 - ideoDistance(c.ideo, p.ideo) * 3 + rand(w, -2, 3));
    adjustRel(c, p.id, d);
    let res = d >= 5 ? 'glad you came' : d >= 2 ? 'listened politely' : d > 0 ? 'unconvinced' : 'shut the door on you';
    if (cand && d >= 3 && pledgeOf(w, c) == null && chance(w, 0.3 + (c.rel[p.id] ?? 0) / 200)) { pledge(w, c, p.id); pledges++; res = 'promised their vote'; }
    lines.push(`${c.name} (${c.persona}, ${ISSUE_INFO[issue].icon} ${ISSUE_INFO[issue].name.toLowerCase()}): ${res}`);
  }
  addXp(w, p, 3);
  p.influence += 0.3 * seen.size;
  return ok(`You knocked on ${seen.size} doors in ${w.regions[p.loc].name}${pledges ? ` — ${pledges} promised you their vote` : ''}. ${lines.join('; ')}.`);
}

