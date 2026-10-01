// Intelligence services and espionage.
//
// Every nation runs its real-world service (CIA, MI6, BND, SVR, MSS, R&AW, …).
// Its budget (a share of daily revenue) builds spy networks inside foreign
// countries and counter-intelligence at home. Operations need network depth and
// money and take hours to play out: gather intelligence (dossiers), sabotage
// industry, steal from treasuries, stir unrest, run propaganda, dig up scandals
// on politicians, recruit foreign citizens as assets, or sweep for enemy agents.
// Exposure causes diplomatic incidents and arrests. Citizens (AI and player) can
// join their service and climb from analyst to deputy director, and foreign
// services try to turn well-placed citizens into double agents.
import { lifeGate } from './lifecycle';
import { ageOf, repNeed, seniority, standing } from './growth';
import type { Citizen, Id, OpKind, SpyOp, World } from './types';
import { census, nationals } from './census';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { DAY, HOUR, dayOf } from '../engine/clock';
import { nid, notify, record, schedule, sendMsg } from '../engine/events';
import { chance, pick } from '../engine/rng';
import { controller, cref, hhref, jailed, natref, player } from './query';
import { nationPerm } from './authority';
import { relation } from './congress';
import { visible } from './forces';
import { refresh } from './beliefs';
import { MOTIVE_LABEL, coverFactor, motiveFor, placementOf } from './collection';
import { capsOf } from './strategic';
import { OP_DIR, dirEdge, dirOfAgent, dirStrength, noteLesson } from './intelOrg';

export const OPS: Record<OpKind, { name: string; desc: string; needs: 'region' | 'subject' | 'formation' | null; rank: number; relation: number }> = {
  intel: { name: 'Gather intelligence', desc: 'Compile a dossier: treasury, forces, warheads, organised crime, leadership.', needs: null, rank: 1, relation: -4 },
  sabotage: { name: 'Industrial sabotage', desc: 'Halt factories and damage infrastructure in a region.', needs: 'region', rank: 2, relation: -15 },
  theft: { name: 'Treasury theft', desc: 'Siphon money from the target treasury.', needs: null, rank: 2, relation: -15 },
  unrest: { name: 'Incite unrest', desc: 'Fund agitators: unrest, crime and a hit to the regional government.', needs: 'region', rank: 2, relation: -12 },
  propaganda: { name: 'Propaganda campaign', desc: 'Undermine public approval of the target government.', needs: null, rank: 1, relation: -6 },
  scandal: { name: 'Plant a scandal', desc: 'Leak compromising material about a politician.', needs: 'subject', rank: 2, relation: -12 },
  recruit: { name: 'Recruit an asset', desc: 'Turn a foreign citizen: a lasting boost to your network.', needs: 'subject', rank: 1, relation: -8 },
  counter: { name: 'Counter-intelligence sweep', desc: 'Hunt foreign agents and assets at home.', needs: null, rank: 1, relation: 0 },
  milintel: { name: 'Military reconnaissance', desc: 'Map their order of battle: every division, fleet and air wing, their strength and orders, for 10 days.', needs: null, rank: 1, relation: -6 },
  cyber: { name: 'Cyber intrusion', desc: 'Break into ministries\' and companies\' networks from afar: a sharper estimate of the country, and technology to copy if it is ahead.', needs: null, rank: 1, relation: -8 },
  milsabotage: { name: 'Military sabotage', desc: 'Wreck a formation’s equipment and readiness (a fleet in port, an air base, a division’s depots).', needs: 'formation', rank: 2, relation: -15 },
};
export const ARANKS = ['Analyst', 'Case Officer', 'Field Agent', 'Station Chief', 'Deputy Director'];

const active = (w: World, nation: Id) => Object.values(w.ops).filter((o) => o.nation === nation && o.status === 'active');

// ---------- launching ----------

