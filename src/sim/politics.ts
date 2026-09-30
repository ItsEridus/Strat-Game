// Parties, elections, cabinet and public opinion.
//  - Elections run on the in-game calendar without player intervention.
//  - Voters are individual AI citizens plus aggregated background blocs.
//  - Every result stores turnout, tallies, seats and a readable explanation.
import { fmtDay } from '../engine/calendar';
import { lifeGate } from './lifecycle';
import { ageOf, isAdult, repNeed, standing } from './growth';
import type { Citizen, Election, Id, Ministry, Nation, Party, World } from './types';
import { census } from './census';
import { B } from '../data/balance';
import { PARTY_NAMES } from '../data/names';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { burn, pay } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { DAY, HOUR, dayOf, nextDom } from '../engine/clock';
import { nid, notify, record, schedule, sendMsg } from '../engine/events';
import { chance, pick, rand } from '../engine/rng';
import { citizensOf, cref, natref, player } from './query';
import { enforceCeilings } from './taxes';
import { bump } from './progress';
import { MINISTRY_INFO } from './authority';

export function congressSize(w: World, n: Nation) {
  const pop = citizensOf(w, n.id).length;
  return Math.max(B.politics.congressMin, Math.min(B.politics.congressMax, Math.round(pop / B.politics.citizensPerSeat)));
}

/** D'Hondt seat allocation. */
export function dhondt(votes: Record<Id, number>, seats: number): Record<Id, number> {
  const out: Record<Id, number> = {};
  const ids = Object.keys(votes).map(Number).filter((k) => votes[k] > 0).sort((a, b) => a - b);
  for (const id of ids) out[id] = 0;
  for (let s = 0; s < seats; s++) {
    let best = -1, bestQ = -1;
    for (const id of ids) {
      const q = votes[id] / (out[id] + 1);
      if (q > bestQ) { bestQ = q; best = id; }
    }
    if (best < 0) break;
    out[best]++;
  }
  return out;
}

export const partyOf = (w: World, c: Citizen): Party | null => (c.party != null ? w.parties[c.party] ?? null : null);
export const partiesOf = (w: World, n: Id) => Object.values(w.parties).filter((p) => p.nation === n).sort((a, b) => a.id - b.id);

/** Leader's ranking of members for the congress list (a player leader's manual order is respected). */
export function sortPartyList(w: World, p: Party, registered?: Id[]) {
  const leader = w.citizens[p.leader];
  const eligible = (registered ?? p.members).filter((id) => w.citizens[id]?.party === p.id && standing(w.citizens[id]) >= B.politics.congressRep);
  if (leader?.player) {
    const kept = p.list.filter((id) => eligible.includes(id));
    p.list = [...kept, ...eligible.filter((id) => !kept.includes(id))];
    return;
  }
  const score = (id: Id) => {
    const c = w.citizens[id];
    return c.influence + (c.persona === 'politician' ? 15 : 0) + c.traits.ambition * 10 + (leader?.rel[id] ?? 0) / 4 + (id === p.leader ? 1000 : 0);
  };
  p.list = eligible.slice().sort((a, b) => score(b) - score(a) || a - b);
}

export function fillDeputies(w: World, n: Nation) {
  n.deputies = [];
  for (const p of partiesOf(w, n.id)) n.deputies.push(...p.list.slice(0, n.seats[p.id] ?? 0));
}

// ---------- seeding ----------
export function seedPolitics(w: World) {
  for (const n of w.nations) {
    const cits = citizensOf(w, n.id).filter((c) => !c.player);
    const counts: Record<string, number> = {};
    for (const c of cits) counts[c.ideo] = (counts[c.ideo] ?? 0) + 1;
    const ideos = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).slice(0, 4) as Citizen['ideo'][];
    for (const ideo of ideos) {
      const fans = cits.filter((c) => c.ideo === ideo);
      const leader = fans.slice().sort((a, b) => (b.persona === 'politician' ? 1 : 0) - (a.persona === 'politician' ? 1 : 0) || b.influence - a.influence || a.id - b.id)[0];
      createParty(w, n.id, ideo, leader.id);
      const party = partyOf(w, leader)!;
      for (const c of fans) if (c !== leader && isAdult(w, c) && c.traits.ambition + c.ideoStr > 0.6) joinPartyRaw(w, c, party);
    }
    const ps = partiesOf(w, n.id);
    for (const p of ps) { p.support = Math.round((p.members.length / Math.max(1, cits.length)) * 100); sortPartyList(w, p); }
    n.congressSize = congressSize(w, n);
    const votes: Record<Id, number> = {};
    for (const p of ps) votes[p.id] = p.members.length + p.support;
    n.seats = dhondt(votes, n.congressSize);
    fillDeputies(w, n);
    enforceCeilings(w, n);
    const top = ps.slice().sort((a, b) => (n.seats[b.id] ?? 0) - (n.seats[a.id] ?? 0) || a.id - b.id)[0];
    n.president = top ? top.leader : pick(w, cits).id;
    appointCabinetAI(w, n);
  }
  scheduleElections(w);
}

