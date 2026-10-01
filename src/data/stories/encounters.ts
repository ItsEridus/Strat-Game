// Everyday life encounters: sixteen single decisions from ordinary days (a
// wedding invitation, jury duty, a stray cat, a broken boiler...). Each binds
// real people and places when offered and acts through the normal systems.
import type { StoryDef } from '../../sim/story';
import { pay } from '../../engine/ledger';
import { c as cur } from '../../engine/money';
import { pick, randInt } from '../../engine/rng';
import { controller, cref, hhref, natref, today } from '../../sim/query';
import { residents } from '../../sim/census';
import { adjustRel } from '../../sim/social';
import { ageOf, practise } from '../../sim/growth';
import { lifeOf } from '../../sim/lifecycle';
import { adoptCheck, adoptPet } from '../../sim/kinship';
import { cash, curOf, done, first, locals, money, single, why } from './kit';
import type { Ctx } from '../../sim/story';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const spend = (c: Ctx, amt: number, why_: string) => pay(c.w, cref(c.p.id), hhref(controller(c.w.regions[c.p.loc])), c.str('code'), amt, why_);
const friendOf = (w: Parameters<NonNullable<StoryDef['bind']>>[0], p: Parameters<NonNullable<StoryDef['bind']>>[1], min = 30) => locals(w, p).filter((c) => (c.rel[p.id] ?? 0) >= min);

