// The world that keeps moving: a global business cycle, commodity shocks,
// seasonal natural disasters in their real hazard zones, epidemics spreading
// along borders, strikes, protests and riots driven by conditions on the ground,
// internal migration, and new people arriving. Governments (AI or player)
// respond with relief spending, lockdowns, crackdowns or concessions.
import { lifeGate } from './lifecycle';
import type { Citizen, Crisis, CrisisKind, Id, World } from './types';
import { presentIn } from './census';
import { B } from '../data/balance';
import { EARTH } from '../data/earth';
import { COMMODITY_EVENTS, EPIDEMIC_NAMES, HAZARDS } from '../data/hazards';
import { fail, ok, type Result } from '../engine/result';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { DAY, HOUR, dayOf } from '../engine/clock';
import { nid, notify, record, sendMsg } from '../engine/events';
import { chance, pick, rand, randInt, weighted } from '../engine/rng';
import { controller, cref, hhref, jailed, natref, player, regref } from './query';
import { practise } from './growth';
import { govTemplate } from './stategov';

const regionKey = new Map(EARTH.regions.map((e, i) => [`${EARTH.nations[e.nation].iso}/${e.name}`, i]));
export const monthOf = (w: World) => Math.floor((dayOf(w.time) % (12 * w.settings.monthLen)) / w.settings.monthLen) + 1;
export const activeCrises = (w: World) => Object.values(w.crises).filter((c) => c.status === 'active');
export const KIND_ICON: Record<CrisisKind, string> = { hurricane: '🌀', earthquake: '🌋', flood: '🌊', wildfire: '🔥', blizzard: '❄️', drought: '🏜️', epidemic: '🦠', strike: '✊', protest: '📢', riot: '🔥', boom: '📈', shock: '📉' };

/** Production multiplier from crises touching this region (and industry). */
export function crisisFactor(w: World, rid: Id, industry: string): { label: string; mult: number } | null {
  let mult = 1;
  const labels: string[] = [];
  for (const c of activeCrises(w)) {
    if (!c.regions.includes(rid)) continue;
    if (c.kind === 'epidemic') { const lock = c.lockdown?.includes(rid); mult *= lock ? 0.7 : 0.85; labels.push(lock ? `${c.name} lockdown` : c.name); }
    else if (c.kind === 'drought' && industry === 'grain') { mult *= 0.6; labels.push(c.name); }
    else if (c.kind === 'protest') { mult *= 0.9; labels.push('Protests'); }
  }
  return labels.length ? { label: labels.join(', '), mult } : null;
}

export const inLockdown = (w: World, rid: Id) => activeCrises(w).some((c) => c.kind === 'epidemic' && c.lockdown?.includes(rid));

// ---------- the business cycle ----------

function economyDaily(w: World) {
  const e = w.econ;
  e.trend = e.trend * 0.93 + rand(w, -B.dynamics.cycleVol, B.dynamics.cycleVol);
  const prev = e.cycle;
  e.cycle = Math.max(-1, Math.min(1, e.cycle * (1 - B.dynamics.cycleRevert) + e.trend * 0.25));
  e.hist.push(+e.cycle.toFixed(3));
  if (e.hist.length > 120) e.hist.shift();
  const phase = e.cycle > 0.45 ? 'boom' : e.cycle < -0.3 ? 'recession' : e.cycle >= prev ? 'expansion' : 'slowdown';
  if (phase !== e.phase && (phase === 'boom' || phase === 'recession' || e.phase === 'recession')) {
    record(w, 'economy', phase === 'recession' ? '📉 The world economy has fallen into recession: households tighten their belts.' : phase === 'boom' ? '📈 A global boom: consumers are spending freely.' : '📊 The world economy is recovering.', { important: true });
  }
  e.phase = phase;
  // Commodity shocks and booms.
  const open = activeCrises(w).some((c) => c.kind === 'boom' || c.kind === 'shock');
  if (!open && chance(w, 1 / 30)) {
    const ev = pick(w, COMMODITY_EVENTS);
    const up = chance(w, 0.5);
    const mult = up ? rand(w, 1.15, 1.3) : rand(w, 0.65, 0.85);
    const c = addCrisis(w, up ? 'boom' : 'shock', up ? ev.up : ev.down, [], null, randInt(w, 10, 20), 1);
    c.item = ev.item; c.mult = +mult.toFixed(2);
    e.commodity[ev.item] = c.mult;
    record(w, 'economy', `${up ? '📈' : '📉'} ${c.name}: world ${ev.item} output ${up ? '+' : ''}${Math.round((mult - 1) * 100)}% for ${Math.round((c.end - c.start) / DAY)} days.`, { important: true });
  }
}

