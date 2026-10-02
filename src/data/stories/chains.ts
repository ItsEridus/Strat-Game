// Narrative stage 4: five chains on the big systems — a protection racket, a
// call-up in wartime, a newspaper scoop, an election campaign, and life as a
// foreign intelligence asset. Each starts from the real state of the world and
// acts through crime cases, enlistment, publishing, elections and the agencies.
import type { StoryDef } from '../../sim/story';
import { DAY } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { c as cur } from '../../engine/money';
import { controller, coref, cref, jailed, syndref, today } from '../../sim/query';
import { ageOf, practise } from '../../sim/growth';
import { openCase } from '../../sim/crime';
import { enlist, enlistCheck } from '../../sim/forces';
import { activeWars } from '../../sim/war';
import { publish } from '../../sim/press';
import { registerCandidate, registerCheck } from '../../sim/politics';
import { quitAsset } from '../../sim/intel';
import { adjustRel } from '../../sim/social';
import { locals, money, myCompanies, done, first, why } from './kit';

/** 1. A protection racket comes to your business. */
const RACKET: StoryDef = {
  id: 'chain.racket', version: 1, icon: '🕴️', kind: 'chain', tags: ['crime', 'economy'],
  title: (c) => `${c.w.syndicates[c.num('s')]?.name ?? 'A gang'} pays a visit`,
  trigger: (w, p) => {
    if (w.story.settings.frequency === 'off') return null;
    for (const co of myCompanies(w, p)) {
      const s = Object.values(w.syndicates).find((x) => x.turf.includes(co.region) && x.strength > 20 && x.rackets[co.id] == null && x.members.length);
      if (s) return { bind: { s: s.id, co: co.id, thug: s.members[0] }, key: `racket:${s.id}:${co.id}`, data: { fee: cur(Math.max(2, Math.round(s.strength / 15))), code: w.nations[controller(w.regions[co.region])].cur } };
    }
    return null;
  },
  start: 'visit',
  stages: {
    visit: {
      urgent: true,
      stale: (c) => (c.w.companies[c.num('co')] && c.w.syndicates[c.num('s')] ? null : 'The company or the gang is gone.'),
      text: (c) => `Two men in good coats wait for you at ${c.w.companies[c.num('co')].name}. “Nice place. Be a shame if something happened to it. ${money(c.str('code'), c.num('fee'))} a day keeps it safe.”`,
      choices: (c) => [
        { id: 'pay', label: `Pay ${money(c.str('code'), c.num('fee'))} a day`, hint: 'quiet life; a cost every day', run: (c) => { c.w.syndicates[c.num('s')].rackets[c.num('co')] = c.num('fee'); return done('They smile, shake your hand, and leave.', 'paid'); } },
        { id: 'police', label: 'Go to the police', hint: 'a case against them; they may retaliate', run: (c) => { const t = c.cit('thug'); if (t) openCase(c.w, t, 'extortion', c.w.companies[c.num('co')].region, 45, 0); return { text: 'A detective takes your statement and opens a case.', next: 'after', wait: { minutes: 3 * DAY, why: 'Waiting to see whether the gang strikes back.' } }; } },
        { id: 'refuse', label: 'Tell them to get lost', hint: 'brave; risky', run: () => ({ text: 'They shrug. “Your choice.”', next: 'after', wait: { minutes: 3 * DAY, why: 'Waiting to see whether the gang strikes back.' } }) },
      ],
    },
    after: {
      text: (c) => (c.num('hit') ? `Someone smashed the windows at ${c.w.companies[c.num('co')]?.name}.` : 'A few quiet days. Nothing happened… yet.'),
      choices: (c) => [{ id: 'ok', label: 'Carry on', hint: '', run: (c) => {
        const co = c.w.companies[c.num('co')]; const s = c.w.syndicates[c.num('s')];
        if (co && s && c.roll(Math.min(0.7, s.strength / 120))) { co.halt = { until: c.w.time + DAY, why: 'Vandalised' }; const loss = Math.min(cur(30), co.wallet[c.str('code')] ?? 0); if (loss) pay(c.w, coref(co.id), syndref(s.id), c.str('code'), loss, 'Repairs after vandalism'); return done(`They came back at night. ${co.name} is closed for a day for repairs.`, 'hit'); }
        return done('They seem to have moved on to easier targets.', 'safe');
      } }],
    },
  },
};

