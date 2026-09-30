// UI-side game controller: owns the World, runs the real-time loop at the chosen
// speed, applies player actions, autosaves, and notifies Preact to re-render.
import { useEffect, useState } from 'preact/hooks';
import type { World } from '../sim/types';
import type { Result } from '../engine/result';
import { advance, advanceTo } from '../sim/tick';
import { generateWorld } from '../sim/worldgen';
import { registerSystems } from '../sim/systems';
import { deserialize, latestSlot, loadFromSlot, saveToSlot, serialize } from '../engine/save';
import { DAY } from '../engine/clock';
import { checkProgress } from '../sim/quests';

registerSystems();

/** Simulated minutes per real second at each speed. */
export const SPEEDS = [0, 10, 60, 360, 1440];
export const SPEED_LABELS = ['Paused', '1× (10 min/s)', '2× (1 h/s)', '3× (6 h/s)', '4× (1 day/s)'];

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
  private lastAutosaveDay = -1;
  private toastId = 1;
  pauseReason = '';

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version++; for (const l of this.listeners) l(); }

  get paused() { return !this.w || this.w.settings.paused || this.w.settings.speed === 0; }

  newGame(seed: number, name: string, nation: number, citizensPerNation: number, difficulty: World['settings']['difficulty'], advanced: World['settings']['advanced']) {
    this.w = generateWorld(seed, name, nation, { citizensPerNation, difficulty, advanced });
    this.tab = 'dashboard';
    this.save('autosave');
    this.emit();
  }

  loadSlot(slot: string) {
    const w = loadFromSlot(slot);
    if (!w) return this.toast('That slot is empty.', false);
    w.settings.paused = true; // closing the game pauses; resume manually
    this.w = w;
    this.tab = 'dashboard';
    this.toast(`Loaded ${slot}.`, true);
    this.emit();
  }

  tryResume() {
    const slot = latestSlot();
    if (!slot) return false;
    try { this.loadSlot(slot); return true; } catch { return false; }
  }

  importText(text: string) {
    const w = deserialize(text);
    w.settings.paused = true;
    this.w = w;
    this.save('autosave');
    this.toast('Save imported.', true);
    this.emit();
  }

  exportText() { return this.w ? serialize(this.w) : ''; }

  save(slot: string) {
    if (!this.w) return;
    const r = saveToSlot(this.w, slot);
    if (slot !== 'autosave' || !r.ok) this.toast(r.msg, r.ok);
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
  jump(minutes: number) {
    if (!this.w) return;
    const r = advance(this.w, minutes, true);
    this.afterAdvance(r.stopped);
  }
  jumpTo(t: number) {
    if (!this.w) return;
    const r = advanceTo(this.w, t, true);
    this.afterAdvance(r.stopped);
  }

  private afterAdvance(stopped: boolean) {
    const w = this.w!;
    if (stopped) {
      w.settings.paused = true;
      this.pauseReason = w.notices[0]?.text ?? 'Important event';
      this.toast(`⏸ Paused: ${this.pauseReason}`, true);
    }
    const day = Math.floor(w.time / DAY);
    if (day !== this.lastAutosaveDay) { this.lastAutosaveDay = day; this.save('autosave'); }
    this.emit();
  }

  /** Real-time loop tick (called every 100 ms). */
  loop(dtMs: number) {
    const w = this.w;
    if (!w || this.paused) return;
    this.acc += (SPEEDS[w.settings.speed] * dtMs) / 1000;
    const whole = Math.floor(this.acc / 10) * 10;
    if (whole <= 0) return;
    this.acc -= whole;
    const r = advance(w, whole, true);
    if (r.stopped) { this.acc = 0; this.afterAdvance(true); return; }
    const day = Math.floor(w.time / DAY);
    if (day !== this.lastAutosaveDay) { this.lastAutosaveDay = day; this.save('autosave'); }
    const now = Date.now();
    if (now - this.lastRender > 150) { this.lastRender = now; this.emit(); }
  }
}

export const store = new Store();

let last = Date.now();
if (typeof window !== 'undefined') {
  setInterval(() => { const now = Date.now(); store.loop(now - last); last = now; }, 100);
  window.addEventListener('beforeunload', () => store.save('autosave'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && store.w) { store.w.settings.paused = true; store.save('autosave'); store.emit(); }
  });
}

/** Preact hook: re-render when the store changes. */
export function useStore() {
  const [, set] = useState(0);
  useEffect(() => store.subscribe(() => set((x) => x + 1)), []);
  return store;
}
