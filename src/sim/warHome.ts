// The home front and the people in a war (2.2 War & peace).
// - Mobilisation: a country at war calls up its reservists (the player and their family
//   too); when the last war ends, they are stood down.
// - Casualties among real citizens: soldiers on duty are killed and wounded, more while
//   their country's forces are in battle and more on the losing side.
// - Prisoners: a lost battle leaves some soldiers in enemy hands until the war ends.
// - Occupation and resistance: occupied regions seethe; partisans wear down the occupier's
//   formations there.
// - Refugees: people flee regions that are fought over or occupied, to safer parts of their
//   own country or, failing that, to a neighbour at peace (which pays for their keep).
// - The war economy: the treasury pays for the war (more defence spending, which deficit
//   borrowing then funds), households buy war bonds, and arms industries are told to
//   produce more.
// Every war keeps a toll: killed, wounded, prisoners, refugees and money spent.
import type { Citizen, Id, Nation, War, World } from './types';
import { DAY } from '../engine/clock';
import { notify, record } from '../engine/events';
import { chance, pick } from '../engine/rng';
import { pay } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { census, invalidateCensus } from './census';
import { controller, hhref, natref, player } from './query';
import { activeBattles } from './battle';
import { activeWars, enemyOf } from './war';
import { die, relocate } from './population';
import { wound } from './health';
import { publicOffice, returnToDuty, returnToDutyCheck, toReserve } from './forces';
import { dailyRevenue } from './publicFinance';

export interface WarToll { killed: Record<Id, number>; wounded: Record<Id, number>; captured: Record<Id, number>; refugees: Record<Id, number>; spent: Record<Id, number> }
export function tollOf(war: War): WarToll {
  return (war.toll ??= { killed: {}, wounded: {}, captured: {}, refugees: {}, spent: {} });
}
const add = (m: Record<Id, number>, k: Id, v: number) => { m[k] = (m[k] ?? 0) + v; };
const atWar = (w: World, n: Id) => activeWars(w).filter((x) => x.att === n || x.def === n);

// ---------- mobilisation ----------

function mobilise(w: World) {
  const p = player(w);
  for (const n of w.nations) {
    const wars = atWar(w, n.id);
    if (wars.length && !n.mobilised) {
      n.mobilised = w.time;
      let called = 0;
      for (const c of census(w).all) {
        if (c.nation !== n.id || !c.mil?.branch || !c.mil.reserve || c.gone || publicOffice(w, c)) continue;
        if (returnToDutyCheck(w, c)) continue;
        returnToDuty(w, c);
        c.mil.calledUp = wars[0].id;
        called++;
        if (c.player) notify(w, 'warHome', `📯 You have been called up: report for duty in the war with ${w.nations[enemyOf(wars[0], n.id)].name}.`, { critical: true, link: 'forces' });
      }
      const text = `📯 ${n.name} mobilised for war: ${called} reservist${called === 1 ? '' : 's'} called up.`;
      record(w, 'war', text, { nation: n.id, important: true });
      if (n.id === p.nation && !p.mil?.calledUp) notify(w, 'warHome', text, { link: 'forces' });
    } else if (!wars.length && n.mobilised) {
      delete n.mobilised;
      let stood = 0;
      for (const c of census(w).all) if (c.nation === n.id && c.mil?.calledUp != null) { delete c.mil.calledUp; toReserve(w, c, 'stood down after the war'); stood++; }
      if (stood) record(w, 'war', `🏠 ${n.name} stood down ${stood} reservist${stood === 1 ? '' : 's'} after the war.`, { nation: n.id });
    }
  }
}

// ---------- casualties and prisoners ----------

const onDuty = (c: Citizen) => !!c.mil?.branch && !c.mil.reserve && c.mil.pow == null && !c.gone;

function casualties(w: World, days = 1) {
  const fighting = new Map<Id, number>(); // nation -> 1 if its forces are in battle today
  for (const b of activeBattles(w)) if (b.kind === 'war') { fighting.set(b.att, 1); fighting.set(b.def, 1); }
  const p = player(w);
  for (const war of activeWars(w)) {
    const toll = tollOf(war);
    for (const side of [war.att, war.def]) {
      const n = w.nations[side];
      const losing = n.warScore < 0;
      const rate = Math.min(0.2, (fighting.has(side) ? 0.0015 : 0.0003) * (losing ? 1.5 : 1) * days);
      for (const c of census(w).all) {
        if (c.nation !== side || !onDuty(c) || c.player) continue;
        if (chance(w, rate)) {
          add(toll.killed, side, 1);
          const enemy = w.nations[enemyOf(war, side)];
          die(w, c, `killed in action in the war with ${enemy.name}`);
          if (c.family?.partner === p.id || (c.family?.parents ?? []).includes(p.id) || (c.family?.children ?? []).includes(p.id)) notify(w, 'personal', `🕯️ ${c.name} was killed in the war with ${enemy.name}.`, { critical: true });
        } else if (chance(w, rate * 3)) {
          add(toll.wounded, side, 1);
          wound(w, c);
        }
      }
    }
  }
  invalidateCensus(w);
}

/** A lost battle: some of the losing side's soldiers are taken prisoner. */
export function takePrisoners(w: World, war: War, loser: Id) {
  const captor = enemyOf(war, loser);
  const pool = census(w).all.filter((c) => c.nation === loser && onDuty(c) && !c.player);
  const n = Math.min(pool.length, Math.max(1, Math.round(pool.length * 0.02)));
  for (let i = 0; i < n; i++) {
    const c = pick(w, pool.filter((x) => x.mil.pow == null));
    if (!c) break;
    c.mil.pow = captor;
    add(tollOf(war).captured, loser, 1);
  }
}

