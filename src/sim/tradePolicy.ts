// Trade policy (3.0.2 Diplomacy completed): the tools between free trade and a full embargo.
// - Tariffs set for each partner (on top of the general import tax), and import quotas that let
//   only part of the usual trade in. A tariff on a free-trade partner breaks the agreement.
// - Customs unions: free trade inside, and one common tariff outside (the average of the members').
//   Mercosur and the EU–Turkey customs union are in force at the start.
// - Sectoral sanctions: energy, metals, technology, arms or finance cut off, the rest left open.
// - Secondary sanctions: a power that sanctions a country presses third countries to stop trading
//   with it; those that comply join the sanctions, those that defy it face its tariffs.
// - Smuggling: sanctions leak across land borders, more where the law is weak; the smugglers are the
//   local syndicates, paid for what they bring in.
// AI governments use the same tools: protectionists raise tariffs on rivals, partners retaliate in
// kind, quarrels bring sectoral sanctions before full embargoes, and things ease when relations do.
import type { Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { record } from '../engine/events';
import { pay } from '../engine/ledger';
import { c as cur } from '../engine/money';
import { chance } from '../engine/rng';
import { GLOBAL_POWERS } from '../data/diplomacy';
import { controller, hhref, syndref } from './query';
import { relation } from './congress';
import { leaderProfile, tiesOfPair } from './relations';
import { capsOf } from './strategic';
import { activeTreaties, allTreaties, endTreaty, treatyBetween } from './treaties';

export type Sector = 'energy' | 'metals' | 'tech' | 'arms' | 'finance';
export const SECTORS: Sector[] = ['energy', 'metals', 'tech', 'arms', 'finance'];
export const SECTOR_INFO: Record<Sector, { name: string; icon: string; desc: string }> = {
  energy: { name: 'Energy', icon: '🛢️', desc: 'oil sales' },
  metals: { name: 'Metals', icon: '⛏️', desc: 'iron, titanium and copper' },
  tech: { name: 'Technology', icon: '💻', desc: 'electronics, and sharing technology' },
  arms: { name: 'Arms', icon: '🔫', desc: 'weapons sales and licences' },
  finance: { name: 'Finance', icon: '🏦', desc: 'loans and lending between governments' },
};
export interface TradePolicy { tariffs: Record<Id, number>; quotas: Record<Id, number>; sectoral: Record<Id, Sector[]>; secondary: Id[]; asked?: Record<string, number> }

export const tpOf = (n: Nation): TradePolicy => (n.tp ??= { tariffs: {}, quotas: {}, sectoral: {}, secondary: [] });

/** The sector a traded good belongs to (food, clothing, medicine and the like are never sanctioned by sector). */
export function sectorOf(item: string): Sector | null {
  const k = item.split(':')[0];
  return k === 'oil' ? 'energy' : k === 'iron' || k === 'titanium' || k === 'copper' ? 'metals' : k === 'electronics' ? 'tech' : k === 'wg' || k === 'wa' ? 'arms' : null;
}
/** The extra tariff an importer charges on goods from an exporter (percent). */
export const tariffOn = (w: World, importer: Id, exporter: Id) => w.nations[importer]?.tp?.tariffs[exporter] ?? 0;
/** The share of the usual trade an importer lets in from an exporter (1 = no quota). */
export const quotaShare = (w: World, importer: Id, exporter: Id) => w.nations[importer]?.tp?.quotas[exporter] ?? 1;
/** A sector cut off between two countries (by either side). */
export const sectorCut = (w: World, a: Id, b: Id, s: Sector) =>
  !!w.nations[a]?.tp?.sectoral[b]?.includes(s) || !!w.nations[b]?.tp?.sectoral[a]?.includes(s);
/** Whether a good may not pass between two countries (a full embargo, or a sanction on its sector). */
export function blocked(w: World, a: Id | null, b: Id | null, item?: string): boolean {
  if (a == null || b == null || a === b) return false;
  if (w.nations[a]?.embargoes.includes(b) || w.nations[b]?.embargoes.includes(a)) return true;
  const s = item ? sectorOf(item) : null;
  return !!s && sectorCut(w, a, b, s);
}

// ---------- customs unions ----------

/** The customs union a country belongs to (a treaty of kind 'customs'). */
export const customsUnionOf = (w: World, n: Id) => activeTreaties(w, n, 'customs')[0] ?? null;
/** The common outer tariff of a country's customs union (null if it is in none). */
export function commonTariff(w: World, n: Id): number | null {
  const u = customsUnionOf(w, n);
  if (!u) return null;
  const rates = u.parties.map((p) => w.nations[p]?.taxes.import ?? 0);
  return Math.round(rates.reduce((a, b) => a + b, 0) / Math.max(1, rates.length));
}
/** The import tax a market charges on a seller from another country (general rate, union rate, partner tariff). */
export function importRate(w: World, market: Id, sellerNat: Id, base: number, free = false): number {
  const ct = free ? null : commonTariff(w, market); // (free-trade partners, union members among them, pay no union tariff)
  return Math.min(300, (ct != null ? Math.max(base, ct) : base) + tariffOn(w, market, sellerNat));
}

// ---------- smuggling ----------

/** How much of a sanction leaks through smuggling (0..0.5): across a land border, more where the law is weak. */
export function leak(w: World, sanctioner: Id, target: Id): number {
  const border = w.regions.some((r) => controller(r) === target && r.links.some((l) => controller(w.regions[l]) === sanctioner));
  if (!border) return 0.05;
  const lawT = capsOf(w, w.nations[target]).inst.law, lawS = capsOf(w, w.nations[sanctioner]).inst.law;
  return Math.min(0.5, 0.15 + (1 - lawT) * 0.2 + (1 - lawS) * 0.15);
}

/** Monthly: smugglers carry sanctioned goods across land borders and are paid for it. */
function smugglingMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const targets = new Set<Id>([...n.embargoes, ...Object.keys(n.tp?.sectoral ?? {}).map(Number).filter((t) => (n.tp!.sectoral[t] ?? []).length)]);
    for (const t of targets) {
      const tn = w.nations[t];
      if (!tn || tn.exile) continue;
      const lk = leak(w, n.id, t);
      if (lk <= 0.05) continue;
      // A syndicate working the border on the sanctioned side.
      const border = new Set(w.regions.filter((r) => controller(r) === t && r.links.some((l) => controller(w.regions[l]) === n.id)).map((r) => r.id));
      const s = Object.values(w.syndicates).find((x) => x.nation === t && (border.has(x.home) || x.turf.some((r) => border.has(r))));
      if (!s) continue;
      const pool = w.households[t]?.wallet[tn.cur] ?? 0;
      const amt = Math.min(Math.round(pool * 0.0004 * lk * (n.embargoes.includes(t) ? 1 : 0.4)), cur(4000));
      if (amt > 0 && pay(w, hhref(t), syndref(s.id), tn.cur, amt, `Smuggled goods from ${n.name}`)) {
        s.strength = Math.min(100, s.strength + 0.5);
        if (chance(w, 0.08)) record(w, 'crime', `📦 Goods banned by ${n.name}'s sanctions are crossing into ${tn.name} anyway: ${s.name} runs the trade across the border.`, { nation: t });
      }
    }
  }
}

