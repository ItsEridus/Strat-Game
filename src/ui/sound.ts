// Optional interface sound, synthesised with the Web Audio API (no audio files,
// works offline and from file://). Off by default (Settings → Sound).
import type { World } from '../sim/types';

type Cue = 'click' | 'chime' | 'fanfare' | 'toll' | 'coin';
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try { return (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()); } catch { return null; }
}
/** A short tone: frequency (Hz), start offset and length (s), volume, wave. */
function tone(a: AudioContext, f: number, at: number, len: number, vol: number, type: OscillatorType = 'sine') {
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, a.currentTime + at);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + at + len);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at); o.stop(a.currentTime + at + len + 0.05);
}
const CUES: Record<Cue, (a: AudioContext, v: number) => void> = {
  click: (a, v) => tone(a, 880, 0, 0.05, 0.05 * v, 'triangle'),
  coin: (a, v) => { tone(a, 988, 0, 0.08, 0.08 * v, 'square'); tone(a, 1319, 0.07, 0.18, 0.06 * v, 'square'); },
  chime: (a, v) => { tone(a, 784, 0, 0.5, 0.12 * v); tone(a, 1175, 0.12, 0.6, 0.09 * v); },
  fanfare: (a, v) => { [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.12, 0.45, 0.1 * v, 'triangle')); },
  toll: (a, v) => { tone(a, 196, 0, 2.2, 0.16 * v); tone(a, 392, 0, 1.4, 0.05 * v); },
};
/** Play a cue if sound is on. */
export function sound(w: World | null | undefined, cue: Cue) {
  if (!w?.settings.uiSound) return;
  const a = audio();
  if (!a) return;
  if (a.state === 'suspended') void a.resume();
  try { CUES[cue](a, w.settings.uiVolume ?? 0.7); } catch { /* sound is optional */ }
}
