// Stories of the frontier (2.4): a breakthrough in the lab, machines arriving at work, and a
// launch window. They act through the normal rules (fame, influence, money paid from a
// treasury, the country's technology level, education, space missions).
import type { Ctx } from '../../sim/story';
import { DAY } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { c as cur } from '../../engine/money';
import { cref, jailed, natref } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { occupationOf } from '../../sim/labour';
import { capsOf } from '../../sim/strategic';
import { TECHS, type TechDef } from '../../data/techTree';
import { hasTech, techFx, threshold } from '../../sim/technology';
import { exposureOf } from '../../sim/automation';
import { MISSIONS } from '../../data/space';
import { crewFor, flyMission, spaceCapability, spaceOf } from '../../sim/space';
import { done, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
/** The frontier technology the player's country is closest to (not yet held). */
function nearest(c: Ctx): TechDef | null {
  const n = c.w.nations[c.p.nation];
  const caps = capsOf(c.w, n);
  return TECHS.filter((d) => !hasTech(n, d.id)).sort((a, b) => (threshold(a) - caps.tech[a.domain]) - (threshold(b) - caps.tech[b.domain]))[0] ?? null;
}

export const FRONTIER_STORIES = [
  single({
    id: 'tech.breakthrough', icon: '🔬', tags: ['work'], weight: 6, cooldownDays: 120,
    title: () => 'The breakthrough',
    bind: (w, p) => {
      const lab = p.post?.kind === 'research' || occupationOf(w, p) === 'scientist';
      if (!lab || jailed(w, p)) return null;
      return { bind: {}, key: `breakthrough:${Math.floor(w.time / (120 * DAY))}`, data: {} };
    },
    text: (c) => {
      const d = nearest(c);
      return `Three in the morning, and the result is still there on the screen after the fourth check. If it holds, it moves ${c.w.nations[c.p.nation].adj} work on ${d ? d.name.toLowerCase() : 'the frontier'} a long step forward. Your colleagues are asleep. What happens next is, for a few hours, up to you.`;
    },
    choices: () => [
      { id: 'publish', label: 'Publish it openly', hint: 'fame; the whole world moves forward a little', run: (c) => {
        const d = nearest(c);
        if (d) for (const n of c.w.nations) if (!n.exile) capsOf(c.w, n).tech[d.domain] += n.id === c.p.nation ? 0.4 : 0.15;
        c.p.sec.fame += 6; practise(c.w, c.p, 'acc', 0.5); mood(c, 6, -2);
        return done('The preprint goes up at nine. By lunchtime labs on three continents are trying to reproduce it, and your inbox is full.');
      } },
      { id: 'patent', label: 'Patent it and take a grant', hint: 'money from the research budget; the lead stays at home', run: (c) => {
        const n = c.w.nations[c.p.nation];
        const d = nearest(c);
        if (d) capsOf(c.w, n).tech[d.domain] += 0.5;
        const amt = Math.min(cur(800), Math.floor((n.wallet[n.cur] ?? 0) * 0.001));
        if (amt > 0) pay(c.w, natref(n.id), cref(c.p.id), n.cur, amt, 'Research grant');
        c.p.influence += 6; mood(c, 4, 1);
        return done('Lawyers, a patent filing, a grant from the ministry. The paper will wait a year; the advantage stays at home.');
      } },
      { id: 'defence', label: 'Offer it to the defence ministry', hint: 'military technology advances; you can never talk about it', run: (c) => {
        const n = c.w.nations[c.p.nation];
        capsOf(c.w, n).tech.military += 0.6;
        c.p.influence += 10; mood(c, -1, 4);
        return done('Two officials take your notebooks and thank you for your discretion. The best work you have ever done will stay in a locked drawer.');
      } },
    ],
  }),
  single({
    id: 'tech.machines', icon: '🤖', tags: ['work'], weight: 6, cooldownDays: 180,
    title: () => 'The machines are coming',
    bind: (w, p) => {
      const n = w.nations[p.nation];
      if (p.job == null || jailed(w, p) || techFx(n).automation <= 0 || exposureOf(w, p) < 0.3) return null;
      return { bind: {}, key: `machines:${Math.floor(w.time / (180 * DAY))}`, data: {} };
    },
    text: (c) => `A consultant has been walking the floor at work with a tablet, timing every task. Word is that the company is pricing machines that could do much of what you do. Some colleagues are angry, some are polishing their CVs, and one has signed up for night classes.`,
    choices: () => [
      { id: 'retrain', label: 'Start retraining', hint: 'skills for work machines cannot do; tiring', run: (c) => { practise(c.w, c.p, 'acc', 0.6); practise(c.w, c.p, 'eco', 0.4); mood(c, 1, 8); c.p.flags.retraining = c.w.time; return done('Two evenings a week, a classroom that smells of coffee and whiteboard pens. It is hard. It is also, you notice, the first thing in a while that feels like yours.'); } },
      { id: 'union', label: 'Organise with your colleagues', hint: 'influence; the bosses will not love you', run: (c) => { c.p.influence += 8; practise(c.w, c.p, 'lead', 0.5); mood(c, 2, 5); const n = c.w.nations[c.p.nation]; n.backlash = Math.min(100, (n.backlash ?? 0) + 3); return done('A meeting in the car park after the shift, then another in the union hall. The local paper runs a story. The consultant does not come back for a week.'); } },
      { id: 'wait', label: 'Keep your head down', hint: 'nothing changes, for now', run: (c) => { mood(c, -2, 4); return done('You work, you go home, you try not to think about the tablet. Machines are expensive, you tell yourself. Maybe not this year.'); } },
    ],
  }),
  single({
    id: 'space.launch', icon: '🚀', tags: ['work'], weight: 8, cooldownDays: 90,
    title: () => 'Launch window',
    bind: (w, p) => {
      if (p.post?.kind !== 'astronaut' || p.post.grade < 1 || jailed(w, p)) return null;
      const s = spaceOf(w.nations[p.nation]);
      if (!s.launcher) return null;
      return { bind: {}, key: `launch:${Math.floor(w.time / (90 * DAY))}`, data: {} };
    },
    text: (c) => {
      const n = c.w.nations[c.p.nation];
      const s = spaceOf(n);
      const m = MISSIONS.find((x) => s.missions[x.id] == null && spaceCapability(c.w, n) >= x.level);
      return `The weather officer gives it seventy per cent. The rocket stands on the pad, venting white vapour, and the window opens in four hours. ${m ? `If it goes, ${n.name} attempts ${m.name.toLowerCase()}, and you are on the crew.` : 'It is a routine crew rotation to orbit — routine for everyone except the people strapped into the capsule.'} The flight director asks, as she asks every crew member: go or no go?`;
    },
    choices: () => [
      { id: 'go', label: 'Go', hint: 'fame and the flight of a lifetime; missions can fail', run: (c) => {
        const n = c.w.nations[c.p.nation];
        const s = spaceOf(n);
        const m = MISSIONS.find((x) => s.missions[x.id] == null && spaceCapability(c.w, n) >= x.level && x.crewed);
        practise(c.w, c.p, 'end', 0.8);
        if (m) {
          const ok = flyMission(c.w, n, m);
          // A successful mission counts the flight for its crew; otherwise count it here.
          if (!ok || !crewFor(c.w, n).some((x) => x.id === c.p.id)) c.p.flags.spaceflights = (c.p.flags.spaceflights ?? 0) + 1;
          c.p.sec.fame += ok ? 4 : 1; mood(c, ok ? 10 : -4, ok ? -4 : 12);
          return done(ok ? 'Eight minutes of thunder, then silence and the Earth turning blue below the window. You did it.' : 'Something went wrong on the way up. The abort system worked; you are alive, shaken, and already being asked when you will try again.');
        }
        c.p.flags.spaceflights = (c.p.flags.spaceflights ?? 0) + 1;
        c.p.sec.fame += 3; c.p.influence += 5; mood(c, 8, -2);
        return done('Eight minutes of thunder, then silence, and the Earth turning blue below the window. Six months in orbit begin.');
      } },
      { id: 'scrub', label: 'Call a hold: something is not right', hint: 'safe; some will call it caution, some nerves', run: (c) => { mood(c, -2, 2); c.p.influence = Math.max(0, c.p.influence - 2); return done('The countdown stops at T-minus forty minutes. The engineers find a valve reading out of tolerance. Maybe you were right. The window opens again in three weeks.'); } },
      { id: 'seat', label: 'Give your seat to a colleague', hint: 'loyalty; you stay on the ground', run: (c) => { mood(c, -3, -3); c.p.influence += 3; return done('You watch the launch from the control room, a headset on, your colleague\'s voice calm on the loop. It is a good flight. Your turn will come.'); } },
    ],
  }),
];