export function opCheck(w: World, actor: Id, sponsor: Id, kind: OpKind, target: Id, region: Id | null, subject: Id | null): string | null {
  const n = w.nations[sponsor];
  const t = w.nations[target];
  const c = w.citizens[actor];
  const def = OPS[kind];
  if (!n || n.exile) return 'Your government is in exile.';
  if (kind !== 'counter' && (!t || target === sponsor)) return 'Choose a foreign target.';
  const official = nationPerm(w, actor, sponsor, 'intel');
  const agent = c.sec.agency === sponsor && c.sec.arank >= def.rank;
  if (!official && !agent) return c.sec.agency === sponsor ? `Requires rank ${ARANKS[def.rank]}.` : 'Only the Director of Intelligence, the national leader or agents of the service can run operations.';
  if (jailed(w, c)) return 'You are in prison.';
  if (!official) {
    if (c.energy < B.intel.energy) return `Needs ${B.intel.energy} energy.`;
    if (w.time - (c.sec.last.op ?? -1e9) < B.intel.agentCd * HOUR) return 'You are still debriefing from your last operation.';
  }
  if (active(w, sponsor).length >= B.intel.maxActive) return `The service is running ${B.intel.maxActive} operations already.`;
  const net = kind === 'counter' ? 100 : n.agency.network[target] ?? 0;
  if (net < B.intel.minNetwork[kind]) return `Needs network ${B.intel.minNetwork[kind]} in ${t.name} (you have ${Math.round(net)}).`;
  if (def.needs === 'region') {
    if (region == null || controller(w.regions[region]) !== target) return `Pick a region ${t.name} controls.`;
  }
  if (def.needs === 'subject') {
    const s = subject != null ? w.citizens[subject] : null;
    if (!s || s.nation !== target) return `Pick a ${t.adj} citizen.`;
  }
  if (def.needs === 'formation') {
    const f = subject != null ? w.forces[subject] : null;
    if (!f || f.nation !== target) return `Pick a ${t.adj} formation.`;
    if (!visible(w, sponsor, f)) return 'You don’t know where that formation is: run reconnaissance first.';
  }
  const cost = cur(B.intel.opCost[kind]);
  if ((n.wallet[n.cur] ?? 0) < cost) return `The service needs ${fmtAmt(n.cur, cost)} from the treasury.`;
  return null;
}

export function launchOp(w: World, actor: Id, sponsor: Id, kind: OpKind, target: Id, region: Id | null = null, subject: Id | null = null): Result {
  const why = opCheck(w, actor, sponsor, kind, target, region, subject);
  if (why) return fail(why);
  const n = w.nations[sponsor];
  const c = w.citizens[actor];
  pay(w, natref(sponsor), hhref(sponsor), n.cur, cur(B.intel.opCost[kind]), `Intelligence operation`);
  n.stats.spendToday += cur(B.intel.opCost[kind]);
  const official = nationPerm(w, actor, sponsor, 'intel');
  // Officials assign the best free agent; agents run their own operations.
  let agent: Id | null = null;
  if (!official || c.sec.agency === sponsor) agent = actor;
  if (official && agent == null) {
    const busy = new Set(active(w, sponsor).map((o) => o.agent));
    const pool = census(w).all.filter((x) => x.sec.agency === sponsor && x.sec.arank >= OPS[kind].rank && !jailed(w, x) && !busy.has(x.id) && !x.player);
    agent = pool.sort((a, b) => b.sec.tradecraft - a.sec.tradecraft)[0]?.id ?? null;
  }
  if (!official) { c.energy -= B.intel.energy; c.sec.last.op = w.time; }
  const op: SpyOp = { id: nid(w), nation: sponsor, target: kind === 'counter' ? sponsor : target, region, kind, agent, subject, start: w.time, ends: w.time + B.intel.opHours[kind] * HOUR, status: 'active' };
  w.ops[op.id] = op;
  n.agency.opsRun++;
  schedule(w, op.ends, 'opResolve', { id: op.id });
  return ok(`${OPS[kind].name} ${kind === 'counter' ? 'at home' : `against ${w.nations[target].name}`} is under way (${B.intel.opHours[kind]}h)${agent != null ? `, run by ${w.citizens[agent].name}` : ''}.`);
}

// ---------- resolution ----------

