// Quick starts: ready-made lives, a fully random life, and shareable character codes.
import { EARTH } from '../data/earth';
import { IDEOLOGY_LIST } from '../data/ideologies';
import type { Background, QuirkKey, TalentKey } from '../sim/nature';
import type { CharacterChoice } from './CharacterDesigner';
import { randomLook } from './CharacterDesigner';

export interface Preset { title: string; icon: string; name: string; region: string; age: number; background: Background; talent: TalentKey; weakness: TalentKey; quirks: QuirkKey[]; sex?: 'f' | 'm' }
export const PRESETS: Preset[] = [
  { title: 'A factory worker in Detroit', icon: '🏭', name: 'Dana Kowalski', region: 'Michigan', age: 24, background: 'working', talent: 'hands', weakness: 'leader', quirks: ['workaholic'] },
  { title: 'A student in Seoul', icon: '📚', name: 'Ji-woo Park', region: 'Seoul', age: 18, background: 'middle', talent: 'numbers', weakness: 'athlete', quirks: ['bookworm'], sex: 'f' },
  { title: "A farmer's child in Brazil", icon: '🌾', name: 'Tiago Souza', region: 'Mato Grosso', age: 0, background: 'struggling', talent: 'athlete', weakness: 'numbers', quirks: ['sporty'], sex: 'm' },
  { title: 'An heir in London', icon: '🎩', name: 'Charlotte Ashworth', region: 'England', age: 24, background: 'wealthy', talent: 'leader', weakness: 'hands', quirks: ['charming'], sex: 'f' },
  { title: 'A nurse in Mumbai', icon: '🩺', name: 'Priya Deshmukh', region: 'Maharashtra', age: 24, background: 'working', talent: 'sharp', weakness: 'leader', quirks: ['worrier'], sex: 'f' },
  { title: 'An engineer in Munich', icon: '⚙️', name: 'Lukas Huber', region: 'Bavaria', age: 24, background: 'middle', talent: 'hands', weakness: 'leader', quirks: ['frugal'], sex: 'm' },
  { title: 'A rancher in Alberta', icon: '🐄', name: 'Cole MacLeod', region: 'Alberta', age: 24, background: 'comfortable', talent: 'athlete', weakness: 'sharp', quirks: [], sex: 'm' },
  { title: 'A coder in Shenzhen', icon: '💻', name: 'Lin Wei', region: 'Guangdong', age: 18, background: 'middle', talent: 'numbers', weakness: 'athlete', quirks: ['workaholic', 'bookworm'] },
];

export interface QuickStart { name: string; nation: number; startAge: number; character: CharacterChoice }

export function fromPreset(p: Preset): QuickStart {
  const i = EARTH.regions.findIndex((r) => r.name.startsWith(p.region));
  const look = randomLook(p.sex);
  return { name: p.name, nation: EARTH.regions[i].nation, startAge: p.age, character: { look, birthplace: i, ideology: null, background: p.background, nature: { talent: p.talent, weakness: p.weakness, quirks: p.quirks } } };
}

const FIRST = ['Alex', 'Sam', 'Jordan', 'Robin', 'Taylor', 'Morgan', 'Kim', 'Noor', 'Ari', 'Jamie', 'Sasha', 'Rene'];
const LAST = ['Rivera', 'Okafor', 'Novak', 'Tanaka', 'Silva', 'Kaya', 'Mehta', 'Ivanova', 'Clarke', 'Weber', 'Lee', 'Haddad'];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** Everything at random: country, birthplace, age, background, nature and looks. */
export function randomLife(): QuickStart {
  const i = Math.floor(Math.random() * EARTH.regions.length);
  const talents: TalentKey[] = ['numbers', 'leader', 'hands', 'athlete', 'sharp'];
  const talent = pick(talents);
  const quirks: QuirkKey[] = (['charming', 'frugal', 'bookworm', 'sporty', 'worrier', 'workaholic'] as QuirkKey[]).filter(() => Math.random() < 0.15).slice(0, 2);
  return {
    name: `${pick(FIRST)} ${pick(LAST)}`, nation: EARTH.regions[i].nation, startAge: pick([0, 16, 18, 24, 24, 24]),
    character: { look: randomLook(), birthplace: i, ideology: Math.random() < 0.5 ? pick(IDEOLOGY_LIST) : null, background: pick(['struggling', 'working', 'middle', 'middle', 'comfortable', 'wealthy'] as Background[]), nature: { talent, weakness: pick(talents.filter((t) => t !== talent)), quirks } },
  };
}

/** A short, shareable code for a character (base64 of a compact JSON). */
export function characterCode(q: QuickStart): string {
  const json = JSON.stringify({ v: 1, n: q.name, c: q.nation, a: q.startAge, ch: q.character });
  return 'MR1-' + btoa(unescape(encodeURIComponent(json)));
}
export function readCharacterCode(code: string): QuickStart | null {
  try {
    const raw = code.trim();
    if (!raw.startsWith('MR1-')) return null;
    const o = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
    if (o.v !== 1 || typeof o.n !== 'string' || typeof o.c !== 'number' || !o.ch?.look) return null;
    return { name: String(o.n).slice(0, 28), nation: o.c, startAge: [0, 16, 18, 24].includes(o.a) ? o.a : 24, character: o.ch };
  } catch { return null; }
}
