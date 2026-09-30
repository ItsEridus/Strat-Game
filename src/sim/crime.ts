// Crime, organised crime, policing and justice.
//
// Every region has a crime rate driven by real conditions: unemployment, poverty,
// the business cycle, city size, organised crime and how well it is policed.
// Police strength comes from state/provincial police budgets, the national police
// (funded by congress), and citizen officers serving there. Syndicates (named in
// each country's own style: families, cartels, bratvas, triads, yakuza clans…)
// hold turf, extort companies, skim the local economy, recruit disaffected
// citizens, feud with each other and get raided. Crimes (by AI citizens and the
// player) open cases; evidence builds with policing; arrests lead to trials with
// fines and prison. AI and player use the same functions.
import type { Case, Citizen, CrimeKind, Id, Syndicate, World } from './types';
import { B } from '../data/balance';
import { EARTH } from '../data/earth';
import { NAME_POOLS, POLICE_NAMES, SYNDICATE_STYLES } from '../data/names';
import { fail, ok, type Result } from '../engine/result';
import { mint, moveItems, pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { DAY, HOUR, dayOf, hourOf } from '../engine/clock';
import { nid, notify, record, sendMsg } from '../engine/events';
import { chance, pick, rand, randInt, weighted } from '../engine/rng';
import { controller, coref, cref, hhref, jailed, natref, player, regref, syndref } from './query';
import { nationPerm } from './authority';
import { addXp } from './citizen';

// ---------- definitions ----------

export const CRIMES: Record<'pickpocket' | 'burglary' | 'fraud', { name: string; desc: string; energy: number; severity: number; heat: number; base: number; cd: number }> = {
  pickpocket: { name: 'Pickpocketing', desc: 'Lift cash from passers-by in the region (small, low risk).', energy: 10, severity: 1, heat: 8, base: 0.8, cd: 6 },
  burglary: { name: 'Burglary', desc: 'Break into a local company warehouse and take goods.', energy: 25, severity: 2, heat: 16, base: 0.65, cd: 12 },
  fraud: { name: 'Fraud', desc: 'Defraud a local company of cash (economic skill helps).', energy: 20, severity: 3, heat: 20, base: 0.5, cd: 24 },
};
export const SYND_JOBS: Record<'smuggle' | 'collect' | 'heist', { name: string; desc: string; energy: number; severity: number; heat: number; base: number; rank: number; cd: number }> = {
  smuggle: { name: 'Smuggling run', desc: 'Move contraband across the region for the syndicate. Paid from its coffers.', energy: 20, severity: 2, heat: 10, base: 0.75, rank: 0, cd: 12 },
  collect: { name: 'Collect protection', desc: 'Lean on businesses on the syndicate’s turf; you keep a cut.', energy: 15, severity: 2, heat: 12, base: 0.8, rank: 1, cd: 12 },
  heist: { name: 'Heist', desc: 'A planned raid on a company’s cash. Big payout, big risk.', energy: 40, severity: 4, heat: 30, base: 0.45, rank: 2, cd: 48 },
};
export const SRANKS = ['Associate', 'Soldier', 'Capo', 'Underboss', 'Boss'];
export const PRANKS = ['Officer', 'Sergeant', 'Detective', 'Captain', 'Chief'];
const SEVERITY: Record<CrimeKind, number> = { pickpocket: 1, burglary: 2, fraud: 3, smuggling: 2, extortion: 2, bribery: 3, assault: 2, corruption: 4, espionage: 5, votebuying: 3, heist: 4, taxevasion: 2 };
const CRIME_NAME: Record<CrimeKind, string> = { pickpocket: 'pickpocketing', burglary: 'burglary', fraud: 'fraud', smuggling: 'smuggling', extortion: 'extortion', bribery: 'bribery', assault: 'assault', corruption: 'corruption', espionage: 'espionage', votebuying: 'vote buying', heist: 'armed robbery', taxevasion: 'tax evasion' };

export const policeName = (w: World, rid: Id) => {
  const r = w.regions[rid];
  const n = w.nations[r.owner];
  return w.govs[rid] ? `${r.name} Police` : `${POLICE_NAMES[n.cur] ?? `${n.adj} Police`}`;
};
const cityOf = (rid: Id) => EARTH.regions[rid].city;

// ---------- genesis ----------

export function syndicateName(w: World, nation: Id, rid: Id): { name: string; style: string } {
  const n = w.nations[nation];
  const st = SYNDICATE_STYLES[n.cur] ?? { patterns: ['{C} Syndicate'], words: [], kind: 'syndicate' };
  const used = new Set(Object.values(w.syndicates).map((s) => s.name));
  for (let i = 0; i < 20; i++) {
    const pat = pick(w, st.patterns.filter((p) => !p.includes('{W}') || st.words.length));
    const name = pat.replace('{L}', pick(w, NAME_POOLS[n.cur].last)).replace('{C}', cityOf(rid)).replace('{N}', String(randInt(w, 1, 9) * 7 + randInt(w, 0, 6))).replace('{W}', st.words.length ? pick(w, st.words) : '');
    if (!used.has(name)) return { name, style: st.kind };
  }
  return { name: `${cityOf(rid)} Syndicate ${used.size}`, style: st.kind };
}

function foundSyndicate(w: World, nation: Id, home: Id, boss: Citizen | null): Syndicate {
  const { name, style } = syndicateName(w, nation, home);
  const s: Syndicate = {
    id: nid(w), name, nation, style, boss: null, members: [], turf: [home], home, wallet: {}, inv: {}, strength: 25, heat: 0, founded: w.time,
    rackets: {}, feuds: [], income: [],
  };
  w.syndicates[s.id] = s;
  if (boss) enlist(w, s, boss, 4);
  return s;
}

function enlist(w: World, s: Syndicate, c: Citizen, rank = 0) {
  if (c.sec.syndicate != null) return;
  c.sec.syndicate = s.id;
  c.sec.srank = rank;
  s.members.push(c.id);
  if (rank >= 4) s.boss = c.id;
}

export function initCrime(w: World) {
  for (const n of w.nations) {
    const own = w.regions.filter((r) => r.owner === n.id);
    const count = randInt(w, B.syndicate.perNation[0], B.syndicate.perNation[1]);
    const byPop = [...own].sort((a, b) => b.pop - a.pop);
    for (let i = 0; i < count && i < byPop.length; i++) {
      const home = byPop[Math.min(byPop.length - 1, i * 2 + randInt(w, 0, 1))];
      const recruits = Object.values(w.citizens).filter((c) => c.nation === n.id && !c.player && c.sec.syndicate == null && c.traits.greed > 0.55 && c.traits.risk > 0.45 && c.persona !== 'politician');
      const boss = recruits.length ? pick(w, recruits) : null;
      const s = foundSyndicate(w, n.id, home.id, boss);
      for (const c of recruits.filter((x) => x !== boss).slice(0, randInt(w, 1, 3))) enlist(w, s, c, randInt(w, 0, 2));
      for (const l of home.links) if (w.regions[l].owner === n.id && chance(w, 0.4)) s.turf.push(l);
      mint(w, syndref(s.id), n.cur, cur(randInt(w, 150, 500)), 'Genesis endowment');
    }
  }
  for (const r of w.regions) { r.police = policeTarget(w, r.id); r.crime = crimeTarget(w, r.id); r.unrest = 10; }
}

// ---------- policing ----------

/** Police strength from state police spending, national police funding and citizen officers. */
export function policeTarget(w: World, rid: Id, avg?: Map<Id, number>): number {
  const r = w.regions[rid];
  const s = w.govs[rid];
  const n = w.nations[r.owner];
  let p = B.police.base;
  // State police: spending per resident relative to the national average (30 points at average, up to 60).
  if (s && !r.occ) {
    const mean = avg?.get(n.id) ?? statePoliceAverage(w, n.id);
    if (mean > 0) p += Math.min(45, 18 * (s.policeSpend / Math.max(1, r.pop)) / mean);
  }
  p += Math.min(25, n.policeFunding * B.police.nationalPerShare); // national police
  if (!s) p += 10; // directly administered regions are policed by the national force
  for (const c of Object.values(w.citizens)) if (c.sec.police === rid && !jailed(w, c)) p += B.police.officer * (1 + c.sec.prank * 0.25);
  if (r.occ) p *= 0.5; // occupation disrupts policing
  return Math.max(5, Math.min(100, p));
}

export function statePoliceAverage(w: World, nation: Id): number {
  let spend = 0, pop = 0;
  for (const s of w.govs) if (s && w.regions[s.region].owner === nation) { spend += s.policeSpend; pop += w.regions[s.region].pop; }
  return pop ? spend / pop : 0;
}

export function crimeTarget(w: World, rid: Id): number {
  const r = w.regions[rid];
  const n = w.nations[r.owner];
  const hh = w.households[n.id];
  const urban = Math.min(1, Math.max(0, (Math.log10(EARTH.regions[rid].popReal) - 5.5) / 2));
  let t = B.crime.base + n.unemployment * B.crime.unemployment + urban * B.crime.urban;
  if (hh && hh.unmet > 0) t += B.crime.poverty * Math.min(1, hh.unmet / Math.max(1, (hh.wallet[n.cur] ?? 0) + hh.unmet));
  for (const s of Object.values(w.syndicates)) if (s.turf.includes(rid)) t += B.crime.syndicate * (s.strength / 50);
  t += Math.max(0, -w.econ.cycle) * B.crime.recession;
  t += r.unrest * 0.15;
  t -= (r.police - 30) * B.crime.policeFactor;
  const s = w.govs[rid];
  if (s) t -= s.budget.welfare * 8 + s.dev;
  return Math.max(2, Math.min(100, t));
}

// ---------- cases and justice ----------

function openCase(w: World, suspect: Citizen, kind: CrimeKind, rid: Id, evidence: number, loot: number): Case {
  const existing = Object.values(w.cases).find((c) => c.status === 'open' && c.suspect === suspect.id && c.kind === kind && c.region === rid);
  if (existing) { existing.evidence = Math.min(100, existing.evidence + evidence); existing.loot += loot; return existing; }
  const k: Case = { id: nid(w), suspect: suspect.id, kind, region: rid, nation: controller(w.regions[rid]), evidence: Math.min(100, evidence), opened: w.time, status: 'open', detective: null, loot, syndicate: suspect.sec.syndicate };
  w.cases[k.id] = k;
  if (suspect.player) notify(w, 'personal', `🚨 ${policeName(w, rid)} opened a ${CRIME_NAME[kind]} investigation. Evidence ${Math.round(k.evidence)}%.`, { link: 'crime' });
  return k;
}

/** Commit a crime: success, heat and the chance police notice (evidence). */
function attempt(w: World, c: Citizen, kind: CrimeKind, base: number, heat: number, extra = 0): { ok: boolean; detected: boolean } {
  const r = w.regions[c.loc];
  const skill = c.sec.srank * 0.03 + Math.min(0.15, c.sec.record.crimes * 0.01) + extra;
  const success = chance(w, Math.max(0.05, Math.min(0.95, base + skill - r.police / 300)));
  const detect = chance(w, Math.min(0.9, (success ? 0.15 : 0.55) + r.police / 250 - skill));
  c.sec.heat = Math.min(100, c.sec.heat + heat * (success ? 1 : 1.5));
  c.sec.record.crimes++;
  if (success) c.sec.notoriety += SEVERITY[kind];
  return { ok: success, detected: detect };
}

export function crimeCheck(w: World, c: Citizen, kind: keyof typeof CRIMES): string | null {
  const def = CRIMES[kind];
  if (jailed(w, c)) return 'You are in prison.';
  if (c.energy < def.energy) return `Needs ${def.energy} energy.`;
  const last = c.sec.last[kind] ?? -1e9;
  if (w.time - last < def.cd * HOUR) return `Lie low until ${hourOf(last + def.cd * HOUR)}:00 before doing that again.`;
  if (kind !== 'pickpocket' && !localTargets(w, c.loc).length) return 'No suitable business here.';
  return null;
}

const localTargets = (w: World, rid: Id) => Object.values(w.companies).filter((co) => co.region === rid && !(co.owner.k === 'nat'));

/** Petty and white-collar crime available to any citizen. */
export function commitCrime(w: World, c: Citizen, kind: keyof typeof CRIMES): Result {
  const why = crimeCheck(w, c, kind);
  if (why) return fail(why);
  const def = CRIMES[kind];
  const r = w.regions[c.loc];
  const nat = w.nations[controller(r)];
  c.energy -= def.energy;
  c.sec.last[kind] = w.time;
  const res = attempt(w, c, kind, def.base, def.heat, kind === 'fraud' ? c.eco / 100 : 0);
  let loot = 0;
  let msg = '';
  if (res.ok) {
    if (kind === 'pickpocket') {
      loot = Math.min(w.households[nat.id].wallet[nat.cur] ?? 0, cur(rand(w, 3, 12)));
      if (loot > 0) pay(w, hhref(nat.id), cref(c.id), nat.cur, loot, 'Pickpocketing');
      msg = `You lifted ${fmtAmt(nat.cur, loot)}.`;
    } else if (kind === 'burglary') {
      const co = pick(w, localTargets(w, c.loc));
      const key = Object.keys(co.inv).sort((a, b) => (co.inv[b] ?? 0) - (co.inv[a] ?? 0))[0];
      const n = key ? Math.min(co.inv[key] ?? 0, randInt(w, 3, 12)) : 0;
      if (n > 0 && moveItems(w, coref(co.id), cref(c.id), key, n)) { loot = n * 100; msg = `You took ${n} ${key} from ${co.name}.`; } else msg = `${co.name}'s warehouse was empty.`;
      if (co.owner.k === 'cit' && co.owner.id !== c.id) w.citizens[co.owner.id].rel[c.id] = Math.min(w.citizens[co.owner.id].rel[c.id] ?? 0, -10);
    } else {
      const co = pick(w, localTargets(w, c.loc));
      loot = Math.min(Math.floor((co.wallet[nat.cur] ?? 0) * rand(w, 0.02, 0.05)), cur(150));
      if (loot > 0) pay(w, coref(co.id), cref(c.id), nat.cur, loot, 'Fraud');
      msg = loot > 0 ? `You defrauded ${co.name} of ${fmtAmt(nat.cur, loot)}.` : `${co.name} had nothing worth taking.`;
    }
  } else msg = 'It went wrong — you got away with nothing.';
  if (res.detected) openCase(w, c, kind, c.loc, res.ok ? rand(w, 15, 35) : rand(w, 35, 60), loot);
  if (c.player) addXp(w, c, 2);
  return res.ok ? ok(`${msg}${res.detected ? ' Someone saw you — the police are investigating.' : ''}`) : fail(`${msg}${res.detected ? ' And you were seen.' : ''}`);
}

// ---------- syndicate membership and jobs ----------

export function joinSyndicateCheck(w: World, c: Citizen, sid: Id): string | null {
  const s = w.syndicates[sid];
  if (!s) return 'No such organisation.';
  if (c.sec.syndicate != null) return 'You already belong to an organisation.';
  if (c.sec.police != null) return 'Serving police officers cannot join.';
  if (c.level < B.syndicate.level) return `They don't take anyone below level ${B.syndicate.level}.`;
  if (!s.turf.includes(c.loc)) return `Go to their turf (${s.turf.slice(0, 3).map((r) => w.regions[r].name).join(', ')}…) to make contact.`;
  if (c.sec.notoriety < 3 && !c.flags[`syndInvite_${sid}`]) return 'They don’t know you. Build a reputation (notoriety 3+) or get an invitation.';
  return null;
}

export function joinSyndicate(w: World, c: Citizen, sid: Id): Result {
  const why = joinSyndicateCheck(w, c, sid);
  if (why) return fail(why);
  enlist(w, w.syndicates[sid], c, 0);
  return ok(`You are now an associate of ${w.syndicates[sid].name}.`);
}

export function leaveSyndicate(w: World, c: Citizen): Result {
  const s = c.sec.syndicate != null ? w.syndicates[c.sec.syndicate] : null;
  if (!s) return fail('You are not in an organisation.');
  removeMember(w, s, c);
  c.sec.heat = Math.min(100, c.sec.heat + 10);
  if (s.boss != null && !w.citizens[s.boss]?.player) w.citizens[s.boss].rel[c.id] = -40;
  return ok(`You walked away from ${s.name}. They won't forget it.`);
}

function removeMember(w: World, s: Syndicate, c: Citizen) {
  s.members = s.members.filter((m) => m !== c.id);
  c.sec.syndicate = null;
  c.sec.srank = 0;
  if (s.boss === c.id) s.boss = null;
}

export function jobCheck(w: World, c: Citizen, job: keyof typeof SYND_JOBS): string | null {
  const s = c.sec.syndicate != null ? w.syndicates[c.sec.syndicate] : null;
  const def = SYND_JOBS[job];
  if (!s) return 'Only members of an organisation get jobs.';
  if (jailed(w, c)) return 'You are in prison.';
  if (c.sec.srank < def.rank) return `Requires rank ${SRANKS[def.rank]}.`;
  if (!s.turf.includes(c.loc)) return `Jobs are on ${s.name}'s turf.`;
  if (c.energy < def.energy) return `Needs ${def.energy} energy.`;
  const last = c.sec.last[job] ?? -1e9;
  if (w.time - last < def.cd * HOUR) return 'Lie low a while first.';
  if (job === 'heist' && !localTargets(w, c.loc).length) return 'No target here.';
  return null;
}

export function syndicateJob(w: World, c: Citizen, job: keyof typeof SYND_JOBS): Result {
  const why = jobCheck(w, c, job);
  if (why) return fail(why);
  const s = w.syndicates[c.sec.syndicate!];
  const def = SYND_JOBS[job];
  const n = w.nations[s.nation];
  c.energy -= def.energy;
  c.sec.last[job] = w.time;
  const kind: CrimeKind = job === 'smuggle' ? 'smuggling' : job === 'collect' ? 'extortion' : 'heist';
  const res = attempt(w, c, kind, def.base, def.heat);
  let msg = 'The job went bad.';
  let loot = 0;
  if (res.ok) {
    if (job === 'smuggle') {
      loot = Math.min(s.wallet[n.cur] ?? 0, cur(rand(w, 15, 40)));
      if (loot > 0) pay(w, syndref(s.id), cref(c.id), n.cur, loot, `${s.name}: smuggling fee`);
      msg = `Delivered. ${s.name} paid you ${fmtAmt(n.cur, loot)}.`;
    } else if (job === 'collect') {
      const due = Object.entries(s.rackets).filter(([co]) => w.companies[Number(co)]);
      const take = due.reduce((t, [co, fee]) => t + Math.min(fee * 3, w.companies[Number(co)].wallet[n.cur] ?? 0), 0);
      loot = Math.floor(take * 0.3);
      for (const [co, fee] of due) { const amt = Math.min(fee * 3, w.companies[Number(co)].wallet[n.cur] ?? 0); if (amt > 0) pay(w, coref(Number(co)), syndref(s.id), n.cur, amt, `Protection (${s.name})`); }
      if (loot > 0) pay(w, syndref(s.id), cref(c.id), n.cur, loot, `${s.name}: your cut`);
      msg = `Collections done: your cut ${fmtAmt(n.cur, loot)}.`;
    } else {
      const co = pick(w, localTargets(w, c.loc));
      const cash = co.wallet[n.cur] ?? 0;
      loot = Math.floor(cash * rand(w, 0.1, 0.25));
      if (loot > 0) pay(w, coref(co.id), cref(c.id), n.cur, loot, 'Heist');
      const tithe = Math.floor(loot * 0.4);
      if (tithe > 0) pay(w, cref(c.id), syndref(s.id), n.cur, tithe, `${s.name}: tribute`);
      msg = `Heist on ${co.name}: ${fmtAmt(n.cur, loot)} (${fmtAmt(n.cur, tithe)} to ${s.name}).`;
      record(w, 'crime', `💰 Armed robbery at ${co.name} in ${w.regions[c.loc].name}.`, { region: c.loc, nation: s.nation });
    }
    c.flags.syndRep = (c.flags.syndRep ?? 0) + SEVERITY[kind];
    promote(w, s, c);
  }
  if (res.detected) openCase(w, c, kind, c.loc, res.ok ? rand(w, 15, 35) : rand(w, 35, 60), loot);
  if (c.player) addXp(w, c, 3);
  return res.ok ? ok(msg + (res.detected ? ' The police are on to it.' : '')) : fail(msg + (res.detected ? ' And the police know.' : ''));
}

function promote(w: World, s: Syndicate, c: Citizen) {
  const rep = c.flags.syndRep ?? 0;
  const next = [0, 8, 25, 60][c.sec.srank + 1];
  if (c.sec.srank < 3 && next != null && rep >= next) {
    c.sec.srank++;
    if (c.player) notify(w, 'progress', `🎩 ${s.name} made you ${SRANKS[c.sec.srank]}.`, { link: 'crime' });
  }
}

// ---------- police service ----------

export function joinPoliceCheck(w: World, c: Citizen): string | null {
  const r = w.regions[c.loc];
  if (c.sec.police != null) return 'You already serve.';
  if (c.sec.syndicate != null) return 'Known associates of organised crime are not hired.';
  if (c.sec.record.convictions > 0) return 'A criminal conviction bars you from the police.';
  if (c.nation !== r.owner || r.occ) return `Only ${w.nations[r.owner].adj} citizens can join the ${policeName(w, r.id)}.`;
  if (c.level < B.police.level) return `Requires level ${B.police.level}.`;
  if (!c.player && (w.nations[c.nation].president === c.id || Object.values(w.nations[c.nation].cabinet).includes(c.id))) return 'Serving politicians do not join.';
  if (jailed(w, c)) return 'You are in prison.';
  return null;
}

export function joinPolice(w: World, c: Citizen): Result {
  const why = joinPoliceCheck(w, c);
  if (why) return fail(why);
  c.sec.police = c.loc;
  c.sec.prank = 0;
  return ok(`Sworn in as an officer of the ${policeName(w, c.loc)}. Patrol daily; arrests earn promotion.`);
}

export function leavePolice(w: World, c: Citizen): Result {
  if (c.sec.police == null) return fail('You are not a police officer.');
  c.sec.police = null;
  c.sec.prank = 0;
  return ok('You handed in your badge.');
}

export function patrolCheck(w: World, c: Citizen): string | null {
  if (c.sec.police == null) return 'Join the police first.';
  if (c.loc !== c.sec.police) return `You serve in ${w.regions[c.sec.police].name}; go there to patrol.`;
  if (jailed(w, c)) return 'You are in prison.';
  if (c.energy < B.police.patrolEnergy) return `Needs ${B.police.patrolEnergy} energy.`;
  if (w.time - (c.sec.last.patrol ?? -1e9) < B.police.patrolCd * HOUR) return 'You already patrolled today.';
  return null;
}

/** A patrol lowers crime, advances local cases, and may catch someone. */
export function patrol(w: World, c: Citizen): Result {
  const why = patrolCheck(w, c);
  if (why) return fail(why);
  const r = w.regions[c.loc];
  c.energy -= B.police.patrolEnergy;
  c.sec.last.patrol = w.time;
  r.crime = Math.max(0, r.crime - rand(w, 0.5, 2) * (1 + c.sec.prank * 0.2));
  const local = Object.values(w.cases).filter((k) => k.status === 'open' && k.region === r.id && k.suspect !== c.id);
  const parts: string[] = ['Patrol done'];
  if (local.length) {
    const k = pick(w, local);
    k.evidence = Math.min(100, k.evidence + rand(w, 5, 12) * (1 + c.sec.prank * 0.2));
    parts.push(`evidence in a ${CRIME_NAME[k.kind]} case rose to ${Math.round(k.evidence)}%`);
    if (k.evidence >= B.police.arrestAt && tryArrest(w, k, c)) parts.push(`you arrested ${w.citizens[k.suspect].name}`);
  }
  // Catch someone in the act.
  const crooks = Object.values(w.citizens).filter((x) => x.loc === r.id && x.sec.syndicate != null && !x.player && !jailed(w, x) && x.id !== c.id);
  if (crooks.length && chance(w, 0.15 + c.sec.prank * 0.05)) {
    const x = pick(w, crooks);
    openCase(w, x, 'extortion', r.id, rand(w, 30, 50), 0);
    parts.push(`you caught ${x.name} (${w.syndicates[x.sec.syndicate!]?.name ?? 'a gang'}) shaking down a shop`);
  }
  if (c.player) addXp(w, c, 2);
  return ok(parts.join('; ') + '.');
}

export function investigateCheck(w: World, c: Citizen, caseId: Id): string | null {
  const k = w.cases[caseId];
  if (c.sec.police == null || c.sec.prank < 2) return 'Only detectives (rank 2+) investigate cases.';
  if (!k || k.status !== 'open') return 'No open case.';
  if (k.suspect === c.id) return 'You cannot investigate yourself.';
  if (w.regions[k.region].owner !== w.regions[c.sec.police].owner) return 'Outside your jurisdiction.';
  if (c.energy < 15) return 'Needs 15 energy.';
  return null;
}

export function investigate(w: World, c: Citizen, caseId: Id): Result {
  const why = investigateCheck(w, c, caseId);
  if (why) return fail(why);
  const k = w.cases[caseId];
  c.energy -= 15;
  k.detective = c.id;
  k.evidence = Math.min(100, k.evidence + rand(w, 10, 20));
  const arrested = k.evidence >= B.police.arrestAt && tryArrest(w, k, c);
  return ok(`Evidence now ${Math.round(k.evidence)}%.${arrested ? ` ${w.citizens[k.suspect].name} is under arrest.` : ''}`);
}

/** Arrest if the suspect is on territory the investigating nation controls. */
function tryArrest(w: World, k: Case, by: Citizen | null): boolean {
  const s = w.citizens[k.suspect];
  if (!s || jailed(w, s) || controller(w.regions[s.loc]) !== k.nation) return false;
  s.sec.record.arrests++;
  if (by) {
    by.sec.collars++;
    const next = B.police.rankAt[by.sec.prank + 1];
    if (next != null && by.sec.collars >= next) { by.sec.prank++; if (by.player) notify(w, 'progress', `👮 Promoted to ${PRANKS[by.sec.prank]}.`, { link: 'crime' }); }
    if (by.player) notify(w, 'progress', `👮 You arrested ${s.name} for ${CRIME_NAME[k.kind]}.`, { link: 'crime' });
  }
  if (s.player) {
    sendMsg(w, {
      from: by?.id ?? null, subject: `🚔 Arrested for ${CRIME_NAME[k.kind]}`, kind: 'gov',
      body: `Officers of the ${policeName(w, k.region)} have arrested you. Evidence against you: ${Math.round(k.evidence)}%. Trial tomorrow. A lawyer costs ${B.justice.lawyer} ${w.nations[k.nation].cur} and cuts the conviction risk; a bribe might make it go away — or make it much worse.`,
      options: [{ id: 'comply', label: 'Stand trial' }, { id: 'lawyer', label: `Hire a lawyer (${B.justice.lawyer})` }, { id: 'bribe', label: `Bribe the officers (${B.justice.bribeBase})` }],
      payload: { handler: 'arrest', case: k.id },
    });
    notify(w, 'personal', `🚔 You have been arrested (${CRIME_NAME[k.kind]}). Decide in your inbox.`, { critical: true, link: 'inbox' });
    s.flags.pendingTrial = k.id;
    s.flags.trialAt = w.time + DAY;
    return true;
  }
  // AI suspects: greedy ones with cash try to bribe weak police.
  const cash = s.wallet[w.nations[k.nation].cur] ?? 0;
  if (s.traits.greed > 0.6 && cash > cur(B.justice.bribeBase * 2) && chance(w, 0.5)) {
    if (bribeAttempt(w, s, k)) return true;
  }
  trial(w, k, cash > cur(B.justice.lawyer * 3));
  return true;
}

function bribeAttempt(w: World, s: Citizen, k: Case): boolean {
  const code = w.nations[k.nation].cur;
  const r = w.regions[k.region];
  const amount = cur(B.justice.bribeBase) * (1 + SEVERITY[k.kind] / 2);
  if ((s.wallet[code] ?? 0) < amount) return false;
  const corrupt = Math.max(0.1, 0.55 - r.police / 200);
  if (chance(w, corrupt)) {
    pay(w, cref(s.id), hhref(k.nation), code, amount, 'Bribe');
    k.status = 'closed';
    k.outcome = 'dropped (bribe)';
    s.flags.pendingTrial = 0;
    s.sec.record.crimes++;
    if (s.player) notify(w, 'personal', `💵 The officers took your ${fmtAmt(code, amount)} and lost the paperwork.`);
    return true;
  }
  // Failed bribe: new corruption charge and a stronger case.
  k.evidence = Math.min(100, k.evidence + 20);
  openCase(w, s, 'bribery', k.region, 80, amount);
  if (s.player) notify(w, 'personal', '💥 The bribe was refused — and added to the charges.');
  return false;
}

/** Trial: conviction chance follows the evidence; a lawyer lowers it. */
export function trial(w: World, k: Case, lawyer: boolean) {
  const s = w.citizens[k.suspect];
  const n = w.nations[k.nation];
  const code = n.cur;
  if (lawyer) { const fee = cur(B.justice.lawyer); if (!pay(w, cref(s.id), hhref(n.id), code, fee, 'Lawyer')) lawyer = false; }
  const p = (k.evidence / 100) * (lawyer ? 0.75 : 1);
  k.status = 'closed';
  s.flags.pendingTrial = 0;
  if (!chance(w, p)) {
    k.outcome = 'acquitted';
    s.sec.heat = Math.max(0, s.sec.heat - 20);
    if (s.player) notify(w, 'personal', `⚖️ Acquitted of ${CRIME_NAME[k.kind]}. You walk free.`, { link: 'crime' });
    else if (w.regions[k.region].owner === player(w).nation && SEVERITY[k.kind] >= 3) record(w, 'justice', `⚖️ ${s.name} was acquitted of ${CRIME_NAME[k.kind]} in ${w.regions[k.region].name}.`, { region: k.region, nation: k.nation });
    return;
  }
  const sev = SEVERITY[k.kind];
  const fine = Math.max(cur(20), k.loot * B.justice.finePerLoot);
  const paid = Math.min(fine, s.wallet[code] ?? 0);
  const gov = w.govs[k.region];
  if (paid > 0) pay(w, cref(s.id), gov && !w.regions[k.region].occ && gov.cur === code ? regref(k.region) : natref(n.id), code, paid, 'Court fine');
  const days = Math.ceil(sev * B.justice.jailDaysPerSeverity * (1 + s.sec.record.convictions * 0.3) + (paid < fine ? 1 : 0));
  s.sec.jailUntil = w.time + days * DAY;
  s.sec.record.convictions++;
  s.sec.record.fines += paid;
  s.sec.heat = 0;
  k.outcome = `convicted: ${fmtAmt(code, paid)} fine, ${days} day${days > 1 ? 's' : ''} in prison`;
  if (s.sec.police != null) s.sec.police = null; // dismissed
  if (s.player) {
    notify(w, 'personal', `⚖️ Convicted of ${CRIME_NAME[k.kind]}: ${k.outcome}.`, { critical: true, link: 'crime' });
    record(w, 'justice', `⚖️ ${s.name} was convicted of ${CRIME_NAME[k.kind]} (${k.outcome}).`, { cit: s.id, player: true, important: true });
  } else if (sev >= 3 || s.influence > 30) record(w, 'justice', `⚖️ ${s.name} was convicted of ${CRIME_NAME[k.kind]} in ${w.regions[k.region].name} (${k.outcome}).`, { region: k.region, nation: k.nation, cit: s.id });
  s.influence = Math.max(0, s.influence - sev * 3);
}

/** Reply to an arrest (player). */
export function replyArrest(w: World, caseId: Id, option: string): Result {
  const k = w.cases[caseId];
  const p = player(w);
  if (!k || k.status !== 'open') return ok('The matter is closed.');
  if (option === 'bribe') {
    if (bribeAttempt(w, p, k)) return ok('Case dropped.');
    trial(w, k, false);
    return ok(`Bribe failed. Trial: ${k.outcome}.`);
  }
  trial(w, k, option === 'lawyer');
  return ok(`Verdict: ${k.outcome}.`);
}

// ---------- national police powers (Minister of the Interior / leader) ----------

export function raidCheck(w: World, actor: Id, sid: Id): string | null {
  const s = w.syndicates[sid];
  const c = w.citizens[actor];
  if (!s) return 'Unknown organisation.';
  if (!nationPerm(w, actor, s.nation, 'police')) return 'Only the Minister of the Interior or national leader orders raids.';
  if (c.flags.lastRaid && w.time - c.flags.lastRaid < 3 * DAY) return 'Raids need planning: one every 3 days.';
  const cost = cur(100);
  if ((w.nations[s.nation].wallet[w.nations[s.nation].cur] ?? 0) < cost) return 'The treasury cannot fund a raid (100).';
  return null;
}

export function orderRaid(w: World, actor: Id, sid: Id): Result {
  const why = raidCheck(w, actor, sid);
  if (why) return fail(why);
  const s = w.syndicates[sid];
  const n = w.nations[s.nation];
  pay(w, natref(n.id), hhref(n.id), n.cur, cur(100), 'Police raid operation');
  w.citizens[actor].flags.lastRaid = w.time;
  return ok(raid(w, s, 1.3));
}

function raid(w: World, s: Syndicate, force: number): string {
  const n = w.nations[s.nation];
  const seize = Math.floor((s.wallet[n.cur] ?? 0) * 0.3 * force);
  const home = w.govs[s.home];
  if (seize > 0) pay(w, syndref(s.id), home && home.cur === n.cur ? regref(s.home) : natref(n.id), n.cur, seize, 'Seized criminal assets');
  s.strength = Math.max(0, s.strength - 15 * force);
  const members = s.members.map((m) => w.citizens[m]).filter((c) => c && !jailed(w, c));
  const caught = members.filter(() => chance(w, 0.35 * force)).slice(0, 3);
  for (const c of caught) { const k = openCase(w, c, 'extortion', s.home, 75, 0); tryArrest(w, k, null); }
  const text = `🚓 Police raided ${s.name} in ${w.regions[s.home].name}: ${fmtAmt(n.cur, seize)} seized, ${caught.length} arrested.`;
  record(w, 'crime', text, { nation: n.id, region: s.home, important: caught.some((c) => c.player) });
  return text;
}

export function setPoliceFunding(w: World, actor: Id, nation: Id, share: number): Result {
  if (!nationPerm(w, actor, nation, 'police')) return fail('Only the Minister of the Interior or national leader sets police funding.');
  if (!(share >= 0 && share <= 0.15)) return fail('Between 0% and 15% of daily revenue.');
  w.nations[nation].policeFunding = share;
  return ok(`National police funding set to ${Math.round(share * 100)}% of daily revenue.`);
}

// ---------- daily and hourly running ----------

export function crimeDaily(w: World) {
  const p = player(w);
  // National police spending (the transfer is the money; strength follows in policeTarget).
  for (const n of w.nations) {
    if (n.exile) continue;
    const amt = Math.min(Math.floor((n.stats.revHist[n.stats.revHist.length - 1] ?? 0) * n.policeFunding), Math.floor((n.wallet[n.cur] ?? 0) * 0.05));
    if (amt > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, amt, 'National police')) n.stats.spendToday += amt;
  }
  const avg = new Map(w.nations.map((n) => [n.id, statePoliceAverage(w, n.id)]));
  for (const r of w.regions) {
    r.police += (policeTarget(w, r.id, avg) - r.police) * 0.25;
    r.crime += (crimeTarget(w, r.id) - r.crime) * B.crime.drift + rand(w, -1, 1);
    r.crime = Math.max(0, Math.min(100, r.crime));
    const s = w.govs[r.id];
    if (s && r.crime > 40) s.approval = Math.max(5, s.approval - (r.crime - 40) * B.crime.approvalHit);
  }
  syndicatesDaily(w);
  // Cases: evidence builds with policing and suspects' heat; old weak cases go cold.
  for (const k of Object.values(w.cases)) {
    if (k.status !== 'open') continue;
    const s = w.citizens[k.suspect];
    if (!s) { k.status = 'closed'; k.outcome = 'suspect gone'; continue; }
    if (s.flags.pendingTrial === k.id) {
      if (w.time >= (s.flags.trialAt ?? 0)) trial(w, k, false); // no reply: trial goes ahead
      continue;
    }
    const r = w.regions[k.region];
    k.evidence = Math.min(100, k.evidence + B.police.evidencePerDay * (r.police / 50) + s.sec.heat / 25 - (k.detective ? 0 : 0.5));
    if (k.evidence >= B.police.arrestAt) {
      const officers = Object.values(w.citizens).filter((c) => c.sec.police != null && w.regions[c.sec.police].owner === k.nation && !c.player && !jailed(w, c));
      tryArrest(w, k, officers.length ? pick(w, officers) : null);
    } else if (w.time - k.opened > B.justice.coldAfterDays * DAY && k.evidence < 40) { k.status = 'closed'; k.outcome = 'went cold'; }
  }
  for (const c of Object.values(w.citizens)) {
    c.sec.heat = Math.max(0, c.sec.heat - B.justice.heatDecay);
    if (c.sec.jailUntil && c.sec.jailUntil <= w.time) {
      c.sec.jailUntil = 0;
      if (c.player) notify(w, 'personal', '🔓 You have been released from prison.', { link: 'crime' });
    }
  }
  // Tidy closed cases (keep the last 400).
  const closed = Object.values(w.cases).filter((k) => k.status === 'closed').sort((a, b) => a.id - b.id);
  for (const k of closed.slice(0, Math.max(0, closed.length - 400))) delete w.cases[k.id];
  if (dayOf(w.time) % 7 === 0 && w.regions[p.loc].crime > 60) notify(w, 'personal', `⚠️ Crime in ${w.regions[p.loc].name} is high (${Math.round(w.regions[p.loc].crime)}).`);
}

