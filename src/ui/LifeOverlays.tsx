// Life-simulation overlays: the long-advance progress banner and the annual
// review shown on each birthday.
import { store, useStore } from './store';
import { Btn } from './common';
import { fmtClock, fmtDur } from '../engine/clock';
import { fmtAmt } from '../engine/money';
import type { World } from '../sim/types';
import { pendingReview } from '../sim/lifecycle';
import { useEffect } from 'preact/hooks';
import { sound } from './sound';
import { fmtDate } from '../engine/calendar';

/** Shows a long advance in progress, or where it stopped and why. */
export function AdvanceBanner() {
  const s = useStore();
  const w = s.w;
  const a = w?.life.advance;
  if (!w || !a) return null;
  const span = Math.max(1, a.target - a.from);
  const pct = Math.max(0, Math.min(100, ((w.time - a.from) / span) * 100));
  return (
    <div class={`advance-banner ${s.advRunning ? 'running' : 'stopped'}`} role="status" aria-live="polite">
      <div class="advance-text">
        {s.advRunning
          ? <span>⏩ Advancing to <b>{a.label}</b> — {fmtClock(w)} · {fmtDur(a.target - w.time)} to go</span>
          : <span>⏸ Stopped at <b>{fmtClock(w)}</b>{s.advStopped ? <>: {s.advStopped}</> : null}. Still {fmtDur(a.target - w.time)} to <b>{a.label}</b>.</span>}
      </div>
      <div class="advance-bar"><i style={{ width: `${pct}%` }} /></div>
      <div class="advance-actions">
        {s.advRunning
          ? <Btn small onClick={() => store.cancelAdvanceKeepTarget()}>Stop here</Btn>
          : <Btn small kind="primary" onClick={() => store.resumeAdvance()}>Resume</Btn>}
        <Btn small kind="ghost" onClick={() => store.cancelAdvance()}>Cancel</Btn>
      </div>
    </div>
  );
}

/** The year in review, on the player's birthday. */
export function AnnualReviewModal({ w }: { w: World }) {
  useStore();
  const r = pendingReview(w);
  const show = !!r && !store.advRunning;
  useEffect(() => { if (show) sound(w, 'fanfare'); }, [show]);
  if (!r || !show) return null;
  const delta = r.money.end - r.money.start;
  const close = () => { r.seen = true; store.emit(); };
  return (
    <div class="modal-back cinema" onClick={close}>
      <div class="modal review cinema" role="dialog" aria-label={`Age ${r.age}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <small class="muted">{fmtClock(w, r.from)} → {fmtClock(w, r.to)}</small>
          <h2>🎂 You are {r.age}</h2>
        </header>
        <section>
          <h4>Your year</h4>
          {r.lines.length ? <ul class="review-lines">{r.lines.map((l) => <li class={`k-${l.kind}`}>{l.text}</li>)}</ul> : <p class="muted">A quiet year: nothing much changed.</p>}
          <p class="small">Savings {fmtAmt(r.money.cur, r.money.start)} → <b>{fmtAmt(r.money.cur, r.money.end)}</b> ({delta >= 0 ? '+' : '−'}{fmtAmt(r.money.cur, Math.abs(delta))}).</p>
        </section>
        {r.world.length > 0 && (
          <section>
            <h4>The world this year</h4>
            <ul class="small">{r.world.map((t) => <li>{t}</li>)}</ul>
          </section>
        )}
        <footer class="row">
          <Btn kind="primary" onClick={() => { close(); store.go('life'); }}>Open my life</Btn>
          <Btn onClick={close}>Continue</Btn>
        </footer>
      </div>
    </div>
  );
}

/** What happened during a long advance (a week or more), shown once when it ends. */
export function PeriodModal({ w }: { w: World }) {
  useStore();
  const r = w.life.period;
  const show = !!r && !r.seen && !store.advRunning && !pendingReview(w);
  useEffect(() => { if (show) sound(w, 'chime'); }, [show]);
  if (!r || !show) return null;
  const close = () => { r.seen = true; store.emit(); };
  return (
    <div class="modal-back cinema" onClick={close}>
      <div class="modal review cinema" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="What happened">
        <p class="kicker">Time passes</p>
        <h2>⏩ {fmtDate(r.from, 'medium')} – {fmtDate(r.to, 'medium')}</h2>
        <p class="muted small">You advanced to {r.label}. The world was simulated in full.</p>
        <h4>Your life</h4>
        <ul>{r.you.map((x) => <li>{x}</li>)}</ul>
        <h4>The world</h4>
        <ul class="small">{r.world.map((x) => <li>{x}</li>)}</ul>
        <div class="row"><Btn kind="primary" onClick={close}>Continue</Btn></div>
      </div>
    </div>
  );
}

/** The torch passes: shown once when the player's character dies and their heir carries on. */
export function SuccessionModal({ w }: { w: World }) {
  useStore();
  const r = w.life.succession;
  const show = !!r && !r.seen && !store.advRunning;
  useEffect(() => { if (show) sound(w, 'toll'); }, [show]);
  if (!r || !show) return null;
  const close = () => { r.seen = true; store.emit(); };
  return (
    <div class="modal-back cinema" onClick={close}>
      <div class="modal review cinema" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Succession">
        <p class="kicker">{fmtDate(r.t, 'long')}</p>
        <div class="portrait-line">🕯️</div>
        <h2>{r.from}</h2>
        <p style={{ textAlign: 'center' }} class="muted">died aged {r.age}, {r.cause}.</p>
        <ul>
          <li>The estate was settled: the will followed, taxes paid, trusts set up for the children.</li>
          {r.heirlooms > 0 && <li>{r.heirlooms} heirloom{r.heirlooms > 1 ? 's' : ''} passed down the family.</li>}
          <li>The life was written into the family history (Life → Legacy).</li>
          <li><b>You carry on as {r.to}, {r.toAge}.</b></li>
        </ul>
        <div class="row"><Btn kind="primary" onClick={close}>Carry on</Btn></div>
      </div>
    </div>
  );
}
