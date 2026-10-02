// A population that lives. Nobody is a fixed fixture: people age, their health
// rises and falls, they retire, fall ill and die; young people come of age in
// local families; people move to where life is better, emigrate abroad and
// arrive from abroad. Each region's size follows how good a place it is to live
// (jobs, safety, order, infrastructure, peace), so a quiet state can shrink to a
// dozen people while a booming one grows to a hundred.
//
// Leaving the world is done properly: a death hands the estate to the family
// (or the state), offices fall vacant and are refilled, commands pass on, and
// the person stays on record so history can still name them.
import { funeral } from './familyLife';
import { marriageBar, orientationOf } from './partnership';
import { sexOf } from './looks';
import { techFx } from './technology';
import { hasQuirk } from './nature';
import { playerDies, settleWill } from './legacy';
import type { Citizen, Id, Ideology, Nation, Persona, Region, World } from './types';
import { B } from '../data/balance';
import { EARTH } from '../data/earth';
import { NAME_POOLS } from '../data/names';
import { IDEOLOGY_LIST } from '../data/ideologies';
import { burn, consume, mint, moveItems, pay, produce } from '../engine/ledger';
import { GOLD, c as cur, g } from '../engine/money';
import { notify, record } from '../engine/events';
import { chance, pick, rand, randInt, weighted } from '../engine/rng';
import { census, companiesIn, invalidateCensus, residents } from './census';
import { controller, cref, jailed, natref, player, today } from './query';
import { ageOf, bornYearsAgo, isAdult, seniority } from './growth';
import { autoAllocate, newCitizen, residentsFor } from './worldgen';
import { localNews } from './life';
import { quitJob } from './company';
import { transferCompany } from './companyMarket';
import { appointCabinetAI, callSpecialElection, fillDeputies, leaveParty } from './politics';
import { removeMember } from './crime';
import { leaveUnit } from './units';
import { cancelListing } from './market';
import { cancelOrder } from './fx';
import { cancelShareOrder } from './holdings';
import { closeContract } from './contracts';
import { activeCrises } from './dynamics';
import { applyCitizenship } from './travel';
import { fam, bereave, kidComesOfAge } from './family';
import { mourn } from './mentalHealth';
import { habitToll } from './habits';
import { sleepToll } from './everyday';
import { assignEducation } from './education';
import { conditionToll } from './health';

// ---------- health ----------

export const healthOf = (c: Citizen) => c.health ?? 90;

let sick: Set<Id> | null = null; // regions with an epidemic, for today's health update

/** The health a person of this age drifts toward in this place. */
function healthTarget(w: World, c: Citizen): number {
  const age = ageOf(w, c);
  const r = w.regions[c.home];
  let t = 96 - Math.max(0, age - 45) * 0.9 + r.bld.hospital * 2 + ((r.staff?.clinic ?? 0.6) - 0.6) * 8 - Math.max(0, r.pollution - 40) * 0.15;
  if (sick?.has(c.home)) t -= 15;
  if (hasQuirk(c, 'sporty')) t += 3;
  if (c.energy < 10) t -= 5; // exhausted and hungry
  t -= Math.max(0, (c.life?.stress ?? 25) - 65) * 0.3;
  t -= habitToll(c); // smoking and heavy drinking
  t -= sleepToll(w, c); // short nights
  t -= conditionToll(w, c); // illnesses and injuries // long strain wears people down
  if (c.life?.treated != null && today(w) - c.life.treated < B.goods.treatmentDays) t += B.goods.treatment; // under treatment
  return Math.max(5, Math.min(100, t));
}

export function healthLabel(h: number) {
  return h >= 85 ? 'excellent' : h >= 70 ? 'good' : h >= 50 ? 'fair' : h >= 30 ? 'poor' : 'failing';
}

/** Chance of dying today (NPCs; old age and ill health, compressed by the game's pace of life). */
export function mortality(w: World, c: Citizen): number {
  const age = ageOf(w, c);
  const yearly = 0.0003 * Math.exp(0.09 * (age - 30)) * (1 + Math.max(0, 60 - healthOf(c)) / 15);
  const medicine = 1 - Math.min(0.4, techFx(w.nations[c.nation]).lifespan); // medical technology lengthens lives
  return Math.min(0.2, (yearly * medicine) / (w.settings.lifeYearDays ?? 365));
}