export function addCrisis(w: World, kind: CrisisKind, name: string, regions: Id[], nation: Id | null, days: number, severity: number): Crisis {
  const c: Crisis = { id: nid(w), kind, name, regions, nation, start: w.time, end: w.time + days * DAY, severity, status: 'active', relief: 0 };
  w.crises[c.id] = c;
  return c;
}

// ---------- natural disasters ----------

function disastersDaily(w: World) {
  const m = monthOf(w);
  const p = player(w);
  for (const h of HAZARDS) {
    if (h.months.length && !h.months.includes(m)) continue;
    const perDay = (h.weight / (h.months.length ? h.months.length * w.settings.monthLen : 360)) * B.dynamics.disasterChance;
    if (!chance(w, perDay)) continue;
    const keys = h.regions.filter((k) => regionKey.has(k));
    if (!keys.length) continue;
    const origin = regionKey.get(pick(w, keys))!;
    const severity = weighted(w, [1, 2, 3], (s) => ({ 1: 5, 2: 3, 3: 1 }[s]!))!;
    const regions = [origin];
    if (h.spread) for (const l of w.regions[origin].links) if (w.regions[l].owner === w.regions[origin].owner && chance(w, 0.25 * severity)) regions.push(l);
    const r0 = w.regions[origin];
    const names = { 1: '', 2: 'Severe ', 3: 'Catastrophic ' } as Record<number, string>;
    const c = addCrisis(w, h.kind, `${names[severity]}${h.label.toLowerCase().replace(/^./, (x) => x.toUpperCase())} in ${r0.name}`, regions, r0.owner, severity + randInt(w, 1, 3), severity);
    let deaths = 0;
    for (const rid of regions) {
      const r = w.regions[rid];
      if (h.kind !== 'drought') r.disrupted = Math.max(r.disrupted, w.time + severity * DAY);
      const lost = Math.round(r.pop * 0.002 * severity * (h.kind === 'earthquake' ? 2 : 1));
      if (h.kind !== 'drought' && h.kind !== 'blizzard') { r.pop = Math.max(2000, r.pop - lost); deaths += lost; }
      r.unrest = Math.min(100, r.unrest + 4 * severity);
      if (h.kind !== 'drought') r.crime = Math.min(100, r.crime + 3 * severity); // looting
      if (severity >= 2 && (h.kind === 'earthquake' || h.kind === 'hurricane' || h.kind === 'flood')) {
        const b = (['hospital', 'industrial', 'fields', 'base'] as const).filter((k) => r.bld[k] > 0);
        if (b.length && chance(w, 0.5)) r.bld[pick(w, b)]--;
        const s = w.govs[rid];
        if (s && s.dev > 0 && severity === 3) s.dev--;
      }
      if (h.kind === 'wildfire' || h.kind === 'hurricane' || h.kind === 'earthquake') for (const co of Object.values(w.companies)) if (co.region === rid && chance(w, 0.3 * severity)) co.halt = { until: w.time + severity * DAY, why: `${h.label} damage` };
    }
    c.deaths = deaths;
    const where = regions.length > 1 ? `${r0.name} and ${regions.length - 1} neighbouring region${regions.length > 2 ? 's' : ''}` : r0.name;
    record(w, 'disaster', `${KIND_ICON[h.kind]} ${c.name} (${w.nations[r0.owner].name}): ${where} hit${deaths ? `, ${deaths.toLocaleString()} dead` : ''}.`, { region: origin, nation: r0.owner, important: true });
    if (regions.includes(p.loc)) notify(w, 'personal', `${KIND_ICON[h.kind]} ${c.name} — you are in the affected area. Relief work is on the World screen.`, { critical: severity >= 2, link: 'world' });
    else if (r0.owner === p.nation) notify(w, 'politics', `${KIND_ICON[h.kind]} ${c.name} in ${w.nations[r0.owner].name}.`, { link: 'world' });
  }
}

