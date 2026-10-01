// Policing as an institution (1.7 Law & Order): public trust, clearance, corruption,
// internal affairs, use of force and national investigations.
//
// - Trust in the police starts from each country's real institutions and moves with
//   how many cases are solved, with corruption scandals and with use-of-force incidents.
//   Low trust means fewer witnesses come forward, so evidence builds more slowly.
// - Clearance is the share of reported crimes brought to court in the month.
//   For reference, in the United States about 45% of violent crimes and 13% of
//   property crimes are cleared.
// - Corruption: bribes go into officers' pockets, and officers can take protection
//   money from organisations. Internal affairs investigates, more effectively where
//   the rule of law is strong.
// - National investigations: the Minister of the Interior or the leader can open an
//   investigation into an organisation, police corruption or espionage.
import type { Citizen, Id, Nation, World } from './types';
import { B } from '../data/balance';
import { baselineOf } from '../data/nationBaselines';
import { DAY, dayOf } from '../engine/clock';
import { notify, record } from '../engine/events';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { chance, pick } from '../engine/rng';
import { census, officersOf } from './census';
import { cref, hhref, jailed, natref, player, syndref } from './query';
import { nationPerm } from './authority';
import { openCase } from './crime';
import { markDirty } from './whitecollar';

export interface Investigation { kind: 'syndicate' | 'corruption' | 'espionage'; target?: Id; since: number; until: number; by: Id }
export interface Policing {
  trust: number; // 0..100
  solved: number; cold: number; reported?: number; // this month
  clearance: number; // last month's share of cases solved
  incidents: number; scandals: number; // all time
  investigations: Investigation[];
  hist: { t: number; trust: number; clearance: number }[];
}

export function policingOf(n: Nation): Policing {
  if (n.policing) return n.policing;
  const b = baselineOf(n.iso);
  n.policing = { trust: Math.round(18 + b.corruption * 35 + b.law * 20), solved: 0, cold: 0, clearance: 0.4, incidents: 0, scandals: 0, investigations: [], hist: [] };
  return n.policing;
}
/** Where trust settles with typical results (about Gallup's confidence in the local police: ~50% US, ~70–80% Germany and Japan, ~30% Mexico). */
const baseTrust = (n: Nation) => { const b = baselineOf(n.iso); return 18 + b.corruption * 35 + b.law * 20; };

export const noteSolved = (n: Nation) => { policingOf(n).solved++; };
export const noteCold = (n: Nation) => { policingOf(n).cold++; };
export const noteReported = (n: Nation) => { const p = policingOf(n); p.reported = (p.reported ?? 0) + 1; };
/** How readily witnesses help: evidence builds faster where people trust the police. */
export const witnessFactor = (n: Nation) => 0.6 + policingOf(n).trust / 125;

// ---------- corruption and internal affairs ----------

/** A bribe goes into an officer's pocket (one from the region's force, if there is one). */
export function bribeRecipient(w: World, region: Id): Citizen | null {
  const os = officersOf(w, region).filter((c) => !jailed(w, c));
  if (!os.length) return null;
  const o = pick(w, os);
  o.flags.bribes = (o.flags.bribes ?? 0) + 1;
  return o;
}

export function protectionCheck(w: World, c: Citizen): string | null {
  if (c.sec.police == null) return 'Only police officers can be paid off.';
  if (jailed(w, c)) return 'You are in prison.';
  const s = Object.values(w.syndicates).find((x) => x.turf.includes(c.sec.police!));
  if (!s) return 'No organisation works your patch.';
  if ((c.sec.last.protection ?? -1e12) > w.time - 7 * DAY) return 'Collected this week already.';
  return null;
}
/** Take an envelope from the organisation on your patch to look the other way. */
export function takeProtection(w: World, c: Citizen): Result {
  const why = protectionCheck(w, c);
  if (why) return fail(why);
  const s = Object.values(w.syndicates).find((x) => x.turf.includes(c.sec.police!))!;
  const code = w.nations[s.nation].cur;
  const amt = Math.min(s.wallet[code] ?? 0, Math.round(cur(B.wages.min) * (3 + c.sec.prank * 2)));
  if (amt <= 0) return fail(`${s.name} has no cash to spare.`);
  c.sec.last.protection = w.time;
  pay(w, syndref(s.id), cref(c.id), code, amt, `An envelope from ${s.name}`);
  markDirty(c, code, amt);
  c.flags.bribes = (c.flags.bribes ?? 0) + 1;
  s.heat = Math.max(0, s.heat - 10);
  for (const k of Object.values(w.cases)) if (k.status === 'open' && k.syndicate === s.id && k.region === c.sec.police) k.evidence = Math.max(0, k.evidence - 10);
  return ok(`${fmtAmt(code, amt)} in an envelope. Some files on ${s.name} get thinner.`);
}

