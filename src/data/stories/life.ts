// Life chains: the big passages of a life, told over days and weeks. Each is
// triggered by the player's real situation (a pregnancy, a diagnosis, a parent
// in failing health, a degree nearly done...) and acts through the normal
// systems: money through the ledger, homes through housing, care through the
// clinics, closeness through relationships and memories.
import type { Ctx, StoryDef } from '../../sim/story';
import { fmtDate } from '../../engine/calendar';
import { DAY } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { c as cur } from '../../engine/money';
import { controller, cref, hhref, today } from '../../sim/query';
import { ageOf } from '../../sim/growth';
import { lifeOf, milestone } from '../../sim/lifecycle';
import { expecting, siblingsOf } from '../../sim/kinship';
import { CONDITIONS, conditionsOf, visitClinic, clinicCheck, takeParentalLeave, parentalCheck } from '../../sim/health';
import { rentCheck, rentHome } from '../../sim/housing';
import { adjustRel } from '../../sim/social';
import { addHeirloom } from '../../sim/legacy';
import { COURSES } from '../../data/education';
import { cash, done, first, money, why } from './kit';

const quiet = (w: Parameters<NonNullable<StoryDef['trigger']>>[0]) => w.story.settings.frequency === 'off';
const calm = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };

/** 1. A baby on the way: preparing, the birth, the first sleepless weeks. */
const BABY: StoryDef = {
  id: 'life.chain.baby', version: 1, icon: '🍼', kind: 'chain', tags: ['social'],
  title: () => 'A baby on the way',
  trigger: (w, p) => { if (quiet(w)) return null; const e = expecting(w, p); return e ? { bind: { preg: e.id }, key: `baby:${e.id}`, data: { due: e.due, code: w.nations[p.nation].cur } } : null; },
  start: 'prepare',
  stages: {
    prepare: {
      lead: () => 'A baby is on the way. Get ready.',
      text: (c) => `The scan shows a healthy baby, due around ${fmtDate(c.num('due'), 'long')}. There is a cot to buy, a room to clear, and a lot of advice from everyone.`,
      choices: (c) => [
        { id: 'nursery', label: `Get the nursery ready (${money(c.str('code'), cur(60))})`, hint: 'a calmer start; +happiness', why: why(cash(c.w, c.p) >= cur(60), 'Not enough money.'), run: (c) => { pay(c.w, cref(c.p.id), hhref(c.p.nation), c.str('code'), cur(60), 'Nursery and baby things'); calm(c, 4, -4); return { text: 'Cot, pram, tiny clothes. It feels real now.', next: 'born', wait: { minutes: Math.max(DAY, c.num('due') - c.w.time + DAY), why: 'Waiting for the baby.' } }; } },
        { id: 'classes', label: 'Go to antenatal classes together', hint: '+closeness with your partner', run: (c) => { const pt = c.p.family?.partner != null ? c.w.citizens[c.p.family.partner] : undefined; if (pt) c.remember(pt, 6, 'came to every antenatal class with me'); calm(c, 2, -3); return { text: 'Breathing, nappies, and a room full of nervous parents.', next: 'born', wait: { minutes: Math.max(DAY, c.num('due') - c.w.time + DAY), why: 'Waiting for the baby.' } }; } },
        { id: 'work', label: 'Work extra shifts while you can', hint: 'more savings, more stress', run: (c) => { calm(c, -1, 5); return { text: 'You put money aside for the months ahead.', next: 'born', wait: { minutes: Math.max(DAY, c.num('due') - c.w.time + DAY), why: 'Waiting for the baby.' } }; } },
      ],
    },
    born: {
      urgent: true,
      text: (c) => { const k = c.p.family?.kids.at(-1); return k && c.w.time - k.born < 5 * DAY ? `${k.name} is home. Nobody sleeps. Everybody is in love.` : 'The baby has not come yet; the waiting goes on.'; },
      choices: (c) => [
        { id: 'leave', label: 'Take parental leave', hint: 'time at home, paid on your country’s terms', why: parentalCheck(c.w, c.p), run: (c) => { const r = takeParentalLeave(c.w, c.p); return r.ok ? done(r.msg, 'leave') : { text: r.msg, fail: true }; } },
        { id: 'family', label: 'Ask family to help out', hint: '+closeness with your parents', run: (c) => { for (const id of c.p.family?.parents ?? []) c.remember(c.w.citizens[id], 8, 'let me help with the new baby'); calm(c, 3, -5); return done('Grandparents on rotation. You might even sleep.', 'family'); } },
        { id: 'cope', label: 'Muddle through', hint: '', run: (c) => { calm(c, 2, 6); return done('Tired, happy, overwhelmed. Parenthood.', 'coped'); } },
      ],
    },
  },
};

