// AI soldiers, commanders, defense ministries and diplomacy. Soldiers fight with
// their own energy, food and weapons (bought on the market); commanders and
// ministries plan battles, supply units and seek peace.
import type { Battle, Citizen, Id, Nation, World } from '../sim/types';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { chance } from '../engine/rng';
import { hourOf } from '../engine/clock';
import { pay } from '../engine/ledger';
import { activeBattles, battleTick, claimReserve, hit, segmentOf } from '../sim/battle';
import type { WeaponSel } from '../sim/combatMath';
import { controller, cref, natref, player, seatShare } from '../sim/query';
import { activeWars, computeSupply, enemyOf, invasionCheck, isBorder, seatOf, startInvasion } from '../sim/war';
import { distribute, members, setOrder, unitRef } from '../sim/units';
import { eatUp } from './citizens';
import { buyBest, listingsFor } from '../sim/market';
import { relation } from '../sim/congress';
import { useSpecial } from '../sim/specials';

/** Best weapon a citizen holds for this battle. */
export function bestWeapon(c: Citizen, b: Battle): WeaponSel {
  const kind = b.airOnly ? 'wa' : 'wg';
  for (let q = 5; q >= 1; q--) if ((c.inv[`${kind}:${q}`] ?? 0) > 0) return { kind, q };
  if (!b.airOnly) for (let q = 5; q >= 1; q--) if ((c.inv[`wa:${q}`] ?? 0) > 0) return { kind: 'wa', q };
  return null;
}

function styleMult(style: Citizen['fightStyle'], seg: number, doctrine?: string) {
  let m = style === 'early' ? [1.6, 1.3, 0.6, 0.5][seg] : style === 'late' ? [0.3, 0.4, 0.8, 3][seg] : 1;
  if (doctrine === 'conserve') m *= seg === 3 ? 1.5 : 0.5;
  if (doctrine === 'surge') m *= seg === 3 ? 2.5 : 0.6;
  return m;
}

/** Per tick: score the ended tick, then AI fighters act in the new one. */
export function soldiersTick(w: World) {
  const battles = activeBattles(w).filter((b) => b.kind === 'war' || b.kind === 'event');
  for (const b of battles) battleTick(w, b);
  const live = battles.filter((b) => !b.done);
  if (!live.length) return;
  // Who is interested in which battle.
  const byNation: Record<Id, Battle[]> = {};
  for (const b of live) {
    for (const [nat, side] of [[b.att, 'a'], [b.def, 'd']] as [Id, 'a' | 'd'][]) {
      if (nat < 0) continue;
      (byNation[nat] = byNation[nat] ?? []).push(b);
      for (const ally of w.nations[nat].alliances) (byNation[ally] = byNation[ally] ?? []).push(b);
      void side;
    }
  }
  for (const c of Object.values(w.citizens)) {
    if (c.player || c.mining || c.energy < B.cost.hit) continue;
    const mine = byNation[c.nation];
    if (!mine) {
      // Event battles (pirates): anyone may join.
      continue;
    }
    const u = c.unit != null ? w.units[c.unit] : null;
    const n = w.nations[c.nation];
    let target: Battle | undefined;
    let side: 'a' | 'd' = 'a';
    if (u?.order && w.battles[u.order.battle] && !w.battles[u.order.battle].done) { target = w.battles[u.order.battle]; side = u.order.side; }
    else if (n.priorities.battle != null && w.battles[n.priorities.battle] && !w.battles[n.priorities.battle].done && ((c.id * 7 + Math.floor(w.time / 160)) % 10) < 6) {
      target = w.battles[n.priorities.battle];
      side = n.priorities.side ?? (target.att === c.nation ? 'a' : 'd');
    } else {
      target = mine[(c.id + w.time / 10) % mine.length];
      side = target.att === c.nation || (target.def !== c.nation && w.nations[target.att]?.alliances.includes(c.nation)) ? 'a' : 'd';
    }
    if (!target) continue;
    const allyOnly = (side === 'a' ? target.att : target.def) !== c.nation;
    const seg = segmentOf(target, w.time);
    const base = c.persona === 'soldier' ? 0.45 : u ? 0.3 : 0.05;
    const p = base * styleMult(c.fightStyle, seg, u?.doctrine) * (u?.order?.battle === target.id ? 1.4 : 1) * (allyOnly ? 0.3 : 1) * c.traits.activity;
    if (!chance(w, Math.min(0.95, p))) continue;
    // Late-surgers eat (and take stimulants) to fight hard in the final segment.
    if (seg === 3 && (c.fightStyle === 'late' || u?.doctrine === 'surge')) {
      eatUp(w, c, 90);
      if ((c.inv['sp:steroids'] ?? 0) > 0 && !c.buffs.some((x) => x.type === 'steroids')) useSpecial(w, c, 'steroids');
    }
    const weapon = bestWeapon(c, target);
    const hits = Math.min(Math.floor(c.energy / B.cost.hit), seg === 3 ? 4 : 2);
    for (let i = 0; i < hits; i++) if (!hit(w, c, target.id, side, weapon && (c.inv[`${weapon.kind}:${weapon.q}`] ?? 0) > 0 ? weapon : bestWeapon(c, target)).ok) break;
  }
}