function syndicatesDaily(w: World) {
  const p = player(w);
  for (const s of Object.values(w.syndicates).sort((a, b) => a.id - b.id)) {
    const n = w.nations[s.nation];
    const code = n.cur;
    let income = 0;
    s.members = s.members.filter((m) => w.citizens[m] && w.citizens[m].sec.syndicate === s.id);
    // Succession.
    if (s.boss == null || !w.citizens[s.boss] || jailed(w, w.citizens[s.boss])) {
      const heir = s.members.map((m) => w.citizens[m]).filter((c) => !jailed(w, c)).sort((a, b) => b.sec.srank - a.sec.srank || (b.flags.syndRep ?? 0) - (a.flags.syndRep ?? 0) || a.id - b.id)[0];
      if (heir && s.boss !== heir.id) {
        if (s.boss != null && w.citizens[s.boss]) w.citizens[s.boss].sec.srank = Math.min(3, w.citizens[s.boss].sec.srank);
        s.boss = heir.id; heir.sec.srank = 4;
        if (heir.player) notify(w, 'progress', `👑 You now run ${s.name}.`, { link: 'crime' });
        if (s.nation === p.nation) record(w, 'crime', `👑 ${heir.name} took over ${s.name}.`, { nation: s.nation });
      }
    }
    // Skimming the local economy on its turf.
    for (const rid of s.turf) {
      const r = w.regions[rid];
      if (r.owner !== s.nation) continue;
      const share = (w.households[n.id].wallet[code] ?? 0) * (r.pop / Math.max(1, w.households[n.id].pop));
      const take = Math.floor(share * B.crime.theftShare * (r.crime / 100) * (s.strength / 50));
      if (take > 0 && pay(w, hhref(n.id), syndref(s.id), code, take, 'Organised crime')) income += take;
    }
    // Protection rackets.
    for (const [cid, fee] of Object.entries(s.rackets)) {
      const co = w.companies[Number(cid)];
      if (!co || !s.turf.includes(co.region)) { delete s.rackets[Number(cid)]; continue; }
      if (co.owner.k === 'cit' && w.citizens[co.owner.id]?.player) continue; // the player pays through the inbox
      if (pay(w, coref(co.id), syndref(s.id), code, Math.min(fee, co.wallet[code] ?? 0), `Protection (${s.name})`)) income += Math.min(fee, co.wallet[code] ?? 0);
    }
    if (chance(w, 0.35)) pickRacket(w, s);
    // Pay the crew.
    const payout = Math.floor(income * B.syndicate.payoutShare);
    const crew = s.members.map((m) => w.citizens[m]).filter((c) => c && !jailed(w, c));
    const weight = crew.reduce((t, c) => t + 1 + c.sec.srank, 0) || 1;
    for (const c of crew) { const cut = Math.floor((payout * (1 + c.sec.srank)) / weight); if (cut > 0) pay(w, syndref(s.id), cref(c.id), code, cut, `${s.name}: cut`); }
    s.income.push(income);
    if (s.income.length > 30) s.income.shift();
    // Strength: people, money and turf.
    const cash = (s.wallet[code] ?? 0) / 100;
    s.strength = Math.max(0, Math.min(100, s.strength * 0.9 + (crew.length * 5 + Math.sqrt(cash) + s.turf.length * 2) * 0.1));
    // Recruitment of disaffected citizens.
    for (const c of Object.values(w.citizens)) {
      if (c.player || c.nation !== s.nation || c.sec.syndicate != null || c.sec.police != null || c.sec.agency != null || !s.turf.includes(c.loc)) continue;
      const pull = (c.job == null ? 0.5 : 0) + (c.mood < 0 ? 0.3 : 0) + c.traits.greed * 0.4 + c.traits.risk * 0.3 - c.traits.loyalty * 0.3;
      if (pull > 0.7 && chance(w, B.syndicate.joinChance)) { enlist(w, s, c, 0); if (c.nation === p.nation && c.rel[p.id] && c.rel[p.id] > 20) notify(w, 'personal', `🎩 Your acquaintance ${c.name} has fallen in with ${s.name}.`); }
    }
    // Invite the player if they're notorious and on turf.
    if (!p.sec.syndicate && p.sec.police == null && s.turf.includes(p.loc) && p.sec.notoriety >= 3 && !p.flags[`syndInvite_${s.id}`] && chance(w, 0.25)) {
      p.flags[`syndInvite_${s.id}`] = w.time;
      sendMsg(w, { from: s.boss, subject: `${s.name} has noticed you`, kind: 'npc', body: `Word gets around, ${p.name}. People like you do well with ${s.name} (${s.style}). Associates get jobs, protection and a cut. Or you can walk away — nobody's forcing anything.`, options: [{ id: 'join', label: 'Join them' }, { id: 'decline', label: 'Decline' }, { id: 'report', label: 'Report them to the police' }], payload: { handler: 'syndInvite', synd: s.id } });
    }
    // Expansion into a weakly policed neighbour.
    if (chance(w, B.syndicate.expandChance) && s.strength > 30) {
      const edge = [...new Set(s.turf.flatMap((t) => w.regions[t].links))].filter((l) => !s.turf.includes(l) && w.regions[l].owner === s.nation && w.regions[l].police < s.strength);
      if (edge.length) {
        const to = pick(w, edge);
        s.turf.push(to);
        const rivals = Object.values(w.syndicates).filter((x) => x.id !== s.id && x.turf.includes(to));
        for (const x of rivals) if (!s.feuds.includes(x.id)) { s.feuds.push(x.id); x.feuds.push(s.id); if (s.nation === p.nation || x.nation === p.nation) record(w, 'crime', `🔫 Gang war: ${s.name} moved into ${w.regions[to].name}, ${x.name}'s territory.`, { region: to, nation: s.nation, important: true }); }
      }
    }
    // Feuds: violence on shared turf.
    for (const fid of s.feuds) {
      const x = w.syndicates[fid];
      if (!x || x.id < s.id) continue;
      const shared = s.turf.filter((t) => x.turf.includes(t));
      if (!shared.length) { s.feuds = s.feuds.filter((f) => f !== fid); x.feuds = x.feuds.filter((f) => f !== s.id); continue; }
      const rid = pick(w, shared);
      const r = w.regions[rid];
      r.crime = Math.min(100, r.crime + 4); r.unrest = Math.min(100, r.unrest + 3);
      const [win, lose] = s.strength * rand(w, 0.7, 1.3) > x.strength * rand(w, 0.7, 1.3) ? [s, x] : [x, s];
      lose.strength = Math.max(0, lose.strength - 6); win.strength = Math.max(0, win.strength - 2);
      if (lose.strength < 15 || chance(w, 0.1)) { lose.turf = lose.turf.filter((t) => t !== rid); if (lose.nation === p.nation) record(w, 'crime', `🔫 ${win.name} drove ${lose.name} out of ${r.name}.`, { region: rid, nation: lose.nation }); }
    }
    // Police pressure: raids where the police outgun the syndicate.
    const hot = s.turf.filter((t) => w.regions[t].police > s.strength * B.syndicate.raidAt + 20);
    if (hot.length && chance(w, 0.03 * hot.length)) raid(w, s, 1);
    // Collapse.
    if (!s.members.length && s.strength < 5) {
      const left = s.wallet[code] ?? 0;
      if (left > 0) pay(w, syndref(s.id), hhref(n.id), code, left, 'Syndicate dissolved');
      if (s.nation === p.nation) record(w, 'crime', `🕊️ ${s.name} has collapsed.`, { nation: s.nation });
      for (const x of Object.values(w.syndicates)) x.feuds = x.feuds.filter((f) => f !== s.id);
      delete w.syndicates[s.id];
    }
  }
  // New organisations rise in lawless places.
  for (const r of w.regions) {
    if (r.crime < 55 || Object.values(w.syndicates).some((s) => s.turf.includes(r.id)) || !chance(w, 0.01)) continue;
    const s = foundSyndicate(w, r.owner, r.id, null);
    const n = w.nations[r.owner];
    if ((w.households[n.id].wallet[n.cur] ?? 0) > cur(100)) pay(w, hhref(n.id), syndref(s.id), n.cur, cur(50), 'Organised crime');
    if (r.owner === player(w).nation) record(w, 'crime', `🎩 A new ${s.style}, ${s.name}, has emerged in ${r.name}.`, { region: r.id, nation: r.owner, important: true });
  }
}

