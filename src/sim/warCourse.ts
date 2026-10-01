// How wars run and end (2.2 War & peace). Replaces the old rule that a war simply ended at
// its deadline:
// - Kinds: an invasion (several regions claimed), a limited war (one region), or a
//   punitive war (no territory, only to hurt the enemy).
// - Exhaustion (0–100 for each side) rises with losses, cost, lost territory and time,
//   and falls with victories. It drives approval at home and the appetite for peace
//   (peaceAppetite in war.ts reads it).
// - Escalation: a ladder from border fighting to a limited war, a general war (cities and
//   industry struck), and finally nuclear threats. The losing side climbs when it is
//   determined and has a lot at stake; exhaustion brings both sides down. Higher rungs
//   kill more and do more damage; nuclear use (nuclear.ts) needs the top rung.
// - The deadline is a review, not an ending. If both sides still have fight in them, the
//   war drags on. If the attacker holds ground it cannot win and the other side cannot
//   retake, the line freezes: a frozen conflict, with occupation and no peace. Otherwise
//   the offensive peters out and the occupied land is returned.
// - Peace terms: a negotiated peace brings a non-aggression treaty for years, not days;
//   a loser who gave ground pays reparations; territory changing hands leaves a
//   demilitarised zone; prisoners are exchanged (warHome.ts).
// - Frozen conflicts can thaw years later into a settlement once relations allow it.
import type { Id, Nation, War, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { nid, notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { GOLD, fmtAmt } from '../engine/money';
import { controller, player } from './query';
import { relation } from './congress';
import { addGrievance, leaderProfile } from './relations';
import { note } from './warChronicle';
import { activeBattles, finishBattle } from './battle';
import { activeWars, enemyOf } from './war';
import { tollOf } from './warHome';
import { signTreaty } from './treaties';
import { dailyRevenue } from './publicFinance';
import { nationals } from './census';

export type WarKind = 'invasion' | 'limited' | 'punitive';
export const WAR_KIND_LABEL: Record<WarKind, string> = { invasion: 'an invasion', limited: 'a limited war', punitive: 'a punitive war' };
export const LEVEL_LABEL = ['', 'border fighting', 'a limited war', 'a general war (cities and industry struck)', 'nuclear threats'];

export const warKindOf = (war: War): WarKind => war.kind ?? (war.goals.length > 1 ? 'invasion' : war.goals.length === 1 ? 'limited' : 'punitive');
export const exhaustionOf = (war: War, side: Id) => war.exhaust?.[side] ?? 0;
export const levelOf = (war: War) => war.level ?? 1;

/** Daily: exhaustion and escalation for every war under way. */
function course(w: World) {
  const fighting = new Set<Id>();
  for (const b of activeBattles(w)) if (b.kind === 'war' && b.war != null) fighting.add(b.war);
  for (const war of activeWars(w)) {
    war.kind ??= warKindOf(war);
    const ex = (war.exhaust ??= {});
    const toll = tollOf(war);
    for (const side of [war.att, war.def]) {
      const n = w.nations[side];
      const soldiers = Math.max(10, nationals(w, side).filter((c) => c.mil?.branch).length);
      const lostLand = w.regions.filter((r) => r.owner === side && r.occ && r.occ.nation !== side).length;
      const losses = (toll.killed[side] ?? 0) / soldiers;
      const cost = (toll.spent[side] ?? 0) / Math.max(1, dailyRevenue(n) * 30);
      const target = Math.min(100, 8 + (w.time - war.declared) / DAY * 0.6 + losses * 300 + cost * 10 + lostLand * 8 - n.warScore / 4 + (levelOf(war) - 1) * 6);
      ex[side] = Math.round(((ex[side] ?? 0) + (target - (ex[side] ?? 0)) * 0.1) * 10) / 10;
      n.approval = Math.max(5, n.approval - ex[side] / 100 * 0.15); // a long, costly war wears a government down
    }
    // Escalation: the side with more at stake and more resolve climbs; exhaustion brings both down.
    const lv = levelOf(war);
    const climb = (side: Id) => {
      const n = w.nations[side];
      const lp = leaderProfile(w, n);
      const stake = w.regions.filter((r) => r.owner === side && r.occ).length * 0.15 + (n.warScore < -20 ? 0.2 : 0);
      return (lp.hawk * 0.5 + lp.risk * 0.3 + stake - ex[side] / 150) * (fighting.has(war.id) ? 1 : 0.5);
    };
    const pressure = Math.max(climb(war.att), climb(war.def));
    // Nuclear threats only from a country whose own land is occupied or which is losing badly.
    const desperate = [war.att, war.def].some((s) => w.regions.some((r) => r.owner === s && r.occ) || w.nations[s].warScore < -40);
    if (lv < (desperate ? 4 : 3) && chance(w, Math.max(0, pressure - 0.45) * 0.03)) {
      war.level = lv + 1;
      const who = climb(war.att) >= climb(war.def) ? war.att : war.def;
      const text = `🔺 The war between ${w.nations[war.att].name} and ${w.nations[war.def].name} escalated to ${LEVEL_LABEL[war.level]} (${w.nations[who].name} raised the stakes).`;
      record(w, 'war', text, { nation: who, important: war.level >= 3 });
      (war.log ??= []).push({ t: w.time, text });
      note(w, war, '🔺', text);
      if (war.att === player(w).nation || war.def === player(w).nation) notify(w, 'warHome', text, { link: 'wars', critical: war.level >= 3 });
      if (war.level === 4) for (const o of w.nations) if (o.id !== who && !o.exile) relation(w, o.id, who, -5, 'made nuclear threats');
    } else if (lv > 1 && Math.min(ex[war.att], ex[war.def]) > 60 && chance(w, 0.05)) {
      war.level = lv - 1;
      note(w, war, '🔻', `Exhausted, both sides stepped the war back to ${LEVEL_LABEL[lv - 1]}.`);
      record(w, 'war', `🔻 Exhausted, ${w.nations[war.att].name} and ${w.nations[war.def].name} stepped the war back to ${LEVEL_LABEL[war.level]}.`, { nation: war.att });
    }
    // A general war strikes cities and industry.
    if (levelOf(war) >= 3) for (const side of [war.att, war.def]) {
      if (!chance(w, 0.2)) continue;
      const enemy = enemyOf(war, side);
      const targets = w.regions.filter((r) => controller(r) === enemy && r.bld.industrial > 0);
      const r = targets[Math.floor((w.time / DAY + side) % Math.max(1, targets.length))];
      if (!r) continue;
      r.bld.industrial = Math.max(0, r.bld.industrial - 1);
      for (const co of Object.values(w.companies)) if (co.region === r.id) co.halt = { until: w.time + 2 * DAY, why: 'Bombed' };
      record(w, 'war', `💥 ${w.nations[side].name} struck industry in ${r.name}.`, { region: r.id, nation: enemy, important: r.owner === player(w).nation });
    }
  }
}

/** The deadline is a review: the war drags on, freezes, or peters out. Returns true if it was handled. */
export function reviewAtDeadline(w: World, war: War): 'extended' | 'frozen' | 'deadline' {
  const ex = war.exhaust ?? {};
  const attEx = ex[war.att] ?? 0, defEx = ex[war.def] ?? 0;
  const holding = war.occupied.length > 0;
  if ((war.extensions ?? 0) < 2 && attEx < 50 && defEx < 50) {
    war.extensions = (war.extensions ?? 0) + 1;
    war.deadline = w.time + 14 * DAY;
    const text = `⏳ Neither side gave way: the war between ${w.nations[war.att].name} and ${w.nations[war.def].name} drags on.`;
    record(w, 'war', text, { nation: war.att });
    (war.log ??= []).push({ t: w.time, text });
    note(w, war, '⏳', text);
    return 'extended';
  }
  if (holding && attEx < 70) { freeze(w, war); return 'frozen'; }
  return 'deadline';
}

/** A frozen conflict: the fighting stops along the line, with no peace. */
export function freeze(w: World, war: War) {
  for (const bid of war.battles) { const b = w.battles[bid]; if (b && !b.done) finishBattle(w, b, null); }
  war.status = 'frozen';
  war.frozen = w.time;
  war.outcome = `frozen conflict: ${war.occupied.map((r) => w.regions[r].name).join(', ')} still occupied`;
  const until = w.time + 365 * DAY;
  w.nations[war.att].pacts[war.def] = until;
  w.nations[war.def].pacts[war.att] = until;
  const text = `🧊 The war between ${w.nations[war.att].name} and ${w.nations[war.def].name} froze along the front line. ${war.occupied.map((r) => w.regions[r].name).join(', ')} remain${war.occupied.length === 1 ? 's' : ''} occupied, with no peace treaty.`;
  record(w, 'war', text, { nation: war.att, important: true });
  note(w, war, '🧊', text);
  for (const id of [war.att, war.def]) (w.nations[id].chronicle ??= []).push({ t: w.time, text });
  if (war.att === player(w).nation || war.def === player(w).nation) notify(w, 'warHome', text, { link: 'wars', critical: true });
}

/** Years later, a frozen conflict can be settled once relations allow: the land goes back. */
function thaw(w: World) {
  for (const war of Object.values(w.wars)) {
    if (war.status !== 'frozen' || w.time - (war.frozen ?? w.time) < 365 * DAY) continue;
    const rel = Math.min(w.nations[war.att].relations[war.def]?.score ?? 0, w.nations[war.def].relations[war.att]?.score ?? 0);
    if (rel < 0 || !chance(w, 0.1)) continue;
    for (const rid of war.occupied) { const r = w.regions[rid]; if (r.occ?.war === war.id) r.occ = null; }
    war.status = 'ended';
    war.outcome = (war.outcome ?? '') + '; later settled, the land returned';
    record(w, 'war', `🕊️ ${w.nations[war.att].name} and ${w.nations[war.def].name} finally settled their frozen conflict: the occupied land was returned.`, { nation: war.att, important: true });
  }
}

/** Peace terms beyond territory (called from settle in war.ts). */
export function peaceTerms(w: World, war: War, kind: string, transferred: Id[]) {
  const att = w.nations[war.att], def = w.nations[war.def];
  // A negotiated peace comes with a non-aggression treaty for years, not days.
  if (kind !== 'deadline') signTreaty(w, 'nonaggression', [att.id, def.id], { name: `Peace of ${dateAt(w.time).year}: ${att.name}–${def.name}`, years: 3, quiet: true });
  // Land changing hands leaves a demilitarised zone along the new border.
  for (const rid of transferred) w.regions[rid].dmzUntil = w.time + 2 * 365 * DAY;
  // Reparations: a loser who gave ground pays the winner over a year.
  const loser: Nation | null = transferred.length ? (transferred.every((r) => w.regions[r].owner === att.id) ? def : att) : kind === 'surrender' ? def : null;
  if (loser) {
    const winner = loser.id === att.id ? def : att;
    const amt = Math.floor((loser.wallet[GOLD] ?? 0) * 0.1);
    if (amt > 0) {
      (w.intlLoans ??= []).push({ id: nid(w), from: winner.id, to: loser.id, left: amt, monthly: Math.ceil(amt / 12), reparations: true });
      war.reparations = { from: loser.id, to: winner.id, amount: amt };
      note(w, war, '💰', `${loser.name} must pay ${winner.name} ${fmtAmt(GOLD, amt)} in reparations over a year.`);
      record(w, 'war', `💰 ${loser.name} must pay ${winner.name} ${fmtAmt(GOLD, amt)} in reparations over a year.`, { nation: loser.id });
    }
  }
}

/** After the war: memorials to the fallen, tribunals after the worst wars, and veterans. */
export function aftermath(w: World, war: War, kind: string) {
  const toll = war.toll;
  for (const side of [war.att, war.def]) {
    const fallen = toll?.killed[side] ?? 0;
    if (fallen > 0) {
      const text = `🕯️ ${w.nations[side].name} raised a memorial to the ${fallen} who fell in the war with ${w.nations[side === war.att ? war.def : war.att].name}.`;
      record(w, 'war', text, { nation: side });
      note(w, war, '🕯️', text);
    }
  }
  // A brutal war that ends in victory brings a tribunal for the losers' commanders, and a lasting grievance.
  if (levelOf(war) >= 3 && (kind === 'conquest' || kind === 'surrender')) {
    const loser = w.nations[war.att].warScore < w.nations[war.def].warScore ? war.att : war.def; // the side that fared worse
    const winner = loser === war.att ? war.def : war.att;
    addGrievance(w, loser, winner, 15);
    const text = `⚖️ ${w.nations[winner].name} put ${w.nations[loser].adj} commanders on trial for war crimes. ${w.nations[loser].name} calls it victors' justice.`;
    record(w, 'war', text, { nation: winner, important: true });
    note(w, war, '⚖️', text);
  }
  // Those called up come home as veterans.
  for (const c of Object.values(w.citizens)) if (!c.gone && c.mil?.calledUp === war.id) c.flags.veteranOf = war.id;
}

export function warCourseDaily(w: World) {
  course(w);
  if (dateAt(w.time).day === 1) thaw(w);
}

// Kept for the war room: who is more exhausted, in words.
export function exhaustionWords(v: number) {
  return v > 75 ? 'spent' : v > 50 ? 'weary' : v > 25 ? 'strained' : 'fresh';
}