// ---------- targets: how many people a region can hold ----------

function attractiveness(w: World, r: Region): number {
  const s = w.govs[r.id];
  const people = residents(w, r.id).filter((c) => !c.player);
  const idle = people.filter((c) => c.job == null && !c.retired && c.persona !== 'industrialist' && c.persona !== 'investor').length;
  const open = companiesIn(w, r.id).reduce((t, co) => t + (co.offer ? Math.max(0, co.offer.slots - co.workers.length) : 0), 0);
  let a = 0;
  a += Math.min(0.5, open / Math.max(4, people.length)) - Math.min(0.5, idle / Math.max(4, people.length));
  a -= (r.crime - 25) * 0.006 + (r.unrest - 15) * 0.008;
  a += ((s?.dev ?? 1) - 1) * 0.08 + ((s?.approval ?? 50) - 50) / 150;
  if (r.occ) a -= 0.6;
  if (r.disrupted > w.time) a -= 0.3;
  if (activeCrises(w).some((k) => k.regions.includes(r.id) && ['hurricane', 'earthquake', 'flood', 'wildfire', 'epidemic', 'riot'].includes(k.kind))) a -= 0.3;
  a -= Math.max(0, r.pollution - 50) * 0.005;
  if (r.pop0) a += Math.max(-0.3, Math.min(0.3, (r.pop / r.pop0 - 1) * 1.5)); // the background population moves too
  return Math.max(-1, Math.min(1, a));
}

/** Residents a region is heading toward (its "carrying capacity" for AI citizens). */
export function regionTarget(w: World, r: Region): number {
  const per = w.settings.citizensPerRegion;
  const base = residentsFor(per, EARTH.regions[r.id]?.popReal ?? 1e6);
  const t = base * 2 ** ((r.draw ?? 0) * 2);
  return Math.round(Math.max(Math.max(3, base * 0.4), Math.min(per * B.population.maxFactor, base * 4, t)));
}

// ---------- leaving the world ----------

/** People in the middle of a deal (auction, tournament, covert operation): they neither emigrate nor die until it closes. */
function busyIds(w: World): Set<Id> {
  const s = new Set<Id>();
  for (const a of Object.values(w.auctions)) if (a.status === 'open') { s.add(a.seller); if (a.bid) s.add(a.bid.by); }
  for (const t of Object.values(w.tournaments)) if (t.status !== 'finished') for (const id of t.entrants) s.add(id);
  for (const o of Object.values(w.ops)) if (o.status === 'active' && o.agent != null) s.add(o.agent);
  return s;
}
const openDeals = (w: World, c: Citizen) => busyIds(w).has(c.id);

export function holdsOffice(w: World, c: Citizen): boolean {
  const n = w.nations[c.nation];
  if (n.president === c.id || n.deputies.includes(c.id) || Object.values(n.cabinet).includes(c.id) || n.defense.chief === c.id) return true;
  if (w.govs.some((s) => s && (s.head.cit === c.id || s.candidates.some((x) => x.cit === c.id)))) return true;
  if (Object.values(w.elections).some((e) => !e.done && e.candidates.includes(c.id))) return true;
  if (Object.values(w.parties).some((p) => p.leader === c.id)) return true;
  if (Object.values(w.forces).some((f) => f.commander === c.id)) return true;
  if (c.unit != null && w.units[c.unit]?.commander === c.id) return true;
  if (c.sec.syndicate != null && w.syndicates[c.sec.syndicate]?.boss === c.id) return true;
  return false;
}

function ownsThings(w: World, c: Citizen): boolean {
  return Object.values(w.companies).some((co) => co.owner.k === 'cit' && co.owner.id === c.id)
    || Object.values(w.papers).some((p) => p.owner.k === 'cit' && p.owner.id === c.id)
    || Object.values(w.holdings).some((h) => h.ceo === c.id || h.founder === c.id || (h.shares[c.id] ?? 0) > 0);
}

