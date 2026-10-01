// Prisons as institutions (1.7 Law & Order). Every country runs a prison system with
// places, inmates and conditions. How many people it locks up follows the country's
// real incarceration rate (World Prison Brief, 2023–24: about 33 per 100,000 people in
// Japan, over 500 in the United States) and moves with crime. Places are built when
// the police budget is above its usual level and lost when it is cut; conditions
// follow funding and overcrowding. Sentences are longer where courts are harsher.
//
// Inside, a prisoner can work for a small wage, take classes and keep out of trouble
// (conduct), meet the prison gangs, apply for parole once part of the sentence is
// served, or try to escape. Crowded, underfunded prisons riot. On release, a record
// shuts the door of employers that run background checks (state companies and the
// medicine, aerospace and electronics industries) until it is spent, and released
// prisoners are more likely to offend again.
import type { Citizen, Company, Id, Nation, World } from './types';
import { DAY, dayOf } from '../engine/clock';
import { fmtDay } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { pay } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { chance } from '../engine/rng';
import { cref, jailed, natref, player, syndref } from './query';
import { census } from './census';
import { practise } from './growth';
import { lifeOf } from './lifecycle';
import { realMinWage } from './wages';
import { budgetOf } from './nationalBudget';
import { baselineOf } from '../data/nationBaselines';
import { openCase } from './crime';

export interface JusticeData {
  rate: number; // prisoners per 100,000 people (World Prison Brief, rounded)
  occupancy: number; // inmates per official place in 2024
  sentence: number; // length of sentences against the median country
  parole: number; // share of the sentence served before parole can be granted
  reoffend: number; // share of released prisoners reconvicted within two years (approximate)
  spentYears: number; // years until a conviction no longer shows on a background check
}

export const JUSTICE: Record<string, JusticeData> = {
  USA: { rate: 541, occupancy: 1.0, sentence: 1.8, parole: 0.85, reoffend: 0.44, spentYears: 7 },
  CAN: { rate: 104, occupancy: 0.9, sentence: 0.9, parole: 0.33, reoffend: 0.3, spentYears: 5 },
  MEX: { rate: 170, occupancy: 1.1, sentence: 1.3, parole: 0.6, reoffend: 0.35, spentYears: 5 },
  BRA: { rate: 390, occupancy: 1.4, sentence: 1.3, parole: 0.4, reoffend: 0.42, spentYears: 5 },
  ARG: { rate: 240, occupancy: 1.2, sentence: 1.1, parole: 0.66, reoffend: 0.38, spentYears: 5 },
  GBR: { rate: 140, occupancy: 1.0, sentence: 1.1, parole: 0.5, reoffend: 0.37, spentYears: 4 },
  DEU: { rate: 67, occupancy: 0.85, sentence: 0.7, parole: 0.66, reoffend: 0.33, spentYears: 3 },
  RUS: { rate: 300, occupancy: 0.8, sentence: 1.6, parole: 0.66, reoffend: 0.45, spentYears: 6 },
  TUR: { rate: 400, occupancy: 1.2, sentence: 1.4, parole: 0.5, reoffend: 0.4, spentYears: 5 },
  SAU: { rate: 200, occupancy: 1.0, sentence: 1.3, parole: 0.75, reoffend: 0.3, spentYears: 5 },
  ZAF: { rate: 250, occupancy: 1.3, sentence: 1.3, parole: 0.5, reoffend: 0.45, spentYears: 10 },
  IND: { rate: 40, occupancy: 1.3, sentence: 1.0, parole: 0.66, reoffend: 0.25, spentYears: 5 },
  CHN: { rate: 120, occupancy: 1.0, sentence: 1.4, parole: 0.5, reoffend: 0.3, spentYears: 5 },
  JPN: { rate: 33, occupancy: 0.6, sentence: 0.9, parole: 0.66, reoffend: 0.4, spentYears: 5 },
  KOR: { rate: 105, occupancy: 1.1, sentence: 1.0, parole: 0.66, reoffend: 0.25, spentYears: 5 },
  AUS: { rate: 165, occupancy: 1.1, sentence: 1.1, parole: 0.6, reoffend: 0.45, spentYears: 10 },
};
export const justiceOf = (n: Nation): JusticeData => JUSTICE[n.iso] ?? JUSTICE.ARG;

