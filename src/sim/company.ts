// Companies, employment and production chains. A shift consumes energy, inputs
// and wage funds, and creates goods; it refuses to run (with a reason) when
// labour, funds, inputs or storage capacity are missing.
import type { AccountRef, Citizen, Company, DayRecord, Id, Industry, World } from './types';
import { B } from '../data/balance';
import { INDUSTRY_INFO, INPUT_OF, itemName, outputKey, weightOf } from '../data/items';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { acct, burn, consume, freeCap, moveItems, pay, produce } from '../engine/ledger';
import { GOLD, fmtAmt, g } from '../engine/money';
import { DAY } from '../engine/clock';
import { nid, notify, record } from '../engine/events';
import { authorize } from './authority';
import { addXp } from './citizen';
import { companyCurrency, controller, coref, cref, effEco, natref, seatShare, studyActive, today, jailed } from './query';
import { remitWorkTax, workTaxFor } from './taxes';
import { infraBonus } from './stategov';
import { crisisFactor } from './dynamics';
import { bump } from './progress';
import { pick } from '../engine/rng';
import { addPoints } from './construction';
import { list as listFn } from './market';
import { COMPANY_SUFFIX, COMPANY_WORDS } from '../data/names';

export const isRawIndustry = (ind: Industry) => INDUSTRY_INFO[ind].raw;

export function emptyDay(day: number): DayRecord {
  return { day, produced: 0, consumed: 0, sold: 0, revenue: 0, wages: 0, inputCost: 0, profit: 0 };
}

export function companyName(w: World, ind: Industry) {
  const kind = INDUSTRY_INFO[ind].name.split(' ')[0];
  return `${pick(w, COMPANY_WORDS.filter((x) => x !== kind))} ${kind} ${pick(w, COMPANY_SUFFIX)}`;
}

export function createCompany(w: World, owner: AccountRef, ind: Industry, q: number, region: Id, name?: string): Company {
  const co: Company = {
    id: nid(w), name: name || companyName(w, ind), industry: ind, q, region, owner,
    wallet: {}, inv: {}, workers: [], offer: null, prices: {}, frac: 0, founded: w.time, moveCooldown: 0,
    forSale: null, hist: [], today: emptyDay(today(w)), lifetime: { produced: 0, revenue: 0, wages: 0, profit: 0 },
    ownerHist: [{ t: w.time, owner }], shortage: null, auto: { sell: owner.k !== 'cit' || owner.id !== w.playerId, buyInputs: false, hire: false },
  };
  w.companies[co.id] = co;
  return co;
}