/** The war is over: prisoners go home. */
export function releasePrisoners(w: World, war: War) {
  let n = 0;
  for (const c of census(w).all) if (c.mil?.pow != null && (c.mil.pow === war.att || c.mil.pow === war.def) && (c.nation === war.att || c.nation === war.def)) { delete c.mil.pow; n++; }
  if (n) record(w, 'war', `🤝 ${n} prisoner${n === 1 ? '' : 's'} of war came home after the war between ${w.nations[war.att].name} and ${w.nations[war.def].name}.`, { nation: war.att });
}

// ---------- occupation, resistance and refugees ----------

function occupation(w: World) {
  for (const r of w.regions) {
    if (!r.occ) continue;
    r.unrest = Math.min(100, r.unrest + 1.5);
    // Partisans: the occupied people wear down the occupier's formations.
    const locals = census(w).all.filter((c) => c.home === r.id && c.nation === r.owner && !c.gone).length;
    if (!locals) continue;
    for (const f of Object.values(w.forces)) if (f.nation === r.occ.nation && f.loc === r.id && f.branch === 'army') f.strength = Math.max(1, f.strength - Math.min(1.5, locals / 40));
    if (chance(w, 0.03)) record(w, 'war', `💣 Partisans struck the ${w.nations[r.occ.nation].adj} occupiers in ${r.name}.`, { region: r.id, nation: r.owner });
  }
}

function refugees(w: World) {
  const front = new Set<Id>();
  for (const b of activeBattles(w)) if (b.kind === 'war') front.add(b.region);
  for (const r of w.regions) if (r.occ && w.time - (r.occ.since ?? 0) < 5 * DAY) front.add(r.id);
  if (!front.size) return;
  const p = player(w);
  for (const rid of front) {
    const r = w.regions[rid];
    const war = activeWars(w).find((x) => x.att === r.owner || x.def === r.owner || x.att === controller(r) || x.def === controller(r));
    if (!war) continue;
    const people = census(w).all.filter((c) => c.home === rid && !c.gone && !c.player && !onDuty(c));
    for (const c of people) {
      if (!chance(w, 0.04)) continue;
      const dest = refuge(w, c, rid, war);
      if (dest == null) continue;
      const abroad = controller(w.regions[dest]) !== c.nation;
      relocate(w, c, dest, 'fleeing the war');
      add(tollOf(war).refugees, c.nation, 1);
      if (abroad) {
        // The host pays for refugees' keep for a while.
        const host = w.nations[controller(w.regions[dest])];
        const cost = Math.round(dailyRevenue(host) * 0.002);
        if (cost > 0 && pay(w, natref(host.id), hhref(host.id), host.cur, Math.min(cost, host.wallet[host.cur] ?? 0), 'Refugee support')) host.stats.spendToday += cost;
      }
    }
    if (p.home === rid && chance(w, 0.2)) notify(w, 'warHome', `🧳 Neighbours are fleeing ${r.name} as the fighting comes close. You could leave too (Travel).`, { link: 'travel' });
  }
}

/** Where someone fleeing `from` would go: a safe region of their own country, else a neighbour at peace. */
function refuge(w: World, c: Citizen, from: Id, war: War): Id | null {
  const r = w.regions[from];
  const safe = (id: Id) => { const x = w.regions[id]; return !x.occ && !activeBattles(w).some((b) => b.region === id); };
  const home = r.links.filter((l) => controller(w.regions[l]) === c.nation && safe(l));
  if (home.length) return pick(w, home);
  const own = w.regions.filter((x) => controller(x) === c.nation && safe(x.id));
  if (own.length) return own[0].id;
  const abroad = r.links.filter((l) => { const o = controller(w.regions[l]); return o !== war.att && o !== war.def && safe(l); });
  return abroad.length ? pick(w, abroad) : null;
}

// ---------- the war economy ----------

function warEconomy(w: World, days = 1) {
  for (const n of w.nations) {
    const wars = atWar(w, n.id);
    if (!wars.length) continue;
    const war = wars[0];
    // The cost of fighting: about a fifth of a day's revenue on top of the peacetime budget.
    const cost = Math.round(dailyRevenue(n) * 0.2 * days);
    const paid = Math.min(cost, Math.max(0, n.wallet[n.cur] ?? 0));
    if (paid > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, paid, 'War expenditure')) { n.stats.spendToday += paid; add(tollOf(war).spent, n.id, paid); }
    // War bonds: patriotic savers lend to the government.
    const bonds = Math.round(dailyRevenue(n) * 0.05 * (n.warMood > 0 ? 1.5 : 1) * days);
    if (bonds > 0 && pay(w, hhref(n.id), natref(n.id), n.cur, Math.min(bonds, w.households[n.id]?.wallet[n.cur] ?? 0), 'War bonds')) { n.debt = (n.debt ?? 0) + bonds; n.warBonds = (n.warBonds ?? 0) + bonds; }
    // Arms industries are told to produce more.
    n.procure.wa = Math.max(n.procure.wa ?? 0, 20);
    n.procure.wg = Math.max(n.procure.wg ?? 0, 20);
  }
}

export function warHomeDaily(w: World, days = 1) {
  mobilise(w);
  casualties(w, days);
  if (days === 1) { occupation(w); refugees(w); }
  warEconomy(w, days);
}

/** A short line for the war room: what a war has cost each side so far. */
export function tollLine(w: World, war: War, side: Id): string {
  const t = tollOf(war);
  const n: Nation = w.nations[side];
  return `${t.killed[side] ?? 0} killed, ${t.wounded[side] ?? 0} wounded, ${t.captured[side] ?? 0} captured, ${t.refugees[side] ?? 0} refugees, ${fmtAmt(n.cur, t.spent[side] ?? 0)} spent`;
}