/** Soldiers restock weapons in wartime, choosing damage per currency. */
export function restockWeapons(w: World, c: Citizen) {
  const atWar = activeWars(w).some((x) => x.att === c.nation || x.def === c.nation);
  if (!atWar && c.persona !== 'soldier') return;
  const nat = controller(w.regions[c.loc]);
  const n = w.nations[nat];
  let have = 0;
  for (let q = 1; q <= 5; q++) have += (c.inv[`wg:${q}`] ?? 0) + (c.inv[`wa:${q}`] ?? 0);
  const target = c.persona === 'soldier' ? (atWar ? 30 : 10) : atWar ? 8 : 0;
  if (have >= target) return;
  const cash = (c.wallet[n.cur] ?? 0) - B.living.perDay * 100 * 5;
  if (cash <= 0) return;
  const opts = [1, 2, 3, 4, 5].map((q) => {
    const l = listingsFor(w, nat, `wg:${q}`)[0];
    return l ? { q, value: B.damage.ground[q - 1] / l.price, price: l.price } : null;
  }).filter(Boolean).sort((a, b) => b!.value - a!.value) as { q: number; price: number }[];
  const o = opts[0];
  const airNeeded = activeBattles(w).some((b) => b.airOnly && (b.att === c.nation || b.def === c.nation));
  if (airNeeded) {
    const l = [1, 2, 3].map((q) => listingsFor(w, nat, `wa:${q}`)[0]).filter(Boolean).sort((a, b) => a.price - b.price)[0];
    if (l) buyBest(w, c.id, cref(c.id), nat, l.item, Math.min(10, Math.floor((cash * 0.4) / l.price)), Math.round(l.price * 1.2));
  }
  if (!o) return;
  const n_ = Math.min(target - have, Math.floor((cash * 0.5) / o.price));
  if (n_ > 0) buyBest(w, c.id, cref(c.id), nat, `wg:${o.q}`, n_, Math.round(o.price * 1.2));
}

function airStock(w: World, nation: Id) {
  let s = 0;
  for (const c of Object.values(w.citizens)) if (c.nation === nation) for (let q = 1; q <= 5; q++) s += c.inv[`wa:${q}`] ?? 0;
  return s;
}

// ---------- defense ministries ----------
function govActor(n: Nation): Id | null { return n.cabinet.defense ?? n.cabinet.vp ?? n.president; }