export interface PrisonSystem {
  places: number;
  inmates: number;
  conditions: number; // 0..100
  riots: number; // riots since the start
  escapes: number;
  lastRiot?: number;
  hist: { t: number; inmates: number; places: number }[]; // monthly
  staffing?: number; // prison officers against posts (0..1)
}

/** The usual police share of revenue, against which prison funding is measured. */
const POLICE_NORM = 0.03;

const popOf = (w: World, n: Nation) => w.regions.reduce((t, r) => t + (r.owner === n.id ? r.pop : 0), 0);
const crimeOf = (w: World, n: Nation) => {
  const rs = w.regions.filter((r) => r.owner === n.id);
  return rs.length ? rs.reduce((t, r) => t + r.crime, 0) / rs.length : 30;
};

export function prisonOf(w: World, n: Nation): PrisonSystem {
  if (n.prison) return n.prison;
  const j = justiceOf(n);
  const inmates = Math.round((popOf(w, n) * j.rate) / 1e5);
  n.prison = { places: Math.round(inmates / j.occupancy), inmates, conditions: 0, riots: 0, escapes: 0, hist: [] };
  n.prison.conditions = conditionsTarget(n, n.prison);
  return n.prison;
}

export const occupancy = (p: PrisonSystem) => p.inmates / Math.max(1, p.places);
export const funding = (n: Nation) => budgetOf(n).police / POLICE_NORM;

/** Conditions follow funding, the state's effectiveness and overcrowding. */
function conditionsTarget(n: Nation, p: PrisonSystem) {
  const eff = baselineOf(n.iso).effectiveness;
  return Math.max(5, Math.min(95, 30 + eff * 45 + (funding(n) - 1) * 25 - Math.max(0, occupancy(p) - 1) * 60 + ((p.staffing ?? 0.6) - 0.6) * 20));
}

/** How long courts send people away for, against the median country. */
export const sentenceFactor = (n: Nation) => justiceOf(n).sentence;
export const incarcerationRate = (w: World, n: Nation) => (prisonOf(w, n).inmates / Math.max(1, popOf(w, n))) * 1e5;

export function prisonsDaily(w: World) {
  const day = dayOf(w.time);
  for (const n of w.nations) {
    if (n.exile) continue;
    const p = prisonOf(w, n);
    const j = justiceOf(n);
    // Inmates follow crime (30 is a typical level) at the country's real rate.
    const want = (popOf(w, n) * j.rate * (0.6 + crimeOf(w, n) / 75)) / 1e5;
    p.inmates = Math.max(0, Math.round(p.inmates + (want - p.inmates) * 0.01));
    // Places: built slowly when funding is above the usual level, lost when it is cut.
    const f = funding(n);
    p.places = Math.max(1, Math.round(p.places * (1 + (f - 1) * 0.0004)));
    const rs = w.regions.filter((r) => r.owner === n.id && r.staff?.prison != null);
    p.staffing = rs.length ? rs.reduce((t, r) => t + r.staff!.prison!, 0) / rs.length : 0.6;
    p.conditions += (conditionsTarget(n, p) - p.conditions) * 0.05;
    if (day % 30 === 0) { p.hist.push({ t: w.time, inmates: p.inmates, places: p.places }); if (p.hist.length > 60) p.hist.shift(); }
    // Riots: crowded, run-down prisons boil over.
    const pressure = Math.max(0, occupancy(p) - 1.15) * Math.max(0, 40 - p.conditions) / 40;
    if (pressure > 0 && chance(w, Math.min(0.05, pressure * 0.04)) && (p.lastRiot ?? -1e12) < w.time - 60 * DAY) riot(w, n, p);
  }
  for (const c of census(w).all) {
    if (!jailed(w, c)) continue;
    const n = w.nations[c.nation];
    const p = prisonOf(w, n);
    // NPC escapes are rare and need lax, crowded prisons.
    if (!c.player && chance(w, Math.max(0, (1 - p.conditions / 100) * Math.max(0.5, occupancy(p)) * 0.0008))) escape(w, c, true);
    if (c.player) insideDaily(w, c, n, p);
  }
}

