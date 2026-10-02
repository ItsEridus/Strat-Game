// Global markets (2.5 A world of consequences).
// - Stock markets: every country has a stock index (1 = 2025). It rises with growth, the
//   business cycle and an equity premium, and in long booms with cheap money a bubble
//   builds. Bubbles burst: the bigger the bubble, the likelier the crash. A crash in a
//   large market spreads (contagion): other markets fall, the world economy turns down.
// - Capital flows: when the world is calm and the dollar's rate is low, money flows into
//   emerging markets (countries rated below A-) and their currencies firm; when fear
//   returns it flows out and they weaken. An emerging market with thin reserves can suffer
//   a sudden currency crisis.
// - Pegs: Saudi Arabia pegs the riyal to the dollar (since 1986). The peg holds while
//   reserves last; defending it in hard times (low oil prices) spends reserves; if they run
//   too low the peg breaks with a devaluation.
// - Reserve currencies: the shares of world reserves held in each currency start from the
//   IMF's 2024 figures (dollar 58%, euro 20%, yen 6%, pound 5%...) and drift slowly with
//   economic weight, credit ratings and the use of sanctions. Issuers of reserve
//   currencies borrow more cheaply.
// - Commodity super-cycles: beyond daily volatility, the long-run price of each raw
//   material swings over 20–30 years.
import type { Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { pay } from '../engine/ledger';
import { GOLD } from '../engine/money';
import { B } from '../data/balance';
import { dataIso } from '../data/isoAlias';
import { baselineOf } from '../data/nationBaselines';
import { capsOf, historyPace } from './strategic';
import { creditOf } from './sovereign';
import { hhref, natref, player } from './query';

const YEAR = 365 * DAY;
const gauss = (w: World) => { let s = 0; for (let i = 0; i < 3; i++) s += rand(w, -1, 1); return s / 1.73; };

// ---------- commodity super-cycles ----------

/** The long-run price multiplier of a raw material (about 0.65–1.35 over a 20–30 year cycle). */
export function superCycle(w: World, k: string): number {
  const s = ((w.econ.superCycle ??= {})[k] ??= { phase: (k.length * 1.7) % (2 * Math.PI), period: 20 + (k.charCodeAt(0) % 11) });
  const years = w.time / YEAR;
  return 1 + 0.35 * Math.sin((2 * Math.PI * years) / s.period + s.phase);
}

// ---------- stock markets ----------

export interface Stocks { index: number; bubble: number; peak: number; hist: number[]; lastCrash?: number }
export function stocksOf(n: Nation): Stocks { return (n.stocks ??= { index: 1, bubble: 0, peak: 1, hist: [] }); }
const big = (n: Nation) => baselineOf(n.iso).gdpShare >= 3;

function crash(w: World, n: Nation, size: number, contagion: boolean) {
  const s = stocksOf(n);
  s.index *= 1 - size;
  s.bubble = 0;
  s.lastCrash = w.time;
  n.approval = Math.max(5, n.approval - 2);
  const text = `📉 ${n.name}'s stock market crashed: ${Math.round(size * 100)}% wiped off share prices${contagion ? '; the panic spread around the world' : ''}.`;
  record(w, 'economy', text, { nation: n.id, important: contagion || player(w).nation === n.id });
  if (contagion) (n.chronicle ??= []).push({ t: w.time, text });
  if (player(w).nation === n.id) notify(w, 'economy', text, { critical: contagion });
  if (!contagion) return;
  // Contagion: other markets fall, fear rises, the world economy turns down.
  for (const o of w.nations) {
    if (o.id === n.id || o.exile) continue;
    const so = stocksOf(o);
    so.index *= 1 - size * rand(w, 0.4, 0.8);
    so.bubble *= 0.3;
  }
  w.econ.trend -= 0.25;
  w.econ.fear = Math.min(1, (w.econ.fear ?? 0) + 0.5);
}

function stocksMonth(w: World) {
  const rateUSA = w.nations.find((x) => dataIso(x.iso) === 'USA')?.policyRate ?? 4.5;
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const s = stocksOf(n);
    const caps = capsOf(w, n);
    const cheap = (n.policyRate ?? rateUSA) < 3;
    // Bubbles build in long booms with cheap money, and deflate otherwise.
    s.bubble = Math.max(0, Math.min(1, s.bubble + (w.econ.cycle > 0.2 ? 0.015 : -0.01) + (cheap ? 0.01 : 0) + rand(w, -0.005, 0.005)));
    const pct = caps.growth / 12 + 0.25 + w.econ.cycle * 1.2 + s.bubble * 1.5 + gauss(w) * 3.5;
    s.index = Math.max(0.05, s.index * (1 + pct / 100));
    s.peak = Math.max(s.peak, s.index);
    s.hist.push(Math.round(s.index * 1000) / 1000);
    if (s.hist.length > 120) s.hist.shift();
    if (w.time - (s.lastCrash ?? -1e12) > 2 * YEAR && chance(w, 0.0015 + s.bubble * s.bubble * 0.06)) crash(w, n, rand(w, 0.2, 0.4), big(n));
  }
  w.econ.fear = Math.max(0, (w.econ.fear ?? 0) * 0.9);
}