/** 2. Moving out: a grown-up still at home. */
const MOVING_OUT: StoryDef = {
  id: 'life.chain.movingout', version: 1, icon: '📦', kind: 'chain', tags: ['social', 'economy'],
  title: () => 'Time to move out?',
  trigger: (w, p) => (!quiet(w) && p.dwelling?.kind === 'family' && ageOf(w, p) >= 21 ? { bind: {}, key: `movingout:${p.id}:${Math.floor(today(w) / 120)}`, data: {} } : null),
  start: 'talk',
  stages: {
    talk: {
      lead: () => 'You are still living with your family. Time to think about a place of your own?',
      text: (c) => `Over dinner, ${first(c.w.citizens[c.p.family?.parents[0] ?? -1]?.name ?? 'your mother')} asks, not unkindly, whether you have thought about getting a place of your own.`,
      choices: (c) => [
        { id: 'room', label: 'Rent a room in a shared house', hint: 'cheap independence', why: rentCheck(c.w, c.p, 'room'), run: (c) => { const r = rentHome(c.w, 'room', c.p); if (!r.ok) return { text: r.msg, fail: true }; calm(c, 3, -2); milestone(c.w, c.p, 'home', 'moved out of the family home'); return done(r.msg, 'room'); } },
        { id: 'flat', label: 'Rent a flat of your own', hint: 'your own front door', why: rentCheck(c.w, c.p, 'flat'), run: (c) => { const r = rentHome(c.w, 'flat', c.p); if (!r.ok) return { text: r.msg, fail: true }; calm(c, 5, -2); milestone(c.w, c.p, 'home', 'moved into a flat of their own'); return done(r.msg, 'flat'); } },
        { id: 'save', label: 'Stay a while to save a deposit', hint: 'cheaper now; ask again later', run: (c) => { for (const id of c.p.family?.parents ?? []) c.remember(c.w.citizens[id], 2, 'is saving up sensibly'); return done('Another few months under your parents’ roof — with a savings plan.', 'saving'); } },
      ],
    },
  },
};

/** 3. The diagnosis: a serious condition, the choices around treatment and telling the family. */
const DIAGNOSIS: StoryDef = {
  id: 'life.chain.diagnosis', version: 1, icon: '🩺', kind: 'chain', tags: ['social'],
  title: (c) => `The diagnosis: ${CONDITIONS[c.str('cond') as keyof typeof CONDITIONS]?.label.toLowerCase() ?? 'bad news'}`,
  trigger: (w, p) => { if (quiet(w)) return null; const x = conditionsOf(p).find((k) => ['cancer', 'heart', 'diabetes'].includes(k.key)); return x ? { bind: {}, key: `diag:${x.key}:${x.since}`, data: { cond: x.key } } : null; },
  start: 'news',
  stages: {
    news: {
      urgent: true,
      text: (c) => `The doctor closes the folder. “It’s ${CONDITIONS[c.str('cond') as keyof typeof CONDITIONS].label.toLowerCase()}.” ${c.str('cond') === 'cancer' ? 'There is a treatment plan, and a long road.' : 'It can be managed, with care and medication.'}`,
      choices: (c) => [
        { id: 'treat', label: 'Start treatment straight away', hint: 'a clinic visit now', why: clinicCheck(c.w, c.p), run: (c) => { const r = visitClinic(c.w, c.p); return r.ok ? { text: r.msg, next: 'family' } : { text: r.msg, fail: true }; } },
        { id: 'second', label: 'Get a second opinion', hint: 'peace of mind; treatment follows', run: () => ({ text: 'A second doctor confirms it, kindly and clearly.', next: 'family', wait: { minutes: 2 * DAY, why: 'Waiting for the second opinion.' } }) },
      ],
    },
    family: {
      lead: () => 'Decide how to tell your family about your diagnosis.',
      text: () => 'Now the hardest part: telling the people who love you.',
      choices: (c) => [
        { id: 'tell', label: 'Tell everyone, honestly', hint: 'support from the family; less stress', run: (c) => { const f = c.p.family; for (const id of [...(f?.partner != null ? [f.partner] : []), ...(f?.children ?? []), ...(f?.parents ?? [])]) { const x = c.w.citizens[id]; if (x && !x.gone) { adjustRel(x, c.p.id, 5); c.remember(x, 4, 'trusted me with the truth about their illness'); } } calm(c, 2, -8); return done('Tears, hugs, and a family rota for appointments.', 'told'); } },
        { id: 'partner', label: 'Tell only your partner for now', hint: '', run: (c) => { const pt = c.p.family?.partner != null ? c.w.citizens[c.p.family.partner] : undefined; if (pt) c.remember(pt, 6, 'told me first'); calm(c, 0, -3); return done('One person to share it with is enough, for now.', 'partner'); } },
        { id: 'keep', label: 'Keep it to yourself', hint: 'carry it alone', run: (c) => { calm(c, -3, 8); return done('You smile through dinner. Nobody knows.', 'secret'); } },
      ],
    },
  },
};

