// Civil wars and dynamic nations (2.3 Rise & fall).
// - Civil war: when an uprising is met with force in a country whose regime has lost
//   its legitimacy, or when the army splits after a failed coup, the rebels may take and
//   hold regions. They form a rebel government (a faction: a state of its own, with
//   citizens, a treasury and an army) and the government fights to retake the land with
//   the ordinary war machinery. Most countries do not recognise the rebels; the
//   government's rivals do.
// - How it ends: if the government retakes everything, the rebellion is crushed and the
//   faction dissolves back into the country. If the rebels take the capital or the
//   government surrenders, the rebels take over the whole country. A war that freezes,
//   or ends with the rebels still holding land, leaves the country partitioned.
// - Mergers: a state can be absorbed by another, by conquest (a breakaway state wholly
//   retaken) or by a voluntary union (a partitioned or seceded state that rejoins its old
//   country when relations are good). Citizens, firms and the treasury convert to the
//   new money at the market rate; the old state ceases to exist.
// - Failed states: when legitimacy collapses, the regions are in turmoil and the
//   treasury is empty, the state stops working: institutions decay, unrest spreads and
//   coups become likelier. It recovers when legitimacy and order return.
// - Restoration: a government in exile can return when the people of its occupied home
//   regions rise against the occupier.
import type { AccountRef, Citizen, Id, Nation, War, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { mint, pay } from '../engine/ledger';
import { GOLD } from '../engine/money';
import { census, invalidateCensus } from './census';
import { companyCurrency, coref, cref, hhref, natref, player } from './query';
import { relation } from './congress';
import { capsOf, historyPace } from './strategic';
import { changeRegime, isDemocracy, regimeOf } from './regimes';
import { appointCabinetAI } from './politics';
import { changeCitizenship } from './travel';
import { activeWars, computeSupply, declareWar, updateExile, warCheck } from './war';
import { createState } from './secession';
import { endTreaty, signTreaty } from './treaties';
import { militaryPower } from './war';
import { leaderProfile } from './relations';
import { identityOf } from './secession';
import { exhaustionOf } from './warCourse';

const avgUnrest = (w: World, n: Nation) => w.regions.filter((x) => x.owner === n.id).reduce((s, x, _i, a) => s + x.unrest / a.length, 0);
const chron = (w: World, text: string, ...ns: Nation[]) => { for (const n of ns) (n.chronicle ??= []).push({ t: w.time, text }); };
export const isCivilWar = (w: World, war: War) => war.kind === 'civil' || war.kind === 'secession';
/** States that still exist (not dissolved into another). */
export const living = (n: Nation) => n.dissolved == null;

// ---------- civil war ----------

/** Rebels take the most restless regions (never the capital): up to a third of the country. */
function rebelRegions(w: World, n: Nation): Id[] {
  const own = w.regions.filter((r) => r.owner === n.id && !r.occ);
  if (own.length < 3) return [];
  return own.filter((r) => r.id !== n.capital).sort((a, b) => b.unrest - a.unrest || b.pop - a.pop || a.id - b.id).slice(0, Math.max(1, Math.floor(own.length / 3))).map((r) => r.id);
}

/** Start a civil war: the rebels form a government in the regions they hold, and the government fights them. */
export function startCivilWar(w: World, n: Nation, why: string, leader?: Citizen, defect = 0.15): Nation | null {
  const regions = rebelRegions(w, n);
  if (!regions.length || n.exile) return null;
  const f = createState(w, n, regions, 'rebellion', { name: `Free ${n.name}`, adj: `Free ${n.adj}`, leader: leader?.id, defect });
  f.faction = true;
  regimeOf(f).type = isDemocracy(n) ? 'junta' : 'hybrid';
  regimeOf(f).legitimacy = 45;
  const text = `⚔️ ${why}: civil war has broken out in ${n.name}.`;
  record(w, 'war', text, { nation: n.id, important: true });
  chron(w, text, n);
  const params = { target: f.id, days: 30, goals: regions.slice(0, 2) };
  if (!warCheck(w, n, params)) declareWar(w, n, params).kind = 'civil';
  if (player(w).nation === n.id || player(w).nation === f.id) notify(w, 'warHome', text, { link: 'wars', critical: true });
  return f;
}

/** Ended civil wars: crushed, victorious rebels, or a country partitioned. */
function resolveCivilWars(w: World) {
  for (const war of Object.values(w.wars)) {
    if (!isCivilWar(w, war) || war.status === 'active' || war.civilDone) continue;
    const gov = w.nations[war.att], reb = w.nations[war.def];
    if (!living(reb)) { war.civilDone = true; continue; }
    if (reb.exile) {
      // The government retook everything: the rebellion is over.
      war.civilDone = true;
      mergeState(w, reb, gov, war.kind === 'secession' ? 'retaken' : 'crushed');
      continue;
    }
    const tookCapital = w.regions[gov.capital]?.owner === reb.id || /surrender/.test(war.outcome ?? '') && gov.warScore < reb.warScore;
    if (war.kind === 'civil' && tookCapital) {
      war.civilDone = true;
      rebelVictory(w, reb, gov);
      continue;
    }
    // A government with fight left presses on against the rebels' remaining land (a new campaign).
    const rest = w.regions.filter((r) => r.owner === reb.id).map((r) => r.id);
    if (war.status === 'ended' && rest.length && exhaustionOf(war, gov.id) < 60 && !/armistice|surrender|demand/.test(war.outcome ?? '') && !gov.exile) {
      war.civilDone = true;
      for (const t of Object.values(w.treaties ?? {})) if (t.status === 'active' && t.kind === 'nonaggression' && t.parties.includes(gov.id) && t.parties.includes(reb.id)) endTreaty(w, t, 'ended', gov.id, 'the civil war goes on');
      delete gov.pacts[reb.id];
      delete reb.pacts[gov.id];
      const params = { target: reb.id, days: 30, goals: rest.slice(0, 2) };
      if (!warCheck(w, gov, params)) {
        const next = declareWar(w, gov, params);
        next.kind = war.kind;
        next.exhaust = { ...(war.exhaust ?? {}) };
        next.level = war.level;
        continue;
      }
    }
    if (war.status === 'ended' || war.status === 'frozen') {
      war.civilDone = true;
      const text = `🗺️ ${gov.name} is partitioned: ${reb.name} holds ${w.regions.filter((r) => r.owner === reb.id).map((r) => r.name).join(', ')} with a government of its own.`;
      record(w, 'war', text, { nation: gov.id, important: true });
      chron(w, text, gov, reb);
      // A breakaway state kept alive by a foreign sponsor's arms answers to it.
      const top = Object.entries(reb.armedBy ?? {}).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2 && living(w.nations[Number(top[0])]) && !w.nations[Number(top[0])].exile) makePuppet(w, reb, w.nations[Number(top[0])], 'it armed the rebels');
    }
  }
}