export function resolveOp(w: World, id: Id) {
  const op = w.ops[id];
  if (!op || op.status !== 'active') return;
  const n = w.nations[op.nation];
  const t = w.nations[op.target];
  const agent = op.agent != null ? w.citizens[op.agent] : null;
  const p = player(w);
  const net = op.kind === 'counter' ? 60 : n.agency.network[op.target] ?? 0;
  const counter = op.kind === 'counter' ? 0 : t.agency.counter;
  // The directorate that runs it, and the agent's own directorate, matter (intelOrg.ts).
  const ownDir = agent && dirOfAgent(agent) === OP_DIR[op.kind] ? 0.04 : 0;
  const pSuccess = Math.max(0.05, Math.min(0.92, 0.35 + net / 150 + (agent?.sec.tradecraft ?? 5) / 100 - counter / 200 + dirEdge(n, op.kind) + ownDir));
  const success = chance(w, pSuccess);
  const exposed = op.kind !== 'counter' && chance(w, success ? (counter / 50) * 0.06 : 0.18 + counter / 300);
  let text = '';
  if (success) {
    text = applyOp(w, op);
    op.status = 'success';
    if (agent) { agent.sec.tradecraft += 2; agent.flags.opWins = (agent.flags.opWins ?? 0) + 1; promoteAgent(w, agent); }
  } else {
    op.status = 'failed';
    text = 'The operation failed.';
  }
  if (!success || exposed) noteLesson(n, OP_DIR[op.kind], exposed ? 1 : 0.4); // failure teaches
  if (exposed && op.kind !== 'counter') noteLesson(t, 'counter', 0.3); // and so does catching them
  if (exposed) {
    op.status = 'exposed';
    n.agency.exposed++;
    t.agency.counter = Math.min(100, t.agency.counter + 3);
    n.agency.network[op.target] = Math.max(0, (n.agency.network[op.target] ?? 0) - 10);
    relation(w, op.nation, op.target, OPS[op.kind].relation - 6, `${OPS[op.kind].name.toLowerCase()} exposed`);
    let caught = '';
    if (agent && controller(w.regions[agent.loc]) === op.target) {
      caught = ` ${agent.name} was arrested.`;
      const k = { id: nid(w), suspect: agent.id, kind: 'espionage' as const, region: agent.loc, nation: op.target, evidence: 90, opened: w.time, status: 'open' as const, detective: null, loot: 0 };
      w.cases[k.id] = k;
      t.agency.caught++;
    } else if (agent) { agent.sec.tradecraft = Math.max(0, agent.sec.tradecraft - 3); caught = ` ${agent.name}'s cover is blown.`; }
    text += ` Exposed by the ${t.agency.name}.${caught}`;
    record(w, 'espionage', `🕵️ ${t.name} exposed a ${n.adj} ${OPS[op.kind].name.toLowerCase()} operation.${caught}`, { nation: op.target, important: op.nation === p.nation || op.target === p.nation });
    if (op.target === p.nation) notify(w, 'politics', `🕵️ The ${t.agency.name} exposed ${n.name} running ${OPS[op.kind].name.toLowerCase()} against us.`, { link: 'intel' });
  }
  op.result = text;
  if (agent?.player || (op.nation === p.nation && nationPerm(w, p.id, p.nation, 'intel'))) notify(w, 'office', `🕵️ ${OPS[op.kind].name} (${w.nations[op.target].name}): ${text}`, { link: 'intel' });
  // Tidy history.
  const done = Object.values(w.ops).filter((o) => o.status !== 'active').sort((a, b) => a.id - b.id);
  for (const o of done.slice(0, Math.max(0, done.length - 300))) delete w.ops[o.id];
}