/** Monthly: internal affairs looks at officers who have taken money. */
function internalAffairs(w: World) {
  for (const c of census(w).all) {
    const b = c.flags.bribes ?? 0;
    if (!b || c.sec.police == null) continue;
    const region = c.sec.police;
    const n = w.nations[w.regions[region].owner];
    if (!n) continue;
    const sweep = policingOf(n).investigations.some((i) => i.kind === 'corruption');
    if (!chance(w, Math.min(0.9, (0.08 + baselineOf(n.iso).law * 0.3 + b * 0.04) * (sweep ? 2.5 : 1)))) continue;
    c.flags.bribes = 0;
    openCase(w, c, 'corruption', region, 50 + b * 8, 0);
    const p = policingOf(n);
    p.scandals++;
    p.trust = Math.max(0, p.trust - 1.5);
    if (c.player) notify(w, 'personal', '🕵️ Internal affairs has opened a corruption file on you.', { critical: true, link: 'crime' });
    else if (n.id === player(w).nation) record(w, 'justice', `🕵️ Internal affairs is investigating an officer of the ${w.regions[region].name} police for corruption.`, { nation: n.id, region });
  }
}

/** On an arrest: occasionally force is used, more often where institutions are weak. */
export function arrestForce(w: World, suspect: Citizen, nation: Id) {
  const n = w.nations[nation];
  if (!chance(w, 0.004 + (1 - baselineOf(n.iso).law) * 0.012)) return;
  const p = policingOf(n);
  p.incidents++;
  p.trust = Math.max(0, p.trust - 1);
  suspect.health = Math.max(5, (suspect.health ?? 90) - 12);
  if (suspect.player) notify(w, 'personal', '🚨 The arrest got rough. You have the bruises to prove it, and a complaint form nobody will read.', { link: 'crime' });
  else if (nation === player(w).nation) record(w, 'justice', `📹 A video of ${suspect.name}'s violent arrest is circulating. Protesters gathered outside the police station.`, { nation });
}

// ---------- national investigations ----------

export const INVESTIGATION_COST = () => cur(300);
export function investigationCheck(w: World, actor: Id, nation: Id, kind: Investigation['kind'], target?: Id): string | null {
  if (!nationPerm(w, actor, nation, 'police')) return 'Only the Minister of the Interior or national leader opens national investigations.';
  const n = w.nations[nation];
  const p = policingOf(n);
  if (p.investigations.length >= 3) return 'The national investigators are fully committed (three investigations at most).';
  if (p.investigations.some((i) => i.kind === kind && i.target === target)) return 'That investigation is already open.';
  if (kind === 'syndicate' && (!w.syndicates[target ?? -1] || w.syndicates[target!].nation !== nation)) return 'Choose an organisation operating in the country.';
  if ((n.wallet[n.cur] ?? 0) < INVESTIGATION_COST()) return `The treasury cannot fund it (${fmtAmt(n.cur, INVESTIGATION_COST())}).`;
  return null;
}
/** Open a 30-day national investigation. */
export function openInvestigation(w: World, actor: Id, nation: Id, kind: Investigation['kind'], target?: Id): Result {
  const why = investigationCheck(w, actor, nation, kind, target);
  if (why) return fail(why);
  const n = w.nations[nation];
  pay(w, natref(n.id), hhref(n.id), n.cur, INVESTIGATION_COST(), 'National investigation');
  policingOf(n).investigations.push({ kind, target, since: w.time, until: w.time + 30 * DAY, by: actor });
  const what = kind === 'syndicate' ? `into ${w.syndicates[target!].name}` : kind === 'corruption' ? 'into police corruption' : 'into foreign espionage';
  record(w, 'justice', `🔎 ${n.name} opened a national investigation ${what}.`, { nation, important: nation === player(w).nation });
  return ok(`A national investigation ${what} is under way for 30 days.`);
}

