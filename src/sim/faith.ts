// Faith and festivals (2.9 Life 2.0: culture and belonging).
// - Religions by country (Pew Research, about 2020, rounded): Christians are most Americans,
//   Mexicans, Brazilians and South Africans; Muslims nearly all Turks and Saudis; Hindus four in
//   five Indians; most Chinese, Japanese and Koreans, and two Britons and Germans in five, follow
//   no religion (with Buddhism and folk religion common in East Asia). Everyone has a religion or
//   none, matching how much faith matters to them (mind.ts): the devout are rarely of no religion.
// - Congregations: believers of the same religion in a place form a circle (circles.ts).
// - Festivals: each religion's great feasts (Christmas and Easter, the two Eids, Diwali, the Lunar
//   New Year, Vesak, Rosh Hashanah and Hanukkah) and each country's national days, on their real
//   dates (moving feasts calculated, or followed through the lunar calendar). Those who keep a
//   festival are happier for it and see their families.
// - Faith in love: devout people of different religions get on less easily; when they marry,
//   one sometimes takes the other's faith.
import type { Citizen, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt, timeOfDate } from '../engine/calendar';
import { notify } from '../engine/events';
import { hash01 } from '../engine/rng';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { player } from './query';
import { ok, type Result } from '../engine/result';
import { adjustRel } from './social';
import { valueOf } from './mind';

export type Religion = 'christian' | 'muslim' | 'hindu' | 'buddhist' | 'jewish' | 'folk' | 'none';
export const RELIGION_INFO: Record<Religion, { label: string; icon: string; place: string; people: string }> = {
  christian: { label: 'Christianity', icon: '✝️', place: 'church', people: 'Christian' },
  muslim: { label: 'Islam', icon: '☪️', place: 'mosque', people: 'Muslim' },
  hindu: { label: 'Hinduism', icon: '🕉️', place: 'temple', people: 'Hindu' },
  buddhist: { label: 'Buddhism', icon: '☸️', place: 'temple', people: 'Buddhist' },
  jewish: { label: 'Judaism', icon: '✡️', place: 'synagogue', people: 'Jewish' },
  folk: { label: 'Folk religion', icon: '⛩️', place: 'shrine', people: 'follows folk religion' },
  none: { label: 'No religion', icon: '○', place: '', people: 'of no religion' },
};
type Shares = Partial<Record<Religion, number>>;
const SHARES_2025: Record<string, Shares> = {
  USA: { christian: 0.63, none: 0.29, jewish: 0.02, muslim: 0.01, buddhist: 0.01, hindu: 0.01, folk: 0.03 },
  CAN: { christian: 0.53, none: 0.35, muslim: 0.05, hindu: 0.02, buddhist: 0.01, jewish: 0.01, folk: 0.03 },
  MEX: { christian: 0.88, none: 0.1, folk: 0.02 }, BRA: { christian: 0.87, none: 0.1, folk: 0.03 },
  ARG: { christian: 0.8, none: 0.17, jewish: 0.01, folk: 0.02 },
  GBR: { christian: 0.46, none: 0.37, muslim: 0.065, hindu: 0.017, jewish: 0.005, buddhist: 0.005, folk: 0.038 },
  DEU: { christian: 0.51, none: 0.41, muslim: 0.06, folk: 0.02 },
  RUS: { christian: 0.71, none: 0.15, muslim: 0.1, buddhist: 0.01, folk: 0.03 },
  TUR: { muslim: 0.97, none: 0.02, christian: 0.01 }, SAU: { muslim: 0.93, christian: 0.04, hindu: 0.01, folk: 0.02 },
  ZAF: { christian: 0.78, none: 0.11, muslim: 0.02, hindu: 0.01, folk: 0.08 },
  IND: { hindu: 0.8, muslim: 0.14, christian: 0.02, folk: 0.04 },
  CHN: { none: 0.52, folk: 0.22, buddhist: 0.18, christian: 0.05, muslim: 0.02, hindu: 0.01 },
  JPN: { none: 0.57, buddhist: 0.35, folk: 0.06, christian: 0.02 },
  KOR: { none: 0.51, christian: 0.28, buddhist: 0.16, folk: 0.05 },
  AUS: { christian: 0.44, none: 0.39, muslim: 0.03, buddhist: 0.025, hindu: 0.027, folk: 0.038 },
};
const sharesOf = (iso: string): Shares => SHARES_2025[dataIso(iso)] ?? { christian: 0.5, none: 0.3, muslim: 0.1, folk: 0.1 };