/** 4. Empty nest: the last child leaves home. */
const EMPTY_NEST: StoryDef = {
  id: 'life.chain.emptynest', version: 1, icon: '🪺', kind: 'chain', tags: ['social'],
  title: () => 'An empty nest',
  trigger: (w, p) => { if (quiet(w) || (p.family?.kids.length ?? 0) > 0) return null; const last = (p.family?.children ?? []).map((id) => w.citizens[id]).filter((x) => x && !x.gone).sort((a, b) => b.born - a.born)[0]; return last && ageOf(w, last) === 18 ? { bind: { kid: last.id }, key: `nest:${last.id}`, data: {} } : null; },
  start: 'quiet',
  stages: {
    quiet: {
      text: (c) => `${first(c.cit('kid')!.name)} has set out on their own. The house is very quiet.`,
      choices: (c) => [
        { id: 'visit', label: `Help ${first(c.cit('kid')!.name)} settle in`, hint: '+closeness', run: (c) => { c.remember(c.cit('kid'), 10, 'helped me move into my first place'); calm(c, 3, -2); return done('Flat-pack furniture and a fridge full of food. They pretend not to need it.', 'helped'); } },
        { id: 'hobby', label: 'Take up something new', hint: 'a fresh start: the hobbies are on the Life screen', run: (c) => { calm(c, 2, -3); return done('Time for you, at last.', 'renewed'); } },
        { id: 'downsize', label: 'Think about a smaller home', hint: 'the Home panel shows what is on offer', run: (c) => { calm(c, 1, 0); return done('Fewer rooms to clean, more money in the bank — maybe.', 'downsize'); } },
      ],
    },
  },
};

/** 5. Midlife: a milestone birthday. */
const MIDLIFE: StoryDef = {
  id: 'life.chain.midlife', version: 1, icon: '🎂', kind: 'chain', tags: ['social'],
  title: (c) => `Turning ${c.num('age')}`,
  trigger: (w, p) => { const a = ageOf(w, p); return !quiet(w) && (a === 40 || a === 50 || a === 60) ? { bind: {}, key: `midlife:${p.id}:${a}`, data: { age: a, code: w.nations[p.nation].cur } } : null; },
  start: 'mirror',
  stages: {
    mirror: {
      text: (c) => `${c.num('age')}. You look at your life and wonder: is this it, or is there more?`,
      choices: (c) => [
        { id: 'trip', label: `Celebrate with a trip (${money(c.str('code'), cur(80))})`, hint: '+happiness, −stress', why: why(cash(c.w, c.p) >= cur(80), 'Not enough money.'), run: (c) => { pay(c.w, cref(c.p.id), hhref(c.p.nation), c.str('code'), cur(80), 'Birthday trip'); calm(c, 8, -10); milestone(c.w, c.p, 'travel', `celebrated turning ${c.num('age')} with a trip`); return done('Sun, good food and no alarm clock.', 'trip'); } },
        { id: 'party', label: 'Throw a party for friends and family', hint: '+relationships', run: (c) => { for (const x of Object.values(c.w.citizens).filter((x) => !x.gone && !x.player && (x.rel[c.p.id] ?? 0) >= 30).slice(0, 12)) adjustRel(x, c.p.id, 3); calm(c, 5, -4); return done('A long night, old stories, and a terrible speech.', 'party'); } },
        { id: 'change', label: 'Promise yourself a change: study something new', hint: 'Education on the Life screen', run: (c) => { calm(c, 3, 2); return done(`It is never too late. ${COURSES.vocational.label}s take a year.`, 'study'); } },
        { id: 'quiet', label: 'Let it pass quietly', hint: '', run: () => done('Just another day.', 'quiet') },
      ],
    },
  },
};