/** Choose invasion targets: goals and supply chokepoints for attackers; liberation for defenders. */
function pickTarget(w: World, n: Nation, warId: Id): Id | null {
  const war = w.wars[warId];
  const enemy = enemyOf(war, n.id);
  const opts: { id: Id; s: number }[] = [];
  for (const r of w.regions) {
    const liberation = r.owner === n.id && r.occ?.nation === enemy;
    const invade = r.owner === enemy && controller(r) === enemy;
    if (!liberation && !invade) continue;
    if (Object.values(w.battles).some((b) => !b.done && b.region === r.id)) continue;
    const border = isBorder(w, n.id, r.id) || (n.exile && r.core === n.id);
    let s = border ? 10 : 1;
    if (liberation) s += 12 + (w.regions.some((x) => x.owner === n.id && !x.supplied) ? 6 : 0);
    if (invade && n.id === war.att && war.goals.includes(r.id)) s += 15;
    if (invade) s += cutValue(w, enemy, r.id) * 3 + (r.terrain === 'mountains' ? -3 : r.terrain === 'plains' ? 2 : 0) - r.bld.base * 2;
    if (invade && n.id === war.def) s -= 6; // defenders prefer liberation
    opts.push({ id: r.id, s });
  }
  const best = opts.sort((a, b) => b.s - a.s || a.id - b.id)[0];
  return best && best.s > 0 ? best.id : null;
}

/** How many enemy regions would lose supply if `rid` were taken (chokepoint value). */
function cutValue(w: World, enemy: Id, rid: Id): number {
  const n = w.nations[enemy];
  const seat = seatOf(w, n);
  if (seat == null || seat === rid) return seat === rid ? 5 : 0;
  const reach = new Set<Id>([seat]);
  const q = [seat];
  while (q.length) {
    const id = q.shift()!;
    for (const l of w.regions[id].links) if (l !== rid && !reach.has(l) && controller(w.regions[l]) === enemy) { reach.add(l); q.push(l); }
  }
  return w.regions.filter((r) => controller(r) === enemy && r.id !== rid && !reach.has(r.id)).length;
}

export function defenseAI(w: World) {
  const pl = player(w);
  for (const war of activeWars(w)) {
    for (const nid_ of [war.att, war.def]) {
      const n = w.nations[nid_];
      const actor = govActor(n);
      if (actor == null || actor === pl.id) continue;
      for (let k = 0; k < 2; k++) {
        const t = pickTarget(w, n, war.id);
        if (t == null || invasionCheck(w, actor, war, t)) break;
        const air = !isBorder(w, n.id, t) && !(n.exile && w.regions[t].core === n.id);
        if (air && airStock(w, n.id) < 30) {
          // No border: signal demand for air weapons instead of launching a hopeless air assault.
          n.procure['wa:1'] = Math.max(n.procure['wa:1'] ?? 0, 60);
          break;
        }
        startInvasion(w, actor, war.id, t);
      }
    }
  }
  // National battle priority: the battle closest to deciding (for each AI-run nation).
  for (const n of w.nations) {
    const actor = govActor(n);
    if (actor === pl.id) continue;
    const mine = activeBattles(w).filter((b) => b.kind === 'war' && (b.att === n.id || b.def === n.id));
    if (!mine.length) { n.priorities.battle = null; continue; }
    const best = mine.slice().sort((a, b) => (b.wins.a + b.wins.d) - (a.wins.a + a.wins.d) || (w.regions[b.region].id === n.capital ? 1 : 0) - (w.regions[a.region].id === n.capital ? 1 : 0) || a.id - b.id)[0];
    n.priorities.battle = best.id;
    n.priorities.side = best.att === n.id ? 'a' : 'd';
  }
}

