// Soft power (2.5 A world of consequences): the pull a country has on others through its
// culture, universities, tourism and image. It starts from the Brand Finance Global Soft
// Power Index 2025 (rounded) and drifts with:
// - freedom (free countries attract; repression and coups repel);
// - aggression (starting wars costs it) and generosity (aid);
// - prestige: world-first breakthroughs, space missions, hosting the Olympics or a World Expo;
// - its universities and culture (education spending and a thriving economy).
// Soft power improves how others see a country a little every month, draws foreign
// students (a bigger research workforce) and adds diplomatic capital.
// Prestige events: the Summer Olympics every four years (Los Angeles 2028, Brisbane 2032
// are set; later hosts are chosen seven years ahead) and a World Expo every five years
// (Riyadh 2030, then chosen). Hosting costs the treasury and lifts approval and standing;
// a medal table rewards big, rich and healthy countries.
import type { Id, Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance, rand } from '../engine/rng';
import { pay } from '../engine/ledger';
import { dataIso } from '../data/isoAlias';
import { baselineOf } from '../data/nationBaselines';
import { capsOf, historyPace } from './strategic';
import { isDemocracy, regimeOf } from './regimes';
import { activeWars } from './war';
import { relation } from './congress';
import { techStanding } from './technology';
import { dipOf } from './diplomacyActions';
import { hhref, natref, player } from './query';

/** Brand Finance Global Soft Power Index 2025 (rounded; Saudi Arabia and Turkey interpolated). */
const SOFT_2025: Record<string, number> = { USA: 79, CHN: 73, GBR: 67, JPN: 67, DEU: 66, CAN: 61, KOR: 56, AUS: 56, SAU: 52, IND: 50, RUS: 49, TUR: 46, BRA: 45, MEX: 43, ARG: 41, ZAF: 39 };

export const softPowerOf = (n: Nation) => (n.soft ??= n.parent != null ? 30 : SOFT_2025[dataIso(n.iso)] ?? 40);

function target(w: World, n: Nation): number {
  const base = n.parent != null ? 30 : SOFT_2025[dataIso(n.iso)] ?? 40;
  const caps = capsOf(w, n);
  let t = base;
  t += (isDemocracy(n) ? 2 : -3) + (regimeOf(n).legitimacy - 50) / 25;
  if (activeWars(w).some((x) => x.att === n.id && x.kind !== 'civil' && x.kind !== 'secession')) t -= 8;
  t += Math.min(5, techStanding(w, n).firsts * 0.4);
  t += Math.min(4, Object.values(n.space?.missions ?? {}).filter((x) => x >= 0).length);
  t += Math.min(4, (n.hosted ?? 0) * 1.5);
  t += Math.max(-4, Math.min(6, (caps.productivity - 1) * 2)) + (caps.human - 50) / 20;
  if (n.failedSince != null) t -= 10;
  return Math.max(5, Math.min(100, base + 15, t)); // image changes slowly: at most 15 points above where it started
}

/** Foreign students and researchers drawn by soft power: added research workforce (1 = none extra). */
export const studentPull = (n: Nation) => 1 + Math.max(0, softPowerOf(n) - 50) / 250;

// ---------- prestige events ----------

export interface GamesEvent { kind: 'olympics' | 'expo'; year: number; host: Id; done?: boolean; city?: string }
const SET: { kind: GamesEvent['kind']; year: number; iso: string; city: string }[] = [
  { kind: 'olympics', year: 2028, iso: 'USA', city: 'Los Angeles' },
  { kind: 'olympics', year: 2032, iso: 'AUS', city: 'Brisbane' },
  { kind: 'expo', year: 2030, iso: 'SAU', city: 'Riyadh' },
];
export function gamesOf(w: World): GamesEvent[] {
  if (!w.games) {
    w.games = [];
    for (const s of SET) { const n = w.nations.find((x) => x.iso === s.iso); if (n) w.games.push({ kind: s.kind, year: s.year, host: n.id, city: s.city }); }
  }
  return w.games;
}

