// Stories of prison and the justice system (1.7 Law & Order): the first night inside
// and the parole board. They act through the normal rules (conduct, parole, health).
import type { Ctx } from '../../sim/story';
import { chance } from '../../engine/rng';
import { DAY } from '../../engine/clock';
import { jailed, today } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { insideOf, occupancy, paroleCheck, paroleHearing, prisonOf, hasLiveRecord } from '../../sim/prisons';
import { CRIME_NAME, trial } from '../../sim/crime';
import { turnInformant } from '../../sim/whitecollar';
import { ageOf } from '../../sim/growth';
import { pick } from '../../engine/rng';

/** Countries that try serious cases before juries or lay judges. */
const JURY = new Set(['USA', 'CAN', 'GBR', 'AUS', 'JPN', 'KOR', 'BRA']);
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
  single({
    id: 'justice.informant', icon: '🐀', tags: ['crime'], weight: 4, cooldownDays: 30,
    title: () => 'The informant',
    bind: (w, p) => {
      if (p.sec.syndicate == null || p.sec.informs != null || jailed(w, p)) return null;
      const exposed = Object.values(w.cases).some((k) => k.status === 'open' && k.suspect === p.id);
      return exposed || p.sec.heat > 50 ? { bind: { s: p.sec.syndicate }, key: `informant:${p.sec.syndicate}:${Math.floor(today(w) / 30)}`, data: {} } : null;
    },
    stale: (c) => (c.p.sec.syndicate !== c.num('s') ? 'You are no longer in the organisation.' : c.p.sec.informs != null ? 'You already made your choice.' : null),
    text: (c) => `A car pulls up beside you. The detective in the passenger seat doesn't get out. “We know about you and ${c.w.syndicates[c.num('s')]?.name}. We can make the charges go away. All you have to do is talk to us now and then.”`,
    choices: () => [
      { id: 'accept', label: 'Take the deal', hint: 'charges dropped; a weekly payment; if they find out…', run: (c) => { const r = turnInformant(c.w, c.p, null); mood(c, -2, 10); return done(r.msg); } },
      { id: 'refuse', label: 'Say nothing and walk away', hint: 'no change', run: (c) => { mood(c, 0, 3); return done('You keep walking. The car follows you to the corner, then turns off.'); } },
      { id: 'boss', label: 'Tell your boss about the approach', hint: 'loyalty noticed; more police attention', run: (c) => { c.p.flags.syndRep = (c.p.flags.syndRep ?? 0) + 5; c.p.sec.heat = Math.min(100, c.p.sec.heat + 10); return done('The boss hears you out, nods once and pours you a drink. Your standing rises.'); } },
    ],
  }),
  single({
    id: 'justice.jury', icon: '🧑‍⚖️', tags: ['personal'], weight: 2, cooldownDays: 120,
    title: () => 'Twelve good people',
    bind: (w, p) => {
      if (jailed(w, p) || ageOf(w, p) < 18 || hasLiveRecord(w, p) || !JURY.has(w.nations[p.nation].iso)) return null;
      const cases = Object.values(w.cases).filter((k) => k.status === 'open' && k.nation === p.nation && k.evidence >= 35 && k.suspect !== p.id && !w.citizens[k.suspect]?.player && !w.citizens[k.suspect]?.flags.pendingTrial && !jailed(w, w.citizens[k.suspect]));
      if (!cases.length) return null;
      const k = pick(w, cases);
      return { bind: { k: k.id, d: k.suspect }, key: `jury:${k.id}`, data: { ev: Math.round(k.evidence) } };
    },
    stale: (c) => (c.w.cases[c.num('k')]?.status !== 'open' ? 'The case was settled without you.' : null),
    text: (c) => { const k = c.w.cases[c.num('k')]; return `A summons for jury service. The case: ${c.cit('d')?.name ?? 'the defendant'}, charged with ${CRIME_NAME[k.kind]}. After three days of evidence, the prosecution's case is ${c.num('ev') >= 70 ? 'strong' : c.num('ev') >= 50 ? 'decent but not airtight' : 'thin'}. In the jury room, eleven people look at you.`; },
    choices: () => [
      { id: 'guilty', label: 'Guilty', hint: 'the evidence is enough for you', run: (c) => { const k = c.w.cases[c.num('k')]; trial(c.w, k, false, false, true); c.remember(c.cit('d'), -10, 'voted to convict them'); return done(`Guilty. ${k.outcome ? `The judge passes sentence: ${k.outcome.replace(/^convicted: /, '')}.` : ''}`); } },
      { id: 'notguilty', label: 'Not guilty', hint: 'reasonable doubt', run: (c) => { const k = c.w.cases[c.num('k')]; trial(c.w, k, false, false, false); c.remember(c.cit('d'), 10, 'voted to acquit them'); return done('Not guilty. The defendant sags with relief; someone in the gallery shouts.'); } },
      { id: 'holdout', label: 'Hold out against the others', hint: 'a hung jury; the prosecution must decide whether to retry', run: (c) => { const k = c.w.cases[c.num('k')]; k.evidence = Math.max(0, k.evidence - 20); mood(c, 1, 6); return done('Two days of argument. The foreman tells the judge you cannot agree. The case goes back to the prosecutors.'); } },
    ],
  }),
];
