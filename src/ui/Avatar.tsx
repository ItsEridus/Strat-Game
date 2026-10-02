// Portraits drawn from each person's look (sim/looks.ts): face shape, skin,
// hair style and colour, eyes, brows, nose, beard, glasses, freckles and marks,
// with age showing (grey hair, lines, thinning) and a mood in the mouth.
// Pure SVG, no image files. Same person, same face, every time.
import type { Citizen, World } from '../sim/types';
import { store } from './store';
import { EYE_COLORS, HAIR_COLORS, SHIRTS, SKIN_TONES, ageing, lookOf, type Look } from '../sim/looks';

const BG = ['#2c3e58', '#3b2f4f', '#2f4a3c', '#4f3a2a', '#453045', '#2a4550', '#4a4a2a'];
export const PERSONA_ICON: Record<string, string> = { worker: '🛠️', merchant: '🧺', politician: '🎙️', soldier: '🪖', industrialist: '🏭', builder: '🧱', journalist: '📰', investor: '💼' };

/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
function mix(a: string, b: string, t: number) {
  const p = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
}
const darker = (c: string, t = 0.25) => mix(c, '#000000', t);

/** The face itself, in a 100×100 box. */
export function Face({ look, grey = 0, lines = 0, bald = false, mood = 0, bg }: { look: Look; grey?: number; lines?: number; bald?: boolean; mood?: number; bg: string }) {
  const skin = SKIN_TONES[Math.max(0, Math.min(7, look.skin))];
  const tw = look.tweak ?? 50;
  const hair = mix(mix(HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0], '#a08060', (Math.floor(tw / 25) % 4) * 0.06), '#dcdcdc', grey);
  const [rx0, ry] = [[17, 21], [19, 19], [15.5, 23]][look.face] ?? [17, 21];
  const rx = rx0 + ((tw % 5) - 2) * 0.6;
  const ex = 7.5 + ((Math.floor(tw / 5) % 5) - 2) * 0.35; // eye spacing
  const cx = 50, cy = 46;
  const top = cy - ry, eyeY = cy - 2;
  const s = look.hair;
  const mouth = mood > 0.2 ? `M${cx - 6} ${cy + 10} Q${cx} ${cy + 15} ${cx + 6} ${cy + 10}` : mood < -0.2 ? `M${cx - 6} ${cy + 13} Q${cx} ${cy + 9} ${cx + 6} ${cy + 13}` : `M${cx - 5.5} ${cy + 11.5} Q${cx} ${cy + 12.5} ${cx + 5.5} ${cy + 11.5}`;
  return (
    <g>
      <rect width="100" height="100" rx="22" fill={bg} />
      {/* back hair */}
      {!bald && s === 3 && <path d={`M${cx - rx - 4} ${cy} Q${cx - rx - 6} ${top - 4} ${cx} ${top - 6} Q${cx + rx + 6} ${top - 4} ${cx + rx + 4} ${cy} L${cx + rx + 3} ${cy + 30} L${cx - rx - 3} ${cy + 30}Z`} fill={hair} />}
      {!bald && s === 8 && <circle cx={cx} cy={cy - 6} r={rx + 9} fill={hair} />}
      {!bald && s === 6 && <path d={`M${cx + rx - 2} ${cy - 8} Q${cx + rx + 12} ${cy + 4} ${cx + rx + 4} ${cy + 26}`} stroke={hair} stroke-width="7" fill="none" stroke-linecap="round" />}
      {!bald && s === 7 && <circle cx={cx} cy={top - 3} r="8" fill={hair} />}
      {/* shoulders and neck */}
      <path d="M14 100 Q16 76 50 74 Q84 76 86 100Z" fill={SHIRTS[look.clothes ?? 0]} />
      <rect x={cx - 6} y={cy + ry - 6} width="12" height="12" fill={darker(skin, 0.12)} />
      {look.mark === 'tattoo' && <path d={`M${cx + 3} ${cy + ry + 2} l3 3 l-3 3`} stroke="#2a4f7a" stroke-width="1.4" fill="none" />}
      {/* ears and head */}
      <ellipse cx={cx - rx} cy={eyeY + 2} rx="3.4" ry="5" fill={darker(skin, 0.06)} />
      <ellipse cx={cx + rx} cy={eyeY + 2} rx="3.4" ry="5" fill={darker(skin, 0.06)} />
      {look.mark === 'piercing' && <circle cx={cx + rx + 0.5} cy={eyeY + 6} r="1.2" fill="#e6c86a" />}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={skin} />
      {/* front hair */}
      {!bald && (s === 0 || s === 5) && <path d={`M${cx - rx - 1} ${cy - 4} Q${cx - rx} ${top - 5} ${cx} ${top - 4} Q${cx + rx} ${top - 5} ${cx + rx + 1} ${cy - 4} Q${cx + 8} ${top + 7} ${cx} ${top + 6} Q${cx - 9} ${top + 7} ${cx - rx - 1} ${cy - 4}Z`} fill={hair} />}
      {!bald && s === 5 && [0, 1, 2, 3, 4].map((i) => <circle cx={cx - rx + 4 + i * (rx * 2 - 8) / 4} cy={top + 1} r="4.5" fill={hair} />)}
      {!bald && s === 1 && <path d={`M${cx - rx - 1} ${cy} Q${cx - rx - 2} ${top - 5} ${cx + 4} ${top - 4} Q${cx + rx + 2} ${top - 2} ${cx + rx + 1} ${cy - 2} Q${cx + rx - 4} ${top + 8} ${cx - 4} ${top + 7} Q${cx - rx + 2} ${top + 10} ${cx - rx - 1} ${cy}Z`} fill={hair} />}
      {!bald && s === 2 && <path d={`M${cx - rx + 1} ${cy - 6} Q${cx} ${top - 4} ${cx + rx - 1} ${cy - 6} Q${cx} ${top + 3} ${cx - rx + 1} ${cy - 6}Z`} fill={hair} opacity="0.85" />}
      {!bald && (s === 3 || s === 4 || s === 6 || s === 7) && <path d={`M${cx - rx - 2} ${s === 4 ? cy + 10 : cy - 2} Q${cx - rx - 3} ${top - 6} ${cx} ${top - 5} Q${cx + rx + 3} ${top - 6} ${cx + rx + 2} ${s === 4 ? cy + 10 : cy - 2} L${cx + rx - 2} ${cy - 6} Q${cx + 2} ${top + 9} ${cx - rx + 2} ${cy - 6}Z`} fill={hair} />}
      {!bald && s === 8 && <path d={`M${cx - rx} ${cy - 6} Q${cx} ${top + 4} ${cx + rx} ${cy - 6}`} stroke={hair} stroke-width="5" fill="none" />}
      {bald && <path d={`M${cx - rx} ${cy - 2} Q${cx - rx - 1} ${cy - 10} ${cx - rx + 3} ${cy - 13} M${cx + rx} ${cy - 2} Q${cx + rx + 1} ${cy - 10} ${cx + rx - 3} ${cy - 13}`} stroke={hair} stroke-width="3" fill="none" />}
      {/* brows, eyes, nose */}
      {[-1, 1].map((d) => <path d={`M${cx + d * 4} ${eyeY - 6 + (look.brows === 2 ? -1 : 0)} Q${cx + d * 7.5} ${eyeY - 8 - look.brows * 0.6} ${cx + d * 11} ${eyeY - 6}`} stroke={darker(hair, 0.2)} stroke-width={look.brows === 1 ? 2.2 : 1.5} fill="none" stroke-linecap="round" />)}
      {[-1, 1].map((d) => <g><ellipse cx={cx + d * ex} cy={eyeY} rx="3.2" ry="2.3" fill="#f8f4ee" /><circle cx={cx + d * ex} cy={eyeY} r="1.6" fill={EYE_COLORS[look.eyes] ?? EYE_COLORS[0]} /><circle cx={cx + d * ex + 0.5} cy={eyeY - 0.5} r="0.45" fill="#fff" /></g>)}
      <path d={[`M${cx} ${eyeY + 2} L${cx - 2.5} ${eyeY + 9} L${cx + 1.5} ${eyeY + 9.5}`, `M${cx} ${eyeY + 2} Q${cx - 4} ${eyeY + 9} ${cx} ${eyeY + 10} Q${cx + 4} ${eyeY + 9} ${cx + 1} ${eyeY + 8}`, `M${cx} ${eyeY + 1} L${cx - 1.6} ${eyeY + 10} L${cx + 2} ${eyeY + 10}`][look.nose] ?? ''} stroke={darker(skin, 0.3)} stroke-width="1.2" fill="none" stroke-linecap="round" />
      {/* age lines, freckles, scar */}
      {lines >= 1 && [-1, 1].map((d) => <path d={`M${cx + d * 12} ${eyeY + 1} l${d * 2} 1.5`} stroke={darker(skin, 0.28)} stroke-width="0.8" />)}
      {lines >= 2 && <path d={`M${cx - 6} ${top + 9} Q${cx} ${top + 8} ${cx + 6} ${top + 9}`} stroke={darker(skin, 0.22)} stroke-width="0.8" fill="none" />}
      {lines >= 2 && [-1, 1].map((d) => <path d={`M${cx + d * 6} ${cy + 7} q${d * 1.5} 3 ${d * 0.5} 6`} stroke={darker(skin, 0.25)} stroke-width="0.8" fill="none" />)}
      {look.freckles && [[-9, 4], [-6, 6], [-11, 7], [9, 4], [6, 6], [11, 7]].map(([x, y]) => <circle cx={cx + x} cy={eyeY + y} r="0.6" fill={darker(skin, 0.35)} />)}
      {look.mark === 'scar' && <path d={`M${cx + 9} ${eyeY - 9} l3 9`} stroke={mix(skin, '#ffffff', 0.45)} stroke-width="1.3" />}
      {/* beard and mouth */}
      {look.beard === 1 && <path d={`M${cx - rx + 3} ${cy + 4} Q${cx} ${cy + ry + 2} ${cx + rx - 3} ${cy + 4}`} stroke={hair} stroke-width="5" fill="none" opacity="0.3" />}
      {look.beard === 3 && <path d={`M${cx - rx + 1} ${cy + 1} Q${cx - rx + 2} ${cy + ry + 6} ${cx} ${cy + ry + 6} Q${cx + rx - 2} ${cy + ry + 6} ${cx + rx - 1} ${cy + 1} Q${cx + 6} ${cy + 16} ${cx} ${cy + 15} Q${cx - 6} ${cy + 16} ${cx - rx + 1} ${cy + 1}Z`} fill={hair} />}
      <path d={mouth} stroke="#6a2c22" stroke-width="1.6" fill="none" stroke-linecap="round" />
      {(look.beard === 2 || look.beard === 3) && <path d={`M${cx - 7} ${cy + 9} Q${cx} ${cy + 6} ${cx + 7} ${cy + 9}`} stroke={hair} stroke-width="2.6" fill="none" stroke-linecap="round" />}
      {/* glasses */}
      {look.glasses && <g stroke="#1d1d1f" stroke-width="1.1" fill="rgba(200,220,255,.12)"><circle cx={cx - 7.5} cy={eyeY} r="4.6" /><circle cx={cx + 7.5} cy={eyeY} r="4.6" /><path d={`M${cx - 2.9} ${eyeY} L${cx + 2.9} ${eyeY} M${cx - 12} ${eyeY - 1} L${cx - rx} ${eyeY - 2} M${cx + 12} ${eyeY - 1} L${cx + rx} ${eyeY - 2}`} fill="none" /></g>}
    </g>
  );
}

/** A citizen's portrait (small in lists, large on profiles). */
export function Avatar({ c, size = 44, badge = true, w = store.w }: { c: Citizen; size?: number; badge?: boolean; w?: World | null }) {
  if (!w) return null;
  const look = lookOf(w, c);
  const a = ageing(w, c);
  const bg = BG[(c.id * 7) % BG.length];
  return (
    <span class="avatar" style={{ width: `${size}px`, height: `${size}px` }} title={c.name}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Portrait of ${c.name}`}>
        <Face look={look} grey={a.grey} lines={a.lines} bald={a.bald} mood={c.mood ?? 0} bg={bg} />
      </svg>
      {badge && <i class="avatar-badge">{c.player ? '⭐' : PERSONA_ICON[c.persona] ?? '🙂'}</i>}
    </span>
  );
}