export const LIFE_ENCOUNTERS: StoryDef[] = [
  single({
    id: 'enc.wedding', icon: '💌', tags: ['social'], weight: 2, cooldownDays: 20,
    title: (c) => `${first(c.cit('f')!.name)}'s wedding`,
    bind: (w, p) => { const f = friendOf(w, p, 40).find((c) => c.family?.status === 'engaged'); return f ? { bind: { f: f.id }, key: `wed:${f.id}`, data: { code: curOf(w, p.loc) } } : null; },
    text: (c) => `An invitation on thick cream card: ${c.cit('f')!.name} is getting married, and you are invited.`,
    choices: (c) => [
      { id: 'go', label: `Go, with a gift (${money(c.str('code'), cur(25))})`, hint: '+a lot of closeness', why: why(cash(c.w, c.p) >= cur(25), 'Not enough money.'), run: (c) => { spend(c, cur(25), 'Wedding gift'); c.remember(c.cit('f'), 15, 'danced at my wedding', 'public'); mood(c, 4, -2); return done('Speeches, cake and dancing until late.'); } },
      { id: 'card', label: 'Send a card with your apologies', hint: '', run: (c) => { c.remember(c.cit('f'), 1, 'sent a kind card for the wedding'); return done('They understand. Mostly.'); } },
    ],
  }),
  single({
    id: 'enc.jury', icon: '⚖️', tags: ['social', 'politics'], weight: 1, cooldownDays: 60,
    title: () => 'Jury duty',
    bind: (w, p) => (ageOf(w, p) >= 18 && p.sec.record.convictions === 0 ? { bind: {}, key: `jury:${p.id}:${Math.floor(today(w) / 90)}`, data: {} } : null),
    text: () => 'A letter from the court: you have been called for jury service next week.',
    choices: () => [
      { id: 'serve', label: 'Serve on the jury', hint: '−energy; +influence, a sense of duty', run: (c) => { c.p.energy = Math.max(0, c.p.energy - 20); c.p.influence += 1; practise(c.w, c.p, 'lead', 1); return done('Three days of evidence and a hard decision, made carefully.'); } },
      { id: 'excuse', label: 'Ask to be excused for work', hint: '', run: (c) => { mood(c, 0, -1); return done('The court lets you off this time.'); } },
    ],
  }),
  single({
    id: 'enc.stray', icon: '🐈', tags: ['social'], weight: 2, cooldownDays: 30,
    title: () => 'A stray on the doorstep',
    bind: (w, p) => ({ bind: {}, key: `stray:${p.id}:${Math.floor(today(w) / 30)}`, data: { kind: pick(w, ['cat', 'dog']) } }),
    text: (c) => `A thin, friendly ${c.str('kind')} has been sitting on your doorstep for three days.`,
    choices: (c) => [
      { id: 'adopt', label: 'Take them in', hint: 'a new pet (adoption costs and daily care)', why: adoptCheck(c.w, c.p, c.str('kind')), run: (c) => { const r = adoptPet(c.w, c.str('kind')); return r.ok ? done(r.msg) : { text: r.msg, fail: true }; } },
      { id: 'shelter', label: 'Take them to the shelter', hint: '', run: (c) => { mood(c, 1, 0); return done('The shelter staff promise to find them a home.'); } },
      { id: 'feed', label: 'Leave out some food', hint: '', run: () => done('The bowl is empty by morning.') },
    ],
  }),
  single({
    id: 'enc.blood', icon: '🩸', tags: ['social'], weight: 1, cooldownDays: 40,
    title: () => 'A blood drive',
    bind: (w, p) => ((p.health ?? 90) >= 60 && ageOf(w, p) >= 18 ? { bind: { region: p.loc }, key: `blood:${p.loc}:${Math.floor(today(w) / 40)}`, data: {} } : null),
    text: (c) => `The clinic in ${c.w.regions[c.num('region')].name} is short of blood after a busy month.`,
    choices: () => [
      { id: 'give', label: 'Give blood (−15⚡)', hint: '+a little standing; feels good', why: null, run: (c) => { c.p.energy = Math.max(0, c.p.energy - 15); mood(c, 3, 0); c.p.influence += 0.3; for (const x of locals(c.w, c.p).slice(0, 4)) adjustRel(x, c.p.id, 1); return done('A plaster, a biscuit, and three lives helped.'); } },
      { id: 'not', label: 'Not today', hint: '', run: () => done('Maybe next time.') },
    ],
  }),
  single({
    id: 'enc.party', icon: '🔊', tags: ['social'], weight: 2,
    title: (c) => `A party next door at ${c.cit('n')!.name}'s`,
    bind: (w, p) => { const n = residents(w, p.home).find((c) => !c.player && !c.gone && ageOf(w, c) < 35 && c.loc === p.home); return n && p.loc === p.home ? { bind: { n: n.id }, key: `party:${n.id}:${today(w)}`, data: {} } : null; },
    text: (c) => `It is past midnight and the music from ${first(c.cit('n')!.name)}'s place is shaking your windows.`,
    choices: (c) => [
      { id: 'join', label: 'If you can’t beat them, join them', hint: '+closeness; a late night', run: (c) => { c.remember(c.cit('n'), 8, 'came over and made the party better'); c.p.energy = Math.max(0, c.p.energy - 10); mood(c, 3, -2); return done('A great party, as it turns out.'); } },
      { id: 'ask', label: 'Knock and ask them to turn it down', hint: '', run: (c) => { c.remember(c.cit('n'), -1, 'asked me to turn the music down'); return done('They apologise and turn it down.'); } },
      { id: 'police', label: 'Call in a noise complaint', hint: 'quiet, and a grudge', run: (c) => { c.remember(c.cit('n'), -8, 'called the police over my party'); return done('Blue lights, then silence.'); } },
    ],
  }),
  single({
    id: 'enc.scam', icon: '📞', tags: ['social', 'crime'], weight: 2, cooldownDays: 30,
    title: () => 'A call from “your bank”',
    bind: (w, p) => (cash(w, p) > cur(40) ? { bind: {}, key: `scam:${p.id}:${Math.floor(today(w) / 30)}`, data: { amt: Math.min(Math.floor(cash(w, p) * 0.3), cur(80)), code: curOf(w, p.loc) } } : null),
    text: (c) => `A polite voice says your account is at risk and asks you to move ${money(c.str('code'), c.num('amt'))} to a “safe account” right away.`,
    choices: (c) => [
      { id: 'hang', label: 'Hang up and call your bank yourself', hint: 'safe', run: () => done('Your bank confirms it was a scam. Well spotted.') },
      { id: 'pay', label: 'Do as they say', hint: 'they sound official', run: (c) => { pay(c.w, cref(c.p.id), hhref(controller(c.w.regions[c.p.loc])), c.str('code'), Math.min(c.num('amt'), cash(c.w, c.p)), 'Lost to a phone scam'); mood(c, -4, 8); return done('The “safe account” vanishes, and so does the money.', 'scammed'); } },
    ],
  }),
  single({
    id: 'enc.lottery', icon: '🎟️', tags: ['social'], weight: 1, cooldownDays: 14,
    title: () => 'A lottery ticket',
    bind: (w, p) => ({ bind: {}, key: `lottery:${p.id}:${Math.floor(today(w) / 14)}`, data: { code: curOf(w, p.loc), win: randInt(w, 0, 99) } }),
    text: () => 'The shop on the corner is selling tickets for this week’s big draw.',
    choices: (c) => [
      { id: 'buy', label: `Buy a ticket (${money(c.str('code'), cur(2))})`, hint: 'long odds', why: why(cash(c.w, c.p) >= cur(2), 'Not enough money.'), run: (c) => {
        const nat = controller(c.w.regions[c.p.loc]);
        spend(c, cur(2), 'Lottery ticket');
        if (c.num('win') === 0 && pay(c.w, natref(nat), cref(c.p.id), c.str('code'), cur(200), 'Lottery win')) { mood(c, 10, -5); return done('Four numbers! You win a tidy sum.', 'won'); }
        if (c.num('win') < 10 && pay(c.w, natref(nat), cref(c.p.id), c.str('code'), cur(6), 'Lottery win')) return done('Three numbers: a small win.', 'small');
        return done('Not a single number. Next week, maybe.', 'lost');
      } },
      { id: 'no', label: 'Keep your money', hint: '', run: () => done('The odds are terrible anyway.') },
    ],
  }),
  single({
    id: 'enc.surprise', icon: '🎁', tags: ['social'], weight: 1, cooldownDays: 30,
    title: (c) => `${first(c.cit('f')!.name)}'s birthday`,
    bind: (w, p) => { const f = friendOf(w, p, 50)[0]; return f ? { bind: { f: f.id }, key: `bday:${f.id}:${Math.floor(today(w) / 60)}`, data: { code: curOf(w, p.loc) } } : null; },
    text: (c) => `It’s ${c.cit('f')!.name}'s birthday on Saturday. Their friends are planning a surprise.`,
    choices: (c) => [
      { id: 'host', label: `Host the surprise party (${money(c.str('code'), cur(30))})`, hint: '+a lot of closeness', why: why(cash(c.w, c.p) >= cur(30), 'Not enough money.'), run: (c) => { spend(c, cur(30), 'Surprise party'); c.remember(c.cit('f'), 18, 'threw me a surprise party', 'witnessed'); mood(c, 3, 1); return done('They had no idea. Tears, laughter, and cake on the ceiling.'); } },
      { id: 'chip', label: 'Chip in for a group present', hint: '+closeness', why: why(cash(c.w, c.p) >= cur(8), 'Not enough money.'), run: (c) => { spend(c, cur(8), 'Birthday present'); c.remember(c.cit('f'), 5, 'chipped in for my birthday present'); return done('A present from all of you.'); } },
      { id: 'forget', label: 'You’re busy that day', hint: '', run: (c) => { c.remember(c.cit('f'), -2, 'missed my birthday'); return done('They notice.'); } },
    ],
  }),
  single({
    id: 'enc.boiler', icon: '🔧', tags: ['social', 'economy'], weight: 2, cooldownDays: 40,
    title: () => 'The boiler breaks',
    bind: (w, p) => (p.dwelling && p.dwelling.kind !== 'family' ? { bind: {}, key: `boiler:${p.id}:${Math.floor(today(w) / 60)}`, data: { code: curOf(w, p.home), own: p.dwelling.kind === 'own' ? 1 : 0 } } : null),
    text: (c) => `No hot water, no heating. The boiler has died.${c.num('own') ? ' As the owner, the repair is on you.' : ' Your landlord should fix it…'}`,
    choices: (c) => c.num('own')
      ? [
        { id: 'fix', label: `Call a plumber (${money(c.str('code'), cur(45))})`, hint: '', why: why(cash(c.w, c.p) >= cur(45), 'Not enough money.'), run: (c) => { spend(c, cur(45), 'Boiler repair'); return done('Warm again by evening.'); } },
        { id: 'diy', label: 'Fix it yourself (−20⚡)', hint: 'cheaper; it may not hold', why: why(c.p.energy >= 20, 'Too tired.'), run: (c) => { c.p.energy -= 20; practise(c.w, c.p, 'cons', 1); if (c.roll(0.5)) return done('A YouTube video, a spanner, and it works!'); spend(c, Math.min(cur(60), cash(c.w, c.p)), 'Boiler repair'); return done('It made things worse. The plumber was not impressed.', 'worse'); } },
      ]
      : [
        { id: 'chase', label: 'Chase the landlord', hint: 'a few cold days', run: (c) => { mood(c, -2, 4); return done('Four days later, a man with a van fixes it.'); } },
        { id: 'pay', label: `Pay to fix it now (${money(c.str('code'), cur(45))})`, hint: 'warm tonight', why: why(cash(c.w, c.p) >= cur(45), 'Not enough money.'), run: (c) => { spend(c, cur(45), 'Boiler repair'); return done('Warm tonight. You will argue about the bill later.'); } },
      ],
  }),
  single({
    id: 'enc.lostchild', icon: '🧒', tags: ['social'], weight: 1, cooldownDays: 30,
    title: () => 'A lost child',
    bind: (w, p) => { const parent = locals(w, p).find((c) => (c.family?.kids.length ?? 0) > 0); return parent ? { bind: { parent: parent.id }, key: `lostkid:${parent.id}:${Math.floor(today(w) / 30)}`, data: { kid: parent.family!.kids[0].name } } : null; },
    text: (c) => `A small child is crying by the fountain. They say their name is ${first(c.str('kid'))} and they can’t find their parent.`,
    choices: (c) => [
      { id: 'help', label: 'Stay with them and find the parent', hint: '+a grateful family', run: (c) => { c.remember(c.cit('parent'), 20, 'found my child when they got lost', 'witnessed'); c.p.sec.fame += 0.3; return done(`${c.cit('parent')!.name} comes running, and hugs you both.`); } },
      { id: 'police', label: 'Take them to a police officer', hint: '', run: (c) => { c.remember(c.cit('parent'), 8, 'took my lost child to the police'); return done('The officer reunites them within the hour.'); } },
    ],
  }),
  single({
    id: 'enc.oldfriend', icon: '👋', tags: ['social'], weight: 2, cooldownDays: 20,
    title: (c) => `${first(c.cit('f')!.name)}, after all these years`,
    bind: (w, p) => { const f = Object.values(w.citizens).find((c) => !c.gone && !c.player && c.loc === p.loc && (c.rel[p.id] ?? 0) >= 20 && (c.rel[p.id] ?? 0) < 50); return f ? { bind: { f: f.id }, key: `oldfriend:${f.id}:${Math.floor(today(w) / 40)}`, data: { code: curOf(w, p.loc) } } : null; },
    text: (c) => `“Is that you?” ${c.cit('f')!.name}, whom you haven’t seen in ages, waves from across the street.`,
    choices: (c) => [
      { id: 'coffee', label: `Catch up over coffee (${money(c.str('code'), cur(4))})`, hint: '+closeness', why: why(cash(c.w, c.p) >= cur(4), 'Not enough money.'), run: (c) => { spend(c, cur(4), 'Coffee with an old friend'); adjustRel(c.cit('f')!, c.p.id, 10); adjustRel(c.p, c.cit('f')!.id, 8); mood(c, 3, -2); return done('Two hours pass in no time.'); } },
      { id: 'wave', label: 'Wave back and keep walking', hint: '', run: () => done('Another time.') },
    ],
  }),
  single({
    id: 'enc.run', icon: '🏃', tags: ['social'], weight: 1, cooldownDays: 45,
    title: () => 'A charity run',
    bind: (w, p) => (ageOf(w, p) >= 14 ? { bind: { region: p.loc }, key: `run:${p.loc}:${Math.floor(today(w) / 45)}`, data: { code: curOf(w, p.loc) } } : null),
    text: (c) => `The ${c.w.regions[c.num('region')].name} charity run is on Sunday, for the children’s hospital.`,
    choices: (c) => [
      { id: 'run', label: 'Run it (−25⚡)', hint: 'fitness, fame; sponsors pay the hospital', why: why(c.p.energy >= 25, 'Too tired.'), run: (c) => { c.p.energy -= 25; practise(c.w, c.p, 'end', 2); c.p.health = Math.min(100, (c.p.health ?? 90) + 1); c.p.sec.fame += 0.3; mood(c, 4, -3); return done('Ten kilometres, a medal, and very sore legs.'); } },
      { id: 'sponsor', label: `Sponsor a friend (${money(c.str('code'), cur(10))})`, hint: '', why: why(cash(c.w, c.p) >= cur(10), 'Not enough money.'), run: (c) => { pay(c.w, cref(c.p.id), natref(controller(c.w.regions[c.p.loc])), c.str('code'), cur(10), 'Charity sponsorship'); return done('Every bit helps.'); } },
      { id: 'cheer', label: 'Cheer from the sidelines', hint: '', run: (c) => { mood(c, 1, 0); return done('You shout yourself hoarse.'); } },
    ],
  }),
  single({
    id: 'enc.babysit', icon: '🧸', tags: ['social'], weight: 1, cooldownDays: 20,
    title: (c) => `${first(c.cit('n')!.name)} needs a babysitter`,
    bind: (w, p) => { const n = locals(w, p).find((c) => (c.family?.kids.length ?? 0) > 0 && (c.rel[p.id] ?? 0) >= 20); return n ? { bind: { n: n.id }, key: `babysit:${n.id}:${Math.floor(today(w) / 20)}`, data: {} } : null; },
    text: (c) => `${c.cit('n')!.name} has a work emergency tonight and asks if you could look after the kids.`,
    choices: (c) => [
      { id: 'yes', label: 'Of course (−10⚡)', hint: '+a good friend', why: why(c.p.energy >= 10, 'Too tired.'), run: (c) => { c.p.energy -= 10; c.remember(c.cit('n'), 12, 'looked after my children when I was desperate'); return done('Pizza, cartoons, and bedtime only an hour late.'); } },
      { id: 'no', label: 'Sorry, not tonight', hint: '', run: (c) => { c.remember(c.cit('n'), -2, 'could not help with the kids'); return done('They find someone else.'); } },
    ],
  }),
  single({
    id: 'enc.reunion', icon: '🏫', tags: ['social'], weight: 1, cooldownDays: 120,
    title: () => 'A school reunion',
    bind: (w, p) => (ageOf(w, p) >= 28 ? { bind: {}, key: `reunion:${p.id}:${Math.floor(today(w) / 365)}`, data: { code: curOf(w, p.loc) } } : null),
    text: () => 'An email: it has been ten years, and your old class is meeting up.',
    choices: (c) => [
      { id: 'go', label: `Go (${money(c.str('code'), cur(15))})`, hint: 'old faces; new friends', why: why(cash(c.w, c.p) >= cur(15), 'Not enough money.'), run: (c) => { spend(c, cur(15), 'School reunion'); let k = 0; for (const x of locals(c.w, c.p).filter((x) => Math.abs(ageOf(c.w, x) - ageOf(c.w, c.p)) <= 2).slice(0, 5)) { adjustRel(x, c.p.id, 8); k++; } mood(c, 4, -2); return done(`Everyone has changed, and nobody has. You reconnect with ${k} old classmates.`); } },
      { id: 'skip', label: 'Skip it', hint: '', run: () => done('Some things are better left in the past.') },
    ],
  }),
  single({
    id: 'enc.ticket', icon: '🅿️', tags: ['social', 'crime'], weight: 1, cooldownDays: 30,
    title: () => 'A fine on the windscreen',
    bind: (w, p) => ({ bind: {}, key: `fine:${p.id}:${Math.floor(today(w) / 30)}`, data: { code: curOf(w, p.loc) } }),
    text: (c) => `A parking fine: ${money(c.str('code'), cur(12))}, payable within fourteen days.`,
    choices: (c) => [
      { id: 'pay', label: 'Pay it', hint: '', why: why(cash(c.w, c.p) >= cur(12), 'Not enough money.'), run: (c) => { pay(c.w, cref(c.p.id), natref(controller(c.w.regions[c.p.loc])), c.str('code'), cur(12), 'Parking fine'); return done('Annoying, but done.'); } },
      { id: 'appeal', label: 'Appeal it', hint: 'maybe they made a mistake', run: (c) => { if (c.roll(0.35)) return done('Appeal upheld: the sign was missing.', 'won'); const amt = Math.min(cur(18), cash(c.w, c.p)); pay(c.w, cref(c.p.id), natref(controller(c.w.regions[c.p.loc])), c.str('code'), amt, 'Parking fine'); return done('Appeal rejected, with costs.', 'lost'); } },
      { id: 'ignore', label: 'Ignore it', hint: 'the police will notice', run: (c) => { c.p.sec.heat = Math.min(100, c.p.sec.heat + 3); return done('Out of sight, out of mind… for now.', 'ignored'); } },
    ],
  }),
  single({
    id: 'enc.abroad', icon: '✈️', tags: ['social', 'economy'], weight: 1, cooldownDays: 90,
    title: () => 'An offer from abroad',
    bind: (w, p) => { if (ageOf(w, p) < 21 || ageOf(w, p) > 55) return null; const other = w.nations.filter((n) => n.id !== p.nation && !n.exile); return other.length ? { bind: { nat: pick(w, other).id }, key: `abroad:${p.id}:${Math.floor(today(w) / 120)}`, data: {} } : null; },
    text: (c) => `A recruiter says a firm in ${c.w.nations[c.num('nat')].name} would love to have you. New country, new life?`,
    choices: (c) => [
      { id: 'think', label: 'Think about it (travel there first)', hint: 'the Map screen can take you there; jobs there are on its Jobs screen', run: (c) => { mood(c, 2, 1); return done(`You keep the recruiter’s card. ${c.w.nations[c.num('nat')].name} is a flight away.`); } },
      { id: 'decline', label: 'Your life is here', hint: '', run: (c) => { mood(c, 1, -1); return done('Home is home.'); } },
    ],
  }),
];
