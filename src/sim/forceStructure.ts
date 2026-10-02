// Force structure, doctrine and strategic forces (1.8 Arsenal).
//
// - Conscription: countries that draft (Russia, Turkey, Korea, Brazil, Mexico…) have
//   larger forces at lower pay, but with less experience and morale. Volunteer forces
//   are smaller and better trained. Unpaid forces lose people.
// - Exercises: they raise readiness and experience, and cost money and fuel.
// - Doctrine changes the combat maths. Manoeuvre favours armour, defence in depth
//   favours infantry, air power favours air wings, sea control favours fleets and
//   carriers, sea denial favours submarines, and asymmetric warfare favours light
//   forces at lower cost. After a war, the side that lost reviews its doctrine and
//   often adopts the winner's.
// - Strategic forces: the United States, Russia, China, the United Kingdom and India
//   start as nuclear powers, each with its real legs of the triad, a nuclear doctrine
//   and, for some, limited missile defence.
// - The politics of defence: lawmakers back bigger defence budgets where defence
//   contractors employ many people.
import type { Formation, FormationKind, Id, Nation, War, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { notify, record } from '../engine/events';
import { consume, pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { chance } from '../engine/rng';
import { hhref, natref, player } from './query';
import { nationPerm } from './authority';
import { contractorOf } from './arsenal';

export type Doctrine = 'manoeuvre' | 'depth' | 'air' | 'seacontrol' | 'seadenial' | 'asymmetric';
export const DOCTRINES: Record<Doctrine, { label: string; desc: string; bonus: Partial<Record<FormationKind, number>>; upkeep?: number }> = {
  manoeuvre: { label: 'Manoeuvre warfare', desc: 'fast armoured thrusts', bonus: { armored: 1.12, marines: 1.05 } },
  depth: { label: 'Defence in depth', desc: 'layered defence that trades space for time', bonus: { infantry: 1.1, mountain: 1.1 } },
  air: { label: 'Air power', desc: 'win the air, then strike from it', bonus: { fighter: 1.12, bomber: 1.12 } },
  seacontrol: { label: 'Sea control', desc: 'command the sea lanes with fleets and carriers', bonus: { fleet: 1.12, carrier: 1.12 } },
  seadenial: { label: 'Sea denial', desc: 'keep enemy fleets away with submarines and missiles', bonus: { submarine: 1.2, fleet: 1.05 } },
  asymmetric: { label: 'Asymmetric warfare', desc: 'light forces that make occupation costly', bonus: { infantry: 1.08, mountain: 1.08 }, upkeep: 0.9 },
};
const START_DOCTRINE: Record<string, Doctrine> = { USA: 'air', CAN: 'air', MEX: 'asymmetric', BRA: 'depth', ARG: 'depth', GBR: 'seacontrol', DEU: 'manoeuvre', RUS: 'depth', TUR: 'manoeuvre', SAU: 'air', ZAF: 'asymmetric', IND: 'depth', CHN: 'seadenial', JPN: 'seacontrol', KOR: 'depth', AUS: 'seacontrol' };
/** Countries with conscription in 2025 (the draft may be selective). */
const CONSCRIPTION = new Set(['RUS', 'TUR', 'KOR', 'BRA', 'MEX', 'CHN']);

export const doctrineOf = (n: Nation): Doctrine => (n.defense.doctrine ??= START_DOCTRINE[n.iso] ?? 'depth');
export const conscriptionOf = (n: Nation) => (n.defense.conscription ??= CONSCRIPTION.has(n.iso));
/** Combat multiplier for a formation from its country's doctrine and the kind of service (conscripts are less experienced). */
export function doctrineFactor(w: World, f: Formation): number {
  const n = w.nations[f.nation];
  return (DOCTRINES[doctrineOf(n)].bonus[f.kind] ?? 1) * (conscriptionOf(n) && f.branch === 'army' ? 0.95 : 1);
}
/** How many of a nation's people serve: drafting countries keep twice the share under arms. */
export const serviceShareFactor = (n: Nation) => (conscriptionOf(n) ? 2 : 1);
/** Personnel cost: conscripts are cheaper; asymmetric forces cost less to run. */
export const upkeepFactor = (n: Nation) => (conscriptionOf(n) ? 0.85 : 1) * (DOCTRINES[doctrineOf(n)].upkeep ?? 1);

export function setDoctrine(w: World, actor: Id, n: Nation, d: Doctrine): Result {
  if (!nationPerm(w, actor, n.id, 'war')) return fail('Only the Minister of Defence or the national leader sets doctrine.');
  if (doctrineOf(n) === d) return fail('That is already the doctrine.');
  n.defense.doctrine = d;
  // Retraining costs readiness for a while.
  for (const f of Object.values(w.forces)) if (f.nation === n.id) f.readiness = Math.max(0, f.readiness - 10);
  chronicle(w, n, `📘 ${n.name} adopted a doctrine of ${DOCTRINES[d].label.toLowerCase()}: ${DOCTRINES[d].desc}.`);
  return ok(`Doctrine changed to ${DOCTRINES[d].label.toLowerCase()}. Retraining costs some readiness.`);
}

export function setConscription(w: World, actor: Id, n: Nation, on: boolean): Result {
  if (!nationPerm(w, actor, n.id, 'war')) return fail('Only the Minister of Defence or the national leader sets recruitment policy.');
  if (conscriptionOf(n) === on) return fail(on ? 'The draft is already in force.' : 'The forces are already all-volunteer.');
  n.defense.conscription = on;
  if (on) n.approval = Math.max(0, n.approval - 4);
  chronicle(w, n, on ? `📜 ${n.name} introduced conscription.` : `📜 ${n.name} ended conscription: the forces are now all-volunteer.`);
  return ok(on ? 'Conscription is in force: the forces will grow, at some cost to popularity.' : 'The draft is over: smaller, better-trained volunteer forces.');
}

// ---------- exercises ----------

export const exerciseCost = (n: Nation, fs: Formation[]) => ({ money: cur(15) * fs.length, oil: 4 * fs.length });
export function exerciseCheck(w: World, actor: Id, n: Nation, branch: Formation['branch']): string | null {
  if (!nationPerm(w, actor, n.id, 'war')) return 'Only the Minister of Defence or the national leader orders exercises.';
  const fs = Object.values(w.forces).filter((f) => f.nation === n.id && f.branch === branch);
  if (!fs.length) return 'No formations in that branch.';
  const last = n.defense.exercised?.[branch] ?? -1e12;
  if (w.time - last < 30 * DAY) return 'That branch exercised this month already.';
  const c = exerciseCost(n, fs);
  if ((n.wallet[n.cur] ?? 0) < c.money) return `Needs ${fmtAmt(n.cur, c.money)}.`;
  if ((n.inv.oil ?? 0) < c.oil) return `Needs ${c.oil} oil in national stocks.`;
  return null;
}
/** A major exercise: readiness and experience up, money and fuel spent. */
export function holdExercise(w: World, actor: Id, n: Nation, branch: Formation['branch']): Result {
  const why = exerciseCheck(w, actor, n, branch);
  if (why) return fail(why);
  const fs = Object.values(w.forces).filter((f) => f.nation === n.id && f.branch === branch);
  const c = exerciseCost(n, fs);
  pay(w, natref(n.id), hhref(n.id), n.cur, c.money, 'Military exercise');
  n.stats.spendToday += c.money;
  consume(w, natref(n.id), 'oil', c.oil, 'Military exercise');
  for (const f of fs) { f.readiness = Math.min(100, f.readiness + 15); f.experience = Math.min(100, f.experience + 4); }
  (n.defense.exercised ??= {})[branch] = w.time;
  if (n.id === player(w).nation) record(w, 'military', `🎯 The ${n.adj} ${branch === 'army' ? 'army' : branch === 'navy' ? 'navy' : 'air force'} held a major exercise.`, { nation: n.id });
  return ok(`Exercise complete: ${fs.length} formations more ready and experienced.`);
}

// ---------- after-action reviews ----------

/** After a war, the loser studies what went wrong; most adopt the winner's doctrine. */
export function afterActionReview(w: World, war: War, winner: Id | null) {
  if (winner == null) return;
  const loser = winner === war.att ? war.def : war.att;
  const L = w.nations[loser], W = w.nations[winner];
  if (!L || !W || L.exile) return;
  const president = L.president != null ? w.citizens[L.president] : null;
  if (president?.player) { notify(w, 'politics', `📘 After-action review: ${W.name} won with a doctrine of ${DOCTRINES[doctrineOf(W)].label.toLowerCase()}. You may want to change yours (Forces screen).`, { link: 'forces' }); return; }
  if (doctrineOf(L) !== doctrineOf(W) && chance(w, 0.6)) {
    L.defense.doctrine = doctrineOf(W);
    chronicle(w, L, `📘 After its defeat by ${W.name}, ${L.name}'s review adopted ${DOCTRINES[doctrineOf(W)].label.toLowerCase()}.`);
  }
  // Both sides learn something.
  for (const f of Object.values(w.forces)) if (f.nation === loser || f.nation === winner) f.experience = Math.min(100, f.experience + (f.nation === loser ? 6 : 3));
}

// ---------- strategic forces ----------

export interface Strategic { warheads: number; legs: { land: boolean; sea: boolean; air: boolean }; doctrine: 'nofirstuse' | 'lastresort' | 'escalate'; missileDefence: number }
const NUCLEAR: Record<string, Strategic> = {
  USA: { warheads: 5044, legs: { land: true, sea: true, air: true }, doctrine: 'lastresort', missileDefence: 0.3 },
  RUS: { warheads: 5580, legs: { land: true, sea: true, air: true }, doctrine: 'escalate', missileDefence: 0.2 },
  CHN: { warheads: 600, legs: { land: true, sea: true, air: true }, doctrine: 'nofirstuse', missileDefence: 0.1 },
  GBR: { warheads: 225, legs: { land: false, sea: true, air: false }, doctrine: 'lastresort', missileDefence: 0 },
  IND: { warheads: 172, legs: { land: true, sea: true, air: true }, doctrine: 'nofirstuse', missileDefence: 0.1 },
};
export const STRATEGIC_DOCTRINE: Record<Strategic['doctrine'], string> = { nofirstuse: 'No first use', lastresort: 'Last resort', escalate: 'Escalate to de-escalate' };
export const strategicOf = (n: Nation): Strategic | null => n.strategic ?? null;

/** Genesis (and older worlds on first use): the five nuclear powers get their arsenals and launchable warheads at their bases. */
export function initStrategic(w: World) {
  for (const n of w.nations) {
    const s = NUCLEAR[n.iso];
    if (!s || n.strategic) continue;
    n.strategic = { ...s, legs: { ...s.legs } };
    if (!n.warheads.length) {
      const bases = w.regions.filter((r) => r.owner === n.id).sort((a, b) => b.bld.base - a.bld.base || b.pop - a.pop);
      const count = Math.max(1, Math.min(10, Math.round(s.warheads / 500)));
      for (let i = 0; i < count && bases.length; i++) {
        const r = bases[i % Math.min(3, bases.length)];
        const slot = n.warheads.find((x) => x.region === r.id);
        if (slot) slot.count++; else n.warheads.push({ region: r.id, count: 1 });
      }
    }
  }
}
/** Whether doctrine lets an AI government use nuclear weapons now. */
export function doctrinePermits(w: World, n: Nation, struckFirst: boolean): boolean {
  const d = strategicOf(n)?.doctrine ?? 'lastresort';
  if (d === 'nofirstuse') return struckFirst;
  if (d === 'escalate') return struckFirst || n.warScore <= -30;
  return struckFirst || n.warScore <= -60; // last resort: the state itself is threatened
}
/** Chance that missile defence intercepts an incoming warhead. */
export const interceptChance = (n: Nation) => strategicOf(n)?.missileDefence ?? 0;

// ---------- the politics of defence ----------

/** Lawmakers' extra support for a larger defence budget: contractors employ voters. */
export function defenceLobby(w: World, n: Nation): number {
  const co = contractorOf(w, n.id);
  return co ? Math.min(0.2, co.workers.length / 50) : 0;
}

// ---------- monthly ----------

function chronicle(w: World, n: Nation, text: string) {
  (n.chronicle ??= []).push({ t: w.time, text });
  if (n.chronicle.length > 200) n.chronicle.shift();
  record(w, 'military', text, { nation: n.id, important: n.id === player(w).nation });
}

export function forceStructureDaily(w: World) {
  if (dayOf(w.time) === 0 || !w.nations.some((n) => n.strategic)) initStrategic(w);
  // AI defence ministries exercise each branch about once a quarter, when they can afford it.
  for (const n of w.nations) {
    if (n.exile) continue;
    const president = n.president != null ? w.citizens[n.president] : null;
    if (president?.player || n.president == null) continue;
    if ((dayOf(w.time) + n.id) % 30 !== 0) continue;
    for (const b of ['army', 'navy', 'air'] as const) if (chance(w, 0.33) && !exerciseCheck(w, n.president, n, b)) holdExercise(w, n.president, n, b);
  }
}
