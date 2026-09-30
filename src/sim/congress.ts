// Congress: deputies and the president draft proposals, vote, and enacted laws
// change the simulation (taxes affect subsequent wages and sales, minimum wage
// constrains job offers, printing mints currency, embargoes block trade…).
import type { Citizen, Id, Nation, Proposal, ProposalType, World } from './types';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { burn, mint } from '../engine/ledger';
import { GOLD, c as cur, fmtAmt } from '../engine/money';
import { HOUR } from '../engine/clock';
import { nid, notify, record } from '../engine/events';
import { chance, pick, weighted } from '../engine/rng';
import { natref, player } from './query';
import { taxCeilings } from './taxes';
import { callSpecialElection, partyOf } from './politics';
import { bump } from './progress';
import { EXTRA_PROPOSALS } from './congressExtra';

export const PROPOSAL_INFO: Record<string, { name: string; fullTerm: boolean }> = {
  workTax: { name: 'Set work tax', fullTerm: false },
  vat: { name: 'Set VAT', fullTerm: false },
  importTax: { name: 'Set import tax', fullTerm: false },
  minWage: { name: 'Set minimum wage', fullTerm: false },
  print: { name: 'Print money', fullTerm: true },
  embargo: { name: 'Impose embargo', fullTerm: false },
  liftEmbargo: { name: 'Lift embargo', fullTerm: false },
  alliance: { name: 'Propose alliance', fullTerm: false },
  breakAlliance: { name: 'End alliance', fullTerm: false },
  impeach: { name: 'Impeach the president', fullTerm: true },
  newElection: { name: 'Call a new presidential election', fullTerm: true },
};

export const eligibleVoters = (n: Nation) => [...new Set([...n.deputies, ...(n.president != null ? [n.president] : [])])];

/** Expected effect and treasury cost of a draft proposal. */
export function describe(w: World, n: Nation, type: ProposalType, params: Record<string, any>): { effect: string; cost: number } {
  const ext = EXTRA_PROPOSALS[type];
  if (ext) return ext.describe(w, n, params);
  switch (type) {
    case 'workTax': return { effect: `Work tax ${n.taxes.work}% → ${params.value}%. Changes net wages on every later shift and treasury revenue (~${estRevenue(w, n, 'work', params.value)}).`, cost: 0 };
    case 'vat': return { effect: `VAT ${n.taxes.vat}% → ${params.value}%. Applies to every later market sale in ${n.name}.`, cost: 0 };
    case 'importTax': return { effect: `Import tax ${n.taxes.import}% → ${params.value}%. Applies to foreign sellers in ${n.name}.`, cost: 0 };
    case 'minWage': return { effect: `Minimum wage ${fmtAmt(n.cur, n.minWage)} → ${fmtAmt(n.cur, params.value)}. Offers below it cannot be posted; public works pay ${B.treasury.publicWorksFrac * 100}% of it.`, cost: 0 };
    case 'print': {
      const goldCost = Math.round((params.amount * 1000) / Math.max(1, n.fxAnchor) * B.politics.printGoldShare);
      return { effect: `Mint ${fmtAmt(n.cur, params.amount)} into the treasury, burning ${fmtAmt(GOLD, goldCost)} of treasury gold. Adds currency supply (pressure on the exchange rate).`, cost: goldCost };
    }
    case 'embargo': return { effect: `Block goods-market trade between ${n.name} and ${w.nations[params.target].name} citizens/companies.`, cost: 0 };
    case 'liftEmbargo': return { effect: `End the embargo on ${w.nations[params.target].name}.`, cost: 0 };
    case 'alliance': return { effect: `Offer an alliance to ${w.nations[params.target].name} (their government must accept). Allies fight without the 30% foreign-flag penalty.`, cost: 0 };
    case 'breakAlliance': return { effect: `End the alliance with ${w.nations[params.target].name}.`, cost: 0 };
    case 'impeach': return { effect: `Remove President ${w.citizens[n.president!]?.name ?? '—'}; the vice president acts until a special election in ${B.politics.specialElectionDays} days.`, cost: 0 };
    case 'newElection': return { effect: `Hold a special presidential election in ${B.politics.specialElectionDays} days.`, cost: 0 };
    default: return { effect: type, cost: 0 };
  }
}