/** 2. The call-up: your country goes to war. */
const CALLUP: StoryDef = {
  id: 'chain.callup', version: 1, icon: '📯', kind: 'chain', tags: ['war'],
  title: () => 'The call-up',
  trigger: (w, p) => { const war = activeWars(w).find((x) => x.att === p.nation || x.def === p.nation); const a = ageOf(w, p); return war && !p.mil.branch && a >= 18 && a <= 44 && !jailed(w, p) ? { bind: { war: war.id }, key: `callup:${war.id}`, data: { foe: war.att === p.nation ? war.def : war.att } } : null; },
  start: 'poster',
  stages: {
    poster: {
      urgent: true,
      text: (c) => `Posters everywhere: “${c.w.nations[c.p.nation].name} needs you.” The war with ${c.w.nations[c.num('foe')].name} has begun, and the recruiting offices are full.`,
      choices: (c) => [
        { id: 'army', label: 'Enlist in the army', hint: 'serve; your job is kept in the reserve', why: enlistCheck(c.w, c.p, 'army'), run: (c) => { const r = enlist(c.w, c.p, 'army'); return r.ok ? done(r.msg, 'enlisted') : { text: r.msg, fail: true }; } },
        { id: 'home', label: 'Serve on the home front: volunteer, donate, keep the factories going', hint: '+standing at home', run: (c) => { c.p.influence += 1; for (const x of locals(c.w, c.p).slice(0, 6)) adjustRel(x, c.p.id, 2); return done('Sandbags, soup kitchens, long shifts. Everyone does their bit.', 'homefront'); } },
        { id: 'object', label: 'Speak out against the war', hint: 'principle; the patriots will not forgive it', run: (c) => { c.p.influence += 0.5; for (const x of locals(c.w, c.p).slice(0, 8)) adjustRel(x, c.p.id, c.roll(0.5) ? 3 : -5); return done('Some cheer, more jeer. You said what you believe.', 'objected'); } },
      ],
    },
  },
};

/** 3. A scoop: a public figure under investigation, and your newspaper. */
const SCOOP: StoryDef = {
  id: 'chain.scoop', version: 1, icon: '🗞️', kind: 'chain', tags: ['press', 'crime', 'politics'],
  title: (c) => `The ${first(c.cit('target')?.name ?? 'secret')} story`,
  trigger: (w, p) => {
    const paper = Object.values(w.papers).find((x) => x.owner.k === 'cit' && x.owner.id === p.id);
    if (!paper || w.story.settings.frequency === 'off') return null;
    const k = Object.values(w.cases).find((x) => x.status === 'open' && w.citizens[x.suspect] && !w.citizens[x.suspect].player && w.citizens[x.suspect].influence > 25 && x.nation === p.nation);
    return k ? { bind: { target: k.suspect, paper: paper.id }, key: `scoop:${k.id}`, data: { kind: k.kind } } : null;
  },
  start: 'tip',
  stages: {
    tip: {
      lead: (c) => `A tip about ${c.cit('target')?.name}: dig into it, or let it go.`,
      text: (c) => `An anonymous caller says the police are investigating ${c.cit('target')!.name} for ${c.str('kind')}. “Check the court lists.”`,
      choices: (c) => [
        { id: 'dig', label: 'Dig into it (−15⚡)', hint: 'documents, sources, a confirmed story', chance: 0.7, why: why(c.p.energy >= 15, 'Too tired.'), run: (c) => { c.p.energy -= 15; practise(c.w, c.p, 'acc', 1); if (c.roll(0.7)) { c.set('confirmed', 1); return { text: 'Two sources confirm it, and a clerk lets you see the file.', next: 'run' }; } return done('Every door closes. The story dies on your desk.', 'dead-end'); } },
        { id: 'drop', label: 'Let it go', hint: '', run: () => ({ text: 'Not every tip is worth chasing.', decline: true }) },
      ],
    },
    run: {
      text: (c) => `It is solid. ${c.cit('target')!.name} will deny everything, and they have powerful friends.`,
      choices: (c) => [
        { id: 'publish', label: 'Run it on the front page', hint: 'fame and sales; a powerful enemy', run: (c) => { const t = c.cit('target')!; const r = publish(c.w, c.p, c.num('paper'), 'politics', 'exposé', `${t.name} under investigation`, `Police are investigating ${t.name} for ${c.str('kind')}, according to court records and two sources.`, t.id); if (!r.ok) return { text: r.msg, fail: true }; c.remember(t, -25, 'exposed me on the front page', 'public'); c.p.sec.fame += 2; t.influence = Math.max(0, t.influence - 5); return done(`${r.msg} The phones don't stop ringing.`, 'published'); } },
        { id: 'trade', label: 'Call them for a comment first', hint: 'fair play; they may offer something to keep it quiet', run: (c) => { const t = c.cit('target')!; const code = c.w.nations[t.nation].cur; const offer = Math.min(cur(80), t.wallet[code] ?? 0); if (offer > 0 && c.roll(t.traits.greed)) { pay(c.w, cref(t.id), cref(c.p.id), code, offer, 'An “advertising deal”'); c.remember(t, 5, 'kept my secret, for a price'); return done(`${t.name} offers a generous “advertising deal” if the story never runs. You take it.`, 'bought'); } c.remember(t, 3, 'gave me a chance to comment'); return done('They decline to comment. The story waits for another day.', 'held'); } },
      ],
    },
  },
};