function applyOp(w: World, op: SpyOp): string {
  const n = w.nations[op.nation];
  const t = w.nations[op.target];
  const p = player(w);
  switch (op.kind) {
    case 'intel': {
      const soldiers = census(w).all.filter((c) => c.nation === t.id && c.persona === 'soldier').length;
      const weapons = census(w).all.filter((c) => c.nation === t.id).reduce((s, c) => s + Object.entries(c.inv).filter(([k]) => k.startsWith('wg') || k.startsWith('wa')).reduce((a, [, v]) => a + v, 0), 0);
      const synd = Object.values(w.syndicates).filter((s) => s.nation === t.id).map((s) => `${s.name} (${Math.round(s.strength)})`);
      const lines = [
        `Treasury: ${fmtAmt(t.cur, t.wallet[t.cur] ?? 0)} and ${fmtAmt('GOLD', t.wallet.GOLD ?? 0)}; approval ${Math.round(t.approval)}%.`,
        `Forces: ${soldiers} soldiers, ~${weapons.toLocaleString()} weapons in private hands; war appetite ${t.warMood.toFixed(1)}.`,
        `Warheads: ${t.warheads.reduce((a, x) => a + x.count, 0)}${t.nukeProd ? ' (one in production)' : ''}.`,
        `Counter-intelligence: ${Math.round(t.agency.counter)}; their network in ${n.name}: ${Math.round(t.agency.network[n.id] ?? 0)}.`,
        `Organised crime: ${synd.join(', ') || 'none known'}.`,
        `Leadership: ${t.leader} ${t.president != null ? w.citizens[t.president]?.name : 'vacant'}; unemployment ${Math.round(t.unemployment * 100)}%.`,
      ];
      n.agency.dossiers[t.id] = { t: w.time, lines };
      refresh(w, n, t, 0.7); // fresh material sharpens the estimate
      n.agency.network[t.id] = Math.min(100, (n.agency.network[t.id] ?? 0) + 3);
      return `Dossier on ${t.name} updated.`;
    }
    case 'sabotage': {
      const r = w.regions[op.region!];
      const cos = Object.values(w.companies).filter((co) => co.region === r.id).slice(0, 3);
      for (const co of cos) co.halt = { until: w.time + 2 * DAY, why: 'Sabotaged' };
      r.disrupted = Math.max(r.disrupted, w.time + DAY);
      const s = w.govs[r.id];
      let extra = '';
      if (s && s.dev > 0) { s.dev--; extra = ' and set back its infrastructure'; } else {
        const b = (['industrial', 'fields', 'hospital', 'base'] as const).find((k) => r.bld[k] > 0);
        if (b) { r.bld[b]--; extra = ` and damaged its ${b} level`; }
      }
      if (r.owner === p.nation || op.nation === p.nation) record(w, 'espionage', `💥 Explosions at ${cos.length} sites in ${r.name}. Authorities suspect sabotage.`, { region: r.id, nation: r.owner, important: r.owner === p.nation });
      return `Halted ${cos.length} companies in ${r.name}${extra}.`;
    }
    case 'theft': {
      const amt = Math.min(Math.floor((t.wallet[t.cur] ?? 0) * 0.04), cur(400));
      if (amt > 0) pay(w, natref(t.id), natref(n.id), t.cur, amt, 'Covert transfer');
      return `Siphoned ${fmtAmt(t.cur, amt)} into our accounts.`;
    }
    case 'unrest': {
      const r = w.regions[op.region!];
      r.unrest = Math.min(100, r.unrest + 20);
      r.crime = Math.min(100, r.crime + 8);
      const s = w.govs[r.id];
      if (s) s.approval = Math.max(5, s.approval - 8);
      return `Agitators are stirring trouble in ${r.name} (unrest ${Math.round(r.unrest)}).`;
    }
    case 'propaganda': {
      t.approval = Math.max(5, t.approval - 5);
      t.warMood = Math.max(-5, t.warMood - 0.5);
      return `${t.name}'s government approval slipped to ${Math.round(t.approval)}%.`;
    }
    case 'scandal': {
      const s = w.citizens[op.subject!];
      if (!s) return 'The target vanished.';
      s.influence = Math.floor(s.influence * 0.7);
      s.sec.fame = Math.max(0, s.sec.fame - 3);
      let fallout = '';
      for (const [m, id] of Object.entries(t.cabinet)) if (id === s.id && chance(w, 0.5)) { delete t.cabinet[m as keyof typeof t.cabinet]; fallout = ` ${s.name} resigned from the cabinet.`; }
      if (t.president === s.id) t.approval = Math.max(5, t.approval - 6);
      for (const g of w.govs) if (g && g.head.cit === s.id) g.approval = Math.max(5, g.approval - 12);
      record(w, 'politics', `📰 Scandal: leaked documents embarrass ${s.name} (${t.name}).${fallout}`, { nation: t.id, cit: s.id, important: s.player || t.id === p.nation });
      if (s.player) notify(w, 'personal', `📰 Compromising documents about you were leaked. Influence fell to ${Math.round(s.influence)}.`, { critical: true });
      return `Scandal planted on ${s.name}.${fallout}`;
    }
    case 'recruit': {
      const s = w.citizens[op.subject!];
      if (!s || s.player) {
        if (s?.player) approachPlayer(w, op.nation);
        return s?.player ? `We approached ${s.name}.` : 'The target vanished.';
      }
      if (s.traits.loyalty > 0.7 && chance(w, 0.6)) { s.rel[op.agent ?? -1] = -20; return `${s.name} refused and may report us.`; }
      s.sec.asset = op.nation;
      s.sec.motive = motiveFor(w, s, n);
      n.agency.network[t.id] = Math.min(100, (n.agency.network[t.id] ?? 0) + 8);
      return `${s.name} now works for us (${MOTIVE_LABEL[s.sec.motive]}; placed as ${placementOf(w, s).label}).`;
    }
    case 'milintel': {
      n.agency.milIntel[t.id] = w.time + 10 * DAY;
      refresh(w, n, t, 0.9);
      const fs = Object.values(w.forces).filter((f) => f.nation === t.id);
      const by = (b: string) => fs.filter((f) => f.branch === b);
      n.agency.dossiers[t.id] = { t: w.time, lines: [
        ...(n.agency.dossiers[t.id]?.lines.filter((l) => !l.startsWith('Order of battle')) ?? []),
        `Order of battle: ${by('army').length} divisions, ${by('navy').length} naval formations, ${by('air').length} air wings; alert level ${t.alert}.`,
      ] };
      return `Order of battle of ${t.name} mapped: ${fs.length} formations located (valid 10 days).`;
    }
    case 'cyber': {
      refresh(w, n, t, 0.6);
      // Copy what they know better: a share of the technology gap in information and military technology.
      const mine = capsOf(w, n), theirs = capsOf(w, t);
      const stolen: string[] = [];
      for (const d of ['information', 'military'] as const) {
        const gap = theirs.tech[d] - mine.tech[d];
        if (gap > 0) { mine.tech[d] = Math.round((mine.tech[d] + gap * 0.03) * 100) / 100; stolen.push(d); }
      }
      return `Inside ${t.name}'s networks: the estimate is sharper${stolen.length ? `, and ${stolen.join(' and ')} technology was copied` : ''}.`;
    }
    case 'milsabotage': {
      const f = w.forces[op.subject!];
      if (!f) return 'The target formation no longer exists.';
      f.readiness = Math.max(0, f.readiness - 30);
      f.equipment = Math.max(0, f.equipment - 25);
      f.morale = Math.max(0, f.morale - 10);
      record(w, 'espionage', `💥 Mysterious explosions hit the ${f.name} (${t.name}).`, { nation: t.id, important: t.id === p.nation || op.nation === p.nation });
      return `The ${f.name} was hit: readiness ${Math.round(f.readiness)}, equipment ${Math.round(f.equipment)}.`;
    }
    case 'counter': {
      let found = 0;
      for (const o of Object.values(w.ops)) {
        if (o.status !== 'active' || o.target !== op.nation || o.nation === op.nation) continue;
        if (chance(w, 0.5)) { o.ends = w.time; o.status = 'exposed'; found++; relation(w, o.nation, op.nation, -10, 'spy ring uncovered'); w.nations[o.nation].agency.network[op.nation] = Math.max(0, (w.nations[o.nation].agency.network[op.nation] ?? 0) - 15); }
      }
      for (const c of census(w).all) {
        if (c.sec.asset == null || c.nation !== op.nation || !chance(w, 0.3)) continue;
        const k = { id: nid(w), suspect: c.id, kind: 'espionage' as const, region: c.loc, nation: op.nation, evidence: 70, opened: w.time, status: 'open' as const, detective: null, loot: 0 };
        w.cases[k.id] = k;
        found++;
        if (c.player) notify(w, 'personal', `🕵️ Counter-intelligence is asking questions about your foreign contacts.`, { critical: true, link: 'crime' });
      }
      n.agency.counter = Math.min(100, n.agency.counter + 5);
      return `Sweep complete: ${found} foreign operation${found === 1 ? '' : 's'} or asset${found === 1 ? '' : 's'} uncovered.`;
    }
  }
}

