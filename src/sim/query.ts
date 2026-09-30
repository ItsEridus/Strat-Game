// Read-only helpers shared by simulation, AI and UI.
import type { AccountRef, Citizen, Company, Id, Nation, Region, World } from './types';
import { B } from '../data/balance';
import { dayOf } from '../engine/clock';

export const player = (w: World) => w.citizens[w.playerId];
export const cref = (id: Id): AccountRef => ({ k: 'cit', id });
export const coref = (id: Id): AccountRef => ({ k: 'co', id });
export const natref = (id: Id): AccountRef => ({ k: 'nat', id });
export const hhref = (id: Id): AccountRef => ({ k: 'hh', id });
export const today = (w: World) => dayOf(w.time);

/** Nation currently administering a region (occupier if occupied, else owner). */
export const controller = (r: Region) => (r.occ ? r.occ.nation : r.owner);
export const regionOf = (w: World, id: Id) => w.regions[id];
export const nationOfRegion = (w: World, rid: Id) => w.nations[controller(w.regions[rid])];
export const locNation = (w: World, c: Citizen) => controller(w.regions[c.loc]);
export const regionsOf = (w: World, nid: Id) => w.regions.filter((r) => r.owner === nid);
export const controlledBy = (w: World, nid: Id) => w.regions.filter((r) => controller(r) === nid);
export const citizensOf = (w: World, nid: Id) => Object.values(w.citizens).filter((c) => c.nation === nid);
export const companyCurrency = (w: World, co: Company) => w.nations[controller(w.regions[co.region])].cur;
export const marketCur = (w: World, market: Id) => w.nations[market].cur;
export const alive = (n: Nation) => !n.exile;

export function maxEnergy(w: World, c: Citizen): number {
  const hosp = w.regions[c.loc]?.bld.hospital ?? 0;
  return B.energy.baseMax + c.attrs.end * B.attrs.end + hosp * B.energy.hospitalPerLevel;
}

/** Effective economic skill including the Economic Aptitude attribute and studies. */
export function effEco(w: World, c: Citizen): number {
  let e = c.eco + c.attrs.eco * B.attrs.eco;
  if (studyActive(w, c, 'crafty')) e *= 1.1;
  return e;
}

export function studyActive(w: World, c: Citizen, id: string): boolean {
  const s = c.studies[id];
  return !!s && (s.progress >= B.studies.unlockAt || (s.activeUntil ?? 0) > w.time);
}

export const xpToNext = (level: number) => B.levels.base + B.levels.perLevel * (level - 1);

export function buffValue(w: World, c: Citizen, type: string): number {
  let v = 0;
  for (const b of c.buffs) if (b.type === type && b.until > w.time) v = Math.max(v, b.value);
  return v;
}

export function relationOf(c: Citizen, other: Id) {
  return c.rel[other] ?? 0;
}

/** Combined ideology effect for a nation weighted by congress seats. */
export function seatShare(w: World, n: Nation): Record<string, number> {
  const shares: Record<string, number> = {};
  let total = 0;
  for (const [pid, seats] of Object.entries(n.seats)) {
    const p = w.parties[Number(pid)];
    if (!p) continue;
    shares[p.ideo] = (shares[p.ideo] ?? 0) + seats;
    total += seats;
  }
  if (total > 0) for (const k of Object.keys(shares)) shares[k] /= total;
  return shares;
}

export const isOfficial = (n: Nation, cid: Id) => n.president === cid || Object.values(n.cabinet).includes(cid);