/** AI unit commanders: follow national priorities, distribute supplies, buy with unit funds. */
export function commandersAI(w: World) {
  const pl = player(w);
  const h = hourOf(w.time);
  for (const u of Object.values(w.units).sort((a, b) => a.id - b.id)) {
    const cmd = w.citizens[u.commander];
    if (!cmd || cmd.player) continue;
    const n = w.nations[u.nation];
    const pb = n.priorities.battle != null ? w.battles[n.priorities.battle] : null;
    if (pb && !pb.done) { if (u.order?.battle !== pb.id) { setOrder(w, cmd, u.id, pb.id, n.priorities.side ?? 'a'); u.battlesFought++; } }
    else if (u.order && (!w.battles[u.order.battle] || w.battles[u.order.battle].done)) u.order = null;
    u.doctrine = cmd.fightStyle === 'late' ? 'surge' : cmd.fightStyle === 'early' ? 'steady' : 'conserve';
    if (h === 17) {
      const cash = u.wallet[n.cur] ?? 0;
      if (cash > 2000 && !n.exile) {
        // Buy the best damage-per-currency ground weapons with half the unit funds.
        const opts = [1, 2, 3, 4, 5].map((q) => { const l = listingsFor(w, n.id, `wg:${q}`)[0]; return l ? { q, v: B.damage.ground[q - 1] / l.price, price: l.price } : null; })
          .filter(Boolean).sort((a, b) => b!.v - a!.v) as { q: number; price: number }[];
        const o = opts[0];
        if (o) buyBest(w, cmd.id, unitRef(u.id), n.id, `wg:${o.q}`, Math.floor(cash / 2 / o.price), Math.round(o.price * 1.3));
      }
      if (Object.keys(u.inv).length) distribute(w, cmd, u.id);
    }
  }
  void pl; void members;
}

/** Defense budget: in wartime the treasury funds its units' supply purchases. */
export function defenseBudget(w: World) {
  for (const war of activeWars(w)) for (const nid_ of [war.att, war.def]) {
    const n = w.nations[nid_];
    const actor = govActor(n);
    if (actor == null || w.citizens[actor]?.player) continue;
    const units = Object.values(w.units).filter((u) => u.nation === n.id);
    const budget = Math.floor((n.wallet[n.cur] ?? 0) * 0.03);
    for (const u of units) {
      const amt = Math.floor(budget / Math.max(1, units.length));
      if (amt > 0 && pay(w, natref(n.id), unitRef(u.id), n.cur, amt, 'Defense budget')) n.stats.spendToday += amt;
    }
  }
}

/** Relations drift for understandable reasons (borders, ideology, trade, wars, alliances). */
export function diplomacyDaily(w: World) {
  const nations = w.nations;
  for (let i = 0; i < nations.length; i++) for (let j = i + 1; j < nations.length; j++) {
    const a = nations[i], b = nations[j];
    const sa = seatShare(w, a), sb = seatShare(w, b);
    let sim = 0;
    for (const k of Object.keys(IDEOLOGIES)) sim += Math.min(sa[k] ?? 0, sb[k] ?? 0);
    const border = w.regions.some((r) => controller(r) === a.id && r.links.some((l) => controller(w.regions[l]) === b.id));
    const atWar = activeWars(w).some((x) => (x.att === a.id && x.def === b.id) || (x.att === b.id && x.def === a.id));
    const hawk = ((sa.imperialism ?? 0) + (sb.imperialism ?? 0)) / 2;
    const enemiesOf = (id: Id) => new Set(activeWars(w).filter((x) => x.att === id || x.def === id).map((x) => enemyOf(x, id)));
    const ea = enemiesOf(a.id), eb = enemiesOf(b.id);
    const sharedEnemy = [...ea].some((e) => eb.has(e));
    let d = 0; const why: string[] = [];
    if (sim > 0.3) { d += 0.6; why.push('similar governments'); }
    if (border && hawk > 0.2) { d -= 0.8; why.push('border tension'); }
    if (atWar) { d -= 1; why.push('ongoing war'); }
    if (sharedEnemy) { d += 1.2; why.push('shared enemy'); }
    if (a.alliances.includes(b.id)) { d += 0.4; why.push('alliance'); }
    const cur = a.relations[b.id]?.score ?? 0;
    d += -cur * 0.01; // slow regression toward neutral
    if (Math.abs(d) >= 0.5) relation(w, a.id, b.id, Math.round(d * 10) / 10, why.join(', ') || 'drift');
    else { a.relations[b.id].score += d; b.relations[a.id].score += d; }
  }
}

export function aiClaimReserves(w: World) {
  for (const c of Object.values(w.citizens)) if (!c.player && c.reserve > 0) claimReserve(w, c);
}

export function militaryHourly(w: World) {
  computeSupply(w);
  defenseAI(w);
  commandersAI(w);
}
