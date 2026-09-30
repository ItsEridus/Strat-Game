// UI-side game controller: owns the World, runs the real-time loop at the chosen
// speed, applies player actions, autosaves, and notifies Preact to re-render.
import { useEffect, useState } from 'preact/hooks';
import type { World } from '../sim/types';
import type { Result } from '../engine/result';
import { advance } from '../sim/tick';
import { generateWorld } from '../sim/worldgen';
import { registerSystems } from '../sim/systems';
import { deserialize, latestSlot, loadFromSlot, saveToSlot, savesSettled, serialize } from '../engine/save';
import { invalidateCensus } from '../sim/census';
import { checkProgress } from '../sim/quests';

/**
 * Fate is not written in advance. The simulation itself is deterministic (the
 * same dice give the same results, which keeps it testable), but the game mixes
 * real randomness into the world's dice as time passes and whenever a save is
 * loaded, so no two playthroughs, and no two reloads, unfold the same way.
 * Campaigns started from a chosen seed ("reproducible world") skip this.
 */
function entropy(): number {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Math.floor(Math.random() * 2 ** 32); }
}
function stir(w: World) {
  if (!w.settings.fixedFate) w.rng = (w.rng ^ entropy()) | 0;
}

registerSystems();

/** Simulated minutes per real second at each speed. */
// World minutes per real second at each speed: at 1× a day lasts 24 real minutes.
export const SPEEDS = [0, 1, 5, 30, 180];
export const SPEED_LABELS = ['Paused', '1× — a minute each second', '2× — 5 minutes a second', '3× — half an hour a second', '4× — 3 hours a second'];

type Toast = { id: number; text: string; ok: boolean };