function createParty(w: World, nation: Id, ideo: Party['ideo'], leader: Id, name?: string): Party {
  const used = new Set(partiesOf(w, nation).map((p) => p.name));
  const nm = name || PARTY_NAMES[ideo].find((x) => !used.has(x)) || `${w.nations[nation].adj} ${IDEOLOGIES[ideo].name} Party`;
  const party: Party = { id: nid(w), nation, name: nm, ideo, color: IDEOLOGIES[ideo].color, leader, members: [], list: [], nominee: leader, founded: w.time, support: 5, coalition: null };
  w.parties[party.id] = party;
  joinPartyRaw(w, w.citizens[leader], party);
  return party;
}

export function joinPartyRaw(w: World, c: Citizen, p: Party) {
  if (c.party != null) leavePartyRaw(w, c);
  c.party = p.id;
  if (!p.members.includes(c.id)) p.members.push(c.id);
}

function leavePartyRaw(w: World, c: Citizen) {
  const p = partyOf(w, c);
  c.party = null;
  if (!p) return;
  p.members = p.members.filter((x) => x !== c.id);
  p.list = p.list.filter((x) => x !== c.id);
  if (p.nominee === c.id) p.nominee = null;
  if (p.leader === c.id) {
    const next = p.members.map((id) => w.citizens[id]).sort((a, b) => b.influence - a.influence || a.id - b.id)[0];
    if (next) { p.leader = next.id; p.nominee = next.id; }
    else { delete w.parties[p.id]; for (const n of w.nations) delete n.seats[p.id]; }
  }
}

// ---------- party actions ----------
export function joinPartyCheck(w: World, c: Citizen, pid: Id): string | null {
  const p = w.parties[pid];
  if (!p) return 'Party not found.';
  if (p.nation !== c.nation) return 'You can only join parties of your citizenship nation.';
  if (!isAdult(w, c)) return `You must be ${B.life.adultAge} to join a party.`;
  if (c.party === pid) return 'Already a member.';
  return null;
}
export function joinParty(w: World, c: Citizen, pid: Id): Result {
  const why = joinPartyCheck(w, c, pid);
  if (why) return fail(why);
  joinPartyRaw(w, c, w.parties[pid]);
  if (c.player) record(w, 'party', `${c.name} joined the ${w.parties[pid].name}.`, { cit: c.id, nation: c.nation, player: true });
  return ok(`Welcome to the ${w.parties[pid].name}.`);
}
export function leaveParty(w: World, c: Citizen): Result {
  if (c.party == null) return fail('You are not in a party.');
  const name = partyOf(w, c)?.name;
  leavePartyRaw(w, c);
  const n = w.nations[c.nation];
  if (n.deputies.includes(c.id)) n.deputies = n.deputies.filter((x) => x !== c.id);
  return ok(`You left the ${name}.`);
}
export function foundPartyCheck(w: World, c: Citizen): string | null {
  const tooYoung = lifeGate(w, c, 18, 'Founding a party');
  if (tooYoung) return tooYoung;
  if (standing(c) < B.politics.foundRep) return `Nobody would follow you yet: founding a party needs ${repNeed(B.politics.foundRep)}.`;
  if ((c.wallet[GOLD] ?? 0) < g(B.politics.partyFoundCost)) return `Founding a party costs ${B.politics.partyFoundCost} gold.`;
  if (partiesOf(w, c.nation).length >= 8) return 'This nation already has 8 parties.';
  return null;
}
export function foundParty(w: World, c: Citizen, ideo: Party['ideo'], name: string): Result {
  const why = foundPartyCheck(w, c);
  if (why) return fail(why);
  if (!name.trim()) return fail('Choose a party name.');
  burn(w, cref(c.id), GOLD, g(B.politics.partyFoundCost), 'Party founding');
  const p = createParty(w, c.nation, ideo, c.id, name.trim().slice(0, 40));
  record(w, 'party', `${c.name} founded the ${p.name} (${IDEOLOGIES[ideo].name}).`, { cit: c.id, nation: c.nation, player: c.player, important: true });
  return ok(`Founded the ${p.name}. Recruit members and run candidates!`);
}
/** Party leader tools: reorder list, choose nominee or coalition support. */
export function setPartyList(w: World, c: Citizen, list: Id[]): Result {
  const p = partyOf(w, c);
  if (!p || p.leader !== c.id) return fail('Only the party leader can rank candidates.');
  p.list = list.filter((id) => p.members.includes(id));
  return ok('Candidate list updated.');
}
export function setNominee(w: World, c: Citizen, nominee: Id | null, coalition: Id | null): Result {
  const p = partyOf(w, c);
  if (!p || p.leader !== c.id) return fail('Only the party leader can nominate.');
  if (nominee != null && !p.members.includes(nominee)) return fail('Nominee must be a party member.');
  p.nominee = nominee;
  p.coalition = nominee == null ? coalition : null;
  return ok(nominee != null ? `${w.citizens[nominee].name} is the party’s presidential nominee.` : coalition != null ? `The party backs the ${w.parties[coalition].name} nominee.` : 'No presidential nominee.');
}
/** A member asks the (AI) leader for the presidential nomination. */
export function seekNomination(w: World, c: Citizen): Result {
  const p = partyOf(w, c);
  if (!p) return fail('Join a party first.');
  if (ageOf(w, c) < B.politics.presidentAge) return fail(`Candidates must be at least ${B.politics.presidentAge}.`);
  if (standing(c) < B.politics.presidentRep) return fail(`The party won't nominate an unknown: you need ${repNeed(B.politics.presidentRep)}.`);
  if (p.leader === c.id) { p.nominee = c.id; return ok('As leader you nominate yourself.'); }
  const leader = w.citizens[p.leader];
  const mine = c.influence + (leader.rel[c.id] ?? 0) / 2 + standing(c) / 2;
  const theirs = w.citizens[p.nominee ?? p.leader]?.influence ?? 0;
  if (mine > theirs * 1.1) {
    p.nominee = c.id;
    leader.rel[c.id] = (leader.rel[c.id] ?? 0) + 2;
    return ok(`${leader.name} backs your nomination (your standing ${Math.round(mine)} vs ${Math.round(theirs)}).`);
  }
  return fail(`${leader.name} keeps ${w.citizens[p.nominee ?? p.leader]?.name ?? 'the current nominee'}: your standing ${Math.round(mine)} vs ${Math.round(theirs)}. Build influence (articles, offices, medals) and relationships.`);
}