/** Syndicates demand protection from a company on their turf. */
function pickRacket(w: World, s: Syndicate) {
  const n = w.nations[s.nation];
  const cands = Object.values(w.companies).filter((co) => s.turf.includes(co.region) && co.owner.k !== 'nat' && s.rackets[co.id] == null && !co.state);
  if (!cands.length) return;
  const co = weighted(w, cands, (x) => (x.wallet[n.cur] ?? 0) + 1)!;
  const fee = Math.max(cur(2), Math.floor((co.wallet[n.cur] ?? 0) * B.syndicate.racketFee));
  const owner = co.owner.k === 'cit' ? w.citizens[co.owner.id] : null;
  if (owner?.player) {
    if (w.inbox.some((m) => m.payload?.handler === 'extortion' && m.payload.co === co.id && !m.resolved)) return;
    sendMsg(w, { from: s.boss, subject: `${s.name}: a word about ${co.name}`, kind: 'npc', body: `Nice business you have in ${w.regions[co.region].name}. Accidents happen to businesses without friends. ${fmtAmt(n.cur, fee)} a day keeps you among friends.`, options: [{ id: 'pay', label: `Pay ${fmtAmt(n.cur, fee)}/day` }, { id: 'refuse', label: 'Refuse' }, { id: 'report', label: 'Go to the police' }], payload: { handler: 'extortion', synd: s.id, co: co.id, fee } });
    return;
  }
  // AI owners: most pay; brave or well-policed ones refuse and report.
  const r = w.regions[co.region];
  if (owner && (owner.traits.risk > 0.75 || r.police > s.strength * 1.3) && chance(w, 0.5)) {
    const boss = s.boss != null ? w.citizens[s.boss] : null;
    if (boss) openCase(w, boss, 'extortion', co.region, 25, fee * 10);
    vandalise(w, co, s);
  } else s.rackets[co.id] = fee;
}