function estRevenue(w: World, n: Nation, _k: string, v: number) {
  const recent = n.stats.revHist.slice(-5);
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const ratio = n.taxes.work > 0 ? v / n.taxes.work : 1;
  return `${fmtAmt(n.cur, Math.round(avg * (0.5 + 0.5 * ratio)))}/day total revenue`;
}

export function proposeCheck(w: World, c: Citizen, type: ProposalType, params: Record<string, any>): string | null {
  const n = w.nations[c.nation];
  if (!n.deputies.includes(c.id) && n.president !== c.id) return 'Only deputies and the president can draft proposals.';
  if ((n.propCount[c.id] ?? 0) >= B.politics.proposalsPerDeputy) return `Limit of ${B.politics.proposalsPerDeputy} proposals per mandate reached.`;
  if (Object.values(w.proposals).some((p) => p.nation === n.id && p.status === 'open' && p.type === type && JSON.stringify(p.params) === JSON.stringify(params))) return 'An identical proposal is already being voted on.';
  const ext = EXTRA_PROPOSALS[type];
  if (ext) return ext.check(w, n, c, params);
  const ceil = taxCeilings(w, n);
  switch (type) {
    case 'workTax': case 'vat': case 'importTax': {
      const key = type === 'workTax' ? 'work' : type === 'vat' ? 'vat' : 'import';
      const v = params.value;
      if (!Number.isInteger(v) || v < 0) return 'Enter a whole percentage.';
      if (v > Math.floor(ceil[key])) return `Above the ${Math.floor(ceil[key])}% ceiling set by congress’s ideology mix.`;
      if (v === n.taxes[key]) return 'That is already the rate.';
      return null;
    }
    case 'minWage': return !(params.value >= 0) ? 'Invalid wage.' : params.value === n.minWage ? 'That is already the minimum wage.' : null;
    case 'print': {
      if (!(params.amount > 0)) return 'Enter an amount.';
      const d = describe(w, n, type, params);
      return (n.wallet[GOLD] ?? 0) < d.cost ? `The treasury lacks ${fmtAmt(GOLD, d.cost)} gold to back the printing.` : null;
    }
    case 'embargo': return params.target === n.id || !w.nations[params.target] ? 'Pick another nation.' : n.embargoes.includes(params.target) ? 'Already embargoed.' : null;
    case 'liftEmbargo': return !n.embargoes.includes(params.target) ? 'No embargo in place.' : null;
    case 'alliance': return params.target === n.id || !w.nations[params.target] ? 'Pick another nation.' : n.alliances.includes(params.target) ? 'Already allied.' : null;
    case 'breakAlliance': return !n.alliances.includes(params.target) ? 'Not allied.' : null;
    case 'impeach': return n.president == null ? 'There is no president.' : n.president === c.id ? 'You cannot impeach yourself.' : null;
    case 'newElection': return null;
  }
  return 'Unknown proposal.';
}

