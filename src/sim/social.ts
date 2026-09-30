// Relationships and NPC correspondence. Messages reflect real simulation state;
// replies (agree, decline, negotiate, endorse, request help, assign order)
// change relationships and trigger real actions.
import type { Citizen, Id, Msg, World } from './types';
import { census, invalidateCensus } from './census';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { moveItems } from '../engine/ledger';
import { DAY } from '../engine/clock';
import { notify, record, sendMsg } from '../engine/events';
import { chance, pick } from '../engine/rng';
import { citizensOf, cref, player } from './query';
import { partyOf } from './politics';
import { eligibleVoters, PROPOSAL_INFO } from './congress';
import { EXTRA_PROPOSALS } from './congressExtra';
import { applyCitizenship } from './travel';
import { bump } from './progress';

export const relTo = (w: World, npc: Citizen, pid: Id) => npc.rel[pid] ?? 0;
export function adjustRel(npc: Citizen, pid: Id, d: number) {
  npc.rel[pid] = Math.max(-100, Math.min(100, (npc.rel[pid] ?? 0) + d));
}

/** Public endorsement of another citizen (costs energy; builds both reputations). */
export function endorse(w: World, c: Citizen, target: Id): Result {
  const t = w.citizens[target];
  if (!t || t.id === c.id) return fail('Pick someone else.');
  if (c.energy < 5) return fail('Needs 5 energy.');
  if ((t.flags.endorsedBy ?? -1) === c.id && (t.flags.endorsedDay ?? -1) === Math.floor(w.time / DAY)) return fail('Already endorsed today.');
  c.energy -= 5;
  t.flags.endorsedBy = c.id; t.flags.endorsedDay = Math.floor(w.time / DAY);
  t.influence += 0.5 + c.influence / 100;
  adjustRel(t, c.id, 6);
  return ok(`You publicly endorsed ${t.name} (+${(0.5 + c.influence / 100).toFixed(1)} influence for them; they appreciate it).`);
}

/** Ask an NPC for help: a small supply donation, an endorsement, or a job. Decided by the relationship. */
export function requestHelp(w: World, c: Citizen, target: Id, kind: 'supplies' | 'endorse' | 'job'): Result {
  const t = w.citizens[target];
  if (!t || t.player) return fail('Pick an NPC.');
  if ((t.flags.helpDay ?? -1) === Math.floor(w.time / DAY)) return fail(`${t.name} already helped someone today.`);
  const rel = relTo(w, t, c.id);
  if (rel < 15) { adjustRel(t, c.id, -1); return fail(`${t.name} politely declines (relationship ${Math.round(rel)}; they help friends at 15+).`); }
  t.flags.helpDay = Math.floor(w.time / DAY);
  if (kind === 'supplies') {
    const key = ['food:2', 'food:1', 'wg:1'].find((k) => (t.inv[k] ?? 0) >= 5);
    if (!key || !moveItems(w, cref(t.id), cref(c.id), key, 5)) return fail(`${t.name} has nothing to spare.`);
    adjustRel(t, c.id, -3);
    return ok(`${t.name} gave you 5 ${key}.`);
  }
  if (kind === 'endorse') {
    c.influence += 1 + t.influence / 50;
    adjustRel(t, c.id, -2);
    return ok(`${t.name} vouches for you publicly (+${(1 + t.influence / 50).toFixed(1)} influence).`);
  }
  const co = Object.values(w.companies).find((x) => x.owner.k === 'cit' && x.owner.id === t.id && x.offer);
  if (!co) return fail(`${t.name} has no company to hire you.`);
  co.offer!.slots = Math.min(B.company.maxWorkers[co.q - 1], co.offer!.slots + 1);
  co.offer!.minEco = 0;
  return ok(`${t.name} opened a position for you at ${co.name}. Apply on the Employment screen.`);
}

/** Invite a foreign citizen to immigrate (recruitment). Rewards come only if they stay and work. */
export function inviteImmigrant(w: World, c: Citizen, target: Id): Result {
  const t = w.citizens[target];
  if (!t || t.player || t.nation === c.nation) return fail('Invite a citizen of another nation.');
  const home = w.nations[t.nation];
  const appeal = relTo(w, t, c.id) + (t.mood < 0 ? 20 : 0) + (w.nations[c.nation].approval - home.approval) / 2 + (home.exile ? 25 : 0);
  if (appeal < 20) { adjustRel(t, c.id, 1); return fail(`${t.name} isn't persuaded (appeal ${Math.round(appeal)}/20). Unhappy citizens and friends are easier to recruit.`); }
  const dest = w.regions.find((r) => r.owner === c.nation && r.id === w.nations[c.nation].capital) ?? w.regions.find((r) => r.owner === c.nation);
  if (!dest) return fail('Your nation has no territory to host immigrants.');
  t.loc = dest.id;
  invalidateCensus(w);
  const r = applyCitizenship(w, t, c.nation);
  if (!r.ok) return fail(`${t.name} tried to apply but: ${r.msg}`);
  t.flags.recruitedBy = c.id;
  t.flags.recruitedAt = w.time;
  return ok(`${t.name} moved to ${dest.name} and applied for citizenship. You'll be rewarded if they settle in and work for a week.`);
}

