// Secession and new states (2.3 Rise & fall).
// - Every region has an identity of its own (data/identity.ts: how distinct its language,
//   history or nationhood is) and a level of support for independence. Support grows from
//   identity when the region is alienated: unrest, an illegitimate or unpopular government,
//   repression, a war going badly. It fades when things go well.
// - When support is strong enough an independence movement forms. In a democracy the
//   government may agree to a referendum, which the region can win or lose. Where no
//   referendum is allowed and support runs high, the region may declare independence
//   unilaterally, and the country it left will try to take it back by force (a civil
//   war fought with the war machinery).
// - A new state is a full country: its own name, colours, currency (issued at
//   independence and traded on the currency market), treasury, parties, president and
//   congress; residents become its citizens; it inherits its parent's real-world data
//   until it builds its own. Other countries decide whether to recognise it: after a
//   referendum, nearly everyone does; after a unilateral declaration, mostly the parent's
//   rivals.
import type { Id, Nation, Region, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { hash01 } from '../engine/rng';
import { mint, pay } from '../engine/ledger';
import { GOLD, c as cur } from '../engine/money';
import { MONEY } from '../data/economy';
import { NAME_POOLS, POLICE_NAMES, SYNDICATE_STYLES } from '../data/names';
import { B } from '../data/balance';
import { IDENTITY, ADJECTIVE, INDEP_2025 } from '../data/identity';
import { setIsoAlias } from '../data/isoAlias';
import { census, companiesOf, invalidateCensus } from './census';
import { companyCurrency, coref, hhref, natref, player } from './query';
import { relation } from './congress';
import { leaderProfile } from './relations';
import { historyPace } from './strategic';
import { isDemocracy, regimeOf } from './regimes';
import { appointCabinetAI, createParty, fillDeputies, sortPartyList } from './politics';
import { changeCitizenship } from './travel';
import { computeSupply, declareWar, updateExile, warCheck } from './war';
import { defenceShare } from '../data/arsenal';
import { makeFormation } from './forces';
import { stateFound } from '../ai/economy';
import { outputKey, kindOf } from '../data/items';

export interface NewState { id: Id; parent: Id; t: number; how: 'referendum' | 'declaration' | 'rebellion'; iso: string; cur: string; money: { name: string; symbol: string } }

export const identityOf = (r: Region) => (r.identity ??= IDENTITY[r.name] ?? Math.round(5 + hash01(r.id, 2301) * 10));

/** Make the data a save needs (new states' currencies and data aliases) available again after loading. */
export function registerDynamic(w: World) {
  for (const s of w.newStates ?? []) {
    const parent = w.nations[s.parent];
    if (parent) setIsoAlias(s.iso, parent.iso);
    const base = MONEY[parent?.cur ?? 'USD'] ?? MONEY.USD;
    if (!MONEY[s.cur]) MONEY[s.cur] = { ...base, name: s.money.name, symbol: s.money.symbol };
    copyCurrencyTables(s.cur, parent?.cur ?? 'USD');
  }
}
/** Tables keyed by currency (names, police and syndicate styles) follow the parent's for a new state. */
function copyCurrencyTables(code: string, parentCur: string) {
  for (const t of [NAME_POOLS, POLICE_NAMES, SYNDICATE_STYLES] as Record<string, unknown>[]) if (t[code] == null && t[parentCur] != null) t[code] = t[parentCur];
}

// ---------- support for independence ----------

function supportMonth(w: World) {
  for (const r of w.regions) {
    const n = w.nations[r.owner];
    if (!n || n.exile || r.occ || r.id === n.capital) continue;
    const id = identityOf(r);
    if (id < 15) { r.indep = Math.max(0, (r.indep ?? 0) * 0.9); continue; }
    const reg = regimeOf(n);
    const alienation = r.unrest / 200 + (reg.legitimacy < 40 ? 0.2 : 0) + (n.approval < 35 ? 0.1 : 0) + (isDemocracy(n) ? 0 : 0.15) + (n.warScore < -30 ? 0.1 : 0);
    const base = INDEP_2025[r.name] ?? id * 0.25;
    const target = Math.min(100, base + id * alienation);
    r.indep = Math.round(((r.indep ?? base) + (target - (r.indep ?? base)) * 0.05) * 10) / 10;
    if (r.indep > 30 && !r.indepMovement) {
      r.indepMovement = w.time;
      record(w, 'politics', `🏳️ An independence movement has formed in ${r.name} (${n.name}): ${Math.round(r.indep)}% support.`, { nation: n.id, region: r.id });
    }
    if (r.indepMovement && r.indep < 15) delete r.indepMovement;
    if (!r.indepMovement || w.time - (r.lastReferendum ?? -1e12) < 5 * 365 * DAY) continue;
    const lp = leaderProfile(w, n);
    // A referendum, where the government agrees to one.
    if (r.indep > 45 && isDemocracy(n) && chance(w, 0.007) && (lp.nationalism < 0.6 || chance(w, 0.2))) {
      r.lastReferendum = w.time;
      const yes = Math.max(0, Math.min(100, r.indep + rand(w, -12, 12)));
      if (yes > 50) {
        record(w, 'politics', `🗳️ ${r.name} voted for independence from ${n.name}: ${Math.round(yes)}% yes.`, { nation: n.id, region: r.id, important: true });
        createState(w, n, [r.id], 'referendum');
      } else {
        r.indep = Math.max(0, r.indep - 15);
        record(w, 'politics', `🗳️ ${r.name} voted to stay in ${n.name}: ${Math.round(100 - yes)}% no.`, { nation: n.id, region: r.id, important: true });
      }
      continue;
    }
    // A unilateral declaration, where none is allowed and support runs high.
    if (r.indep > 60 && (!isDemocracy(n) || lp.nationalism >= 0.6) && chance(w, 0.01)) {
      r.lastReferendum = w.time;
      const s = createState(w, n, [r.id], 'declaration');
      // The country it left will try to take it back.
      const params = { target: s.id, days: 30, goals: [r.id] };
      if (!warCheck(w, n, params)) declareWar(w, n, params).kind = 'secession';
    }
  }
}

// ---------- creating a state ----------

const uniqueIso = (w: World, name: string) => {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  for (let i = 2; i < letters.length; i++) { const iso = letters[0] + letters[1] + letters[i]; if (!w.nations.some((n) => n.iso === iso) && !MONEY[iso + 'X']) return iso; }
  return 'X' + String(w.nations.length).padStart(2, '0');
};
const shift = (hex: string, k: number) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + k)).toString(16).padStart(2, '0')).join('');

