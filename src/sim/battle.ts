// Battles: multi-round contests. Each 160-minute round has 16 ten-minute
// scoring ticks worth 100/200/300/600 points by segment (4,800 per round).
// SOLO tick rule: a tick's points go to the side leading in round damage at
// the end of that tick (ties → defender). A round is won with more points
// (≥2,401); the battle by the first side to win B.battle.roundsToWin rounds.
// Damage, scoring points, round wins and the final outcome are kept distinct.
import type { Battle, Citizen, Id, World } from './types';
import { B } from '../data/balance';
import { itemName } from '../data/items';
import { fail, ok, type Result } from '../engine/result';
import { consume, mint } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { nid, notify } from '../engine/events';
import { chance } from '../engine/rng';
import { addXp } from './citizen';
import { hitPreview, sideNation, type WeaponSel } from './combatMath';
import { controller, cref, player, today, jailed } from './query';
import { rollDrop } from './gear';
import { bump } from './progress';
import { onBattleWon } from './warHooks';

export const TICKS_PER_ROUND = () => B.battle.roundMinutes / 10;
export const tickPoints = (tickIdx: number) => B.battle.segmentPtsPerMin[Math.min(3, Math.floor(tickIdx / 4))] * 10;
export const roundPoints = () => { let s = 0; for (let i = 0; i < TICKS_PER_ROUND(); i++) s += tickPoints(i); return s; };
export const tickIndex = (b: Battle, t: number) => Math.floor((t - b.roundStart) / 10);
export const segmentOf = (b: Battle, t: number) => Math.min(3, Math.floor(tickIndex(b, t) / 4));

export function createBattle(w: World, kind: Battle['kind'], region: Id, att: Id, def: Id, war: Id | null, airOnly = false, eventRef?: Id): Battle {
  const b: Battle = {
    id: nid(w), kind, war, region, att, def, airOnly, started: w.time, roundStart: w.time, round: 1,
    pts: { a: 0, d: 0 }, dmg: { a: 0, d: 0 }, wins: { a: 0, d: 0 }, rounds: [], cur: {}, total: {}, hits: { a: 0, d: 0 }, ticks: [],
    weaponsUsed: { a: 0, d: 0 }, done: false, winner: null, eventRef,
  };
  w.battles[b.id] = b;
  return b;
}

export const activeBattles = (w: World) => Object.values(w.battles).filter((b) => !b.done).sort((a, b) => a.id - b.id);

/** Can this citizen fight for `side`? Location rule (SOLO): be in territory controlled by that side or an ally. */
export function fightCheck(w: World, c: Citizen, b: Battle | undefined, side: 'a' | 'd', weapon: WeaponSel): string | null {
  if (jailed(w, c)) return 'You are in prison.';
  if (!b) return 'Battle not found.';
  if (b.done) return 'This battle is over.';
  if (b.kind === 'tournament') return 'Tournament bouts are fought from the Stadium.';
  if (c.mining) return 'Fighting is blocked while mining.';
  const nat = sideNation(b, side);
  const other = sideNation(b, side === 'a' ? 'd' : 'a');
  if (nat >= 0 && other === c.nation) return 'You cannot fight against your own nation.';
  if (nat >= 0 && b.kind === 'war') {
    // Location rule (SOLO): fight from territory your side controls or legally owns (occupied homelands
    // can resist), from an ally's territory, or from the battlefield itself.
    const r = w.regions[c.loc];
    const here = controller(r);
    const allies = w.nations[nat].alliances;
    if (here !== nat && r.owner !== nat && r.core !== nat && !allies.includes(here) && c.loc !== b.region) return `Travel to ${w.nations[nat].name} (or an ally) to fight for this side.`;
  }
  const pv = hitPreview(w, c, b, side, weapon);
  if (c.energy < pv.energy) return `Not enough energy (${Math.floor(c.energy)}/${pv.energy}).`;
  if (weapon && (c.inv[`${weapon.kind}:${weapon.q}`] ?? 0) < 1) return `No ${itemName(`${weapon.kind}:${weapon.q}`)} left.`;
  return null;
}

/** Execute one hit. The selected weapon is consumed even on a miss (wiki). */
export function hit(w: World, c: Citizen, bid: Id, side: 'a' | 'd', weapon: WeaponSel): Result {
  const b = w.battles[bid];
  const why = fightCheck(w, c, b, side, weapon);
  if (why) return fail(why);
  const pv = hitPreview(w, c, b, side, weapon);
  c.energy -= pv.energy;
  if (weapon) {
    consume(w, cref(c.id), `${weapon.kind}:${weapon.q}`, 1, 'combat');
    b.weaponsUsed[side]++;
  }
  let dmg = 0;
  let crit = false;
  const landed = chance(w, pv.hit / 100);
  if (landed) {
    crit = chance(w, pv.crit / 100);
    dmg = Math.round(pv.dmg * (crit ? pv.critDmg / 100 : 1));
  }
  b.hits[side]++;
  b.dmg[side] += dmg;
  const cur = (b.cur[c.id] = b.cur[c.id] ?? { a: 0, d: 0 });
  cur[side] += dmg;
  const tot = (b.total[c.id] = b.total[c.id] ?? { a: 0, d: 0 });
  tot[side] += dmg;
  if (b.kind !== 'training') c.dmgTotal += dmg;
  c.flags.hitDay = today(w);
  addXp(w, c, B.xp.hit);
  rollDrop(w, c, B.gear.dropAttack, 'combat', w.regions[b.region]?.terrain);
  if (c.player) { bump(w, 'hit'); if (dmg) bump(w, 'dmgDealt', dmg); }
  return ok(landed ? `${crit ? 'Critical hit' : 'Hit'} for ${dmg.toLocaleString()} damage.` : 'Missed!', { dmg, crit, landed });
}