export function propose(w: World, c: Citizen, type: ProposalType, params: Record<string, any>): Result {
  const why = proposeCheck(w, c, type, params);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  const d = describe(w, n, type, params);
  const info = PROPOSAL_INFO[type] ?? EXTRA_PROPOSALS[type]?.info;
  const p: Proposal = {
    id: nid(w), nation: n.id, type, params, author: c.id, created: w.time, closes: w.time + B.politics.voteHours * HOUR,
    votes: { [c.id]: 'y' }, status: 'open', effect: d.effect, cost: d.cost, fullTerm: info?.fullTerm ?? false,
  };
  w.proposals[p.id] = p;
  n.propCount[c.id] = (n.propCount[c.id] ?? 0) + 1;
  record(w, 'congress', `📜 ${c.name} proposed in ${n.name}: ${info?.name ?? type} — ${d.effect}`, { nation: n.id, cit: c.id, player: c.player });
  const pl = player(w);
  if (!c.player && pl.nation === n.id && eligibleVoters(n).includes(pl.id)) notify(w, 'office', `📜 New proposal to vote on: ${info?.name ?? type} (by ${c.name}).`, { link: 'congress' });
  if (c.player) bump(w, 'propose');
  return ok('Proposal submitted. Deputies vote over the next 24 hours.');
}

export function voteCheck(w: World, c: Citizen, p: Proposal | undefined): string | null {
  if (!p) return 'Proposal not found.';
  if (p.status !== 'open') return 'Voting has closed.';
  const n = w.nations[p.nation];
  if (!eligibleVoters(n).includes(c.id)) return 'Only deputies and the president vote.';
  if (p.votes[c.id]) return `You already voted ${p.votes[c.id] === 'y' ? 'yes' : 'no'}.`;
  return null;
}

export function voteProposal(w: World, c: Citizen, pid: Id, yes: boolean): Result {
  const p = w.proposals[pid];
  const why = voteCheck(w, c, p);
  if (why) return fail(why);
  p.votes[c.id] = yes ? 'y' : 'n';
  // Deputies notice who votes with them.
  for (const [id, v] of Object.entries(p.votes)) {
    const d = w.citizens[Number(id)];
    if (d && !d.player && c.player) d.rel[c.id] = (d.rel[c.id] ?? 0) + (v === p.votes[c.id] ? 1 : -1);
  }
  if (c.player) bump(w, 'vote');
  maybeClose(w, p);
  return ok(`Voted ${yes ? 'YES' : 'NO'}.`);
}

/** Probability an AI deputy supports a proposal, from ideology, situation, coalition and relationships. */
export function supportChance(w: World, d: Citizen, p: Proposal): number {
  const n = w.nations[p.nation];
  const party = partyOf(w, d);
  const ideo = IDEOLOGIES[party?.ideo ?? d.ideo];
  let s = 0;
  const treasuryDays = (n.wallet[n.cur] ?? 0) / Math.max(1, avgSpend(n));
  const ext = EXTRA_PROPOSALS[p.type];
  if (ext) s += ext.support(w, n, d, p.params);
  switch (p.type) {
    case 'workTax': case 'vat': case 'importTax': {
      const cur_ = p.type === 'workTax' ? n.taxes.work : p.type === 'vat' ? n.taxes.vat : n.taxes.import;
      const up = p.params.value > cur_ ? 1 : -1;
      s += up * (ideo.taxPref * 0.35 + (treasuryDays < 5 ? 0.25 : treasuryDays > 30 ? -0.2 : 0));
      if (p.type === 'importTax') s += up * (party?.ideo === 'nationalism' || party?.ideo === 'communism' ? 0.2 : party?.ideo === 'capitalism' ? -0.2 : 0);
      s -= Math.abs(p.params.value - cur_) * 0.02;
      break;
    }
    case 'minWage': {
      const up = p.params.value > n.minWage ? 1 : -1;
      s += up * (ideo.taxPref * 0.3 - n.unemployment * 0.8 + 0.05);
      break;
    }
    case 'print': s += ideo.taxPref * 0.2 + (treasuryDays < 5 ? 0.3 : -0.3) + (party?.ideo === 'capitalism' ? -0.3 : 0); break;
    case 'embargo': s += -(n.relations[p.params.target]?.score ?? 0) / 60 + (party?.ideo === 'communism' ? 0.2 : 0) - 0.1; break;
    case 'liftEmbargo': s += (n.relations[p.params.target]?.score ?? 0) / 60 + 0.1; break;
    case 'alliance': s += (n.relations[p.params.target]?.score ?? 0) / 50 + (party?.ideo === w.parties[w.citizens[w.nations[p.params.target].president ?? -1]?.party ?? -1]?.ideo ? 0.2 : 0); break;
    case 'breakAlliance': s += -(n.relations[p.params.target]?.score ?? 0) / 50; break;
    case 'impeach': case 'newElection': {
      const presParty = n.president != null ? w.citizens[n.president]?.party : null;
      s += (party?.id === presParty ? -0.6 : 0.1) + (B.politics.impeachApproval + 10 - n.approval) / 40 - (p.type === 'impeach' ? 0.15 : 0);
      break;
    }
  }
  // Coalition: the president's party (and friendly parties) back presidential proposals.
  const author = w.citizens[p.author];
  if (author) {
    if (author.id === n.president && party?.id === w.citizens[n.president!]?.party) s += 0.3 * d.traits.loyalty + 0.1;
    if (author.party != null && author.party === party?.id) s += 0.25 * d.traits.loyalty;
    s += (d.rel[author.id] ?? 0) / 200;
  }
  // Party whip: follow the leader's recorded vote.
  if (party && p.votes[party.leader] && party.leader !== d.id) s += (p.votes[party.leader] === 'y' ? 1 : -1) * 0.3 * d.traits.loyalty;
  return Math.max(0.03, Math.min(0.97, 0.5 + s));
}