/** Governments respond: state treasuries and the national government fund relief; approval follows. */
function reliefDaily(w: World) {
  for (const c of activeCrises(w)) {
    if (c.kind === 'boom' || c.kind === 'shock' || c.kind === 'strike' || c.kind === 'protest' || c.kind === 'riot' || c.nation == null) continue;
    const n = w.nations[c.nation];
    let spent = 0;
    for (const rid of c.regions) {
      const s = w.govs[rid];
      if (s && s.cur === n.cur && !w.regions[rid].occ) {
        const amt = Math.floor((s.wallet[s.cur] ?? 0) * 0.15 * c.severity);
        if (amt > 0 && pay(w, regref(rid), hhref(n.id), n.cur, amt, 'Disaster relief')) { spent += amt; s.approval = Math.min(95, s.approval + 1); }
      }
    }
    // National aid (AI governments always help; a player government's policy is to help too).
    const aid = Math.min(Math.floor((n.wallet[n.cur] ?? 0) * 0.01 * c.severity), cur(200));
    if (aid > 0 && !n.exile && pay(w, natref(n.id), hhref(n.id), n.cur, aid, 'National disaster aid')) { spent += aid; n.stats.spendToday += aid; }
    c.relief += spent;
    if (c.kind === 'epidemic') continue;
    // Recovery speeds up with relief.
    if (c.relief > cur(100) * c.severity) for (const rid of c.regions) w.regions[rid].disrupted = Math.min(w.regions[rid].disrupted, w.time + DAY);
  }
}

export function reliefCheck(w: World, c: Citizen, crisisId: Id): string | null {
  const tooYoung = lifeGate(w, c, 13, 'Relief volunteering');
  if (tooYoung) return tooYoung;
  const k = w.crises[crisisId];
  if (!k || k.status !== 'active' || !['hurricane', 'earthquake', 'flood', 'wildfire', 'blizzard', 'drought', 'epidemic'].includes(k.kind)) return 'No relief effort here.';
  if (!k.regions.includes(c.loc)) return `Relief work happens on the ground: go to ${k.regions.map((r) => w.regions[r].name).slice(0, 3).join(', ')}.`;
  if (jailed(w, c)) return 'You are in prison.';
  if (c.energy < 20) return 'Needs 20 energy.';
  if (w.time - (c.sec.last.relief ?? -1e9) < 12 * HOUR) return 'You already helped today.';
  return null;
}

/** Volunteer: speeds recovery, calms unrest, raises your profile. */
export function volunteer(w: World, c: Citizen, crisisId: Id): Result {
  const why = reliefCheck(w, c, crisisId);
  if (why) return fail(why);
  const k = w.crises[crisisId];
  const r = w.regions[c.loc];
  c.energy -= 20;
  c.sec.last.relief = w.time;
  r.disrupted = Math.max(w.time, r.disrupted - 6 * HOUR);
  r.unrest = Math.max(0, r.unrest - 2);
  k.end = Math.max(w.time + DAY, k.end - 2 * HOUR);
  c.sec.fame += 1;
  c.influence += 0.5;
  for (const x of presentIn(w, c.loc)) if (!x.player) x.rel[c.id] = Math.min(100, (x.rel[c.id] ?? 0) + 2);
  practise(w, c, 'end', B.practice.volunteer);
  return ok(`You worked with relief crews in ${r.name}. Locals won't forget it (+fame, +influence).`);
}

export function donate(w: World, c: Citizen, crisisId: Id, amount: number): Result {
  const k = w.crises[crisisId];
  if (!k || k.status !== 'active' || k.nation == null) return fail('Nothing to donate to.');
  const code = w.nations[k.nation].cur;
  if (amount <= 0 || !pay(w, cref(c.id), hhref(k.nation), code, amount, `Donation: ${k.name}`)) return fail(`You need ${fmtAmt(code, amount)}.`);
  k.relief += amount;
  const pts = Math.min(5, amount / cur(50));
  c.sec.fame += pts;
  c.influence += pts / 2;
  return ok(`Donated ${fmtAmt(code, amount)} to ${k.name} relief (+${pts.toFixed(1)} fame).`);
}