function riot(w: World, n: Nation, p: PrisonSystem) {
  p.riots++;
  p.lastRiot = w.time;
  p.places = Math.max(1, Math.round(p.places * 0.98));
  p.conditions = Math.max(5, p.conditions - 10);
  n.approval = Math.max(0, n.approval - 2);
  const text = `🔥 A riot broke out in an overcrowded ${n.name} prison (${Math.round(occupancy(p) * 100)}% full). Wings were burned out before order was restored.`;
  (n.chronicle ??= []).push({ t: w.time, text });
  if (n.chronicle.length > 200) n.chronicle.shift();
  record(w, 'justice', text, { nation: n.id, important: n.id === player(w).nation });
  const inside = census(w).all.filter((c) => jailed(w, c) && c.nation === n.id && !c.player);
  for (const c of inside) if (chance(w, 0.2)) escape(w, c, true);
  const pl = player(w);
  if (jailed(w, pl) && pl.nation === n.id) {
    const l = lifeOf(pl);
    l.stress = Math.min(100, l.stress + 20);
    pl.health = Math.max(5, (pl.health ?? 90) - 8);
    notify(w, 'personal', '🔥 A riot tore through your prison. You kept your head down and came out bruised.', { critical: true, link: 'crime' });
  }
}

// ---------- life inside (the player and anyone else) ----------

export interface Inside { since: number; conduct: number; worked: number; studied: number; hearing: number; gang: number; earned: number }
export const insideOf = (c: Citizen): Inside => (c.sec.inside ??= { since: 0, conduct: 50, worked: -1, studied: -1, hearing: 0, gang: -1, earned: 0 });

/** Called when a court sends someone to prison. */
export function admit(w: World, c: Citizen) {
  c.sec.inside = { since: w.time, conduct: 50, worked: -1, studied: -1, hearing: 0, gang: -1, earned: 0 };
  const p = prisonOf(w, w.nations[c.nation]);
  p.inmates++;
}

/** Called on release (end of sentence, parole or escape). */
export function release(w: World, c: Citizen, how: 'served' | 'parole' | 'escape' | 'quashed') {
  c.sec.jailUntil = 0;
  c.sec.inside = undefined;
  if (how === 'served' || how === 'parole') c.sec.releasedAt = w.time;
  const p = prisonOf(w, w.nations[c.nation]);
  p.inmates = Math.max(0, p.inmates - 1);
  if (c.player && how === 'served') notify(w, 'personal', '🔓 You have been released from prison. A record will follow you to job interviews for a while.', { link: 'crime' });
}

/** A day inside for the player: the gangs notice newcomers in crowded, run-down prisons. */
function insideDaily(w: World, c: Citizen, n: Nation, p: PrisonSystem) {
  const ins = insideOf(c);
  const day = dayOf(w.time);
  ins.conduct = Math.min(100, ins.conduct + 1);
  if (ins.gang === day || c.sec.syndicate != null) return; // members of an organisation are protected inside
  const risk = Math.max(0.03, (occupancy(p) - 0.7) * (1 - p.conditions / 100) * 0.5);
  if (!chance(w, risk)) return;
  ins.gang = day;
  const code = n.cur;
  const s = Object.values(w.syndicates).filter((x) => x.nation === n.id).sort((a, b) => b.strength - a.strength)[0];
  const fee = Math.round(realMinWage(w, n.id) * 2);
  if (s && (c.wallet[code] ?? 0) >= fee && chance(w, 0.6)) {
    pay(w, cref(c.id), syndref(s.id), code, fee, `Protection inside (${s.name})`);
    notify(w, 'personal', `🔪 Men from ${s.name} explained how things work on the wing. Protection cost you ${fmtAmt(code, fee)}.`, { link: 'crime' });
  } else {
    c.health = Math.max(5, (c.health ?? 90) - 6);
    lifeOf(c).stress = Math.min(100, lifeOf(c).stress + 10);
    ins.conduct = Math.max(0, ins.conduct - 5);
    notify(w, 'personal', '🔪 You were jumped in the yard. A split lip, a cracked rib, and a mark against your conduct for fighting back.', { link: 'crime' });
  }
}

const PRISON_ENERGY = 15;

