// Stories of prison and the justice system (1.7 Law & Order): the first night inside
// and the parole board. They act through the normal rules (conduct, parole, health).
import type { Ctx } from '../../sim/story';
import { chance } from '../../engine/rng';
import { DAY } from '../../engine/clock';
import { jailed, today } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { insideOf, occupancy, paroleCheck, paroleHearing, prisonOf } from '../../sim/prisons';
import { done, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const conduct = (c: Ctx, d: number) => { const i = insideOf(c.p); i.conduct = Math.max(0, Math.min(100, i.conduct + d)); };

export const JUSTICE_STORIES = [
  single({
    id: 'justice.inside', icon: '🔒', tags: ['personal'], weight: 6, cooldownDays: 30,
    title: () => 'The first night inside',
    bind: (w, p) => (jailed(w, p) && p.sec.inside && w.time - p.sec.inside.since < 2 * DAY ? { bind: {}, key: `inside:${p.sec.inside.since}`, data: { full: Math.round(occupancy(prisonOf(w, w.nations[p.nation])) * 100) } } : null),
    stale: (c) => (!jailed(c.w, c.p) ? 'You are out.' : null),
    text: (c) => `The door shuts at nine. The wing is ${c.num('full')}% full; your cellmate watches you from the top bunk and says nothing for an hour. Then: “So. What are you in for?”`,
    choices: () => [
      { id: 'quiet', label: 'Keep your head down', hint: 'a quiet stretch; conduct +5', run: (c) => { conduct(c, 5); mood(c, -2, 2); return done('You give him the short version and turn to the wall. Nobody bothers you. That is the point.'); } },
      { id: 'talk', label: 'Tell him the whole story', hint: 'a friend inside, or a liability', run: (c) => { if (chance(c.w, 0.6)) { mood(c, 3, -5); return done('He laughs in the right places. By morning you know which guards to avoid and which queue to stand in.'); } conduct(c, -5); mood(c, -2, 5); return done('He repeats it in the canteen, with improvements. Now everyone knows your business.'); } },
      { id: 'tough', label: 'Make it clear you are not to be messed with', hint: 'respect, or a fight', run: (c) => { if (chance(c.w, 0.5)) { practise(c.w, c.p, 'str', 0.4); mood(c, 2, 0); return done('The message gets around. They leave you alone.'); } conduct(c, -10); c.p.health = Math.max(5, (c.p.health ?? 90) - 5); return done('Someone tests it in the showers. You both get a week on basic regime.'); } },
    ],
  }),
  single({
    id: 'justice.parole', icon: '📋', tags: ['personal'], weight: 5, cooldownDays: 5,
    title: () => 'The parole board',
    bind: (w, p) => (jailed(w, p) && !paroleCheck(w, p) ? { bind: {}, key: `parole:${Math.floor(today(w) / 5)}`, data: {} } : null),
    stale: (c) => (!jailed(c.w, c.p) ? 'You are out.' : paroleCheck(c.w, c.p)),
    text: () => 'Three people behind a table: a retired judge, a probation officer and a psychologist with your file open at a page you cannot see. “Tell us why you should be released.”',
    choices: () => [
      { id: 'honest', label: 'Own what you did', hint: 'boards respect it; conduct +10 before they decide', run: (c) => { conduct(c, 10); const r = paroleHearing(c.w, c.p); return done(r.msg); } },
      { id: 'plan', label: 'Talk about the job and the room waiting for you', hint: 'a plan for the outside; conduct +5', run: (c) => { conduct(c, 5); const r = paroleHearing(c.w, c.p); return done(r.msg); } },
      { id: 'innocent', label: 'Insist you should never have been convicted', hint: 'boards rarely like it; conduct −10', run: (c) => { conduct(c, -10); const r = paroleHearing(c.w, c.p); return done(r.msg); } },
      { id: 'wait', label: 'Withdraw the application', hint: 'serve your time', run: () => done('You tell them you will wait. The judge nods, not unkindly.') },
    ],
  }),
];