// ---------- epidemics ----------

function epidemicsDaily(w: World) {
  const p = player(w);
  const running = activeCrises(w).find((c) => c.kind === 'epidemic');
  if (!running && chance(w, 1 / B.dynamics.epidemicEveryDays)) {
    const origin = weighted(w, w.regions, (r) => r.pop)!;
    const name = `${pick(w, EPIDEMIC_NAMES.first)} ${pick(w, EPIDEMIC_NAMES.second)}`;
    const c = addCrisis(w, 'epidemic', name, [origin.id], null, randInt(w, 30, 50), randInt(w, 1, 3));
    c.lockdown = [];
    c.infectedAt = { [origin.id]: w.time };
    c.recovered = [];
    record(w, 'disaster', `🦠 A new illness, the ${name}, has broken out in ${origin.name} (${w.nations[origin.owner].name}).`, { region: origin.id, nation: origin.owner, important: true });
    notify(w, 'personal', `🦠 Outbreak of ${name} in ${origin.name}. It spreads along borders and trade routes.`, { link: 'world' });
    return;
  }
  if (!running) return;
  const infectedAt = (running.infectedAt ??= {});
  const recovered = (running.recovered ??= []);
  const locked = new Set(running.lockdown ?? []);
  const next: Id[] = [];
  for (const rid of running.regions) {
    // Recovery after ~12 days.
    if (w.time - infectedAt[rid] > 12 * DAY) { recovered.push(rid); locked.delete(rid); continue; }
    next.push(rid);
    const r = w.regions[rid];
    r.unrest = Math.min(100, r.unrest + (locked.has(rid) ? 1.5 : 0.8));
    r.pop = Math.max(2000, r.pop - Math.round(r.pop * 0.0003 * running.severity / (1 + r.bld.hospital * 0.3)));
    if (locked.has(rid)) continue;
    for (const l of r.links) {
      if (next.includes(l) || running.regions.includes(l) || recovered.includes(l) || locked.has(l)) continue;
      if (chance(w, 0.12 * running.severity * (w.regions[l].pop > 50000 ? 1.3 : 1))) { next.push(l); infectedAt[l] = w.time; if (l === p.loc) notify(w, 'personal', `🦠 The ${running.name} has reached ${w.regions[l].name}.`, { link: 'world' }); }
    }
  }
  // Lockdowns: governments decide by ideology and severity (the player decides where they govern).
  for (const rid of next) {
    const s = w.govs[rid];
    const decider = s?.head.cit;
    if (locked.has(rid) || decider === p.id) continue;
    const ideo = s?.head.ideo ?? 'centralism';
    const pLock = (ideo === 'centralism' || ideo === 'communism' || ideo === 'socialism' ? 0.35 : 0.12) * running.severity;
    if (chance(w, pLock)) locked.add(rid);
  }
  running.regions = next;
  running.lockdown = [...locked].filter((r) => next.includes(r));
  if (!next.length) running.end = w.time;
}

export function lockdownCheck(w: World, c: Citizen, rid: Id): string | null {
  const tooYoung = lifeGate(w, c, 18, 'Ordering a lockdown');
  if (tooYoung) return tooYoung;
  const s = w.govs[rid];
  const ep = activeCrises(w).find((k) => k.kind === 'epidemic' && k.regions.includes(rid));
  if (!s || s.head.cit !== c.id) return `Only the ${govTemplate(w, rid)?.title ?? 'head of government'} can order a lockdown.`;
  if (!ep) return 'There is no outbreak here.';
  return null;
}