/** 6. Caring for a parent in failing health. */
const CARER: StoryDef = {
  id: 'life.chain.carer', version: 1, icon: '🫶', kind: 'chain', tags: ['social', 'economy'],
  title: (c) => `${first(c.cit('parent')?.name ?? 'Your parent')} needs care`,
  trigger: (w, p) => { if (quiet(w)) return null; const par = (p.family?.parents ?? []).map((id) => w.citizens[id]).find((x) => x && !x.gone && (x.health ?? 90) < 40); return par ? { bind: { parent: par.id }, key: `carer:${par.id}:${Math.floor(today(w) / 60)}`, data: { code: w.nations[p.nation].cur } } : null; },
  start: 'call',
  stages: {
    call: {
      urgent: true,
      stale: (c) => (c.cit('parent') && !c.cit('parent')!.gone ? null : 'They have passed away.'),
      text: (c) => `A call from the clinic: ${c.cit('parent')!.name} had a fall. They are frail and can't manage alone any more.`,
      choices: (c) => [
        { id: 'visit', label: 'Visit every week and organise help', hint: '+closeness; your time', why: why(c.p.energy >= 15, 'Too tired.'), run: (c) => { c.p.energy -= 15; c.remember(c.cit('parent'), 12, 'looked after me when I could not cope'); calm(c, 0, 4); return done('Shopping, pills, and long talks on Sunday afternoons.', 'visits'); } },
        { id: 'pay', label: `Pay for a carer (${money(c.str('code'), cur(120))})`, hint: 'professional care for months', why: why(cash(c.w, c.p) >= cur(120), 'Not enough money.'), run: (c) => { const par = c.cit('parent')!; pay(c.w, cref(c.p.id), hhref(controller(c.w.regions[par.home])), c.str('code'), cur(120), 'Care for a parent'); par.health = Math.min(100, (par.health ?? 30) + 10); c.remember(par, 8, 'paid for a carer for me'); return done('A kind carer comes every morning.', 'carer'); } },
        { id: 'treat', label: 'Take them to the clinic', hint: 'treatment for what ails them', run: (c) => { const par = c.cit('parent')!; const r = clinicCheck(c.w, par) ? null : visitClinic(c.w, par); par.health = Math.min(100, (par.health ?? 30) + 5); c.remember(par, 6, 'took me to the doctor'); return done(r?.msg ?? 'The doctor checks them over.', 'clinic'); } },
      ],
    },
  },
};

/** 7. Graduation day: a course nearly done. */
const GRADUATION: StoryDef = {
  id: 'life.chain.graduation', version: 1, icon: '🎓', kind: 'chain', tags: ['social', 'economy'],
  title: () => 'Graduation day',
  trigger: (w, p) => { const e = p.edu?.enrolled; return !quiet(w) && e && e.days / e.need >= 0.9 ? { bind: {}, key: `grad:${p.id}:${e.since}`, data: { course: e.course, code: w.nations[p.nation].cur } } : null; },
  start: 'last',
  stages: {
    last: {
      lead: () => 'Your course is nearly done: a few more study days to graduate.',
      text: (c) => `The final exams are close. Your ${COURSES[c.str('course') as keyof typeof COURSES]?.label.toLowerCase()} is within reach.`,
      choices: (c) => [
        { id: 'cram', label: 'Study every evening until the end', hint: 'stress now, pride later', run: (c) => { calm(c, 0, 5); return { text: 'Highlighters, cold coffee and flashcards.', next: 'ceremony', wait: { minutes: 7 * DAY, why: 'Studying for the final exams.' } }; } },
        { id: 'balance', label: 'Keep a balance', hint: '', run: () => ({ text: 'Steady work, enough sleep.', next: 'ceremony', wait: { minutes: 7 * DAY, why: 'Final weeks of the course.' } }) },
      ],
    },
    ceremony: {
      text: (c) => (c.p.edu?.enrolled ? 'Not quite there yet: keep going to classes.' : 'Cap, gown, and your name read out. You did it.'),
      choices: (c) => c.p.edu?.enrolled
        ? [{ id: 'keep', label: 'Keep studying', hint: '', run: () => ({ text: 'Nearly there.', next: 'ceremony', wait: { minutes: 7 * DAY, why: 'Finishing the course.' } }) }]
        : [
          { id: 'party', label: `Celebrate with family (${money(c.str('code'), cur(30))})`, hint: '+closeness', why: why(cash(c.w, c.p) >= cur(30), 'Not enough money.'), run: (c) => { pay(c.w, cref(c.p.id), hhref(c.p.nation), c.str('code'), cur(30), 'Graduation dinner'); for (const id of c.p.family?.parents ?? []) c.remember(c.w.citizens[id], 6, 'made us proud at graduation'); calm(c, 6, -5); addHeirloom(c.w, c.p, 'Graduation photograph', 'with the family on the day'); return done('A proud day for the whole family.', 'celebrated'); } },
          { id: 'jobs', label: 'Straight to the job market', hint: 'the Jobs screen has public-service posts for graduates', run: () => done('CV updated. Onward.', 'jobs') },
        ],
    },
  },
};

