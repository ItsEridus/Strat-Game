// Stories of the social fabric (2.7): a rumour going round about you, a family row at the
// holiday table, the visiting arrangements after a divorce, and the club that wants you as its
// chair. They act through the normal rules (rumours, grudges and memories, circles, custody).
import type { Ctx } from '../../sim/story';
import { dayOf } from '../../engine/clock';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { adjustRel } from '../../sim/social';
import { answerRumour, rumoursAbout } from '../../sim/gossip';
import { note, tieWith } from '../../sim/ties';
import { circlesOf, standingIn } from '../../sim/circles';
import { childrenAway, holidayOf } from '../../sim/familyLife';
import { dateAt } from '../../engine/calendar';
import { chance } from '../../engine/rng';
import { done, first, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };

export const SOCIAL_STORIES = [
  single({
    id: 'social.rumour', icon: '🗣️', tags: ['social'], weight: 8, cooldownDays: 30,
    title: () => 'People are talking',
    bind: (w, p) => {
      const r = rumoursAbout(w, p.id).find((x) => x.sign < 0 && x.heard.length >= 3);
      if (!r) return null;
      return { bind: { ...(r.by != null ? { source: r.by } : {}) }, key: `rumour:${r.id}`, data: { rid: r.id, text: r.text, truth: r.truth ? 1 : 0 } };
    },
    text: (c) => `Conversations stop when you walk in. Someone finally tells you what is going round: "${c.str('text')}."${c.cit('source') ? ` It started with ${c.cit('source')!.name}.` : ''}`,
    choices: (c) => [
      { id: 'answer', label: c.num('truth') ? 'Own up to it' : 'Set the record straight', hint: c.num('truth') ? 'honesty takes the sting out' : 'works if people think well of you', run: (c) => { c.p.energy = Math.max(c.p.energy, 10); const r = answerRumour(c.w, c.num('rid'), c.p); return r.ok ? done(r.msg) : { text: r.msg, fail: true }; } },
      ...(c.cit('source') ? [{ id: 'confront', label: `Have it out with ${first(c.cit('source')!.name)}`, hint: 'it may clear the air, or start a feud', run: (c: Ctx) => {
        const s = c.cit('source')!;
        if ((s.rel[c.p.id] ?? 0) + c.p.attrs.lead > 20) { adjustRel(s, c.p.id, 10); s.ties = (s.ties ?? []).filter((t) => t.who !== c.p.id || t.kind !== 'grudge'); return done(`A long, awkward conversation. ${first(s.name)} apologises, more or less. The story dies down.`); }
        note(c.w, s, c.p, 'grudge', 50, 'a row about what they had said'); note(c.w, c.p, s, 'grudge', 50, 'the stories they spread'); mood(c, -2, 6);
        return done(`Voices are raised. Now it is a feud, and everyone knows it.`);
      } }] : []),
      { id: 'laugh', label: 'Laugh it off', hint: 'it runs its course', run: (c) => { mood(c, 0, 2); return done('You shrug and change the subject. In a few months it will be someone else\'s turn.'); } },
    ],
  }),
  single({
    id: 'social.holidayRow', icon: '🍽️', tags: ['personal'], weight: 7, cooldownDays: 300,
    title: () => 'A row at the holiday table',
    bind: (w, p) => {
      if (holidayOf(w, w.nations[p.nation].iso).month !== dateAt(w.time).month) return null;
      const kin = [...(p.family?.parents ?? []), ...(p.family?.children ?? []), ...(p.family?.partner != null ? [p.family.partner] : [])].map((id) => w.citizens[id]).filter((x) => x && !x.gone);
      for (const a of kin) for (const b of kin) if (a !== b && tieWith(a, b.id, 'grudge')) return { bind: { a: a.id, b: b.id }, key: `row:${a.id}:${b.id}:${dateAt(w.time).year}`, data: {} };
      return null;
    },
    text: (c) => `The holiday meal was going well until ${c.cit('a')!.name} said something about ${c.cit('b')!.name}. Now nobody is eating, and everyone is looking at you.`,
    choices: (c) => [
      { id: 'mediate', label: 'Make peace between them', hint: 'it may work', run: (c) => {
        const a = c.cit('a')!, b = c.cit('b')!;
        if (chance(c.w, 0.5 + c.p.attrs.lead / 200)) { a.ties = (a.ties ?? []).filter((t) => !(t.who === b.id && t.kind === 'grudge')); adjustRel(a, b.id, 15); adjustRel(a, c.p.id, 5); adjustRel(b, c.p.id, 5); practise(c.w, c.p, 'lead', 0.4); mood(c, 4, -2); return done(`A quiet word in the kitchen, then another. By dessert ${first(a.name)} and ${first(b.name)} are, if not friends, at least passing the gravy.`); }
        mood(c, -2, 4); return done('You try. They both turn on you instead. Next year, perhaps.');
      } },
      { id: 'side', label: `Take ${first(c.cit('b')!.name)}'s side`, hint: 'one grateful, one resentful', run: (c) => { const a = c.cit('a')!, b = c.cit('b')!; adjustRel(b, c.p.id, 6); adjustRel(a, c.p.id, -6); return done(`You say what everyone was thinking. ${first(b.name)} squeezes your hand; ${first(a.name)} leaves early.`); } },
      { id: 'stay', label: 'Stay out of it', hint: 'the row runs its course', run: (c) => { mood(c, -1, 3); return done('You clear the plates and stay in the kitchen a long time.'); } },
    ],
  }),
  single({
    id: 'social.visiting', icon: '👧', tags: ['personal'], weight: 6, cooldownDays: 180,
    title: () => 'The visiting arrangements',
    bind: (w, p) => {
      const away = childrenAway(w, p);
      if (!away.length) return null;
      return { bind: { ex: away[0].with.id }, key: `visit:${away[0].with.id}:${Math.floor(dayOf(w.time) / 180)}`, data: {} };
    },
    text: (c) => `${c.cit('ex')!.name} wants to talk about the arrangements for the children: a new job, different hours, school runs that no longer work.`,
    choices: () => [
      { id: 'more', label: 'Ask for more time with the children', hint: 'they may agree, if you are on good terms', run: (c) => { const ex = c.cit('ex')!; if ((ex.rel[c.p.id] ?? 0) > 0) { for (const x of childrenAway(c.w, c.p)) x.kid.bond = Math.min(100, (x.kid.bond ?? 50) + 8); mood(c, 5, -2); return done('Every other weekend becomes most weekends. The children seem pleased; so are you.'); } adjustRel(ex, c.p.id, -5); mood(c, -2, 5); return done('"Absolutely not." The old arguments, in a new costume.'); } },
      { id: 'flex', label: 'Be flexible', hint: 'goodwill with your ex', run: (c) => { adjustRel(c.cit('ex')!, c.p.id, 8); return done('You agree to swap days. It costs you little, and it is noticed.'); } },
      { id: 'lawyer', label: 'Get a lawyer', hint: 'formal, and expensive in goodwill', run: (c) => { const ex = c.cit('ex')!; note(c.w, ex, c.p, 'grudge', 40, 'the lawyers'); mood(c, -1, 6); return done('Letters on headed paper. The arrangement stays as it was, and so, it seems, does the bitterness.'); } },
    ],
  }),
  single({
    id: 'social.clubChair', icon: '🎯', tags: ['social'], weight: 4, cooldownDays: 365,
    title: (c) => `The ${c.str('club')} wants you`,
    bind: (w, p) => {
      const club = circlesOf(w, p).find((x) => x.kind === 'club');
      if (!club || club.members.length < 4 || standingIn(p, club) < 25) return null;
      return { bind: {}, key: `chair:${Math.floor(dayOf(w.time) / 365)}`, data: { club: club.name.split(',')[0] } };
    },
    text: (c) => `The ${c.str('club')}'s chair is stepping down, and at the end of the evening three members take you aside. "We all think it should be you."`,
    choices: () => [
      { id: 'yes', label: 'Take it on', hint: 'standing and a little influence; meetings', run: (c) => { const club = circlesOf(c.w, c.p).find((x) => x.kind === 'club'); for (const x of club?.members ?? []) adjustRel(x, c.p.id, 4); c.p.influence += 3; practise(c.w, c.p, 'lead', 0.5); mood(c, 3, 4); return done('Elected unopposed. Your first act as chair is to find someone to do the minutes.'); } },
      { id: 'no', label: 'Thank them, but no', hint: 'no harm done', run: (c) => { mood(c, 1, 0); return done('"Next year, maybe." They are disappointed but understand.'); } },
    ],
  }),
];