// ---------- puppet states ----------

/** A state that answers to a stronger one: bound by a defence treaty, paying tribute, unable to attack it. */
export function makePuppet(w: World, puppet: Nation, overlord: Nation, why: string) {
  if (puppet.overlord != null || puppet.id === overlord.id || overlord.overlord === puppet.id) return;
  puppet.overlord = overlord.id;
  signTreaty(w, 'defence', [overlord.id, puppet.id], { name: `${overlord.name}–${puppet.name} protectorate`, years: 10, quiet: true });
  puppet.relations[overlord.id].score = Math.max(puppet.relations[overlord.id]?.score ?? 0, 50);
  overlord.relations[puppet.id].score = Math.max(overlord.relations[puppet.id]?.score ?? 0, 50);
  const text = `🎎 ${puppet.name} has become a puppet of ${overlord.name} (${why}): its foreign policy and its tribute now answer to ${overlord.name}.`;
  record(w, 'diplomacy', text, { nation: puppet.id, important: true });
  chron(w, text, puppet, overlord);
  if (player(w).nation === puppet.id || player(w).nation === overlord.id) notify(w, 'diplomacy', text, { critical: true });
}

/** After a war, a victor much stronger than a small or breakaway state may make it a puppet instead of annexing it. */
export function maybePuppetAfterWar(w: World, winner: Nation, loser: Nation) {
  if (loser.exile || winner.exile || loser.overlord != null) return;
  const small = loser.parent != null || w.regions.filter((r) => r.owner === loser.id).length <= 3;
  if (!small || militaryPower(w, winner.id) < militaryPower(w, loser.id) * 3) return;
  if (chance(w, 0.3 + leaderProfile(w, winner).hawk * 0.4)) makePuppet(w, loser, winner, 'it lost a war');
}

