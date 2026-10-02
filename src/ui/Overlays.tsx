// Things that come to you: stories waiting for a decision, and the
// conversation you are having. Shown over whatever screen is open.
import { ageOf } from '../sim/growth';
import { useState } from 'preact/hooks';
import type { World } from '../sim/types';
import { store } from './store';
import { chooseStory, memoriesOf, storyIcon, storyTitle, urgentStories, viewStage } from '../sim/story';
import { converse } from '../sim/interact';
import { Avatar } from './Avatar';
import { attitude } from '../sim/interact';
import { player } from '../sim/query';
import { IDEOLOGIES } from '../data/ideologies';

/** A story waiting for your decision: the one you opened from the journal, else the oldest urgent one. */
export function StoryModal({ w }: { w: World }) {
  const [outcome, setOutcome] = useState<{ title: string; icon: string; text: string } | null>(null);
  const [later, setLater] = useState<number[]>([]);
  if (outcome) {
    return (
      <div class="modal-back">
        <div class="modal encounter" role="dialog" aria-label={outcome.title}>
          <div class="enc-icon">{outcome.icon}</div>
          <h2>{outcome.title}</h2>
          <p class="enc-text">{outcome.text}</p>
          <div class="enc-opts"><button class="btn primary" autoFocus onClick={() => setOutcome(null)}>Continue</button></div>
        </div>
      </div>
    );
  }
  const opened = store.sel.story != null ? w.story.instances[store.sel.story] : undefined;
  const inst = opened && (opened.status === 'offered' || opened.status === 'active') ? opened : urgentStories(w).find((i) => !later.includes(i.id));
  if (!inst) return null;
  const view = viewStage(w, inst);
  const title = storyTitle(w, inst);
  const icon = storyIcon(inst);
  const close = () => { if (store.sel.story === inst.id) store.go(store.tab, { story: null }); else setLater([...later, inst.id]); };
  const past = inst.decisions.slice(-2);
  return (
    <div class="modal-back">
      <div class="modal encounter" role="dialog" aria-label={title}>
        <div class="enc-icon">{icon}</div>
        <h2>{title}</h2>
        {past.length > 0 && <p class="small muted">{past.map((d) => `You chose: ${d.label.replace(/^“|”$/g, '')}. ${d.outcome}`).join(' ')}</p>}
        <p class="enc-text">{view.text}</p>
        {view.stale && <p class="warn small">{view.stale}</p>}
        <div class="enc-opts">
          {view.choices.map((o, i) => (
            <button class="enc-opt" autoFocus={i === 0} disabled={!!o.why || !!view.stale} onClick={() => {
              const r = store.act((w) => chooseStory(w, inst.id, o.id, inst.stage));
              if (r && r.ok) { setOutcome({ title, icon, text: r.msg }); if (store.sel.story === inst.id) store.sel.story = null; }
            }}>
              <b>{o.label}</b>
              <small>{o.why ? `🚫 ${o.why}` : o.hint}{o.chance != null && !o.why ? ` · ${Math.round(o.chance * 100)}% chance` : ''}</small>
            </button>
          ))}
        </div>
        <div class="row small">
          <span class="muted">{inst.deadline ? `Decide by day ${Math.floor(inst.deadline / 1440)}, ${String(Math.floor((inst.deadline % 1440) / 60)).padStart(2, '0')}:00. ` : ''}Time is paused while you decide.</span>
          <button class="btn sm ghost" onClick={close}>Decide later (Journal)</button>
        </div>
      </div>
    </div>
  );
}

export function ConversationPanel({ w }: { w: World }) {
  const convo = w.player.convo;
  if (!convo) return null;
  const npc = w.citizens[convo.npc];
  if (!npc) return null;
  const p = player(w);
  const rel = Math.round(npc.rel[p.id] ?? 0);
  return (
    <div class="convo">
      <header>
        <Avatar c={npc} size={48} />
        <div>
          <b class="link" onClick={() => store.go('citizen', { citizen: npc.id })}>{npc.name}</b>
          <small class="muted">{npc.persona} · {ageOf(w, npc)} · {IDEOLOGIES[npc.ideo].name}</small>
          <small class={rel >= 10 ? 'good' : rel <= -10 ? 'bad' : 'muted'}>{attitude(rel)} towards you ({rel > 0 ? '+' : ''}{rel})</small>
        </div>
        <button class="btn sm ghost" onClick={() => store.act((w) => converse(w, 'bye'))}>✕</button>
      </header>
      {memoriesOf(w, npc.id).length > 0 && <p class="small muted convo-mem">Remembers: you {memoriesOf(w, npc.id).at(-1)!.text}</p>}
      <div class="convo-lines">
        {convo.lines.map((l) => <p class={`line ${l.who}`}>{l.text}</p>)}
      </div>
      <div class="convo-choices">
        {convo.choices.map((c) => (
          <button class="choice" disabled={!!c.why} title={c.why} onClick={() => store.act((w) => converse(w, c.id))}>{c.label}{c.why ? <small>{c.why}</small> : null}</button>
        ))}
      </div>
    </div>
  );
}