/** Production multipliers for a shift, with a human-readable breakdown. */
export function productionFactors(w: World, co: Company, worker: Citizen | null) {
  const r = w.regions[co.region];
  const raw = isRawIndustry(co.industry);
  const f: { label: string; mult: number }[] = [];
  if (raw) {
    f.push({ label: `Quality Q${co.q}`, mult: B.company.rawQualityMult[co.q - 1] });
    const rich = r.res[co.industry as keyof typeof r.res] ?? 0;
    f.push({ label: rich ? `Region richness ${rich}` : 'Region lacks this resource', mult: B.company.richness[rich] });
    if (r.bld.fields) f.push({ label: `Production Fields L${r.bld.fields}`, mult: 1 + r.bld.fields * B.buildings.fieldsRaw });
  } else if (r.bld.industrial) f.push({ label: `Industrial Zone L${r.bld.industrial}`, mult: 1 + r.bld.industrial * B.buildings.industrialFactory });
  if (worker) f.push({ label: `Economic skill ${effEco(w, worker).toFixed(1)}`, mult: 1 + effEco(w, worker) * B.company.ecoFactor });
  if (worker && co.owner.k === 'cit' && co.owner.id !== worker.id) {
    const lead = w.citizens[co.owner.id]?.attrs.lead ?? 0;
    if (lead) f.push({ label: `Owner leadership ${lead}`, mult: 1 + (lead * B.attrs.lead) / 100 });
  }
  if (r.pollution > 0.005) f.push({ label: `Pollution ${Math.round(r.pollution * 100)}%`, mult: Math.max(0.1, 1 - B.pollution.formula * r.pollution) });
  const n = w.nations[controller(r)];
  const share = seatShare(w, n);
  const ideo = co.state ? (share.socialism ?? 0) * IDEOLOGIES.socialism.fx.stateProduction : (share.capitalism ?? 0) * IDEOLOGIES.capitalism.fx.production;
  if (ideo) f.push({ label: co.state ? 'Socialist state production' : 'Capitalist production', mult: 1 + ideo });
  if (r.crime > 50) f.push({ label: `Crime ${Math.round(r.crime)}`, mult: 1 - (r.crime - 50) / 250 });
  if (r.disrupted > w.time) f.push({ label: 'Regional disruption (disaster, riot or sabotage)', mult: 0.6 });
  if (r.blockade != null) f.push({ label: `Naval blockade by ${w.nations[r.blockade].name}`, mult: 1 - B.forces.blockade });
  const shock = raw ? w.econ.commodity[co.industry] ?? 1 : 1;
  if (shock !== 1) f.push({ label: shock > 1 ? `World ${co.industry} boom` : `World ${co.industry} supply shock`, mult: shock });
  const crisis = crisisFactor(w, co.region, co.industry);
  if (crisis) f.push(crisis);
  const infra = infraBonus(w, co.region);
  if (infra > 1 && !r.occ) f.push({ label: `State infrastructure L${w.govs[co.region]!.dev}`, mult: infra });
  const depotLvl = depotBonusFor(w, co);
  if (depotLvl) f.push({ label: `Resource depots (${depotLvl})`, mult: 1 + depotLvl * B.pirates.depotBonus });
  if (worker && studyActive(w, worker, 'hustler')) f.push({ label: 'Hustler study', mult: 1.1 });
  if (worker && !worker.player && co.owner.k === 'cit' && w.citizens[co.owner.id] && studyActive(w, w.citizens[co.owner.id], 'npcrise')) f.push({ label: 'NPC Rise study (owner)', mult: 1.1 });
  if (co.forSale !== null) f.push({ label: 'Listed for sale', mult: 1 - B.company.listedPenalty });
  const mult = f.reduce((m, x) => m * x.mult, 1);
  return { factors: f, mult };
}

/** Depot levels held by the nation of the company's owner (pirate event reward). */
function depotBonusFor(w: World, co: Company): number {
  let nat: Id | null = null;
  if (co.owner.k === 'cit') nat = w.citizens[co.owner.id]?.nation ?? null;
  else if (co.owner.k === 'hold') nat = w.holdings[co.owner.id]?.nation ?? null;
  else if (co.owner.k === 'nat') nat = co.owner.id;
  if (nat == null) return 0;
  let lv = 0;
  for (const e of Object.values(w.events)) if (e.status === 'active') for (const s of e.ships) if (s.holder === nat) lv += s.depot;
  return lv;
}

export function baseUnits(co: Company) {
  if (isRawIndustry(co.industry)) return B.company.rawPerShift;
  return (B.company.recipes as any)[co.industry].perShift as number;
}
export function inputPerUnit(co: Company) {
  if (isRawIndustry(co.industry)) return 0;
  return ((B.company.recipes as any)[co.industry].perQ as number) * co.q;
}
export const inputKey = (co: Company) => (isRawIndustry(co.industry) ? null : INPUT_OF[co.industry as keyof typeof INPUT_OF]);

/** Expected output of one shift (fractional). */
export function shiftPreview(w: World, co: Company, worker: Citizen | null, extra = 1) {
  const { factors, mult } = productionFactors(w, co, worker);
  const units = baseUnits(co) * mult * extra;
  return { units, factors, key: outputKey(co.industry, co.q), inputKey: inputKey(co), inputPer: inputPerUnit(co) };
}

