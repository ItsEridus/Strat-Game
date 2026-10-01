// Stories of war (2.2 War & peace): the call-up, letters from the front, the ceasefire,
// and coming home. They act through the normal rules (duty and the reserve, relationships,
// peace proposals and mediation, money, influence and fame).
import type { Ctx } from '../../sim/story';
import type { Citizen, World } from '../../sim/types';
import { DAY } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { c as cur } from '../../engine/money';
import { cref, jailed } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { activeWars, enemyOf } from '../../sim/war';
import { toReserve } from '../../sim/forces';
import { propose } from '../../sim/congress';
import { dipCheck, dipOf, doDiplomacy } from '../../sim/diplomacyActions';
import { exhaustionOf } from '../../sim/warCourse';
import { done, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const warOf = (w: World, nation: number) => activeWars(w).find((x) => x.att === nation || x.def === nation);
/** Close family serving in a war. */
function relativesAtWar(w: World, p: Citizen): Citizen[] {
  const ids = [p.family?.partner, ...(p.family?.children ?? []), ...(p.family?.parents ?? [])].filter((x): x is number => x != null);
  return ids.map((id) => w.citizens[id]).filter((c) => c && !c.gone && !!c.mil?.branch && !c.mil.reserve && !!warOf(w, c.nation));
}

export const WAR_STORIES = [
  single({
    id: 'war.callup', icon: '📯', tags: ['personal'], weight: 8, cooldownDays: 30,
    title: () => 'The call-up',
    bind: (w, p) => {
      if (p.mil?.calledUp == null || jailed(w, p)) return null;
      const war = w.wars[p.mil.calledUp];
      if (!war || war.status !== 'active' || w.time - war.declared > 5 * DAY) return null;
      return { bind: { war: war.id, e: enemyOf(war, p.nation) }, key: `callup:${war.id}`, data: {} };
    },
    text: (c) => `The envelope is brown and official. You are recalled to active service "with immediate effect" for the war with ${c.w.nations[c.num('e')].name}. Report to the depot by Monday.`,
    choices: () => [
      { id: 'report', label: 'Report for duty', hint: 'service points; a worried family', run: (c) => { c.p.mil.sp += 10; practise(c.w, c.p, 'end', 0.4); mood(c, -2, 8); return done('You pack a bag, kiss the people you love, and take the early train. The depot smells of diesel and new boots.'); } },
      { id: 'defer', label: 'Ask for a deferment', hint: 'granted if your work or family needs you', run: (c) => {
        const needed = c.p.job != null || (c.p.family?.children?.length ?? 0) > 0;
        if (needed && c.roll(0.6)) { toReserve(c.w, c.p, 'deferred'); delete c.p.mil.calledUp; mood(c, 3, -3); return done('A tired officer reads your letter twice and stamps it. Deferred, for now.'); }
        c.p.influence = Math.max(0, c.p.influence - 5);
        return done('Refused. The officer reminds you, not unkindly, that everyone has a reason. You report on Monday.');
      } },
      { id: 'hide', label: 'Do not report', hint: 'desertion: police attention and shame', run: (c) => { toReserve(c.w, c.p, 'failed to report'); delete c.p.mil.calledUp; c.p.sec.heat = Math.min(100, c.p.sec.heat + 30); c.p.sec.fame = Math.max(0, c.p.sec.fame - 3); mood(c, -6, 15); return done('Monday comes and goes. Two days later a police car slows outside your building, and keeps going. This time.'); } },
    ],
  }),
  single({
    id: 'war.letters', icon: '✉️', tags: ['personal'], weight: 6, cooldownDays: 20,
    title: (c) => `Letters from the front`,
    bind: (w, p) => {
      const rel = relativesAtWar(w, p)[0];
      return rel ? { bind: { r: rel.id }, key: `letters:${rel.id}:${Math.floor(w.time / (20 * DAY))}`, data: {} } : null;
    },
    stale: (c) => (!c.cit('r') || c.cit('r')!.gone ? 'There will be no more letters.' : null),
    text: (c) => `A letter from ${c.cit('r')!.name}, written in pencil and creased from the journey. "The food is bad and the nights are cold, but we are all right. Tell me about home. Tell me anything ordinary."`,
    choices: () => [
      { id: 'write', label: 'Write back about ordinary things', hint: 'closer; less stress for both of you', run: (c) => { c.remember(c.cit('r'), 6, 'wrote to them at the front'); mood(c, 3, -4); return done('You write four pages about the neighbours, the weather and the price of bread. It is the best letter you have ever written.'); } },
      { id: 'parcel', label: 'Send a parcel', hint: 'socks, chocolate and a photograph', run: (c) => {
        const code = c.w.nations[c.p.nation].cur;
        const cost = cur(30);
        if ((c.p.wallet[code] ?? 0) >= cost) pay(c.w, cref(c.p.id), cref(c.cit('r')!.id), code, cost, 'A parcel to the front');
        c.remember(c.cit('r'), 10, 'sent them a parcel at the front');
        mood(c, 4, -2);
        return done('Socks, chocolate, a photograph and a note. You imagine their face when it arrives.');
      } },
      { id: 'home', label: 'Beg them to come home', hint: 'honest, and hard to read', run: (c) => { c.remember(c.cit('r'), c.roll(0.5) ? 3 : -3, 'begged them to come home'); mood(c, -2, 6); return done('You write it, cross it out, and write it again. Some things have to be said.'); } },
    ],
  }),
  single({
    id: 'war.ceasefire', icon: '🕊️', tags: ['work'], weight: 6, cooldownDays: 15,
    title: () => 'Ceasefire',
    bind: (w, p) => {
      const n = w.nations[p.nation];
      const war = warOf(w, n.id);
      if (!war) return null;
      const head = n.president === p.id;
      const diplomat = p.post?.kind === 'diplomat' && p.post.grade >= 2;
      if (!head && !diplomat) return null;
      if (exhaustionOf(war, n.id) < 30 && w.time - war.declared < 14 * DAY) return null;
      return { bind: { war: war.id, e: enemyOf(war, n.id) }, key: `ceasefire:${war.id}:${Math.floor(w.time / (15 * DAY))}`, data: { head: head ? 1 : 0 } };
    },
    stale: (c) => (c.w.wars[c.num('war')]?.status !== 'active' ? 'The war is over.' : null),
    text: (c) => {
      const war = c.w.wars[c.num('war')];
      return `The casualty lists are longer every week; your country's war-weariness stands at ${Math.round(exhaustionOf(war, c.p.nation))} of 100, and ${c.w.nations[c.num('e')].name}'s, by the best estimate, at ${Math.round(exhaustionOf(war, c.num('e')))}. ${c.num('head') ? 'Your ministers are split on whether to offer an armistice.' : 'The minister asks what the foreign service advises.'}`;
    },
    choices: () => [
      { id: 'offer', label: 'Offer an armistice', hint: 'congress votes, then the enemy', run: (c) => {
        const r = c.num('head') ? propose(c.w, c.p, 'peace' as any, { war: c.num('war'), kind: 'armistice' }) : null;
        if (r && !r.ok) return done(`It cannot go forward: ${r.msg}`);
        const war = c.w.wars[c.num('war')];
        if (!c.num('head')) (war.exhaust ??= {})[c.p.nation] = (war.exhaust[c.p.nation] ?? 0) + 5; // the advice to seek peace spreads
        return done(c.num('head') ? 'You put an armistice before congress. If it passes, the offer goes to the enemy.' : 'Your paper argues for an armistice. It is read in the cabinet, and the mood shifts.');
      } },
      { id: 'mediator', label: 'Ask a neutral country to mediate', hint: 'a broker with standing', run: (c) => {
        const war = c.w.wars[c.num('war')];
        const neutral = c.w.nations.filter((n) => n.id !== war.att && n.id !== war.def && !n.exile).sort((a, b) => dipOf(b).capital - dipOf(a).capital)[0];
        if (!neutral) return done('There is nobody left to ask.');
        const why = dipCheck(c.w, neutral, 'mediate', { target: war.att, war: war.id });
        if (why) return done(`${neutral.name} declines for now: ${why.toLowerCase()}`);
        const r = doDiplomacy(c.w, neutral, 'mediate', { target: war.att, war: war.id });
        practise(c.w, c.p, 'lead', 0.4);
        return done(`${neutral.name} agreed to mediate. ${r.msg}`);
      } },
      { id: 'hold', label: 'Hold out for better terms', hint: 'the war goes on', run: () => done('Not yet. Not on these terms. The war goes on.') },
    ],
  }),
  single({
    id: 'war.home', icon: '🏡', tags: ['personal'], weight: 7, cooldownDays: 60,
    title: () => 'Coming home',
    bind: (w, p) => {
      const war = p.flags.veteranOf != null ? w.wars[p.flags.veteranOf] : null;
      if (!war || war.status === 'active') return null;
      return { bind: { war: war.id, e: enemyOf(war, p.nation) }, key: `home:${war.id}`, data: {} };
    },
    text: (c) => `The war with ${c.w.nations[c.num('e')].name} is over and you are home. The street looks smaller than you remember. People ask how it was, and then talk about something else before you can answer.`,
    choices: () => [
      { id: 'life', label: 'Pick up your old life', hint: 'quiet, and slowly better', run: (c) => { delete c.p.flags.veteranOf; mood(c, 4, -6); return done('You go back to work on Monday. Nobody mentions it. Some evenings that is a relief; some evenings it is not.'); } },
      { id: 'veterans', label: 'Join a veterans\' association', hint: 'comrades and a voice in politics', run: (c) => { delete c.p.flags.veteranOf; c.p.influence += 15; mood(c, 3, -8); return done('Thursday nights in a hall that smells of beer and floor polish, with people who do not need it explained.'); } },
      { id: 'press', label: 'Tell your story to the press', hint: 'fame; the government may not like it', run: (c) => { delete c.p.flags.veteranOf; c.p.sec.fame += 4; const n = c.w.nations[c.p.nation]; n.approval = Math.max(5, n.approval - 1); mood(c, 1, 2); return done('The interview runs on page three with your photograph. Strangers stop you in the street to shake your hand; one spits.'); } },
    ],
  }),
];