export function toggleLockdown(w: World, c: Citizen, rid: Id): Result {
  const why = lockdownCheck(w, c, rid);
  if (why) return fail(why);
  const ep = activeCrises(w).find((k) => k.kind === 'epidemic' && k.regions.includes(rid))!;
  const on = ep.lockdown?.includes(rid);
  ep.lockdown = on ? ep.lockdown!.filter((r) => r !== rid) : [...(ep.lockdown ?? []), rid];
  w.govs[rid]!.approval += on ? 3 : -4;
  return ok(on ? `Lockdown lifted in ${w.regions[rid].name}.` : `Lockdown ordered in ${w.regions[rid].name}: no travel in or out, businesses slow down, but the spread stops here.`);
}

// ---------- strikes ----------

function strikesDaily(w: World) {
  const p = player(w);
  const avg = new Map<Id, number>();
  for (const n of w.nations) {
    const offers = Object.values(w.companies).filter((co) => co.offer && controller(w.regions[co.region]) === n.id);
    avg.set(n.id, offers.length ? offers.reduce((s, co) => s + co.offer!.wage, 0) / offers.length : 0);
  }
  for (const co of Object.values(w.companies)) {
    if (!co.offer || co.workers.length < 3 || (co.halt && co.halt.until > w.time) || (co.id + dayOf(w.time)) % 7 !== 0) continue;
    const nat = controller(w.regions[co.region]);
    const a = avg.get(nat) ?? 0;
    if (!a || co.offer.wage >= a * B.dynamics.strikeBelowAvg || !chance(w, 0.25 + (w.econ.cycle > 0 ? 0.15 : 0))) continue;
    co.halt = { until: w.time + 3 * DAY, why: 'Workers on strike' };
    const owner = co.owner.k === 'cit' ? w.citizens[co.owner.id] : null;
    const demand = Math.ceil(a * 0.95);
    const k = addCrisis(w, 'strike', `Strike at ${co.name}`, [co.region], nat, 3, 1);
    k.company = co.id;
    if (owner?.player) {
      sendMsg(w, { from: w.citizens[co.workers[0]]?.id ?? null, subject: `✊ Strike at ${co.name}`, kind: 'npc', body: `Your ${co.workers.length} workers walked out: they're paid ${fmtAmt(w.nations[nat].cur, co.offer.wage)} against a national average of ${fmtAmt(w.nations[nat].cur, Math.round(a))}. They want ${fmtAmt(w.nations[nat].cur, demand)}.`, options: [{ id: 'meet', label: `Meet their demand (${fmtAmt(w.nations[nat].cur, demand)})` }, { id: 'split', label: 'Split the difference' }, { id: 'refuse', label: 'Refuse' }], payload: { handler: 'strike', co: co.id, demand, crisis: k.id } });
      notify(w, 'company', `✊ Workers at ${co.name} are on strike.`, { link: 'inbox' });
    } else if (owner && owner.traits.greed < 0.6) {
      co.offer.wage = demand; co.halt = { until: w.time + DAY, why: 'Workers on strike' }; k.end = w.time + DAY;
    }
    if (nat === p.nation && co.workers.length >= 4) record(w, 'labour', `✊ Workers at ${co.name} (${w.regions[co.region].name}) went on strike over pay.`, { region: co.region, nation: nat });
  }
}

export function replyStrike(w: World, payload: Record<string, any>, option: string): Result {
  const co = w.companies[payload.co];
  const k = w.crises[payload.crisis];
  if (!co || !co.offer) return ok('The company is gone.');
  // A stale request cannot let a former owner change wages at a company they sold.
  if (!(co.owner.k === 'cit' && co.owner.id === w.playerId)) return fail(`${co.name} is no longer yours; its new owner deals with the strike.`);
  if (k && k.status !== 'active') return ok('The strike has already ended.');
  if (option === 'refuse') {
    for (const id of co.workers) { const x = w.citizens[id]; if (x) x.rel[w.playerId] = Math.max(-100, (x.rel[w.playerId] ?? 0) - 15); }
    return ok('The strike goes on. Your workers are bitter.');
  }
  co.offer.wage = option === 'meet' ? payload.demand : Math.round((co.offer.wage + payload.demand) / 2);
  co.halt = option === 'meet' ? undefined : { until: w.time + DAY, why: 'Workers on strike' };
  if (k) k.end = co.halt?.until ?? w.time;
  for (const id of co.workers) { const x = w.citizens[id]; if (x) x.rel[w.playerId] = Math.min(100, (x.rel[w.playerId] ?? 0) + (option === 'meet' ? 10 : 3)); }
  return ok(option === 'meet' ? 'Deal: back to work tomorrow.' : 'A compromise: one more day out, then back to work.');
}

