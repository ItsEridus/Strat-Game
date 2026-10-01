import { Component, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { store, useStore } from './store';
import { TopBar } from './TopBar';
import { SCREENS } from './screens';
import { StartScreen } from './screens/Start';
import { ConversationPanel, StoryModal } from './Overlays';
import { UpdateBanner } from './Updates';
import { AdvanceBanner, AnnualReviewModal, PeriodModal, SuccessionModal } from './LifeOverlays';
import { ScreenIcon } from './icons';
import { WhatsNew } from './WhatsNew';

/** Screens that carry their own title. */
const NO_HEAD = new Set(['life', 'local', 'citizen']);

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
      // Back and forward between screens: Alt+← and Alt+→.
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); if (e.key === 'ArrowLeft') store.back(); else store.forward(); return; }
      if (e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-5);
      if (typed === 'admin') { typed = ''; store.go('admin'); }
    };
    // The back and forward buttons on a mouse.
    const onMouse = (e: MouseEvent) => {
      if (!store.w || (e.button !== 3 && e.button !== 4)) return;
      e.preventDefault();
      if (e.type === 'mouseup') { if (e.button === 3) store.back(); else store.forward(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    window.addEventListener('mouseup', onMouse);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onMouse); window.removeEventListener('mouseup', onMouse); };
  }, []);
  // Each new screen opens at its top; going back returns to where you were on it.
  useEffect(() => {
    // Restore the scroll position; retry for a few frames while the page is still laying out (fonts, late panels).
    // Slow machines can take a while to lay out a long screen, so keep trying for up to 2.5 s, unless the user scrolls.
    // Timers, not animation frames: a browser that is not drawing (a background tab, a headless test) skips frames.
    const y = store.scrollTo;
    const until = performance.now() + 2500;
    let timer = 0, stopped = false;
    const stop = () => { stopped = true; };
    const go = () => { if (stopped) return; window.scrollTo(0, y); if (Math.abs(window.scrollY - y) > 1 && performance.now() < until) timer = window.setTimeout(go, 40); };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    go();
    timer = timer || window.setTimeout(go, 0); // and once more after this render has been laid out
    return () => { clearTimeout(timer); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); };
  }, [s.page, !!s.w]);
  if (!s.w) return <><StartScreen /><WhatsNew /></>;
  const w = s.w;
  const screen = SCREENS.find((x) => x.id === s.tab) ?? SCREENS[0];
  const groups = [...new Set(SCREENS.filter((x) => !x.hidden).map((x) => x.group))];
  const badges = screenBadges();
  return (
    <div class="app">
      <Guard name="the top bar"><TopBar onMenu={() => setNavOpen(!navOpen)} /></Guard>
      <UpdateBanner />
      <AdvanceBanner />
      <div class="body">
        <nav class={`nav ${navOpen ? 'open' : ''}`}>
          {groups.map((g) => (
            <div class="nav-group">
              <h4>{g}</h4>
              {SCREENS.filter((x) => x.group === g && !x.hidden).map((x) => (
                <button class={x.id === s.tab ? 'on' : ''} onClick={() => { store.go(x.id); setNavOpen(false); }}>
                  <ScreenIcon id={x.id} fallback={x.icon} />{x.label}
                  {badges[x.id] ? <span class="badge">{badges[x.id]}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main class="main" key={s.tab}>
          {!NO_HEAD.has(screen.id) && <div class="screen-head"><ScreenIcon id={screen.id} fallback={screen.icon} size={22} /><h1>{screen.label}</h1><span class="rule" /></div>}
          <Guard key={s.page} name={`the ${screen.label} screen`}><screen.comp w={w} /></Guard>
        </main>
      </div>
      <Guard name="the conversation" quiet><ConversationPanel w={w} /></Guard>
      <Guard name="the story window" quiet><StoryModal w={w} /></Guard>
      <Guard name="the annual review" quiet><AnnualReviewModal w={w} /></Guard>
      <Guard name="the period summary" quiet><PeriodModal w={w} /></Guard>
      <Guard name="the succession" quiet><SuccessionModal w={w} /></Guard>
      <Guard name="what's new" quiet><WhatsNew /></Guard>
      <div class="toasts">{s.toasts.map((t) => <div class={`toast ${t.ok ? 'ok' : 'err'}`}>{t.text}</div>)}</div>
    </div>
  );
}

/**
 * Keeps a part of the interface that fails from taking the whole game down: the
 * error is logged, the rest keeps running and saves are unaffected. Overlays
 * (quiet) step aside and try again a few seconds later.
 */
class Guard extends Component<{ name: string; quiet?: boolean; children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error(`Meridian Reach: ${this.props.name} failed:`, error);
    if (this.props.quiet) setTimeout(() => this.setState({ error: null }), 5000);
  }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div class="panel ui-error" role="alert">
        <h3>Something went wrong in {this.props.name}</h3>
        <p class="small">The rest of the game is still running and your saves are safe.</p>
        <pre class="small">{e.message}</pre>
        <div class="row">
          <button class="btn sm primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button class="btn sm ghost" onClick={() => { this.setState({ error: null }); store.go('dashboard'); }}>Back to the dashboard</button>
        </div>
      </div>
    );
  }
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