// ---------- secondary sanctions ----------

/** Monthly: a power with secondary sanctions presses those still trading with its target. */
function secondaryMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile || !n.tp?.secondary.length) continue;
    const tp = tpOf(n);
    tp.secondary = tp.secondary.filter((x) => n.embargoes.includes(x) && w.nations[x] && !w.nations[x].exile);
    for (const x of tp.secondary) {
      for (const o of w.nations) {
        if (o.id === n.id || o.id === x || o.exile || o.embargoes.includes(x)) continue;
        const key = `${x}:${o.id}`;
        if ((tp.asked?.[key] ?? -Infinity) > w.time - 2 * 365 * DAY) continue;
        const withX = tiesOfPair(w, o, w.nations[x]).interdep, withN = tiesOfPair(w, o, n).interdep;
        if (withX < 10) continue;
        (tp.asked ??= {})[key] = w.time;
        const friend = n.alliances.includes(o.id) || (o.relations[n.id]?.score ?? 0) > 30;
        const p = 0.25 + (withN - withX) / 100 + (o.relations[n.id]?.score ?? 0) / 200 - (o.relations[x]?.score ?? 0) / 300 + (n.alliances.includes(o.id) ? 0.35 : 0);
        if (chance(w, Math.max(0.05, Math.min(0.9, p)))) {
          const otp = tpOf(o);
          otp.sectoral[x] = [...new Set([...(otp.sectoral[x] ?? []), 'finance' as Sector, 'tech' as Sector, 'arms' as Sector])];
          relation(w, o.id, x, -5, `joined ${n.name}'s sanctions`);
          record(w, 'diplomacy', `🏦 Under pressure from ${n.name}, ${o.name} cut its banks and technology off from ${w.nations[x].name}.`, { nation: o.id });
        } else if (friend) {
          // Friends who refuse get a stern word, not tariffs.
          relation(w, n.id, o.id, -3, `kept trading with ${w.nations[x].name}`);
          record(w, 'diplomacy', `🏦 ${o.name} declined ${n.name}'s request to stop trading with ${w.nations[x].name}.`, { nation: o.id });
        } else {
          setTariff(w, n, o, Math.max(tariffOn(w, n.id, o.id), 25));
          relation(w, n.id, o.id, -5, `kept trading with ${w.nations[x].name}`);
          record(w, 'diplomacy', `🏦 ${o.name} refused to stop trading with ${w.nations[x].name}; ${n.name} answered with tariffs on its goods.`, { nation: o.id });
        }
      }
    }
  }
}