/** Daily: recruits who stayed and worked a week reward their recruiter (retained contributors only). */
export function recruitmentDaily(w: World) {
  const p = player(w);
  for (const c of census(w).all) {
    if (c.flags.recruitedBy !== p.id || c.flags.recruitRewarded) continue;
    if (w.time - (c.flags.recruitedAt ?? w.time) < 7 * DAY) continue;
    const settled = c.nation === p.nation && c.lastWorkDay >= Math.floor(w.time / DAY) - 2;
    c.flags.recruitRewarded = 1;
    if (settled) {
      p.influence += 3;
      bump(w, 'recruits');
      notify(w, 'progress', `🧳 Your recruit ${c.name} settled in and works in ${w.nations[p.nation].name}: +3 influence.`);
      record(w, 'recruitment', `${c.name} settled in ${w.nations[p.nation].name}, recruited by ${p.name}.`, { cit: c.id, player: true });
    }
  }
}

// ---------- NPC correspondence ----------
/** Daily: NPCs write to the player about real situations. */
export function npcCorrespondence(w: World) {
  const p = player(w);
  const n = w.nations[p.nation];
  const day = Math.floor(w.time / DAY);
  // Party whip before votes.
  if (eligibleVoters(n).includes(p.id)) {
    const party = partyOf(w, p);
    const open = Object.values(w.proposals).filter((x) => x.status === 'open' && x.nation === n.id && !x.votes[p.id]);
    const pr = open[0];
    if (party && pr && party.leader !== p.id && !w.inbox.some((m) => m.payload?.proposal === pr.id)) {
      const leaderVote = pr.votes[party.leader];
      const want = leaderVote ?? (chance(w, 0.5) ? 'y' : 'n');
      sendMsg(w, { from: party.leader, subject: `${w.citizens[party.leader].name}: vote ${want === 'y' ? 'YES' : 'NO'} on “${PROPOSAL_INFO[pr.type]?.name ?? EXTRA_PROPOSALS[pr.type]?.info.name ?? pr.type}”`, kind: 'party', body: `The ${party.name} is voting ${want === 'y' ? 'in favour' : 'against'}. ${pr.effect} Can we count on you?`, options: [{ id: 'agree', label: 'Agree (I’ll vote with the party)' }, { id: 'decline', label: 'Decline' }, { id: 'negotiate', label: 'Negotiate (ask for list priority)' }], payload: { handler: 'whip', proposal: pr.id, want, leader: party.leader } });
    }
  }
  // Candidate seeks endorsement before an election.
  const e = Object.values(w.elections).find((x) => !x.done && x.nation === n.id && x.kind === 'president' && x.at - w.time < 2 * DAY && x.candidates.length);
  if (e && day % 2 === 0) {
    const cand = e.candidates.find((id) => id !== p.id && !w.inbox.some((m) => m.payload?.handler === 'endorseReq' && m.payload.election === e.id && m.from === id));
    if (cand != null && p.influence > 5) sendMsg(w, { from: cand, subject: `${w.citizens[cand].name} asks for your endorsement`, kind: 'npc', body: `With the presidential election close, your public support would matter (your influence: ${Math.round(p.influence)}).`, options: [{ id: 'endorse', label: 'Endorse' }, { id: 'decline', label: 'Decline' }], payload: { handler: 'endorseReq', election: e.id, cand } });
  }
  // A struggling neighbour asks for help.
  if (day % 3 === 1) {
    const needy = citizensOf(w, n.id).filter((c) => !c.player && c.job == null && (c.wallet[n.cur] ?? 0) < 1000 && relTo(w, c, p.id) >= 0);
    const c = needy.length ? pick(w, needy) : null;
    const food = ['food:1', 'food:2', 'food:3'].find((k) => (p.inv[k] ?? 0) >= 3);
    if (c && food && !w.inbox.some((m) => m.payload?.handler === 'helpReq' && !m.resolved)) sendMsg(w, { from: c.id, subject: `${c.name} asks for help`, kind: 'npc', body: `I've been out of work and I'm running low. Could you spare 3 ${food.replace(':', ' Q')}? I won't forget it.`, options: [{ id: 'agree', label: 'Give 3 food' }, { id: 'decline', label: 'Decline' }], payload: { handler: 'helpReq', cit: c.id, food } });
  }
  // Unit commander orders.
  const u = p.unit != null ? w.units[p.unit] : null;
  if (u && u.order && u.commander !== p.id && !w.inbox.some((m) => m.payload?.handler === 'order' && m.payload.battle === u.order!.battle)) {
    const b = w.battles[u.order.battle];
    if (b && !b.done) sendMsg(w, { from: u.commander, subject: `${u.name}: orders for ${w.regions[b.region]?.name ?? 'the front'}`, kind: 'unit', body: `All members fight for the ${u.order.side === 'a' ? 'attackers' : 'defenders'} in ${w.regions[b.region]?.name}. Doctrine: ${u.doctrine}. Fighting there on that side earns the unit bonus.`, options: [{ id: 'agree', label: 'Acknowledge' }, { id: 'decline', label: 'Request reassignment' }], payload: { handler: 'order', battle: b.id, unit: u.id } });
  }
  // Foreign leaders write to a player president.
  if (n.president === p.id && day % 4 === 2) {
    const friend = w.nations.filter((x) => x.id !== n.id && !x.exile && (n.relations[x.id]?.score ?? 0) > 30 && !n.alliances.includes(x.id))[0];
    if (friend && friend.president != null && !w.inbox.some((m) => m.payload?.handler === 'diplo' && m.payload.nation === friend.id && !m.resolved)) {
      sendMsg(w, { from: friend.president, subject: `${friend.name} proposes an alliance`, kind: 'diplomacy', body: `Relations between ${friend.name} and ${n.name} stand at ${Math.round(n.relations[friend.id].score)}. We propose a formal alliance: our citizens could fight for each other without the foreign-flag penalty.`, options: [{ id: 'agree', label: 'Agree — put it to congress' }, { id: 'decline', label: 'Decline' }], payload: { handler: 'diplo', nation: friend.id } });
    }
  }
}

