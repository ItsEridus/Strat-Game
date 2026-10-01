// Stories of the arsenal (1.8): an R&D programme in trouble, an export licence on the
// minister's desk, and exercise season for those in uniform. They act through the
// normal rules (programmes, arms orders, exercises, service points).
import type { Ctx } from '../../sim/story';
import { chance } from '../../engine/rng';
import { today } from '../../sim/query';
import { nationPerm } from '../../sim/authority';
import { lifeOf } from '../../sim/lifecycle';
import { practise } from '../../sim/growth';
import { addSp, onActiveDuty } from '../../sim/forces';
import { CLASS_INFO, EQUIP_CLASSES } from '../../data/arsenal';
import { arsenalOf, splitOf } from '../../sim/arsenal';
import { cancelProgramme, exportLicence, orderCheck, placeOrder, runningOrders, runningProgrammes } from '../../sim/defenceIndustry';
import { relation } from '../../sim/congress';
import { done, single, why } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };
const prog = (c: Ctx) => runningProgrammes(c.w.nations[c.p.nation]).find((x) => x.id === c.num('pr'));

export const DEFENCE_STORIES = [
  single({
    id: 'defence.overrun', icon: '📉', tags: ['politics'], weight: 4, cooldownDays: 60,
    title: (c) => `Over budget and behind schedule: the ${prog(c)?.name ?? 'programme'}`,
    bind: (w, p) => {
      if (!nationPerm(w, p.id, p.nation, 'war')) return null;
      const pr = runningProgrammes(w.nations[p.nation]).find((x) => x.overrun >= 0.3);
      return pr ? { bind: { pr: pr.id }, key: `overrun:${pr.id}:${Math.floor(pr.overrun * 10)}`, data: {} } : null;
    },
    stale: (c) => (!prog(c) ? 'The programme is no longer running.' : null),
    text: (c) => { const pr = prog(c)!; return `The programme manager's briefing runs to sixty slides. The ${pr.name} — generation ${pr.target} ${CLASS_INFO[pr.cls].label.toLowerCase()} — is ${Math.round(pr.overrun * 100)}% over budget after ${pr.slips} setbacks. The contractor wants more money. The press has the numbers.`; },
    choices: () => [
      { id: 'press', label: 'Press on, and move money from procurement to R&D', hint: 'R&D share +2 points; procurement −2', run: (c) => { const s = splitOf(c.w.nations[c.p.nation]); if (s.procurement > 0.05) { s.procurement -= 0.02; s.rd += 0.02; } mood(c, 0, 4); return done('The programme gets its money. The forces will wait a little longer for new equipment.'); } },
      { id: 'restructure', label: 'Restructure: a less ambitious design', hint: 'overrun −15 points; half a generation less', run: (c) => { const pr = prog(c)!; pr.overrun = Math.max(0, pr.overrun - 0.15); pr.target = Math.max(2, pr.target - 0.5); mood(c, 1, 1); return done(`The ${pr.name} is rescoped. It will deliver less, but it will deliver.`); } },
      { id: 'cancel', label: 'Cancel it', hint: 'the money spent is gone; the R&D budget is freed', run: (c) => { const r = cancelProgramme(c.w, c.p.id, c.w.nations[c.p.nation], prog(c)!.id, 'the minister cancelled it over cost'); mood(c, -1, -3); return done(r.msg); } },
      { id: 'blame', label: 'Blame the contractor in public', hint: 'a popular move; nothing actually changes', run: (c) => { const n = c.w.nations[c.p.nation]; n.approval = Math.min(100, n.approval + 1); return done('The headlines are kind to you for a day. The programme carries on exactly as before.'); } },
    ],
  }),
  single({
    id: 'defence.licence', icon: '📝', tags: ['politics'], weight: 3, cooldownDays: 45,
    title: (c) => `The export licence: ${c.w.nations[c.num('b')]?.name ?? 'a buyer'}`,
    bind: (w, p) => {
      if (!nationPerm(w, p.id, p.nation, 'war')) return null;
      const me = w.nations[p.nation];
      const mine = arsenalOf(w, me);
      for (const b of w.nations) {
        if (b.id === me.id || b.exile || exportLicence(w, me, b) || runningOrders(b).length >= 2) continue;
        const cls = EQUIP_CLASSES.find((k) => arsenalOf(w, b)[k].gen && mine[k].frontier - arsenalOf(w, b)[k].gen >= 1 && !orderCheck(w, null, b, k, me));
        if (cls) return { bind: { b: b.id }, key: `licence:${b.id}:${cls}:${Math.floor(today(w) / 45)}`, data: { cls } };
      }
      return null;
    },
    stale: (c) => exportLicence(c.w, c.w.nations[c.p.nation], c.w.nations[c.num('b')]),
    text: (c) => { const b = c.w.nations[c.num('b')]; return `${b.name}'s ambassador has asked for a licence to buy ${CLASS_INFO[c.str('cls') as keyof typeof CLASS_INFO].label.toLowerCase()} from your defence industry. The deal would keep a factory busy for years. Your officials point out that weapons outlast the friendships they were sold under.`; },
    choices: () => [
      { id: 'approve', label: 'Grant the licence', hint: 'years of orders for your contractor; closer ties', run: (c) => { const me = c.w.nations[c.p.nation], b = c.w.nations[c.num('b')]; const r = placeOrder(c.w, null, b, c.str('cls') as never, me); relation(c.w, me.id, b.id, 5, 'arms deal'); return done(r.ok ? `Signed. ${r.msg}` : r.msg); } },
      { id: 'refuse', label: 'Refuse', hint: 'relations suffer', run: (c) => { relation(c.w, c.p.nation, c.num('b'), -3, 'export licence refused'); return done('The ambassador takes the refusal politely and the request elsewhere.'); } },
      { id: 'later', label: 'Ask for assurances first', hint: 'the request stays on file', run: () => done('Your officials draft a long letter about end-user certificates. The matter can wait.') },
    ],
  }),
  single({
    id: 'defence.exercise', icon: '🎯', tags: ['military'], weight: 3, cooldownDays: 30,
    title: () => 'Exercise season',
    bind: (w, p) => {
      if (!onActiveDuty(p) || !p.mil.branch) return null;
      const t = w.nations[p.nation].defense.exercised?.[p.mil.branch];
      return t != null && w.time - t < 3 * 1440 ? { bind: {}, key: `exercise:${p.mil.branch}:${Math.floor(t / 1440)}`, data: {} } : null;
    },
    text: () => 'The whole formation is out on the ranges for a week: live fire, night moves, umpires with clipboards and no sleep to speak of. Your unit has drawn the hardest sector.',
    choices: (c) => [
      { id: 'allout', label: 'Go all out', hint: 'service points and a name for yourself; a risk of injury', why: why(c.p.energy >= 20, 'Too tired.'), run: (c) => { c.p.energy -= 20; if (chance(c.w, 0.15)) { c.p.health = Math.max(5, (c.p.health ?? 90) - 10); addSp(c.w, c.p, 2); return done('You push too hard on the night march and twist a knee. Still, the umpires noticed.'); } addSp(c.w, c.p, 6); practise(c.w, c.p, 'lead', 0.5); mood(c, 4, 3); return done('Your unit takes its objective ahead of schedule. The brigade commander asks your name.'); } },
      { id: 'safe', label: 'Keep it steady', hint: 'a little experience, no drama', run: (c) => { addSp(c.w, c.p, 2); practise(c.w, c.p, 'end', 0.3); return done('A solid week. Nobody notices, which in the army is often the point.'); } },
      { id: 'opfor', label: 'Volunteer for the opposing force', hint: 'play the enemy: learn their tactics', run: (c) => { addSp(c.w, c.p, 3); practise(c.w, c.p, 'acc', 0.5); mood(c, 3, 1); return done('Playing the enemy, you ambush a whole company. The after-action review quotes you twice.'); } },
    ],
  }),
];