function investigationsDaily(w: World, n: Nation) {
  const p = policingOf(n);
  for (const inv of p.investigations) {
    if (inv.kind === 'syndicate') {
      const s = w.syndicates[inv.target!];
      if (!s) { inv.until = 0; continue; }
      s.heat = Math.min(100, s.heat + 2);
      for (const k of Object.values(w.cases)) if (k.status === 'open' && k.syndicate === s.id) k.evidence = Math.min(100, k.evidence + 2);
      // The investigation opens cases on members it can tie to the organisation.
      if (chance(w, 0.15)) { const m = s.members.map((id) => w.citizens[id]).filter((c) => c && !jailed(w, c)); if (m.length) openCase(w, pick(w, m), 'extortion', s.home, 30, 0).syndicate = s.id; }
    } else if (inv.kind === 'espionage') {
      for (const k of Object.values(w.cases)) if (k.status === 'open' && k.kind === 'espionage' && k.nation === n.id) k.evidence = Math.min(100, k.evidence + 3);
      n.agency.counter = Math.min(100, n.agency.counter + 0.2);
    }
  }
  const done = p.investigations.filter((i) => i.until <= w.time);
  p.investigations = p.investigations.filter((i) => i.until > w.time);
  for (const i of done) if (n.id === player(w).nation) record(w, 'justice', `🔎 The national investigation ${i.kind === 'syndicate' ? `into ${w.syndicates[i.target!]?.name ?? 'an organisation'}` : i.kind === 'corruption' ? 'into police corruption' : 'into espionage'} closed.`, { nation: n.id });
}

// ---------- daily ----------

export function policingDaily(w: World) {
  const day = dayOf(w.time);
  for (const n of w.nations) {
    if (n.exile) continue;
    const p = policingOf(n);
    investigationsDaily(w, n);
    // Trust drifts towards what the country's institutions and the police's results justify.
    const target = baseTrust(n) + (p.clearance - 0.7) * 30 - p.investigations.filter((i) => i.kind === 'corruption').length * 3;
    p.trust += (Math.max(15, Math.min(95, target)) - p.trust) * 0.03;
    if (day % 30 === 0) {
      // Clearance: cases brought to court against crimes reported this month.
      const total = Math.max(p.reported ?? 0, p.solved + p.cold);
      if (total >= 3) p.clearance = Math.min(1, p.solved / total);
      p.solved = 0; p.cold = 0; p.reported = 0;
      p.hist.push({ t: w.time, trust: Math.round(p.trust), clearance: Math.round(p.clearance * 100) / 100 });
      if (p.hist.length > 60) p.hist.shift();
      // AI interior ministries go after the strongest organisation, or sweep for corruption after scandals.
      const president = n.president != null ? w.citizens[n.president] : null;
      if (!president?.player) {
        const big = Object.values(w.syndicates).filter((s) => s.nation === n.id).sort((a, b) => b.strength - a.strength)[0];
        const actor = n.president ?? -1;
        if (big && big.strength > 55 && !investigationCheck(w, actor, n.id, 'syndicate', big.id)) openInvestigation(w, actor, n.id, 'syndicate', big.id);
        else if (p.trust < 35 && !investigationCheck(w, actor, n.id, 'corruption')) openInvestigation(w, actor, n.id, 'corruption');
      }
    }
  }
  if (day % 30 === 0) internalAffairs(w);
}