function puppets(w: World) {
  for (const n of w.nations) {
    if (n.overlord == null) continue;
    const o = w.nations[n.overlord];
    const free = (why: string) => {
      delete n.overlord;
      for (const t of Object.values(w.treaties ?? {})) if (t.status === 'active' && t.kind === 'defence' && t.parties.length === 2 && t.parties.includes(n.id) && t.parties.includes(o.id)) endTreaty(w, t, 'ended', n.id, why);
      relation(w, o.id, n.id, -15, 'broke free');
      const text = `⛓️‍💥 ${n.name} broke free of ${o.name}: ${why}.`;
      record(w, 'diplomacy', text, { nation: n.id, important: true });
      chron(w, text, n, o);
    };
    if (!living(n) || n.exile) { delete n.overlord; continue; }
    if (!living(o) || o.exile) { free(`${o.name} can no longer hold it`); continue; }
    // Tribute, and a floor under relations.
    const tribute = Math.floor((n.wallet[GOLD] ?? 0) * 0.02);
    if (tribute > 0) pay(w, natref(n.id), natref(o.id), GOLD, tribute, `Tribute to ${o.name}`);
    n.relations[o.id].score = Math.max(n.relations[o.id]?.score ?? 0, 30);
    // A chance to break free when the overlord is weakened or the puppet's government turns.
    const losing = activeWars(w).some((x) => (x.att === o.id || x.def === o.id) && o.warScore < -20);
    if (chance(w, 0.004 + (losing ? 0.03 : 0) + (leaderProfile(w, n).nationalism > 0.7 ? 0.01 : 0))) free(losing ? `${o.name} is losing a war` : 'a nationalist government refused to obey');
  }
}

// ---------- insurgency and peacekeeping ----------

/** Armed resistance: annexed land, frustrated independence movements and failed states feed it. */
function insurgencies(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const own = w.regions.filter((r) => r.owner === n.id);
    const restive = own.filter((r) => (r.core != null && r.core !== n.id) || (r.indep ?? 0) > 50 && identityOf(r) > 40);
    const push = restive.length * 6 + (n.failedSince != null ? 15 : 0);
    const caps = capsOf(w, n);
    n.insurgency = Math.max(0, Math.min(100, (n.insurgency ?? 0) * (0.9 - caps.inst.effectiveness * 0.05) + push - 4));
    if ((n.insurgency ?? 0) < 30) continue;
    // Attacks: troops worn down, unrest, an unpopular government.
    for (const r of restive) {
      r.unrest = Math.min(100, r.unrest + 3);
      for (const f of Object.values(w.forces)) if (f.nation === n.id && f.loc === r.id && f.branch === 'army') f.strength = Math.max(10, f.strength - 2);
    }
    n.approval = Math.max(5, n.approval - 0.5);
    if (chance(w, 0.3) && restive.length) record(w, 'war', `💣 Insurgents struck ${n.adj} forces in ${restive[Math.floor((w.time / DAY) % restive.length)].name}.`, { nation: n.id });
  }
}

function peacekeeping(w: World) {
  for (const war of Object.values(w.wars)) {
    const pk = war.peacekeepers;
    if (!pk || pk.until < w.time || war.status !== 'frozen') continue;
    relation(w, war.att, war.def, 2, 'reconciliation under UN peacekeepers');
    relation(w, war.def, war.att, 2, 'reconciliation under UN peacekeepers');
    for (const r of w.regions) if (r.owner === war.att || r.owner === war.def) r.unrest = Math.max(0, r.unrest - 1);
  }
}