/** Several hits in a row (stops on the first failure). */
export function hitMany(w: World, c: Citizen, bid: Id, side: 'a' | 'd', weapon: WeaponSel, n: number): Result {
  let total = 0, count = 0, crits = 0, misses = 0;
  let last: Result | null = null;
  for (let i = 0; i < n; i++) {
    const r = hit(w, c, bid, side, weapon);
    last = r;
    if (!r.ok) break;
    count++; total += r.data.dmg; if (r.data.crit) crits++; if (!r.data.landed) misses++;
  }
  if (!count) return last ?? fail('No hits made.');
  return ok(`${count} hit${count > 1 ? 's' : ''}: ${total.toLocaleString()} damage (${crits} crit, ${misses} missed).${last && !last.ok ? ` Stopped: ${last.msg}` : ''}`);
}

/** Called every tick after fighters act: award this tick's points, close rounds. */
export function battleTick(w: World, b: Battle) {
  if (b.done) return;
  const idx = tickIndex(b, w.time) - 1; // the tick that just ended
  if (idx < 0) return;
  const pts = tickPoints(Math.min(idx, TICKS_PER_ROUND() - 1));
  const tw = b.dmg.a > b.dmg.d ? 'a' : 'd';
  b.pts[tw] += pts;
  b.ticks.push(tw);
  if (idx + 1 >= TICKS_PER_ROUND()) endRound(w, b);
}

function poolFor(dmg: number) {
  let pool = B.battle.pool.base;
  for (const t of B.battle.pool.thresholds) if (dmg >= t) pool *= 2;
  return Math.min(B.battle.pool.max, pool);
}

function endRound(w: World, b: Battle) {
  const winner: 'a' | 'd' = b.pts.a > b.pts.d ? 'a' : 'd';
  // Reward pools per side: shared by damage regardless of victory (DOC); 40% direct, 60% to reserve (cap 30).
  let hero: Id | null = null, heroDmg = 0;
  const pl = player(w);
  for (const side of ['a', 'd'] as const) {
    const total = b.dmg[side];
    if (total <= 0) continue;
    const pool = g(poolFor(total) * (b.kind === 'training' ? 0.1 : 1));
    for (const [id, v] of Object.entries(b.cur)) {
      const dmg = v[side];
      if (dmg <= 0) continue;
      const c = w.citizens[Number(id)];
      if (!c) continue;
      const share = Math.floor((pool * dmg) / total);
      const direct = Math.floor(share * B.battle.directShare);
      const toReserve = Math.min(share - direct, g(B.battle.reserveCap) - c.reserve);
      if (direct > 0) mint(w, cref(c.id), GOLD, direct, 'Battle reward pool');
      if (toReserve > 0) c.reserve += toReserve; // a claim, minted only when claimed
      if (dmg > heroDmg) { heroDmg = dmg; hero = c.id; }
    }
  }
  b.rounds.push({ a: b.dmg.a, d: b.dmg.d, ptsA: b.pts.a, ptsD: b.pts.d, winner, hero });
  b.wins[winner]++;
  const involved = b.cur[pl.id] && (b.cur[pl.id].a || b.cur[pl.id].d);
  if (involved) notify(w, 'war', `⚔️ Round ${b.round} in ${w.regions[b.region]?.name ?? 'battle'} won by ${sideLabel(w, b, winner)} (${b.pts.a}–${b.pts.d} pts). Your round damage: ${(b.cur[pl.id].a + b.cur[pl.id].d).toLocaleString()}.`, { link: 'battle' });
  b.cur = {};
  b.ticks = [];
  b.pts = { a: 0, d: 0 };
  b.dmg = { a: 0, d: 0 };
  b.round++;
  b.roundStart = w.time;
  if (b.wins[winner] >= B.battle.roundsToWin) finishBattle(w, b, winner);
}

export const sideLabel = (w: World, b: Battle, s: 'a' | 'd') => {
  const id = s === 'a' ? b.att : b.def;
  return id >= 0 ? w.nations[id].name : 'Pirates';
};

export function finishBattle(w: World, b: Battle, winner: 'a' | 'd' | null) {
  if (b.done) return;
  b.done = true;
  b.winner = winner;
  b.ended = w.time;
  if (!winner) return;
  // Hero medals: highest total damage on each side (exclusive per side).
  for (const side of ['a', 'd'] as const) {
    let best: Id | null = null, bd = 0;
    for (const [id, v] of Object.entries(b.total)) if (v[side] > bd) { bd = v[side]; best = Number(id); }
    if (best != null) {
      const c = w.citizens[best];
      c.medals.hero = (c.medals.hero ?? 0) + 1;
      c.influence += 1;
      if (c.player) { bump(w, 'hero'); notify(w, 'progress', `🎖️ Hero medal: top damage for ${sideLabel(w, b, side)} in ${w.regions[b.region]?.name ?? 'the battle'}.`); }
    }
  }
  onBattleWon(w, b, winner);
}

/** Claim combat-reserve gold (the solo replacement for the gem-gated piggy bank). */
export function claimReserve(w: World, c: Citizen): Result {
  if (c.reserve <= 0) return fail('Your reward reserve is empty.');
  const amt = c.reserve;
  c.reserve = 0;
  mint(w, cref(c.id), GOLD, amt, 'Combat reserve claimed');
  return ok(`Claimed ${(amt / 1000).toFixed(3)} gold from your reserve.`);
}
