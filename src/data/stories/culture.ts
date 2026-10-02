// Stories of culture and belonging (2.9): a festival coming, a newcomer's first invitation, a
// family's doubts about a partner of another faith, and the citizenship ceremony. They act through
// the normal rules (festivals, circles, faith, languages, citizenship).
import type { Ctx } from '../../sim/story';
import { dayOf } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { c as cur, fmtAmt } from '../../engine/money';
import { cref, hhref } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { adjustRel } from '../../sim/social';
import { RELIGION_INFO, devout, religionOf, upcoming } from '../../sim/faith';
import { fluency, workLang, LANG_NAME } from '../../sim/languages';
import { monthsAbroad, naturalisationBar, residenceOf } from '../../sim/migration';
import { applyCitizenship, citizenshipCheck } from '../../sim/travel';
import { residents } from '../../sim/census';
import { done, first, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const kin = (c: Ctx) => [...(c.p.family?.partner != null ? [c.p.family.partner] : []), ...(c.p.family?.parents ?? []), ...(c.p.family?.children ?? [])].map((id) => c.w.citizens[id]).filter((x) => x && !x.gone);

export const CULTURE_STORIES = [
  single({
    id: 'culture.festival', icon: '🎉', tags: ['personal'], weight: 7, cooldownDays: 40,
    title: (c) => `${c.str('name')} is coming`,
    bind: (w, p) => {
      const f = upcoming(w, p, 4).find((x) => x.t > w.time);
      return f ? { bind: {}, key: `fest:${f.id}:${dayOf(f.t)}`, data: { name: f.name, religious: f.religion ? 1 : 0 } } : null;
    },
    text: (c) => `${c.str('name')} is a few days away. The shops are full of it, and the family group chat has started to ask who is doing what.`,
    choices: (c) => [
      { id: 'host', label: 'Host it this year', hint: `the family together; about ${fmtAmt(c.w.nations[c.p.nation].cur, cur(6))}`, why: (c.p.wallet[c.w.nations[c.p.nation].cur] ?? 0) < cur(6) ? 'You cannot afford it.' : null, run: (c) => { pay(c.w, cref(c.p.id), hhref(c.p.nation), c.w.nations[c.p.nation].cur, cur(6), 'Festival food and gifts'); for (const x of kin(c)) adjustRel(x, c.p.id, 4); mood(c, 5, 3); return done('Too much food, too many people, the good plates out. Everyone stays later than they meant to.'); } },
      ...(c.num('religious') ? [{ id: 'worship', label: 'Go to the service', hint: 'peace, and your congregation', run: (c: Ctx) => { mood(c, 3, -4); return done('Candles, old words, familiar faces. You leave lighter than you came.'); } }] : []),
      { id: 'quiet', label: 'Keep it quiet this year', hint: 'rest', run: (c) => { mood(c, 1, -2); return done('A quiet day, a long walk, an early night. Next year, perhaps.'); } },
    ],
  }),
  single({
    id: 'culture.newcomer', icon: '🧳', tags: ['social'], weight: 7, cooldownDays: 60,
    title: () => 'An invitation next door',
    bind: (w, p) => {
      const m = monthsAbroad(w, p);
      if (m == null || m > 9) return null;
      const n = residents(w, p.home).find((x) => !x.player && !x.gone && x.origin == null);
      return n ? { bind: { host: n.id }, key: `newcomer:${Math.floor(dayOf(w.time) / 60)}`, data: {} } : null;
    },
    text: (c) => `${c.cit('host')!.name} from next door knocks with a dish of something homemade and an invitation to Sunday lunch. You understand about half of what they say.`,
    choices: () => [
      { id: 'yes', label: 'Go, and try the language', hint: 'a friend, and some of the language', run: (c) => {
        const h = c.cit('host')!; adjustRel(h, c.p.id, 10); adjustRel(c.p, h.id, 10);
        const l = workLang(c.w, c.w.regions[c.p.home].owner); const L = (c.p.langs ??= {}); L[l] = Math.min(95, (L[l] ?? fluency(c.w, c.p, l)) + 3);
        mood(c, 4, 1);
        return done(`Three hours, four courses and a great deal of pointing. Your ${LANG_NAME[l]} is better for it, and so is your street.`);
      } },
      { id: 'no', label: 'Thank them, but stay in', hint: 'safe, and lonely', run: (c) => { adjustRel(c.cit('host')!, c.p.id, 2); mood(c, -2, 0); return done('You eat the dish alone, and it is very good.'); } },
    ],
  }),
  single({
    id: 'culture.interfaith', icon: '🕊️', tags: ['romance'], weight: 5, cooldownDays: 365,
    title: () => 'A family with doubts',
    bind: (w, p) => {
      const partner = p.family?.partner != null ? w.citizens[p.family.partner] : null;
      if (!partner || religionOf(w, partner) === religionOf(w, p)) return null;
      const parent = (p.family?.parents ?? []).map((id) => w.citizens[id]).find((x) => x && !x.gone && devout(w, x));
      return parent ? { bind: { parent: parent.id, partner: partner.id }, key: `interfaith:${partner.id}`, data: {} } : null;
    },
    text: (c) => `${c.cit('parent')!.name} takes you aside after dinner. "${first(c.cit('partner')!.name)} is lovely. But they are not ${RELIGION_INFO[religionOf(c.w, c.cit('parent')!)].people}. Have you thought about the children? About us?"`,
    choices: (c) => [
      { id: 'firm', label: 'Stand by your partner', hint: 'your partner grateful, your parent hurt', run: (c) => { adjustRel(c.cit('partner')!, c.p.id, 8); adjustRel(c.cit('parent')!, c.p.id, -8); mood(c, 0, 4); return done('"I love them. That is the whole of it." The silence that follows is long, but it is not the end of the conversation.'); } },
      { id: 'bridge', label: 'Bring them together over a meal', hint: 'it may help', run: (c) => { const ok = (c.cit('parent')!.rel[c.p.id] ?? 0) > 20; if (ok) { adjustRel(c.cit('parent')!, c.cit('partner')!.id, 10); mood(c, 4, -2); return done(`An awkward start, then a shared joke, then ${first(c.cit('parent')!.name)} asking for the recipe. A beginning.`); } mood(c, -2, 5); return done('A stiff, polite evening. Nobody shouts; nobody is persuaded.'); } },
      { id: 'faith', label: `Ask ${first(c.cit('partner')!.name)} about taking your faith`, hint: 'a big ask', run: (c) => { const pt = c.cit('partner')!; if ((pt.rel[c.p.id] ?? 0) > 70 && !devout(c.w, pt)) { pt.religion = religionOf(c.w, c.p); adjustRel(c.cit('parent')!, c.p.id, 6); return done(`${first(pt.name)} thinks about it for a week, then agrees. Your parent cries at the ceremony.`); } adjustRel(pt, c.p.id, -10); return done(`${first(pt.name)} goes very quiet. "You knew who I was when we met."`); } },
    ],
  }),
  single({
    id: 'culture.citizenship', icon: '🛂', tags: ['politics'], weight: 6, cooldownDays: 180,
    title: (c) => `${c.str('country')} could be home`,
    bind: (w, p) => {
      const r = residenceOf(w, p);
      if (!r || naturalisationBar(w, p, r.nation) || r.nation === p.nation) return null;
      return { bind: { s: r.nation }, key: `natz:${r.nation}:${Math.floor(dayOf(w.time) / 180)}`, data: { country: w.nations[r.nation].name } };
    },
    text: (c) => `You have lived in ${c.str('country')} long enough, and your ${LANG_NAME[workLang(c.w, c.num('s'))]} is good enough, to apply for citizenship. A form, a fee, a test, and an oath.`,
    choices: () => [
      { id: 'apply', label: 'Apply', hint: 'the fee; the government decides', run: (c) => { const why = citizenshipCheck(c.w, c.p, c.num('s')); if (why) return done(`Not yet: ${why}`); const r = applyCitizenship(c.w, c.p, c.num('s')); mood(c, 3, 2); return done(r.msg); } },
      { id: 'wait', label: 'Not yet', hint: 'keep your passport', run: (c) => done(`You keep your ${c.w.nations[c.p.nation].adj} passport for now. Home is complicated.`) },
    ],
  }),
];