export function createState(w: World, parent: Nation, regionIds: Id[], how: NewState['how'], opts: { name?: string; adj?: string; leader?: Id; defect?: number } = {}): Nation {
  const first = w.regions[regionIds[0]];
  const name = opts.name ?? first.name.replace(/^Republic of /, '');
  const adj = opts.adj ?? ADJECTIVE[first.name] ?? name;
  const iso = uniqueIso(w, name);
  const code = iso + 'X';
  const pm = MONEY[parent.cur] ?? MONEY.USD;
  const unit = pm.name.split(' ').pop() ?? 'dollar';
  const money = { name: `${adj} ${unit}`, symbol: `${iso.slice(0, 2)}${pm.symbol.replace(/^[A-Za-z]+/, '') || '$'}` };
  const id = w.nations.length;
  (w.newStates ??= []).push({ id, parent: parent.id, t: w.time, how, iso, cur: code, money });
  setIsoAlias(iso, parent.iso);
  MONEY[code] = { ...pm, name: money.name, symbol: money.symbol };
  copyCurrencyTables(code, parent.cur);
  const n: Nation = {
    id, name, adj, color: shift(parent.color, 60), cur: code, iso, leader: parent.leader, legislature: parent.legislature, capital: first.id, wallet: {}, inv: {},
    taxes: { ...parent.taxes }, taxNorm: parent.taxNorm, minWage: parent.minWage, president: null, cabinet: {}, deputies: [], seats: {}, congressSize: 5,
    relations: {}, alliances: [], embargoes: [], pacts: {}, exile: false, approval: 60, printed: 0, warheads: [], nukeProd: null, intel: 0,
    priorities: { battle: null, side: null, project: null }, termStart: w.time,
    stats: { revenue: 0, spending: 0, revToday: 0, spendToday: 0, revHist: [...parent.stats.revHist.map((x) => Math.round(x * 0.1))], spendHist: [...parent.stats.spendHist.map((x) => Math.round(x * 0.1))] },
    aiPlan: { lastWarCheck: 0, lastBuild: 0 }, recruitGoal: 0, fxAnchor: parent.fxAnchor, requests: [], propCount: {}, warScore: 0, unemployment: parent.unemployment, procure: {}, warMood: 0,
    agency: { name: `${adj} Intelligence Service`, budget: B.intel.budget, network: {}, counter: 15, dossiers: {}, milIntel: {}, focus: [], opsRun: 0, caught: 0, exposed: 0 },
    policeFunding: parent.policeFunding, defense: { budget: defenceShare(iso), chief: null, unpaid: 0 }, alert: 1,
    parent: parent.id, founded: w.time, recognisedBy: [],
  } as Nation;
  w.nations.push(n);
  // Relations: it inherits a softened version of its parent's, and its parent's feelings depend on how it left.
  for (const o of w.nations) {
    if (o.id === id) continue;
    const base = o.id === parent.id ? (how === 'referendum' ? 20 : how === 'rebellion' ? -75 : -60) : Math.round((o.relations[parent.id]?.score ?? 0) * 0.5);
    n.relations[o.id] = { score: base, hist: [] };
    o.relations[id] = { score: base, hist: [] };
  }
  // The land, and those who live there.
  const pop = regionIds.reduce((s, rid) => s + w.regions[rid].pop, 0);
  for (const rid of regionIds) { const r = w.regions[rid]; r.owner = id; r.core = id; r.indep = 0; delete r.indepMovement; }
  w.households.push({ nation: id, wallet: {}, inv: {}, pop, unmet: 0 });
  mint(w, hhref(id), code, cur(pop * B.households.startPerPop), 'Currency issued at independence');
  const share = pop / Math.max(1, w.regions.filter((r) => r.owner === parent.id).reduce((s, r) => s + r.pop, 0) + pop);
  const gold = Math.floor((parent.wallet[GOLD] ?? 0) * share);
  if (gold > 0) pay(w, natref(parent.id), natref(id), GOLD, gold, `Share of reserves for ${name}`);
  mint(w, natref(id), code, Math.max(cur(500), Math.round((parent.wallet[parent.cur] ?? 0) * share)), 'Currency issued at independence');
  const residents = census(w).all.filter((c) => regionIds.includes(c.home) && c.nation === parent.id && !c.gone);
  for (const c of residents) if (!c.player) changeCitizenship(w, c, id, true);
  // Firms there switch to the new currency (their balances converted one for one).
  for (const co of Object.values(w.companies)) if (regionIds.includes(co.region)) {
    const old = co.wallet[parent.cur] ?? 0;
    if (old > 0 && companyCurrency(w, co) === code) { pay(w, coref(co.id), hhref(parent.id), parent.cur, old, 'Currency conversion at independence'); mint(w, coref(co.id), code, old, 'Currency conversion at independence'); }
  }
  // Armed forces based there: withdrawn after an agreed referendum; otherwise they go over
  // to the new state, with part of the rest of the army if it has split.
  const army = Object.values(w.forces).filter((f) => f.nation === parent.id && f.branch !== 'navy').sort((a, b) => a.id - b.id);
  for (const f of army) {
    const here = regionIds.includes(f.loc);
    if (how === 'referendum') { if (here) { f.loc = parent.capital; f.path = []; f.order = { kind: 'garrison', target: null }; } continue; }
    if (here || hash01(f.id, 2302) < (opts.defect ?? 0)) {
      f.nation = id; f.commander = null; f.loc = here ? f.loc : first.id; f.path = []; f.order = { kind: 'garrison', target: null };
    }
  }
  if (how !== 'referendum' && !Object.values(w.forces).some((f) => f.nation === id)) {
    const m = makeFormation(w, id, 'infantry', first.id, `${adj} Militia`, 60);
    m.equipment = 40;
  }
  invalidateCensus(w);
  // Its first government: two parties, a president and a congress from among its people.
  const people = census(w).all.filter((c) => c.nation === id && !c.player).sort((a, b) => b.influence - a.influence || a.id - b.id);
  const ideos = [...new Set(people.map((c) => c.ideo))].slice(0, 2);
  for (const [i, ideo] of ideos.entries()) {
    const leader = people.find((c) => c.ideo === ideo);
    if (!leader) continue;
    const p = createParty(w, id, ideo, leader.id, i === 0 ? (how === 'rebellion' ? `${adj} Front` : `${adj} ${how === 'referendum' ? 'Independence' : 'Liberation'} Party`) : undefined);
    for (const c of people.filter((x) => x.ideo === ideo && x.party == null).slice(0, 8)) { c.party = p.id; if (!p.members.includes(c.id)) p.members.push(c.id); }
    p.support = Math.round((p.members.length / Math.max(1, people.length)) * 100);
    sortPartyList(w, p);
    n.seats[p.id] = i === 0 ? 3 : 2;
  }
  fillDeputies(w, n);
  if (opts.leader != null && w.citizens[opts.leader] && !w.citizens[opts.leader].player) { const l = w.citizens[opts.leader]; if (l.nation !== id) changeCitizenship(w, l, id, true); }
  n.president = opts.leader != null && w.citizens[opts.leader]?.nation === id ? opts.leader : people[0]?.id ?? null;
  appointCabinetAI(w, n);
  // Essentials it cannot yet make for itself: the new government sets up state enterprises.
  const made = new Set(companiesOf(w, id).map((co) => kindOf(outputKey(co.industry, co.q))));
  for (const kind of ['grain', 'food']) if (!made.has(kind)) stateFound(w, id, kind);
  // Recognition.
  for (const o of w.nations) {
    if (o.id === id || o.id === parent.id || o.exile) continue;
    const yes = how === 'referendum' ? (o.relations[parent.id]?.score ?? 0) > -60 : (o.relations[parent.id]?.score ?? 0) < (how === 'rebellion' ? -40 : -20);
    if (yes) n.recognisedBy!.push(o.id);
    else relation(w, o.id, id, -10, 'refused to recognise it');
  }
  if (how === 'referendum') n.recognisedBy!.push(parent.id);
  const text = how === 'rebellion'
    ? `⚔️ Civil war in ${parent.name}: the ${name} holds ${regionIds.map((r) => w.regions[r].name).join(', ')} against the government. ${n.recognisedBy!.length} countr${n.recognisedBy!.length === 1 ? 'y recognises' : 'ies recognise'} it.`
    : how === 'referendum'
    ? `🎉 ${name} became an independent state after its referendum, with the agreement of ${parent.name}. ${n.recognisedBy!.length} countries recognise it; it issues the ${money.name}.`
    : `🏴 ${name} declared independence from ${parent.name}. Only ${n.recognisedBy!.length} countr${n.recognisedBy!.length === 1 ? 'y recognises' : 'ies recognise'} it; ${parent.name} calls it rebellion.`;
  record(w, 'politics', text, { nation: id, important: true });
  for (const x of [n, parent]) (x.chronicle ??= []).push({ t: w.time, text });
  const pl = player(w);
  if (pl.nation === parent.id || regionIds.includes(pl.home)) notify(w, 'politics', `${text}${regionIds.includes(pl.home) ? ' You live there: you can apply for its citizenship (Travel and citizenship).' : ''}`, { critical: true });
  computeSupply(w);
  updateExile(w);
  return n;
}

export function secessionDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) supportMonth(w);
}