// ---------- elections ----------
const ELECTION_DOM = () => ({ president: B.politics.days.president, party: B.politics.days.party, congress: B.politics.days.congress });

/** Make sure upcoming elections exist for every nation (called daily). */
export function scheduleElections(w: World) {
  for (const n of w.nations) {
    for (const kind of ['president', 'congress', 'party'] as const) {
      const at = nextDom(w, ELECTION_DOM()[kind], 12);
      if (at - w.time > B.politics.regOpenDays * DAY) continue;
      if (at - B.politics.regCloseHours * HOUR <= w.time) continue; // too late to register: next cycle
      const targets = kind === 'party' ? partiesOf(w, n.id).map((p) => p.id) : [null];
      for (const pid of targets) {
        const exists = Object.values(w.elections).some((e) => !e.done && e.nation === n.id && e.kind === kind && (e.party ?? null) === pid);
        if (exists) continue;
        const e: Election = { id: nid(w), nation: n.id, kind, party: pid ?? undefined, at, regClose: at - B.politics.regCloseHours * HOUR, candidates: [], done: false };
        w.elections[e.id] = e;
        schedule(w, e.regClose, 'electionRegClose', { id: e.id });
        schedule(w, at, 'election', { id: e.id });
        if (n.id === player(w).nation && kind !== 'party') notify(w, 'politics', `🗳️ ${kind === 'president' ? 'Presidential' : 'Congressional'} election in ${n.name} on ${fmtDay(at)} (registration closes 24h before).`, { link: 'politics' });
      }
    }
  }
}

/** Special presidential election (impeachment / new-election law). */
export function callSpecialElection(w: World, n: Nation) {
  for (const e of Object.values(w.elections)) if (!e.done && e.nation === n.id && e.kind === 'president') e.done = true;
  const at = w.time + B.politics.specialElectionDays * DAY;
  const e: Election = { id: nid(w), nation: n.id, kind: 'president', at, regClose: at - B.politics.regCloseHours * HOUR, candidates: [], done: false };
  w.elections[e.id] = e;
  schedule(w, e.regClose, 'electionRegClose', { id: e.id });
  schedule(w, at, 'election', { id: e.id });
}

export function registerCheck(w: World, c: Citizen, e: Election): string | null {
  const tooYoung = lifeGate(w, c, 18, 'Standing for election');
  if (tooYoung) return tooYoung;
  if (e.done) return 'Election already held.';
  if (w.time >= e.regClose) return 'Registration has closed.';
  if (c.nation !== e.nation) return 'Only citizens can run.';
  if (e.kind === 'congress') {
    if (c.party == null) return 'Congress candidates run on a party list — join a party.';
    if (standing(c) < B.politics.congressRep) return `Voters don't know you yet: running for congress needs ${repNeed(B.politics.congressRep)}.`;
  }
  if (e.kind === 'party') {
    if (c.party !== e.party) return 'Only members can run for party leader.';
  }
  if (e.kind === 'president') return 'Presidential candidates are nominated by parties (seek your party’s nomination).';
  if (e.candidates.includes(c.id)) return 'Already registered.';
  return null;
}

