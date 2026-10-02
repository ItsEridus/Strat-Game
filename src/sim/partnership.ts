// Relationships under each country's laws (2.7 Life 2.0: the social fabric).
// - Who people are drawn to: most are straight; about 3% are gay or lesbian and 5% bisexual
//   (Gallup and national surveys put adults identifying as LGBT at 5–10%, more among the young).
//   The player can set their own.
// - Same-sex couples can marry where the law allows it (2025: the United States, Canada, Mexico,
//   Brazil, Argentina, Britain, Germany, South Africa and Australia), register a partnership where
//   there is one (Japan's local partnership certificates), and elsewhere live as partners without
//   legal recognition. Where it is persecuted (Saudi Arabia criminalises it; Russia treats it as
//   "extremism"), couples hide and many emigrate.
// - Divorce follows the law of the country: how far property is split equally (from an equal
//   split in Britain, Canada and Australia to little for wives under Saudi law), how long
//   maintenance (alimony) is paid by the better-off spouse (from none in Japan to years in Turkey
//   and India), and the waiting periods (Korea's and China's cooling-off month, India's six months).
import type { Citizen, Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { chance, hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { cref, player } from './query';
import { sexOf } from './looks';
import { leaveAbroad } from './population';

export type Orientation = 'straight' | 'gay' | 'bi';
export const ORIENT_LABEL: Record<Orientation, string> = { straight: 'straight', gay: 'gay or lesbian', bi: 'bisexual' };

/** Whom someone is drawn to (the player's choice, or from their nature). */
export function orientationOf(c: Citizen): Orientation {
  if (c.orient) return c.orient;
  const h = hash01(c.id, 2901);
  return h < 0.03 ? 'gay' : h < 0.08 ? 'bi' : 'straight';
}
/** Whether a is drawn to b. */
export function attracted(w: World, a: Citizen, b: Citizen): boolean {
  const o = orientationOf(a);
  if (o === 'bi') return true;
  const same = sexOf(w, a) === sexOf(w, b);
  return o === 'gay' ? same : !same;
}
export function mutual(w: World, a: Citizen, b: Citizen): boolean {
  if (!attracted(w, a, b) || !attracted(w, b, a)) return false;
  // Most bisexual people's partners are of the other sex: a same-sex pairing involving a bisexual person is rarer.
  if (sameSex(w, a, b) && (orientationOf(a) === 'bi' || orientationOf(b) === 'bi') && !(orientationOf(a) === 'gay' || orientationOf(b) === 'gay')) return hash01(Math.min(a.id, b.id), Math.max(a.id, b.id), 2902) < 0.3;
  return true;
}
export const sameSex = (w: World, a: Citizen, b: Citizen) => sexOf(w, a) === sexOf(w, b);

/** Family law (2025): same-sex unions, the share of property split equally, years of maintenance, waiting days. */
export type SameSexLaw = 'marriage' | 'partnership' | 'none' | 'persecuted';
interface Law { ss: SameSexLaw; split: number; alimony: number; wait: number; note: string }
const LAW_2025: Record<string, Law> = {
  USA: { ss: 'marriage', split: 0.9, alimony: 3, wait: 30, note: 'property divided by state law; maintenance common' },
  CAN: { ss: 'marriage', split: 1, alimony: 2, wait: 30, note: 'equal division of family property' },
  MEX: { ss: 'marriage', split: 0.9, alimony: 2, wait: 0, note: 'no-fault divorce; community property' },
  BRA: { ss: 'marriage', split: 1, alimony: 2, wait: 0, note: 'partial community of property' },
  ARG: { ss: 'marriage', split: 1, alimony: 1, wait: 0, note: 'express divorce, no fault needed' },
  GBR: { ss: 'marriage', split: 1, alimony: 2, wait: 180, note: 'equal sharing of assets; maintenance for the weaker party' },
  DEU: { ss: 'marriage', split: 0.9, alimony: 2, wait: 365, note: 'a year of separation; gains equalised' },
  ZAF: { ss: 'marriage', split: 1, alimony: 2, wait: 0, note: 'community of property by default' },
  AUS: { ss: 'marriage', split: 1, alimony: 1, wait: 365, note: 'twelve months apart first; property adjusted' },
  JPN: { ss: 'partnership', split: 0.7, alimony: 0, wait: 0, note: 'divorce by mutual consent; little maintenance' },
  KOR: { ss: 'none', split: 0.8, alimony: 0, wait: 30, note: 'a cooling-off month; property divided' },
  CHN: { ss: 'none', split: 0.8, alimony: 0, wait: 30, note: 'a 30-day cooling-off period' },
  IND: { ss: 'none', split: 0.5, alimony: 4, wait: 180, note: 'six months\' wait; maintenance for wives' },
  RUS: { ss: 'persecuted', split: 0.8, alimony: 0, wait: 30, note: 'simple divorce; child support' },
  TUR: { ss: 'none', split: 0.8, alimony: 5, wait: 0, note: 'maintenance can last indefinitely' },
  SAU: { ss: 'persecuted', split: 0.2, alimony: 0, wait: 90, note: 'divorce by the husband; a waiting period (iddah)' },
};
const DEFAULT_LAW: Law = { ss: 'none', split: 0.7, alimony: 1, wait: 30, note: 'divorce through the courts' };
export const lawOf = (n: Nation): Law => LAW_2025[dataIso(n.iso)] ?? DEFAULT_LAW;
export const SS_LABEL: Record<SameSexLaw, string> = { marriage: 'same-sex couples can marry', partnership: 'same-sex couples can register a partnership', none: 'same-sex couples have no legal recognition', persecuted: 'same-sex relationships are persecuted' };

/** Why a couple cannot marry here (null: they can). */
export function marriageBar(w: World, a: Citizen, b: Citizen, n: Nation): string | null {
  if (!sameSex(w, a, b)) return null;
  const law = lawOf(n).ss;
  return law === 'marriage' || law === 'partnership' ? null : `Same-sex couples cannot marry in ${n.name}.`;
}
/** What a couple's union is called. */
export const unionWord = (w: World, a: Citizen, b: Citizen, n: Nation) => (sameSex(w, a, b) && lawOf(n).ss === 'partnership' ? 'registered partnership' : 'marriage');

// ---------- divorce ----------

export interface Alimony { to: Id; amount: number; until: number; cur: string }

/** A divorce under the law of the country: property divided, maintenance from the better-off spouse. */
export function divorce(w: World, a: Citizen, b: Citizen, n: Nation): string {
  const law = lawOf(n);
  const code = n.cur;
  const [rich, poor] = (a.wallet[code] ?? 0) >= (b.wallet[code] ?? 0) ? [a, b] : [b, a];
  const share = law.split; // (under Saudi law a wife keeps little beyond her dowry)
  const transfer = Math.floor((((rich.wallet[code] ?? 0) - (poor.wallet[code] ?? 0)) / 2) * share);
  if (transfer > 0) pay(w, cref(rich.id), cref(poor.id), code, transfer, 'Divorce settlement');
  const gap = (rich.incomeAvg ?? 0) - (poor.incomeAvg ?? 0);
  let alimony = '';
  if (law.alimony > 0 && gap > 0) {
    const amount = Math.round(gap * 30 * 0.2);
    if (amount > 0) {
      rich.alimony = { to: poor.id, amount, until: w.time + law.alimony * 365 * DAY, cur: code };
      alimony = `; ${rich.name.split(' ')[0]} pays ${fmtAmt(code, amount)} a month in maintenance for ${law.alimony} year${law.alimony > 1 ? 's' : ''}`;
    }
  }
  return `Under ${n.adj} law (${law.note}), ${transfer > 0 ? `${fmtAmt(code, transfer)} passes from ${rich.name.split(' ')[0]} to ${poor.name.split(' ')[0]}` : 'there is little to divide'}${alimony}.`;
}

/** A month: maintenance paid; couples in hostile countries live in fear, and some leave. */
export function partnershipMonth(w: World) {
  for (const c of census(w).all) {
    const a = c.alimony;
    if (a) {
      const to = w.citizens[a.to];
      if (!to || to.gone || c.gone || w.time > a.until) delete c.alimony;
      else if (!pay(w, cref(c.id), cref(to.id), a.cur, Math.min(a.amount, Math.floor((c.wallet[a.cur] ?? 0) * 0.5)), 'Maintenance')) { /* paid what they could */ }
    }
    if (c.gone || c.player || c.family?.partner == null || c.id > c.family.partner) continue;
    const o = w.citizens[c.family.partner];
    if (!o || o.gone || !sameSex(w, c, o)) continue;
    const n = w.nations[c.nation];
    if (lawOf(n).ss === 'persecuted') {
      for (const x of [c, o]) if (x.life) x.life.stress = Math.min(100, x.life.stress + 2);
      if (chance(w, 0.01)) leaveAbroad(w, c, 'to live openly together');
    }
  }
}
export function partnershipDaily(w: World) {
  if (dateAt(w.time).day === 1) partnershipMonth(w);
}

// ---------- the player ----------

export function setOrientation(w: World, o: Orientation, c: Citizen = player(w)): Result {
  if (c.orient === o) return fail('Already so.');
  c.orient = o;
  return ok(`You are ${ORIENT_LABEL[o]}.`);
}