function promoteAgent(w: World, c: Citizen) {
  const next = B.intel.rankAt[c.sec.arank + 1];
  if (next != null && (c.flags.opWins ?? 0) >= next) {
    c.sec.arank++;
    if (c.player) notify(w, 'progress', `🕵️ Promoted to ${ARANKS[c.sec.arank]}.`, { link: 'intel' });
  }
}

// ---------- careers ----------

export function joinAgencyCheck(w: World, c: Citizen): string | null {
  if (c.sec.agency != null) return 'You already serve.';
  if (ageOf(w, c) < B.intel.age) return `The service recruits from age ${B.intel.age}.`;
  if (standing(c) < B.intel.rep) return `They recruit people with a track record: you need ${repNeed(B.intel.rep)}.`;
  if (c.sec.record.convictions > 0) return 'A criminal record fails the vetting.';
  if (c.sec.syndicate != null) return 'Organised-crime links fail the vetting.';
  if (w.nations[c.nation].exile) return 'Your government is in exile.';
  if (!c.player && (w.nations[c.nation].president === c.id || Object.values(w.nations[c.nation].cabinet).includes(c.id))) return 'Serving politicians do not join.';
  return null;
}

export function joinAgency(w: World, c: Citizen): Result {
  const why = joinAgencyCheck(w, c);
  if (why) return fail(why);
  c.sec.agency = c.nation;
  c.sec.arank = 0;
  return ok(`You joined the ${w.nations[c.nation].agency.name} as an analyst.`);
}