/** Average daily treasury spending (falls back to revenue early on). */
function avgSpend(n: Nation) {
  const r = (n.stats.spendHist.length ? n.stats.spendHist : n.stats.revHist).slice(-7);
  return r.length ? Math.max(100, r.reduce((a, b) => a + b, 0) / r.length) : 10000;
}

function maybeClose(w: World, p: Proposal) {
  if (p.status !== 'open') return;
  const n = w.nations[p.nation];
  const eligible = eligibleVoters(n).length;
  const yes = Object.values(p.votes).filter((v) => v === 'y').length;
  const no = Object.values(p.votes).filter((v) => v === 'n').length;
  const majority = Math.floor(eligible / 2) + 1;
  if (!p.fullTerm && (yes >= majority || no >= majority)) return close(w, p);
  if (w.time >= p.closes) return close(w, p);
}

function close(w: World, p: Proposal) {
  const n = w.nations[p.nation];
  const yes = Object.values(p.votes).filter((v) => v === 'y').length;
  const no = Object.values(p.votes).filter((v) => v === 'n').length;
  const name = PROPOSAL_INFO[p.type]?.name ?? EXTRA_PROPOSALS[p.type]?.info.name ?? p.type;
  const pl = player(w);
  if (yes > no) {
    p.status = 'passed';
    p.enactedAt = w.time;
    const msg = enact(w, n, p);
    record(w, 'law', `✅ ${n.name} congress passed “${name}” (${yes}–${no}). ${msg}`, { nation: n.id, important: true, player: p.author === pl.id });
    if (p.author === pl.id) { bump(w, 'lawPassed'); pl.influence += 2; }
    if (n.id === pl.nation) notify(w, 'politics', `✅ Law passed in ${n.name}: ${name} (${yes}–${no}). ${msg}`, { link: 'congress' });
  } else {
    p.status = 'failed';
    record(w, 'law', `❌ ${n.name} congress rejected “${name}” (${yes}–${no}).`, { nation: n.id, player: p.author === pl.id });
    if (n.id === pl.nation && (p.author === pl.id || eligibleVoters(n).includes(pl.id))) notify(w, 'politics', `❌ Rejected: ${name} (${yes}–${no}).`, { link: 'congress' });
  }
}