/** Reasons a shift cannot run (null = OK). */
export function productionBlock(w: World, co: Company, units: number): string | null {
  if (co.halt && co.halt.until > w.time) return `${co.halt.why} (until day ${Math.floor(co.halt.until / 1440)}, ${String(Math.floor((co.halt.until % 1440) / 60)).padStart(2, '0')}:00).`;
  const whole = Math.max(1, Math.floor(units + co.frac));
  const ik = inputKey(co);
  if (ik) {
    const need = inputPerUnit(co);
    if ((co.inv[ik] ?? 0) < need) return `Out of ${itemName(ik)} (needs ${need} per unit).`;
  }
  const key = outputKey(co.industry, co.q);
  if (freeCap(w, coref(co.id)) < weightOf(key) * whole) return 'Company storage is full.';
  return null;
}

/** Run production for a shift; returns units actually produced. */
function runProduction(w: World, co: Company, unitsF: number, why: string): number {
  let total = unitsF + co.frac;
  let units = Math.floor(total);
  const ik = inputKey(co);
  if (ik) {
    const per = inputPerUnit(co);
    units = Math.min(units, Math.floor((co.inv[ik] ?? 0) / per));
    if (units > 0) {
      consume(w, coref(co.id), ik, units * per, 'production input');
      co.today.consumed += units * per;
    }
  }
  const key = outputKey(co.industry, co.q);
  units = Math.min(units, Math.floor(freeCap(w, coref(co.id)) / weightOf(key)));
  if (units > 0) produce(w, coref(co.id), key, units, why);
  co.frac = Math.max(0, Math.min(0.999, total - Math.floor(total)));
  co.today.produced += units;
  co.lifetime.produced += units;
  if (units > 0 && co.auto.sell) autoList(w, co);
  // pollution record
  const r = w.regions[co.region];
  const wgt = isRawIndustry(co.industry) ? B.pollution.weights.raw : B.pollution.weights.finished;
  r.prodWindow[r.prodWindow.length - 1] += units * wgt;
  return units;
}

// ---------- employment ----------
export function netWage(w: World, co: Company, worker: Citizen) {
  const gross = co.offer?.wage ?? 0;
  const t = workTaxFor(w, co.region, worker, gross);
  return { gross, tax: t.tax, net: gross - t.tax, rate: t.rate, stateRate: t.stateRate, natRate: t.natRate };
}

export function shiftCheck(w: World, c: Citizen): string | null {
  if (jailed(w, c)) return 'You are in prison.';
  if (c.job == null) return 'You have no job. Find one on the job market.';
  const co = w.companies[c.job];
  if (!co) return 'Your employer no longer exists.';
  if (c.lastWorkDay === today(w)) return 'You already worked a shift today (one per day).';
  if (c.energy < B.cost.work) return `Not enough energy (${Math.floor(c.energy)}/${B.cost.work}).`;
  if (controller(w.regions[c.loc]) !== controller(w.regions[co.region])) return `You must be in ${w.nations[controller(w.regions[co.region])].name} to work there.`;
  const cur = companyCurrency(w, co);
  const wage = co.offer?.wage ?? 0;
  if ((co.wallet[cur] ?? 0) < wage) return `${co.name} cannot pay wages right now (insufficient ${cur}).`;
  const prev = shiftPreview(w, co, c);
  return productionBlock(w, co, prev.units);
}

/** Employee shift: produce, get paid (minus work tax), grow economic skill. */
export function workShift(w: World, c: Citizen): Result {
  const why = shiftCheck(w, c);
  if (why) {
    if (c.job != null && w.companies[c.job]) w.companies[c.job].shortage = why;
    return fail(why);
  }
  const co = w.companies[c.job!];
  const cur = companyCurrency(w, co);
  const prev = shiftPreview(w, co, c);
  c.energy -= B.cost.work;
  const made = runProduction(w, co, prev.units, 'shift output');
  const gross = co.offer?.wage ?? 0;
  const t = workTaxFor(w, co.region, c, gross);
  pay(w, coref(co.id), cref(c.id), cur, gross, `Wage from ${co.name}`);
  remitWorkTax(w, cref(c.id), cur, t.parts);
  co.today.wages += gross;
  co.lifetime.wages += gross;
  co.shortage = null;
  c.lastWorkDay = today(w);
  c.incomeToday += gross - t.tax;
  c.eco = +(c.eco + B.eco.gainBase / (1 + c.eco / 5)).toFixed(3);
  addXp(w, c, B.xp.work);
  if (c.player) bump(w, 'work');
  return ok(`Worked at ${co.name}: produced ${made} ${itemName(outputKey(co.industry, co.q))}, earned ${fmtAmt(cur, gross - t.tax)} net (${fmtAmt(cur, t.tax)} tax${t.stateRate ? `, incl. ${t.stateRate}% ${w.regions[co.region].name} state tax` : ''}).`);
}

