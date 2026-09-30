import { useEffect, useState } from 'preact/hooks';
import { store, useStore } from './store';
import { TopBar } from './TopBar';
import { SCREENS } from './screens';
import { StartScreen } from './screens/Start';
import { ConversationPanel, EncounterModal } from './Overlays';

export function App() {
  const s = useStore();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    // Secret admin panel: Ctrl+Shift+A, or type "admin" outside a text field.
    let typed = '';
    const onKey = (e: KeyboardEvent) => {
      if (!store.w) return;
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); store.go('admin'); return; }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-5);
      if (typed === 'admin') { typed = ''; store.go('admin'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!s.w) return <StartScreen />;
  const w = s.w;
  const screen = SCREENS.find((x) => x.id === s.tab) ?? SCREENS[0];
  const groups = [...new Set(SCREENS.filter((x) => !x.hidden).map((x) => x.group))];
  const badges = screenBadges();
  return (
    <div class="app">
      <TopBar onMenu={() => setNavOpen(!navOpen)} />
      <div class="body">
        <nav class={`nav ${navOpen ? 'open' : ''}`}>
          {groups.map((g) => (
            <div class="nav-group">
              <h4>{g}</h4>
              {SCREENS.filter((x) => x.group === g && !x.hidden).map((x) => (
                <button class={x.id === s.tab ? 'on' : ''} onClick={() => { store.go(x.id); setNavOpen(false); }}>
                  <span class="ico">{x.icon}</span>{x.label}
                  {badges[x.id] ? <span class="badge">{badges[x.id]}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main class="main" key={s.tab}>
          <screen.comp w={w} />
        </main>
      </div>
      <ConversationPanel w={w} />
      <EncounterModal w={w} />
      <div class="toasts">{s.toasts.map((t) => <div class={`toast ${t.ok ? 'ok' : 'err'}`}>{t.text}</div>)}</div>
    </div>
  );
}

function screenBadges(): Record<string, number> {
  const w = store.w!;
  const b: Record<string, number> = {};
  const unread = w.notices.filter((n) => !n.read && w.settings.notifyFilter[n.cat] !== false).length;
  if (unread) b.news = unread;
  const inbox = w.inbox.filter((m) => !m.read || (m.options && !m.resolved)).length;
  if (inbox) b.inbox = inbox;
  const claim = w.player.dailies.filter((q) => q.done && !q.claimed).length;
  if (claim) b.missions = claim;
  for (const x of SCREENS) if (x.badge) { const v = x.badge(w); if (v) b[x.id] = v; }
  return b;
}