/** 4. Election season: a campaign in your country. */
const CAMPAIGN: StoryDef = {
  id: 'chain.campaign', version: 1, icon: '🗳️', kind: 'chain', tags: ['politics'],
  title: () => 'Election season',
  trigger: (w, p) => { const e = Object.values(w.elections).find((x) => !x.done && x.nation === p.nation && x.kind !== 'party' && x.regClose > w.time); return e && p.party != null && w.story.settings.frequency !== 'off' ? { bind: { e: e.id }, key: `campaign:${e.id}`, data: { code: w.nations[p.nation].cur } } : null; },
  start: 'kickoff',
  stages: {
    kickoff: {
      lead: () => 'Elections are coming. Decide how you will take part.',
      stale: (c) => (c.w.elections[c.num('e')] && !c.w.elections[c.num('e')].done ? null : 'The election is over.'),
      text: (c) => `The ${c.w.elections[c.num('e')].kind === 'president' ? 'presidential' : 'congressional'} election is set. Your party, ${c.w.parties[c.p.party!]?.name}, is looking for help.`,
      choices: (c) => [
        { id: 'stand', label: 'Stand as a candidate', hint: 'your name on the ballot', why: registerCheck(c.w, c.p, c.w.elections[c.num('e')]), run: (c) => { const r = registerCandidate(c.w, c.p, c.num('e')); return r.ok ? { text: r.msg, next: 'trail', wait: { minutes: DAY, why: 'On the campaign trail.' } } : { text: r.msg, fail: true }; } },
        { id: 'canvass', label: 'Knock on doors for the party (−20⚡)', hint: '+influence; party goodwill', why: why(c.p.energy >= 20, 'Too tired.'), run: (c) => { c.p.energy -= 20; c.p.influence += 1.5; practise(c.w, c.p, 'lead', 1.5); for (const x of locals(c.w, c.p).slice(0, 8)) if (c.roll(0.3)) adjustRel(x, c.p.id, 2); return done('Two hundred doors, a few slammed, most polite.', 'canvassed'); } },
        { id: 'donate', label: `Donate to the campaign (${money(c.str('code'), cur(50))})`, hint: 'the party remembers', why: why((c.p.wallet[c.str('code')] ?? 0) >= cur(50), 'Not enough money.'), run: (c) => { const party = c.w.parties[c.p.party!]; const leader = party?.leader != null ? c.w.citizens[party.leader] : undefined; if (leader) { pay(c.w, cref(c.p.id), cref(leader.id), c.str('code'), cur(50), 'Campaign donation'); c.remember(leader, 8, 'gave generously to the campaign'); } c.p.influence += 0.5; return done('A cheque, a handshake and a photo for the newsletter.', 'donated'); } },
      ],
    },
    trail: {
      text: () => 'Debates, rallies and doorsteps. Every vote counts.',
      choices: (c) => [
        { id: 'rally', label: 'Hold a rally (−25⚡)', hint: '+influence', why: why(c.p.energy >= 25, 'Too tired.'), run: (c) => { c.p.energy -= 25; c.p.influence += 3; c.p.sec.fame += 0.5; return done('A packed hall and a speech that lands.', 'rally'); } },
        { id: 'rest', label: 'Let the campaign team handle it', hint: '', run: () => done('The polls will tell.', 'steady') },
      ],
    },
  },
};

