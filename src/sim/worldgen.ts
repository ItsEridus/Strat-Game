// Deterministic world generation from a seed.
import type { Citizen, Company, Id, Ideology, Industry, Nation, Persona, RawRes, Region, Settings, World } from './types';
import { B, applyBalance } from '../data/balance';
import { NAME_POOLS, NATION_DEFS } from '../data/names';
import { EARTH } from '../data/earth';
import { IDEOLOGY_LIST } from '../data/ideologies';
import { RAWS, outputKey, refValue } from '../data/items';
import { chance, next, pick, rand, randInt, shuffle, weighted } from '../engine/rng';
import { GOLD, c as cur, g } from '../engine/money';
import { mint, produce } from '../engine/ledger';
import { DAY, HOUR } from '../engine/clock';
import { NOTICE_CATS, record } from '../engine/events';
import { cref, coref, hhref, natref } from './query';
import { createCompany } from './company';
import { list } from './market';
import { placeOrder } from './fx';
import { seedPolitics } from './politics';
import { initPlayerProgress } from './quests';
import { seedLate } from './seedLate';
import { initGovs } from './stategov';
import { initCrime } from './crime';
import { initForces, seedOfficers } from './forces';
import { AGENCY_NAMES } from '../data/names';

export const SAVE_VERSION = 6; // 5: armed forces; 6: per-region population, home regions

export function defaultSettings(): Settings {
  const pauseOn: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(NOTICE_CATS)) pauseOn[k] = v.pauseDefault;
  const notifyFilter: Record<string, boolean> = {};
  for (const k of Object.keys(NOTICE_CATS)) notifyFilter[k] = true;
  return {
    speed: 1, paused: true, monthLen: 30, difficulty: 'normal', pauseOn, autoTrain: false,
    advanced: { nuclear: true, pirates: true, terrainEvents: false, tournaments: true },
    citizensPerRegion: 24, balance: {}, notifyFilter,
  };
}

/**
 * Regions are the real subdivisions on the Earth map. Procedural per seed:
 * deposit richness, extra deposits (weighted by terrain) and the background
 * population, which follows each region's real urban population (compressed so
 * no nation's economy is swamped by demand).
 */
function genRegions(w: World): Region[] {
  const regions = EARTH.regions.map((e, i): Region => {
    const res: Region['res'] = {};
    for (const k of e.res) res[k] = randInt(w, 2, 3); // notable real deposits and farm belts
    const byTerrain = (x: RawRes) => ({ grain: e.terrain === 'plains' ? 5 : e.terrain === 'forest' ? 1.5 : 0.8, iron: e.terrain === 'mountains' ? 4 : 1.2, titanium: e.terrain === 'mountains' ? 2 : 0.6, oil: e.terrain === 'desert' ? 4 : 0.8 }[x]);
    for (const p of [0.5, 0.12]) {
      if (!chance(w, p)) continue;
      const extra = weighted(w, RAWS.filter((k) => !res[k]), byTerrain);
      if (extra) res[extra] = randInt(w, 1, 2);
    }
    return {
      id: i, name: e.name, x: e.x, y: e.y, links: [...e.links], core: e.nation, owner: e.nation, occ: null,
      terrain: e.terrain, res, pop: 0,
      prodWindow: new Array(B.pollution.windowDays).fill(0), pollution: 0,
      bld: { hospital: 0, fields: 0, industrial: 0, base: 0 }, project: null, supplied: true,
      crime: 20, police: 30, unrest: 10, disrupted: 0, blockade: null,
    };
  });
  NATION_DEFS.forEach((d, ni) => {
    const own = regions.filter((r) => r.owner === ni);
    const total = Math.min(520000, Math.max(150000, 270000 * (d.pop / 1e8) ** 0.2)) * rand(w, 0.9, 1.1);
    const weight = (r: Region) => EARTH.regions[r.id].popReal ** 0.75;
    const sum = own.reduce((t, r) => t + weight(r), 0);
    for (const r of own) r.pop = Math.max(3000, Math.round((total * weight(r)) / sum / 100) * 100);
  });
  return regions;
}