function enact(w: World, n: Nation, p: Proposal): string {
  const ext = EXTRA_PROPOSALS[p.type];
  if (ext) return ext.enact(w, n, p);
  switch (p.type) {
    case 'workTax': n.taxes.work = p.params.value; return `Work tax is now ${n.taxes.work}%.`;
    case 'vat': n.taxes.vat = p.params.value; return `VAT is now ${n.taxes.vat}%.`;
    case 'importTax': n.taxes.import = p.params.value; return `Import tax is now ${n.taxes.import}%.`;
    case 'minWage': {
      n.minWage = p.params.value;
      // Existing offers below the new minimum are raised.
      for (const co of Object.values(w.companies)) if (co.offer && co.offer.wage < n.minWage && w.regions[co.region].owner === n.id) co.offer.wage = n.minWage;
      return `Minimum wage is now ${fmtAmt(n.cur, n.minWage)}.`;
    }
    case 'print': {
      const d = describe(w, n, 'print', p.params);
      if (!burn(w, natref(n.id), GOLD, d.cost, 'Money printing backing')) return 'Printing failed: not enough treasury gold.';
      mint(w, natref(n.id), n.cur, p.params.amount, 'Money printing');
      n.printed += p.params.amount;
      return `${fmtAmt(n.cur, p.params.amount)} printed.`;
    }
    case 'embargo': if (!n.embargoes.includes(p.params.target)) n.embargoes.push(p.params.target); relation(w, n.id, p.params.target, -15, 'embargo imposed'); return `Embargo on ${w.nations[p.params.target].name} in force.`;
    case 'liftEmbargo': n.embargoes = n.embargoes.filter((x) => x !== p.params.target); relation(w, n.id, p.params.target, 5, 'embargo lifted'); return 'Embargo lifted.';
    case 'alliance': {
      const t = w.nations[p.params.target];
      const accept = (t.relations[n.id]?.score ?? 0) > 15 && !t.exile;
      if (!accept) { relation(w, n.id, t.id, -2, 'alliance offer refused'); return `${t.name} declined the alliance (relations too cool).`; }
      if (!n.alliances.includes(t.id)) n.alliances.push(t.id);
      if (!t.alliances.includes(n.id)) t.alliances.push(n.id);
      relation(w, n.id, t.id, 10, 'alliance formed');
      return `Alliance formed with ${t.name}.`;
    }
    case 'breakAlliance': {
      const t = w.nations[p.params.target];
      n.alliances = n.alliances.filter((x) => x !== t.id);
      t.alliances = t.alliances.filter((x) => x !== n.id);
      relation(w, n.id, t.id, -10, 'alliance ended');
      return `Alliance with ${t.name} ended.`;
    }
    case 'impeach': {
      const old = n.president;
      n.president = n.cabinet.vp ?? null;
      delete n.cabinet.vp;
      callSpecialElection(w, n);
      if (old === player(w).id) notify(w, 'office', '⚖️ You were impeached and removed from office.', { critical: true });
      return `President ${w.citizens[old!]?.name} removed. Special election in ${B.politics.specialElectionDays} days.`;
    }
    case 'newElection': callSpecialElection(w, n); return `Special election in ${B.politics.specialElectionDays} days.`;
  }
  return '';
}

/** Change relations symmetrically with a recorded reason. */
export function relation(w: World, a: Id, b: Id, delta: number, why: string) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const n = w.nations[x];
    if (!n || !n.relations[y]) continue;
    const r = n.relations[y];
    r.score = Math.max(-100, Math.min(100, r.score + delta));
    r.hist.unshift({ t: w.time, delta, why });
    if (r.hist.length > 20) r.hist.length = 20;
  }
}

