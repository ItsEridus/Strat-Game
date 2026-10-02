// Stories of weather and disaster (1.9 Sky & ground): the storm warning. They act
// through the normal rules (travel, health, the hazard's own impact).
import type { Ctx } from '../../sim/story';
import { lifeOf } from '../../sim/lifecycle';
import { DAY } from '../../engine/clock';
import { done, money, single, why } from './kit';
import { pay } from '../../engine/ledger';
import { c as cur } from '../../engine/money';
import { cref, hhref, today } from '../../sim/query';
import { reliefCheck, volunteer } from '../../sim/dynamics';
import { harvestIndex, foodOf } from '../../sim/food';
import { growingIndex } from '../../sim/weather';
import { practise } from '../../sim/growth';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const warning = (c: Ctx) => (c.w.warnings ?? []).find((x) => x.at === c.num('at'));

export const NATURE_STORIES = [
  single({
    id: 'nature.warning', icon: '⚠️', tags: ['personal'], weight: 8, cooldownDays: 2,
    title: (c) => `The ${warning(c)?.label.toLowerCase() ?? 'storm'} warning`,
    bind: (w, p) => {
      const wn = (w.warnings ?? []).find((x) => x.regions.includes(p.loc));
      return wn ? { bind: {}, key: `warning:${wn.at}`, data: { at: wn.at } } : null;
    },
    stale: (c) => (!warning(c) ? 'It has already passed.' : null),
    text: (c) => { const wn = warning(c)!; return `The alert tone sounds on every phone at once. A ${wn.label.toLowerCase()} is expected within a day${wn.level >= 3 ? ', and forecasters are using words like “historic”' : ''}. Shops are selling out of water and tape.`; },
    choices: (c) => {
      const wn = warning(c);
      const safe = wn ? c.w.regions[c.p.loc].links.find((l) => !wn.regions.includes(l)) : undefined;
      return [
        { id: 'evacuate', label: safe != null ? `Evacuate to ${c.w.regions[safe].name}` : 'Evacuate', hint: 'out of harm’s way, for a day', why: why(safe != null, 'There is nowhere safe nearby.') ?? why(c.p.energy >= 15, 'Too tired to travel.'), run: (c) => { c.p.energy -= 15; c.p.loc = safe!; mood(c, -2, 4); return done(`You join the slow line of cars heading inland and spend the night in ${c.w.regions[safe!].name}.`); } },
        { id: 'shelter', label: 'Board up and shelter at home', hint: 'some protection from injury', why: why(c.p.energy >= 10, 'Too tired.'), run: (c) => { c.p.energy -= 10; c.p.flags.shelteredUntil = (warning(c)?.at ?? c.w.time) + DAY; mood(c, -1, 5); return done('Plywood over the windows, the bath filled with water, a torch on the table. You wait.'); } },
        { id: 'ignore', label: 'Carry on as normal', hint: 'they always exaggerate', run: (c) => { mood(c, 0, 1); return done('You have heard it all before.'); } },
      ];
    },
  }),
  single({
    id: 'nature.quake', icon: '🏚️', tags: ['personal'], weight: 6, cooldownDays: 20,
    title: () => 'After the quake',
    bind: (w, p) => {
      const c = Object.values(w.crises).find((x) => x.status === 'active' && (x.kind === 'earthquake' || x.kind === 'tsunami') && (x.regions.includes(p.loc) || x.nation === p.nation) && w.time - x.start < 3 * 1440);
      return c ? { bind: {}, key: `quake:${c.id}`, data: { c: c.id } } : null;
    },
    stale: (c) => (c.w.crises[c.num('c')]?.status !== 'active' ? 'The emergency is over.' : null),
    text: (c) => { const k = c.w.crises[c.num('c')]; return `The ${k.name.toLowerCase()} lasted forty seconds. ${k.deaths ? `${k.deaths.toLocaleString()} people are dead, and more` : 'People'} are missing under the rubble. Rescue teams are asking for volunteers with strong backs; the Red Cross is asking for money.`; },
    choices: (c) => [
      { id: 'dig', label: 'Join the rescue teams', hint: 'relief work on the ground', why: reliefCheck(c.w, c.p, c.num('c')), run: (c) => { const r = volunteer(c.w, c.p, c.num('c')); practise(c.w, c.p, 'end', 0.5); mood(c, 2, 6); return r.ok ? done(`You dig for two days. ${r.msg}`) : { text: r.msg, fail: true }; } },
      { id: 'give', label: `Give ${money(c.w.nations[c.p.nation].cur, cur(20))} to the appeal`, hint: 'money where it is needed', why: why((c.p.wallet[c.w.nations[c.p.nation].cur] ?? 0) >= cur(20), 'You cannot spare it.'), run: (c) => { const code = c.w.nations[c.p.nation].cur; pay(c.w, cref(c.p.id), hhref(c.p.nation), code, cur(20), 'Earthquake appeal'); c.p.influence += 1; mood(c, 3, 0); return done('The donation page thanks you. A week later a letter says your money bought blankets and a field kitchen.'); } },
      { id: 'family', label: 'Check on family and neighbours first', hint: 'the people who rely on you', run: (c) => { mood(c, 1, -2); return done('Everyone you call is shaken but alive. You sit with your neighbour until the aftershocks stop.'); } },
    ],
  }),
  single({
    id: 'nature.dry', icon: '🏜️', tags: ['economy'], weight: 4, cooldownDays: 90,
    title: () => 'The dry year',
    bind: (w, p) => {
      if (!w.weather || growingIndex(w, p.loc) > 0.88) return null;
      return { bind: {}, key: `dry:${p.loc}:${Math.floor(today(w) / 90)}`, data: { h: Math.round(harvestIndex(w, w.nations[p.nation]) * 100), farm: Object.values(w.companies).find((x) => x.owner.k === 'cit' && x.owner.id === p.id && (x.industry === 'grain' || x.industry === 'cotton'))?.id ?? -1 } };
    },
    text: (c) => `No real rain for weeks. The fields around ${c.w.regions[c.p.loc].name} are brown at the edges, and the national harvest is forecast at ${c.num('h')}% of normal. ${c.num('farm') >= 0 ? `Your farm, ${c.w.companies[c.num('farm')]?.name}, is suffering with the rest.` : 'At the supermarket, bread has gone up twice this month.'}`,
    choices: (c) => [
      ...(c.num('farm') >= 0 && c.w.companies[c.num('farm')] ? [{ id: 'irrigate', label: `Pay for irrigation (${money(c.w.nations[c.p.nation].cur, cur(60))})`, hint: 'save part of the crop', why: why((c.p.wallet[c.w.nations[c.p.nation].cur] ?? 0) >= cur(60), 'You cannot afford it.'), run: (c: Ctx) => { const code = c.w.nations[c.p.nation].cur; pay(c.w, cref(c.p.id), hhref(c.p.nation), code, cur(60), 'Irrigation'); const s = c.w.weather!; s.grow[c.w.companies[c.num('farm')].region] = Math.min(1, (s.grow[c.w.companies[c.num('farm')].region] ?? 1) + 0.15); mood(c, 1, 2); return done('The pumps run day and night. The crop will be thin, but there will be one.'); } }] : []),
      { id: 'stock', label: 'Stock up before prices rise further', hint: 'a few days of food in the cupboard', run: (c) => { mood(c, 0, -1); return done('You fill the cupboard. The woman behind you in the queue is doing the same.'); } },
      { id: 'wait', label: 'Wait for the rain', hint: 'it has to come eventually', run: (c) => { mood(c, -1, 2); return done(`You check the forecast every morning. Nationally, food supply is at ${Math.round(foodOf(c.w.nations[c.p.nation]).supply * 100)}% of needs.`); } },
    ],
  }),
];