/** Can this person pack up and leave the country? */
export function canEmigrate(w: World, c: Citizen): boolean {
  if (c.player || c.gone || jailed(w, c) || !isAdult(w, c)) return false;
  const f = c.family;
  if (f?.partner != null && w.citizens[f.partner]?.player) return false;
  if (f && [...f.parents, ...f.children].some((id) => w.citizens[id]?.player)) return false;
  return !holdsOffice(w, c) && !ownsThings(w, c) && !openDeals(w, c) && !w.inbox.some((m) => !m.resolved && m.from === c.id);
}

/** Who inherits: partner, then adult children, then parents; otherwise the state. */
export function heirOf(w: World, c: Citizen): Citizen | null {
  const f = c.family;
  if (!f) return null;
  const alive = (id: Id | null | undefined) => (id != null && w.citizens[id] && !w.citizens[id].gone ? w.citizens[id] : null);
  if (f.status === 'married') { const p = alive(f.partner); if (p) return p; }
  const kids = f.children.map(alive).filter(Boolean) as Citizen[];
  if (kids.length) return kids.sort((a, b) => a.born - b.born)[0];
  for (const id of f.parents) { const p = alive(id); if (p) return p; }
  return null;
}

/** Step down from every role, vacating offices so they are refilled. */
export function releaseRoles(w: World, c: Citizen, why: string) {
  const n = w.nations[c.nation];
  if (c.job != null) quitJob(w, c, true);
  if (c.party != null) leaveParty(w, c);
  if (c.unit != null) leaveUnit(w, c);
  if (c.sec.syndicate != null && w.syndicates[c.sec.syndicate]) removeMember(w, w.syndicates[c.sec.syndicate], c);
  c.sec.police = null; c.sec.agency = null; c.sec.asset = null;
  for (const f of Object.values(w.forces)) if (f.commander === c.id) f.commander = null;
  if (n.defense.chief === c.id) n.defense.chief = null;
  if (c.mil.branch) c.mil = { branch: null, rank: 0, sp: 0, since: 0, lastDuty: -1, commands: 0 };
  let cabinet = false;
  for (const [k, v] of Object.entries(n.cabinet)) if (v === c.id) { delete (n.cabinet as Record<string, Id>)[k]; cabinet = true; }
  if (n.deputies.includes(c.id)) fillDeputies(w, n);
  n.deputies = n.deputies.filter((x) => x !== c.id);
  if (n.president === c.id) {
    n.president = null;
    record(w, 'politics', `🏛️ ${n.name} is without a ${n.leader.toLowerCase()}: ${c.name} ${why}. A special election is called.`, { nation: n.id, important: true });
    callSpecialElection(w, n);
  }
  if (cabinet && n.president != null) appointCabinetAI(w, n);
  for (const e of Object.values(w.elections)) if (!e.done) e.candidates = e.candidates.filter((x) => x !== c.id);
  for (const s of w.govs) if (s) s.candidates = s.candidates.filter((x) => x.cit !== c.id); // a head in office is replaced by the daily check
  for (const x of Object.values(w.nations)) x.requests = x.requests.filter((r) => r.cit !== c.id);
  for (const k of Object.values(w.cases)) {
    if (k.status !== 'open') continue;
    if (k.suspect === c.id) { k.status = 'closed'; k.outcome = `closed: the suspect ${why}`; }
    if (k.detective === c.id) k.detective = null;
  }
  for (const h of Object.values(w.holdings)) for (const [role, id] of Object.entries(h.roles)) if (id === c.id) delete (h.roles as Record<string, Id>)[role];
  // Open offers on the markets are withdrawn (goods and money return to them first).
  for (const l of Object.values(w.listings)) if (l.seller.k === 'cit' && l.seller.id === c.id) cancelListing(w, c.id, l.id);
  for (const o of Object.values(w.fx)) if (o.maker.k === 'cit' && o.maker.id === c.id) cancelOrder(w, c.id, o.id);
  for (const o of Object.values(w.shareOrders)) if (o.seller.k === 'cit' && o.seller.id === c.id) cancelShareOrder(w, c, o.id);
  for (const ct of Object.values(w.contracts)) if (ct.status === 'open' && (ct.from === c.id || ct.to === c.id)) closeContract(w, c.id, ct.id, ct.from === c.id ? 'cancelled' : 'rejected');
  for (const m of w.inbox) if (!m.resolved && m.from === c.id) m.resolved = 'expired';
  for (const p of Object.values(w.papers)) p.subs = p.subs.filter((x) => x !== c.id);
}