// ---------- unrest, protests and riots ----------

function unrestTarget(w: World, rid: Id): number {
  const r = w.regions[rid];
  const n = w.nations[r.owner];
  const s = w.govs[rid];
  let t = 8 + (50 - (s?.approval ?? n.approval)) * 0.35 + (50 - n.approval) * 0.25 + r.crime * 0.2 + n.unemployment * 35 + Math.max(0, -w.econ.cycle) * 12;
  if (s) t += Math.max(0, s.tax - 6) * 2;
  if (r.occ) t += 25;
  if (r.owner !== r.core) t += 15;
  if (inLockdown(w, rid)) t += 8;
  return Math.max(0, Math.min(100, t));
}

function unrestDaily(w: World) {
  const p = player(w);
  for (const r of w.regions) {
    r.unrest += (unrestTarget(w, r.id) - r.unrest) * 0.08 + rand(w, -0.5, 0.5);
    r.unrest = Math.max(0, Math.min(100, r.unrest));
    const open = activeCrises(w).find((c) => (c.kind === 'protest' || c.kind === 'riot') && c.regions.includes(r.id));
    if (open) {
      if (open.kind === 'riot') { r.disrupted = Math.max(r.disrupted, w.time + DAY / 2); r.crime = Math.min(100, r.crime + 2); }
      if (r.unrest < B.dynamics.protestAt - 10) open.end = w.time;
      continue;
    }
    if (r.unrest >= B.dynamics.riotAt && chance(w, 0.3)) {
      const c = addCrisis(w, 'riot', `Riots in ${r.name}`, [r.id], r.owner, randInt(w, 1, 3), 2);
      r.disrupted = Math.max(r.disrupted, w.time + DAY);
      const b = (['hospital', 'industrial', 'fields'] as const).filter((k) => r.bld[k] > 0);
      if (b.length && chance(w, 0.3)) r.bld[pick(w, b)]--;
      govResponse(w, r.id, c);
      record(w, 'unrest', `🔥 Riots broke out in ${r.name} (${w.nations[r.owner].name}).`, { region: r.id, nation: r.owner, important: r.owner === p.nation });
      if (r.id === p.loc) notify(w, 'personal', `🔥 Riots in ${r.name}. Stay safe — or take part (World screen).`, { link: 'world' });
    } else if (r.unrest >= B.dynamics.protestAt && chance(w, 0.25)) {
      const s = w.govs[r.id];
      const cause = s && s.tax > 7 ? 'taxes' : r.crime > 50 ? 'crime' : r.occ ? 'the occupation' : w.econ.cycle < -0.3 ? 'the economy' : 'the government';
      const c = addCrisis(w, 'protest', `Protests over ${cause} in ${r.name}`, [r.id], r.owner, randInt(w, 2, 4), 1);
      govResponse(w, r.id, c);
      if (r.owner === p.nation) record(w, 'unrest', `📢 ${c.name}.`, { region: r.id, nation: r.owner });
    }
  }
}

/** The authorities answer: concessions (cut the state tax), a crackdown (police, approval cost) or nothing. */
function govResponse(w: World, rid: Id, c: Crisis) {
  const s = w.govs[rid];
  const r = w.regions[rid];
  if (!s || s.head.cit === player(w).id) return;
  const hard = s.head.ideo === 'nationalism' || s.head.ideo === 'imperialism' || s.head.ideo === 'centralism';
  if (hard) {
    r.unrest = Math.max(0, r.unrest - 12);
    s.approval = Math.max(5, s.approval - 3);
    s.budget.police = Math.min(0.5, s.budget.police + 0.05);
    s.budget.welfare = Math.max(0, s.budget.welfare - 0.05);
    c.name += ' — police crack down';
  } else if (s.tax > 0) {
    s.tax = Math.max(0, s.tax - 1);
    r.unrest = Math.max(0, r.unrest - 6);
    c.name += ` — ${govTemplate(w, rid)?.title ?? 'government'} cuts the state tax`;
  }
}

