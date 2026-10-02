// Stories of generations (3.0): an heirloom for the next generation, an offer for the family home,
// an ancestor's letters, and a child who is so like you. They act through the normal rules
// (heirlooms, the family home, the chronicle and the family name, relationships).
import type { Ctx } from '../../sim/story';
import { dayOf } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { fmtAmt } from '../../engine/money';
import { hhref, cref } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { adjustRel } from '../../sim/social';
import { priceOf } from '../../sim/housing';
import { ageOf } from '../../sim/growth';
import { chronicle, dynastyOf, generationOf } from '../../sim/dynasty';
import { familyHomeLabel } from '../../sim/ancestry';
import { takesAfter } from '../../sim/heredity';
import { done, first, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const grownChildren = (c: Ctx) => (c.p.family?.children ?? []).map((id) => c.w.citizens[id]).filter((x) => x && !x.gone && ageOf(c.w, x) >= 18);

export const GENERATION_STORIES = [
  single({
    id: 'gen.heirloom', icon: '💍', tags: ['personal'], weight: 4, cooldownDays: 730,
    title: () => 'Something to pass on',
    bind: (w, p) => {
      const h = p.life?.heirlooms?.[0];
      const kid = (p.family?.children ?? []).map((id) => w.citizens[id]).find((x) => x && !x.gone && ageOf(w, x) >= 18);
      return h && kid ? { bind: { kid: kid.id }, key: `heirloom:${kid.id}`, data: { item: h.name, origin: h.origin } } : null;
    },
    text: (c) => `${first(c.cit('kid')!.name)} picks up the ${c.str('item').toLowerCase()} from the shelf and turns it over. "Where did this come from?" (${c.str('origin')}.)`,
    choices: () => [
      { id: 'give', label: 'Tell the story, and give it to them', hint: 'closer; it passes down', run: (c) => {
        const kid = c.cit('kid')!; const L = lifeOf(c.p); const item = (L.heirlooms ?? []).shift(); if (item) (lifeOf(kid).heirlooms ??= []).push(item);
        adjustRel(kid, c.p.id, 10); mood(c, 4, -2); chronicle(c.w, { t: c.w.time, kind: 'note', text: `${c.p.name} gave ${kid.name} the ${c.str('item').toLowerCase()}.`, who: c.p.id });
        return done('An hour of stories you had half forgotten you knew. They hold it carefully, as if it might break.');
      } },
      { id: 'tell', label: 'Tell the story, but keep it for now', hint: 'closer', run: (c) => { adjustRel(c.cit('kid')!, c.p.id, 5); mood(c, 2, 0); return done('"One day it will be yours." They put it back exactly where it was.'); } },
    ],
  }),
  single({
    id: 'gen.homeOffer', icon: '🏡', tags: ['economy'], weight: 4, cooldownDays: 365,
    title: () => 'An offer for the family home',
    bind: (w, p) => (familyHomeLabel(p) ? { bind: {}, key: `homeoffer:${Math.floor(dayOf(w.time) / 365)}`, data: { price: Math.round(priceOf(w, p.dwelling!.region, p.dwelling!.size) * 1.25) } } : null),
    text: (c) => `A letter from a developer: they would pay ${fmtAmt(c.w.nations[c.p.nation].cur, c.num('price'))} for ${familyHomeLabel(c.p)}, a quarter above its value, to build flats.`,
    choices: (c) => [
      { id: 'sell', label: 'Sell', hint: 'money; the family will not be pleased', run: (c) => {
        const n = c.w.nations[c.p.nation];
        const got = Math.min(c.num('price'), c.w.households[n.id]?.wallet[n.cur] ?? 0);
        if (got > 0) pay(c.w, hhref(n.id), cref(c.p.id), n.cur, got, 'Sale of the family home');
        c.p.dwelling = { kind: 'rent', region: c.p.home, size: c.p.dwelling!.size, since: c.w.time };
        for (const id of [...(c.p.family?.children ?? []), ...(c.p.family?.partner != null ? [c.p.family.partner] : [])]) { const x = c.w.citizens[id]; if (x && !x.gone) adjustRel(x, c.p.id, -8); }
        chronicle(c.w, { t: c.w.time, kind: 'note', text: `${c.p.name} sold the family home.`, who: c.p.id });
        mood(c, -3, 2);
        return done(`The papers are signed. You rent a place round the corner and walk past the old house more often than you mean to.`);
      } },
      { id: 'keep', label: 'Not for any money', hint: 'the family home stays', run: (c) => { for (const k of grownChildren(c)) adjustRel(k, c.p.id, 3); mood(c, 2, 0); return done('You write back: no. Some things are not for sale.'); } },
    ],
  }),
  single({
    id: 'gen.letters', icon: '📜', tags: ['personal'], weight: 4, cooldownDays: 1095,
    title: () => 'A box of old letters',
    bind: (w, p) => ((generationOf(w, p.id) ?? 1) >= 2 || (w.legacy?.length ?? 0) > 0 ? { bind: {}, key: `letters:${Math.floor(dayOf(w.time) / 1095)}`, data: { who: w.legacy?.[0]?.name ?? 'your grandparents' } } : null),
    text: (c) => `Clearing the attic, you find a shoebox of letters in ${c.str('who')}'s hand: love, money worries, a war, a joke you finally understand.`,
    choices: () => [
      { id: 'write', label: 'Write the family history', hint: 'the family name; time', run: (c) => { c.p.influence += 3; c.p.energy = Math.max(0, c.p.energy - 20); chronicle(c.w, { t: c.w.time, kind: 'note', text: `${c.p.name} wrote the history of the ${dynastyOf(c.w).name} family.`, who: c.p.id }); mood(c, 4, 2); return done('A year of evenings. When it is printed, the whole family wants a copy.'); } },
      { id: 'read', label: 'Read them, and put them back', hint: 'a quiet evening', run: (c) => { mood(c, 3, -2); return done('You read until it is dark. Then you tie the ribbon again.'); } },
    ],
  }),
  single({
    id: 'gen.likeYou', icon: '🪞', tags: ['personal'], weight: 4, cooldownDays: 730,
    title: (c) => `${first(c.cit('kid')!.name)} is so like you`,
    bind: (w, p) => {
      const kid = (p.family?.children ?? []).map((id) => w.citizens[id]).find((x) => x && !x.gone && ageOf(w, x) >= 18 && takesAfter(w, x)?.id === p.id);
      return kid ? { bind: { kid: kid.id }, key: `likeyou:${kid.id}`, data: {} } : null;
    },
    text: (c) => `${c.cit('kid')!.name} slams a door the way you used to, argues the way you do, and wants the same things you wanted at that age. Everyone says it. It is unnerving.`,
    choices: () => [
      { id: 'mentor', label: 'Take them under your wing', hint: 'closer; your ways passed on', run: (c) => { const k = c.cit('kid')!; adjustRel(k, c.p.id, 8); k.influence += 2; mood(c, 3, 1); return done('Long lunches, introductions, advice they mostly ignore. They will be better at it than you were.'); } },
      { id: 'own', label: 'Let them find their own way', hint: 'respect', run: (c) => { adjustRel(c.cit('kid')!, c.p.id, 4); return done('You bite your tongue, often. They notice, and are grateful, and do not say so.'); } },
    ],
  }),
];
