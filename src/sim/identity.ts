// Identity (2.9 Life 2.0: culture and belonging): national pride, regional attachment, and division.
// - National pride: each country's mood about itself (after the World Values Survey "very proud"
//   shares, and moving with events): it rises with a strong economy, standing in the world (soft
//   power), military success and a popular government, and falls with defeat and decline.
// - Each person's pride follows their country's, their age (older people prouder), how much they
//   value community, and their politics; people who came from abroad, or speak a minority mother
//   tongue, are prouder of where they came from, or of their region.
// - Regional attachment is strong where a region has an identity of its own (Scotland, Quebec,
//   Catalonia-like regions: data/identity.ts) and among those who speak its own language.
// - Division: a country is divided when its politics are split between opposed camps, when many
//   are newcomers under a nationalist government, and when minorities of faith and language feel
//   apart. A divided country is harder to govern: approval falls and independence movements grow.
// - In politics, the proud lean towards nationalist parties; the strongly regional, towards
//   independence.
import type { Citizen, Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { controller, seatShare } from './query';
import { ageOf } from './growth';
import { valueOf } from './mind';
import { identityOf } from './secession';
import { softPowerOf } from './softPower';
import { leaderProfile } from './relations';
import { majorityOf, religionOf } from './faith';
import { languagesOf, workLang } from './languages';
import { historyPace } from './strategic';

/** National pride, 2025 (share "very proud" in the World Values Survey, rounded, as 0–100). */
const PRIDE_2025: Record<string, number> = { USA: 70, CAN: 60, MEX: 80, BRA: 60, ARG: 60, GBR: 50, DEU: 25, RUS: 60, TUR: 75, SAU: 75, ZAF: 65, IND: 80, CHN: 70, JPN: 30, KOR: 30, AUS: 65 };
export const prideOfNation = (n: Nation) => (n.pride ??= PRIDE_2025[dataIso(n.iso)] ?? 55);
export const divisionOf = (n: Nation) => n.division ?? 30;

/** Someone speaks a minority mother tongue in their country. */
const minorityTongue = (w: World, c: Citizen) => { const l = languagesOf(w, c); const work = workLang(w, controller(w.regions[c.home])); return (l[work] ?? 0) < 90; };

/** A person's pride in their country (0–100). */
export function prideOf(w: World, c: Citizen): number {
  const n = w.nations[c.nation];
  if (!n) return 50;
  let p = prideOfNation(n);
  p += (Math.min(80, ageOf(w, c)) - 40) * 0.4;
  p += (valueOf(w, c, 'community') - 0.5) * 30;
  if (c.ideo === 'nationalism' || c.ideo === 'imperialism') p += 15; else if (c.ideo === 'socialism' || c.ideo === 'communism') p -= 8;
  if (c.origin != null && c.origin !== c.nation) p -= 20;
  if (minorityTongue(w, c)) p -= 10;
  return Math.round(Math.max(0, Math.min(100, p)));
}
/** A person's attachment to their region (0–100). */
export function regionalOf(w: World, c: Citizen): number {
  const r = w.regions[c.home];
  const id = identityOf(r);
  let a = 20 + id * 2.5 + (Math.min(80, ageOf(w, c)) - 40) * 0.2;
  if (minorityTongue(w, c)) a += 15;
  if (c.origin != null) a -= 15;
  return Math.round(Math.max(0, Math.min(100, a)));
}

/** How divided a country is (0–100). */
export function measureDivision(w: World, n: Nation): number {
  const share = seatShare(w, n);
  const camps = (share.nationalism ?? 0) + (share.imperialism ?? 0);
  const left = (share.socialism ?? 0) + (share.communism ?? 0);
  const split = Math.min(camps, left) * 2; // two opposed camps of similar size
  let people = 0, newcomers = 0, minority = 0;
  const maj = majorityOf(n.iso);
  for (const c of census(w).all) {
    if (c.gone || c.nation !== n.id) continue;
    people++;
    if (c.origin != null) newcomers++;
    const r = religionOf(w, c);
    if (r !== maj && r !== 'none') minority++;
  }
  const nat = leaderProfile(w, n).nationalism;
  const d = split * 60 + (newcomers / Math.max(1, people)) * 100 * nat * 1.5 + (minority / Math.max(1, people)) * 40 + (100 - prideOfNation(n)) * 0.15;
  return Math.round(Math.max(0, Math.min(100, d)));
}

function monthly(w: World) {
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    // Pride follows the country's fortunes.
    const growth = n.demo?.growth ?? 0;
    const target = (PRIDE_2025[dataIso(n.iso)] ?? 55) + (softPowerOf(n) - 50) / 4 + (n.warScore ?? 0) / 6 + (n.approval - 50) / 6 + growth * 2;
    const p = prideOfNation(n);
    n.pride = Math.round(Math.max(5, Math.min(95, p + (target - p) * 0.05)) * 10) / 10;
    // Division.
    const d = measureDivision(w, n);
    n.division = Math.round((divisionOf(n) + (d - divisionOf(n)) * 0.2) * 10) / 10;
    if ((n.division ?? 0) > 60) n.approval = Math.max(5, n.approval - 0.5); // a divided country is hard to govern
  }
}
export function identityDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}

/** Identity in a voter's view of a party (sim/politics.ts): the proud lean nationalist. */
export function identityVote(w: World, voter: Citizen, ideo: Citizen['ideo']): number {
  const p = prideOf(w, voter) - 50;
  return ideo === 'nationalism' || ideo === 'imperialism' ? p / 6 : ideo === 'socialism' || ideo === 'communism' ? -p / 12 : 0;
}
/** How much a divided country and its people's regional attachment add to independence support (sim/secession.ts). */
export const identityAlienation = (n: Nation) => Math.max(0, divisionOf(n) - 40) / 300;