export function prisonWorkCheck(w: World, c: Citizen): string | null {
  if (!jailed(w, c)) return 'Only prisoners work in the prison workshops.';
  if (insideOf(c).worked === dayOf(w.time)) return 'You have done today\'s shift.';
  if (c.energy < PRISON_ENERGY) return `Needs ${PRISON_ENERGY} energy.`;
  return null;
}
/** A shift in the prison workshop or kitchen: a fraction of the minimum wage, paid by the state, and good conduct. */
export function prisonWork(w: World, c: Citizen): Result {
  const why = prisonWorkCheck(w, c);
  if (why) return fail(why);
  const n = w.nations[c.nation];
  const ins = insideOf(c);
  ins.worked = dayOf(w.time);
  c.energy -= PRISON_ENERGY;
  ins.conduct = Math.min(100, ins.conduct + 6);
  const wage = Math.max(1, Math.round(realMinWage(w, n.id) * 0.15));
  if (pay(w, natref(n.id), cref(c.id), n.cur, wage, 'Prison work')) ins.earned += wage;
  practise(w, c, 'end', 0.3);
  return ok(`A shift in the workshop: ${fmtAmt(n.cur, wage)} and a good word in your file.`);
}

export function prisonClassCheck(w: World, c: Citizen): string | null {
  if (!jailed(w, c)) return 'Prison classes are for prisoners.';
  if (insideOf(c).studied === dayOf(w.time)) return 'The class meets once a day.';
  if (c.energy < PRISON_ENERGY) return `Needs ${PRISON_ENERGY} energy.`;
  if (prisonOf(w, w.nations[c.nation]).conditions < 20) return 'The education wing is closed: there is no money for teachers.';
  return null;
}
/** A class in the education wing: skills for the outside and a better file for the parole board. */
export function prisonClass(w: World, c: Citizen): Result {
  const why = prisonClassCheck(w, c);
  if (why) return fail(why);
  const ins = insideOf(c);
  ins.studied = dayOf(w.time);
  c.energy -= PRISON_ENERGY;
  ins.conduct = Math.min(100, ins.conduct + 4);
  practise(w, c, 'eco', 0.6);
  lifeOf(c).stress = Math.max(0, lifeOf(c).stress - 3);
  return ok('Two hours of bookkeeping and letters. The teacher says you have a head for it.');
}

/** When the parole board can first hear a case. */
export const paroleFrom = (w: World, c: Citizen) => {
  const ins = insideOf(c);
  const len = Math.max(0, c.sec.jailUntil - ins.since);
  return ins.since + len * justiceOf(w.nations[c.nation]).parole;
};
export const paroleChance = (w: World, c: Citizen) => {
  const p = prisonOf(w, w.nations[c.nation]);
  // Boards weigh conduct and record; crowded systems release more.
  return Math.max(0.05, Math.min(0.9, 0.15 + insideOf(c).conduct / 150 - c.sec.record.convictions * 0.05 + Math.max(0, occupancy(p) - 1) * 0.4));
};
export function paroleCheck(w: World, c: Citizen): string | null {
  if (!jailed(w, c)) return 'You are not in prison.';
  if (w.time < paroleFrom(w, c)) return `Eligible for parole from ${fmtDay(paroleFrom(w, c))}.`;
  if (insideOf(c).hearing && w.time - insideOf(c).hearing < 3 * DAY) return 'The board heard you recently; it sits again in a few days.';
  return null;
}
/** A parole hearing: release on licence for the rest of the sentence, or back to the wing. */
export function paroleHearing(w: World, c: Citizen): Result {
  const why = paroleCheck(w, c);
  if (why) return fail(why);
  const ins = insideOf(c);
  ins.hearing = w.time;
  if (!chance(w, paroleChance(w, c))) {
    lifeOf(c).stress = Math.min(100, lifeOf(c).stress + 5);
    return ok('The board reads your file, asks two questions and turns you down. You can apply again in a few days.');
  }
  release(w, c, 'parole');
  if (c.player) record(w, 'justice', `🔓 ${c.name} was released on parole.`, { cit: c.id, player: true });
  return ok('Parole granted. You walk out with a bus ticket and a probation officer\'s phone number.');
}

