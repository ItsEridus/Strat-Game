// Character creation: who you are and how you look, with a live portrait.
// Every choice becomes a real starting condition (sim/worldgen.ts applies it).
import { EARTH } from '../data/earth';
import { IDEOLOGIES, IDEOLOGY_LIST } from '../data/ideologies';
import type { Ideology } from '../sim/types';
import { FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, EYE_COLORS, SHIRTS, type Look } from '../sim/looks';
import { Face } from './Avatar';
import { Btn, Select } from './common';

export interface CharacterChoice { look: Look; birthplace: number | null; ideology: Ideology | null }

/** A random look (for "Randomise" and new characters). */
export function randomLook(sex?: 'f' | 'm'): Look {
  const r = (n: number) => Math.floor(Math.random() * n);
  const s = sex ?? (Math.random() < 0.5 ? 'f' : 'm');
  const styles = s === 'f' ? [1, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 5, 8, 9];
  return { sex: s, pronouns: s === 'f' ? 'she' : 'he', skin: r(8), face: r(3), hair: styles[r(styles.length)], hairColor: r(6), eyes: r(5), brows: r(3), nose: r(3), beard: s === 'm' && Math.random() < 0.4 ? 1 + r(3) : 0, glasses: Math.random() < 0.2, freckles: Math.random() < 0.15, mark: null, clothes: r(SHIRTS.length) };
}

function Stepper({ label, value, max, onChange, names, swatch }: { label: string; value: number; max: number; onChange: (v: number) => void; names?: string[]; swatch?: string[] }) {
  return (
    <div class="stepper">
      <span class="stepper-label">{label}</span>
      <button type="button" onClick={() => onChange((value + max - 1) % max)} aria-label={`Previous ${label}`}>‹</button>
      <span class="stepper-value">{swatch ? <i class="swatch" style={{ background: swatch[value] }} /> : null}{names ? names[value] : value + 1}</span>
      <button type="button" onClick={() => onChange((value + 1) % max)} aria-label={`Next ${label}`}>›</button>
    </div>
  );
}

export function CharacterDesigner({ nation, value, onChange }: { nation: number; value: CharacterChoice; onChange: (c: CharacterChoice) => void }) {
  const L = value.look;
  const set = (patch: Partial<Look>) => onChange({ ...value, look: { ...L, ...patch } });
  const regions = EARTH.regions.map((r, i) => ({ r, i })).filter((x) => x.r.nation === nation).sort((a, b) => a.r.name.localeCompare(b.r.name));
  return (
    <div class="designer">
      <div class="designer-portrait">
        <svg viewBox="0 0 100 100" width="168" height="168" role="img" aria-label="Your portrait"><Face look={L} mood={0.4} bg="#26354d" /></svg>
        <Btn small kind="ghost" onClick={() => onChange({ ...value, look: randomLook() })}>🎲 Randomise</Btn>
      </div>
      <div class="designer-controls">
        <div class="row wrap">
          <label class="check"><input type="radio" checked={L.sex === 'f'} onChange={() => set({ sex: 'f', beard: 0, pronouns: L.pronouns === 'they' ? 'they' : 'she' })} /> Woman</label>
          <label class="check"><input type="radio" checked={L.sex === 'm'} onChange={() => set({ sex: 'm', pronouns: L.pronouns === 'they' ? 'they' : 'he' })} /> Man</label>
          <label>Pronouns <Select value={L.pronouns ?? (L.sex === 'f' ? 'she' : 'he')} options={[['she', 'she/her'], ['he', 'he/him'], ['they', 'they/them']]} onChange={(v) => set({ pronouns: v as Look['pronouns'] })} /></label>
        </div>
        <div class="stepper-grid">
          <Stepper label="Skin" value={L.skin} max={SKIN_TONES.length} swatch={SKIN_TONES} names={SKIN_TONES.map((_, i) => `Tone ${i + 1}`)} onChange={(v) => set({ skin: v })} />
          <Stepper label="Face" value={L.face} max={3} names={FACE_SHAPES} onChange={(v) => set({ face: v })} />
          <Stepper label="Hair" value={L.hair} max={HAIR_STYLES.length} names={HAIR_STYLES} onChange={(v) => set({ hair: v })} />
          <Stepper label="Hair colour" value={L.hairColor} max={HAIR_COLORS.length} swatch={HAIR_COLORS} names={['Black', 'Dark brown', 'Brown', 'Light brown', 'Blonde', 'Red', 'Grey', 'White']} onChange={(v) => set({ hairColor: v })} />
          <Stepper label="Eyes" value={L.eyes} max={EYE_COLORS.length} swatch={EYE_COLORS} names={['Dark brown', 'Hazel', 'Blue', 'Green', 'Grey']} onChange={(v) => set({ eyes: v })} />
          <Stepper label="Brows" value={L.brows} max={3} names={['Fine', 'Bold', 'Arched']} onChange={(v) => set({ brows: v })} />
          <Stepper label="Nose" value={L.nose} max={3} names={['Straight', 'Rounded', 'Narrow']} onChange={(v) => set({ nose: v })} />
          {L.sex === 'm' && <Stepper label="Beard" value={L.beard} max={4} names={['None', 'Stubble', 'Moustache', 'Full beard']} onChange={(v) => set({ beard: v })} />}
          <Stepper label="Clothes" value={L.clothes ?? 0} max={SHIRTS.length} swatch={SHIRTS} names={SHIRTS.map((_, i) => `Colour ${i + 1}`)} onChange={(v) => set({ clothes: v })} />
          <Stepper label="Mark" value={['none', 'scar', 'tattoo', 'piercing'].indexOf(L.mark ?? 'none')} max={4} names={['None', 'Scar', 'Tattoo', 'Piercing']} onChange={(v) => set({ mark: v ? (['scar', 'tattoo', 'piercing'] as const)[v - 1] : null })} />
        </div>
        <div class="row wrap">
          <label class="check"><input type="checkbox" checked={L.glasses} onChange={() => set({ glasses: !L.glasses })} /> Glasses</label>
          <label class="check"><input type="checkbox" checked={L.freckles} onChange={() => set({ freckles: !L.freckles })} /> Freckles</label>
        </div>
        <label>Born in <select value={value.birthplace ?? ''} onChange={(e) => onChange({ ...value, birthplace: (e.target as HTMLSelectElement).value === '' ? null : +(e.target as HTMLSelectElement).value })}>
          <option value="">Anywhere in the country (bigger places more likely)</option>
          {regions.map((x) => <option value={x.i}>{x.r.name}</option>)}
        </select></label>
        <label>Politics <select value={value.ideology ?? ''} onChange={(e) => onChange({ ...value, ideology: ((e.target as HTMLSelectElement).value || null) as Ideology | null })}>
          <option value="">Undecided (centrist leanings)</option>
          {IDEOLOGY_LIST.map((k) => <option value={k}>{IDEOLOGIES[k].name}</option>)}
        </select></label>
      </div>
    </div>
  );
}