export function replyWhip(w: World, m: Msg, o: string): Result {
  const leader = w.citizens[m.payload!.leader];
  const p = player(w);
  if (!leader) return ok('Noted.');
  if (o === 'agree') { adjustRel(leader, p.id, 3); p.flags[`promise_${m.payload!.proposal}`] = m.payload!.want === 'y' ? 1 : 0; return ok(`You promised to vote ${m.payload!.want === 'y' ? 'YES' : 'NO'}. Keep your word.`); }
  if (o === 'negotiate') {
    const party = partyOf(w, p);
    if (party && relTo(w, leader, p.id) > 10) { party.list = [p.id, ...party.list.filter((x) => x !== p.id)]; adjustRel(leader, p.id, -2); return ok(`${leader.name} moves you up the congress list in exchange for your vote.`); }
    adjustRel(leader, p.id, -3);
    return ok(`${leader.name} refuses to bargain.`);
  }
  adjustRel(leader, p.id, -4);
  return ok('You kept your options open. The leader is displeased.');
}

/** After votes close: kept or broken promises move relationships. */
export function checkPromises(w: World) {
  const p = player(w);
  for (const [k, v] of Object.entries(p.flags)) {
    if (!k.startsWith('promise_')) continue;
    const pr = w.proposals[Number(k.slice(8))];
    if (!pr || pr.status === 'open') continue;
    const party = partyOf(w, p);
    const leader = party ? w.citizens[party.leader] : null;
    const kept = pr.votes[p.id] === (v ? 'y' : 'n');
    if (leader) adjustRel(leader, p.id, kept ? 4 : -10);
    if (!kept) notify(w, 'politics', `You broke your promise to ${leader?.name ?? 'your party'} on “${pr.type}”. Trust suffers.`);
    delete p.flags[k];
  }
}

export function replyEndorse(w: World, m: Msg, o: string): Result {
  const cand = w.citizens[m.payload!.cand];
  if (!cand) return ok('Noted.');
  if (o === 'endorse') return endorse(w, player(w), cand.id);
  adjustRel(cand, player(w).id, -3);
  return ok('You declined.');
}

export function replyHelp(w: World, m: Msg, o: string): Result {
  const c = w.citizens[m.payload!.cit];
  const p = player(w);
  if (o !== 'agree') { adjustRel(c, p.id, -2); return ok('You declined.'); }
  if (!moveItems(w, cref(p.id), cref(c.id), m.payload!.food, 3)) return fail('You no longer have the food.');
  adjustRel(c, p.id, 12);
  p.influence += 0.5;
  return ok(`${c.name} thanks you warmly.`);
}

export function replyOrder(w: World, m: Msg, o: string): Result {
  const u = w.units[m.payload!.unit];
  const p = player(w);
  if (!u) return ok('Noted.');
  const cmd = w.citizens[u.commander];
  if (o === 'agree') { p.player && (w.player.watch = m.payload!.battle); adjustRel(cmd, p.id, 1); return ok('Orders acknowledged — the battle is now on your watch list.'); }
  adjustRel(cmd, p.id, -2);
  return ok('You asked for reassignment.');
}

export function replyDiplo(w: World, m: Msg, o: string, propose: (type: string, params: Record<string, any>) => Result): Result {
  const nation = m.payload!.nation as Id;
  const p = player(w);
  const n = w.nations[p.nation];
  if (o === 'agree') return propose('alliance', { target: nation });
  for (const [x, y] of [[n.id, nation], [nation, n.id]]) { const r = w.nations[x].relations[y]; if (r) { r.score -= 5; r.hist.unshift({ t: w.time, delta: -5, why: 'alliance proposal declined' }); } }
  return ok('You declined the alliance.');
}