export function registerCandidate(w: World, c: Citizen, eid: Id): Result {
  const e = w.elections[eid];
  if (!e) return fail('Election not found.');
  const why = registerCheck(w, c, e);
  if (why) return fail(why);
  e.candidates.push(c.id);
  if (c.player) bump(w, 'candidate');
  return ok(e.kind === 'congress' ? 'Registered on your party’s list. Your leader decides the ranking.' : 'Registered as a party-leader candidate.');
}

export function voteCheck(w: World, c: Citizen, e: Election): string | null {
  if (e.done) return 'Election already held.';
  if (c.nation !== e.nation) return 'Only citizens can vote.';
  if (!isAdult(w, c)) return `You must be ${B.life.adultAge} to vote.`;
  if (e.kind === 'party' && c.party !== e.party) return 'Only party members vote for their leader.';
  if (w.time < e.regClose && e.kind !== 'congress') return 'Voting opens when registration closes.';
  return null;
}

export function castVote(w: World, c: Citizen, eid: Id, choice: Id): Result {
  const e = w.elections[eid];
  if (!e) return fail('Election not found.');
  const why = voteCheck(w, c, e);
  if (why) return fail(why);
  e.playerVote = choice;
  bump(w, 'vote');
  return ok('Your vote is recorded (counted when polls close).');
}

/** Registration close: parties fix nominees and lists; AI candidates register. */
export function onRegClose(w: World, eid: Id) {
  const e = w.elections[eid];
  if (!e || e.done) return;
  const n = w.nations[e.nation];
  if (e.kind === 'congress') {
    for (const c of citizensOf(w, n.id)) {
      if (c.player || c.party == null || standing(c) < B.politics.congressRep) continue;
      if (c.persona === 'politician' || c.traits.ambition > 0.55 || partyOf(w, c)?.leader === c.id) if (!e.candidates.includes(c.id)) e.candidates.push(c.id);
    }
  } else if (e.kind === 'party') {
    const p = w.parties[e.party!];
    if (!p) { e.done = true; return; }
    if (!e.candidates.includes(p.leader)) e.candidates.push(p.leader);
    for (const id of p.members) {
      const c = w.citizens[id];
      if (!c.player && !e.candidates.includes(id) && c.traits.ambition > 0.8 && c.influence > (w.citizens[p.leader]?.influence ?? 0) * 0.8) e.candidates.push(id);
    }
  } else {
    // presidential: party nominees; small AI parties may back a coalition partner instead
    const ps = partiesOf(w, n.id);
    const biggest = ps.slice().sort((a, b) => b.support - a.support || a.id - b.id);
    for (const p of ps) {
      const leader = w.citizens[p.leader];
      if (!leader?.player) {
        const ally = biggest.find((q) => q.id !== p.id && Math.abs(IDEOLOGIES[q.ideo].hawk - IDEOLOGIES[p.ideo].hawk) < 0.3);
        if (p.support < 12 && ally && chance(w, 0.6)) { p.nominee = null; p.coalition = ally.id; }
        else if (p.nominee == null || !p.members.includes(p.nominee)) { p.nominee = p.leader; p.coalition = null; }
      }
      if (p.nominee != null && standing(w.citizens[p.nominee]) >= B.politics.presidentRep && !e.candidates.includes(p.nominee)) e.candidates.push(p.nominee);
    }
    if (!e.candidates.length && n.president != null) e.candidates.push(n.president);
  }
}

interface Utility { total: number; parts: Record<string, number> }

function candidateUtility(w: World, voter: Citizen | null, voterIdeo: Citizen['ideo'], cand: Citizen, n: Nation): Utility {
  const parts: Record<string, number> = {};
  const cp = partyOf(w, cand);
  const ideo = cp?.ideo ?? cand.ideo;
  parts.ideology = ideo === voterIdeo ? 30 : 12 * (1 - Math.abs(IDEOLOGIES[ideo].hawk - IDEOLOGIES[voterIdeo].hawk)) - 4 * Math.abs(IDEOLOGIES[ideo].taxPref - IDEOLOGIES[voterIdeo].taxPref);
  parts.influence = cand.influence / 4;
  parts.party = (cp?.support ?? 0) / 6;
  if (voter) parts.relationship = (voter.rel[cand.id] ?? 0) / 4;
  if (voter && voter.flags.pledge === cand.id && dayOf(w.time) - (voter.flags.pledgeDay ?? -99) <= 30) parts.pledge = 25; // promised in person
  const presParty = n.president != null ? w.citizens[n.president]?.party : null;
  const incumbentSide = cand.id === n.president || (cp != null && cp.id === presParty);
  if (incumbentSide) {
    parts.record = (n.approval - 50) / 3 + n.warScore / 10;
    if (voter) parts.income = voter.mood * 10;
  }
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts };
}