/** Pass everything someone owns to their heir, or to the state. */
export function settleEstate(w: World, c: Citizen, heir: Citizen | null) {
  settleWill(w, c, heir); // inheritance tax, bequests, trusts for children, heirlooms
  const to = heir ? cref(heir.id) : natref(controller(w.regions[c.home]));
  const from = cref(c.id);
  for (const [asset, amt] of Object.entries(c.wallet)) if (amt > 0) pay(w, from, to, asset, amt, heir ? `Inheritance from ${c.name}` : `Estate of ${c.name}`);
  for (const [key, n] of Object.entries(c.inv)) if (n > 0) moveItems(w, from, to, key, n);
  for (const co of Object.values(w.companies)) if (co.owner.k === 'cit' && co.owner.id === c.id) transferCompany(w, co, to);
  for (const p of Object.values(w.papers)) if (p.owner.k === 'cit' && p.owner.id === c.id) p.owner = to;
  for (const gear of Object.values(w.gear)) if (gear.owner?.k === 'cit' && gear.owner.id === c.id) gear.owner = heir ? cref(heir.id) : null;
  for (const h of Object.values(w.holdings)) {
    const q = h.shares[c.id] ?? 0;
    if (q > 0) { delete h.shares[c.id]; if (heir) h.shares[heir.id] = (h.shares[heir.id] ?? 0) + q; else h.total -= q; }
    if (h.ceo === c.id || h.founder === c.id) {
      const top = Object.entries(h.shares).map(([id, q]) => ({ id: +id, q })).filter((x) => w.citizens[x.id] && !w.citizens[x.id].gone).sort((a, b) => b.q - a.q || a.id - b.id)[0];
      if (h.ceo === c.id && top) h.ceo = top.id;
    }
  }
}

/** Someone dies. Their family grieves, their estate passes on, their roles fall vacant. */
export function die(w: World, c: Citizen, cause: string) {
  if (c.gone || c.player) return;
  const heir = heirOf(w, c);
  releaseRoles(w, c, 'died');
  settleEstate(w, c, heir);
  mourn(w, c);
  funeral(w, c, heir);
  bereave(w, c);
  c.gone = { t: w.time, why: 'died', note: cause };
  invalidateCensus(w);
  const age = ageOf(w, c);
  localNews(w, c.home, `🕯️ ${c.name} has died, aged ${age} (${cause}).${heir ? ` ${heir.name} inherits.` : ''}`);
  const p = player(w);
  const close = (c.rel[p.id] ?? 0) >= 30 || (p.rel[c.id] ?? 0) >= 30 || c.family?.partner === p.id || c.family?.children.includes(p.id) || c.family?.parents.includes(p.id);
  if (close) notify(w, 'personal', `🕯️ ${c.name} has died, aged ${age} (${cause}).${heir?.id === p.id ? ' You inherit their estate.' : ''}`, { critical: true, link: 'people' });
  if (c.influence > 40 || close) record(w, 'people', `🕯️ ${c.name} died in ${w.regions[c.home].name}, aged ${age}.`, { cit: c.id, nation: c.nation, important: c.influence > 60 });
}

