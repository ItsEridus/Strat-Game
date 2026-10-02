// Character creation: who you are and how you look, with a live portrait.
// Every choice becomes a real starting condition (sim/worldgen.ts applies it).
import { EARTH } from '../data/earth';
import { IDEOLOGIES, IDEOLOGY_LIST } from '../data/ideologies';
import type { Citizen, Ideology } from '../sim/types';
import { BACKGROUNDS, QUIRKS, TALENTS, type Background, type Nature, type QuirkKey, type TalentKey } from '../sim/nature';
import { FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, EYE_COLORS, SHIRTS, type Look } from '../sim/looks';
import { Face } from './Avatar';
import { Btn, Select } from './common';

export interface CharacterChoice { look: Look; birthplace: number | null; ideology: Ideology | null; background?: Background; nature?: Nature; traits?: Citizen['traits'] }

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
  const nat: Nature = value.nature ?? { talent: 'numbers', weakness: 'hands', quirks: [] };
  const setNature = (patch: Partial<Nature>) => { const n = { ...nat, ...patch }; if (n.weakness === n.talent) n.weakness = (Object.keys(TALENTS) as TalentKey[]).find((k) => k !== n.talent)!; onChange({ ...value, nature: n }); };
  const tr = value.traits ?? { ambition: 0.7, risk: 0.5, loyalty: 0.5, greed: 0.5, activity: 0.8 };
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
        <label>Family background <select value={value.background ?? ''} onChange={(e) => onChange({ ...value, background: ((e.target as HTMLSelectElement).value || undefined) as Background | undefined })}>
          <option value="">As chance would have it (your country's real mix)</option>
          {(Object.keys(BACKGROUNDS) as Background[]).map((k) => <option value={k}>{BACKGROUNDS[k].label}: {BACKGROUNDS[k].desc}</option>)}
        </select></label>
        <div class="row wrap">
          <label>Talent <select value={nat.talent} onChange={(e) => setNature({ talent: (e.target as HTMLSelectElement).value as TalentKey })}>{(Object.keys(TALENTS) as TalentKey[]).map((k) => <option value={k}>{TALENTS[k].icon} {TALENTS[k].label}</option>)}</select></label>
          <label>Weakness <select value={nat.weakness} onChange={(e) => setNature({ weakness: (e.target as HTMLSelectElement).value as TalentKey })}>{(Object.keys(TALENTS) as TalentKey[]).filter((k) => k !== nat.talent).map((k) => <option value={k}>{TALENTS[k].label}</option>)}</select></label>
        </div>
        <small class="muted">{TALENTS[nat.talent].desc}; {TALENTS[nat.weakness].skills.join(' and ')} grow a quarter slower.</small>
        <div class="row wrap"><span class="muted small">Quirks (up to two):</span>
          {(Object.keys(QUIRKS) as QuirkKey[]).map((q) => <label class="check" title={QUIRKS[q].desc}><input type="checkbox" checked={nat.quirks.includes(q)} onChange={() => setNature({ quirks: nat.quirks.includes(q) ? nat.quirks.filter((x) => x !== q) : [...nat.quirks, q].slice(-2) })} /> {QUIRKS[q].icon} {QUIRKS[q].label}</label>)}
        </div>
        <details class="small"><summary>Personality</summary>
          {(['ambition', 'risk', 'loyalty', 'greed', 'activity'] as const).map((k) => (
            <label class="row">{({ ambition: 'Ambition', risk: 'Appetite for risk', loyalty: 'Loyalty', greed: 'Love of money', activity: 'Energy' })[k]} <input type="range" min="0" max="100" value={Math.round(tr[k] * 100)} onInput={(e) => onChange({ ...value, traits: { ...tr, [k]: +(e.target as HTMLInputElement).value / 100 } })} /> {Math.round(tr[k] * 100)}</label>
          ))}
          <small class="muted">Ambition speeds promotions; other traits shape how people around you read you.</small>
        </details>
        <label>Politics <select value={value.ideology ?? ''} onChange={(e) => onChange({ ...value, ideology: ((e.target as HTMLSelectElement).value || null) as Ideology | null })}>
          <option value="">Undecided (centrist leanings)</option>
          {IDEOLOGY_LIST.map((k) => <option value={k}>{IDEOLOGIES[k].name}</option>)}
        </select></label>
      </div>
    </div>
  );
}