/**
 * AI citizens living in a region: the per-region setting, with populous regions
 * (California, England, Tokyo…) holding up to twice as many as small ones.
 */
export const residentsFor = (perRegion: number, popReal: number) => Math.max(1, Math.round(perRegion * Math.min(2, Math.max(1, (popReal / 4e6) ** 0.3))));

import { census, invalidateCensus, referenceSociety } from './census';
export { citizenScale, referenceSociety } from './census';

function personName(w: World, cur: string, used: Set<string>) {
  const pool = NAME_POOLS[cur];
  for (let i = 0; i < 50; i++) {
    const n = `${pick(w, pool.first)} ${pick(w, pool.last)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  // Common names repeat in real life too; a middle initial tells namesakes apart.
  for (let i = 0; i < 50; i++) {
    const n = `${pick(w, pool.first)} ${String.fromCharCode(65 + randInt(w, 0, 25))}. ${pick(w, pool.last)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  return `${pick(w, pool.first)} ${pick(w, pool.last)}`;
}

export function newCitizen(w: World, name: string, nation: Id, loc: Id, persona: Persona, ideo: Ideology): Citizen {
  return {
    id: w.nextId++, name, persona, nation, loc, home: loc, wallet: {}, inv: {}, born: w.time,
    xp: 0, level: 1, attrPts: B.levels.attrPerLevel,
    attrs: { str: 0, acc: 0, luck: 0, end: 0, lead: 0, eco: 0, cons: 0 },
    power: B.training.startPower, eco: B.eco.startSkill, dmgTotal: 0, buildTotal: 0,
    energy: B.energy.baseMax, allowance: B.food.allowanceStart, allowAcc: 0,
    job: null, jobSince: 0, lastWorkDay: -1, lastTrainDay: -1, trainsToday: 0, mgrShiftsDay: -1, mgrShifts: 0,
    party: null, unit: null, ideo, ideoStr: rand(w, 0.3, 1),
    traits: { ambition: next(w), risk: next(w), loyalty: next(w), greed: next(w), activity: rand(w, 0.5, 1) },
    workHour: randInt(w, 7, 17), trainHour: randInt(w, 6, 21), fightStyle: pick(w, ['early', 'steady', 'late', 'late'] as const),
    influence: 0, rel: {}, gear: {}, loadouts: [], buffs: [], studies: {}, reserve: 0, mining: null, mineSite: loc,
    medals: {}, mood: 0, lastIncome: 0, incomeToday: 0, flags: {},
    sec: newSec(),
    mil: { branch: null, rank: 0, sp: 0, since: 0, lastDuty: -1, commands: 0 },
  };
}

export function newSec(): Citizen['sec'] {
  return {
    heat: 0, jailUntil: 0, record: { crimes: 0, arrests: 0, convictions: 0, fines: 0 }, syndicate: null, srank: 0,
    police: null, prank: 0, collars: 0, agency: null, arank: 0, tradecraft: 0, asset: null, fame: 0, notoriety: 0,
    goal: null, rivals: [], last: {},
  };
}

/** Spend a citizen's attribute points according to their persona. */
export function autoAllocate(c: Citizen) {
  const prefs: Record<Persona, (keyof Citizen['attrs'])[]> = {
    worker: ['eco', 'end', 'lead'], merchant: ['eco', 'lead', 'end'], politician: ['end', 'eco', 'str'],
    soldier: ['str', 'acc', 'luck', 'end'], industrialist: ['lead', 'eco', 'end'], builder: ['cons', 'end', 'str'],
    journalist: ['end', 'eco'], investor: ['eco', 'lead'],
  };
  const p = prefs[c.persona];
  let i = 0;
  while (c.attrPts > 0) { c.attrs[p[i % p.length]]++; c.attrPts--; i++; }
}

const PERSONA_MIX: [Persona, number][] = [['worker', 38], ['soldier', 16], ['industrialist', 10], ['merchant', 7], ['politician', 11], ['builder', 7], ['journalist', 5], ['investor', 6]];

// Every nation starts with owners for its companies, candidates for office and a few soldiers.
const CORE_ROLES: Persona[] = ['industrialist', 'industrialist', 'merchant', 'investor', 'politician', 'politician', 'politician', 'soldier', 'soldier', 'builder', 'journalist'];

function makeGenesisCitizen(w: World, n: Nation, loc: Id, persona: Persona, ideo: Ideology, used: Set<string>) {
  const c = newCitizen(w, personName(w, n.cur, used), n.id, loc, persona, ideo);
  c.born = w.time - randInt(w, 18, 70) * 365 * DAY;
  c.level = randInt(w, 2, 22) + (persona === 'politician' ? 4 : 0);
  c.attrPts = Math.min(c.level, B.levels.attrMaxLevel) * B.levels.attrPerLevel;
  autoAllocate(c);
  c.power = +(B.training.startPower + c.level * rand(w, 0.8, 2.2) * (persona === 'soldier' ? 1.6 : 1)).toFixed(2);
  c.eco = +(1 + c.level * rand(w, 0.1, 0.35) * (persona === 'worker' || persona === 'industrialist' ? 1.5 : 1)).toFixed(2);
  c.dmgTotal = Math.round(c.power * c.level * rand(w, 500, 3000) * (persona === 'soldier' ? 3 : 0.5));
  c.influence = Math.round(rand(w, 0, 20) + (persona === 'politician' ? 25 : persona === 'journalist' ? 12 : 0) + c.level);
  c.energy = rand(w, 40, 100);
  w.citizens[c.id] = c;
  invalidateCensus(w);
  const wealth = { industrialist: 3, investor: 2.5, merchant: 1.8, politician: 1.3 }[persona as string] ?? 1;
  mint(w, cref(c.id), n.cur, cur(randInt(w, 80, 260) * wealth), 'Genesis endowment');
  mint(w, cref(c.id), GOLD, g(rand(w, 1, 12) * wealth), 'Genesis endowment');
  produce(w, cref(c.id), 'food:1', randInt(w, 3, 12), 'genesis');
  if (persona === 'soldier') { produce(w, cref(c.id), 'wg:1', randInt(w, 5, 25), 'genesis'); produce(w, cref(c.id), 'food:2', randInt(w, 2, 8), 'genesis'); }
  return c;
}

export function generateWorld(seed: number, playerName: string, playerNation: number, opts: Partial<Settings> = {}): World {
  const settings = { ...defaultSettings(), ...opts };
  applyBalance(settings.balance);
  const w: World = {
    version: SAVE_VERSION, seed, rng: seed | 0, time: DAY + 8 * HOUR, nextId: 1, seq: 1, settings,
    playerId: -1, player: null as any,
    regions: [], govs: [], syndicates: {}, cases: {}, ops: {}, crises: {},
    forces: {}, navalLog: [],
    econ: { cycle: 0.2, trend: 0, phase: 'expansion', hist: [], commodity: { grain: 1, iron: 1, titanium: 1, oil: 1 } },
    nations: [], households: [], citizens: {}, companies: {}, listings: {}, fx: {}, fxTrades: {}, trades: {}, lastPrice: {},
    parties: {}, elections: {}, proposals: {}, projects: {}, wars: {}, battles: {}, units: {}, gear: {}, holdings: {}, shareOrders: {},
    shareTrades: [], contracts: {}, auctions: {}, papers: {}, articles: {}, tournaments: {}, events: {}, nukes: {}, inbox: [], log: [],
    chapters: [], notices: [], queue: [], stats: { supply: {}, minted: {}, burned: {}, items: {}, itemFlows: {} }, ledger: [],
    calendar: { nextDaily: 2 * DAY },
  };
  const regions = (w.regions = genRegions(w));

  const count = NATION_DEFS.length;
  const seeds = NATION_DEFS.map((d) => d.capital);

  // Ensure every nation has grain and iron somewhere so its economy can start.
  for (let i = 0; i < count; i++) {
    const own = regions.filter((r) => r.owner === i);
    for (const res of ['grain', 'iron'] as RawRes[]) {
      if (!own.some((r) => r.res[res])) pick(w, own).res[res] = 1;
    }
  }

  w.nations = NATION_DEFS.map((d, i): Nation => ({
    id: i, name: d.name, adj: d.adj, color: d.color, cur: d.cur, iso: d.iso, leader: d.leader, legislature: d.legislature, capital: seeds[i], wallet: {}, inv: {},
    taxes: { ...B.taxes.defaults }, minWage: cur(B.wages.min), president: null, cabinet: {}, deputies: [], seats: {}, congressSize: 5,
    relations: {}, alliances: [], embargoes: [], pacts: {}, exile: false, approval: 55, printed: 0, warheads: [], nukeProd: null, intel: 0,
    priorities: { battle: null, side: null, project: null }, termStart: w.time,
    stats: { revenue: 0, spending: 0, revToday: 0, spendToday: 0, revHist: [], spendHist: [] }, aiPlan: { lastWarCheck: 0, lastBuild: 0 }, recruitGoal: 0, fxAnchor: 0, requests: [], propCount: {}, warScore: 0, unemployment: 0, procure: {}, warMood: 0,
    agency: { name: AGENCY_NAMES[d.cur] ?? `${d.adj} Intelligence Service`, budget: B.intel.budget, network: {}, counter: 20, dossiers: {}, milIntel: {}, focus: [], opsRun: 0, caught: 0, exposed: 0 },
    policeFunding: 0.02,
    defense: { budget: B.forces.budget, chief: null, unpaid: 0 }, alert: 1,
  }));
  for (const n of w.nations) for (const m of w.nations) if (m.id !== n.id) n.relations[m.id] = { score: randInt(w, -10, 20), hist: [] };
  w.households = w.nations.map((n) => ({ nation: n.id, wallet: {}, inv: {}, pop: regions.filter((r) => r.owner === n.id).reduce((s, r) => s + r.pop, 0), unmet: 0 }));
  for (const h of w.households) mint(w, hhref(h.nation), w.nations[h.nation].cur, cur(h.pop * B.households.startPerPop), 'Genesis endowment');

  // Citizens: a local society in every region. Each region has its own business owners, politicians
  // (candidates for the state house) and the rest of a working population; the capital also holds the
  // nation's core figures.
  const used = new Set<string>();
  for (const n of w.nations) {
    const own = regions.filter((r) => r.owner === n.id);
    const nationIdeos = shuffle(w, [...IDEOLOGY_LIST]).slice(0, randInt(w, 3, 4));
    for (const r of own) {
      const count = residentsFor(settings.citizensPerRegion, EARTH.regions[r.id].popReal);
      const roles: Persona[] = r.id === n.capital ? [...CORE_ROLES] : [];
      const local: Persona[] = ['politician', 'industrialist', 'worker', 'merchant', 'soldier', 'politician', 'journalist', 'builder', 'investor', 'industrialist'];
      if (count >= 6) for (let k = 0; roles.length < count && k < local.length && k < Math.ceil(count / 2.4); k++) roles.push(local[k]);
      while (roles.length < count) roles.push(weighted(w, PERSONA_MIX, (x) => x[1])![0]);
      for (const persona of roles) makeGenesisCitizen(w, n, r.id, persona, chance(w, 0.85) ? pick(w, nationIdeos) : pick(w, IDEOLOGY_LIST), used);
    }
  }

  // Companies: the national industry mix (balanced for about 24 citizens) scaled to the nation's
  // population, spread over its regions (raw producers where the deposits are, the rest where people
  // live) and owned by business people from that region where possible.
  const plan: [Industry, number][] = [['grain', 5], ['iron', 3], ['titanium', 1], ['oil', 1], ['food', 4], ['wg', 2], ['wa', 1], ['ticket', 1]];
  for (const n of w.nations) {
    const own = regions.filter((r) => r.owner === n.id);
    const people = census(w).all.filter((c) => c.nation === n.id);
    const isOwner = (c: Citizen) => c.persona === 'industrialist' || c.persona === 'merchant' || c.persona === 'investor';
    const owners = people.filter(isOwner);
    const localOwners = new Map<Id, Citizen[]>();
    for (const c of owners) localOwners.set(c.home, [...(localOwners.get(c.home) ?? []), c]);
    const residents = new Map<Id, number>();
    for (const c of people) residents.set(c.home, (residents.get(c.home) ?? 0) + 1);
    const scale = Math.max(1, (people.length / 24) * B.population.companiesPerCitizen);
    const hosted = new Map<Id, number>(); // companies already placed per region: each extra one is less likely
    let oi = 0;
    for (const [ind, base] of plan) {
      const k = Math.max(1, Math.round(base * scale));
      for (let j = 0; j < k; j++) {
        const raw = RAWS.includes(ind as RawRes);
        const crowd = (r: Region) => 1 / (1 + (hosted.get(r.id) ?? 0)) ** 2;
        const region = raw
          ? weighted(w, own, (r) => ((r.res[ind as RawRes] ?? 0) * (residents.get(r.id) ?? 1) + 0.05) * crowd(r))!
          : weighted(w, own, (r) => (residents.get(r.id) ?? 0) * Math.sqrt(r.pop) * crowd(r))!; // where people live and the market is big
        hosted.set(region.id, (hosted.get(region.id) ?? 0) + 1);
        const locals = localOwners.get(region.id);
        const owner = locals?.length ? locals[j % locals.length] : owners[oi++ % owners.length];
        const q = weighted(w, [1, 2, 3], (x) => ({ 1: 5, 2: 3, 3: 1.5 }[x]!))!;
        const co = createCompany(w, cref(owner.id), ind, q, region.id);
        co.auto = { sell: true, buyInputs: true, hire: true };
        co.offer = { wage: cur(B.wages.start + q - 1 + rand(w, -1, 1)), slots: randInt(w, 2, B.company.maxWorkers[q - 1] - 1), minEco: 0 };
        mint(w, coref(co.id), n.cur, cur(randInt(w, 250, 500) + q * 80), 'Genesis endowment');
        if (!raw) {
          const input = (B.company.recipes as any)[ind].input as string;
          produce(w, coref(co.id), input, randInt(w, 60, 160), 'genesis');
        }
        produce(w, coref(co.id), outputKey(ind, q), randInt(w, 10, 40), 'genesis');
      }
    }
  }

  // Treasuries (currency + gold reserves for the exchange).
  for (const n of w.nations) {
    const cits = census(w).all.filter((c) => c.nation === n.id).length;
    mint(w, natref(n.id), n.cur, cur(cits * B.treasury.startPerCitizen), 'Genesis endowment');
    mint(w, natref(n.id), GOLD, g(Math.round(400 * Math.max(1, cits / referenceSociety(n.id)))), 'Genesis endowment'); // reserves sized to the society
    produce(w, natref(n.id), 'iron', 300, 'genesis');
    produce(w, natref(n.id), 'grain', 300, 'genesis');
    produce(w, natref(n.id), 'food:1', 200, 'genesis');
    produce(w, natref(n.id), 'wg:1', 200, 'genesis');
  }

  // Player.
  const pn = w.nations[playerNation];
  const p = newCitizen(w, playerName.trim().slice(0, 28) || 'Citizen', pn.id, pn.capital, 'worker', 'capitalism');
  p.player = true;
  p.workHour = 9; p.trainHour = 8; p.traits = { ambition: 1, risk: 0.5, loyalty: 0.5, greed: 0.5, activity: 1 };
  p.energy = B.energy.baseMax;
  w.citizens[p.id] = p;
  invalidateCensus(w);
  w.playerId = p.id;
  const diff = { easy: 2, normal: 1, hard: 0.5 }[settings.difficulty];
  mint(w, cref(p.id), pn.cur, cur(60 * diff), 'Starting funds');
  mint(w, cref(p.id), GOLD, g(2 * diff), 'Starting funds');
  produce(w, cref(p.id), 'food:1', 10, 'genesis');
  produce(w, cref(p.id), 'food:2', 3, 'genesis');
  produce(w, cref(p.id), 'wg:1', 5, 'genesis');
  initPlayerProgress(w);

  // Initial hiring: citizens take jobs near home (their region, then neighbouring regions, then anywhere
  // in the country).
  const openByRegion = new Map<Id, Company[]>();
  for (const co of Object.values(w.companies)) if (co.offer) openByRegion.set(co.region, [...(openByRegion.get(co.region) ?? []), co]);
  for (const c of shuffle(w, census(w).all.filter((x) => !x.player))) {
    if (c.persona === 'industrialist' || c.persona === 'investor') continue;
    const free = (co: Company) => co.workers.length < co.offer!.slots && !(co.owner.k === 'cit' && co.owner.id === c.id) && regions[co.region].owner === c.nation;
    const near = [c.home, ...regions[c.home].links];
    let offers = (openByRegion.get(c.home) ?? []).filter(free);
    if (!offers.length) offers = near.flatMap((r) => openByRegion.get(r) ?? []).filter(free);
    if (!offers.length) offers = regions.filter((r) => r.owner === c.nation).flatMap((r) => openByRegion.get(r.id) ?? []).filter(free);
    if (!offers.length) continue;
    const co = weighted(w, offers, (o) => o.offer!.wage)!;
    co.workers.push(c.id);
    c.job = co.id;
    c.jobSince = w.time;
  }

  // Initial listings.
  for (const co of Object.values(w.companies)) {
    const key = outputKey(co.industry, co.q);
    const have = co.inv[key] ?? 0;
    const owner = co.owner.k === 'cit' ? co.owner.id : -1;
    const price = Math.round(refValue(key) * rand(w, 1.1, 1.5));
    co.prices[key] = price;
    if (have > 2) list(w, owner, coref(co.id), regions[co.region].owner, key, Math.floor(have * 0.8), price);
  }
  // Treasuries also list some national stock so food/weapons are buyable from day one.
  for (const n of w.nations) {
    for (const [key, q] of [['food:1', 120], ['wg:1', 120]] as const) {
      withAuthority(w, n.id, () => list(w, AUTH_ANY, natref(n.id), n.id, key, q, Math.round(refValue(key) * 1.4)));
    }
  }

  // Currency order books: each treasury quotes a ladder around the starting rate.
  for (const n of w.nations) {
    const base = cur(B.fx.startRate * rand(w, 0.8, 1.25));
    n.fxAnchor = base;
    const orig = { k: 'nat' as const, id: n.id };
    for (let k = 1; k <= 4; k++) {
      withAuthority(w, n.id, () => {
        placeOrder(w, AUTH_ANY, orig, n.cur, 'sellGold', g(15 * k), Math.round(base * (1 + B.fx.spread * k)));
        placeOrder(w, AUTH_ANY, orig, n.cur, 'sellCur', g(15 * k), Math.round(base * (1 - B.fx.spread * k)));
      });
    }
  }

  seedPolitics(w);
  initGovs(w);
  initCrime(w);
  initForces(w);
  seedOfficers(w);
  seedLate(w);

  for (const n of w.nations) record(w, 'genesis', `${n.name} enters the new era with ${regions.filter((r) => r.owner === n.id).length} regions.`, { nation: n.id });
  record(w, 'player', `${p.name} begins life as a citizen of ${pn.name}.`, { cit: p.id, nation: pn.id, player: true, important: true });
  return w;
}

/** Genesis-only: run an action with a temporary actor that has national authority. */
export const AUTH_ANY = -999;
export function withAuthority(w: World, nation: Id, fn: () => void) {
  const n = w.nations[nation];
  const prev = n.president;
  n.president = AUTH_ANY;
  try { fn(); } finally { n.president = prev; }
}