export function leaveAgency(w: World, c: Citizen): Result {
  if (c.sec.agency == null) return fail('You are not in the service.');
  c.sec.agency = null;
  c.sec.arank = 0;
  return ok('You resigned from the service.');
}

export function analyzeCheck(w: World, c: Citizen, target: Id): string | null {
  const tooYoung = lifeGate(w, c, 18, 'Intelligence work');
  if (tooYoung) return tooYoung;
  if (c.sec.agency == null) return 'Join the intelligence service first.';
  if (target === c.sec.agency || !w.nations[target]) return 'Pick a foreign nation.';
  if (c.energy < 10) return 'Needs 10 energy.';
  if (w.time - (c.sec.last.analyze ?? -1e9) < 12 * HOUR) return 'You already filed a report recently.';
  return null;
}

/** Desk work: build the service's picture of a country (network) and your tradecraft. */
export function analyze(w: World, c: Citizen, target: Id): Result {
  const why = analyzeCheck(w, c, target);
  if (why) return fail(why);
  c.energy -= 10;
  c.sec.last.analyze = w.time;
  const n = w.nations[c.sec.agency!];
  const gain = 1 + c.sec.tradecraft / 20;
  n.agency.network[target] = Math.min(100, (n.agency.network[target] ?? 0) + gain);
  c.sec.tradecraft += 0.5;
  c.flags.analyses = (c.flags.analyses ?? 0) + 1;
  if (c.sec.arank === 0 && c.flags.analyses >= 5) { c.sec.arank = 1; if (c.player) notify(w, 'progress', '🕵️ Promoted to Case Officer: you can now run operations.', { link: 'intel' }); }
  return ok(`Report filed: network in ${w.nations[target].name} +${gain.toFixed(1)}.`);
}

export function setAgencyBudget(w: World, actor: Id, nation: Id, share: number, focus: Id[]): Result {
  if (!nationPerm(w, actor, nation, 'intel')) return fail('Only the Director of Intelligence or national leader sets the budget.');
  if (!(share >= 0 && share <= 0.15)) return fail('Between 0% and 15% of daily revenue.');
  const n = w.nations[nation];
  n.agency.budget = share;
  n.agency.focus = focus.filter((f) => f !== nation && w.nations[f]).slice(0, 4);
  return ok(`Intelligence budget ${Math.round(share * 100)}% of revenue${n.agency.focus.length ? `, focused on ${n.agency.focus.map((f) => w.nations[f].name).join(', ')}` : ''}.`);
}

// ---------- double agents ----------

function approachPlayer(w: World, foreign: Id) {
  const p = player(w);
  const f = w.nations[foreign];
  if (w.inbox.some((m) => m.payload?.handler === 'spyApproach' && !m.resolved) || p.sec.asset != null) return;
  const fee = cur(20 + Math.min(100, Math.round(standing(p) / 2)));
  sendMsg(w, {
    from: null, subject: 'A stranger with an offer', kind: 'npc',
    body: `Someone slipped you a note: "Friends abroad value your perspective on ${w.nations[p.nation].name}. ${fmtAmt(f.cur, fee)} a day for occasional conversations." You suspect the ${f.agency.name}. Accepting is espionage — a serious crime if you're caught.`,
    options: [{ id: 'accept', label: 'Accept (become their asset)' }, { id: 'decline', label: 'Ignore it' }, { id: 'report', label: 'Report it to our intelligence service' }],
    payload: { handler: 'spyApproach', foreign, fee },
  });
}