/** Someone emigrates abroad (outside the modelled world). They take their savings with them. */
export function leaveAbroad(w: World, c: Citizen, why: string) {
  if (!canEmigrate(w, c)) return false;
  const party = [c, ...(c.family?.status === 'married' && c.family.partner != null && canEmigrate(w, w.citizens[c.family.partner]) ? [w.citizens[c.family.partner]] : [])];
  const where = pick(w, ['Europe', 'South America', 'Africa', 'Southeast Asia', 'the Middle East', 'Oceania', 'the Caribbean', 'Central Asia']);
  for (const x of party) {
    releaseRoles(w, x, 'emigrated');
    for (const [asset, amt] of Object.entries(x.wallet)) if (amt > 0) burn(w, cref(x.id), asset, amt, 'Emigrated abroad');
    for (const [key, n] of Object.entries(x.inv)) if (n > 0) consume(w, cref(x.id), key, n, 'emigrated');
    for (const gear of Object.values(w.gear)) if (gear.owner?.k === 'cit' && gear.owner.id === x.id) gear.owner = null;
    x.gone = { t: w.time, why: 'emigrated', note: `moved to ${where} ${why}` };
  }
  invalidateCensus(w);
  localNews(w, c.home, `✈️ ${party.map((x) => x.name).join(' and ')} emigrated to ${where}, ${why}.`);
  const p = player(w);
  for (const x of party) if ((x.rel[p.id] ?? 0) >= 30) notify(w, 'people', `✈️ ${x.name} emigrated to ${where}, ${why}.`);
  return true;
}

// ---------- arrivals ----------

const PERSONAS: [Persona, number][] = [['worker', 42], ['soldier', 12], ['industrialist', 6], ['merchant', 9], ['politician', 8], ['builder', 10], ['journalist', 6], ['investor', 7]];

/** A new adult resident (coming of age, moving in, arriving from abroad). */
export function newResident(w: World, nation: Nation, rid: Id, opts: { name?: string; age?: number; ideo?: Ideology; persona?: Persona; savings?: number; origin?: string; funded?: boolean } = {}): Citizen {
  const pool = NAME_POOLS[nation.cur];
  const name = opts.name ?? `${pick(w, pool.first)} ${pick(w, pool.last)}`;
  const persona = opts.persona ?? weighted(w, PERSONAS, (x) => x[1])![0];
  const c = newCitizen(w, name, nation.id, rid, persona, opts.ideo ?? pick(w, IDEOLOGY_LIST));
  c.born = bornYearsAgo(w, opts.age ?? 18, randInt(w, 0, 300));
  autoAllocate(c, 2 + seniority(w, c) * rand(w, 0.8, 1.6));
  c.eco = +(1 + seniority(w, c) * rand(w, 0.05, 0.2)).toFixed(2);
  c.influence = Math.round(rand(w, 0, 5) + seniority(w, c) * 0.3);
  c.health = Math.round(rand(w, 80, 98) - Math.max(0, ageOf(w, c) - 45) * 0.6);
  c.energy = rand(w, 50, 100);
  c.family = { partner: null, status: 'single', since: w.time, parents: [], children: [], kids: [], exes: [] };
  w.citizens[c.id] = c;
  invalidateCensus(w);
  if (!opts.funded) { // a newcomer brings savings from outside; someone growing up here is given a start by family instead
    const savings = opts.savings ?? randInt(w, 20, 90) * (1 + seniority(w, c) / 10);
    mint(w, cref(c.id), nation.cur, cur(savings), 'Arrival savings');
    mint(w, cref(c.id), GOLD, g(rand(w, 0.2, 1.5)), 'Arrival savings');
  }
  produce(w, cref(c.id), 'food:1', randInt(w, 2, 6), 'arrival');
  assignEducation(w, c);
  return c;
}

/** A young adult from one of the region's background families comes of age. */
function localComesOfAge(w: World, r: Region) {
  const n = w.nations[r.owner];
  const c = newResident(w, n, r.id, { age: 18 });
  localNews(w, r.id, `🎓 ${c.name} came of age and is starting out in ${r.name}.`);
  return c;
}

