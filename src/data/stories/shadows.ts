// Stories of the intelligence world (2.1 Shadows): the walk-in, burned, and the estimate.
// They act through the normal rules (agents and motives, defection, estimates, tradecraft).
import { DAY } from '../../engine/clock';
import { pick } from '../../engine/rng';
import { census } from '../../sim/census';
import { jailed, today } from '../../sim/query';
import { practise } from '../../sim/growth';
import { defect, motiveFor, placementOf } from '../../sim/collection';
import { dirStrength } from '../../sim/intelOrg';
import { believed, estimateOf, rangeOf, refresh } from '../../sim/beliefs';
import { militaryPower } from '../../sim/war';
import { leaderProfile } from '../../sim/relations';
import { done, single } from './kit';

export const SHADOW_STORIES = [
  single({
    id: 'shadows.walkin', icon: '🚪', tags: ['work'], weight: 3, cooldownDays: 90,
    title: () => 'The walk-in',
    bind: (w, p) => {
      if (jailed(w, p) || p.sec.agency !== p.nation || p.sec.arank < 1) return null;
      const home = w.nations[p.nation];
      const rivals = w.nations.filter((o) => o.id !== home.id && !o.exile && (o.relations[home.id]?.score ?? 0) < 0).map((o) => o.id);
      const cands = census(w).all.filter((c) => rivals.includes(c.nation) && !c.player && !c.gone && c.sec.asset == null && placementOf(w, c).weight >= 0.04);
      if (!cands.length) return null;
      const s = pick(w, cands);
      return { bind: { s: s.id }, key: `walkin:${s.id}`, data: {} };
    },
    stale: (c) => (c.cit('s')?.sec.asset != null || c.cit('s')?.gone ? 'They are no longer available.' : null),
    text: (c) => {
      const s = c.cit('s')!;
      return `A visitor at the station without an appointment: ${s.name}, ${placementOf(c.w, s).label} of ${c.w.nations[s.nation].name}. They want to talk, and they have brought a folder. "I can give you more of this. But I need to know what you can do for me."`;
    },
    choices: () => [
      { id: 'run', label: 'Take them on as an agent in place', hint: 'a source inside; could be a dangle', run: (c) => {
        const s = c.cit('s')!;
        const home = c.w.nations[c.p.nation], theirs = c.w.nations[s.nation];
        s.sec.asset = home.id;
        s.sec.motive = motiveFor(c.w, s, home);
        practise(c.w, c.p, 'lead', 0.5);
        c.p.sec.tradecraft += 1;
        // A dangle: their counter-intelligence sent them.
        if (c.roll(dirStrength(theirs, 'counter') / 250)) { s.sec.doubled = theirs.id; return done('They agree to meet again in a month. The material is good, almost too good. You file it, and something nags at you.'); }
        refresh(c.w, home, theirs, 0.5);
        return done(`${s.name} becomes a source inside ${theirs.name}. The first folder alone sharpens the service's picture of the country.`);
      } },
      { id: 'defect', label: 'Bring them over now', hint: 'a defector: one big debriefing', run: (c) => {
        const s = c.cit('s')!;
        defect(c.w, s, c.w.nations[c.p.nation]);
        practise(c.w, c.p, 'lead', 0.4);
        return done(`Two days later ${s.name} is on a plane with a new passport. The debriefing runs for weeks.`);
      } },
      { id: 'refuse', label: 'Turn them away: it smells like a trap', hint: 'safe, and maybe a missed chance', run: () => done('You thank them for their time and show them out. Whether it was a trap, you will never know.') },
    ],
  }),
  single({
    id: 'shadows.burned', icon: '🔥', tags: ['work'], weight: 6, cooldownDays: 30,
    title: () => 'Burned',
    bind: (w, p) => {
      if (jailed(w, p) || p.sec.agency == null) return null;
      const op = Object.values(w.ops).find((o) => o.agent === p.id && o.status === 'exposed' && w.time - o.ends < 2 * DAY);
      return op ? { bind: { op: op.id, t: op.target }, key: `burned:${op.id}`, data: {} } : null;
    },
    text: (c) => `Your phone buzzes at three in the morning: one word from the station, the one that means your name is in ${c.w.nations[c.num('t')].name}'s files. Your cover is blown.`,
    choices: () => [
      { id: 'low', label: 'Lie low for a month', hint: 'no operations for 30 days; tradecraft kept', run: (c) => { c.p.sec.last.op = c.w.time + 18 * DAY; return done('You stay at a desk for a month, read files and keep away from your old contacts.'); } },
      { id: 'home', label: 'Ask to be brought home', hint: 'back to your own country', run: (c) => { c.p.loc = c.p.home; return done('A car at the back door, a flight under another name, and you are home before breakfast.'); } },
      { id: 'carry', label: 'Carry on as if nothing happened', hint: 'risky: tradecraft +2 if you get away with it', run: (c) => {
        if (c.roll(0.5)) { c.p.sec.tradecraft += 2; return done('Nobody comes. Maybe the warning was wrong; maybe they are watching. You learn to check your mirrors.'); }
        c.p.sec.heat = Math.min(100, c.p.sec.heat + 25);
        return done('Two men follow you from the café to the station. You lose them, barely. Your face is now on a list.');
      } },
    ],
  }),
  single({
    id: 'shadows.estimate', icon: '📈', tags: ['work'], weight: 4, cooldownDays: 60,
    title: (c) => `The estimate on ${c.w.nations[c.num('t')]?.name ?? 'a rival'}`,
    bind: (w, p) => {
      if (jailed(w, p) || p.sec.agency !== p.nation) return null;
      const home = w.nations[p.nation];
      const rivals = w.nations.filter((o) => o.id !== home.id && !o.exile && (o.relations[home.id]?.score ?? 0) < -10);
      if (!rivals.length) return null;
      const t = pick(w, rivals);
      return { bind: { t: t.id }, key: `estimate:${t.id}:${Math.floor(today(w) / 60)}`, data: {} };
    },
    text: (c) => {
      const home = c.w.nations[c.p.nation], t = c.w.nations[c.num('t')];
      const own = Math.max(1, militaryPower(c.w, home.id));
      const [lo, hi] = rangeOf(c.w, home, t, 'mil');
      const hawk = leaderProfile(c.w, home).hawk > 0.6;
      return `The Director wants the service's judgement on ${t.name} by Friday. The evidence puts its military at ${(lo / own).toFixed(2)}–${(hi / own).toFixed(2)} times ours, and its hostility at ${Math.round(believed(c.w, home, t, 'hostile'))}. ${hawk ? 'Everyone knows the head of government expects to hear that the threat is growing.' : 'The government would rather hear that things are calm.'}`;
    },
    choices: () => [
      { id: 'evidence', label: 'Write what the evidence says', hint: 'a sharper estimate; your judgement grows', run: (c) => {
        const home = c.w.nations[c.p.nation], t = c.w.nations[c.num('t')];
        refresh(c.w, home, t, 0.3);
        practise(c.w, c.p, 'acc', 0.6);
        c.p.sec.tradecraft += 0.5;
        return done('A careful paper with its doubts stated plainly. The Director reads it twice and sends it upstairs unchanged.');
      } },
      { id: 'please', label: 'Write what the government wants to hear', hint: 'popular upstairs; the estimate drifts', run: (c) => {
        const home = c.w.nations[c.p.nation], t = c.w.nations[c.num('t')];
        const e = estimateOf(c.w, home, t);
        const hawk = leaderProfile(c.w, home).hawk > 0.6;
        if (hawk) { e.bias.mil += 0.15; e.bias.hostile += 12; } else { e.bias.mil -= 0.15; e.bias.hostile -= 12; }
        c.p.influence += 5;
        return done(`The paper lands well upstairs. ${hawk ? 'The threat, it says, is growing.' : 'The situation, it says, is stable.'} Whether that is true is another matter.`);
      } },
      { id: 'hedge', label: 'Hedge every sentence', hint: 'safe for you; useless for them', run: () => done('"On the one hand… on the other." Nobody can say you were wrong; nobody can use it either.') },
    ],
  }),
];
