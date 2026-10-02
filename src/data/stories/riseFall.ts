// Stories of rise and fall (2.3): the night of a coup, a referendum campaign, and life
// under a new flag. They act through the normal rules (influence, fame, police
// attention, regional support for independence, citizenship applications).
import type { Ctx } from '../../sim/story';
import { DAY } from '../../engine/clock';
import { controller, jailed } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { applyCitizenship, citizenshipCheck } from '../../sim/travel';
import { REGIMES, regimeOf } from '../../sim/regimes';
import { done, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };

export const RISE_FALL_STORIES = [
  single({
    id: 'rise.coup', icon: '🪖', tags: ['personal'], weight: 9, cooldownDays: 60,
    title: () => 'The night of the coup',
    bind: (w, p) => {
      const n = w.nations[p.nation];
      const k = n.lastCoup;
      if (!k || w.time - k.t > 3 * DAY || jailed(w, p) || k.leader === p.id) return null;
      return { bind: { lead: k.leader }, key: `coup:${n.id}:${k.t}`, data: { ok: k.ok ? 1 : 0 } };
    },
    text: (c) => c.num('ok')
      ? `Tanks at the crossroads, a curfew on the radio, and a general you had never heard of reading a statement on every channel: ${c.cit('lead')?.name ?? 'the officers'} and the army have "taken responsibility for the nation". ${c.w.nations[c.p.nation].name} is now a ${REGIMES[regimeOf(c.w.nations[c.p.nation]).type].label.toLowerCase()}. Your phone will not stop buzzing.`
      : `Shots in the night, then silence. By morning the radio says it plainly: an attempted coup by ${c.cit('lead')?.name ?? 'a group of officers'} has failed, and arrests are under way. The streets are full of soldiers who look as frightened as everyone else.`,
    choices: (c) => [
      { id: 'home', label: 'Stay home and wait', hint: 'safe, and anxious', run: (cx) => { mood(cx, -2, 6); return done('You draw the curtains and listen to the radio until dawn. Nothing happens to you. That, these days, is a kind of luck.'); } },
      { id: 'square', label: c.num('ok') ? 'Join the crowd in the square against the coup' : 'Go out to see what is left', hint: c.num('ok') ? 'influence and fame; the police will remember' : 'you learn something', run: (cx) => {
        if (!cx.num('ok')) { practise(cx.w, cx.p, 'lead', 0.2); mood(cx, 1, 2); return done('Burned-out trucks, a smashed window at the radio station, and people talking to strangers for once. You go home with a story nobody will believe.'); }
        cx.p.influence += 10; cx.p.sec.fame += 3; cx.p.sec.heat = Math.min(100, cx.p.sec.heat + 20);
        practise(cx.w, cx.p, 'lead', 0.5); mood(cx, 2, 10);
        return done('Thousands of people, phones held up like candles, singing the anthem at the soldiers. Someone photographs you at the front. The picture travels; so does your name.');
      } },
      { id: 'side', label: c.num('ok') ? 'Offer your services to the new rulers' : 'Tell the police what you know', hint: c.num('ok') ? 'influence with those in power; some will not forgive it' : 'the government is grateful', run: (cx) => {
        cx.p.influence += 12; cx.p.sec.fame = Math.max(0, cx.p.sec.fame - 2);
        if (cx.cit('lead')) cx.remember(cx.cit('lead'), cx.num('ok') ? 10 : -10, cx.num('ok') ? 'offered their services after the coup' : 'informed on the plotters');
        mood(cx, -1, 3);
        return done(cx.num('ok') ? 'A colonel takes your name and number, and thanks you for your patriotism. Old friends stop answering your messages.' : 'A detective writes it all down and shakes your hand. Your name goes into a file somewhere, on the right side, for now.');
      } },
    ],
  }),
  single({
    id: 'rise.referendum', icon: '🗳️', tags: ['personal'], weight: 6, cooldownDays: 120,
    title: () => 'The referendum',
    bind: (w, p) => {
      const r = w.regions[p.home];
      if (!r || !r.indepMovement || (r.indep ?? 0) < 35 || jailed(w, p) || controller(r) !== r.owner) return null;
      return { bind: { r: r.id }, key: `referendum:${r.id}:${Math.floor(w.time / (120 * DAY))}`, data: {} };
    },
    text: (c) => {
      const r = c.w.regions[c.num('r')];
      return `Posters on every lamp post in ${r.name}: YES to a country of our own, NO to breaking up ${c.w.nations[r.owner].name}. The polls put support for independence at ${Math.round(r.indep ?? 0)}%. Both campaigns want volunteers, and your neighbours want to know where you stand.`;
    },
    choices: () => [
      { id: 'yes', label: 'Campaign for independence', hint: 'support rises a little; influence', run: (c) => { const r = c.w.regions[c.num('r')]; r.indep = Math.min(100, (r.indep ?? 0) + 1.5); c.p.influence += 6; practise(c.w, c.p, 'lead', 0.3); mood(c, 2, 4); return done('Leaflets, doorsteps, a stall in the market in the rain. Some doors close in your face; more than you expected open.'); } },
      { id: 'no', label: 'Campaign to stay together', hint: 'support falls a little; influence', run: (c) => { const r = c.w.regions[c.num('r')]; r.indep = Math.max(0, (r.indep ?? 0) - 1.5); c.p.influence += 6; practise(c.w, c.p, 'lead', 0.3); mood(c, 1, 4); return done('You talk about pensions, the currency and the border with the patience of someone who has heard every argument twice.'); } },
      { id: 'out', label: 'Keep your opinion to yourself', hint: 'peace at family dinners', run: (c) => { mood(c, 1, -2); return done('You smile, change the subject, and vote in private, as the law intends.'); } },
    ],
  }),
  single({
    id: 'rise.flag', icon: '🏳️', tags: ['personal'], weight: 9, cooldownDays: 365,
    title: () => 'A new flag',
    bind: (w, p) => {
      const r = w.regions[p.home];
      if (!r) return null;
      const n = w.nations[r.owner];
      if (n.founded == null || w.time - n.founded > 60 * DAY || jailed(w, p)) return null;
      return { bind: { s: n.id }, key: `flag:${n.id}`, data: {} };
    },
    text: (c) => {
      const s = c.w.nations[c.num('s')];
      return `The new flag of ${s.name} hangs from the town hall, still creased from the box it came in. There is a new currency, the ${s.adj} money, in your change; new stamps; a new anthem that nobody knows the words to yet.${c.p.nation === s.id ? ' You are one of its citizens now.' : ` You still carry a ${c.w.nations[c.p.nation].adj} passport.`}`;
    },
    choices: (c) => [
      ...(c.p.nation !== c.num('s') ? [{ id: 'apply', label: `Apply for ${c.w.nations[c.num('s')].adj} citizenship`, hint: 'the usual fee; the new government decides', run: (cx: Ctx) => {
        const why = citizenshipCheck(cx.w, cx.p, cx.num('s'));
        if (why) return done(`Not yet: ${why}`);
        const r = applyCitizenship(cx.w, cx.p, cx.num('s'));
        mood(cx, 2, 2);
        return done(r.msg);
      } }] : []),
      { id: 'celebrate', label: 'Celebrate in the street', hint: 'happier; you meet people', run: (cx) => { mood(cx, 6, -3); cx.p.influence += 3; return done('Fireworks, strangers hugging, a brass band playing the anthem slightly too fast. Whatever comes next, tonight is a good night.'); } },
      { id: 'doubt', label: 'Worry about what comes next', hint: 'a quiet evening', run: (cx) => { mood(cx, -2, 4); return done('You count the new notes twice and wonder what they will buy next year.'); } },
    ],
  }),
];
