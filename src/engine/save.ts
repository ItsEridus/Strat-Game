// Versioned saves: the full World (including clock, RNG state, queue, pending
// votes, escrows) serialised to JSON. Slots live in IndexedDB, gzip-compressed
// (a world of ~12,000 citizens is tens of MB of JSON, far beyond localStorage);
// a small description of each slot is kept in localStorage so menus can list
// saves instantly. Saves made by older versions in localStorage still load.
// Saves can also be exported and imported as files.
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
  if (from < 5) throw new Error('This save predates the armed forces overhaul and cannot be loaded. Start a new campaign.');
  if (from < 6) {
    // 6: citizens have a home region; the population setting is per region.
    for (const c of Object.values(w.citizens)) if (c.home == null) c.home = c.loc;
    const s = w.settings as World['settings'] & { citizensPerNation?: number };
    if (s.citizensPerRegion == null) s.citizensPerRegion = 1;
    delete s.citizensPerNation;
    if (s.pauseOn.encounter == null) s.pauseOn.encounter = true;
    if (s.notifyFilter.encounter == null) s.notifyFilter.encounter = true;
  }
  w.version = SAVE_VERSION;
  return w;
}

export interface SlotInfo { slot: string; t: number; day: number; name: string; size: number; savedAt: number }

function storage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

// ---------- IndexedDB ----------

const DB = 'meridian-reach';
const STORE = 'saves';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error ?? new Error('Could not open the save database.')); };
  }));
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise<T>((res, rej) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(req.result as T);
    tx.onerror = () => rej(tx.error ?? new Error('Save database error.'));
    tx.onabort = () => rej(tx.error ?? new Error('Save aborted (disk full?).'));
  });
}

async function pack(text: string): Promise<Blob | string> {
  if (typeof CompressionStream === 'undefined') return text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}
async function unpack(data: Blob | string): Promise<string> {
  if (typeof data === 'string') return data;
  const stream = data.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ---------- slots ----------

let busy: Promise<unknown> = Promise.resolve();

/** Save to a slot. Serialisation happens now; compression and writing continue in the background. */
export function saveToSlot(w: World, slot: string): Promise<{ ok: boolean; msg: string }> {
  const json = serialize(w);
  const meta: SlotInfo = { slot, t: w.time, day: Math.floor(w.time / 1440), name: w.citizens[w.playerId]?.name ?? '?', size: 0, savedAt: Date.now() };
  const job = busy.then(async () => {
    try {
      const data = await pack(json);
      meta.size = typeof data === 'string' ? data.length : data.size;
      await idb('readwrite', (s) => s.put(data, slot));
      const ls = storage();
      ls?.setItem(PREFIX + slot + ':meta', JSON.stringify(meta));
      ls?.removeItem(PREFIX + slot); // drop an older localStorage copy of this slot
      return { ok: true, msg: `Saved to ${slot} (${(meta.size / 1e6).toFixed(1)} MB).` };
    } catch (e) {
      return { ok: false, msg: `Save failed: ${(e as Error).message} Use Export instead.` };
    }
  });
  busy = job;
  return job;
}

/** Resolves once every pending save has been written. */
export const savesSettled = () => busy;

export async function loadFromSlot(slot: string): Promise<World | null> {
  let data: Blob | string | undefined;
  try { data = await idb<Blob | string | undefined>('readonly', (s) => s.get(slot)); } catch { data = undefined; }
  if (data != null) return deserialize(await unpack(data));
  // Saves from earlier versions: LZ-compressed in localStorage.
  const packed = storage()?.getItem(PREFIX + slot);
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
  idb('readwrite', (st) => st.delete(slot)).catch(() => {});
}

export function latestSlot(): string | null {
  let best: SlotInfo | null = null;
  for (const s of SLOTS) { const i = slotInfo(s); if (i && (!best || i.savedAt > best.savedAt)) best = i; }
  return best?.slot ?? null;
}
