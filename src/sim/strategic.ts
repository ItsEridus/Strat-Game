// The strategic engine (1.6 GEO 2): nations advance over months and years. Each
// country carries capability stocks (technology in six domains, human capital,
// infrastructure, institutions and cohesion) that start at real 2025 levels
// (data/nationBaselines.ts). On the first of each month they move: R&D adds
// technology with diminishing returns, technology spreads from the leaders through
// trade, and productivity grows at the country's potential rate, adjusted for skills,
// infrastructure, institutions, catching up with the leaders, unrest and war. The
// Pace of history setting speeds the strategic clock. Productivity raises what every
// company in the country produces.
import { DAY } from '../engine/clock';
import { tradePolicyGrowth } from './balanceOfPower';
import type { Id, Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { census } from './census';
import { rank } from '../data/education';
import { ageOf } from './growth';
import { B } from '../data/balance';
import { TECH_DOMAINS, baselineOf, type TechDomain } from '../data/nationBaselines';
import { healthFactor, infraFactor, researchFactor } from './nationalBudget';
import { techGrowth } from './technology';
import { climateCommitment, transitionRate } from './climate';
import { ageingDrag } from './demography';

export interface Capabilities {
  tech: Record<TechDomain, number>; // 0..100+ (the leader near 100 in 2025)
  human: number; // 0..100 human capital
  infra: number; // 0..100 infrastructure
  inst: { law: number; corruption: number; effectiveness: number; press: number }; // 0..1
  cohesion: number; // 0..100
  productivity: number; // output per worker against the start (1 = 2025)
  growth: number; // the latest growth rate of productivity (% a year)
  why: string[]; // what moved growth this month (plain language)
  hist: { key: string; productivity: number; tech: number; growth: number }[]; // one a month (last five years)
  base?: { human: number; infra: number; eff: number; gap: number }; // the 2025 starting point (potential growth is measured from it)
}

/** The pace of history: how many strategic months pass each calendar month (Settings). */
export const historyPace = (w: World) => w.settings.historyPace ?? 1;

export function capsOf(w: World, n: Nation): Capabilities {
  if (n.caps) return n.caps;
  const b = baselineOf(n.iso);
  n.caps = { tech: { ...b.tech }, human: 50, infra: 50, inst: { law: b.law, corruption: b.corruption, effectiveness: b.effectiveness, press: b.press }, cohesion: 60, productivity: 1, growth: b.growth, why: [], hist: [] };
  measure(w, n, n.caps);
  return n.caps;
}
export const techAvg = (c: Capabilities) => TECH_DOMAINS.reduce((t, d) => t + c.tech[d], 0) / TECH_DOMAINS.length;

/** Human capital, infrastructure and cohesion, measured from the world as it is. */
function measure(w: World, n: Nation, c: Capabilities) {
  const adults = census(w).all.filter((x) => x.nation === n.id && !x.gone && ageOf(w, x) >= B.life.adultAge);
  const tertiary = adults.length ? adults.filter((x) => rank(x.edu?.level ?? 'school') >= 2).length / adults.length : 0.3;
  c.human = Math.round(Math.min(100, 30 + tertiary * 110 + (n.healthBonus ?? 0)));
  const regions = w.regions.filter((r) => r.owner === n.id);
  const lv = regions.length ? regions.reduce((t, r) => t + r.bld.fields + r.bld.industrial + r.bld.hospital + (w.govs[r.id]?.dev ?? 0), 0) / regions.length : 0;
  c.infra = Math.round(Math.min(100, 45 + lv * 8 + (n.infraBonus ?? 0)));
  const unrest = regions.length ? regions.reduce((t, r) => t + r.unrest, 0) / regions.length : 0;
  c.cohesion = Math.round(n.approval * 0.7 + (100 - unrest) * 0.3);
}

/** One strategic month for a nation. Returns the annual growth rate applied (%). */
export function strategicMonth(w: World, n: Nation, leaders: Record<TechDomain, number>): number {
  const c = capsOf(w, n);
  const b = baselineOf(n.iso);
  // Public investment builds up (or runs down) infrastructure and health over the years.
  n.infraBonus = Math.max(-15, Math.min(25, (n.infraBonus ?? 0) + (infraFactor(n) - 1) * 0.4));
  n.healthBonus = Math.max(-10, Math.min(15, (n.healthBonus ?? 0) + (healthFactor(n) - 1) * 0.25));
  measure(w, n, c);
  // Technology: R&D adds, with diminishing returns; the leaders' know-how spreads through trade.
  let extra = 0; // technology gained by research above (or below) the country's usual effort
  for (const d of TECH_DOMAINS) {
    const own = ((b.rd * researchFactor(n)) / 3) * 0.12 * (1 - c.tech[d] / 130);
    extra += ((b.rd * (researchFactor(n) - 1)) / 3) * 0.12 * (1 - c.tech[d] / 130) / TECH_DOMAINS.length;
    const spread = Math.max(0, leaders[d] - c.tech[d]) * 0.004 * (0.5 + c.inst.effectiveness * 0.5);
    c.tech[d] = Math.round((c.tech[d] + own + spread) * 100) / 100;
  }
  // Growth: potential, adjusted for what the country has and what it is going through.
  // Convergence: fast-growing economies slow as they catch up; once productivity has quadrupled
  // since 2025, potential growth is down to about 1.5% (as Japan, Korea and China slowed).
  const potential = b.growth > 1.5 ? b.growth - (b.growth - 1.5) * Math.min(1, Math.max(0, (c.productivity - 1) / 3)) : b.growth;
  const why: [string, number][] = [['potential', potential]];
  // The potential rate already reflects where the country stood in 2025, so only changes since then move it.
  const base = (c.base ??= { human: c.human, infra: c.infra, eff: c.inst.effectiveness, gap: 0 });
  why.push(['skills', (c.human - base.human) * 0.03]);
  why.push(['infrastructure', (c.infra - base.infra) * 0.03]);
  why.push(['institutions', (c.inst.effectiveness - base.eff) * 3]);
  const lead = TECH_DOMAINS.reduce((t, d) => t + leaders[d], 0) / TECH_DOMAINS.length;
  // Potential growth already includes normal catching up; good institutions speed it, bad ones hold it back.
  // Catching up: a country closing its technology gap faster than in 2025 has less left to catch up on.
  const gap = Math.max(0, 1 - techAvg(c) / lead);
  if (!base.gap) base.gap = gap || 1e-6;
  // Falling further behind leaves more to copy; closing the gap uses up catch-up growth, which slow-growing
  // rich countries (whose potential includes little catching up) barely have.
  const cu = (gap - base.gap) * 6;
  why.push(['catching up', cu >= 0 ? cu : cu * Math.min(1, b.growth / 2)]);
  // Innovation: research beyond the usual effort is growth of its own (catching up only counts imitation).
  if (Math.abs(extra) > 1e-4) why.push(['research', extra * 12 * 1.5]);
  if (c.cohesion < 45) why.push(['unrest', (c.cohesion - 45) * 0.06]);
  const atWar = Object.values(w.wars).some((x) => x.status === 'active' && (x.att === n.id || x.def === n.id));
  if (atWar) why.push(['war', -1.5]);
  const tp = tradePolicyGrowth(w, n);
  if (tp.sanctions) why.push(['sanctions', tp.sanctions]);
  if (tp.agreements) why.push(['trade agreements', tp.agreements]);
  why.push(['the world economy', w.econ.cycle * 1.2]);
  if (n.defaultedAt != null && w.time - n.defaultedAt < 2 * 365 * DAY) why.push(['debt default', -1.5]);
  if (climateCommitment(w, n) > 0.3) why.push(['green industry', transitionRate(w, n) * 15]);
  const ag = ageingDrag(n);
  if (Math.abs(ag) >= 0.05) why.push(['ageing', ag]);
  const tg = techGrowth(w, n);
  if (tg) why.push(['new technology', tg]);
  const g = Math.max(-6, Math.min(10, why.reduce((t, [, v]) => t + v, 0)));
  c.productivity *= Math.pow(1 + g / 100, 1 / 12);
  c.growth = Math.round(g * 10) / 10;
  c.why = why.filter(([, v]) => Math.abs(v) >= 0.15).sort((a, b2) => Math.abs(b2[1]) - Math.abs(a[1])).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v.toFixed(1)}`);
  const d = dateAt(w.time);
  c.hist.push({ key: `${d.year}-${String(d.month + 1).padStart(2, '0')}`, productivity: Math.round(c.productivity * 1000) / 1000, tech: Math.round(techAvg(c) * 10) / 10, growth: c.growth });
  if (c.hist.length > 60) c.hist.shift();
  return g;
}

export function strategicDaily(w: World) {
  if (dateAt(w.time).day !== 1) return;
  for (let k = 0; k < historyPace(w); k++) {
    const leaders = Object.fromEntries(TECH_DOMAINS.map((d) => [d, Math.max(...w.nations.map((n) => capsOf(w, n).tech[d]))])) as Record<TechDomain, number>;
    for (const n of w.nations) if (!n.exile) strategicMonth(w, n, leaders);
  }
}

/** Productivity factor for a company's output in a country. */
export const productivityOf = (w: World, nation: Id) => w.nations[nation].caps?.productivity ?? 1;
