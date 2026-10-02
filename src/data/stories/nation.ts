// Stories of the nation's year (1.6 GEO 2): budget night for those in office, and a
// look back at the year for everyone, drawn from the State of the World report.
import type { Ctx } from '../../sim/story';
import { dateAt } from '../../engine/calendar';
import { ageOf, practise } from '../../sim/growth';
import { lifeOf } from '../../sim/lifecycle';
import { STRATEGY_INFO, budgetOf, setBudget } from '../../sim/nationalBudget';
import { TIER_LABEL } from '../../sim/forces';
import { done, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const inOffice = (c: Ctx) => { const n = c.w.nations[c.p.nation]; return n.president === c.p.id || n.deputies.includes(c.p.id) || Object.values(n.cabinet).includes(c.p.id); };

export const NATION_STORIES = [
  single({
    id: 'nat.budgetnight', icon: '📑', tags: ['politics'], weight: 6, cooldownDays: 30,
    title: (c) => `Budget night in ${c.w.nations[c.p.nation].name}`,
    bind: (w, p) => {
      const n = w.nations[p.nation];
      const st = n.strategy;
      const office = n.president === p.id || n.deputies.includes(p.id) || Object.values(n.cabinet).includes(p.id);
      return office && st && w.time - st.since < 7 * 1440 ? { bind: {}, key: `budget:${n.id}:${st.since}`, data: {} } : null;
    },
    text: (c) => {
      const n = c.w.nations[c.p.nation];
      const st = n.strategy!;
      return `The government lays out its plans: a strategy of ${STRATEGY_INFO[st.kind].label.toLowerCase()}, because ${st.why}. The chamber is full, and everyone wants to know where you stand.`;
    },
    choices: (c) => [
      { id: 'back', label: 'Back the budget', hint: '+influence; the government remembers', run: (c) => { const n = c.w.nations[c.p.nation]; c.p.influence += 1; const pr = n.president != null ? c.w.citizens[n.president] : null; if (pr && !pr.player) c.remember(pr, 5, 'backed my budget'); return done('You speak for the budget. It passes the first reading comfortably.'); } },
      { id: 'schools', label: 'Fight for more on schools and hospitals', hint: c.w.nations[c.p.nation].president === c.p.id ? 'as president: +0.5% of revenue each' : '+standing with voters, −with the government', run: (c) => {
        const n = c.w.nations[c.p.nation];
        if (n.president === c.p.id) { const b = budgetOf(n); setBudget(n, { ...b, education: b.education + 0.005, health: b.health + 0.005 }); return done('You add money for schools and hospitals before the budget goes to the vote.'); }
        c.p.influence += 1.5; const pr = n.president != null ? c.w.citizens[n.president] : null; if (pr && !pr.player) c.remember(pr, -2, 'made trouble over my budget');
        return done('Your speech on classrooms and waiting lists is the one the papers quote.');
      } },
      { id: 'against', label: 'Vote against it', hint: 'the government will not forget', why: inOffice(c) ? null : 'You hold no office.', run: (c) => { const n = c.w.nations[c.p.nation]; const pr = n.president != null ? c.w.citizens[n.president] : null; if (pr && !pr.player) c.remember(pr, -6, 'voted against my budget'); c.p.influence += 0.5; return done('You vote no. It passes anyway, but your name is on the record.'); } },
    ],
  }),
  single({
    id: 'nat.yearreview', icon: '🎆', tags: ['social'], weight: 6, cooldownDays: 300,
    title: (c) => `${c.num('year')} in review`,
    bind: (w, p) => {
      const d = dateAt(w.time);
      const r = w.yearReports?.at(-1);
      return d.month === 0 && d.day <= 7 && r && r.year === d.year - 1 && ageOf(w, p) >= 14 ? { bind: {}, key: `review:${r.year}:${p.id}`, data: { year: r.year } } : null;
    },
    text: (c) => {
      const r = c.w.yearReports!.at(-1)!;
      const row = r.rows.find((x) => x.nation === c.p.nation);
      const n = c.w.nations[c.p.nation];
      const how = row ? `${n.name} grew ${row.growth.toFixed(1)}% and ranks ${row.rank} of ${r.rows.length} in the world (${TIER_LABEL[row.tier].toLowerCase()}); unemployment is ${Math.round(row.unemployment * 100)}%.` : '';
      return `New Year. The papers look back on ${r.year}: ${r.headlines[0]} ${how} What about you?`;
    },
    choices: () => [
      { id: 'save', label: 'Resolve to put more money aside', hint: 'a calmer year ahead', run: (c) => { mood(c, 2, -4); return done('A new savings plan, written on the back of an envelope.'); } },
      { id: 'learn', label: 'Resolve to learn something new', hint: '+a little skill', run: (c) => { practise(c.w, c.p, 'eco', 1); mood(c, 2, 0); return done('You sign up for an evening course before the enthusiasm fades.'); } },
      { id: 'family', label: 'Resolve to spend more time with the people you love', hint: '+happiness', run: (c) => { mood(c, 5, -2); return done('The first day of the year, spent with the people who matter.'); } },
    ],
  }),
];
