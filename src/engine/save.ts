// Versioned saves: the full World (including clock, RNG state, queue, pending
// votes, escrows) serialised to JSON. Slots live in IndexedDB, gzip-compressed
// (a world of ~12,000 citizens is tens of MB of JSON, far beyond localStorage);
// a small description of each slot is kept in localStorage so menus can list
// saves instantly. Saves made by older versions in localStorage still load.
// Saves can also be exported and imported as files.
import { priceLevel } from '../data/economy';
import { civilianControl } from '../sim/forces';
import { newLifeState, normalizeLife } from '../sim/lifecycle';
import { initFamilies, initPlayerFamily } from '../sim/family';
import { initPopulation } from '../sim/population';
import { autoAllocate, placeNewDeposits } from '../sim/worldgen';
import { hash01 } from './rng';
import { ageOf, bornYearsAgo } from '../sim/growth';
import { B } from '../data/balance';
import LZ from 'lz-string';
import type { World } from '../sim/types';
import { applyBalance } from '../data/balance';
import { SAVE_VERSION } from '../sim/worldgen';
import { initEducation } from '../sim/education';
import { initServices } from '../sim/services';
import { initHousing } from '../sim/housing';
import { newNarrative } from '../sim/story';

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
  if (from < 7) {
    // 7: the story engine replaces one-off encounters; nothing else changes (no new money or people).
    w.story = newNarrative();
    const ps = w.player as World['player'] & { encounter?: unknown; nextEncounter?: unknown; encounterLog?: { t: number; title: string; outcome: string }[] };
    for (const e of ps.encounterLog ?? []) w.story.journal.push({ id: -1, t: e.t, title: e.title, text: e.outcome, kind: 'outcome' });
    delete ps.encounter; delete ps.nextEncounter; delete ps.encounterLog;
  }
  if (from < 8) {
    // 8: no levels. Unspent attribute points become skills; everyone gets a plausible age.
    for (const c of Object.values(w.citizens)) {
      const o = c as typeof c & { level?: number; xp?: number; attrPts?: number };
      if (o.attrPts) autoAllocate(c, o.attrPts);
      const age = ageOf(w, c);
      if (c.player) { if (age < B.life.adultAge) c.born = bornYearsAgo(w, B.life.playerAge, c.id % 300); }
      else if (age < B.life.adultAge) c.born = bornYearsAgo(w, B.life.adultAge + Math.min(40, Math.round((o.level ?? 1) * 1.5) + (c.id % 7)), (c.id * 37) % 360);
      delete o.level; delete o.xp; delete o.attrPts;
    }
    for (const t of Object.values(w.tournaments)) { const o = t as typeof t & { minLevel?: number }; if (t.minPower == null) t.minPower = B.tournaments.power; delete o.minLevel; }
    initFamilies(w);
    initPlayerFamily(w);
    initPopulation(w);
    w.life = newLifeState();
    civilianControl(w); // office holders pass to the reserve (civilian control)
    w.player.routine = { work: false, train: w.settings.autoTrain, family: false, rest: false, hobby: null, school: false };
    if (w.settings.pauseOn.life == null) w.settings.pauseOn.life = true;
    if (w.settings.notifyFilter.life == null) w.settings.notifyFilter.life = true;
    for (const q of [...w.player.dailies]) { const r = q.reward as typeof q.reward & { xp?: number }; if (r.xp) { r.rep = Math.max(1, Math.round(r.xp / 5)); delete r.xp; } }
  }
  if (from < 9) {
    // 9: timber, cotton and copper (1.3.3). Deposits from a stable hash, so upgrading rolls no dice;
    // entrepreneurs found the first companies in the new industries over the following days.
    placeNewDeposits(w.regions, (r, salt) => hash01(r.id, salt, 1303));
  }
  if (from < 10) {
    // 10: education (1.3.10). Qualifications from a stable hash by country and age; funding at national defaults.
    initEducation(w);
  }
  if (from < 11) {
    // 11: public services (1.3.11): posts filled from qualified local people who are out of work.
    initServices(w);
  }
  if (from < 12) {
    // 12: housing (1.3.13): tenants, owners and grown children at home, by country ownership rates (stable hash).
    initHousing(w);
  }
  if (from < 13) {
    // 13: real money (1.4.4). Amounts keep their real value; each treasury's reference rate for gold
    // moves to its country's real price level (so gold buys more where prices are lower), with resting
    // orders repriced to match. Escrowed money and gold are untouched.
    for (const n of w.nations) {
      const k = 1 / priceLevel(n.cur);
      if (k === 1 || !n.fxAnchor) continue;
      n.fxAnchor = Math.round(n.fxAnchor * k);
      for (const o of Object.values(w.fx ?? {})) if (o.cur === n.cur) o.rate = Math.round(o.rate * k);
      for (const t of w.fxTrades[n.cur] ?? []) t.rate = Math.round(t.rate * k);
    }
  }
  normalizeLife(w);
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