function vandalise(w: World, co: World['companies'][number], s: Syndicate) {
  co.halt = { until: w.time + DAY, why: `Vandalised by ${s.name}` };
  w.regions[co.region].crime = Math.min(100, w.regions[co.region].crime + 1);
}

/** Replies: extortion of the player's company, syndicate invitations. */
export function replyExtortion(w: World, payload: Record<string, any>, option: string): Result {
  const s = w.syndicates[payload.synd];
  const co = w.companies[payload.co];
  if (!s || !co) return ok('It no longer matters.');
  const p = player(w);
  if (option === 'pay') {
    s.rackets[co.id] = payload.fee;
    // Player-paid rackets are collected here daily via their company wallet.
    p.flags[`racket_${co.id}`] = s.id;
    return ok(`${co.name} pays ${s.name} ${fmtAmt(w.nations[s.nation].cur, payload.fee)} a day. They'll leave it alone.`);
  }
  if (option === 'report') {
    const boss = s.boss != null ? w.citizens[s.boss] : null;
    if (boss) openCase(w, boss, 'extortion', co.region, 45, payload.fee * 10);
    w.regions[co.region].police = Math.min(100, w.regions[co.region].police + 3);
    p.sec.fame += 1;
  }
  vandalise(w, co, s);
  if (s.boss != null && w.citizens[s.boss]) w.citizens[s.boss].rel[p.id] = -50;
  return ok(option === 'report' ? `You reported ${s.name}. Police opened a case — and ${co.name} was vandalised overnight.` : `${co.name} was vandalised overnight.`);
}