// ---------- capital flows, currency crises and pegs ----------

/** Global appetite for risk (0–1): calm and cheap dollars send money to emerging markets. */
export function riskAppetite(w: World): number {
  const rateUSA = w.nations.find((x) => dataIso(x.iso) === 'USA')?.policyRate ?? 4.5;
  return Math.max(0, Math.min(1, 0.5 + w.econ.cycle * 0.35 - (rateUSA - 4) * 0.05 - (w.econ.fear ?? 0) * 0.5));
}
const emerging = (n: Nation) => creditOf(n).score < 15;
const reserveTarget = () => B.fx.reserveTarget * 1000;

/** The 2025 pegs: Saudi Arabia pegs to the dollar. */
const PEGS_2025: Record<string, string> = { SAU: 'USA' };
export function pegOf(w: World, n: Nation): { to: number; ratio: number } | null {
  if (n.peg === null) return null;
  if (n.peg) return n.peg;
  const to = PEGS_2025[dataIso(n.iso)];
  const anchor = to ? w.nations.find((x) => x.iso === to) : null;
  if (!anchor || n.parent != null) { n.peg = null; return null; }
  n.peg = { to: anchor.id, ratio: n.fxAnchor / Math.max(1, anchor.fxAnchor) };
  return n.peg;
}

function flowsMonth(w: World) {
  const risk = riskAppetite(w);
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const peg = pegOf(w, n);
    const gold = n.wallet[GOLD] ?? 0;
    if (peg) {
      // Defending the peg: in hard times reserves are sold to hold the rate.
      const oil = w.econ.world?.oil ? w.econ.world.oil.p / Math.max(1e-9, w.econ.world.oil.hist[0] ?? w.econ.world.oil.p) : 1;
      const pressure = Math.max(0, 0.5 - risk) + Math.max(0, 0.8 - oil);
      const spend = Math.floor(gold * pressure * 0.04);
      if (spend > 0) pay(w, natref(n.id), hhref(n.id), GOLD, spend, 'Defending the currency peg');
      if ((n.wallet[GOLD] ?? 0) < reserveTarget() * 0.1) {
        n.peg = null;
        n.fxAnchor = Math.round(n.fxAnchor * 1.35);
        n.approval = Math.max(5, n.approval - 6);
        const text = `💱 ${n.name} could no longer defend its currency's peg to the ${w.nations[peg.to].adj} currency: it was devalued by about a quarter.`;
        record(w, 'economy', text, { nation: n.id, important: true });
        (n.chronicle ??= []).push({ t: w.time, text });
        if (player(w).nation === n.id) notify(w, 'economy', text, { critical: true });
      }
      continue;
    }
    if (!emerging(n)) continue;
    // Capital flows: inflows firm the currency, outflows weaken it.
    const exposure = 1 - creditOf(n).score / 21;
    n.fxAnchor = Math.max(1, Math.round(n.fxAnchor * (1 + (0.5 - risk) * 0.02 * exposure)));
    // A sudden stop: thin reserves, a poor rating and a frightened world.
    if (risk < 0.35 && gold < reserveTarget() * 0.3 && creditOf(n).score <= 10 && w.time - (n.fxCrisis ?? -1e12) > 3 * YEAR && chance(w, 0.06)) {
      n.fxCrisis = w.time;
      n.fxAnchor = Math.round(n.fxAnchor * rand(w, 1.2, 1.4));
      n.approval = Math.max(5, n.approval - 4);
      const text = `💱 Currency crisis in ${n.name}: investors fled and the currency collapsed.`;
      record(w, 'economy', text, { nation: n.id, important: true });
      (n.chronicle ??= []).push({ t: w.time, text });
      if (player(w).nation === n.id) notify(w, 'economy', text, { critical: true });
    }
  }
}

