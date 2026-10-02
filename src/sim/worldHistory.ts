// The record of the world (1.6 GEO 2). Each month the power index is taken and kept,
// so rankings have a history; a country moving up or down a tier, or overtaking
// another at the top, goes into its chronicle and the news. Each New Year, a
// "State of the World" report sums up the year for every country.
import type { Id, World } from './types';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { TIER_LABEL, nationScores, type Tier } from './forces';
import { capsOf } from './strategic';
import { inflation } from './statistics';
import { dailyRevenue } from './publicFinance';

export interface PowerPoint { key: string; total: number; tier: Tier; rank: number }
export interface YearRow { nation: Id; growth: number; productivity: number; power: number; tier: Tier; rank: number; unemployment: number; inflation?: number; debtYears: number; strategy?: string }
export interface YearReport { year: number; rows: YearRow[]; headlines: string[] }

const TIER_ORDER: Tier[] = ['minor', 'regional', 'middle', 'great', 'superpower'];
const chron = (w: World, nation: Id, text: string) => { const n = w.nations[nation]; (n.chronicle ??= []).push({ t: w.time, text }); if (n.chronicle.length > 200) n.chronicle.shift(); };

/** Monthly: take the power index, note tier changes and changes at the top. */
export function powerMonthly(w: World) {
  const d = dateAt(w.time);
  if (d.day !== 1) return;
  const key = `${d.year}-${String(d.month + 1).padStart(2, '0')}`;
  const scores = nationScores(w);
  const prevTop = [...w.nations].filter((n) => n.powerHist?.length).sort((a, b) => a.powerHist!.at(-1)!.rank - b.powerHist!.at(-1)!.rank).slice(0, 3).map((n) => n.id);
  scores.forEach((s, i) => {
    const n = w.nations[s.id];
    const hist = (n.powerHist ??= []);
    const last = hist.at(-1);
    hist.push({ key, total: s.total, tier: s.tier, rank: i + 1 });
    if (hist.length > 120) hist.shift();
    if (last && last.tier !== s.tier && !n.exile) {
      const up = TIER_ORDER.indexOf(s.tier) > TIER_ORDER.indexOf(last.tier);
      const text = `${up ? '📈' : '📉'} ${n.name} ${up ? 'rose to become' : 'fell to'} a ${TIER_LABEL[s.tier].toLowerCase()} (power index ${s.total}).`;
      chron(w, n.id, text);
      record(w, 'politics', text, { nation: n.id });
    }
  });
  const nowTop = scores.slice(0, 3).map((s) => s.id);
  if (prevTop.length === 3 && nowTop.join() !== prevTop.join()) {
    const text = `🌍 The balance of power shifted: the world's leading powers are now ${nowTop.map((id) => w.nations[id].name).join(', ')}.`;
    for (const id of nowTop) chron(w, id, text);
    record(w, 'politics', text, {});
  }
  if (d.month === 0) yearReport(w, d.year - 1);
}

/** The State of the World for a year that has just ended. */
export function yearReport(w: World, year: number) {
  const scores = nationScores(w);
  const rows: YearRow[] = scores.map((s, i) => {
    const n = w.nations[s.id];
    const c = capsOf(w, n);
    const h = c.hist;
    const yearAgo = h.length >= 13 ? h[h.length - 13].productivity : 1;
    return { nation: n.id, growth: Math.round(((c.productivity / yearAgo) - 1) * 1000) / 10, productivity: c.productivity, power: s.total, tier: s.tier, rank: i + 1, unemployment: n.unemployment, inflation: inflation(w, n.id), debtYears: (n.debt ?? 0) / Math.max(1, dailyRevenue(n) * 365), strategy: n.strategy?.kind };
  });
  const live = rows.filter((r) => !w.nations[r.nation].exile);
  const fastest = [...live].sort((a, b) => b.growth - a.growth)[0];
  const slowest = [...live].sort((a, b) => a.growth - b.growth)[0];
  const jobless = [...live].sort((a, b) => b.unemployment - a.unemployment)[0];
  const headlines = [
    `${w.nations[rows[0].nation].name} remains the world's leading power (index ${rows[0].power}).`,
    fastest ? `Fastest growth: ${w.nations[fastest.nation].name}, ${fastest.growth.toFixed(1)}%.` : '',
    slowest ? `Slowest: ${w.nations[slowest.nation].name}, ${slowest.growth.toFixed(1)}%.` : '',
    jobless && jobless.unemployment > 0.08 ? `Highest unemployment: ${w.nations[jobless.nation].name}, ${Math.round(jobless.unemployment * 100)}%.` : '',
    ...w.nations.filter((n) => n.exile).map((n) => `${n.name} has lost its territory and governs in exile.`),
  ].filter(Boolean);
  (w.yearReports ??= []).push({ year, rows, headlines });
  if (w.yearReports.length > 30) w.yearReports.shift();
  notify(w, 'politics', `📰 The State of the World in ${year} is out: ${headlines[0]}`, { link: 'world', critical: true });
}
