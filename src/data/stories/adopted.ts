// Inbox decisions presented as stories. The message stays the authority: the
// story's choices call the same reply handler, and answering in the inbox
// updates the story. Richer chains for strikes, loans, extortion and spy
// approaches live in their own modules; these are single-step views.
import type { StoryDef } from '../../sim/story';
import { DAY } from '../../engine/clock';
import { done, linkedMsg, reply } from './kit';

function adoptedSingle(kind: string, icon: string, tags: string[], hints: Record<string, string> = {}): StoryDef {
  return {
    id: `msg.${kind}`, version: 1, icon, kind: 'standalone', tags, adopts: kind,
    title: (c) => linkedMsg(c)?.subject ?? 'A decision',
    start: 'decide',
    stages: {
      decide: {
        urgent: true,
        expires: 3 * DAY,
        text: (c) => { const m = linkedMsg(c); return m ? `${m.from != null && c.w.citizens[m.from] ? `From ${c.w.citizens[m.from].name}: ` : ''}${m.body}` : 'The message is no longer available.'; },
        stale: (c) => { const m = linkedMsg(c); return !m ? 'The message has been cleared from your inbox.' : m.resolved && c.inst.data.replied == null ? 'You already answered this in your inbox.' : null; },
        choices: (c) => (linkedMsg(c)?.options ?? []).map((o) => reply(o.id, o.label, hints[o.id] ?? 'as in your inbox', (_c, text) => done(text || 'Answered.', o.id))),
        onExpire: () => ({ text: 'You left it unanswered. It is still in your inbox if it matters.', end: 'unanswered' }),
      },
    },
  };
}

export const ADOPTED: StoryDef[] = [
  adoptedSingle('bribeOffer', '💼', ['crime', 'politics'], { accept: 'money now; a bribery case if it comes out', decline: 'no change', report: 'the police open a case against them' }),
  adoptedSingle('arrest', '🚔', ['crime']),
  adoptedSingle('interview', '🎙️', ['press'], { bold: 'more influence and fame — or a gaffe', safe: '+1 influence', decline: 'no change' }),
  adoptedSingle('debate', '🎤', ['politics']),
  adoptedSingle('syndInvite', '🕴️', ['crime']),
];