export function joinProtestCheck(w: World, c: Citizen): string | null {
  const tooYoung = lifeGate(w, c, 16, 'Joining a protest');
  if (tooYoung) return tooYoung;
  const k = activeCrises(w).find((x) => (x.kind === 'protest' || x.kind === 'riot') && x.regions.includes(c.loc));
  if (!k) return 'No protest here right now.';
  if (jailed(w, c)) return 'You are in prison.';
  if (c.energy < 10) return 'Needs 10 energy.';
  if (w.time - (c.sec.last.protest ?? -1e9) < 12 * HOUR) return 'You already marched today.';
  return null;
}

/** March with protesters: builds your standing with residents, but riots can get you arrested. */
export function joinProtest(w: World, c: Citizen): Result {
  const why = joinProtestCheck(w, c);
  if (why) return fail(why);
  const k = activeCrises(w).find((x) => (x.kind === 'protest' || x.kind === 'riot') && x.regions.includes(c.loc))!;
  const r = w.regions[c.loc];
  c.energy -= 10;
  c.sec.last.protest = w.time;
  r.unrest = Math.min(100, r.unrest + 1.5);
  c.sec.fame += 0.5;
  c.influence += 1;
  const s = w.govs[c.loc];
  if (s) s.approval = Math.max(5, s.approval - 0.5);
  if (k.kind === 'riot' && chance(w, r.police / 200)) {
    c.sec.heat = Math.min(100, c.sec.heat + 25);
    const id = nid(w);
    w.cases[id] = { id, suspect: c.id, kind: 'assault', region: c.loc, nation: controller(r), evidence: 55, opened: w.time, status: 'open', detective: null, loot: 0 };
    return ok('You marched — and police photographed you at the riot. They may come knocking.');
  }
  return ok(`You joined the ${k.kind === 'riot' ? 'riot' : 'protest'} in ${r.name} (+influence).`);
}

// ---------- people: migration and arrivals ----------

function migrationDaily(w: World) {
  for (const n of w.nations) {
    const own = w.regions.filter((r) => r.owner === n.id);
    if (own.length < 2) continue;
    const score = (rid: Id) => {
      const r = w.regions[rid];
      const s = w.govs[rid];
      return -r.crime * 0.4 - r.unrest * 0.4 + (s?.dev ?? 0) * 4 + (s?.approval ?? 50) * 0.2 - (r.disrupted > w.time ? 20 : 0) - (s?.tax ?? 0);
    };
    const scores = own.map((r) => score(r.id));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    let net = 0;
    const deltas = own.map((r, i) => { const d = Math.round(r.pop * B.dynamics.migration * Math.max(-1, Math.min(1, (scores[i] - mean) / 40))); net += d; return d; });
    own.forEach((r, i) => { r.pop = Math.max(2000, r.pop + deltas[i] - Math.round((net * r.pop) / Math.max(1, own.reduce((t, x) => t + x.pop, 0)))); });
    w.households[n.id].pop = own.reduce((t, r) => t + r.pop, 0);
  }
}

// ---------- daily entry point ----------

export function dynamicsDaily(w: World) {
  economyDaily(w);
  disastersDaily(w);
  epidemicsDaily(w);
  reliefDaily(w);
  strikesDaily(w);
  unrestDaily(w);
  migrationDaily(w); // background population; AI citizens come and go in population.ts
  // Close finished crises and restore commodity output.
  for (const c of Object.values(w.crises)) {
    if (c.status !== 'active' || c.end > w.time) continue;
    c.status = 'over';
    if ((c.kind === 'boom' || c.kind === 'shock') && c.item) w.econ.commodity[c.item] = 1;
    if (c.kind === 'epidemic') record(w, 'disaster', `🦠 The ${c.name} outbreak is over.`, { important: true });
  }
  const over = Object.values(w.crises).filter((c) => c.status === 'over').sort((a, b) => a.id - b.id);
  for (const c of over.slice(0, Math.max(0, over.length - 150))) delete w.crises[c.id];
}