class Store {
  w: World | null = null;
  version = 0;
  tab = 'dashboard';
  sel: Record<string, any> = {};
  toasts: Toast[] = [];
  private listeners = new Set<() => void>();
  private acc = 0;
  private lastRender = 0;
  private lastAutosave = 0; // real time of the last autosave
  saving = false;
  private toastId = 1;
  pauseReason = '';

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version++; for (const l of this.listeners) l(); }

  get paused() { return !this.w || this.w.settings.paused || this.w.settings.speed === 0; }

  newGame(seed: number | null, name: string, nation: number, citizensPerRegion: number, difficulty: World['settings']['difficulty'], advanced: World['settings']['advanced'], lifeYearDays = 365) {
    this.w = generateWorld(seed ?? entropy() % 1e9, name, nation, { citizensPerRegion, difficulty, advanced, fixedFate: seed != null, lifeYearDays });
    this.tab = 'dashboard';
    this.save('autosave');
    this.emit();
  }

  loading = false;
  async loadSlot(slot: string) {
    this.loading = true;
    this.emit();
    try {
      const w = await loadFromSlot(slot);
      if (!w) return this.toast('That slot is empty.', false);
      w.settings.paused = true; // closing the game pauses; resume manually
      stir(w); // reloading does not replay the same future
      this.w = w;
      this.tab = 'dashboard';
      this.lastAutosave = Date.now();
      this.toast(`Loaded ${slot}.`, true);
    } catch (e) {
      this.toast(`Could not load ${slot}: ${(e as Error).message}`, false);
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  tryResume() {
    const slot = latestSlot();
    if (!slot) return false;
    void this.loadSlot(slot);
    return true;
  }

  importText(text: string) {
    const w = deserialize(text);
    w.settings.paused = true;
    stir(w);
    this.w = w;
    this.save('autosave');
    this.toast('Save imported.', true);
    this.emit();
  }

  exportText() { return this.w ? serialize(this.w) : ''; }

  save(slot: string): Promise<void> {
    if (!this.w) return Promise.resolve();
    if (slot === 'autosave') this.lastAutosave = Date.now();
    this.saving = true;
    return saveToSlot(this.w, slot).then((r) => {
      this.saving = false;
      if (slot !== 'autosave' || !r.ok) this.toast(r.msg, r.ok);
      this.emit();
    });
  }

  /** Autosave at most every few real minutes while time runs (a large world takes a moment to save). */
  private maybeAutosave() {
    if (Date.now() - this.lastAutosave > AUTOSAVE_MS) void this.save('autosave');
  }

  go(tab: string, sel: Record<string, any> = {}) {
    this.tab = tab;
    this.sel = { ...this.sel, ...sel };
    this.emit();
  }

  toast(text: string, ok: boolean) {
    if (!text) return;
    const t = { id: this.toastId++, text, ok };
    this.toasts = [...this.toasts.slice(-4), t];
    setTimeout(() => { this.toasts = this.toasts.filter((x) => x.id !== t.id); this.emit(); }, ok ? 3500 : 5500);
    this.emit();
  }

  /** Run a player action: show its result, re-check progression, re-render. */
  act(fn: (w: World) => Result | void): Result | void {
    if (!this.w) return;
    const r = fn(this.w);
    invalidateCensus(this.w); // the action may have moved people or changed jobs
    if (r) this.toast(r.msg, r.ok);
    checkProgress(this.w);
    this.emit();
    return r;
  }

  setSpeed(s: number) {
    if (!this.w) return;
    this.w.settings.speed = s;
    this.w.settings.paused = s === 0;
    if (s > 0) this.pauseReason = '';
    this.emit();
  }

  /** Jump the clock (event-based advancement). Stops early on pausing notifications. */
  jump(minutes: number, label = 'later') {
    if (!this.w) return;
    this.startAdvance(this.w.time + minutes, label);
  }
  jumpTo(t: number, label = 'the next event') {
    this.startAdvance(t, label);
  }
  /** Synchronous advance for scripts and tests (blocks until done or a pausing event). */
  advanceSync(minutes: number) {
    if (!this.w) return;
    stir(this.w);
    const r = advance(this.w, minutes, true);
    this.afterAdvance(r.stopped);
  }
  advanceSyncTo(t: number) { if (this.w && t > this.w.time) this.advanceSync(t - this.w.time); }

  // ---------- long advances (to a birthday, a week ahead…) ----------
  // Time moves in short chunks of the same ten-minute steps as normal play,
  // yielding to the window between chunks so it stays responsive. A pausing
  // event stops the run where it is (the target is kept, so it can resume);
  // cancelling stops at the time actually reached.
  /** Minutes of the current ten-minute step already elapsed on the clock (display only). */
  get pendingMinutes() { return this.paused || this.advRunning ? 0 : Math.min(9, Math.floor(this.acc)); }
  private shownMinute = 0;

  advRunning = false;
  advStopped = '';
  private advCancel = false;

  startAdvance(target: number, label: string) {
    const w = this.w;
    if (!w || target <= w.time) return;
    w.settings.paused = true;
    w.life.advance = { target, from: w.time, label };
    this.advStopped = '';
    this.runAdvance();
  }

  resumeAdvance() {
    if (!this.w?.life.advance) return;
    this.advStopped = '';
    this.runAdvance();
  }

  /** Stop running but keep the target (closing the window mid-advance: the save can resume it). */
  cancelAdvanceKeepTarget() {
    if (this.advRunning) this.advCancel = true;
  }

  cancelAdvance() {
    if (this.w) this.w.life.advance = null;
    this.advStopped = '';
    if (this.advRunning) this.advCancel = true;
    this.emit();
  }

  private runAdvance() {
    if (this.advRunning) return;
    this.advRunning = true;
    this.emit();
    const step = () => {
      const w = this.w;
      const a = w?.life.advance;
      if (!w || !a || this.advCancel) { this.advRunning = false; this.advCancel = false; this.emit(); return; }
      const t0 = Date.now();
      let stopped = false;
      while (w.time < a.target && Date.now() - t0 < 60) {
        stir(w);
        const r = advance(w, Math.min(60, a.target - w.time), true);
        if (r.stopped) { stopped = true; break; }
      }
      if (w.time >= a.target) {
        w.life.advance = null;
        this.advRunning = false;
        if (stopped) this.pauseReason = w.notices[0]?.text ?? '';
        this.maybeAutosave();
        this.emit();
        return;
      }
      if (stopped) {
        this.advRunning = false;
        this.advStopped = w.notices[0]?.text ?? 'An important event';
        this.pauseReason = this.advStopped;
        this.maybeAutosave();
        this.emit();
        return;
      }
      this.emit();
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }

  private afterAdvance(stopped: boolean) {
    const w = this.w!;
    if (stopped) {
      w.settings.paused = true;
      this.pauseReason = w.notices[0]?.text ?? 'Important event';
      this.toast(`⏸ Paused: ${this.pauseReason}`, true);
    }
    this.maybeAutosave();
    this.emit();
  }

  /** Real-time loop tick (called every 100 ms). */
  loop(dtMs: number) {
    const w = this.w;
    if (!w || this.paused || this.advRunning) return;
    this.acc += (SPEEDS[w.settings.speed] * dtMs) / 1000;
    const whole = Math.floor(this.acc / 10) * 10;
    if (whole <= 0) {
      // The world moves in ten-minute steps; the clock shows the minutes in between.
      if (Math.floor(this.acc) !== this.shownMinute) { this.shownMinute = Math.floor(this.acc); this.emit(); }
      return;
    }
    this.acc -= whole;
    stir(w);
    const r = advance(w, whole, true);
    if (r.stopped) { this.acc = 0; this.afterAdvance(true); return; }
    this.maybeAutosave();
    const now = Date.now();
    if (now - this.lastRender > 150) { this.lastRender = now; this.emit(); }
  }
}

const AUTOSAVE_MS = 3 * 60 * 1000;

export const store = new Store();

let last = Date.now();
if (typeof window !== 'undefined') {
  setInterval(() => { const now = Date.now(); store.loop(now - last); last = now; }, 100);
  window.addEventListener('beforeunload', () => { void store.save('autosave'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && store.w) { store.w.settings.paused = true; void store.save('autosave'); store.emit(); }
  });
  // The desktop window calls this on close and waits for the save to finish.
  (window as any).__meridianSave = async () => { if (store.w) { store.w.settings.paused = true; if (store.advRunning) store.cancelAdvanceKeepTarget(); await store.save('autosave'); } await savesSettled(); };
}

/** Preact hook: re-render when the store changes. */
export function useStore() {
  const [, set] = useState(0);
  useEffect(() => store.subscribe(() => set((x) => x + 1)), []);
  return store;
}