/** Choose a host seven years ahead: bidders weighted by soft power and economy (no host twice running). */
function chooseHost(w: World, kind: GamesEvent['kind'], year: number) {
  const g = gamesOf(w);
  const last = g.filter((e) => e.kind === kind).sort((a, b) => b.year - a.year)[0];
  const bidders = w.nations.filter((n) => !n.exile && n.dissolved == null && n.failedSince == null && n.id !== last?.host && !activeWars(w).some((x) => x.att === n.id));
  if (!bidders.length) return;
  const weight = (n: Nation) => Math.pow(softPowerOf(n), 2) * Math.sqrt(Math.max(0.1, baselineOf(n.iso).gdpShare));
  const total = bidders.reduce((t, n) => t + weight(n), 0);
  let x = rand(w, 0, total);
  const host = bidders.find((n) => (x -= weight(n)) <= 0) ?? bidders[0];
  g.push({ kind, year, host: host.id });
  record(w, 'diplomacy', `🏅 ${host.name} will host the ${kind === 'olympics' ? 'Summer Olympics' : 'World Expo'} in ${year}.`, { nation: host.id, important: true });
}

function holdEvent(w: World, e: GamesEvent) {
  const n = w.nations[e.host];
  e.done = true;
  if (!n || n.exile) return;
  const cost = Math.floor((n.wallet[n.cur] ?? 0) * (e.kind === 'olympics' ? 0.04 : 0.02));
  if (cost > 0) pay(w, natref(n.id), hhref(n.id), n.cur, cost, e.kind === 'olympics' ? 'Hosting the Olympics' : 'Hosting the World Expo');
  n.hosted = (n.hosted ?? 0) + 1;
  n.approval = Math.min(100, n.approval + 3);
  for (const o of w.nations) if (o.id !== n.id && !o.exile) relation(w, o.id, n.id, 2, e.kind === 'olympics' ? 'the Olympics' : 'the World Expo');
  let text = `${e.kind === 'olympics' ? '🏅' : '🎪'} ${n.name} hosted the ${e.kind === 'olympics' ? 'Summer Olympics' : 'World Expo'} of ${e.year}${e.city ? ` in ${e.city}` : ''}.`;
  if (e.kind === 'olympics') {
    // The medal table: population, wealth and health, with luck (and a host's boost).
    const score = (o: Nation) => Math.sqrt(Math.max(0.1, baselineOf(o.iso).gdpShare)) * (0.7 + capsOf(w, o).human / 100) * (o.id === n.id ? 1.3 : 1) * rand(w, 0.8, 1.2);
    const table = w.nations.filter((o) => !o.exile).sort((a, b) => score(b) - score(a)).slice(0, 3);
    for (const o of table) o.soft = Math.min(100, softPowerOf(o) + 1);
    text += ` The medal table was topped by ${table.map((o) => o.name).join(', ')}.`;
  }
  record(w, 'diplomacy', text, { nation: n.id, important: true });
  (n.chronicle ??= []).push({ t: w.time, text });
  if (player(w).nation === n.id) notify(w, 'politics', text);
}

function monthly(w: World) {
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const s = softPowerOf(n);
    n.soft = Math.round((s + (target(w, n) - s) * 0.03) * 10) / 10;
    // Others warm a little to an attractive country; it gains diplomatic capital.
    if (n.soft > 55) for (const o of w.nations) if (o.id !== n.id && !o.exile && chance(w, 0.1)) relation(w, o.id, n.id, (n.soft - 55) / 40, 'its culture and universities');
    dipOf(n).capital = Math.min(100, dipOf(n).capital + Math.max(0, n.soft - 50) / 50);
  }
  const d = dateAt(w.time);
  const g = gamesOf(w);
  // The Olympics in August, the Expo in May.
  for (const e of g) if (!e.done && e.year === d.year && d.month === (e.kind === 'olympics' ? 7 : 4)) holdEvent(w, e);
  if (d.month === 8) {
    const y = d.year + 7;
    if (y % 4 === 0 && !g.some((e) => e.kind === 'olympics' && e.year === y)) chooseHost(w, 'olympics', y);
    if (y % 5 === 0 && !g.some((e) => e.kind === 'expo' && e.year === y)) chooseHost(w, 'expo', y);
  }
}

export function softPowerDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
