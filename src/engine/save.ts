// Versioned saves: the full World (including clock, RNG state, queue, pending
// votes, escrows) serialised to JSON, compressed, stored in localStorage slots,
// and exportable/importable as a file.
import LZ from 'lz-string';
import type { World } from '../sim/types';
import { applyBalance } from '../data/balance';
import { SAVE_VERSION } from '../sim/worldgen';

const PREFIX = 'meridian-save:';
export const SLOTS = ['autosave', 'slot1', 'slot2', 'slot3'] as const;

export function serialize(w: World): string {
  return JSON.stringify({ format: 'meridian-reach', version: SAVE_VERSION, world: w });
}

export function deserialize(text: string): World {
  const data = JSON.parse(text);
  if (!data || data.format !== 'meridian-reach' || !data.world) throw new Error('Not a Meridian Reach save file.');
  const w = migrate(data.world, data.version ?? 0);
  applyBalance(w.settings.balance ?? {});
  return w;
}

/** Upgrade older saves in place. */
function migrate(w: World, from: number): World {
  if (from > SAVE_VERSION) throw new Error(`Save is from a newer version (${from}).`);
  w.version = SAVE_VERSION;
  return w;
}

export interface SlotInfo { slot: string; t: number; day: number; name: string; size: number; savedAt: number }

function storage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function saveToSlot(w: World, slot: string): { ok: boolean; msg: string } {
  const s = storage();
  if (!s) return { ok: false, msg: 'Browser storage is unavailable — use Export instead.' };
  const json = serialize(w);
  const packed = LZ.compressToUTF16(json);
  const meta: SlotInfo = { slot, t: w.time, day: Math.floor(w.time / 1440), name: w.citizens[w.playerId]?.name ?? '?', size: packed.length, savedAt: Date.now() };
  try {
    s.setItem(PREFIX + slot, packed);
    s.setItem(PREFIX + slot + ':meta', JSON.stringify(meta));
    return { ok: true, msg: `Saved to ${slot} (${Math.round(packed.length / 512)} KB).` };
  } catch (e) {
    return { ok: false, msg: `Save failed (storage full?). Use Export. ${(e as Error).message}` };
  }
}

export function loadFromSlot(slot: string): World | null {
  const s = storage();
  const packed = s?.getItem(PREFIX + slot);
  if (!packed) return null;
  const json = LZ.decompressFromUTF16(packed);
  if (!json) throw new Error('Save data is corrupted.');
  return deserialize(json);
}

export function slotInfo(slot: string): SlotInfo | null {
  try { const m = storage()?.getItem(PREFIX + slot + ':meta'); return m ? JSON.parse(m) : null; } catch { return null; }
}

export function deleteSlot(slot: string) {
  const s = storage();
  s?.removeItem(PREFIX + slot);
  s?.removeItem(PREFIX + slot + ':meta');
}

export function latestSlot(): string | null {
  let best: SlotInfo | null = null;
  for (const s of SLOTS) { const i = slotInfo(s); if (i && (!best || i.savedAt > best.savedAt)) best = i; }
  return best?.slot ?? null;
}