export function replySpyApproach(w: World, payload: Record<string, any>, option: string): Result {
  const p = player(w);
  const f = w.nations[payload.foreign];
  if (option === 'accept') {
    p.sec.asset = payload.foreign;
    p.flags.assetFee = payload.fee;
    return ok(`You now secretly work for the ${f.agency.name}. Payments arrive daily. Counter-intelligence sweeps can catch you.`);
  }
  if (option === 'report') {
    const n = w.nations[p.nation];
    n.agency.counter = Math.min(100, n.agency.counter + 8);
    f.agency.network[p.nation] = Math.max(0, (f.agency.network[p.nation] ?? 0) - 10);
    p.sec.fame += 2;
    relation(w, p.nation, f.id, -5, 'recruitment attempt reported');
    return ok(`The ${n.agency.name} thanks you. ${f.name}'s network took a hit.`);
  }
  return ok('You burned the note.');
}

export function quitAsset(w: World, c: Citizen): Result {
  if (c.sec.asset == null) return fail('You are not working for a foreign service.');
  c.sec.asset = null;
  delete c.flags.assetFee;
  return ok('You cut contact with your handlers.');
}

// ---------- daily running and AI ----------

export function intelDaily(w: World) {
  const assets = new Map<string, number>();
  for (const c of census(w).all) if (c.sec.asset != null) assets.set(`${c.nation}|${c.sec.asset}`, (assets.get(`${c.nation}|${c.sec.asset}`) ?? 0) + 1);
  const p = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const a = n.agency;
    const rev = n.stats.revHist[n.stats.revHist.length - 1] ?? 0;
    const spend = Math.min(Math.floor(rev * a.budget), Math.floor((n.wallet[n.cur] ?? 0) * 0.05));
    if (spend > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, spend, 'Intelligence service')) n.stats.spendToday += spend;
    // Networks: invest in focus targets (AI: enemies and rivals), everything decays.
    if (!a.focus.length || !isPlayerRun(w, n.id)) a.focus = aiFocus(w, n.id);
    const per = a.focus.length ? spend / 100 / a.focus.length : 0;
    for (const o of w.nations) {
      if (o.id === n.id) continue;
      let v = (a.network[o.id] ?? 0) * (1 - B.intel.networkDecay / 100);
      if (a.focus.includes(o.id)) v += (per * B.intel.networkGain * (1 - o.agency.counter / 200) * (dirStrength(n, 'humint') / 60) * coverFactor(w, n, o)) / (1 + v / 50); // case officers build networks, best under diplomatic cover
      // Assets inside the country keep feeding the network.
      v += assets.get(`${o.id}|${n.id}`) ?? 0;
      a.network[o.id] = Math.max(0, Math.min(100, v));
    }
    a.counter += (Math.min(95, (15 + a.budget * 600) * 0.5 + dirStrength(n, 'counter') * 0.5) - a.counter) * 0.08;
  }
  // Salaries for citizens in the service.
  for (const c of census(w).all) {
    if (c.sec.agency != null && !jailed(w, c)) { const n = w.nations[c.sec.agency]; pay(w, natref(n.id), cref(c.id), n.cur, cur(B.intel.salary) * (1 + c.sec.arank * 0.3) | 0, `${n.agency.name}: salary`); }
    // Double agents are paid by their handlers.
    if (c.sec.asset != null) {
      const f = w.nations[c.sec.asset];
      const fee = c.player ? p.flags.assetFee ?? cur(20) : cur(10);
      if (!pay(w, natref(f.id), cref(c.id), f.cur, fee, 'Consulting fees')) c.sec.asset = null;
      c.sec.heat = Math.min(100, c.sec.heat + 1);
    }
  }
  intelAI(w);
  // Foreign services occasionally approach well-placed players.
  const placed = p.sec.agency != null || p.sec.police != null || Object.values(w.nations[p.nation].cabinet).includes(p.id) || w.nations[p.nation].deputies.includes(p.id) || w.govs.some((g) => g?.head.cit === p.id);
  if (placed && p.sec.asset == null && dayOf(w.time) % 9 === 4 && chance(w, 0.4)) {
    const hostile = w.nations.filter((n) => n.id !== p.nation && (n.relations[p.nation]?.score ?? 0) < 10 && (n.agency.network[p.nation] ?? 0) > 10);
    if (hostile.length) approachPlayer(w, pick(w, hostile).id);
  }
  // AI citizens join their service.
  // The service employs about 1% of the population (at least 5).
  const staff = w.nations.map(() => 0);
  for (const c of census(w).all) if (c.sec.agency != null) staff[c.sec.agency]++;
  for (const c of census(w).all) {
    if (c.player || c.sec.agency != null || (c.id + dayOf(w.time)) % 40 !== 0) continue;
    if (staff[c.nation] < Math.max(5, Math.round(nationals(w, c.nation).length * B.intel.staffShare)) && c.traits.loyalty > 0.65 && ageOf(w, c) >= B.intel.age && !joinAgencyCheck(w, c) && chance(w, 0.4) && ++staff[c.nation]) joinAgency(w, c);
    if (c.sec.agency != null && chance(w, 0.5)) c.sec.arank = Math.min(3, 1 + Math.floor(seniority(w, c) / 12));
  }
}

