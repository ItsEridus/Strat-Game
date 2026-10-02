// Stories of diplomacy (2.0 The great game): the summit, the note from the embassy and
// the vote in the Council. They are for diplomats and heads of government, and they act
// through the normal rules (relations, crises, UN votes, approval, skills).
import type { Ctx } from '../../sim/story';
import { DAY } from '../../engine/clock';
import { jailed } from '../../sim/query';
import { practise } from '../../sim/growth';
import { relation } from '../../sim/congress';
import { activeCrises, CRISIS_INFO, LEVELS } from '../../sim/crises';
import { castVote, intlOf, RES_INFO, voters } from '../../sim/intlOrgs';
import { done, single } from './kit';

const isHead = (c: Ctx) => c.w.nations[c.p.nation].president === c.p.id;
const diplomatGrade = (c: { post?: { kind: string; grade: number } }) => (c.post?.kind === 'diplomat' ? c.post.grade : -1);

export const DIPLOMACY_STORIES = [
  single({
    id: 'diplomacy.summit', icon: '🤝', tags: ['work'], weight: 5, cooldownDays: 60,
    title: (c) => `The summit with ${c.w.nations[c.num('o')]?.name ?? 'the visitors'}`,
    bind: (w, p) => {
      if (jailed(w, p)) return null;
      const n = w.nations[p.nation];
      const head = n.president === p.id;
      if (!head && diplomatGrade(p) < 1) return null;
      const recent = Object.entries(n.summits ?? {}).filter(([, t]) => w.time - t < 3 * DAY).map(([o]) => Number(o));
      if (!recent.length) return null;
      return { bind: { o: recent[0] }, key: `summit:${n.id}:${recent[0]}:${Math.floor(w.time / (30 * DAY))}`, data: { head: head ? 1 : 0 } };
    },
    stale: (c) => (c.w.time - (c.w.nations[c.p.nation].summits?.[c.num('o')] ?? 0) > 5 * DAY ? 'The summit is over.' : null),
    text: (c) => {
      const o = c.w.nations[c.num('o')];
      return c.num('head')
        ? `Two days with the leader of ${o.name}. The officials have agreed a careful communiqué, but in the last private session your counterpart leans across the table: "We could go further than this, you and I."`
        : `You are on the delegation for the summit with ${o.name}. At two in the morning the communiqué is still unfinished, and the ambassador hands you the pen: "Find words both sides can sign."`;
    },
    choices: () => [
      { id: 'bold', label: 'Push for something bold', hint: 'a real step forward, or a public stumble', run: (c) => {
        const o = c.num('o');
        practise(c.w, c.p, 'lead', 0.5);
        if (c.roll(0.55)) { relation(c.w, c.p.nation, o, 6, 'a breakthrough at the summit'); return done('It works. The final statement goes further than anyone expected, and the press calls it a new chapter.'); }
        relation(c.w, c.p.nation, o, -3, 'an overreach at the summit');
        return done('It goes wrong: the other side leaks that you asked for too much. The summit ends with a thinner statement and colder smiles.');
      } },
      { id: 'safe', label: 'Stick to the agreed text', hint: 'a modest, safe result', run: (c) => { relation(c.w, c.p.nation, c.num('o'), 2, 'a steady summit'); practise(c.w, c.p, 'eco', 0.3); return done('Nothing dramatic. The communiqué says what it was always going to say, and both sides go home satisfied.'); } },
      { id: 'leak', label: 'Brief the press that you stood firm', hint: 'popular at home; the other side notices', run: (c) => { const n = c.w.nations[c.p.nation]; n.approval = Math.min(100, n.approval + 1); relation(c.w, c.p.nation, c.num('o'), -3, 'spun the summit against us'); return done('The papers at home love it. In the other capital, they read the same headlines and remember them.'); } },
    ],
  }),
  single({
    id: 'diplomacy.embassy', icon: '✉️', tags: ['work'], weight: 6, cooldownDays: 20,
    title: (c) => `A note from the embassy in ${c.w.nations[c.num('o')]?.name ?? 'the capital'}`,
    bind: (w, p) => {
      if (jailed(w, p) || diplomatGrade(p) < 0) return null;
      const cr = activeCrises(w, p.nation)[0];
      if (!cr) return null;
      const o = cr.a === p.nation ? cr.b : cr.a;
      return { bind: { o, cr: cr.id }, key: `embassy:${cr.id}:${cr.level}`, data: { level: cr.level } };
    },
    stale: (c) => ((c.w.standoffs ?? []).find((x) => x.id === c.num('cr'))?.status !== 'active' ? 'The crisis is over.' : null),
    text: (c) => {
      const cr = (c.w.standoffs ?? []).find((x) => x.id === c.num('cr'))!;
      return `A cable from the embassy in ${c.w.nations[c.num('o')].name}, marked urgent: the ${CRISIS_INFO[cr.kind].name.toLowerCase()} has reached ${LEVELS[cr.level]}. Their foreign ministry has quietly asked whether "there is anyone sensible to talk to". The minister wants your advice by morning.`;
    },
    choices: () => [
      { id: 'channel', label: 'Open a quiet back channel', hint: 'calmer waters, if they are sincere', run: (c) => {
        const cr = (c.w.standoffs ?? []).find((x) => x.id === c.num('cr'))!;
        practise(c.w, c.p, 'lead', 0.5);
        if (c.roll(0.6)) { cr.quiet = (cr.quiet ?? 0) + 1; relation(c.w, c.p.nation, c.num('o'), 2, 'a quiet word through the back channel'); return done('Two phone calls and a long lunch later, both capitals have a way to step back without losing face.'); }
        return done('They were testing you. The channel goes quiet the next day, and the minister asks why you were so eager.');
      } },
      { id: 'firm', label: 'Advise a firm reply', hint: 'no signs of weakness', run: (c) => { relation(c.w, c.p.nation, c.num('o'), -2, 'a stiff note from their embassy'); practise(c.w, c.p, 'acc', 0.3); return done('The note is delivered as drafted: courteous, cold and unyielding.'); } },
      { id: 'file', label: 'File it and wait for instructions', hint: 'nothing changes', run: () => done('You file the cable with a two-line summary. Someone more senior can decide.') },
    ],
  }),
  single({
    id: 'diplomacy.council', icon: '🇺🇳', tags: ['work'], weight: 6, cooldownDays: 15,
    title: () => 'The vote in the Council',
    bind: (w, p) => {
      if (jailed(w, p)) return null;
      const n = w.nations[p.nation];
      const head = n.president === p.id;
      const senior = diplomatGrade(p) >= 3 || (p.post?.kind === 'intlcivil' && p.post.grade >= 2);
      if (!head && !senior) return null;
      const r = intlOf(w).resolutions.find((x) => x.status === 'open' && voters(w, x).includes(n.id) && !x.votes[n.id] && x.target !== n.id);
      if (!r) return null;
      return { bind: { r: r.id, t: r.target, s: r.sponsor }, key: `council:${r.id}`, data: { head: head ? 1 : 0 } };
    },
    stale: (c) => (intlOf(c.w).resolutions.find((x) => x.id === c.num('r'))?.status !== 'open' ? 'The vote has been taken.' : null),
    text: (c) => {
      const r = intlOf(c.w).resolutions.find((x) => x.id === c.num('r'))!;
      const body = r.body === 'sc' ? 'Security Council' : 'General Assembly';
      return `${c.w.nations[r.sponsor].name} has tabled a resolution at the ${body}: ${RES_INFO[r.kind].name.toLowerCase()} (${c.w.nations[r.target].name}). Its ambassador has called twice this morning; ${c.w.nations[r.target].name}'s has sent flowers. ${c.num('head') ? 'How will your country vote?' : 'The capital wants your recommendation, and it usually follows it.'}`;
    },
    choices: () => (['y', 'n', 'a'] as const).map((v) => ({
      id: v, label: v === 'y' ? 'Vote for it' : v === 'n' ? 'Vote against it' : 'Abstain',
      hint: v === 'y' ? `closer to the sponsor; the target is offended` : v === 'n' ? 'the target is grateful; the sponsor is not' : 'nobody is pleased, nobody is offended',
      run: (c: Ctx) => {
        const r = intlOf(c.w).resolutions.find((x) => x.id === c.num('r'))!;
        const n = c.w.nations[c.p.nation];
        // A senior diplomat's advice is taken more often than not.
        const followed = isHead(c) || c.roll(0.7);
        if (followed) castVote(c.w, n, r, v);
        practise(c.w, c.p, 'lead', 0.3);
        if (followed && v === 'y') { relation(c.w, n.id, r.sponsor, 2, 'voted with us at the UN'); relation(c.w, n.id, r.target, -2, 'voted against us at the UN'); }
        if (followed && v === 'n') { relation(c.w, n.id, r.target, 3, 'stood by us at the UN'); relation(c.w, n.id, r.sponsor, -2, 'voted against our resolution'); }
        return done(followed ? `${n.name} will vote ${v === 'y' ? 'for' : v === 'n' ? 'against' : 'to abstain'}.` : 'The capital thanks you for your advice and decides otherwise.');
      },
    })),
  }),
];