function immigrant(w: World, r: Region) {
  const n = w.nations[controller(r)];
  const origin = chance(w, 0.5) ? pick(w, w.nations.filter((x) => x.id !== n.id)) : null;
  const from = origin ? origin.name : pick(w, ['Europe', 'South America', 'Africa', 'Southeast Asia', 'the Middle East', 'Oceania', 'the Caribbean', 'Central Asia']);
  const pool = NAME_POOLS[(origin ?? n).cur];
  const name = `${pick(w, pool.first)} ${pick(w, pool.last)}`;
  const c = newResident(w, n, r.id, { name, age: randInt(w, 20, 45), savings: randInt(w, 60, 250) });
  localNews(w, r.id, `🧳 ${c.name} arrived from ${from} to start a new life in ${r.name}.`);
  if (c.nation === player(w).nation) record(w, 'people', `🧳 ${c.name} immigrated from ${from} to ${r.name}.`, { cit: c.id, nation: c.nation });
  // Couples often come together.
  if (chance(w, 0.3)) {
    // A partner they are drawn to (names carry sex: even entries are men's, odd women's).
    const want = (orientationOf(c) === 'gay') === (sexOf(w, c) === 'm') ? 0 : 1;
    const firsts = pool.first.filter((_, i) => i % 2 === want);
    const d = newResident(w, n, r.id, { name: `${pick(w, firsts.length ? firsts : pool.first)} ${name.split(' ').slice(-1)[0]}`, age: Math.max(18, ageOf(w, c) + randInt(w, -5, 5)), savings: randInt(w, 30, 150) });
    const st = marriageBar(w, c, d, n) ? 'dating' : 'married';
    fam(c).partner = d.id; fam(c).status = st; fam(d).partner = c.id; fam(d).status = st;
    fam(c).since = fam(d).since = bornYearsAgo(w, randInt(w, 1, 10), randInt(w, 0, 300));
  }
  return c;
}

// ---------- moving ----------

function moveHome(w: World, c: Citizen, to: Id, why: string) {
  const from = c.home;
  if (from === to) return;
  if (c.job != null) quitJob(w, c, true);
  c.home = to; c.loc = to; c.mineSite = to; c.trip = null;
  if (c.sec.police != null) c.sec.police = null;
  localNews(w, from, `🧳 ${c.name} moved away to ${w.regions[to].name}, ${why}.`);
  localNews(w, to, `👋 ${c.name} moved here from ${w.regions[from].name}, ${why}.`);
}

/** Move someone (and their household) to another region; across borders they apply for citizenship. */
export function relocate(w: World, c: Citizen, to: Id, why: string) {
  const house = [c, ...(c.family?.status === 'married' && c.family.partner != null ? [w.citizens[c.family.partner]].filter((x) => x && !x.gone && !x.player && canEmigrate(w, x)) : [])];
  for (const x of house) moveHome(w, x, to, why);
  invalidateCensus(w);
  const nat = controller(w.regions[to]);
  if (nat !== c.nation) for (const x of house) if ((x.wallet[GOLD] ?? 0) >= g(B.citizenship.cost)) applyCitizenship(w, x, nat);
}

// ---------- the daily cycle ----------

const PUSH = ['for work', 'for a fresh start', 'to be nearer family', 'for a better life', 'looking for opportunity'];