export function applyCheck(w: World, c: Citizen, co: Company | undefined): string | null {
  if (jailed(w, c)) return 'You are in prison.';
  if (!co) return 'Company not found.';
  if (!co.offer || co.offer.slots <= co.workers.length) return 'No open positions.';
  if (effEco(w, c) < co.offer.minEco) return `Requires economic skill ${co.offer.minEco} (you have ${effEco(w, c).toFixed(1)}).`;
  if (c.job === co.id) return 'You already work here.';
  if (co.owner.k === 'cit' && co.owner.id === c.id) return 'Use “Work as manager” in your own company.';
  if (controller(w.regions[c.loc]) !== controller(w.regions[co.region])) return `You must be located in ${w.nations[controller(w.regions[co.region])].name}.`;
  const cur = companyCurrency(w, co);
  if ((co.wallet[cur] ?? 0) < co.offer.wage) return 'Employer lacks wage funds (offer unavailable).';
  return null;
}

export function applyJob(w: World, c: Citizen, coId: Id): Result {
  const co = w.companies[coId];
  const why = applyCheck(w, c, co);
  if (why) return fail(why);
  if (c.job != null) quitJob(w, c, true);
  co.workers.push(c.id);
  c.job = co.id;
  c.jobSince = w.time;
  if (c.player) { bump(w, 'job'); record(w, 'job', `${c.name} joined ${co.name}.`, { cit: c.id, player: true }); }
  const cur = companyCurrency(w, co);
  return ok(`Hired at ${co.name} for ${fmtAmt(cur, co.offer!.wage)} gross per shift.`);
}

export function quitJob(w: World, c: Citizen, silent = false): Result {
  if (c.job == null) return fail('You are not employed.');
  const co = w.companies[c.job];
  if (co) co.workers = co.workers.filter((x) => x !== c.id);
  c.job = null;
  return ok(silent ? '' : 'You resigned.');
}

export function fire(w: World, actor: Id, coId: Id, workerId: Id): Result {
  const co = w.companies[coId];
  if (!co) return fail('Company not found.');
  const auth = authorize(w, actor, coref(coId), 'manage');
  if (auth) return fail(auth);
  const c = w.citizens[workerId];
  if (!c || c.job !== coId) return fail('Not an employee.');
  co.workers = co.workers.filter((x) => x !== workerId);
  c.job = null;
  if (c.player) notify(w, 'economy', `You were dismissed by ${co.name}.`, { link: 'jobs' });
  return ok(`${c.name} dismissed.`);
}

export function setOffer(w: World, actor: Id, coId: Id, wage: number, slots: number, minEco: number): Result {
  const co = w.companies[coId];
  if (!co) return fail('Company not found.');
  const auth = authorize(w, actor, coref(coId), 'manage');
  if (auth) return fail(auth);
  const n = w.nations[controller(w.regions[co.region])];
  if (slots < 0 || !Number.isInteger(slots)) return fail('Invalid number of positions.');
  if (slots > 0 && wage < n.minWage) return fail(`Wage must be at least the minimum wage (${fmtAmt(n.cur, n.minWage)}).`);
  const max = B.company.maxWorkers[co.q - 1];
  if (slots > max) return fail(`A Q${co.q} company can employ at most ${max}.`);
  co.offer = slots > 0 || co.workers.length ? { wage: Math.round(wage), slots, minEco: Math.max(0, minEco) } : null;
  // Workers beyond the new slot count are let go (most recent first).
  while (co.offer && co.workers.length > co.offer.slots) {
    const id = co.workers.pop()!;
    w.citizens[id].job = null;
    if (w.citizens[id].player) notify(w, 'economy', `${co.name} cut positions; you lost your job.`, { link: 'jobs' });
  }
  return ok('Job offer updated.');
}