export const escapeChance = (w: World, c: Citizen) => {
  const p = prisonOf(w, w.nations[c.nation]);
  return Math.max(0.03, Math.min(0.4, 0.04 + (1 - p.conditions / 100) * 0.12 + Math.max(0, occupancy(p) - 1) * 0.1));
};
export function escapeCheck(w: World, c: Citizen): string | null {
  if (!jailed(w, c)) return 'You are not in prison.';
  if (c.energy < 40) return 'Needs 40 energy.';
  return null;
}
/** Try to break out: freedom with every police force looking for you, or more time and a ruined file. */
export function tryEscape(w: World, c: Citizen): Result {
  const why = escapeCheck(w, c);
  if (why) return fail(why);
  c.energy -= 40;
  if (chance(w, escapeChance(w, c))) { escape(w, c, false); return ok('Over the wall and into the night. Every officer in the country has your photograph.'); }
  const ins = insideOf(c);
  ins.conduct = Math.max(0, ins.conduct - 40);
  const left = Math.max(0, c.sec.jailUntil - w.time);
  c.sec.jailUntil = w.time + left * 1.5 + 2 * DAY;
  c.health = Math.max(5, (c.health ?? 90) - 5);
  return ok('Caught at the fence. Extra time, the segregation unit, and no parole board will look kindly on you now.');
}

function escape(w: World, c: Citizen, quiet: boolean) {
  const p = prisonOf(w, w.nations[c.nation]);
  p.escapes++;
  release(w, c, 'escape');
  c.sec.heat = Math.min(100, c.sec.heat + 80);
  openCase(w, c, 'escape', c.loc, 60, 0);
  if (!quiet || c.nation === player(w).nation) record(w, 'justice', `🏃 ${c.name} escaped from prison in ${w.nations[c.nation].name}.`, { nation: c.nation, cit: c.id });
}

// ---------- visits ----------

export function visitCheck(w: World, c: Citizen): string | null {
  if (!jailed(w, c)) return 'Visits are for prisoners.';
  if ((c.sec.last.visit ?? -1e12) > w.time - 7 * DAY) return 'One visiting order a week.';
  return null;
}
/** A visiting order: someone close comes to see you. */
export function requestVisit(w: World, c: Citizen): Result {
  const why = visitCheck(w, c);
  if (why) return fail(why);
  c.sec.last.visit = w.time;
  const close = Object.entries(c.rel).map(([id, v]) => [w.citizens[Number(id)], v] as const).filter(([x, v]) => x && !x.gone && !jailed(w, x) && v >= 30).sort((a, b) => b[1] - a[1]);
  if (!close.length) { lifeOf(c).stress = Math.min(100, lifeOf(c).stress + 3); return ok('Visiting hour comes and goes. Nobody came.'); }
  const [v] = close[0];
  const l = lifeOf(c);
  l.happiness = Math.min(100, l.happiness + 6);
  l.stress = Math.max(0, l.stress - 10);
  insideOf(c).conduct = Math.min(100, insideOf(c).conduct + 3);
  c.rel[v.id] = Math.min(100, (c.rel[v.id] ?? 0) + 3);
  return ok(`${v.name} came to visit. Forty minutes across a table, and the week feels shorter.`);
}

// ---------- re-entry ----------

/** Industries whose employers check criminal records. */
const VETTED = new Set(['medicine', 'wa', 'electronics']);
export const vetted = (co: Company) => co.owner.k === 'nat' || VETTED.has(co.industry);
/** The time until a conviction is spent (no longer shows on a background check). */
export const spentAt = (w: World, c: Citizen) => (c.sec.releasedAt != null && c.sec.record.convictions > 0 ? c.sec.releasedAt + justiceOf(w.nations[c.nation]).spentYears * 365 * DAY : 0);
export const hasLiveRecord = (w: World, c: Citizen) => spentAt(w, c) > w.time;
/** Why a background check turns this person away, if it does. */
export function recordBars(w: World, c: Citizen, co: Company): string | null {
  return vetted(co) && hasLiveRecord(w, c) ? `${co.name} runs background checks, and your conviction is not yet spent.` : null;
}
/** Extra pull towards crime in the years after prison (higher where many reoffend). */
export const reoffendPull = (w: World, c: Citizen) => {
  if (c.sec.releasedAt == null || w.time - c.sec.releasedAt > 2 * 365 * DAY) return 0;
  return justiceOf(w.nations[c.nation]).reoffend * 0.5;
};

/** The monthly record of the prison population, for the Law & Order screen. */
export const prisonHistory = (w: World, nation: Id) => prisonOf(w, w.nations[nation]).hist;
