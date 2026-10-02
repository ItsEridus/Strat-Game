// The mind (2.6 Life 2.0): personality that grows from experience, and values.
// - Values (0–1): family, career, faith, community and freedom. Everyone has them, from
//   their country (faith runs from about a fifth in Japan and China to most people in Saudi
//   Arabia and India, after Pew and the World Values Survey), their age (older people put
//   family, faith and community higher; younger ones career and freedom), their politics,
//   and their own nature (a stable hash). Values shape choices (marrying, having children),
//   strain or bond couples, and steer votes towards parties whose outlook fits.
// - Personality that grows: the five traits (ambition, appetite for risk, loyalty, greed,
//   activity) drift with what happens to a person, each change recorded with its cause:
//   war makes veterans cautious and loyal to their comrades; losing a job to a machine or
//   to redundancy breeds caution and holding on to money; promotion and office breed
//   ambition; prison breeds distrust; grief saps energy; going bust teaches frugality;
//   marriage and parenthood turn people towards family.
import type { Citizen, Ideology, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { hash01 } from '../engine/rng';
import { dataIso } from '../data/isoAlias';
import { ageOf } from './growth';
import { census } from './census';
import { jailed } from './query';
import { notify } from '../engine/events';

export type Value = 'family' | 'career' | 'faith' | 'community' | 'freedom';
export const VALUES: Value[] = ['family', 'career', 'faith', 'community', 'freedom'];
export const VALUE_LABEL: Record<Value, string> = { family: 'Family', career: 'Career', faith: 'Faith', community: 'Community', freedom: 'Freedom' };
type Trait = keyof Citizen['traits'];
export const TRAIT_LABEL: Record<Trait, string> = { ambition: 'ambition', risk: 'appetite for risk', loyalty: 'loyalty', greed: 'love of money', activity: 'energy' };

/** How religious each country is (share for whom religion is very important; Pew, rounded). */
const FAITH: Record<string, number> = { SAU: 0.85, IND: 0.75, TUR: 0.65, BRA: 0.65, MEX: 0.6, ZAF: 0.65, USA: 0.5, ARG: 0.45, RUS: 0.35, CAN: 0.3, AUS: 0.25, GBR: 0.25, DEU: 0.25, KOR: 0.3, JPN: 0.15, CHN: 0.12 };
/** What each political outlook values. */
const IDEO_VALUES: Record<Ideology, Record<Value, number>> = {
  capitalism: { family: 0.5, career: 0.85, faith: 0.4, community: 0.35, freedom: 0.8 },
  nationalism: { family: 0.75, career: 0.5, faith: 0.7, community: 0.65, freedom: 0.4 },
  centralism: { family: 0.5, career: 0.55, faith: 0.35, community: 0.65, freedom: 0.3 },
  socialism: { family: 0.55, career: 0.4, faith: 0.35, community: 0.85, freedom: 0.6 },
  imperialism: { family: 0.6, career: 0.6, faith: 0.55, community: 0.55, freedom: 0.3 },
  communism: { family: 0.45, career: 0.35, faith: 0.1, community: 0.9, freedom: 0.25 },
};

export interface MindChange { t: number; trait: Trait | Value; delta: number; why: string }
export interface Mind { values: Record<Value, number>; seen: Record<string, number>; log: MindChange[] }

/** A person's values as their country, age, politics and nature make them (computed, not stored). */
function baseValues(w: World, c: Citizen): Record<Value, number> {
  const n = w.nations[c.nation];
  const age = ageOf(w, c);
  const old = Math.max(-1, Math.min(1, (age - 40) / 30)); // -1 young .. +1 old
  const iv = IDEO_VALUES[c.ideo] ?? IDEO_VALUES.capitalism;
  const values = {} as Record<Value, number>;
  for (const [i, v] of VALUES.entries()) {
    let x = 0.25 + hash01(c.id, 2601 + i) * 0.5; // their own nature
    x = x * 0.6 + iv[v] * 0.4; // their politics
    if (v === 'faith') x = x * 0.5 + (FAITH[dataIso(n?.iso ?? 'USA')] ?? 0.4) * 0.5;
    if (v === 'family' || v === 'faith' || v === 'community') x += old * 0.08;
    if (v === 'career' || v === 'freedom') x -= old * 0.08;
    values[v] = Math.round(Math.max(0, Math.min(1, x)) * 100) / 100;
  }
  return values;
}
/** A person's values: as shaped by experience, or as they were born to them. */
export const valuesOf = (w: World, c: Citizen): Record<Value, number> => c.mind?.values ?? baseValues(w, c);
export const valueOf = (w: World, c: Citizen, v: Value) => valuesOf(w, c)[v];
/** The stored mind (created only once experience has shaped someone, to keep saves small). */
export function mindOf(w: World, c: Citizen): Mind {
  return (c.mind ??= { values: baseValues(w, c), seen: {}, log: [] });
}

/** How different two people's values are (0 = the same, 1 = opposite). */
export function valueDistance(w: World, a: Citizen, b: Citizen): number {
  const va = valuesOf(w, a), vb = valuesOf(w, b);
  return VALUES.reduce((t, v) => t + Math.abs(va[v] - vb[v]), 0) / VALUES.length;
}
/** How well a person's values fit a political outlook (0–1). */
export function ideologyFit(w: World, c: Citizen, ideo: Ideology): number {
  const va = valuesOf(w, c), iv = IDEO_VALUES[ideo];
  return 1 - VALUES.reduce((t, v) => t + Math.abs(va[v] - iv[v]), 0) / VALUES.length;
}

/** Record a change of personality or values, with its cause. */
export function shape(w: World, c: Citizen, what: Trait | Value, delta: number, why: string) {
  const m = mindOf(w, c);
  if ((VALUES as string[]).includes(what)) m.values[what as Value] = Math.round(Math.max(0, Math.min(1, m.values[what as Value] + delta)) * 100) / 100;
  else c.traits[what as Trait] = Math.round(Math.max(0, Math.min(1, c.traits[what as Trait] + delta)) * 1000) / 1000;
  m.log.push({ t: w.time, trait: what, delta, why });
  if (m.log.length > 12) m.log.shift();
  if (c.player) notify(w, 'personal', `🧠 ${why[0].toUpperCase()}${why.slice(1)}: your ${(VALUES as string[]).includes(what) ? `sense of ${VALUE_LABEL[what as Value].toLowerCase()}` : TRAIT_LABEL[what as Trait]} ${delta > 0 ? 'grew' : 'faded'}.`);
}

/** Once per experience (the key identifies it). */
function once(w: World, c: Citizen, key: string, f: () => void) {
  if (c.mind?.seen[key] != null) return;
  const m = mindOf(w, c);
  m.seen[key] = w.time;
  f();
  // Keep the record of experiences small.
  const keys = Object.keys(m.seen);
  if (keys.length > 30) delete m.seen[keys.sort((a, b) => m.seen[a] - m.seen[b])[0]];
}

/** A month of experience: what happened to each person shapes them. */
export function mindMonth(w: World) {
  const month = Math.floor(w.time / (30 * DAY));
  for (const c of census(w).all) {
    if (c.gone || ageOf(w, c) < 14) continue;
    const f = c.flags;
    if (f.veteranOf != null) once(w, c, `war:${f.veteranOf}`, () => { shape(w, c, 'risk', -0.06, 'surviving a war'); shape(w, c, 'loyalty', 0.04, 'the comradeship of war'); });
    if (f.displaced != null) once(w, c, `machine:${f.displaced}`, () => { shape(w, c, 'ambition', -0.03, 'losing a job to a machine'); shape(w, c, 'risk', -0.03, 'losing a job to a machine'); });
    if (c.benefit && c.benefit.until > w.time) once(w, c, `redundant:${c.benefit.until}`, () => shape(w, c, 'greed', 0.03, 'being made redundant'));
    if (c.post && c.post.grade >= 2 && w.time - c.post.promoted < 32 * DAY) once(w, c, `promo:${c.post.kind}:${c.post.grade}`, () => shape(w, c, 'ambition', 0.03, 'a promotion'));
    const n = w.nations[c.nation];
    if (n && (n.president === c.id || n.deputies.includes(c.id))) once(w, c, `office:${n.president === c.id ? 'p' : 'd'}:${n.termStart ?? 0}`, () => { shape(w, c, 'ambition', 0.03, 'holding office'); shape(w, c, 'risk', 0.02, 'holding office'); });
    if (jailed(w, c)) once(w, c, `jail:${Math.floor(month / 6)}`, () => { shape(w, c, 'loyalty', -0.05, 'time in prison'); shape(w, c, 'risk', 0.03, 'time in prison'); });
    if ((c.life?.grief ?? 0) > 30) once(w, c, `grief:${Math.floor(month / 12)}`, () => shape(w, c, 'activity', -0.03, 'grief'));
    if (f.bankrupt != null) once(w, c, `bust:${f.bankrupt}`, () => { shape(w, c, 'risk', -0.05, 'going bust'); shape(w, c, 'greed', -0.02, 'going bust'); });
    const fam = c.family;
    if (fam?.status === 'married') once(w, c, `married:${fam.partner}`, () => shape(w, c, 'family', 0.05, 'marriage'));
    if ((fam?.children?.length ?? 0) + (fam?.kids?.length ?? 0) > 0) once(w, c, 'parent', () => { shape(w, c, 'family', 0.1, 'becoming a parent'); shape(w, c, 'risk', -0.03, 'becoming a parent'); });
  }
}

export function mindDaily(w: World) {
  if (dateAt(w.time).day === 1) mindMonth(w);
}