// ---------- owner operations ----------
export function managerCost(c: Citizen, w: World) {
  const n = c.mgrShiftsDay === today(w) ? c.mgrShifts : 0;
  const costs = B.company.managerCosts;
  let cost = g(costs[Math.min(n, costs.length - 1)]);
  if (n >= costs.length) cost = g(costs[costs.length - 1] * 2 ** (n - costs.length + 1));
  if (studyActive(w, c, 'specialtouch')) cost = Math.round(cost * 0.75);
  return cost;
}

export function managerCheck(w: World, actor: Citizen, co: Company | undefined): string | null {
  if (!co) return 'Company not found.';
  const auth = authorize(w, actor.id, coref(co.id), 'produce');
  if (auth) return auth;
  if (actor.energy < B.cost.manager) return `Not enough energy (${Math.floor(actor.energy)}/${B.cost.manager}).`;
  const cost = managerCost(actor, w);
  if ((actor.wallet[GOLD] ?? 0) < cost) return `This manager shift costs ${fmtAmt(GOLD, cost)}.`;
  if (controller(w.regions[actor.loc]) !== controller(w.regions[co.region])) return `You must be in ${w.nations[controller(w.regions[co.region])].name}.`;
  return productionBlock(w, co, shiftPreview(w, co, actor).units);
}

/** Owner labour: first manager shift each day is free, later ones cost doubling gold (SOLO rule). */
export function managerShift(w: World, actor: Citizen, coId: Id): Result {
  const co = w.companies[coId];
  const why = managerCheck(w, actor, co);
  if (why) return fail(why);
  const cost = managerCost(actor, w);
  if (cost) burn(w, cref(actor.id), GOLD, cost, 'Manager shift fee');
  if (actor.mgrShiftsDay !== today(w)) { actor.mgrShiftsDay = today(w); actor.mgrShifts = 0; }
  actor.mgrShifts++;
  actor.energy -= B.cost.manager;
  const made = runProduction(w, co, shiftPreview(w, co, actor).units, 'manager output');
  actor.eco = +(actor.eco + (B.eco.gainBase / (1 + actor.eco / 5)) * 0.5).toFixed(3);
  addXp(w, actor, B.xp.manager);
  if (actor.player) bump(w, 'manage');
  return ok(`Manager shift: produced ${made} ${itemName(outputKey(co.industry, co.q))}${cost ? ` (fee ${fmtAmt(GOLD, cost)})` : ' (free first shift today)'}.`);
}

export function foundCheck(w: World, actor: Citizen, owner: AccountRef, ind: Industry, region: Id): string | null {
  const auth = authorize(w, actor.id, owner, 'money');
  if (auth) return auth;
  const r = w.regions[region];
  if (!r) return 'Pick a region.';
  if (controller(r) !== controller(w.regions[actor.loc])) return `You must be located in ${w.nations[controller(r)].name} to found a company there.`;
  const cost = g(B.company.foundCost[0]);
  if ((acct(w, owner)?.wallet[GOLD] ?? 0) < cost) return `Founding a Q1 ${INDUSTRY_INFO[ind].name} costs ${B.company.foundCost[0]} gold.`;
  return null;
}

export function foundCompany(w: World, actor: Citizen, owner: AccountRef, ind: Industry, region: Id, name?: string): Result {
  const why = foundCheck(w, actor, owner, ind, region);
  if (why) return fail(why);
  burn(w, owner, GOLD, g(B.company.foundCost[0]), 'Company founding');
  const co = createCompany(w, owner, ind, 1, region, name?.trim() || undefined);
  record(w, 'company', `${actor.name} founded ${co.name} (${INDUSTRY_INFO[ind].name}) in ${w.regions[region].name}.`, { cit: actor.id, region, player: actor.player });
  if (actor.player) bump(w, 'found');
  return ok(`Founded ${co.name}. Deposit wage funds and post a job offer to start production.`, { id: co.id });
}