/** 8. A family inheritance shared among brothers and sisters. */
const INHERITANCE: StoryDef = {
  id: 'life.chain.inheritance', version: 1, icon: '⚖️', kind: 'chain', tags: ['social', 'economy'],
  title: () => 'Dividing the inheritance',
  trigger: (w, p) => {
    if (quiet(w)) return null;
    const dead = (p.family?.parents ?? []).map((id) => w.citizens[id]).find((x) => x?.gone?.why === 'died' && w.time - x.gone.t < 3 * DAY);
    const sibs = siblingsOf(w, p).grown.filter((x) => !x.gone);
    const got = (w.ledger ?? []).filter((e) => /Inheritance from/.test(e.text) && w.time - e.t < 3 * DAY).reduce((t, e) => t + e.amount, 0);
    return dead && sibs.length && got > 0 ? { bind: { dead: dead.id, sib: sibs[0].id }, key: `inherit:${dead.id}`, data: { got, code: w.nations[p.nation].cur, n: sibs.length + 1 } } : null;
  },
  start: 'will',
  stages: {
    will: {
      urgent: true,
      text: (c) => `${c.cit('dead')!.name}'s estate came to you as next of kin: ${money(c.str('code'), c.num('got'))}. ${c.cit('sib')!.name} and your other brothers and sisters are waiting to hear what you will do.`,
      choices: (c) => {
        const each = Math.floor(c.num('got') / c.num('n'));
        const sibs = siblingsOf(c.w, c.p).grown.filter((x) => !x.gone);
        return [
          { id: 'share', label: `Share it equally (${money(c.str('code'), each)} each)`, hint: '+family peace', why: why(cash(c.w, c.p) >= each * sibs.length, 'Some of it is already spent.'), run: (c) => { for (const s of sibs) { pay(c.w, cref(c.p.id), cref(s.id), c.str('code'), each, `Share of the inheritance from ${c.cit('dead')!.name}`); c.remember(s, 15, 'shared our parent’s estate fairly'); } calm(c, 3, -4); return done('Fair is fair. The family stays close.', 'shared'); } },
          { id: 'keep', label: 'Keep it: the law says it is yours', hint: 'bad blood with your siblings', run: (c) => { for (const s of sibs) c.remember(s, -20, 'kept the whole inheritance for themselves'); calm(c, 0, 6); return done('Christmas will be awkward this year.', 'kept'); } },
          { id: 'memorial', label: `Fund a memorial bench, share the rest`, hint: '+family; a little fame', why: why(cash(c.w, c.p) >= cur(20) + each * sibs.length * 0.8, 'Some of it is already spent.'), run: (c) => { pay(c.w, cref(c.p.id), hhref(c.p.nation), c.str('code'), cur(20), 'Memorial bench'); for (const s of sibs) { pay(c.w, cref(c.p.id), cref(s.id), c.str('code'), Math.floor(each * 0.8), 'Share of the inheritance'); c.remember(s, 12, 'honoured our parent with a memorial'); } c.p.sec.fame += 0.3; return done(`A bench in the park with ${first(c.cit('dead')!.name)}'s name on it.`, 'memorial'); } },
        ];
      },
    },
  },
};

export const LIFE_CHAINS: StoryDef[] = [BABY, MOVING_OUT, DIAGNOSIS, EMPTY_NEST, MIDLIFE, CARER, GRADUATION, INHERITANCE];
