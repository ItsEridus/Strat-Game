// Deterministic world generation from a seed.
import type { Citizen, Id, Ideology, Industry, Nation, Persona, RawRes, Region, Settings, Terrain, World } from './types';
import { B, applyBalance } from '../data/balance';
import { FIRST, LAST, NATION_DEFS, REGION_PREFIX, REGION_SUFFIX } from '../data/names';
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

export const SAVE_VERSION = 1;

export function defaultSettings(): Settings {
  const pauseOn: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(NOTICE_CATS)) pauseOn[k] = v.pauseDefault;
  const notifyFilter: Record<string, boolean> = {};
  for (const k of Object.keys(NOTICE_CATS)) notifyFilter[k] = true;
  return {
    speed: 1, paused: true, monthLen: 30, difficulty: 'normal', pauseOn, autoTrain: false,
    advanced: { nuclear: true, pirates: true, terrainEvents: false, tournaments: true },
    citizensPerNation: 36, balance: {}, notifyFilter,
  };
}

const W = 12, H = 8, HEX = 40;

function neighborsOf(col: number, row: number) {
  const odd = row & 1;
  const dirs = odd ? [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]] : [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
  return dirs.map(([dc, dr]) => [col + dc, row + dr]);
}

function genRegions(w: World): Region[] {
  const cells = new Map<string, { col: number; row: number }>();
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const d = ((c - cx) / (W / 2)) ** 2 + ((r - cy) / (H / 2)) ** 2;
    if (d < 1 + rand(w, -0.3, 0.15)) cells.set(`${c},${r}`, { col: c, row: r });
  }
  // largest connected component
  const seen = new Set<string>();
  let best: string[] = [];
  for (const key of cells.keys()) {
    if (seen.has(key)) continue;
    const comp: string[] = [];
    const stack = [key];
    seen.add(key);
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(k);
      const { col, row } = cells.get(k)!;
      for (const [nc, nr] of neighborsOf(col, row)) {
        const nk = `${nc},${nr}`;
        if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  best.sort((a, b) => { const [ac, ar] = a.split(',').map(Number); const [bc, br] = b.split(',').map(Number); return ar - br || ac - bc; });
  const used = new Set<string>();
  const regions: Region[] = best.map((k, i) => {
    const { col, row } = cells.get(k)!;
    let name = '';
    for (let t = 0; t < 100 && (!name || used.has(name)); t++) name = pick(w, REGION_PREFIX) + pick(w, REGION_SUFFIX);
    used.add(name);
    return {
      id: i, name, col, row,
      x: HEX * Math.sqrt(3) * (col + 0.5 * (row & 1)) + HEX,
      y: HEX * 1.5 * row + HEX,
      links: [], core: -1, owner: -1, occ: null,
      terrain: 'plains' as Terrain, res: {}, pop: 0,
      prodWindow: new Array(B.pollution.windowDays).fill(0), pollution: 0,
      bld: { hospital: 0, fields: 0, industrial: 0, base: 0 }, project: null, supplied: true,
    };
  });
  const byKey = new Map(regions.map((r) => [`${r.col},${r.row}`, r]));
  for (const r of regions) r.links = neighborsOf(r.col, r.row).map(([c, rr]) => byKey.get(`${c},${rr}`)).filter(Boolean).map((n) => n!.id);
  // Terrain: clustered random walk.
  const terrains: Terrain[] = ['plains', 'mountains', 'forest', 'desert'];
  for (const r of regions) {
    const assigned = r.links.map((l) => regions[l]).filter((n) => n.id < r.id);
    r.terrain = assigned.length && chance(w, 0.55) ? pick(w, assigned).terrain : (weighted(w, terrains, (t) => ({ plains: 4, mountains: 2, forest: 3, desert: 1.5 }[t])) as Terrain);
  }
  // Resources: 1–2 per region, richness 1–3.
  for (const r of regions) {
    const n = chance(w, 0.35) ? 2 : 1;
    const opts = shuffle(w, [...RAWS]);
    for (let i = 0; i < n; i++) {
      const res = weighted(w, opts, (x) => ({ grain: r.terrain === 'plains' ? 5 : 2, iron: r.terrain === 'mountains' ? 4 : 2, titanium: r.terrain === 'mountains' ? 2 : 1, oil: r.terrain === 'desert' ? 4 : 1.3 }[x]))!;
      opts.splice(opts.indexOf(res), 1);
      r.res[res] = randInt(w, 1, 3);
    }
    r.pop = randInt(w, 18, 70) * 1000;
  }
  return regions;
}

function bfs(regions: Region[], from: Id) {
  const dist = new Array(regions.length).fill(Infinity);
  dist[from] = 0;
  const q = [from];
  while (q.length) {
    const id = q.shift()!;
    for (const n of regions[id].links) if (dist[n] === Infinity) { dist[n] = dist[id] + 1; q.push(n); }
  }
  return dist;
}

function personName(w: World, used: Set<string>) {
  for (let i = 0; i < 50; i++) {
    const n = `${pick(w, FIRST)} ${pick(w, LAST)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  const n = `${pick(w, FIRST)} ${pick(w, LAST)} ${used.size}`;
  used.add(n);
  return n;
}

export function newCitizen(w: World, name: string, nation: Id, loc: Id, persona: Persona, ideo: Ideology): Citizen {
  return {
    id: w.nextId++, name, persona, nation, loc, wallet: {}, inv: {}, born: w.time,
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

export function generateWorld(seed: number, playerName: string, playerNation: number, opts: Partial<Settings> = {}): World {
  const settings = { ...defaultSettings(), ...opts };
  applyBalance(settings.balance);
  const w: World = {
    version: SAVE_VERSION, seed, rng: seed | 0, time: DAY + 8 * HOUR, nextId: 1, seq: 1, settings,
    playerId: -1, player: null as any,
    regions: [], nations: [], households: [], citizens: {}, companies: {}, listings: {}, fx: {}, fxTrades: {}, trades: {}, lastPrice: {},
    parties: {}, elections: {}, proposals: {}, projects: {}, wars: {}, battles: {}, units: {}, gear: {}, holdings: {}, shareOrders: {},
    shareTrades: [], contracts: {}, auctions: {}, papers: {}, articles: {}, tournaments: {}, events: {}, nukes: {}, inbox: [], log: [],
    chapters: [], notices: [], queue: [], stats: { supply: {}, minted: {}, burned: {}, items: {}, itemFlows: {} }, ledger: [],
    calendar: { nextDaily: 2 * DAY },
  };
  const regions = (w.regions = genRegions(w));

  // Capitals by farthest-point sampling, then round-robin territorial growth.
  const count = NATION_DEFS.length;
  const seeds = [randInt(w, 0, regions.length - 1)];
  const minD = bfs(regions, seeds[0]);
  while (seeds.length < count) {
    let bestId = 0, bestD = -1;
    for (const r of regions) if (minD[r.id] > bestD && !seeds.includes(r.id)) { bestD = minD[r.id]; bestId = r.id; }
    seeds.push(bestId);
    const d = bfs(regions, bestId);
    for (let i = 0; i < d.length; i++) minD[i] = Math.min(minD[i], d[i]);
  }
  seeds.forEach((id, i) => { regions[id].owner = i; });
  let unclaimed = regions.length - seeds.length;
  while (unclaimed > 0) {
    let progressed = false;
    for (let i of shuffle(w, [...Array(count).keys()])) {
      const frontier: Id[] = [];
      for (const r of regions) if (r.owner === i) for (const l of r.links) if (regions[l].owner === -1) frontier.push(l);
      if (!frontier.length) continue;
      regions[pick(w, frontier)].owner = i;
      unclaimed--; progressed = true;
      if (!unclaimed) break;
    }
    if (!progressed) break;
  }
  for (const r of regions) r.core = r.owner;
  for (const id of seeds) regions[id].pop = Math.round(regions[id].pop * 1.6);

  // Ensure every nation has grain and iron somewhere so its economy can start.
  for (let i = 0; i < count; i++) {
    const own = regions.filter((r) => r.owner === i);
    for (const res of ['grain', 'iron'] as RawRes[]) {
      if (!own.some((r) => r.res[res])) pick(w, own).res[res] = 1;
    }
  }

  w.nations = NATION_DEFS.map((d, i): Nation => ({
    id: i, name: d.name, adj: d.adj, color: d.color, cur: d.cur, capital: seeds[i], wallet: {}, inv: {},
    taxes: { ...B.taxes.defaults }, minWage: cur(B.wages.min), president: null, cabinet: {}, deputies: [], seats: {}, congressSize: 5,
    relations: {}, alliances: [], embargoes: [], pacts: {}, exile: false, approval: 55, printed: 0, warheads: [], nukeProd: null, intel: 0,
    priorities: { battle: null, side: null, project: null }, termStart: w.time,
    stats: { revenue: 0, spending: 0, revToday: 0, spendToday: 0, revHist: [] }, aiPlan: { lastWarCheck: 0, lastBuild: 0 }, recruitGoal: 0, fxAnchor: 0,
  }));
  for (const n of w.nations) for (const m of w.nations) if (m.id !== n.id) n.relations[m.id] = { score: randInt(w, -10, 20), hist: [] };
  w.households = w.nations.map((n) => ({ nation: n.id, wallet: {}, inv: {}, pop: regions.filter((r) => r.owner === n.id).reduce((s, r) => s + r.pop, 0), unmet: 0 }));
  for (const h of w.households) mint(w, hhref(h.nation), w.nations[h.nation].cur, cur(h.pop * B.households.startPerPop), 'Genesis endowment');

  // Citizens.
  const used = new Set<string>();
  for (const n of w.nations) {
    const own = regions.filter((r) => r.owner === n.id);
    const nationIdeos = shuffle(w, [...IDEOLOGY_LIST]).slice(0, randInt(w, 3, 4));
    for (let k = 0; k < settings.citizensPerNation; k++) {
      const persona = weighted(w, PERSONA_MIX, (x) => x[1])![0];
      const loc = weighted(w, own, (r) => r.pop + (r.id === n.capital ? 30000 : 0))!.id;
      const ideo = chance(w, 0.85) ? pick(w, nationIdeos) : pick(w, IDEOLOGY_LIST);
      const c = newCitizen(w, personName(w, used), n.id, loc, persona, ideo);
      c.level = randInt(w, 2, 22) + (persona === 'politician' ? 4 : 0);
      c.attrPts = Math.min(c.level, B.levels.attrMaxLevel) * B.levels.attrPerLevel;
      autoAllocate(c);
      c.power = +(B.training.startPower + c.level * rand(w, 0.8, 2.2) * (persona === 'soldier' ? 1.6 : 1)).toFixed(2);
      c.eco = +(1 + c.level * rand(w, 0.1, 0.35) * (persona === 'worker' || persona === 'industrialist' ? 1.5 : 1)).toFixed(2);
      c.dmgTotal = Math.round(c.power * c.level * rand(w, 500, 3000) * (persona === 'soldier' ? 3 : 0.5));
      c.influence = Math.round(rand(w, 0, 20) + (persona === 'politician' ? 25 : persona === 'journalist' ? 12 : 0) + c.level);
      c.energy = rand(w, 40, 100);
      w.citizens[c.id] = c;
      const wealth = { industrialist: 3, investor: 2.5, merchant: 1.8, politician: 1.3 }[persona as string] ?? 1;
      mint(w, cref(c.id), n.cur, cur(randInt(w, 80, 260) * wealth), 'Genesis endowment');
      mint(w, cref(c.id), GOLD, g(rand(w, 1, 12) * wealth), 'Genesis endowment');
      produce(w, cref(c.id), 'food:1', randInt(w, 3, 12), 'genesis');
      if (persona === 'soldier') { produce(w, cref(c.id), 'wg:1', randInt(w, 5, 25), 'genesis'); produce(w, cref(c.id), 'food:2', randInt(w, 2, 8), 'genesis'); }
    }
  }

  // Companies per nation, owned by industrialists/merchants/investors.
  const plan: [Industry, number][] = [['grain', 5], ['iron', 3], ['titanium', 1], ['oil', 1], ['food', 4], ['wg', 2], ['wa', 1], ['ticket', 1]];
  for (const n of w.nations) {
    const own = regions.filter((r) => r.owner === n.id);
    const owners = Object.values(w.citizens).filter((c) => c.nation === n.id && ['industrialist', 'merchant', 'investor'].includes(c.persona));
    let oi = 0;
    for (const [ind, k] of plan) {
      for (let j = 0; j < k; j++) {
        const owner = owners[oi++ % owners.length];
        const raw = RAWS.includes(ind as RawRes);
        const region = raw
          ? weighted(w, own, (r) => ((r.res[ind as RawRes] ?? 0) ** 2) + 0.05)!
          : weighted(w, own, (r) => r.pop)!;
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
    const cits = Object.values(w.citizens).filter((c) => c.nation === n.id).length;
    mint(w, natref(n.id), n.cur, cur(cits * B.treasury.startPerCitizen), 'Genesis endowment');
    mint(w, natref(n.id), GOLD, g(400), 'Genesis endowment');
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
  w.playerId = p.id;
  const diff = { easy: 2, normal: 1, hard: 0.5 }[settings.difficulty];
  mint(w, cref(p.id), pn.cur, cur(60 * diff), 'Starting funds');
  mint(w, cref(p.id), GOLD, g(2 * diff), 'Starting funds');
  produce(w, cref(p.id), 'food:1', 10, 'genesis');
  produce(w, cref(p.id), 'food:2', 3, 'genesis');
  produce(w, cref(p.id), 'wg:1', 5, 'genesis');
  initPlayerProgress(w);

  // Initial hiring: citizens apply to companies in their nation.
  for (const c of shuffle(w, Object.values(w.citizens).filter((x) => !x.player))) {
    if (c.persona === 'industrialist' || c.persona === 'investor') continue;
    const offers = Object.values(w.companies).filter((co) => co.offer && co.workers.length < co.offer.slots && regions[co.region].owner === c.nation && !(co.owner.k === 'cit' && co.owner.id === c.id));
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