export function upgradeCost(w: World, actor: Citizen | null, co: Company) {
  const fc = B.company.foundCost;
  let cost = g(fc[co.q] - fc[co.q - 1]);
  if (actor && studyActive(w, actor, 'lighter')) cost = Math.round(cost * 0.85);
  return cost;
}

export function upgradeCompany(w: World, actor: Citizen, coId: Id, payer: AccountRef): Result {
  const co = w.companies[coId];
  if (!co) return fail('Company not found.');
  const auth = authorize(w, actor.id, coref(coId), 'manage') ?? authorize(w, actor.id, payer, 'money');
  if (auth) return fail(auth);
  if (co.q >= 5) return fail('Already Q5.');
  const cost = upgradeCost(w, actor, co);
  if (!burn(w, payer, GOLD, cost, 'Company upgrade')) return fail(`Upgrade costs ${fmtAmt(GOLD, cost)}.`);
  co.q++;
  if (actor.player) bump(w, 'upgrade');
  return ok(`${co.name} upgraded to Q${co.q}.`);
}

export function deposit(w: World, actor: Citizen, coId: Id, asset: string, amt: number): Result {
  const co = w.companies[coId];
  if (!co) return fail('Company not found.');
  const auth = authorize(w, actor.id, coref(coId), 'money');
  if (auth) return fail(auth);
  if (!Number.isInteger(amt) || amt <= 0) return fail('Invalid amount.');
  if (!pay(w, cref(actor.id), coref(coId), asset, amt, `Deposit to ${co.name}`)) return fail('Insufficient funds.');
  return ok(`Deposited ${fmtAmt(asset, amt)}.`);
}

export function withdraw(w: World, actor: Citizen, coId: Id, asset: string, amt: number): Result {
  const co = w.companies[coId];
  if (!co) return fail('Company not found.');
  const auth = authorize(w, actor.id, coref(coId), 'money');
  if (auth) return fail(auth);
  if (!Number.isInteger(amt) || amt <= 0) return fail('Invalid amount.');
  const to = co.owner.k === 'cit' ? cref(actor.id) : co.owner;
  if (!pay(w, coref(coId), to, asset, amt, `Withdrawal from ${co.name}`)) return fail('Company lacks those funds.');
  return ok(`Withdrew ${fmtAmt(asset, amt)}.`);
}

/** Move goods between the owner's storage and the company warehouse. */
export function transferStock(w: World, actor: Citizen, coId: Id, key: string, n: number, toCompany: boolean): Result {
  const co = w.companies[coId];
  if (!co) return fail('Company not found.');
  const auth = authorize(w, actor.id, coref(coId), 'trade');
  if (auth) return fail(auth);
  if (controller(w.regions[actor.loc]) !== controller(w.regions[co.region])) return fail('You must be in the company’s country to move stock.');
  const from = toCompany ? cref(actor.id) : coref(coId);
  const to = toCompany ? coref(coId) : cref(actor.id);
  if (!moveItems(w, from, to, key, n)) return fail('Not enough items or storage capacity.');
  return ok(`Moved ${n} ${itemName(key)} ${toCompany ? 'to the company' : 'to your storage'}.`);
}

export function relocate(w: World, actor: Citizen, coId: Id, region: Id): Result {
  const co = w.companies[coId];
  if (!co) return fail('Company not found.');
  const auth = authorize(w, actor.id, coref(coId), 'own');
  if (auth) return fail(auth);
  const permit = (actor.inv['sp:permit'] ?? 0) > 0;
  if (!permit && co.moveCooldown > w.time) return fail('Relocation is on cooldown.');
  const r = w.regions[region];
  if (!r || region === co.region) return fail('Pick a different region.');
  if (controller(r) !== controller(w.regions[co.region])) return fail('Companies can only move within the same country.');
  if (permit) consume(w, cref(actor.id), 'sp:permit', 1, 'special used');
  else if (!burn(w, cref(actor.id), GOLD, g(B.company.relocateFee), 'Company relocation')) return fail(`Relocation costs ${B.company.relocateFee} gold.`);
  co.region = region;
  co.moveCooldown = permit ? co.moveCooldown : w.time + B.company.relocateCooldownDays * DAY;
  return ok(`${co.name} moved to ${r.name}.`);
}

