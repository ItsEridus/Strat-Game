// Census: derived groupings of citizens (by home region, current region, nation
// and police force) and of companies (by region, nation and open vacancies), so
// systems that look at "the people of Texas" or "jobs near here" do not scan the
// whole world. Never saved. Rebuilt at most once per simulated hour, and
// immediately after the changes that move people between groups
// (invalidateCensus: travel, moving house, citizenship, police service, new
// citizens and companies).
import type { Citizen, Company, Id, World } from './types';
import { NATION_DEFS } from '../data/names';

export interface Census {
  all: Citizen[]; // by id
  byHome: Map<Id, Citizen[]>;
  byLoc: Map<Id, Citizen[]>;
  byNation: Map<Id, Citizen[]>;
  police: Map<Id, Citizen[]>; // officers by the region force they serve
  companies: Company[]; // by id
  coByRegion: Map<Id, Company[]>;
  coByNation: Map<Id, Company[]>; // by the nation controlling the company's region
}

const CACHE = new WeakMap<World, { hour: number; c: Census }>();

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

export function census(w: World): Census {
  const hit = CACHE.get(w);
  const hour = Math.floor(w.time / 60);
  if (hit && hit.hour === hour) return hit.c;
  const c: Census = { all: [], byHome: new Map(), byLoc: new Map(), byNation: new Map(), police: new Map(), companies: [], coByRegion: new Map(), coByNation: new Map() };
  for (const id in w.citizens) {
    const x = w.citizens[id];
    if (x.gone) continue; // died or emigrated: kept only so history can name them
    c.all.push(x);
    push(c.byHome, x.home, x);
    push(c.byLoc, x.loc, x);
    push(c.byNation, x.nation, x);
    if (x.sec.police != null) push(c.police, x.sec.police, x);
  }
  // Integer keys iterate in ascending order, so `all` is already sorted by id.
  for (const id in w.companies) {
    const co = w.companies[id];
    c.companies.push(co);
    push(c.coByRegion, co.region, co);
    const r = w.regions[co.region];
    push(c.coByNation, r.occ ? r.occ.nation : r.owner, co);
  }
  CACHE.set(w, { hour, c });
  return c;
}

/**
 * Drop the census so the next query sees changes made during this tick. Called
 * when citizens or companies are added or move region, and after player actions.
 */
export function invalidateCensus(w: World) {
  CACHE.delete(w);
}

const NONE: never[] = [];
/** Citizens who live in a region. */
export const residents = (w: World, rid: Id): readonly Citizen[] => census(w).byHome.get(rid) ?? NONE;
/** Citizens currently in a region (residents at home and visitors). */
export const presentIn = (w: World, rid: Id): readonly Citizen[] => census(w).byLoc.get(rid) ?? NONE;
/** Citizens of a nation. */
export const nationals = (w: World, nid: Id): readonly Citizen[] => census(w).byNation.get(nid) ?? NONE;
/** Police officers serving a region's force. */
export const officersOf = (w: World, rid: Id): readonly Citizen[] => census(w).police.get(rid) ?? NONE;
/** Companies located in a region. */
export const companiesIn = (w: World, rid: Id): readonly Company[] => census(w).coByRegion.get(rid) ?? NONE;
/** Companies in regions a nation controls. */
export const companiesOf = (w: World, nid: Id): readonly Company[] => census(w).coByNation.get(nid) ?? NONE;

/**
 * Reference size of a nation's society under the old per-nation model (about
 * 18–32 citizens). Nation-wide rates that were balanced for that many people
 * (combat turnout, headline news, inbox traffic) scale by reference / actual.
 */
export const citizenScale = (pop: number) => Math.min(1.35, Math.max(0.75, (pop / 1e8) ** 0.15));
export const referenceSociety = (nation: Id) => 24 * citizenScale(NATION_DEFS[nation].pop);
/** How much one citizen of this nation weighs in nation-wide rates (1 in a society of the reference size). */
export const representation = (w: World, nation: Id) => Math.min(1, referenceSociety(nation) / Math.max(1, nationals(w, nation).length));
