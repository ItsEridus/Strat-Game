// Migration and integration (2.9 Life 2.0: culture and belonging).
// - Moving abroad as a life choice, on a visa:
//   - a work visa: points-based systems (Canada, Australia, Britain, Germany, Japan, Korea) want a
//     degree or proven skills; the United States draws lots for skilled visas (about one in four
//     succeed); elsewhere an employer sponsors you. Governments that close their doors grant
//     work visas only to graduates.
//   - a family visa, to join a spouse who is a citizen;
//   - a student visa, for the price of a year's tuition;
//   - asylum, for those whose country is at war or occupied, where the doors are open.
// - Settling in: the first year abroad is a strain (culture shock) that eases month by month, and
//   lonelier without others from home. People who came from the same country form a diaspora
//   community, one of their circles.
// - Sending money home: people working abroad send a share of their pay to their country of origin.
// - Becoming a citizen: after the years of residence each country requires (from two in
//   Argentina and three in Canada to five in most, and eleven in India; China and Saudi Arabia
//   almost never naturalise foreigners) and a test in the language.
import type { Citizen, Id, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { rank } from '../data/education';
import { census } from './census';
import { controller, cref, hhref, jailed, player } from './query';
import { ageOf } from './growth';
import { eduOfCitizen } from './education';
import { relocate } from './population';
import { activeWars } from './war';
import { demoOf } from './demography';
import { fluency, workLang, LANG_NAME } from './languages';

export type Visa = 'work' | 'family' | 'study' | 'asylum';
export const VISA_LABEL: Record<Visa, string> = { work: 'a work visa', family: 'a family visa', study: 'a student visa', asylum: 'asylum' };
/** Years of residence before naturalisation (2025, simplified; null: practically never). */
const RES_YEARS: Record<string, number | null> = { USA: 5, CAN: 3, MEX: 5, BRA: 4, ARG: 2, GBR: 6, DEU: 5, RUS: 5, TUR: 5, SAU: null, ZAF: 5, IND: 11, CHN: null, JPN: 5, KOR: 5, AUS: 4 };
const POINTS = new Set(['CAN', 'AUS', 'GBR', 'DEU', 'JPN', 'KOR']);
const resYears = (w: World, nation: Id) => { const v = RES_YEARS[dataIso(w.nations[nation].iso)]; return v === undefined ? 5 : v; };

export interface Residence { nation: Id; since: number; visa: Visa }
/** Where someone lives that is not their country, and since when. */
export function residenceOf(w: World, c: Citizen): Residence | null {
  const here = controller(w.regions[c.home]);
  if (here === c.nation) return null;
  if (c.residence?.nation === here) return c.residence;
  return { nation: here, since: c.dwelling?.since ?? c.born, visa: 'work' };
}
/** The country someone came from (for those who migrated). */
export const originOf = (c: Citizen): Id | null => c.origin ?? null;

// ---------- visas ----------

export const visaFee = (w: World, nation: Id, v: Visa) => Math.round(cur(v === 'asylum' ? 0 : v === 'study' ? (POINTS.has(dataIso(w.nations[nation].iso)) || dataIso(w.nations[nation].iso) === 'USA' ? 3000 : 800) : 600) / 10);
const graduate = (_w: World, c: Citizen) => rank(c.edu?.level ?? eduOfCitizen(c).level) >= rank('bachelor');

export function visaCheck(w: World, c: Citizen, nation: Id, v: Visa): string | null {
  const n = w.nations[nation];
  if (!n || n.exile || n.dissolved != null) return 'No such country.';
  if (nation === c.nation) return 'That is your own country.';
  if (ageOf(w, c) < 18) return 'You are too young to move abroad alone.';
  if (jailed(w, c)) return 'You are in prison.';
  if (controller(w.regions[c.home]) === nation) return `You already live in ${n.name}.`;
  if ((c.flags[`visaRefused:${nation}`] ?? -1e9) > w.time - 365 * DAY) return `${n.name} refused you a visa this year.`;
  const iso = dataIso(n.iso);
  const closed = demoOf(n).policy === 'closed';
  if (v === 'work') {
    if ((POINTS.has(iso) || closed || iso === 'USA') && !graduate(w, c) && (c.attrs.eco ?? 0) < 40) return `${n.name} grants work visas to graduates or skilled workers.`;
  } else if (v === 'family') {
    const partner = c.family?.status === 'married' && c.family.partner != null ? w.citizens[c.family.partner] : null;
    if (!partner || partner.nation !== nation) return 'A family visa is for joining a spouse who is a citizen there.';
  } else if (v === 'asylum') {
    const home = w.nations[c.nation];
    const danger = activeWars(w).some((x) => x.att === home.id || x.def === home.id) || w.regions.some((r) => r.owner === home.id && r.occ);
    if (!danger) return 'Asylum is for people fleeing war or persecution.';
    if (closed) return `${n.name} is not taking refugees.`;
  }
  const code = w.nations[c.nation].cur;
  if ((c.wallet[code] ?? 0) < visaFee(w, nation, v) + cur(20)) return `The visa and the move cost about ${fmtAmt(code, visaFee(w, nation, v) + cur(20))}.`;
  return null;
}

/** Move abroad on a visa: your household goes with you; you start again in the capital. */
export function emigrate(w: World, nation: Id, v: Visa, c: Citizen = player(w)): Result {
  const why = visaCheck(w, c, nation, v);
  if (why) return fail(why);
  const n = w.nations[nation];
  const code = w.nations[c.nation].cur;
  pay(w, cref(c.id), hhref(c.nation), code, visaFee(w, nation, v) + cur(20), `Visa and move to ${n.name}`);
  // The American visa lottery.
  if (v === 'work' && dataIso(n.iso) === 'USA' && hash01(c.id, Math.floor(w.time / (365 * DAY)), 3601) > 0.25) {
    c.flags[`visaRefused:${nation}`] = w.time;
    return ok(`🎲 Your application went into the visa lottery, and was not drawn this year. You can try again next year.`);
  }
  const dest = w.regions.find((r) => r.id === n.capital && r.owner === nation) ?? w.regions.find((r) => r.owner === nation);
  if (!dest) return fail(`${n.name} has no territory.`);
  c.origin ??= c.nation;
  relocate(w, c, dest.id, `starting a new life in ${n.name}`);
  c.residence = { nation, since: w.time, visa: v };
  if (c.dwelling) c.dwelling = { kind: 'rent', region: dest.id, size: 'room', since: w.time };
  return ok(`✈️ You moved to ${dest.name}, ${n.name}, on ${VISA_LABEL[v]}. A rented room, a new language${fluency(w, c, workLang(w, nation)) < 45 ? ` (you will need ${LANG_NAME[workLang(w, nation)]} to work here)` : ''}, and everything to learn.`);
}

// ---------- settling in ----------

/** Months since someone moved to the country they live in (abroad). */
export function monthsAbroad(w: World, c: Citizen): number | null {
  const r = residenceOf(w, c);
  return r ? (w.time - r.since) / (30 * DAY) : null;
}
/** Settling in, in the reckoning of happiness and stress (sim/wellbeing.ts). */
export function migrantParts(w: World, c: Citizen, hasDiaspora: boolean): { happy: [string, number][]; stress: [string, number][] } {
  const m = monthsAbroad(w, c);
  if (m == null || m >= 12) return { happy: [], stress: [] };
  const k = 1 - m / 12;
  return { happy: hasDiaspora ? [] : [['homesickness', -Math.round(4 * k)]], stress: [['settling in abroad', Math.round(8 * k)]] };
}

// ---------- becoming a citizen ----------

/** Why someone cannot yet apply to naturalise (the player; the rules for everyone else stay simple). */
export function naturalisationBar(w: World, c: Citizen, nation: Id): string | null {
  if (!c.player) return null;
  const r = residenceOf(w, c);
  if (!r || r.nation !== nation) return null; // (moving with a new state, or the old rules)
  const years = resYears(w, nation);
  if (years == null) return `${w.nations[nation].name} almost never naturalises foreigners.`;
  const have = (w.time - r.since) / (365 * DAY);
  if (have < years) return `${w.nations[nation].name} requires ${years} years of residence (you have ${have.toFixed(1)}).`;
  const l = workLang(w, nation);
  if (fluency(w, c, l) < 45) return `The citizenship test is in ${LANG_NAME[l]}: you need to be conversational.`;
  return null;
}
export const yearsToCitizenship = (w: World, c: Citizen): number | null => {
  const r = residenceOf(w, c);
  if (!r) return null;
  const y = resYears(w, r.nation);
  return y == null ? null : Math.max(0, y - (w.time - r.since) / (365 * DAY));
};

// ---------- monthly ----------

/** A month: migrants send money home. */
export function migrationMonth(w: World) {
  for (const c of census(w).all) {
    const o = c.origin;
    if (o == null || c.gone || o === controller(w.regions[c.home]) || !w.households[o]) continue;
    const income = (c.incomeAvg ?? 0) * 30;
    if (income <= 0) continue;
    const n = w.nations[c.nation];
    const code = n.cur;
    const amt = Math.min(Math.round(income * 0.08), Math.floor((c.wallet[code] ?? 0) * 0.1));
    if (amt > 0) pay(w, cref(c.id), hhref(o), code, amt, `Money sent home to ${w.nations[o].name}`);
  }
}
export function migrationDaily(w: World) {
  if (dateAt(w.time).day === 1) migrationMonth(w);
}