/** End-of-day bookkeeping for every company. */
export function closeCompanyDay(w: World) {
  const d = today(w);
  for (const co of Object.values(w.companies)) {
    co.today.profit = co.today.revenue - co.today.wages - co.today.inputCost;
    co.lifetime.revenue += co.today.revenue;
    co.lifetime.profit += co.today.profit;
    co.hist.push(co.today);
    if (co.hist.length > 30) co.hist.shift();
    co.today = emptyDay(d);
  }
}

export function companiesOwnedBy(w: World, ref: AccountRef) {
  return Object.values(w.companies).filter((co) => co.owner.k === ref.k && co.owner.id === ref.id);
}

export function openOffers(w: World, nation: Id) {
  return Object.values(w.companies).filter((co) => co.offer && co.offer.slots > co.workers.length && controller(w.regions[co.region]) === nation);
}

// ---------- public works (fallback employer) ----------
export function publicWorksWage(w: World, nation: Id) {
  const n = w.nations[nation];
  return Math.round(n.minWage * B.treasury.publicWorksFrac);
}

export function publicWorksCheck(w: World, c: Citizen): string | null {
  if (jailed(w, c)) return 'You are in prison.';
  const nat = controller(w.regions[c.loc]);
  const n = w.nations[nat];
  if (c.nation !== nat) return 'Public works only employ citizens in their own country.';
  if (c.lastWorkDay === today(w)) return 'You already worked a shift today.';
  if (c.energy < B.cost.work) return `Not enough energy (${Math.floor(c.energy)}/${B.cost.work}).`;
  if ((n.wallet[n.cur] ?? 0) < publicWorksWage(w, nat)) return 'The treasury cannot fund public works today.';
  return null;
}

/** Low-paid treasury-funded shift. Adds construction points to the national project if any. */
export function publicWorksShift(w: World, c: Citizen): Result {
  const why = publicWorksCheck(w, c);
  if (why) return fail(why);
  const nat = controller(w.regions[c.loc]);
  const n = w.nations[nat];
  const wage = publicWorksWage(w, nat);
  c.energy -= B.cost.work;
  pay(w, natref(nat), cref(c.id), n.cur, wage, 'Public works wage');
  n.stats.spendToday += wage;
  c.lastWorkDay = today(w);
  c.incomeToday += wage;
  c.eco = +(c.eco + (B.eco.gainBase / (1 + c.eco / 5)) * 0.5).toFixed(3);
  addXp(w, c, B.xp.work);
  let extra = '';
  const proj = n.priorities.project != null ? w.projects[n.priorities.project] : undefined;
  if (proj && !proj.done && proj.points < proj.needPts) {
    addPoints(w, proj, c.id, B.construction.ptsPerAction / 2);
    c.buildTotal += B.construction.ptsPerAction / 2;
    extra = ` (+${B.construction.ptsPerAction / 2} construction points to ${w.regions[proj.region].name})`;
  }
  if (c.player) bump(w, 'work');
  return ok(`Public works shift: earned ${fmtAmt(n.cur, wage)}${extra}.`);
}

/** Automated sales: list fresh output immediately at the company's current asking price. */
function autoList(w: World, co: Company) {
  const key = outputKey(co.industry, co.q);
  const price = co.prices[key];
  const stock = co.inv[key] ?? 0;
  if (!price || stock <= 0) return;
  const operator = co.owner.k === 'cit' ? co.owner.id : co.owner.k === 'hold' ? w.holdings[co.owner.id]?.ceo : co.owner.k === 'nat' ? w.nations[co.owner.id]?.president : null;
  if (operator == null) return;
  listFn(w, operator, coref(co.id), controller(w.regions[co.region]), key, stock, price);
}
