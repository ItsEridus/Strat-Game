// Languages (2.9 Life 2.0: culture and belonging).
// - Each country's languages (2025): English in the United States (with Spanish), Britain and
//   Australia; English and French in Canada; Spanish in Mexico and Argentina; Portuguese in
//   Brazil; German, Russian, Turkish (with Kurdish), Arabic, Mandarin, Japanese and Korean; in
//   India Hindi with Bengali, Telugu and others, and English as a common second language; in South
//   Africa Zulu, Xhosa, Afrikaans and English.
// - Everyone speaks their mother tongue, and many a second language: English is widely spoken in
//   Germany, South Africa and India, much less in China, Japan, Brazil and Russia (after the EF
//   English Proficiency Index, simplified).
// - Learning: a language course (weekly lessons, paid) or living where it is spoken. Fluency
//   (0–100) grows faster at first and with aptitude.
// - Language matters abroad: working in a country needs some of its language (a little for manual
//   work, more for skilled), and people without a common language find it harder to become friends.
import type { Citizen, World } from './types';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { controller, cref, hhref, player } from './query';

export type Lang = 'en' | 'es' | 'fr' | 'pt' | 'de' | 'ru' | 'tr' | 'ku' | 'ar' | 'zh' | 'ja' | 'ko' | 'hi' | 'bn' | 'te' | 'zu' | 'xh' | 'af';
export const LANG_NAME: Record<Lang, string> = { en: 'English', es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German', ru: 'Russian', tr: 'Turkish', ku: 'Kurdish', ar: 'Arabic', zh: 'Mandarin', ja: 'Japanese', ko: 'Korean', hi: 'Hindi', bn: 'Bengali', te: 'Telugu', zu: 'Zulu', xh: 'Xhosa', af: 'Afrikaans' };
/** Mother tongues by country (shares), the language of work, and how many speak English well as a second language. */
const LANGS_2025: Record<string, { native: [Lang, number][]; work: Lang; english: number }> = {
  USA: { native: [['en', 0.87], ['es', 0.13]], work: 'en', english: 1 }, CAN: { native: [['en', 0.75], ['fr', 0.25]], work: 'en', english: 0.9 },
  MEX: { native: [['es', 1]], work: 'es', english: 0.12 }, BRA: { native: [['pt', 1]], work: 'pt', english: 0.1 }, ARG: { native: [['es', 1]], work: 'es', english: 0.25 },
  GBR: { native: [['en', 1]], work: 'en', english: 1 }, DEU: { native: [['de', 0.95], ['tr', 0.05]], work: 'de', english: 0.6 },
  RUS: { native: [['ru', 1]], work: 'ru', english: 0.1 }, TUR: { native: [['tr', 0.85], ['ku', 0.15]], work: 'tr', english: 0.15 },
  SAU: { native: [['ar', 1]], work: 'ar', english: 0.3 }, ZAF: { native: [['zu', 0.35], ['xh', 0.25], ['af', 0.2], ['en', 0.2]], work: 'en', english: 0.6 },
  IND: { native: [['hi', 0.6], ['bn', 0.2], ['te', 0.2]], work: 'hi', english: 0.2 }, CHN: { native: [['zh', 1]], work: 'zh', english: 0.1 },
  JPN: { native: [['ja', 1]], work: 'ja', english: 0.15 }, KOR: { native: [['ko', 1]], work: 'ko', english: 0.25 }, AUS: { native: [['en', 1]], work: 'en', english: 1 },
};
const langData = (iso: string) => LANGS_2025[dataIso(iso)] ?? { native: [['en', 1]] as [Lang, number][], work: 'en' as Lang, english: 0.3 };
/** The language of work in a country. */
export const workLang = (w: World, nation: number) => langData(w.nations[nation].iso).work;

/** The languages someone speaks, with fluency (0–100). */
export function languagesOf(w: World, c: Citizen): Partial<Record<Lang, number>> {
  if (c.langs) return c.langs;
  return bornLanguages(w, c);
}
function bornLanguages(w: World, c: Citizen): Partial<Record<Lang, number>> {
  // Migrants grew up with their home country's languages, and have some of their new country's.
  const from = c.origin != null && w.nations[c.origin] ? w.nations[c.origin] : null;
  if (from) {
    const o = bornFrom(c, langData(from.iso));
    const work = langData(w.nations[c.nation]?.iso ?? 'USA').work;
    o[work] = Math.max(o[work] ?? 0, 30 + Math.round(hash01(c.id, 3505) * 40));
    return o;
  }
  return bornFrom(c, langData(w.nations[c.nation]?.iso ?? 'USA'));
}
function bornFrom(c: Citizen, d: ReturnType<typeof langData>): Partial<Record<Lang, number>> {
  let x = hash01(c.id, 3501);
  let mother: Lang = d.native[0][0];
  for (const [l, s] of d.native) { x -= s; if (x <= 0) { mother = l; break; } }
  const out: Partial<Record<Lang, number>> = { [mother]: 100 };
  if (d.work !== mother) out[d.work] = Math.max(out[d.work] ?? 0, 60 + Math.round(hash01(c.id, 3502) * 35)); // the language of school and work
  if (!out.en && hash01(c.id, 3503) < d.english) out.en = 50 + Math.round(hash01(c.id, 3504) * 40);
  return out;
}
export const fluency = (w: World, c: Citizen, l: Lang) => languagesOf(w, c)[l] ?? 0;
export const fluencyLabel = (v: number) => (v >= 90 ? 'native' : v >= 70 ? 'fluent' : v >= 45 ? 'conversational' : v >= 20 ? 'basic' : 'a few words');
/** The best language two people share (0: none). */
export function commonLanguage(w: World, a: Citizen, b: Citizen): number {
  const la = languagesOf(w, a), lb = languagesOf(w, b);
  let best = 0;
  for (const [l, v] of Object.entries(la)) best = Math.max(best, Math.min(v ?? 0, lb[l as Lang] ?? 0));
  return best;
}
/** Fluency needed to work in a country: a little for manual work, more for skilled. */
export function languageBar(w: World, c: Citizen, nation: number, skilled: boolean): string | null {
  const l = workLang(w, nation);
  const need = skilled ? 55 : 25;
  return fluency(w, c, l) >= need ? null : `You need ${skilled ? 'conversational' : 'basic'} ${LANG_NAME[l]} to work here (yours: ${fluencyLabel(fluency(w, c, l))}).`;
}

// ---------- learning ----------

const learnable = (w: World, c: Citizen) => (c.langs ??= bornLanguages(w, c));
export const COURSE_USD = 120; // a month of lessons
export function courseCheck(w: World, c: Citizen, l: Lang): string | null {
  if (fluency(w, c, l) >= 90) return 'You speak it like a native.';
  if (c.course === l) return 'You are already taking lessons.';
  const n = w.nations[c.nation];
  if ((c.wallet[n.cur] ?? 0) < Math.round(cur(COURSE_USD) / 10)) return `A month of lessons costs ${fmtAmt(n.cur, Math.round(cur(COURSE_USD) / 10))}.`;
  return null;
}
/** Start a language course (weekly lessons, paid monthly, until you stop or are fluent). */
export function startCourse(w: World, l: Lang, c: Citizen = player(w)): Result {
  const why = courseCheck(w, c, l);
  if (why) return fail(why);
  c.course = l;
  learnable(w, c);
  return ok(`🗣️ ${LANG_NAME[l]} lessons, twice a week: ${fmtAmt(w.nations[c.nation].cur, Math.round(cur(COURSE_USD) / 10))} a month.`);
}
export function stopCourse(w: World, c: Citizen = player(w)): Result {
  if (!c.course) return fail('You are not taking lessons.');
  delete c.course;
  return ok('Lessons stopped.');
}
/** How much someone's fluency grows in a month (faster at first, with aptitude). */
const gain = (c: Citizen, now: number, rate: number) => rate * (1.2 - now / 100) * (0.6 + (c.life?.aptitude ?? 50) / 100);

/** A month: lessons and living abroad teach languages; a language barrier is a strain. */
export function languagesMonth(w: World) {
  for (const c of census(w).all) {
    if (c.gone) continue;
    const here = controller(w.regions[c.loc] ?? w.regions[c.home]);
    const local = workLang(w, here);
    // Living where a language is spoken (people who arrived from elsewhere learn it).
    if (c.langs || fluency(w, c, local) < 90) {
      const now = fluency(w, c, local);
      if (now < 90 && (c.langs || here !== c.nation || c.origin != null)) { const L = learnable(w, c); L[local] = Math.min(95, Math.round((now + gain(c, now, 4)) * 10) / 10); }
    }
    if (c.course) {
      const n = w.nations[c.nation];
      const fee = Math.round(cur(COURSE_USD) / 10);
      if (!pay(w, cref(c.id), hhref(n.id), n.cur, fee, `${LANG_NAME[c.course]} lessons`)) { delete c.course; continue; }
      const L = learnable(w, c);
      const now = L[c.course] ?? 0;
      L[c.course] = Math.min(95, Math.round((now + gain(c, now, 8)) * 10) / 10);
      if ((L[c.course] ?? 0) >= 90) delete c.course;
    }
  }
}
export function languagesDaily(w: World) {
  if (dateAt(w.time).day === 1) languagesMonth(w);
}
/** A language barrier in the reckoning of stress (sim/wellbeing.ts). */
export function languageStrain(w: World, c: Citizen): number {
  const here = controller(w.regions[c.loc] ?? w.regions[c.home]);
  const f = fluency(w, c, workLang(w, here));
  return f >= 45 ? 0 : Math.round((45 - f) / 6);
}