/** 5. A foreign asset: the double life after accepting a foreign service's offer. */
const ASSET: StoryDef = {
  id: 'chain.asset', version: 1, icon: '🕵️', kind: 'chain', tags: ['intel'],
  title: () => 'A double life',
  trigger: (w, p) => (p.sec.asset != null ? { bind: { f: p.sec.asset }, key: `asset:${p.id}:${p.sec.asset}:${Math.floor(today(w) / 30)}`, data: {} } : null),
  start: 'drop',
  stages: {
    drop: {
      lead: (c) => `Your handler in the ${c.w.nations[c.num('f')].agency.name} wants a delivery.`,
      stale: (c) => (c.p.sec.asset === c.num('f') ? null : 'You no longer work for them.'),
      text: (c) => `A chalk mark on a lamp post: your handler from the ${c.w.nations[c.num('f')].agency.name} wants documents left at the usual place.`,
      choices: (c) => [
        { id: 'deliver', label: 'Make the drop', hint: 'a bonus; more risk of exposure', run: (c) => { const f = c.w.nations[c.num('f')]; const bonus = Math.min(cur(60), f.wallet[f.cur] ?? 0); c.p.flags.assetFee = (c.p.flags.assetFee ?? 0) + Math.round(bonus / 30); c.p.sec.heat = Math.min(100, c.p.sec.heat + 6); f.agency.network[c.p.nation] = Math.min(100, (f.agency.network[c.p.nation] ?? 0) + 4); return { text: 'The envelope is gone by morning. Your fee goes up.', next: 'scare', wait: { minutes: 5 * DAY, why: 'Lying low after the drop.' } }; } },
        { id: 'stall', label: 'Stall: “It’s too hot right now.”', hint: 'they will be impatient', run: () => ({ text: 'Your handler is not pleased.', next: 'scare', wait: { minutes: 5 * DAY, why: 'Your handler is waiting.' } }) },
      ],
    },
    scare: {
      urgent: true,
      text: () => 'A colleague mentions, too casually, that counter-intelligence has been asking questions in the building.',
      choices: (c) => [
        { id: 'quit', label: 'Get out: cut contact for good', hint: 'safety; no more payments', run: (c) => { quitAsset(c.w, c.p); return done('You burn the phone and never go back to the drop.', 'out'); } },
        { id: 'confess', label: 'Go to your own service and confess', hint: 'leniency, maybe; a turned asset', run: (c) => { const n = c.w.nations[c.p.nation]; n.agency.counter = Math.min(100, n.agency.counter + 10); quitAsset(c.w, c.p); c.p.sec.heat = Math.max(0, c.p.sec.heat - 20); return done(`The ${n.agency.name} listens for six hours, then lets you go home. They may call on you.`, 'confessed'); } },
        { id: 'stay', label: 'Hold your nerve', hint: 'keep the money coming', run: (c) => { c.p.sec.heat = Math.min(100, c.p.sec.heat + 4); return done('You keep smiling at work. Nobody looks twice. You hope.', 'stayed'); } },
      ],
    },
  },
};

export const SYSTEM_CHAINS: StoryDef[] = [RACKET, CALLUP, SCOOP, CAMPAIGN, ASSET];