export function replySyndInvite(w: World, payload: Record<string, any>, option: string): Result {
  const s = w.syndicates[payload.synd];
  const p = player(w);
  if (!s) return ok('They are gone.');
  if (option === 'join') {
    if (p.sec.syndicate != null) return fail('You already belong to an organisation.');
    enlist(w, s, p, 0);
    return ok(`You are now an associate of ${s.name}. Jobs are on the Law & Order screen.`);
  }
  if (option === 'report') {
    const boss = s.boss != null ? w.citizens[s.boss] : null;
    if (boss) openCase(w, boss, 'extortion', s.home, 30, 0);
    p.sec.fame += 1;
    if (boss) boss.rel[p.id] = -60;
    return ok('You told the police what you know.');
  }
  return ok('You declined.');
}

/** Protection the player agreed to pay is taken daily from their company. */
export function playerRackets(w: World) {
  const p = player(w);
  for (const [k, sid] of Object.entries(p.flags)) {
    if (!k.startsWith('racket_')) continue;
    const co = w.companies[Number(k.slice(7))];
    const s = w.syndicates[sid];
    if (!co || !s || co.owner.k !== 'cit' || co.owner.id !== p.id || !s.turf.includes(co.region)) { delete p.flags[k]; continue; }
    const code = w.nations[s.nation].cur;
    const fee = s.rackets[co.id] ?? 0;
    if (fee > 0 && !pay(w, coref(co.id), syndref(s.id), code, Math.min(fee, co.wallet[code] ?? 0), `Protection (${s.name})`)) vandalise(w, co, s);
  }
}

