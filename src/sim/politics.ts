// Parties, elections, congress and government. (Stage 2 fills in the full
// electoral and legislative cycle; this file seeds the starting governments.)
import type { Citizen, Id, Nation, Party, World } from './types';
import { B } from '../data/balance';
import { PARTY_NAMES } from '../data/names';
import { IDEOLOGIES } from '../data/ideologies';
import { nid } from '../engine/events';
import { pick } from '../engine/rng';
import { citizensOf } from './query';
import { enforceCeilings } from './taxes';

export function congressSize(w: World, n: Nation) {
  const pop = citizensOf(w, n.id).length;
  return Math.max(B.politics.congressMin, Math.min(B.politics.congressMax, Math.round(pop / B.politics.citizensPerSeat)));
}

/** D'Hondt seat allocation. */
export function dhondt(votes: Record<Id, number>, seats: number): Record<Id, number> {
  const out: Record<Id, number> = {};
  const ids = Object.keys(votes).map(Number).filter((k) => votes[k] > 0);
  for (const id of ids) out[id] = 0;
  for (let s = 0; s < seats; s++) {
    let best = -1, bestQ = -1;
    for (const id of ids) {
      const q = votes[id] / (out[id] + 1);
      if (q > bestQ || (q === bestQ && id < best)) { bestQ = q; best = id; }
    }
    if (best < 0) break;
    out[best]++;
  }
  return out;
}

export function partyOf(w: World, c: Citizen): Party | null {
  return c.party != null ? w.parties[c.party] ?? null : null;
}

export const partiesOf = (w: World, nid_: Id) => Object.values(w.parties).filter((p) => p.nation === nid_);

/** Fill seats from party priority lists. */
export function fillDeputies(w: World, n: Nation) {
  n.deputies = [];
  for (const [pid, seats] of Object.entries(n.seats)) {
    const p = w.parties[Number(pid)];
    if (!p) continue;
    const list = p.list.filter((id) => w.citizens[id]?.party === p.id && w.citizens[id]?.nation === n.id);
    n.deputies.push(...list.slice(0, seats));
  }
}

export function sortPartyList(w: World, p: Party) {
  p.list = p.members.filter((id) => w.citizens[id]).sort((a, b) => {
    const ca = w.citizens[a], cb = w.citizens[b];
    const sa = ca.influence + (ca.persona === 'politician' ? 20 : 0) + ca.traits.ambition * 10 + (a === p.leader ? 100 : 0);
    const sb = cb.influence + (cb.persona === 'politician' ? 20 : 0) + cb.traits.ambition * 10 + (b === p.leader ? 100 : 0);
    return sb - sa || a - b;
  }).filter((id) => !w.citizens[id].player || w.player.counters.candidateCongress);
}

export function seedPolitics(w: World) {
  for (const n of w.nations) {
    const cits = citizensOf(w, n.id).filter((c) => !c.player);
    const ideos = [...new Set(cits.map((c) => c.ideo))].sort((a, b) => cits.filter((c) => c.ideo === b).length - cits.filter((c) => c.ideo === a).length).slice(0, 4);
    for (const ideo of ideos) {
      const fans = cits.filter((c) => c.ideo === ideo);
      const leader = fans.slice().sort((a, b) => (b.persona === 'politician' ? 1 : 0) - (a.persona === 'politician' ? 1 : 0) || b.influence - a.influence)[0];
      const used = new Set(Object.values(w.parties).filter((p) => p.nation === n.id).map((p) => p.name));
      const name = PARTY_NAMES[ideo].find((x) => !used.has(x)) ?? `${n.adj} ${IDEOLOGIES[ideo].name} Party`;
      const party: Party = {
        id: nid(w), nation: n.id, name, ideo, color: IDEOLOGIES[ideo].color, leader: leader.id, members: [], list: [],
        nominee: leader.id, founded: w.time, support: 0, coalition: null,
      };
      w.parties[party.id] = party;
      for (const c of fans) if (c.level >= B.politics.partyLevel && (c === leader || c.traits.ambition + c.ideoStr > 0.6)) { c.party = party.id; party.members.push(c.id); }
    }
    const ps = partiesOf(w, n.id);
    for (const p of ps) p.support = Math.round((p.members.length / Math.max(1, cits.length)) * 100);
    for (const p of ps) sortPartyList(w, p);
    n.congressSize = congressSize(w, n);
    const votes: Record<Id, number> = {};
    for (const p of ps) votes[p.id] = p.members.length + p.support;
    n.seats = dhondt(votes, n.congressSize);
    fillDeputies(w, n);
    enforceCeilings(w, n);
    const top = ps.slice().sort((a, b) => (n.seats[b.id] ?? 0) - (n.seats[a.id] ?? 0))[0];
    n.president = top ? top.leader : pick(w, cits).id;
    appointCabinetAI(w, n);
  }
}

/** AI president fills empty ministries with competent allies (party first). */
export function appointCabinetAI(w: World, n: Nation) {
  if (n.president == null) return;
  const pres = w.citizens[n.president];
  const pool = citizensOf(w, n.id).filter((c) => c.id !== n.president && c.level >= B.politics.voteLevel);
  const fit: Record<string, (c: Citizen) => number> = {
    vp: (c) => c.influence + (c.persona === 'politician' ? 20 : 0),
    development: (c) => c.buildTotal / 1000 + (c.persona === 'builder' ? 30 : 0) + c.attrs.cons,
    defense: (c) => c.dmgTotal / 1e5 + (c.persona === 'soldier' ? 30 : 0),
    economy: (c) => c.eco * 3 + (c.persona === 'investor' || c.persona === 'merchant' ? 25 : 0),
    labor: (c) => c.eco * 2 + (c.persona === 'industrialist' ? 20 : 0),
    pr: (c) => c.influence + (c.persona === 'journalist' ? 30 : 0),
    recruitment: (c) => c.influence / 2 + c.traits.loyalty * 10,
  };
  const taken = new Set<Id>(Object.values(n.cabinet).filter((x): x is number => x != null));
  for (const m of Object.keys(fit)) {
    if (n.cabinet[m as keyof typeof n.cabinet] != null) continue;
    const cand = pool.filter((c) => !taken.has(c.id) && !c.player).sort((a, b) => {
      const pa = (a.party === pres.party ? 15 : 0) + (pres.rel[a.id] ?? 0) / 5;
      const pb = (b.party === pres.party ? 15 : 0) + (pres.rel[b.id] ?? 0) / 5;
      return fit[m](b) + pb - (fit[m](a) + pa) || a.id - b.id;
    })[0];
    if (cand) { n.cabinet[m as keyof typeof n.cabinet] = cand.id; taken.add(cand.id); }
  }
}