/** Keep a pegged currency at its peg (called by the central bank, in place of the managed float). */
export function peggedAnchor(w: World, n: Nation): number | null {
  const p = pegOf(w, n);
  return p ? Math.max(1, Math.round(w.nations[p.to].fxAnchor * p.ratio)) : null;
}

// ---------- reserve currencies ----------

const RESERVES_2024: Record<string, number> = { USA: 0.58, DEU: 0.2, JPN: 0.058, GBR: 0.048, CAN: 0.027, CHN: 0.021, AUS: 0.021 };
/** The share of the world's reserves held in a country's currency. */
export const reserveShare = (n: Nation): number => n.reserveShare ?? (n.parent == null ? RESERVES_2024[dataIso(n.iso)] ?? 0 : 0);
/** Issuers of reserve currencies borrow more cheaply (percentage points off the bond rate). */
export const reservePrivilege = (n: Nation) => reserveShare(n) * 1.5;

function reservesYear(w: World) {
  const r: Record<string, number> = {};
  for (const iso of Object.keys(RESERVES_2024)) { const n = w.nations.find((x) => x.iso === iso); r[iso] = n ? reserveShare(n) : 0; }
  // Where the shares would settle: economic weight times a strong rating, less for those who use sanctions a lot.
  const weight: Record<string, number> = {};
  for (const iso of Object.keys(RESERVES_2024)) {
    const n = w.nations.find((x) => x.iso === iso);
    if (!n || n.exile) { weight[iso] = 0; continue; }
    const sanctions = w.nations.filter((o) => n.embargoes.includes(o.id)).length;
    weight[iso] = baselineOf(iso).gdpShare * capsOf(w, n).productivity * Math.pow(creditOf(n).score / 21, 3) * (1 - Math.min(0.3, sanctions * 0.03)) * (iso === 'CHN' ? 0.4 : iso === 'DEU' ? 3.3 : 1); // capital controls hold the yuan back; the euro stands for the whole eurozone (about 3.3 times Germany)
  }
  const total = Object.values(weight).reduce((a, b) => a + b, 0) || 1;
  // Inertia: shares move a tenth of the way a year (the dollar's share fell about 1 point a year in 2000–2024).
  const held = Object.values(RESERVES_2024).reduce((a, b) => a + b, 0);
  for (const iso of Object.keys(RESERVES_2024)) {
    const n = w.nations.find((x) => x.iso === iso);
    if (n) n.reserveShare = Math.round((r[iso] + ((weight[iso] / total) * held - r[iso]) * 0.04) * 1000) / 1000;
  }
}

// ---------- daily ----------

function monthly(w: World) {
  stocksMonth(w);
  flowsMonth(w);
  if (dateAt(w.time).month === 0) reservesYear(w);
}

export function marketsDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