const isPlayerRun = (w: World, nation: Id) => {
  const p = player(w);
  return nationPerm(w, p.id, nation, 'intel') && w.nations[nation].agency.focus.length > 0;
};

function aiFocus(w: World, nation: Id): Id[] {
  const n = w.nations[nation];
  const enemies = Object.values(w.wars).filter((x) => x.status === 'active' && (x.att === nation || x.def === nation)).map((x) => (x.att === nation ? x.def : x.att));
  const rivals = w.nations.filter((o) => o.id !== nation && !enemies.includes(o.id)).sort((a, b) => (n.relations[a.id]?.score ?? 0) - (n.relations[b.id]?.score ?? 0)).slice(0, 2).map((o) => o.id);
  return [...new Set([...enemies, ...rivals])].slice(0, 3);
}

/** AI directors run operations: sabotage and theft against enemies at war, intelligence and propaganda against rivals, sweeps at home. */
function intelAI(w: World) {
  const p = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const director = n.cabinet.intelligence ?? n.president;
    if (director == null || director === p.id || !w.citizens[director]) continue;
    if ((dayOf(w.time) + n.id) % 4 !== 0) continue;
    const enemies = Object.values(w.wars).filter((x) => x.status === 'active' && (x.att === n.id || x.def === n.id)).map((x) => (x.att === n.id ? x.def : x.att));
    const plans: [OpKind, Id, Id | null, Id | null][] = [];
    for (const e of enemies) {
      const regions = w.regions.filter((r) => controller(r) === e);
      const r = regions.length ? pick(w, regions).id : null;
      if ((n.agency.milIntel[e] ?? 0) < w.time) plans.push(['milintel', e, null, null]);
      const targets = Object.values(w.forces).filter((f) => f.nation === e && visible(w, n.id, f)).sort((a, b) => b.strength - a.strength);
      if (targets.length) plans.push(['milsabotage', e, null, targets[0].id]);
      plans.push(['sabotage', e, r, null], ['theft', e, null, null], ['intel', e, null, null]);
    }
    for (const t of n.agency.focus) {
      if ((n.relations[t]?.score ?? 0) < -20) {
        const regions = w.regions.filter((r) => controller(r) === t);
        plans.push(['unrest', t, regions.length ? pick(w, regions).id : null, null], ['propaganda', t, null, null]);
        const pols = [w.nations[t].president, ...Object.values(w.nations[t].cabinet)].filter((id): id is Id => id != null && !!w.citizens[id]).map((id) => w.citizens[id]);
        if (pols.length && chance(w, 0.3)) plans.push(['scandal', t, null, pick(w, pols).id]);
      }
      plans.push(['intel', t, null, null]);
      if (chance(w, 0.3)) plans.push(['cyber', t, null, null]);
      // Services go after people who can see things: officials first, then anyone.
      const locals = nationals(w, t).filter((c) => c.sec.asset == null && (c.player ? chance(w, 0.3) : true));
      const placed = locals.filter((c) => placementOf(w, c).weight >= 0.04);
      if (locals.length && chance(w, 0.25)) plans.push(['recruit', t, null, pick(w, placed.length && chance(w, 0.7) ? placed : locals).id]);
    }
    const foreignExposed = Object.values(w.ops).some((o) => o.target === n.id && o.status === 'exposed' && w.time - o.ends < 5 * DAY);
    if (foreignExposed || n.agency.counter < 35) plans.unshift(['counter', n.id, null, null]);
    for (const [kind, target, region, subject] of plans) {
      if (active(w, n.id).length >= (enemies.length ? 2 : 1)) break;
      if (!opCheck(w, director, n.id, kind, target, region, subject)) launchOp(w, director, n.id, kind, target, region, subject);
    }
  }
}

export const knownDossier = (w: World, nation: Id, target: Id) => {
  const d = w.nations[nation].agency.dossiers[target];
  return d && w.time - d.t < 10 * DAY ? d : null;
};
export const opCost = (kind: OpKind) => cur(B.intel.opCost[kind]);