/** Hourly: AI deputies cast votes; proposals close. */
export function congressHourly(w: World) {
  for (const p of Object.values(w.proposals).sort((a, b) => a.id - b.id)) {
    if (p.status !== 'open') continue;
    const n = w.nations[p.nation];
    for (const id of eligibleVoters(n)) {
      const d = w.citizens[id];
      if (!d || d.player || p.votes[id]) continue;
      if (!chance(w, 0.3)) continue;
      p.votes[id] = chance(w, supportChance(w, d, p)) ? 'y' : 'n';
    }
    maybeClose(w, p);
  }
  // Prune long-closed proposals (keep the last 60 per nation for voting histories).
  const closed = Object.values(w.proposals).filter((p) => p.status !== 'open').sort((a, b) => b.created - a.created);
  const keep: Record<Id, number> = {};
  for (const p of closed) { keep[p.nation] = (keep[p.nation] ?? 0) + 1; if (keep[p.nation] > 60) delete w.proposals[p.id]; }
}

/** Daily: AI politicians draft proposals that respond to the nation's situation. */
export function aiProposals(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const authors = eligibleVoters(n).map((id) => w.citizens[id]).filter((c) => c && !c.player && (n.propCount[c.id] ?? 0) < B.politics.proposalsPerDeputy);
    if (!authors.length || !chance(w, 0.35)) continue;
    const a = pick(w, authors);
    const party = partyOf(w, a);
    const ideo = IDEOLOGIES[party?.ideo ?? a.ideo];
    const ceil = taxCeilings(w, n);
    const days = (n.wallet[n.cur] ?? 0) / Math.max(1, avgSpend(n));
    const opts: [ProposalType, Record<string, any>, number][] = [];
    if (days < 6 && n.taxes.work + 2 <= ceil.work) opts.push(['workTax', { value: n.taxes.work + 2 }, 3 + ideo.taxPref]);
    if (days > 25 && n.taxes.work > 3) opts.push(['workTax', { value: n.taxes.work - 2 }, 2 - ideo.taxPref]);
    if (days < 6 && n.taxes.vat + 2 <= ceil.vat) opts.push(['vat', { value: n.taxes.vat + 2 }, 2 + ideo.taxPref]);
    if (n.taxes.work > ceil.work) opts.push(['workTax', { value: Math.floor(ceil.work) }, 5]);
    if (n.unemployment > 0.3 && n.minWage > cur(3)) opts.push(['minWage', { value: n.minWage - cur(1) }, 2]);
    const offers = Object.values(w.companies).filter((co) => co.offer && w.regions[co.region].owner === n.id).map((co) => co.offer!.wage);
    const avgOffer = offers.length ? offers.reduce((a, b) => a + b, 0) / offers.length : n.minWage;
    if (n.unemployment < 0.1 && ideo.taxPref > 0 && n.minWage + cur(1) < avgOffer * 0.75) opts.push(['minWage', { value: n.minWage + cur(1) }, 1.5]);
    if (days < 2 && ideo.taxPref > 0.3) opts.push(['print', { amount: cur(2000) }, 1]);
    if (n.approval < B.politics.impeachApproval && n.president != null && a.party !== w.citizens[n.president]?.party) opts.push(['impeach', {}, 2]);
    for (const [other, rel] of Object.entries(n.relations)) {
      const t = Number(other);
      if (w.nations[t].exile) continue;
      if (rel.score < -40 && !n.embargoes.includes(t)) opts.push(['embargo', { target: t }, 0.6]);
      if (rel.score > -10 && n.embargoes.includes(t)) opts.push(['liftEmbargo', { target: t }, 0.8]);
      if (rel.score > 40 && !n.alliances.includes(t)) opts.push(['alliance', { target: t }, 0.7]);
    }
    for (const [type, gen] of Object.entries(EXTRA_PROPOSALS)) for (const o of gen.aiOptions(w, n, a)) opts.push([type as ProposalType, o.params, o.weight]);
    const valid = opts.filter(([t, prm]) => !proposeCheck(w, a, t, prm));
    if (!valid.length) continue;
    const choice = weighted(w, valid, (o) => Math.max(0.1, o[2]))!;
    propose(w, a, choice[0], choice[1]);
  }
}