/** Hourly: some AI citizens commit crimes or work syndicate jobs; officers patrol. */
export function crimeHourly(w: World) {
  const h = hourOf(w.time);
  for (const c of Object.values(w.citizens)) {
    if (c.player || jailed(w, c)) continue;
    if (c.sec.police != null && h === (c.workHour + 2) % 24) { if (!patrolCheck(w, c)) patrol(w, c); continue; }
    if ((c.id + h) % 24 !== 0) continue; // each citizen considers crime once a day
    if (c.sec.syndicate != null) {
      const jobs = (['heist', 'collect', 'smuggle'] as const).filter((j) => !jobCheck(w, c, j));
      if (jobs.length && chance(w, 0.35)) syndicateJob(w, c, jobs[0]);
      continue;
    }
    const desperate = c.job == null && (c.wallet[w.nations[c.nation].cur] ?? 0) < cur(20);
    const propensity = c.traits.greed * 0.5 + c.traits.risk * 0.3 + (desperate ? 0.4 : 0) + (c.mood < -0.3 ? 0.15 : 0) - c.traits.loyalty * 0.3 - (c.persona === 'politician' ? 0.2 : 0);
    if (propensity > 0.55 && chance(w, 0.035 + w.regions[c.loc].crime / 2000)) {
      const kind = (['fraud', 'burglary', 'pickpocket'] as const).find((k) => !crimeCheck(w, c, k) && (k !== 'fraud' || c.eco > 5));
      if (kind) commitCrime(w, c, kind);
    }
  }
}

/** AI citizens drawn to police work join the local force. */
export function policeRecruitment(w: World) {
  for (const c of Object.values(w.citizens)) {
    if (c.player || c.sec.police != null || (c.id + dayOf(w.time)) % 30 !== 0) continue;
    const fit = (c.persona === 'soldier' ? 0.3 : 0) + c.traits.loyalty * 0.5 + (c.job == null ? 0.2 : 0) - c.traits.greed * 0.3;
    if (fit > 0.45 && !joinPoliceCheck(w, c)) joinPolice(w, c);
  }
}

export const crimeLabel = (v: number) => (v < 20 ? 'low' : v < 40 ? 'moderate' : v < 60 ? 'high' : v < 80 ? 'very high' : 'lawless');
export { CRIME_NAME, SEVERITY };
