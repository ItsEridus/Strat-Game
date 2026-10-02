// Coups and revolutions (2.3 Rise & fall).
// - Coups: officers with little loyalty plot against the government. The chance of an
//   attempt follows the regime and the state's capacity (Powell & Thyne: coups are rare
//   in rich democracies, common in poor juntas and personalist regimes), and rises when
//   legitimacy collapses or the streets are in turmoil. Coup-proofing (purges, loyal
//   guards) protects a ruler. A successful coup installs a junta led by the senior
//   plotter; a failed one ends in arrests for treason, a purge, and tighter coup-proofing.
// - Protest movements grow with low legitimacy, unrest and unemployment. Governments
//   answer with concessions (cheaper in democracies, and with doves) or repression
//   (which can backfire and costs legitimacy).
// - Revolutions: a mass movement against an autocracy topples it when the security
//   forces refuse to fire; the old rulers go and elections are called. In a democracy,
//   mass protest brings the government down through an early election instead.
import type { Citizen, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { nid, notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { census } from './census';
import { player } from './query';
import { relation } from './congress';
import { capsOf, historyPace } from './strategic';
import { leaderProfile } from './relations';
import { REGIMES, changeRegime, isDemocracy, regimeOf, type RegimeType } from './regimes';
import { appointCabinetAI, callSpecialElection } from './politics';
import { toReserve } from './forces';
import { RANKS } from '../data/military';
import { startCivilWar } from './civilWar';

/** Yearly chance of a coup attempt, by regime (before state capacity and turmoil). */
const COUP_BASE: Record<RegimeType, number> = { full: 0.0005, flawed: 0.003, hybrid: 0.01, oneparty: 0.004, personalist: 0.015, junta: 0.05, monarchy: 0.005 };

export const plottersOf = (w: World, n: Nation): Citizen[] =>
  census(w).all.filter((c) => c.nation === n.id && !c.gone && !c.player && c.mil?.branch && !c.mil.reserve && (c.mil.commissioned || RANKS[c.mil.branch][c.mil.rank]?.command) && c.traits.loyalty < 0.5 && n.president !== c.id && !Object.values(n.cabinet).includes(c.id));

/** The yearly chance of a coup attempt now. */
export function coupRisk(w: World, n: Nation): number {
  const r = regimeOf(n);
  const caps = capsOf(w, n);
  const avgUnrest = w.regions.filter((x) => x.owner === n.id).reduce((s, x, _i, a) => s + x.unrest / a.length, 0);
  const capacity = 1.6 - caps.inst.effectiveness; // weak states are coup-prone
  const turmoil = (r.legitimacy < 35 ? 2 : r.legitimacy < 50 ? 1.3 : 1) * (avgUnrest > 50 ? 1.5 : 1) * (n.warScore < -40 ? 1.5 : 1);
  return COUP_BASE[r.type] * capacity * turmoil * (n.failedSince != null ? 2 : 1) * (1 - (n.coupProof ?? 0) * 0.7);
}

export function attemptCoup(w: World, n: Nation, leader?: Citizen): 'success' | 'failed' | 'none' {
  const plotters = leader ? [leader, ...plottersOf(w, n).filter((c) => c.id !== leader.id)] : plottersOf(w, n);
  if (!plotters.length) return 'none';
  const head = leader ?? plotters.slice().sort((a, b) => b.mil.rank - a.mil.rank || a.id - b.id)[0];
  const r = regimeOf(n);
  const p = Math.max(0.05, Math.min(0.85, 0.35 + Math.min(0.2, plotters.length * 0.03) + (r.legitimacy < 30 ? 0.2 : 0) - (n.coupProof ?? 0) * 0.4 - (isDemocracy(n) ? 0.25 : 0)));
  const pl = player(w);
  const ousted = n.president != null ? w.citizens[n.president] : null;
  const won = chance(w, p);
  n.lastCoup = { t: w.time, ok: won, leader: head.id };
  if (won) {
    n.president = head.id;
    n.cabinet = {};
    appointCabinetAI(w, n);
    changeRegime(w, n, 'junta', `officers led by ${head.name} seized power${ousted ? ` from ${ousted.name}` : ''}`);
    regimeOf(n).legitimacy = Math.min(regimeOf(n).legitimacy, 35);
    n.coupProof = 0.3;
    const text = `🪖 Coup in ${n.name}: ${head.name}${plotters.length > 1 ? ` and ${plotters.length - 1} fellow officer${plotters.length > 2 ? 's' : ''}` : ''} seized power.`;
    record(w, 'politics', text, { nation: n.id, important: true });
    (n.chronicle ??= []).push({ t: w.time, text });
    if (ousted?.player) notify(w, 'office', `🪖 You were overthrown by a military coup led by ${head.name}.`, { critical: true });
    else if (pl.nation === n.id) notify(w, 'politics', text, { critical: true });
    // Democracies condemn the coup.
    for (const o of w.nations) if (o.id !== n.id && isDemocracy(o)) relation(w, o.id, n.id, -12, 'a military coup');
    return 'success';
  }
  // Failure: arrests for treason, a purge, and tighter coup-proofing.
  for (const c of plotters.slice(0, 4)) {
    const k = { id: nid(w), suspect: c.id, kind: 'treason' as const, region: c.loc, nation: n.id, evidence: 90, opened: w.time, status: 'open' as const, detective: null, loot: 0 };
    w.cases[k.id] = k;
  }
  // A failed coup by a large part of the officer corps can split the army: civil war.
  if (plotters.length >= 4 && r.legitimacy < 35 && chance(w, 0.25)) {
    const f = startCivilWar(w, n, `The army split after a failed coup led by ${head.name}`, head, 0.4);
    if (f) return 'failed';
  }
  for (const c of plotters.slice(4)) toReserve(w, c, 'purged after the failed coup');
  n.coupProof = Math.min(1, (n.coupProof ?? 0) + 0.3);
  const text = `🪖 A coup attempt in ${n.name} failed: ${head.name} and other officers were arrested for treason, and the army was purged.`;
  record(w, 'politics', text, { nation: n.id, important: true });
  (n.chronicle ??= []).push({ t: w.time, text });
  if (pl.nation === n.id) notify(w, 'politics', text, { critical: true });
  return 'failed';
}

// ---------- protest movements and revolutions ----------

function protestMonth(w: World, n: Nation) {
  const r = regimeOf(n);
  const rules = REGIMES[r.type];
  const avgUnrest = w.regions.filter((x) => x.owner === n.id).reduce((s, x, _i, a) => s + x.unrest / a.length, 0);
  const push = (100 - r.legitimacy) / 10 + avgUnrest / 10 + n.unemployment * 20 - 6;
  n.protest = Math.max(0, Math.min(100, (n.protest ?? 0) * 0.9 + push));
  if ((n.protest ?? 0) < 40) return;
  const lp = leaderProfile(w, n);
  const pl = player(w);
  // The government answers: concessions or repression.
  const repress = !rules.free && chance(w, 0.4 + lp.hawk * 0.4 + rules.repression * 0.2);
  if (repress) {
    r.legitimacy = Math.max(0, r.legitimacy - 5);
    if (chance(w, 0.25)) {
      n.protest = Math.min(100, (n.protest ?? 0) + 15);
      const text = `🩸 Security forces fired on protesters in ${n.name}; the anger only grew.`;
      record(w, 'politics', text, { nation: n.id, important: true });
      for (const o of w.nations) if (o.id !== n.id && isDemocracy(o)) relation(w, o.id, n.id, -5, 'a crackdown on protesters');
    } else n.protest = Math.max(0, (n.protest ?? 0) - 20 * (0.5 + rules.repression));
  } else {
    n.protest = Math.max(0, (n.protest ?? 0) - 12);
    r.legitimacy = Math.min(100, r.legitimacy + 3);
    if (chance(w, 0.3)) record(w, 'politics', `🤝 ${n.name}'s government made concessions to the protesters.`, { nation: n.id });
  }
  if ((n.protest ?? 0) < 75) return;
  if (rules.free) {
    // In a democracy the government falls and voters decide.
    if (chance(w, 0.3) && !Object.values(w.elections).some((e) => e.nation === n.id && !e.done && e.kind === 'president' && e.at - w.time < 60 * DAY)) {
      callSpecialElection(w, n);
      n.protest = 40;
      const text = `📢 Months of mass protest brought down ${n.name}'s government: an early election was called.`;
      record(w, 'politics', text, { nation: n.id, important: true });
      (n.chronicle ??= []).push({ t: w.time, text });
      if (pl.nation === n.id) notify(w, 'politics', text, { critical: true });
    }
    return;
  }
  // Against an autocracy: everything turns on whether the security forces will fire.
  if (!chance(w, 0.2)) return;
  const defect = 0.45 - rules.repression * 0.3 + (r.legitimacy < 25 ? 0.2 : 0) - (n.coupProof ?? 0) * 0.15;
  if (chance(w, Math.max(0.05, defect))) {
    const ousted = n.president != null ? w.citizens[n.president] : null;
    changeRegime(w, n, r.type === 'hybrid' ? 'flawed' : 'hybrid', `a popular uprising toppled the government${ousted ? ` of ${ousted.name}` : ''} when the security forces refused to fire`);
    n.president = null;
    callSpecialElection(w, n);
    n.protest = 20;
    regimeOf(n).legitimacy = 55;
    const text = `✊ Revolution in ${n.name}: the government fell to a popular uprising. Elections are called.`;
    record(w, 'politics', text, { nation: n.id, important: true });
    (n.chronicle ??= []).push({ t: w.time, text });
    if (ousted?.player) notify(w, 'office', '✊ A revolution swept you from power.', { critical: true });
    else if (pl.nation === n.id) notify(w, 'politics', text, { critical: true });
  } else if (r.legitimacy < 25 && chance(w, 0.3) && startCivilWar(w, n, `Protesters fired upon took up arms against the government`)) {
    n.protest = 30;
    r.legitimacy = Math.max(0, r.legitimacy - 10);
  } else {
    n.protest = 10;
    r.legitimacy = Math.max(0, r.legitimacy - 10);
    n.coupProof = Math.min(1, (n.coupProof ?? 0) + 0.1);
    const text = `🩸 The uprising in ${n.name} was crushed; its leaders were jailed or fled.`;
    record(w, 'politics', text, { nation: n.id, important: true });
    (n.chronicle ??= []).push({ t: w.time, text });
    for (const o of w.nations) if (o.id !== n.id && isDemocracy(o)) relation(w, o.id, n.id, -8, 'crushing an uprising');
  }
}

function monthly(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    n.coupProof = Math.max(0, (n.coupProof ?? 0) - 0.01);
    if (leaderProfile(w, n).risk < 0.3 && !isDemocracy(n)) n.coupProof = Math.min(1, (n.coupProof ?? 0) + 0.02); // cautious autocrats coup-proof
    if (chance(w, coupRisk(w, n) / 12)) attemptCoup(w, n);
    protestMonth(w, n);
  }
}

export function uprisingsDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
