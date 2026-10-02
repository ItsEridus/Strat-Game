// Stories of the mind (2.6): a low season, the anniversary of a loss, a craving after quitting,
// and an old flame. They act through the normal rules (talking to someone, therapy, the clinic,
// habits and relapse, relationships and memories).
import type { Ctx } from '../../sim/story';
import { DAY } from '../../engine/clock';
import { jailed } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { adjustRel } from '../../sim/social';
import { clinicCheck, visitClinic } from '../../sim/health';
import { confidants, griefOf, mentalConditions, startTherapy, talkCheck, talkToSomeone, therapyCheck, therapyOptions } from '../../sim/mentalHealth';
import { HABITS, indulge, type Habit } from '../../sim/habits';
import { note } from '../../sim/ties';
import { done, first, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };

export const MIND_STORIES = [
  single({
    id: 'mind.lowSeason', icon: '🌧️', tags: ['social'], weight: 8, cooldownDays: 60,
    title: () => 'A low season',
    bind: (w, p) => {
      const x = mentalConditions(p).find((k) => k.key !== 'burnout');
      if (!x || p.mh?.therapy || jailed(w, p)) return null;
      return { bind: {}, key: `low:${x.key}:${x.since}`, data: { cond: x.key } };
    },
    text: (c) => c.str('cond') === 'anxiety'
      ? 'Your heart races in the queue at the shop. You lie awake running through everything that could go wrong tomorrow, and then the day after. It has been like this for weeks.'
      : 'Mornings are the worst. Things you used to enjoy feel like chores, and the chores feel like mountains. People ask how you are and you say "fine", because the true answer is too long.',
    choices: (c) => {
      const who = confidants(c.w, c.p)[0];
      const o = therapyOptions(c.w, c.p).find((x) => !therapyCheck(c.w, c.p, x.route));
      return [
        { id: 'talk', label: who ? `Tell ${first(who.name)} how you really are` : 'Tell someone how you really are', hint: 'support helps; not everyone understands', why: talkCheck(c.w, c.p), run: (c) => { const r = talkToSomeone(c.w, c.p); return done(r.msg); } },
        { id: 'therapy', label: o?.route === 'public' ? `Ask for therapy (about ${o.weeks} weeks' wait)` : 'Book a private therapist', hint: 'twelve weekly sessions', why: o ? null : 'Therapy is out of reach right now.', run: (c) => { const r = startTherapy(c.w, c.p, o!.route); return r.ok ? done(r.msg) : { text: r.msg, fail: true }; } },
        { id: 'doctor', label: 'See a doctor', hint: 'medication', why: clinicCheck(c.w, c.p), run: (c) => { const r = visitClinic(c.w, c.p); return r.ok ? done(`${r.msg} The doctor listens, and does not seem surprised.`) : { text: r.msg, fail: true }; } },
        { id: 'alone', label: 'Push through on your own', hint: 'nothing changes; it may get worse', run: (c) => { mood(c, -2, 4); return done('You keep going, one day and then the next. Nobody notices, which is what you wanted, and also not.'); } },
      ];
    },
  }),
  single({
    id: 'mind.anniversary', icon: '🕯️', tags: ['personal'], weight: 10, cooldownDays: 200,
    title: (c) => `A year since ${first(c.str('name'))}`,
    bind: (w, p) => {
      const l = (p.mh?.losses ?? []).find((x) => { const age = w.time - x.t; const y = Math.floor(age / (365 * DAY)); return y >= 1 && age - y * 365 * DAY < 4 * DAY; });
      if (!l) return null;
      return { bind: {}, key: `anniv:${l.id}:${Math.floor((w.time - l.t) / (365 * DAY))}`, data: { name: l.name, years: Math.floor((w.time - l.t) / (365 * DAY)) } };
    },
    text: (c) => `${c.num('years') > 1 ? `${c.num('years')} years` : 'A year'} today since ${c.str('name')} died. The date crept up on you; the grief did not need reminding.`,
    choices: () => [
      { id: 'visit', label: 'Visit the grave', hint: 'quiet; it eases a little', run: (c) => { mood(c, 3, -5); return done('Flowers, a few words said aloud, a long walk back. It does not get easier, exactly. It gets more familiar.'); } },
      { id: 'family', label: 'Gather the family to remember', hint: 'closer to your family', run: (c) => {
        const f = c.p.family;
        for (const id of [...(f?.partner != null ? [f.partner] : []), ...(f?.children ?? []), ...(f?.parents ?? [])]) { const x = c.w.citizens[id]; if (x && !x.gone) { adjustRel(x, c.p.id, 4); c.remember(x, 2, 'remembered together with me'); } }
        mood(c, 4, -3);
        return done('Old photographs, stories you had all half-forgotten, some laughter that surprised everyone.');
      } },
      { id: 'busy', label: 'Keep busy and not think about it', hint: 'it catches up later', run: (c) => { mood(c, -1, 4); return done(`You work late and go to bed tired. ${griefOf(c.w, c.p) > 8 ? 'It is there anyway, at three in the morning.' : ''}`.trim()); } },
    ],
  }),
  single({
    id: 'habit.craving', icon: '😮‍💨', tags: ['social'], weight: 9, cooldownDays: 20,
    title: (c) => `The craving (${HABITS[c.str('habit') as Habit].label.toLowerCase()})`,
    bind: (w, p) => {
      const e = Object.entries(p.habits ?? {}).find(([, s]) => s?.quit != null && w.time - s.quit < 60 * DAY);
      if (!e) return null;
      return { bind: {}, key: `crave:${e[0]}:${e[1]!.quit}:${Math.floor(w.time / (20 * DAY))}`, data: { habit: e[0] } };
    },
    text: (c) => {
      const h = c.str('habit') as Habit;
      return h === 'smoking' ? 'Someone lights up outside the station and the smell hits you like a wave. Your hand goes to your pocket out of old habit. Nothing there. You could buy a pack in two minutes.'
        : h === 'drinking' ? 'Friday evening, the bar on the corner, the old crowd waving through the window. One drink would not hurt. That is what you told yourself last time.'
        : h === 'gambling' ? 'An advert for odds on tonight\'s match. You know you would win this one. You can feel it.'
        : 'The new season of the game you used to play all night has just come out. Everyone online is talking about it.';
    },
    choices: (c) => {
      const h = c.str('habit') as Habit;
      return [
        { id: 'hold', label: 'Hold on', hint: 'hard now, easier later', run: (c) => { const s = c.p.habits?.[h]; if (s) s.level = Math.max(1, s.level - 5); practise(c.w, c.p, 'end', 0.3); mood(c, 1, 3); return done('You walk on. Ten minutes later the craving is gone, and you feel, absurdly, like you have won something.'); } },
        { id: 'call', label: 'Call a friend', hint: 'talking helps', why: talkCheck(c.w, c.p), run: (c) => { const r = talkToSomeone(c.w, c.p); const s = c.p.habits?.[h]; if (s) s.level = Math.max(1, s.level - 3); return done(`${r.msg} By the time you hang up, the moment has passed.`); } },
        { id: 'give', label: 'Give in, just this once', hint: 'a relapse', run: (c) => { const r = indulge(c.w, c.p, h); return r.ok ? done(`${r.msg} Just this once, you tell yourself.`) : { text: r.msg, fail: true }; } },
      ];
    },
  }),
  single({
    id: 'ties.oldFlame', icon: '💭', tags: ['romance'], weight: 5, cooldownDays: 365,
    title: (c) => `${first(c.cit('ex')?.name ?? 'An old flame')} gets in touch`,
    bind: (w, p) => {
      if (p.family?.partner != null) return null;
      const t = (p.ties ?? []).find((x) => x.kind === 'flame' && w.citizens[x.who] && !w.citizens[x.who].gone && w.citizens[x.who].family?.partner == null);
      if (!t) return null;
      return { bind: { ex: t.who }, key: `flame:${t.who}:${Math.floor(w.time / (365 * DAY))}`, data: {} };
    },
    text: (c) => `A message out of nowhere from ${c.cit('ex')!.name}: "Saw something today that reminded me of you. How have you been? Coffee sometime, if you'd like." You read it three times.`,
    choices: () => [
      { id: 'meet', label: 'Meet for coffee', hint: 'old feelings may stir', run: (c) => { const x = c.cit('ex')!; adjustRel(x, c.p.id, 10); adjustRel(c.p, x.id, 10); note(c.w, x, c.p, 'flame', 60, 'meeting again after all this time'); c.remember(x, 6, 'met me again after all this time'); mood(c, 5, -2); return done('Two hours that feel like twenty minutes. You talk about everything except why it ended. Neither of you mentions meeting again; both of you are thinking it.'); } },
      { id: 'kind', label: 'Reply kindly, but leave it there', hint: 'the past stays in the past', run: (c) => { mood(c, 1, 0); return done('A warm reply, a promise to "catch up properly one day" that you both know is a goodbye.'); } },
      { id: 'ignore', label: 'Do not reply', hint: 'they will be hurt', run: (c) => { const x = c.cit('ex')!; adjustRel(x, c.p.id, -6); return done('You leave it unread. Some doors are better closed, even if they would open.'); } },
    ],
  }),
];
