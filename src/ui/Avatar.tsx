// Generated portraits: a face built from the citizen's id (skin, hair, eyes,
// background), with a persona badge. Same person, same face, every time.
import type { Citizen } from '../sim/types';

const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#a86b48', '#8a5335', '#5f3a24'];
const HAIR = ['#1f1a17', '#3b2a1f', '#6b4a2b', '#a5773f', '#d8b36a', '#7d7d7d', '#b5452f'];
const BG = ['#2c3e58', '#3b2f4f', '#2f4a3c', '#4f3a2a', '#453045', '#2a4550', '#4a4a2a'];
export const PERSONA_ICON: Record<string, string> = { worker: '🛠️', merchant: '🧺', politician: '🎙️', soldier: '🪖', industrialist: '🏭', builder: '🧱', journalist: '📰', investor: '💼' };

const h = (n: number, k: number) => ((n * 2654435761) >>> (k * 3)) % 997;

export function Avatar({ c, size = 44, badge = true }: { c: Citizen; size?: number; badge?: boolean }) {
  const id = c.id;
  const skin = SKIN[h(id, 1) % SKIN.length];
  const hair = HAIR[h(id, 2) % HAIR.length];
  const bg = BG[h(id, 3) % BG.length];
  const style = h(id, 4) % 4; // hair style
  const eyeY = 21 + (h(id, 5) % 3);
  const smile = c.mood ?? 0;
  const mouth = smile > 0.2 ? 'M16 30 Q20 34 24 30' : smile < -0.2 ? 'M16 32 Q20 28 24 32' : 'M16 31 L24 31';
  return (
    <span class="avatar" style={{ width: `${size}px`, height: `${size}px` }} title={c.name}>
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <rect width="40" height="40" rx="9" fill={bg} />
        <ellipse cx="20" cy="42" rx="15" ry="10" fill={['#35506b', '#5a3d2b', '#3d5a3a', '#5a5a5a', '#6b3550'][h(id, 6) % 5]} />
        <circle cx="20" cy="22" r="10" fill={skin} />
        {style === 0 && <path d="M10 20 Q10 9 20 9 Q30 9 30 20 Q27 13 20 14 Q13 13 10 20Z" fill={hair} />}
        {style === 1 && <path d="M9 24 Q8 8 20 8 Q32 8 31 24 L29 18 Q24 12 20 13 Q14 13 11 18Z" fill={hair} />}
        {style === 2 && <path d="M11 17 Q13 10 20 10 Q27 10 29 17 Z" fill={hair} />}
        {style === 3 && <path d="M8 30 Q7 8 20 8 Q33 8 32 30 L29 30 L29 19 Q22 13 11 19 L11 30Z" fill={hair} />}
        <circle cx="16.5" cy={eyeY} r="1.2" fill="#1b1b1b" />
        <circle cx="23.5" cy={eyeY} r="1.2" fill="#1b1b1b" />
        <path d={mouth} stroke="#5a2a20" stroke-width="1.3" fill="none" stroke-linecap="round" />
      </svg>
      {badge && <i class="avatar-badge">{c.player ? '⭐' : PERSONA_ICON[c.persona] ?? '🙂'}</i>}
    </span>
  );
}