function rebelVictory(w: World, reb: Nation, gov: Nation) {
  const leader = reb.president != null ? w.citizens[reb.president] : null;
  const ousted = gov.president != null ? w.citizens[gov.president] : null;
  mergeState(w, reb, gov, 'takeover');
  if (leader && !leader.gone) {
    gov.president = leader.id;
    gov.cabinet = {};
    appointCabinetAI(w, gov);
  }
  changeRegime(w, gov, isDemocracy(gov) ? 'junta' : regimeOf(gov).type === 'hybrid' ? 'personalist' : 'hybrid', `the rebels won the civil war${ousted ? ` and drove out ${ousted.name}` : ''}`);
  regimeOf(gov).legitimacy = 40;
  if (ousted?.player) notify(w, 'office', '⚔️ The rebels won the civil war and you were driven from power.', { critical: true });
}

// ---------- mergers ----------

/** Convert an account's balance in one currency into another at the market rate (ledger-safe). */
function convert(w: World, ref: AccountRef, from: Nation, to: Nation, memo: string) {
  const bal = (() => {
    switch (ref.k) {
      case 'nat': return w.nations[ref.id].wallet[from.cur] ?? 0;
      case 'cit': return w.citizens[ref.id].wallet[from.cur] ?? 0;
      case 'co': return w.companies[ref.id].wallet[from.cur] ?? 0;
      default: return 0;
    }
  })();
  if (bal <= 0) return;
  if (!pay(w, ref, hhref(from.id), from.cur, bal, memo)) return;
  const amt = Math.round((bal * to.fxAnchor) / Math.max(1, from.fxAnchor));
  if (amt > 0) mint(w, ref, to.cur, amt, memo);
}

export type MergeHow = 'crushed' | 'retaken' | 'takeover' | 'union' | 'annexed';
/** One state absorbs another: land, people, firms and money. The absorbed state ceases to exist. */
export function mergeState(w: World, gone: Nation, into: Nation, how: MergeHow) {
  if (!living(gone) || gone.id === into.id) return;
  for (const r of w.regions) {
    if (r.owner === gone.id) { r.owner = into.id; r.occ = null; }
    if (r.core === gone.id) r.core = into.id;
  }
  // End its wars, alliances and pacts.
  for (const war of activeWars(w)) if (war.att === gone.id || war.def === gone.id) { war.status = 'ended'; war.outcome = (war.outcome ?? '') + `${war.outcome ? '; ' : ''}${gone.name} ceased to exist`; for (const rid of war.occupied) if (w.regions[rid].occ?.war === war.id) w.regions[rid].occ = null; }
  for (const o of w.nations) o.alliances = o.alliances.filter((x) => x !== gone.id);
  gone.alliances = [];
  const memo = `Currency conversion: ${gone.name} joined ${into.name}`;
  // People.
  const people = census(w).all.filter((c) => c.nation === gone.id && !c.gone);
  for (const c of people) { changeCitizenship(w, c, into.id, true); convert(w, cref(c.id), gone, into, memo); }
  // Firms and the treasury.
  for (const co of Object.values(w.companies)) if (companyCurrency(w, co) === into.cur && (co.wallet[gone.cur] ?? 0) > 0) convert(w, coref(co.id), gone, into, memo);
  convert(w, natref(gone.id), gone, into, memo);
  const gold = gone.wallet[GOLD] ?? 0;
  if (gold > 0) pay(w, natref(gone.id), natref(into.id), GOLD, gold, memo);
  gone.president = null;
  gone.cabinet = {};
  gone.deputies = [];
  gone.exile = true;
  gone.dissolved = w.time;
  gone.mergedInto = into.id;
  invalidateCensus(w);
  const text = {
    crushed: `🏴 The rebellion in ${into.name} was crushed: the ${gone.name} government collapsed and its lands returned to ${into.name}.`,
    retaken: `🏴 ${into.name} retook ${gone.name}: the breakaway state is no more.`,
    takeover: `⚔️ The rebels won: the ${gone.name} government now rules all of ${into.name}.`,
    union: `🤝 ${gone.name} rejoined ${into.name} in a voluntary union.`,
    annexed: `🏴 ${into.name} annexed ${gone.name}.`,
  }[how];
  record(w, 'politics', text, { nation: into.id, important: true });
  chron(w, text, into, gone);
  const pl = player(w);
  if (pl.nation === into.id || people.some((c) => c.player)) notify(w, 'politics', text, { critical: true });
  computeSupply(w);
  updateExile(w);
}