/** A person's religion: chosen (or converted to), or from their country and how much faith matters to them. */
export function religionOf(w: World, c: Citizen): Religion {
  if (c.religion) return c.religion;
  const s = sharesOf(w.nations[c.nation]?.iso ?? 'USA');
  const faith = valueOf(w, c, 'faith');
  const none = s.none ?? 0;
  // As many as the country's share are of no religion, but never the devout.
  if (none > 0 && faith < 0.6 && hash01(c.id, 3401) < none * 0.95) return 'none';
  const rel = (Object.entries(s) as [Religion, number][]).filter(([k]) => k !== 'none');
  const total = rel.reduce((t, [, v]) => t + v, 0);
  let x = hash01(c.id, 3402) * total;
  for (const [k, v] of rel) { x -= v; if (x <= 0) return k; }
  return rel[0]?.[0] ?? 'none';
}
/** Whether someone practises (goes to services, keeps the festivals with devotion). */
export const devout = (w: World, c: Citizen) => religionOf(w, c) !== 'none' && valueOf(w, c, 'faith') >= 0.55;
/** The largest religion of a country (its places of worship). */
export function majorityOf(iso: string): Religion {
  const s = sharesOf(iso);
  return (Object.entries(s) as [Religion, number][]).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'christian';
}

// ---------- festivals ----------

export interface Festival { id: string; name: string; icon: string; religion?: Religion; nations?: string[]; t: number }

/** Easter Sunday (the Gregorian computus). */
function easter(y: number): [number, number] {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1];
}
/** A lunar feast: the 2025 date moved by whole lunar years (about 11 days earlier each solar year), kept within a window. */
function lunar(y: number, m0: number, d0: number, wrap: boolean): number {
  let t = timeOfDate(2025, m0, d0) + Math.round((y - 2025) * 354.367) * DAY;
  if (wrap) { const lo = timeOfDate(y, m0, d0) - 19 * DAY; while (t < lo) t += Math.round(29.53 * DAY); while (t > lo + 30 * DAY) t -= Math.round(29.53 * DAY); }
  return t;
}
/** The fourth Thursday of November. */
const thanksgiving = (y: number) => { const first = new Date(Date.UTC(y, 10, 1)).getUTCDay(); return 1 + ((4 - first + 7) % 7) + 21; };

/** All festivals of a year. */
export function festivalsOf(y: number): Festival[] {
  const [em, ed] = easter(y);
  const F = (id: string, name: string, icon: string, t: number, o: Partial<Festival> = {}): Festival => ({ id, name, icon, t, ...o });
  const day = (m: number, d: number) => timeOfDate(y, m, d);
  return [
    F('christmas', 'Christmas', '🎄', day(11, 25), { religion: 'christian' }),
    F('easter', 'Easter', '🐣', day(em, ed), { religion: 'christian' }),
    F('eidfitr', 'Eid al-Fitr', '🌙', lunar(y, 2, 30, false), { religion: 'muslim' }),
    F('eidadha', 'Eid al-Adha', '🐑', lunar(y, 5, 6, false), { religion: 'muslim' }),
    F('diwali', 'Diwali', '🪔', lunar(y, 9, 20, true), { religion: 'hindu' }),
    F('vesak', 'Vesak', '🪷', lunar(y, 4, 12, true), { religion: 'buddhist' }),
    F('roshhashanah', 'Rosh Hashanah', '🍎', lunar(y, 8, 23, true), { religion: 'jewish' }),
    F('hanukkah', 'Hanukkah', '🕎', lunar(y, 11, 15, true), { religion: 'jewish' }),
    F('lunarny', 'the Lunar New Year', '🧧', lunar(y, 0, 29, true), { nations: ['CHN', 'KOR'] }),
    F('chuseok', 'Chuseok', '🌕', lunar(y, 9, 6, true), { nations: ['KOR'] }),
    F('obon', 'Obon', '🏮', day(7, 15), { nations: ['JPN'] }),
    F('newyear', 'New Year\'s Day', '🎆', day(0, 1)),
    F('july4', 'Independence Day', '🎆', day(6, 4), { nations: ['USA'] }),
    F('thanksgiving', 'Thanksgiving', '🦃', day(10, thanksgiving(y)), { nations: ['USA'] }),
    F('canadaday', 'Canada Day', '🍁', day(6, 1), { nations: ['CAN'] }),
    F('mexind', 'Independence Day', '🇲🇽', day(8, 16), { nations: ['MEX'] }),
    F('carnival', 'Carnival', '🎭', day(em, ed) - 47 * DAY, { nations: ['BRA'] }),
    F('mayrev', 'May Revolution Day', '🇦🇷', day(4, 25), { nations: ['ARG'] }),
    F('unity', 'German Unity Day', '🇩🇪', day(9, 3), { nations: ['DEU'] }),
    F('victory', 'Victory Day', '🎖️', day(4, 9), { nations: ['RUS'] }),
    F('republic', 'Republic Day', '🇹🇷', day(9, 29), { nations: ['TUR'] }),
    F('saudinational', 'Saudi National Day', '🇸🇦', day(8, 23), { nations: ['SAU'] }),
    F('freedom', 'Freedom Day', '🇿🇦', day(3, 27), { nations: ['ZAF'] }),
    F('indrepublic', 'Republic Day', '🇮🇳', day(0, 26), { nations: ['IND'] }),
    F('national', 'National Day (Golden Week)', '🇨🇳', day(9, 1), { nations: ['CHN'] }),
    F('ausday', 'Australia Day', '🇦🇺', day(0, 26), { nations: ['AUS'] }),
    F('remembrance', 'Remembrance Sunday', '🌺', day(10, 9 + ((7 - new Date(Date.UTC(y, 10, 9)).getUTCDay()) % 7)), { nations: ['GBR'] }),
  ];
}
/** Does this person keep this festival (their faith's, or their country's)? */
export function keeps(w: World, c: Citizen, f: Festival): boolean {
  if (f.religion) return religionOf(w, c) === f.religion;
  if (f.nations) return f.nations.includes(dataIso(w.nations[c.nation]?.iso ?? ''));
  return true;
}
const dayKey = (t: number) => Math.floor(t / DAY);
/** Festivals falling today. */
export function festivalsToday(w: World): Festival[] {
  const k = dayKey(w.time);
  return festivalsOf(dateAt(w.time).year).filter((f) => dayKey(f.t) === k);
}
/** The festivals someone keeps in the coming days. */
export function upcoming(w: World, c: Citizen, days = 60): Festival[] {
  const y = dateAt(w.time).year;
  return [...festivalsOf(y), ...festivalsOf(y + 1)].filter((f) => f.t >= w.time - DAY && f.t <= w.time + days * DAY && keeps(w, c, f)).sort((a, b) => a.t - b.t);
}

