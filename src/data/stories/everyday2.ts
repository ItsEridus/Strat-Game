// Stories of the everyday (2.8): the car that will not start, a night too short, the doctor's
// warning about weight and fitness, and a builder's offer. They act through the normal rules
// (cars and their costs, sleep, diet and exercise, home improvements).
import type { Ctx } from '../../sim/story';
import { dayOf } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { fmtAmt } from '../../engine/money';
import { cref, hhref } from '../../sim/query';
import { lifeOf, routineOf } from '../../sim/lifecycle';
import { carPrice, MODELS, sellCar } from '../../sim/cars';
import { setCommute, setSleep, sleepOf } from '../../sim/everyday';
import { bmiOf, fitnessOf, setDiet } from '../../sim/body';
import { improveCheck, improveCost, IMPROVE } from '../../sim/homeLife';
import { chance } from '../../engine/rng';
import { done, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const code = (c: Ctx) => c.w.nations[c.p.nation].cur;

export const EVERYDAY2_STORIES = [
  single({
    id: 'everyday.breakdown', icon: '🔧', tags: ['personal'], weight: 5, cooldownDays: 120,
    title: () => 'The car will not start',
    bind: (w, p) => (p.car ? { bind: {}, key: `breakdown:${Math.floor(dayOf(w.time) / 120)}`, data: { cost: Math.round(carPrice(w, p.nation, MODELS[1]) * 0.03) } } : null),
    text: (c) => `A cough, a click, then nothing. The garage says ${fmtAmt(code(c), c.num('cost'))} to fix it, and three days.`,
    choices: (c) => [
      { id: 'fix', label: `Have it repaired (${fmtAmt(code(c), c.num('cost'))})`, hint: 'back on the road', why: (c.p.wallet[code(c)] ?? 0) < c.num('cost') ? 'You cannot afford it.' : null, run: (c) => { pay(c.w, cref(c.p.id), hhref(c.p.nation), code(c), c.num('cost'), 'Car repairs'); mood(c, 0, 2); return done('Three days on the bus, then the car is back, running sweeter than before.'); } },
      { id: 'sell', label: 'Sell it as it is and do without', hint: 'no more running costs', run: (c) => { const r = sellCar(c.w, c.p); return done(`${r.msg} The walk to the bus stop is good for you, you tell yourself.`); } },
      { id: 'bus', label: 'Leave it for now and take the bus', hint: 'saves money; slower', run: (c) => { setCommute(c.w, 'transit', c.p); mood(c, -1, 3); return done('The car sits in the drive. The bus is slower, but you read more.'); } },
    ],
  }),
  single({
    id: 'everyday.tired', icon: '🥱', tags: ['work'], weight: 6, cooldownDays: 60,
    title: () => 'Running on empty',
    bind: (w, p) => (sleepOf(w, p).hours < 6.5 && (p.job != null || p.post) ? { bind: {}, key: `tired:${Math.floor(dayOf(w.time) / 60)}`, data: {} } : null),
    text: () => 'You read the same email four times. In the afternoon meeting your head drops, and you jerk awake to find everyone looking at you.',
    choices: () => [
      { id: 'sleep', label: 'Go to bed earlier from now on', hint: 'eight hours a night', run: (c) => { const s = sleepOf(c.w, c.p); setSleep(c.w, Math.max(21, s.bed - 1), 8, c.p); mood(c, 1, -4); return done('An early night, then another. By the end of the week the world is in focus again.'); } },
      { id: 'coffee', label: 'More coffee', hint: 'it works, for now', run: (c) => { mood(c, 0, 3); return done('A fourth cup, a fifth. Your hands shake a little, but the report gets written.'); } },
    ],
  }),
  single({
    id: 'everyday.checkup', icon: '🩺', tags: ['personal'], weight: 5, cooldownDays: 365,
    title: () => 'A word from the doctor',
    bind: (w, p) => (bmiOf(w, p) >= 30 || fitnessOf(w, p) < 25 ? { bind: {}, key: `checkup:${Math.floor(dayOf(w.time) / 365)}`, data: {} } : null),
    text: (c) => `A routine check-up. The doctor takes off her glasses. "Your ${bmiOf(c.w, c.p) >= 30 ? 'weight' : 'fitness'} worries me. Your heart and your blood sugar will thank you for some changes."`,
    choices: () => [
      { id: 'exercise', label: 'Start exercising every morning', hint: 'fitter, in time', run: (c) => { routineOf(c.w).exercise = true; mood(c, 1, 1); return done('New trainers, an alarm set for seven. The first week is hard; the second is a little less so.'); } },
      { id: 'cook', label: 'Start cooking at home', hint: 'healthier and cheaper', run: (c) => { setDiet(c.w, 'cook', c.p); return done('A cookbook, a full fridge, and a surprising amount of washing-up.'); } },
      { id: 'ignore', label: 'Thank her and change nothing', hint: 'the risk stays', run: (c) => { mood(c, 0, 1); return done('You nod, take the leaflet, and drop it in the bin outside.'); } },
    ],
  }),
  single({
    id: 'everyday.builder', icon: '🏗️', tags: ['economy'], weight: 4, cooldownDays: 365,
    title: () => 'A builder with a gap in his diary',
    bind: (w, p) => (p.dwelling?.kind === 'own' && !improveCheck(w, p, 'kitchen') ? { bind: {}, key: `builder:${Math.floor(dayOf(w.time) / 365)}`, data: { cost: Math.round(improveCost(w, p, 'kitchen') * 0.8) } } : null),
    text: (c) => `A neighbour's builder has had a job fall through. He can do your kitchen next week for ${fmtAmt(code(c), c.num('cost'))}, a fifth off his usual price, cash.`,
    choices: (c) => [
      { id: 'yes', label: 'Take the deal', hint: 'a new kitchen, cheap; builders can be cowboys', why: (c.p.wallet[code(c)] ?? 0) < c.num('cost') ? 'You cannot afford it.' : null, run: (c) => {
        pay(c.w, cref(c.p.id), hhref(c.p.nation), code(c), c.num('cost'), 'A new kitchen');
        if (chance(c.w, 0.8)) { (c.p.dwelling!.improved ??= []).push('kitchen'); mood(c, 4, 2); return done(`${IMPROVE.kitchen.icon} Two weeks of dust, then a kitchen you love. Your home is worth more.`); }
        mood(c, -4, 8); return done('He takes the money, rips out the old kitchen, and stops answering his phone. Lesson learned.');
      } },
      { id: 'no', label: 'Not now', hint: '', run: () => done('Maybe next year.') },
    ],
  }),
];

