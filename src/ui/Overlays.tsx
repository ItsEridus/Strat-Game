// Things that come to you: encounters waiting for a decision, and the
// conversation you are having. Shown over whatever screen is open.
import { useState } from 'preact/hooks';
import type { World } from '../sim/types';
import { store } from './store';
import { resolveEncounter } from '../sim/encounters';
import { converse } from '../sim/interact';
import { Avatar } from './Avatar';
import { attitude } from '../sim/interact';
import { player } from '../sim/query';
import { IDEOLOGIES } from '../data/ideologies';

export function EncounterModal({ w }: { w: World }) {
  const [outcome, setOutcome] = useState<{ title: string; icon: string; text: string } | null>(null);
  const e = w.player.encounter;
  if (outcome) {
    return (
      <div class="modal-back">
        <div class="modal encounter">
          <div class="enc-icon">{outcome.icon}</div>
          <h2>{outcome.title}</h2>
          <p class="enc-text">{outcome.text}</p>
          <div class="enc-opts"><button class="btn primary" onClick={() => setOutcome(null)}>Continue</button></div>
        </div>
      </div>
    );
  }
  if (!e) return null;
  return (
    <div class="modal-back">
      <div class="modal encounter">
        <div class="enc-icon">{e.icon}</div>
        <h2>{e.title}</h2>
        <p class="enc-text">{e.text}</p>
        <div class="enc-opts">
          {e.options.map((o) => (
            <button class="enc-opt" disabled={!!o.why} title={o.why} onClick={() => {
              const r = store.act((w) => resolveEncounter(w, o.id));
              if (r && r.ok) setOutcome({ title: e.title, icon: e.icon, text: r.msg });
            }}>
              <b>{o.label}</b>
              <small>{o.why ?? o.hint}</small>
            </button>
          ))}
        </div>
        <p class="muted small">Time is paused. If you don’t decide within a day, the moment passes.</p>
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
          <small class="muted">{npc.persona} · level {npc.level} · {IDEOLOGIES[npc.ideo].name}</small>
          <small class={rel >= 10 ? 'good' : rel <= -10 ? 'bad' : 'muted'}>{attitude(rel)} towards you ({rel > 0 ? '+' : ''}{rel})</small>
        </div>
        <button class="btn sm ghost" onClick={() => store.act((w) => converse(w, 'bye'))}>✕</button>
      </header>
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