/** Daily: a festival day lifts those who keep it and brings families together. */
export function faithDaily(w: World) {
  const today = festivalsToday(w);
  if (!today.length) return;
  const p = player(w);
  for (const f of today) {
    for (const c of census(w).all) {
      if (c.gone || !keeps(w, c, f)) continue;
      if (c.life) c.life.happiness = Math.min(100, c.life.happiness + (f.religion && devout(w, c) ? 4 : 2));
      if (!c.player && c.family?.partner != null) { const o = w.citizens[c.family.partner]; if (o && !o.gone) adjustRel(c, o.id, 1); }
    }
    if (keeps(w, p, f)) notify(w, 'personal', `${f.icon} Today is ${f.name}.${f.religion && devout(w, p) ? ' A day for worship and family.' : ' A holiday.'}`, { link: 'life' });
  }
}

// ---------- faith in love ----------

/** Devout people of different religions get on less easily (sim/family.ts). */
export const faithGap = (w: World, a: Citizen, b: Citizen) => (religionOf(w, a) !== religionOf(w, b) && (devout(w, a) || devout(w, b)) ? 0.15 : 0);
/** At a wedding, the less devout spouse sometimes takes the other's faith. */
export function weddingFaith(w: World, a: Citizen, b: Citizen) {
  const ra = religionOf(w, a), rb = religionOf(w, b);
  if (ra === rb) return;
  const [strong, weak] = valueOf(w, a, 'faith') >= valueOf(w, b, 'faith') ? [a, b] : [b, a];
  if (devout(w, strong) && hash01(weak.id, strong.id, 3403) < 0.3) {
    weak.religion = religionOf(w, strong);
    if (weak.player) notify(w, 'personal', `${RELIGION_INFO[weak.religion].icon} You have taken ${strong.name.split(' ')[0]}'s faith: ${RELIGION_INFO[weak.religion].label}.`);
  }
}
/** Take up (or leave) a religion (the player). */
export function setReligion(w: World, r: Religion, c: Citizen = player(w)): Result {
  c.religion = r;
  return ok(r === 'none' ? 'You no longer count yourself religious.' : `${RELIGION_INFO[r].icon} You now follow ${RELIGION_INFO[r].label.toLowerCase()}.`);
}

/** The religious make-up of a country's people. */
export function religionStats(w: World, nation: number): [Religion, number][] {
  const counts = new Map<Religion, number>();
  let n = 0;
  for (const c of census(w).all) if (!c.gone && c.nation === nation) { n++; const r = religionOf(w, c); counts.set(r, (counts.get(r) ?? 0) + 1); }
  return [...counts.entries()].map(([r, k]) => [r, k / Math.max(1, n)] as [Religion, number]).sort((a, b) => b[1] - a[1]);
}