function partyUtility(w: World, voter: Citizen | null, voterIdeo: Citizen['ideo'], p: Party, n: Nation): Utility {
  const parts: Record<string, number> = {};
  parts.ideology = p.ideo === voterIdeo ? 30 : 12 * (1 - Math.abs(IDEOLOGIES[p.ideo].hawk - IDEOLOGIES[voterIdeo].hawk)) - 4 * Math.abs(IDEOLOGIES[p.ideo].taxPref - IDEOLOGIES[voterIdeo].taxPref);
  parts.support = p.support / 5;
  const top = p.list.slice(0, 3).map((id) => w.citizens[id]).filter(Boolean);
  parts.candidates = top.reduce((s, c) => s + c.influence, 0) / 12;
  if (voter) parts.relationship = top.reduce((s, c) => s + (voter.rel[c.id] ?? 0), 0) / 8;
  const presParty = n.president != null ? w.citizens[n.president]?.party : null;
  if (p.id === presParty) {
    parts.record = (n.approval - 50) / 3 + n.warScore / 10;
    if (voter) parts.income = voter.mood * 10;
  }
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

export function runElection(w: World, eid: Id) {
  const e = w.elections[eid];
  if (!e || e.done) return;
  const n = w.nations[e.nation];
  e.done = true;
  const pl = player(w);
  if (e.kind === 'congress') return runCongressElection(w, e, n);
  const cands = e.candidates.filter((id) => w.citizens[id] && w.citizens[id].nation === n.id);
  if (!cands.length) { e.result = { turnout: 0, electorate: 0, tallies: [], winners: [], explain: ['No candidates registered.'] }; return; }
  const tallies: Record<Id, number> = {};
  for (const id of cands) tallies[id] = 0;
  const voters = e.kind === 'party' ? (w.parties[e.party!]?.members ?? []).map((id) => w.citizens[id]).filter(Boolean) : citizensOf(w, n.id).filter((c) => isAdult(w, c));
  let turnout = 0;
  const sums: Record<Id, Record<string, number>> = {};
  for (const id of cands) sums[id] = {};
  for (const v of voters) {
    if (v.player) {
      if (e.playerVote != null && tallies[e.playerVote] !== undefined) { tallies[e.playerVote]++; turnout++; }
      continue;
    }
    if (!chance(w, 0.55 + 0.35 * v.ideoStr)) continue;
    let best = cands[0], bestU = -Infinity;
    for (const id of cands) {
      const u = candidateUtility(w, v, v.ideo, w.citizens[id], n);
      for (const [k, x] of Object.entries(u.parts)) sums[id][k] = (sums[id][k] ?? 0) + x;
      const val = u.total + (id === v.id ? 50 : 0) + rand(w, -8, 8);
      if (val > bestU) { bestU = val; best = id; }
    }
    tallies[best]++;
    turnout++;
    if (e.kind !== 'party') v.flags.voteDay = dayOf(w.time);
  }
  // Background blocs (presidential only): residents grouped by the nation's ideology mix.
  let bgTotal = 0;
  if (e.kind === 'president') {
    const bgVotes = Math.round(voters.length * B.politics.bgVoterRatio);
    const mix = partiesOf(w, n.id);
    const supportSum = mix.reduce((s, p) => s + Math.max(1, p.support), 0);
    for (const p of mix) {
      const bloc = Math.round((bgVotes * Math.max(1, p.support)) / supportSum * (0.5 + 0.2 * (n.approval / 100)));
      let best = cands[0], bestU = -Infinity;
      for (const id of cands) {
        const u = candidateUtility(w, null, p.ideo, w.citizens[id], n).total;
        if (u > bestU) { bestU = u; best = id; }
      }
      tallies[best] += bloc;
      bgTotal += bloc;
    }
  }
  const sorted = cands.slice().sort((a, b) => tallies[b] - tallies[a] || w.citizens[b].influence - w.citizens[a].influence || a - b);
  const winner = sorted[0];
  const explain: string[] = [];
  explain.push(`${voters.length} eligible citizens, ${turnout} voted${bgTotal ? `; ${bgTotal.toLocaleString()} background-bloc votes (weighted by party support)` : ''}.`);
  const involvesPlayer = cands.includes(pl.id);
  if (involvesPlayer) {
    const rival = winner === pl.id ? sorted[1] : winner;
    if (rival != null) {
      const diffs = Object.keys({ ...sums[pl.id], ...sums[rival] }).map((k) => [k, ((sums[pl.id][k] ?? 0) - (sums[rival][k] ?? 0)) / Math.max(1, turnout)] as [string, number]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      explain.push(winner === pl.id ? 'Why you won:' : `Why ${w.citizens[rival].name} beat you:`);
      for (const [k, d] of diffs.slice(0, 4)) explain.push(`• ${k}: ${d >= 0 ? 'you +' : 'them +'}${Math.abs(d).toFixed(1)} per voter`);
    }
  }
  e.result = { turnout, electorate: voters.length + bgTotal, tallies: sorted.map((id) => ({ cand: id, votes: tallies[id], party: w.citizens[id].party ?? undefined })), winners: [winner], explain };
  if (e.kind === 'party') {
    const p = w.parties[e.party!];
    if (p && p.leader !== winner) {
      p.leader = winner;
      p.nominee = winner;
      record(w, 'party', `${w.citizens[winner].name} became leader of the ${p.name}.`, { cit: winner, nation: n.id, player: winner === pl.id });
    }
    if (winner === pl.id) notify(w, 'office', `🎖️ You were elected leader of the ${p?.name}!`, { link: 'politics', critical: true });
    return;
  }
  const prev = n.president;
  n.president = winner;
  n.termStart = w.time;
  if (winner === pl.id && cands.length > 1) { bump(w, 'wonPresidency'); w.player.counters.regionsAtOffice = w.regions.filter((r) => r.owner === n.id).length; }
  if (prev !== winner) {
    n.cabinet = {};
    appointCabinetAI(w, n);
  }
  const pct = Math.round((tallies[winner] / Math.max(1, turnout + bgTotal)) * 100);
  record(w, 'election', `🗳️ ${w.citizens[winner].name} elected President of ${n.name} with ${pct}% (${turnout} citizen votes).`, { nation: n.id, cit: winner, important: true, player: involvesPlayer });
  if (n.id === pl.nation) notify(w, winner === pl.id ? 'office' : 'politics', winner === pl.id ? `👑 You are now President of ${n.name}! Appoint your cabinet.` : `🗳️ ${w.citizens[winner].name} won the presidency of ${n.name} (${pct}%).`, { link: 'politics', critical: winner === pl.id || (involvesPlayer && winner !== pl.id) });
}

function runCongressElection(w: World, e: Election, n: Nation) {
  const pl = player(w);
  const ps = partiesOf(w, n.id);
  if (!ps.length) { e.result = { turnout: 0, electorate: 0, tallies: [], winners: [], explain: ['No parties.'] }; return; }
  for (const p of ps) sortPartyList(w, p, e.candidates.filter((id) => w.citizens[id]?.party === p.id));
  const votes: Record<Id, number> = {};
  for (const p of ps) votes[p.id] = 0;
  const voters = citizensOf(w, n.id).filter((c) => isAdult(w, c));
  let turnout = 0;
  for (const v of voters) {
    if (v.player) {
      if (e.playerVote != null && votes[e.playerVote] !== undefined) { votes[e.playerVote]++; turnout++; }
      continue;
    }
    if (!chance(w, 0.55 + 0.35 * v.ideoStr)) continue;
    let best = ps[0].id, bestU = -Infinity;
    for (const p of ps) {
      const u = partyUtility(w, v, v.ideo, p, n).total + (v.party === p.id ? 25 : 0) + rand(w, -8, 8);
      if (u > bestU) { bestU = u; best = p.id; }
    }
    votes[best]++;
    turnout++;
    v.flags.voteDay = dayOf(w.time);
  }
  const bg = Math.round(voters.length * B.politics.bgVoterRatio);
  const sup = ps.reduce((s, p) => s + Math.max(1, p.support), 0);
  let bgTotal = 0;
  for (const p of ps) {
    const bloc = Math.round((bg * Math.max(1, p.support)) / sup);
    votes[p.id] += bloc;
    bgTotal += bloc;
  }
  n.congressSize = congressSize(w, n);
  n.seats = dhondt(votes, n.congressSize);
  fillDeputies(w, n);
  enforceCeilings(w, n);
  n.propCount = {};
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  for (const p of ps) p.support = Math.round(p.support * 0.5 + ((votes[p.id] / Math.max(1, total)) * 100) * 0.5);
  const explain = [`${voters.length} eligible citizens, ${turnout} voted; ${bgTotal} background-bloc votes. Seats by D'Hondt; deputies taken from each party's priority list.`];
  if (e.candidates.includes(pl.id)) {
    const p = partyOf(w, pl);
    const pos = p ? p.list.indexOf(pl.id) + 1 : 0;
    const seats = p ? n.seats[p.id] ?? 0 : 0;
    explain.push(n.deputies.includes(pl.id) ? `You won a seat: list position ${pos}, your party won ${seats} seats.` : `You were #${pos} on your party's list but it won only ${seats} seat(s). Raise your influence or your leader's opinion of you to rank higher.`);
    notify(w, 'office', n.deputies.includes(pl.id) ? `🏛️ You were elected to the ${n.name} congress!` : `🏛️ You missed out on a congress seat (#${pos} on the list, ${seats} seats won).`, { link: 'politics', critical: true });
  }
  e.result = { turnout, electorate: voters.length + bgTotal, tallies: ps.map((p) => ({ cand: p.id, votes: votes[p.id], party: p.id })).sort((a, b) => b.votes - a.votes), seats: { ...n.seats }, winners: [...n.deputies], explain };
  record(w, 'election', `🏛️ ${n.name} congress elected: ${ps.filter((p) => n.seats[p.id]).map((p) => `${p.name} ${n.seats[p.id]}`).join(', ')}.`, { nation: n.id, important: true });
}

// ---------- cabinet ----------
export function appointCabinetAI(w: World, n: Nation) {
  if (n.president == null || !w.citizens[n.president]) return;
  const pres = w.citizens[n.president];
  if (pres.player) return; // a player president appoints manually
  const pool = citizensOf(w, n.id).filter((c) => c.id !== n.president && isAdult(w, c));
  const fit: Record<Ministry, (c: Citizen) => number> = {
    vp: (c) => c.influence + (c.persona === 'politician' ? 20 : 0),
    development: (c) => c.buildTotal / 1000 + (c.persona === 'builder' ? 30 : 0) + c.attrs.cons,
    defense: (c) => c.dmgTotal / 1e5 + (c.persona === 'soldier' ? 30 : 0),
    economy: (c) => c.eco * 3 + (c.persona === 'investor' || c.persona === 'merchant' ? 25 : 0),
    labor: (c) => c.eco * 2 + (c.persona === 'industrialist' ? 20 : 0),
    pr: (c) => c.influence + (c.persona === 'journalist' ? 30 : 0),
    recruitment: (c) => c.influence / 2 + c.traits.loyalty * 10,
    interior: (c) => c.sec.collars * 3 + c.sec.prank * 10 + (c.persona === 'soldier' ? 15 : 0) + c.traits.loyalty * 10 - c.sec.notoriety,
    intelligence: (c) => c.sec.tradecraft * 2 + c.sec.arank * 10 + c.traits.loyalty * 15 - c.sec.notoriety,
  };
  const taken = new Set<Id>(Object.values(n.cabinet).filter((x): x is number => x != null));
  for (const m of Object.keys(fit) as Ministry[]) {
    if (n.cabinet[m] != null) continue;
    const ranked = pool.filter((c) => !taken.has(c.id)).map((c) => {
      const loyalty = (c.party === pres.party ? 15 : 0) + (pres.rel[c.id] ?? 0) / 4;
      return { c, s: fit[m](c) + loyalty };
    }).sort((a, b) => b.s - a.s || a.c.id - b.c.id);
    const top = ranked[0];
    if (!top) continue;
    if (top.c.player) {
      // Offer the post to the player rather than assigning it.
      const already = w.inbox.some((x) => x.payload?.handler === 'ministerOffer' && !x.resolved && x.payload.ministry === m);
      if (!already) sendMsg(w, { from: pres.id, subject: `${pres.name} offers you the post of ${MINISTRY_INFO[m].name}`, body: `President ${pres.name} would like you to serve as ${MINISTRY_INFO[m].name} of ${n.name}: ${MINISTRY_INFO[m].desc}. Ministers act with national authority but keep personal and state finances separate.`, kind: 'gov', options: [{ id: 'accept', label: 'Accept' }, { id: 'decline', label: 'Decline' }], payload: { handler: 'ministerOffer', nation: n.id, ministry: m } });
      const next = ranked[1];
      if (next) { n.cabinet[m] = next.c.id; taken.add(next.c.id); }
      continue;
    }
    n.cabinet[m] = top.c.id;
    taken.add(top.c.id);
  }
}

export function appoint(w: World, actor: Citizen, m: Ministry, who: Id | null): Result {
  const n = w.nations[actor.nation];
  if (n.president !== actor.id) return fail('Only the president appoints the cabinet.');
  if (who != null) {
    const c = w.citizens[who];
    if (!c || c.nation !== n.id) return fail('Ministers must be citizens.');
    if (c.id === actor.id) return fail('The president cannot hold a ministry.');
    for (const [k, v] of Object.entries(n.cabinet)) if (v === who) delete n.cabinet[k as Ministry];
    if (!c.player) c.rel[actor.id] = (c.rel[actor.id] ?? 0) + 5;
  }
  if (who == null) delete n.cabinet[m];
  else n.cabinet[m] = who;
  record(w, 'cabinet', who != null ? `${w.citizens[who].name} appointed ${MINISTRY_INFO[m].name} of ${n.name}.` : `${MINISTRY_INFO[m].name} of ${n.name} dismissed.`, { nation: n.id, player: actor.player });
  return ok(who != null ? `${w.citizens[who].name} is now ${MINISTRY_INFO[m].name}.` : 'Post vacated.');
}

export function resignOffice(w: World, c: Citizen): Result {
  const n = w.nations[c.nation];
  let did = false;
  for (const [k, v] of Object.entries(n.cabinet)) if (v === c.id) { delete n.cabinet[k as Ministry]; did = true; }
  if (!did) return fail('You hold no ministry.');
  appointCabinetAI(w, n);
  return ok('You resigned your ministry.');
}

// ---------- public opinion ----------
/** Daily: citizen mood → government approval; influence decay/growth; unemployment. */
export function dailyOpinion(w: World) {
  for (const n of w.nations) {
    const cits = citizensOf(w, n.id);
    let moodSum = 0, jobless = 0;
    for (const c of cits) {
      const income = c.lastIncome;
      const expected = n.minWage * 1.3;
      const incSig = Math.max(-1, Math.min(1, (income - expected) / Math.max(1, expected)));
      const taxSig = -(n.taxes.work + n.taxes.vat - 15) / 30;
      const jobSig = c.job == null && !c.player ? -0.3 : 0.1;
      c.mood = Math.max(-1, Math.min(1, c.mood * 0.85 + 0.15 * (incSig * 0.5 + taxSig + jobSig + n.warScore / 200)));
      moodSum += c.mood;
      if (c.job == null && !['industrialist', 'investor'].includes(c.persona)) jobless++;
      // influence: slow decay, persona-driven drift, office bonus
      const office = n.president === c.id ? 1 : Object.values(n.cabinet).includes(c.id) ? 0.5 : n.deputies.includes(c.id) ? 0.3 : 0;
      c.influence = Math.max(0, c.influence * 0.99 + office + (c.player ? 0 : (c.persona === 'politician' || c.persona === 'journalist' ? 0.25 : 0.05) * c.traits.ambition));
    }
    n.unemployment = cits.length ? jobless / cits.length : 0;
    const hh = w.households[n.id];
    const bgMood = hh && hh.unmet > 0 ? -0.2 : 0.1;
    const target = 50 + 40 * (moodSum / Math.max(1, cits.length)) + 10 * bgMood;
    n.approval = Math.max(0, Math.min(100, n.approval * 0.9 + target * 0.1));
    n.warScore *= 0.97;
  }
  // Party support drifts toward membership share and government performance.
  for (const n of w.nations) {
    const ps = partiesOf(w, n.id);
    const cits = citizensOf(w, n.id).length || 1;
    const presParty = n.president != null ? w.citizens[n.president]?.party : null;
    for (const p of ps) {
      const members = (p.members.length / cits) * 100;
      const perf = p.id === presParty ? (n.approval - 50) / 10 : 0;
      p.support = Math.max(1, Math.min(90, p.support * 0.95 + (members * 0.8 + 5 + perf) * 0.05));
    }
  }
}

/** AI citizens join parties that match their views; leaderless parties get new leaders. */
export function partyRecruitment(w: World) {
  for (const c of census(w).all) {
    if (c.player || c.party != null || !isAdult(w, c)) continue;
    if (!chance(w, 0.03 * (c.ideoStr + c.traits.ambition))) continue;
    const opts = partiesOf(w, c.nation).filter((p) => p.ideo === c.ideo);
    const p = opts.sort((a, b) => b.support - a.support || a.id - b.id)[0];
    if (p) joinPartyRaw(w, c, p);
    else if (c.persona === 'politician' && c.traits.ambition > 0.85 && (c.wallet[GOLD] ?? 0) > g(B.politics.partyFoundCost * 2) && partiesOf(w, c.nation).length < 6) {
      burn(w, cref(c.id), GOLD, g(B.politics.partyFoundCost), 'Party founding');
      const np = createParty(w, c.nation, c.ideo, c.id);
      record(w, 'party', `${c.name} founded the ${np.name} in ${w.nations[c.nation].name}.`, { cit: c.id, nation: c.nation });
    }
  }
}

/** Reply handler: accepting a ministerial post offered by an AI president. */
export function ministerOfferReply(w: World, payload: Record<string, any>, option: string): Result {
  const n = w.nations[payload.nation];
  const p = player(w);
  if (option !== 'accept') {
    const pres = n.president != null ? w.citizens[n.president] : null;
    if (pres) pres.rel[p.id] = (pres.rel[p.id] ?? 0) - 2;
    return ok('You declined.');
  }
  if (p.nation !== n.id) return fail('You are no longer a citizen there.');
  const m = payload.ministry as Ministry;
  for (const [k, v] of Object.entries(n.cabinet)) if (v === p.id) delete n.cabinet[k as Ministry];
  n.cabinet[m] = p.id;
  record(w, 'cabinet', `${p.name} became ${MINISTRY_INFO[m].name} of ${n.name}.`, { nation: n.id, cit: p.id, player: true, important: true });
  return ok(`You are now ${MINISTRY_INFO[m].name}. New actions are available on the Country screen.`);
}

/** Salary for officials, paid from the treasury (SOLO). */
export function payOfficials(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const salary = n.minWage * 2;
    const officials = [n.president, ...Object.values(n.cabinet)].filter((x): x is number => x != null);
    for (const id of officials) if (w.citizens[id] && pay(w, natref(n.id), cref(id), n.cur, salary, 'Official salary')) n.stats.spendToday += salary;
  }
}