/** A seceded or partitioned state may rejoin its old country when relations are good. */
function unions(w: World) {
  for (const n of w.nations) {
    if (n.parent == null || !living(n) || n.exile) continue;
    const parent = w.nations[n.parent];
    if (!parent || !living(parent) || parent.exile || w.time - (n.founded ?? 0) < 5 * 365 * DAY) continue;
    if (activeWars(w).some((x) => (x.att === n.id && x.def === parent.id) || (x.att === parent.id && x.def === n.id))) continue;
    const rel = Math.min(n.relations[parent.id]?.score ?? 0, parent.relations[n.id]?.score ?? 0);
    const kept = Object.values(w.wars).some((x) => x.peacekeepers && x.peacekeepers.until > w.time && ((x.att === parent.id && x.def === n.id) || (x.att === n.id && x.def === parent.id)));
    const want = rel > 60 ? 0.01 : rel > 40 && n.faction ? 0.004 : rel > 30 && kept ? 0.006 : 0;
    if (want && chance(w, want)) mergeState(w, n, parent, 'union');
  }
}

// ---------- failed states ----------

function failedStates(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const r = regimeOf(n);
    const unrest = avgUnrest(w, n);
    const broke = (n.wallet[n.cur] ?? 0) < (n.stats.spendHist.slice(-10).reduce((s, x) => s + x, 0) || 1);
    if (n.failedSince == null) {
      if (r.legitimacy < 15 && unrest > 55 && broke && chance(w, 0.3)) {
        n.failedSince = w.time;
        const text = `🏚️ ${n.name} has become a failed state: the government no longer controls much beyond the capital, and its institutions have stopped working.`;
        record(w, 'politics', text, { nation: n.id, important: true });
        chron(w, text, n);
        if (player(w).nation === n.id) notify(w, 'politics', text, { critical: true });
      }
      continue;
    }
    // Decay while failed: institutions erode and unrest spreads.
    const caps = capsOf(w, n);
    caps.inst.effectiveness = Math.max(0.1, caps.inst.effectiveness - 0.01);
    for (const x of w.regions) if (x.owner === n.id) x.unrest = Math.min(100, x.unrest + 2);
    if (r.legitimacy > 30 && unrest < 45) {
      delete n.failedSince;
      const text = `🏗️ ${n.name} is no longer a failed state: order and a working government have returned.`;
      record(w, 'politics', text, { nation: n.id, important: true });
      chron(w, text, n);
    }
  }
}

// ---------- restoration ----------

/** Governments in exile return when their people rise against the occupier. */
function restorations(w: World) {
  for (const n of w.nations) {
    if (!n.exile || !living(n)) continue;
    for (const r of w.regions) {
      if (r.core !== n.id || r.owner === n.id || r.unrest < 70 || !chance(w, 0.05)) continue;
      const occupier = w.nations[r.owner];
      r.owner = n.id;
      r.occ = null;
      r.unrest = 40;
      const text = `🎉 The people of ${r.name} rose against ${occupier.name}: the government of ${n.name} returned from exile.`;
      record(w, 'war', text, { nation: n.id, region: r.id, important: true });
      chron(w, text, n, occupier);
      relation(w, n.id, occupier.id, -10, 'occupied our land');
      if (player(w).nation === n.id || player(w).nation === occupier.id) notify(w, 'warHome', text, { critical: true });
      computeSupply(w);
      updateExile(w);
      break;
    }
  }
}

/** The monthly part (exported for tests). */
export function civilMonth(w: World) {
  failedStates(w);
  restorations(w);
  unions(w);
  puppets(w);
  insurgencies(w);
  peacekeeping(w);
}

export function civilWarDaily(w: World) {
  resolveCivilWars(w);
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) civilMonth(w);
}
