// State and provincial governments. Every region whose real counterpart has its
// own government (US states and DC, Canadian provinces and territories, German
// Länder, Russian federal subjects, …) gets one, with the real title of its head
// and legislature and the real selection method: elected by residents, or
// appointed by the national government (Chinese provinces, Turkish provinces,
// Saudi regions, Indian union territories). England has none.
//
// A regional government levies a wage tax on shifts worked in the region (0% in
// the US states that have no wage tax), receives block grants from the national
// treasury, and spends on welfare (to households), infrastructure (raises a
// production bonus) and business support (subsidies to local companies).
// Heads are generated officials or full citizens, including the player.
import { isAdult, repNeed, standing } from './growth';
import type { Company, Id, Ideology, StateCandidate, StateGov, World } from './types';
import { localNews } from './life';
import { nationals, officersOf, residents } from './census';
import { B } from '../data/balance';
import { EARTH, type EarthGov } from '../data/earth';
import { NAME_POOLS } from '../data/names';
import { IDEOLOGIES, IDEOLOGY_LIST } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { mint, pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { DAY, dayOf } from '../engine/clock';
import { notify, record } from '../engine/events';
import { chance, pick, rand, randInt } from '../engine/rng';
import { controller, coref, cref, hhref, natref, player, regref, seatShare, jailed } from './query';

// ---------- templates and rules ----------

/** The government template in force: annexed regions are run by an appointed administrator. */
export function govTemplate(w: World, rid: Id): EarthGov | null {
  const base = EARTH.regions[rid].gov;
  if (!base) return null;
  const r = w.regions[rid];
  if (r.owner !== r.core) return { title: 'Administrator', legislature: 'suspended (annexed territory)', mode: 'appointed' };
  return base;
}

/** A government collects taxes and spends only while its region is not under occupation. */
export const govActive = (w: World, rid: Id) => !!w.govs[rid] && !w.regions[rid].occ;

/** Highest wage tax the region may levy (0 in US states with no wage tax). */
export const taxCap = (w: World, rid: Id) => (EARTH.regions[rid].noWageTax && w.regions[rid].owner === w.regions[rid].core ? 0 : B.state.maxTax);

/** The wage tax an ideology considers right. */
export const idealTax = (ideo: Ideology) => Math.max(0, Math.round(4 + 3 * IDEOLOGIES[ideo].taxPref));

/** What the region's electorate would like the tax to be. */
const leanTax = (s: StateGov) => IDEOLOGY_LIST.reduce((t, i) => t + s.lean[i] * idealTax(i), 0);

/** Region the citizen heads, if any. */
export const headOf = (w: World, cid: Id): Id | null => {
  for (const s of w.govs) if (s && s.head.cit === cid) return s.region;
  return null;
};

function officialName(w: World, nation: Id) {
  const pool = NAME_POOLS[w.nations[nation].cur];
  return `${pick(w, pool.first)} ${pick(w, pool.last)}`;
}

const normalize = (m: Record<Ideology, number>) => {
  const t = IDEOLOGY_LIST.reduce((s, i) => s + m[i], 0) || 1;
  for (const i of IDEOLOGY_LIST) m[i] /= t;
  return m;
};

export function budgetFor(ideo: Ideology): StateGov['budget'] {
  switch (ideo) {
    case 'capitalism': return { welfare: 0.15, infra: 0.3, business: 0.4, police: 0.15 };
    case 'socialism': case 'communism': return { welfare: 0.5, infra: 0.25, business: 0.1, police: 0.15 };
    case 'centralism': return { welfare: 0.2, infra: 0.45, business: 0.15, police: 0.2 };
    default: return { welfare: 0.25, infra: 0.3, business: 0.2, police: 0.25 };
  }
}

/** Legislature seats: proportional to a blend of votes and leaning (D'Hondt over ideologies). */
function allocateSeats(size: number, share: Partial<Record<Ideology, number>>) {
  const seats: Partial<Record<Ideology, number>> = {};
  for (let k = 0; k < size; k++) {
    let best: Ideology | null = null, bestQ = -1;
    for (const i of IDEOLOGY_LIST) {
      const q = (share[i] ?? 0) / ((seats[i] ?? 0) + 1);
      if (q > bestQ) { bestQ = q; best = i; }
    }
    if (best) seats[best] = (seats[best] ?? 0) + 1;
  }
  return seats;
}

/** Share of the legislature that backs moving the tax in direction `dir` (+1 raise, −1 cut). */
export function legislatureSupport(s: StateGov, dir: number) {
  let yes = 0, total = 0;
  for (const i of IDEOLOGY_LIST) {
    const n = s.seats[i] ?? 0;
    total += n;
    const pref = IDEOLOGIES[i].taxPref * dir;
    yes += pref > 0 ? n : pref === 0 ? n / 2 : 0;
  }
  return total ? yes / total : 1;
}

// ---------- genesis ----------

export function initGovs(w: World) {
  w.govs = w.regions.map(() => null);
  const national = w.nations.map((n) => {
    const m = {} as Record<Ideology, number>;
    for (const i of IDEOLOGY_LIST) m[i] = 0;
    for (const c of nationals(w, n.id)) m[c.ideo] += 1;
    return normalize(m);
  });
  for (const r of w.regions) {
    const tpl = govTemplate(w, r.id);
    if (!tpl) continue;
    const n = w.nations[r.owner];
    // Electorate leaning: the local residents and the nation's mix, tilted by how urban the region is.
    const mix = {} as Record<Ideology, number>;
    const locals = residents(w, r.id).filter((c) => c.nation === n.id);
    for (const i of IDEOLOGY_LIST) mix[i] = 0.04 + (national[n.id][i] ?? 0);
    for (const c of locals) mix[c.ideo] += 1 / Math.max(1, locals.length);
    const urban = Math.min(1, Math.max(0, (Math.log10(EARTH.regions[r.id].popReal) - 5) / 2.5));
    for (const i of IDEOLOGY_LIST) mix[i] *= rand(w, 0.5, 1.5);
    mix.socialism *= 1 + urban * 0.6; mix.capitalism *= 1 + urban * 0.3; mix.nationalism *= 1 + (1 - urban) * 0.7; mix.imperialism *= 1 + (1 - urban) * 0.3;
    const lean = normalize(mix);
    const size = Math.max(15, Math.min(150, Math.round(15 + Math.sqrt(r.pop / 1000) * 12)));
    const s: StateGov = {
      region: r.id, wallet: {}, inv: {}, cur: n.cur,
      head: { name: '', ideo: 'capitalism', cit: null, since: w.time }, seats: {}, size, lean,
      tax: 0, budget: budgetFor('capitalism'), policeSpend: 0, spendRate: 0.25, dev: 0, devPts: 0, approval: 55,
      // Staggered cycles so a few regions vote each day.
      nextElection: w.time + randInt(w, 8, B.state.termDays) * DAY, candidates: [], voted: [], lastTaxChange: -1e9,
      stats: { revToday: 0, spendToday: 0, revHist: [], spendHist: [] },
    };
    w.govs[r.id] = s;
    if (tpl.mode === 'elected') {
      openRegistration(w, s, false);
      resolveElection(w, s, false);
      s.nextElection = w.time + randInt(w, 8, B.state.termDays) * DAY;
    } else appoint(w, s, null, false);
    s.tax = Math.min(taxCap(w, r.id), Math.max(0, idealTax(s.head.ideo) + randInt(w, -1, 1)));
    s.budget = budgetFor(s.head.ideo);
    mint(w, regref(r.id), n.cur, cur(Math.round(r.pop * B.state.startPerPop)), 'Genesis endowment');
  }
}

// ---------- elections and appointments ----------

function openRegistration(w: World, s: StateGov, announce = true) {
  const r = w.regions[s.region];
  const used = new Set(s.candidates.map((c) => c.ideo));
  const add = (c: StateCandidate) => { if (!s.candidates.some((x) => x.name === c.name)) { s.candidates.push(c); used.add(c.ideo); } };
  // The incumbent stands again unless they are a citizen who has registered themselves already.
  if (s.head.name && !s.candidates.some((c) => c.cit != null && c.cit === s.head.cit) && (s.head.cit == null || eligibleCandidate(w, s.head.cit, s.region) === null)) {
    add({ name: s.head.name, ideo: s.head.ideo, cit: s.head.cit, campaign: 0 });
  }
  // AI politicians living in the region may run.
  for (const c of residents(w, r.id)) {
    if (c.player || c.persona !== 'politician' || c.nation !== r.owner) continue;
    if (eligibleCandidate(w, c.id, r.id) === null && chance(w, 0.25)) add({ name: c.name, ideo: c.ideo, cit: c.id, campaign: 0 });
  }
  // Generated challengers from the strongest currents in the electorate.
  const ranked = [...IDEOLOGY_LIST].sort((a, b) => s.lean[b] - s.lean[a]);
  for (const i of ranked) {
    if (s.candidates.length >= 3) break;
    if (!used.has(i)) add({ name: officialName(w, r.owner), ideo: i, cit: null, campaign: 0 });
  }
  if (announce) {
    const p = player(w);
    if (p.loc === r.id && p.nation === r.owner) {
      const tpl = govTemplate(w, r.id)!;
      notify(w, 'politics', `🗳️ ${r.name} elects its ${tpl.title} on day ${dayOf(s.nextElection)}. Residents can vote; well-known citizens can still run (Map → ${r.name}).`, { link: 'map' });
    }
  }
}

function resolveElection(w: World, s: StateGov, announce = true) {
  const r = w.regions[s.region];
  if (s.candidates.length < 2) openRegistration(w, s, false);
  const electorate = Math.round(r.pop * B.state.turnout);
  const campaignRef = cur(Math.max(20, r.pop / 400));
  const scores = s.candidates.map((c) => {
    let sc = s.lean[c.ideo] + 0.03;
    if (s.head.name === c.name) sc *= 0.7 + (s.approval / 100) * 0.6;
    if (c.cit != null) {
      const x = w.citizens[c.cit];
      sc *= 1 + Math.min(0.5, (x?.influence ?? 0) / 200) + Math.min(0.2, (x?.sec.fame ?? 0) / 100);
      sc *= 1 - Math.min(0.6, (x?.sec.record.convictions ?? 0) * 0.15); // voters punish convictions
    }
    sc *= 1 + Math.min(1, c.campaign / campaignRef);
    return sc * rand(w, 0.85, 1.15);
  });
  const total = scores.reduce((a, b) => a + b, 0) || 1;
  // The region's residents are a sample of its electorate: half the vote follows the standing mood,
  // half follows what the residents themselves decide (views, relationships, promises made in person).
  const locals = residents(w, r.id).filter((c) => !c.player && c.nation === r.owner && isAdult(w, c) && !jailed(w, c));
  const localVotes = s.candidates.map(() => 0);
  for (const v of locals) {
    let best = 0, bestU = -Infinity;
    s.candidates.forEach((cand, i) => {
      let u = cand.ideo === v.ideo ? 30 : 12 * (1 - Math.abs(IDEOLOGIES[cand.ideo].hawk - IDEOLOGIES[v.ideo].hawk));
      if (cand.cit != null) {
        u += (v.rel[cand.cit] ?? 0) / 3;
        if (v.flags.pledge === cand.cit && dayOf(w.time) - (v.flags.pledgeDay ?? -99) <= 30) u += 40;
        if (cand.cit === v.id) u += 100;
      }
      if (s.head.name === cand.name) u += (s.approval - 50) / 4;
      u += rand(w, -8, 8);
      if (u > bestU) { bestU = u; best = i; }
    });
    localVotes[best]++;
  }
  const localShare = locals.length >= 3 ? 0.5 : 0;
  s.candidates.forEach((c, i) => {
    const share = (1 - localShare) * (scores[i] / total) + localShare * (localVotes[i] / Math.max(1, locals.length));
    c.votes = Math.round(electorate * share) + (c.votes ?? 0); // ballots cast by the player (voteState) are on top
  });
  const ranked = [...s.candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const win = ranked[0];
  const prev = s.head;
  s.head = { name: win.name, ideo: win.ideo, cit: win.cit, since: w.time };
  if (prev.name !== win.name) s.approval = 55;
  // Legislature: half from this vote, half from the standing leaning.
  const share: Partial<Record<Ideology, number>> = {};
  const votesTotal = ranked.reduce((a, c) => a + (c.votes ?? 0), 0) || 1;
  for (const i of IDEOLOGY_LIST) share[i] = s.lean[i] * 0.5;
  for (const c of ranked) share[c.ideo] = (share[c.ideo] ?? 0) + ((c.votes ?? 0) / votesTotal) * 0.5;
  s.seats = allocateSeats(s.size, share);
  // The electorate drifts a little toward the national mood and the winner.
  const nat = seatShare(w, w.nations[r.owner]);
  for (const i of IDEOLOGY_LIST) s.lean[i] = s.lean[i] * 0.9 + (nat[i] ?? 0) * 0.07 + (i === win.ideo ? 0.03 : 0);
  normalize(s.lean);
  s.last = { at: w.time, turnout: votesTotal, results: ranked.map((c) => ({ name: c.name, ideo: c.ideo, votes: c.votes ?? 0 })) };
  s.candidates = [];
  s.voted = [];
  s.nextElection = w.time + B.state.termDays * DAY;
  if (announce) localNews(w, r.id, `🗳️ ${win.name} won the election for ${govTemplate(w, r.id)!.title} with ${Math.round(((win.votes ?? 0) / Math.max(1, votesTotal)) * 100)}% of the vote.`);
  if (!announce) return;
  const tpl = govTemplate(w, r.id)!;
  const p = player(w);
  const text = `🗳️ ${r.name} (${w.nations[r.owner].name}) elected ${win.name} (${IDEOLOGIES[win.ideo].name}) as ${tpl.title}${prev.name && prev.name !== win.name ? `, replacing ${prev.name}` : prev.name === win.name ? ' again' : ''}.`;
  if (r.owner === p.nation) record(w, 'politics', text, { nation: r.owner, region: r.id, important: win.cit === p.id });
  if (win.cit === p.id) notify(w, 'office', `🏛️ You won! You are now ${tpl.title} of ${r.name}. Set the state tax and budget on the map (${r.name}).`, { link: 'map' });
  else if (ranked.some((c) => c.cit === p.id)) notify(w, 'office', `🗳️ You lost the ${r.name} election to ${win.name}.`);
  else if (p.loc === r.id && p.nation === r.owner) notify(w, 'politics', text);
}

/** Appointed systems: the national leader names the head (AI: someone of their own ideology). */
function appoint(w: World, s: StateGov, cit: Id | null, announce = true) {
  const r = w.regions[s.region];
  const n = w.nations[r.owner];
  const leader = n.president != null ? w.citizens[n.president] : null;
  const ideo: Ideology = cit != null ? w.citizens[cit].ideo : leader?.ideo ?? (Object.entries(seatShare(w, n)).sort((a, b) => b[1] - a[1])[0]?.[0] as Ideology) ?? 'centralism';
  const keep = cit == null && s.head.name && s.head.ideo === ideo && s.approval >= 40;
  if (!keep) {
    const name = cit != null ? w.citizens[cit].name : officialName(w, r.owner);
    s.head = { name, ideo, cit, since: w.time };
    s.approval = 55;
  }
  // Appointed systems' councils mirror the national legislature.
  const nat = seatShare(w, n);
  const share: Partial<Record<Ideology, number>> = Object.keys(nat).length ? nat : { [ideo]: 1 };
  s.seats = allocateSeats(s.size, share);
  s.nextElection = w.time + B.state.termDays * DAY;
  s.candidates = [];
  if (!announce) return;
  const tpl = govTemplate(w, r.id)!;
  if (!keep && r.owner === player(w).nation) record(w, 'politics', `🏛️ ${n.name} appointed ${s.head.name} as ${tpl.title} of ${r.name}.`, { nation: n.id, region: r.id });
  if (cit != null && cit === player(w).id) notify(w, 'office', `🏛️ You have been appointed ${tpl.title} of ${r.name}.`, { link: 'map' });
}

// ---------- player / citizen actions ----------

export function eligibleCandidate(w: World, cid: Id, rid: Id): string | null {
  const c = w.citizens[cid];
  const r = w.regions[rid];
  const s = w.govs[rid];
  const tpl = govTemplate(w, rid);
  if (!c || c.gone) return 'No such person.';
  if (!isAdult(w, c)) return `Candidates must be ${B.life.adultAge} or older.`;
  if (!s || !tpl) return `${r.name} has no regional government.`;
  if (jailed(w, c)) return 'Prisoners cannot stand for office.';
  if (tpl.mode !== 'elected') return `The ${tpl.title} of ${r.name} is appointed by the national government.`;
  if (r.occ) return `${r.name} is under occupation; elections are postponed.`;
  if (c.nation !== r.owner) return `Only ${w.nations[r.owner].adj} citizens can run.`;
  if (c.loc !== rid) return `You must live in ${r.name} (be located there) to run.`;
  if (standing(c) < B.state.candRep) return `Voters don't know you: running needs ${repNeed(B.state.candRep)}.`;
  const other = headOf(w, cid);
  if (other != null && other !== rid) return `You already head ${w.regions[other].name}.`;
  return null;
}

export function runCheck(w: World, cid: Id, rid: Id): string | null {
  const why = eligibleCandidate(w, cid, rid);
  if (why) return why;
  const s = w.govs[rid]!;
  if (s.candidates.some((c) => c.cit === cid)) return 'You are already a candidate.';
  if (w.time < s.nextElection - B.state.regDays * DAY) return `Registration opens on day ${dayOf(s.nextElection - B.state.regDays * DAY)}.`;
  if (Object.values(w.govs).some((x) => x && x.region !== rid && x.candidates.some((c) => c.cit === cid))) return 'You are already running elsewhere.';
  return null;
}

export function runForHead(w: World, cid: Id, rid: Id): Result {
  const why = runCheck(w, cid, rid);
  if (why) return fail(why);
  const s = w.govs[rid]!;
  const c = w.citizens[cid];
  s.candidates.push({ name: c.name, ideo: c.ideo, cit: cid, campaign: 0 });
  return ok(`You are a candidate for ${govTemplate(w, rid)!.title} of ${w.regions[rid].name} (election day ${dayOf(s.nextElection)}).`);
}

export function voteCheck(w: World, cid: Id, rid: Id, idx: number): string | null {
  const s = w.govs[rid];
  const tpl = govTemplate(w, rid);
  const c = w.citizens[cid];
  if (!s || !tpl || tpl.mode !== 'elected') return 'No election here.';
  if (!s.candidates.length) return `No race open yet (election day ${dayOf(s.nextElection)}).`;
  if (c.nation !== w.regions[rid].owner || c.loc !== rid) return `Only ${w.nations[w.regions[rid].owner].adj} citizens living in ${w.regions[rid].name} can vote.`;
  if (s.voted.includes(cid)) return 'You already voted in this election.';
  if (!s.candidates[idx]) return 'Unknown candidate.';
  return null;
}

/** A citizen's vote: one ballot among the region's electorate. */
export function voteState(w: World, cid: Id, rid: Id, idx: number): Result {
  const why = voteCheck(w, cid, rid, idx);
  if (why) return fail(why);
  const s = w.govs[rid]!;
  s.voted.push(cid);
  s.candidates[idx].votes = (s.candidates[idx].votes ?? 0) + 1;
  return ok(`You voted for ${s.candidates[idx].name}.`);
}

/** Campaign spending goes to local media and staff (households) and raises the candidate's standing. */
export function campaign(w: World, cid: Id, rid: Id, amount: number): Result {
  const s = w.govs[rid];
  const c = w.citizens[cid];
  const cand = s?.candidates.find((x) => x.cit === cid);
  if (!s || !cand) return fail('You are not a candidate here.');
  if (amount <= 0) return fail('Enter an amount.');
  const code = w.nations[w.regions[rid].owner].cur;
  if (!pay(w, cref(cid), hhref(w.regions[rid].owner), code, amount, `Campaign in ${w.regions[rid].name}`)) return fail(`You don't have ${fmtAmt(code, amount)}.`);
  cand.campaign += amount;
  c.influence += 1;
  return ok(`Spent ${fmtAmt(code, amount)} on your campaign.`);
}

/** Change the state wage tax: the head proposes, the legislature must back it. */
export function setStateTax(w: World, actor: Id | 'npc', rid: Id, value: number): Result {
  const s = w.govs[rid];
  if (!s) return fail('No regional government here.');
  if (actor !== 'npc' && s.head.cit !== actor) return fail(`Only the ${govTemplate(w, rid)!.title} can propose the state tax.`);
  const cap = taxCap(w, rid);
  if (!Number.isInteger(value) || value < 0 || value > cap) return fail(cap === 0 ? `${w.regions[rid].name} does not tax wages.` : `The tax must be between 0% and ${cap}%.`);
  if (value === s.tax) return fail('That is the current rate.');
  if (Math.abs(value - s.tax) > B.state.taxStep) return fail(`Change the tax by at most ${B.state.taxStep} points at a time.`);
  if (w.time - s.lastTaxChange < B.state.taxCooldownDays * DAY) return fail(`The legislature considered the tax recently; wait until day ${dayOf(s.lastTaxChange + B.state.taxCooldownDays * DAY)}.`);
  const tpl = govTemplate(w, rid)!;
  const support = tpl.mode === 'appointed' ? 1 : legislatureSupport(s, Math.sign(value - s.tax));
  s.lastTaxChange = w.time;
  if (support < 0.5) return fail(`The ${tpl.legislature} rejected the change (${Math.round(support * 100)}% in favour).`);
  const old = s.tax;
  s.tax = value;
  if (actor !== 'npc' && w.citizens[actor]?.player) record(w, 'politics', `🏛️ ${w.regions[rid].name} set its wage tax to ${value}% (from ${old}%).`, { region: rid, nation: w.regions[rid].owner, player: true });
  return ok(`State wage tax set to ${value}% (${Math.round(support * 100)}% of the ${tpl.legislature} in favour).`);
}

export function setStateBudget(w: World, actor: Id, rid: Id, budget: StateGov['budget'], spendRate: number): Result {
  const s = w.govs[rid];
  if (!s || s.head.cit !== actor) return fail('Only the head of this government sets its budget.');
  const vals = [budget.welfare, budget.infra, budget.business, budget.police];
  if (vals.some((v) => !(v >= 0)) || Math.abs(vals.reduce((a, b) => a + b, 0) - 1) > 0.011) return fail('Budget shares must add up to 100%.');
  if (!(spendRate >= 0.05 && spendRate <= 0.6)) return fail('Spend between 5% and 60% of the treasury per day.');
  s.budget = { ...budget };
  s.spendRate = spendRate;
  return ok('Budget updated.');
}

export function appointCheck(w: World, actor: Id, rid: Id, cit: Id | null): string | null {
  const r = w.regions[rid];
  const s = w.govs[rid];
  const tpl = govTemplate(w, rid);
  if (!s || !tpl) return `${r.name} has no regional government.`;
  if (tpl.mode !== 'appointed') return `The ${tpl.title} is elected by residents.`;
  if (w.nations[r.owner].president !== actor) return `Only the ${w.nations[r.owner].leader.toLowerCase()} of ${w.nations[r.owner].name} appoints the ${tpl.title}.`;
  if (r.occ) return `${r.name} is under occupation.`;
  if (cit != null) {
    const c = w.citizens[cit];
    if (!c || c.nation !== r.owner) return 'The appointee must be a citizen.';
    const other = headOf(w, cit);
    if (other != null && other !== rid) return `${c.name} already heads ${w.regions[other].name}.`;
  }
  return null;
}

export function appointHead(w: World, actor: Id, rid: Id, cit: Id | null): Result {
  const why = appointCheck(w, actor, rid, cit);
  if (why) return fail(why);
  const s = w.govs[rid]!;
  const prev = s.head.name;
  if (cit == null) s.head.name = ''; // force a fresh official
  appoint(w, s, cit);
  return ok(`${s.head.name} replaces ${prev} as ${govTemplate(w, rid)!.title} of ${w.regions[rid].name}.`);
}

export function resignHead(w: World, actor: Id): Result {
  const rid = headOf(w, actor);
  if (rid == null) return fail('You hold no regional office.');
  vacate(w, w.govs[rid]!, 'resigned');
  return ok(`You resigned as ${govTemplate(w, rid)?.title ?? 'head'} of ${w.regions[rid].name}.`);
}

/** A caretaker official of the same ideology serves out the term. */
function vacate(w: World, s: StateGov, why: string) {
  const r = w.regions[s.region];
  const old = s.head;
  s.head = { name: officialName(w, r.owner), ideo: old.ideo, cit: null, since: w.time };
  if (old.cit != null && w.citizens[old.cit]?.player) notify(w, 'office', `🏛️ You are no longer head of ${r.name} (${why}).`);
}

// ---------- daily running ----------

const devCost = (w: World, s: StateGov) => cur(Math.max(30, w.regions[s.region].pop * B.state.devCostPerPop)) * (s.dev + 1);

export function stateDaily(w: World) {
  const p = player(w);
  const byRegion = new Map<Id, Company[]>();
  for (const co of Object.values(w.companies)) if (co.workers.length) (byRegion.get(co.region) ?? byRegion.set(co.region, []).get(co.region)!).push(co);
  // Block grants: a share of yesterday's national revenue, by population.
  for (const n of w.nations) {
    if (n.exile) continue;
    const rev = n.stats.revHist[n.stats.revHist.length - 1] ?? 0;
    const pool = Math.min(Math.round(rev * B.state.grantShare), Math.floor((n.wallet[n.cur] ?? 0) * 0.05));
    if (pool <= 0) continue;
    const govs = w.govs.filter((s): s is StateGov => !!s && w.regions[s.region].owner === n.id && govActive(w, s.region));
    const pop = govs.reduce((t, s) => t + w.regions[s.region].pop, 0) || 1;
    for (const s of govs) {
      const amt = Math.floor((pool * w.regions[s.region].pop) / pop);
      if (amt > 0 && s.cur === n.cur && pay(w, natref(n.id), regref(s.region), n.cur, amt, 'Block grant')) { n.stats.spendToday += amt; s.stats.revToday += amt; }
    }
  }
  const hhPop = w.nations.map((n) => w.regions.reduce((t, r) => t + (r.owner === n.id ? r.pop : 0), 0) || 1);
  const hhCash = w.households.map((h) => h.wallet[w.nations[h.nation].cur] ?? 0);
  for (const s of w.govs) {
    if (!s) continue;
    const r = w.regions[s.region];
    const owner = w.nations[r.owner];
    // Taxes on residents (the background economy): wage tax plus a baseline sales/property levy.
    if (govActive(w, s.region) && s.cur === owner.cur) {
      const levy = Math.floor(((hhCash[owner.id] * r.pop) / hhPop[owner.id]) * ((s.tax + B.state.residentBase) / 100) * B.state.residentShare);
      if (levy > 0 && pay(w, hhref(owner.id), regref(s.region), s.cur, levy, `${r.name} resident taxes`)) s.stats.revToday += levy;
    }
    // A change of ownership: the treasury goes to the old nation, the new owner appoints.
    if (s.cur !== owner.cur) {
      const old = w.nations.find((n) => n.cur === s.cur);
      const amt = s.wallet[s.cur] ?? 0;
      if (old && amt > 0) pay(w, regref(s.region), natref(old.id), s.cur, amt, 'Regional treasury returned');
      s.cur = owner.cur;
      s.nextElection = w.time;
      s.tax = Math.min(s.tax, taxCap(w, s.region));
    }
    const tpl = govTemplate(w, s.region)!;
    // Heads who lose their citizenship of the owning nation stand down.
    if (s.head.cit != null) {
      const c = w.citizens[s.head.cit];
      if (!c || c.gone) vacate(w, s, c?.gone?.why === 'died' ? 'died in office' : 'left the country');
      else if (c.nation !== r.owner) vacate(w, s, 'no longer a citizen');
    }
    if (r.occ) {
      if (s.nextElection <= w.time) s.nextElection = w.time + 7 * DAY; // postponed
      rollStats(s);
      continue;
    }
    // Elections and appointments.
    if (tpl.mode === 'elected') {
      if (!s.candidates.length && w.time >= s.nextElection - B.state.regDays * DAY) openRegistration(w, s);
      if (w.time >= s.nextElection) resolveElection(w, s);
    } else if (w.time >= s.nextElection) {
      const leader = owner.president;
      if (leader != null && leader === p.id) {
        s.nextElection = w.time + B.state.termDays * DAY;
        notify(w, 'office', `🏛️ The term of ${s.head.name} as ${tpl.title} of ${r.name} is up: keep them or appoint someone (Map → ${r.name}).`, { link: 'map' });
      } else appoint(w, s, null);
    }
    // Salary for a citizen head.
    const code = s.cur;
    if (s.head.cit != null) {
      const sal = cur(B.state.salary);
      if (pay(w, regref(s.region), cref(s.head.cit), code, sal, `Salary: ${tpl.title} of ${r.name}`)) s.stats.spendToday += sal;
    }
    // Spending.
    const budget = Math.floor((s.wallet[code] ?? 0) * s.spendRate);
    if (budget > 0) spend(w, s, budget, byRegion.get(s.region) ?? []);
    while (s.dev < B.state.devMax && s.devPts >= devCost(w, s)) {
      s.devPts -= devCost(w, s);
      s.dev++;
      if (r.owner === p.nation) record(w, 'construction', `🛣️ ${r.name} completed state infrastructure level ${s.dev} (+${Math.round(s.dev * B.state.devBonus * 100)}% production).`, { region: r.id, nation: r.owner });
    }
    // Approval follows taxes, welfare and infrastructure relative to what residents want.
    const socialLean = s.lean.socialism + s.lean.communism;
    const target = 52 - (s.tax - leanTax(s)) * 2.5 + (s.budget.welfare - 0.33) * 30 * (0.5 + socialLean) + s.dev * 2 + (s.head.cit != null ? 2 : 0);
    s.approval = Math.max(5, Math.min(95, s.approval + (target - s.approval) * 0.1 + rand(w, -1, 1)));
    // AI heads review policy weekly.
    if (s.head.cit !== p.id && (dayOf(w.time) + s.region) % 7 === 0) aiPolicy(w, s);
    rollStats(s);
  }
}

function spend(w: World, s: StateGov, amount: number, local: Company[]) {
  const r = w.regions[s.region];
  const code = s.cur;
  const welfare = Math.floor(amount * s.budget.welfare);
  const infra = Math.floor(amount * s.budget.infra);
  const police = Math.floor(amount * s.budget.police);
  let business = amount - welfare - infra - police;
  s.policeSpend = police > 0 ? payPolice(w, s, police) : 0;
  const ref = regref(s.region);
  const cos = controller(r) === r.owner ? local : [];
  const workers = cos.reduce((t, co) => t + co.workers.length, 0);
  if (business > 0 && workers > 0) {
    let paid = 0;
    for (const co of cos) {
      const amt = Math.floor((business * co.workers.length) / workers);
      if (amt > 0 && pay(w, ref, coref(co.id), code, amt, `Business support from ${r.name}`)) paid += amt;
    }
    business = paid;
  } else business = 0;
  // Welfare and infrastructure contracts flow to residents (the background economy).
  const toHh = welfare + infra;
  if (toHh > 0 && pay(w, ref, hhref(r.owner), code, toHh, `${r.name} public spending`)) s.devPts += infra;
  s.stats.spendToday += toHh + business + s.policeSpend;
}

/** Police spending: salaries for citizen officers serving here, the rest to local employment (households). */
function payPolice(w: World, s: StateGov, amount: number): number {
  const ref = regref(s.region);
  const officers = officersOf(w, s.region).filter((c) => !c.sec.jailUntil);
  let paid = 0;
  const each = officers.length ? Math.min(cur(B.police.salary) * 2, Math.floor((amount * 0.5) / officers.length)) : 0;
  for (const o of officers) if (each > 0 && pay(w, ref, cref(o.id), s.cur, each, `Police salary (${w.regions[s.region].name})`)) paid += each;
  const rest = amount - paid;
  if (rest > 0 && pay(w, ref, hhref(w.regions[s.region].owner), s.cur, rest, `${w.regions[s.region].name} policing`)) paid += rest;
  return paid;
}

function rollStats(s: StateGov) {
  s.stats.revHist.push(s.stats.revToday);
  s.stats.spendHist.push(s.stats.spendToday);
  if (s.stats.revHist.length > 30) s.stats.revHist.shift();
  if (s.stats.spendHist.length > 30) s.stats.spendHist.shift();
  s.stats.revToday = 0;
  s.stats.spendToday = 0;
}

/** Generated officials and AI citizens govern by ideology, softened when unpopular. */
function aiPolicy(w: World, s: StateGov) {
  const want = s.approval < 40 ? Math.round((idealTax(s.head.ideo) + leanTax(s)) / 2) : idealTax(s.head.ideo);
  const cap = taxCap(w, s.region);
  const goal = Math.min(cap, Math.max(0, want));
  if (goal !== s.tax && w.time - s.lastTaxChange >= B.state.taxCooldownDays * DAY) {
    const step = Math.max(-B.state.taxStep, Math.min(B.state.taxStep, goal - s.tax));
    setStateTax(w, s.head.cit ?? 'npc', s.region, s.tax + step);
  }
  const b = budgetFor(s.head.ideo);
  if (s.approval < 40) { b.welfare += 0.1; b.business -= 0.05; b.infra -= 0.05; }
  // Crime-ridden regions shift money into policing.
  const crime = w.regions[s.region].crime;
  if (crime > 45) { const shift = Math.min(b.infra - 0.05, (crime - 45) / 200); b.police += shift; b.infra -= shift; }
  s.budget = b;
  s.spendRate = 0.25;
}

// ---------- queries for other systems ----------

/** State wage tax on a shift worked in `rid` (0 when the government is suspended). */
export function stateTaxRate(w: World, rid: Id): number {
  const s = w.govs[rid];
  if (!s || !govActive(w, rid) || s.cur !== w.nations[w.regions[rid].owner].cur) return 0;
  return s.tax;
}

/** Production multiplier from state infrastructure. */
export const infraBonus = (w: World, rid: Id) => {
  const s = w.govs[rid];
  return s && s.dev ? 1 + s.dev * B.state.devBonus : 1;
};
