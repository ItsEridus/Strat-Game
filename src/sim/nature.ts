// Nature and nurture: talents, a weakness and quirks (everyone has them, from a
// stable hash; the player designs theirs), and the family background a life
// starts from. Each has a small, documented effect through the normal systems.
import type { Attr, Citizen, World } from './types';
import { hash01 } from '../engine/rng';

export type TalentKey = 'numbers' | 'leader' | 'hands' | 'athlete' | 'sharp';
export type QuirkKey = 'charming' | 'frugal' | 'bookworm' | 'sporty' | 'worrier' | 'workaholic';
export type Background = 'struggling' | 'working' | 'middle' | 'comfortable' | 'wealthy';
export interface Nature { talent: TalentKey; weakness: TalentKey; quirks: QuirkKey[] }

/** Talents speed up learning a group of skills by a third; a weakness slows one by a quarter. */
export const TALENTS: Record<TalentKey, { label: string; icon: string; skills: Attr[]; desc: string }> = {
  numbers: { label: 'A head for numbers', icon: '🧮', skills: ['eco'], desc: 'economic skill grows faster: business, trading, management' },
  leader: { label: 'A natural leader', icon: '📣', skills: ['lead'], desc: 'leadership grows faster: politics, command, teaching' },
  hands: { label: 'Good with hands', icon: '🔨', skills: ['cons'], desc: 'construction grows faster: building, engineering, trades' },
  athlete: { label: 'Athletic', icon: '🏅', skills: ['str', 'end'], desc: 'strength and endurance grow faster: fighting, sport, hard work' },
  sharp: { label: 'Sharp-eyed', icon: '🎯', skills: ['acc'], desc: 'accuracy grows faster: shooting, science, detail work' },
};
export const QUIRKS: Record<QuirkKey, { label: string; icon: string; desc: string }> = {
  charming: { label: 'Charming', icon: '😊', desc: 'people warm to you a quarter faster' },
  frugal: { label: 'Frugal', icon: '🪙', desc: 'everyday essentials cost you 10% less' },
  bookworm: { label: 'Bookworm', icon: '📖', desc: 'study and school go 20% faster' },
  sporty: { label: 'Sporty', icon: '🏃', desc: 'a little healthier all your life' },
  worrier: { label: 'Worrier', icon: '😟', desc: 'more stress, but you rarely miss a payment (lenders like you)' },
  workaholic: { label: 'Workaholic', icon: '💼', desc: 'learn 20% more from work, at the cost of some stress' },
};
export const BACKGROUNDS: Record<Background, { label: string; desc: string; money: number; parents: number; own: number; uni: number; grades: number }> = {
  struggling: { label: 'Struggling', desc: 'parents in insecure work, renting a small place; little to fall back on', money: 0.3, parents: 0.3, own: 0, uni: 0.05, grades: -12 },
  working: { label: 'Working class', desc: 'parents in steady jobs, renting or paying off a modest home', money: 0.7, parents: 0.8, own: 0.4, uni: 0.2, grades: -4 },
  middle: { label: 'Middle class', desc: 'a family home, savings and the expectation of university', money: 1, parents: 1.5, own: 0.8, uni: 0.45, grades: 2 },
  comfortable: { label: 'Comfortable', desc: 'professional parents, a good house, money for a good start', money: 2.2, parents: 3, own: 1, uni: 0.7, grades: 6 },
  wealthy: { label: 'Wealthy', desc: 'old money: a large house, a trust fund and every door open', money: 6, parents: 8, own: 1, uni: 0.85, grades: 10 },
};
/** Share of households in each background, by country (from income distributions; rounded). */
export const BACKGROUND_SHARES: Record<string, number[]> = {
  USA: [15, 30, 33, 17, 5], CAN: [11, 30, 38, 17, 4], MEX: [35, 35, 20, 8, 2], BRA: [35, 35, 20, 8, 2], ARG: [30, 35, 25, 8, 2],
  GBR: [14, 32, 35, 15, 4], DEU: [12, 32, 38, 15, 3], RUS: [22, 38, 28, 10, 2], TUR: [25, 38, 25, 10, 2], SAU: [12, 28, 35, 18, 7],
  ZAF: [45, 28, 17, 8, 2], IND: [45, 33, 16, 5, 1], CHN: [25, 35, 28, 10, 2], JPN: [12, 32, 40, 13, 3], KOR: [13, 32, 38, 14, 3], AUS: [11, 30, 38, 17, 4],
};

const TALENT_KEYS = Object.keys(TALENTS) as TalentKey[];
const QUIRK_KEYS = Object.keys(QUIRKS) as QuirkKey[];

/** Someone's nature: designed (the player) or stable from a hash (everyone else). */
export function natureOf(c: Citizen): Nature {
  if (c.nature) return c.nature;
  const r = (k: number) => hash01(c.id, 1420, k);
  const talent = TALENT_KEYS[Math.floor(r(1) * TALENT_KEYS.length)];
  const others = TALENT_KEYS.filter((k) => k !== talent);
  const quirks = QUIRK_KEYS.filter((_, i) => r(10 + i) < 0.12).slice(0, 2);
  return { talent, weakness: others[Math.floor(r(2) * others.length)], quirks };
}
export const hasQuirk = (c: Citizen, q: QuirkKey) => natureOf(c).quirks.includes(q);

/** How fast a skill grows for this person (talent ×1.33, weakness ×0.75, workaholic at work). */
export function learnFactor(c: Citizen, a: Attr): number {
  const n = natureOf(c);
  let f = 1;
  if (TALENTS[n.talent].skills.includes(a)) f *= 1.33;
  if (TALENTS[n.weakness].skills.includes(a)) f *= 0.75;
  return f;
}

/** The background a person grew up in: chosen (the player), or by the country's distribution (stable). */
export function backgroundOf(w: World, c: Citizen): Background {
  if (c.background) return c.background;
  const shares = BACKGROUND_SHARES[w.nations[c.nation]?.iso] ?? BACKGROUND_SHARES.USA;
  let x = hash01(c.id, 1421, 1) * shares.reduce((a, b) => a + b, 0);
  const keys = Object.keys(BACKGROUNDS) as Background[];
  for (let i = 0; i < keys.length; i++) { x -= shares[i]; if (x <= 0) return keys[i]; }
  return 'middle';
}
