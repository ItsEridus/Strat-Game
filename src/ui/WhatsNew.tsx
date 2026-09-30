// What's new: after an update, the game shows the release notes of every
// version installed since the player last looked (the same notes as the release
// page). New players are not shown a changelog. It can be reopened any time
// from Settings and the title screen.
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { GAME_VERSION, newer } from './Updates';
import { SLOTS, slotInfo } from '../engine/save';

export interface Notes { version: string; title: string; body: string }
/** Release notes by version, newest first (embedded by the build from docs/RELEASE_NOTES.md). */
export const NOTES: Notes[] = typeof __NOTES__ !== 'undefined' ? __NOTES__ : [];

const KEY = 'meridian-seen-version';
const full = (v: string) => { const p = v.split('.'); while (p.length < 3) p.push('0'); return p.join('.'); };
const isCurrent = (n: Notes) => full(n.version) === full(GAME_VERSION);

/** Notes of the versions after `since`, up to the one running now. */
export function notesSince(since: string): Notes[] {
  return NOTES.filter((n) => !newer(full(n.version), GAME_VERSION) && newer(full(n.version), full(since)));
}

function seen(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
function markSeen() { try { localStorage.setItem(KEY, GAME_VERSION); } catch { /* private window: shown again next time */ } }

/** What to show when the game starts: nothing for a new player or when already seen. */
export function notesOnStart(): Notes[] {
  const last = seen();
  if (last === GAME_VERSION) return [];
  if (last == null) {
    // Before this window existed nothing was recorded: someone with saved games has updated; a new player has not.
    if (!SLOTS.some((s) => slotInfo(s))) { markSeen(); return []; }
    return NOTES.filter(isCurrent);
  }
  return notesSince(last);
}

let shown: Notes[] | null = null;
const listeners = new Set<() => void>();
const changed = () => { for (const f of listeners) f(); };
/** Open the window (the current version's notes by default). */
export function showWhatsNew(list?: Notes[]) { const cur = NOTES.filter(isCurrent); shown = list ?? (cur.length ? cur : NOTES.slice(0, 1)); changed(); }
let checked = false;

/** The window; mount once. Opens by itself after an update. */
export function WhatsNew() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((x) => x + 1);
    listeners.add(f);
    if (!checked) { checked = true; const list = notesOnStart(); if (list.length) showWhatsNew(list); }
    return () => { listeners.delete(f); };
  }, []);
  if (!shown?.length) return null;
  const close = () => { markSeen(); shown = null; changed(); };
  const [first, ...older] = shown;
  return (
    <div class="modal-back" onClick={close}>
      <div class="modal whatsnew" role="dialog" aria-label="What's new" onClick={(e) => e.stopPropagation()}>
        <header>
          <small class="muted">What's new</small>
          <h2>Meridian Reach {first.version}</h2>
          {first.title && <p class="tagline">{first.title}</p>}
        </header>
        <Md text={first.body} />
        {older.map((n) => (
          <details>
            <summary>Also new since you last played: {n.version}{n.title ? ` — ${n.title}` : ''}</summary>
            <Md text={n.body} />
          </details>
        ))}
        <footer class="row"><button class="btn primary" onClick={close}>Got it</button></footer>
      </div>
    </div>
  );
}

/**
 * The small part of Markdown the release notes use: paragraphs, "- " lists with
 * wrapped lines and one level of nesting ("  - "), **bold** and `code`.
 */
function Md({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <div class="md">
      {blocks.map((b) => {
        const lines = b.split('\n');
        if (!lines[0].startsWith('- ')) return <p>{inline(lines.map((l) => l.trim()).join(' '))}</p>;
        type Item = { text: string; sub: string[] };
        const items: Item[] = [];
        for (const l of lines) {
          const last = items[items.length - 1];
          if (l.startsWith('- ')) items.push({ text: l.slice(2), sub: [] });
          else if (/^\s{2,}- /.test(l) && last) last.sub.push(l.trim().slice(2));
          else if (last) { if (last.sub.length) last.sub[last.sub.length - 1] += ` ${l.trim()}`; else last.text += ` ${l.trim()}`; }
        }
        return <ul>{items.map((i) => <li>{inline(i.text)}{i.sub.length > 0 && <ul>{i.sub.map((x) => <li>{inline(x)}</li>)}</ul>}</li>)}</ul>;
      })}
    </div>
  );
}

function inline(s: string): ComponentChildren {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p) => (p.startsWith('**') && p.endsWith('**') ? <b>{p.slice(2, -2)}</b> : p.startsWith('`') && p.endsWith('`') ? <code>{p.slice(1, -1)}</code> : p));
}