// ---------- the AI governments ----------

function aiMonth(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const lp = leaderProfile(w, n);
    const tp = tpOf(n);
    for (const o of w.nations) {
      if (o.id === n.id || o.exile) continue;
      const rel = n.relations[o.id]?.score ?? 0;
      const ties = tiesOfPair(w, n, o);
      const theirs = tariffOn(w, o.id, n.id), mine = tariffOn(w, n.id, o.id);
      // Retaliation in kind.
      if (theirs > mine && chance(w, rel < 20 ? 0.3 : 0.08)) { setTariff(w, n, o, theirs); continue; }
      // Protectionists tax a rival's goods.
      if (!mine && lp.nationalism > 0.6 && rel < -20 && ties.interdep > 15 && !treatyBetween(w, n.id, o.id, 'trade') && chance(w, 0.04)) { setTariff(w, n, o, 25); continue; }
      if (!tp.quotas[o.id] && lp.nationalism > 0.65 && rel < -30 && ties.interdep > 20 && chance(w, 0.02)) { tp.quotas[o.id] = 0.5; record(w, 'diplomacy', `🚧 ${n.name} capped imports from ${o.name} at half their usual level.`, { nation: n.id }); continue; }
      // A quarrel brings sectoral sanctions before a full embargo.
      if (rel < -35 && !n.embargoes.includes(o.id) && !(tp.sectoral[o.id] ?? []).length && chance(w, 0.03 + lp.hawk * 0.03)) {
        tp.sectoral[o.id] = ['arms', 'tech', 'finance'];
        relation(w, n.id, o.id, -6, 'sectoral sanctions');
        record(w, 'diplomacy', `🎯 ${n.name} imposed sanctions on ${o.name}'s arms, technology and finance sectors.`, { nation: n.id, important: true });
        continue;
      }
      // Things ease when relations do.
      if (rel > 10 && (mine || tp.quotas[o.id]) && chance(w, 0.1)) { delete tp.tariffs[o.id]; delete tp.quotas[o.id]; record(w, 'diplomacy', `🤝 ${n.name} lifted its tariffs on ${o.name}.`, { nation: n.id }); continue; }
      if (rel > -15 && (tp.sectoral[o.id] ?? []).length && chance(w, 0.08)) { delete tp.sectoral[o.id]; record(w, 'diplomacy', `🤝 ${n.name} lifted its sectoral sanctions on ${o.name}.`, { nation: n.id }); continue; }
    }
    // Global powers enforce their embargoes on third countries.
    if (GLOBAL_POWERS.includes(n.iso) || n.iso === 'CHN') for (const x of n.embargoes) if (!tp.secondary.includes(x) && lp.hawk > 0.45 && chance(w, 0.03)) {
      tp.secondary.push(x);
      record(w, 'diplomacy', `🏦 ${n.name} announced secondary sanctions: anyone still trading with ${w.nations[x].name} risks its own markets.`, { nation: n.id, important: true });
    }
  }
}

/** Put a tariff on a partner's goods (breaking a free-trade agreement or customs union between them). */
export function setTariff(w: World, n: Nation, o: Nation, rate: number) {
  const tp = tpOf(n);
  if (rate <= 0) { delete tp.tariffs[o.id]; return; }
  tp.tariffs[o.id] = Math.min(100, Math.round(rate));
  for (const kind of ['trade', 'customs'] as const) {
    const t = treatyBetween(w, n.id, o.id, kind);
    if (t && t.parties.length === 2) endTreaty(w, t, 'broken', n.id, 'tariffs');
  }
  relation(w, n.id, o.id, -5, 'tariffs on our goods');
  record(w, 'diplomacy', `🧾 ${n.name} put a ${tp.tariffs[o.id]}% tariff on goods from ${o.name}.`, { nation: n.id });
}

/** The customs unions in force at the start: Mercosur, and the EU–Turkey customs union (older saves too). */
function seedCustoms(w: World) {
  if (w.customsSeeded) return;
  w.customsSeeded = true;
  for (const t of allTreaties(w)) if (t.kind === 'trade' && (t.bloc === 'mercosur' || /customs union/i.test(t.name))) t.kind = 'customs';
}

export function tradePolicyDaily(w: World) {
  if (!w.treaties) return;
  seedCustoms(w);
  if (dateAt(w.time).day !== 1) return;
  aiMonth(w);
  secondaryMonth(w);
  smugglingMonth(w);
}