export function populationDaily(w: World) {
  const d = today(w);
  const all = census(w).all;
  sick = new Set(activeCrises(w).filter((k) => k.kind === 'epidemic').flatMap((k) => k.regions));
  // Health, ageing bodies and retirement.
  for (const c of all) {
    const h = healthOf(c);
    c.health = Math.round((h + (healthTarget(w, c) - h) * 0.04 + rand(w, -0.6, 0.6)) * 10) / 10;
    const age = ageOf(w, c);
    if (age > 62 && (c.id + d) % 7 === 0) { const k = 1 - 0.0015 * (age - 62) / 10; c.attrs.str = +(c.attrs.str * k).toFixed(3); c.attrs.end = +(c.attrs.end * k).toFixed(3); }
    if (c.player) continue;
    // Retirement and pensions: sim/pensions.ts (around each country's pension age).
  }
  // Deaths (old age, illness). People in the middle of a deal are spared until it closes.
  const busy = busyIds(w);
  const pl = player(w);
  if (w.settings.playerMortality && !pl.gone && chance(w, mortality(w, pl))) playerDies(w, healthOf(pl) < 40 ? 'after an illness' : ageOf(w, pl) >= 75 ? 'of old age' : 'suddenly', { releaseRoles, settleEstate, bereave });
  for (const c of all) {
    if (c.player || c.gone || busy.has(c.id)) continue;
    if (chance(w, mortality(w, c))) die(w, c, healthOf(c) < 40 ? 'after an illness' : ageOf(w, c) >= 75 ? 'of old age' : 'suddenly');
  }
  // Children growing up in local families come of age.
  for (const c of all) {
    const f = c.family;
    if (!f?.kids.length) continue;
    for (const k of [...f.kids]) if (ageOf(w, k) >= B.life.adultAge) kidComesOfAge(w, c, k);
  }
  // Regions: how attractive they are, and people coming and going accordingly.
  let targetSum = 0, baseSum = 0;
  const plans: { r: Region; target: number; n: number; locals: Citizen[] }[] = [];
  for (const r of w.regions) {
    if (w.nations[r.owner]?.exile && !r.occ) continue;
    r.draw = Math.round(((r.draw ?? 0) * 0.95 + attractiveness(w, r) * 0.05) * 1000) / 1000;
    const target = regionTarget(w, r);
    const locals = residents(w, r.id).filter((c) => !c.player);
    const n = locals.length;
    targetSum += target; baseSum += residentsFor(w.settings.citizensPerRegion, EARTH.regions[r.id]?.popReal ?? 1e6);
    plans.push({ r, target, n, locals });
  }
  const squeeze = Math.min(1, (baseSum * B.population.worldCap) / Math.max(1, targetSum)); // keep the world a playable size
  // (Residents were listed up front: arrivals below change the census, which is rebuilt once at the end.)
  for (const { r, target: t0, n, locals: people } of plans) {
    const target = Math.max(3, Math.round(t0 * squeeze));
    const gap = (target - n) / Math.max(4, target);
    const rate = B.population.churn;
    // Arrivals: local young adults and newcomers from abroad, more where the region is growing.
    const inflow = target * rate * (1 + Math.max(0, gap) * 5);
    if (chance(w, Math.min(0.9, inflow * 0.55))) localComesOfAge(w, r);
    if (chance(w, Math.min(0.9, inflow * 0.45)) && !r.occ) immigrant(w, r);
    // Departures: people leave shrinking or troubled places for better ones.
    const outflow = n <= Math.max(3, target * 0.5) ? 0 : rate * (gap > 0.25 ? 0.4 : 1) * (1 + Math.max(0, -gap) * 5 + Math.max(0, -(r.draw ?? 0)) * 3);
    for (const c of outflow > 0 ? people : []) {
      if (c.gone || c.home !== r.id || !chance(w, outflow * (1 + Math.max(0, 40 - (c.life?.happiness ?? 60)) / 40))) continue;
      if (!canEmigrate(w, c)) continue;
      const nat = controller(r);
      const roll = next3(w);
      if (roll < 0.6) {
        // Somewhere better in the same country.
        const dest = weighted(w, plans.filter((x) => x.r.id !== r.id && controller(x.r) === nat && x.target > x.n), (x) => (x.target - x.n) * (1 + Math.max(0, x.r.draw ?? 0)));
        if (dest) { relocate(w, c, dest.r.id, pick(w, PUSH)); continue; }
      }
      if (roll < 0.8) {
        // Another country in the modelled world.
        const dest = weighted(w, plans.filter((x) => controller(x.r) !== nat && !w.nations[controller(x.r)].exile && x.target > x.n + 2 && (x.r.draw ?? 0) > (r.draw ?? 0) + 0.2), (x) => x.target - x.n);
        if (dest) { relocate(w, c, dest.r.id, pick(w, PUSH)); continue; }
      }
      leaveAbroad(w, c, pick(w, PUSH));
    }
  }
  invalidateCensus(w);
}

const next3 = (w: World) => rand(w, 0, 1);

/** Genesis: health and ages already set; regions remember their starting size. */
export function initPopulation(w: World) {
  for (const r of w.regions) { r.pop0 = r.pop; r.draw = 0; }
  for (const c of census(w).all) if (c.health == null) c.health = Math.round(Math.max(20, Math.min(99, 97 - Math.max(0, ageOf(w, c) - 40) * 0.7 + rand(w, -10, 3))));
  w.calendar.basePop = census(w).all.length;
}

