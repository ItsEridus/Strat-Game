// Stories of weather and disaster (1.9 Sky & ground): the storm warning. They act
// through the normal rules (travel, health, the hazard's own impact).
import type { Ctx } from '../../sim/story';
import { lifeOf } from '../../sim/lifecycle';
import { DAY } from '../../engine/clock';
import { done, single, why } from './kit';

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
];
