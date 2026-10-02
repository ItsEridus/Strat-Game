// Demography at national scale (2.5 A world of consequences). The simulated people are a
// sample; behind them each country has a population with a fertility rate, an age
// structure and migration, starting from 2025 (UN World Population Prospects 2024,
// rounded):
// - Fertility drifts slowly towards about 1.5 children per woman (high rates fall; the
//   lowest recover a little).
// - Ageing: the old-age dependency ratio (people 65+ per person of working age) rises with
//   low fertility and longer lives (medical technology), and falls a little with immigration.
// - Population changes with fertility, the momentum of a young age structure, and net
//   migration; the economy's weight grows and shrinks with it.
// - Ageing slows growth and raises the cost of pensions.
// - Immigration policy follows the government: nationalist leaders close the doors,
//   liberal ones open them. Wars send refugees to neighbours that take them, and a
//   nationalist public resents a large intake.
import type { Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { record } from '../engine/events';
import { dataIso } from '../data/isoAlias';
import { historyPace } from './strategic';
import { techFx } from './technology';
import { leaderProfile } from './relations';
import { activeWars } from './war';

/** 2025: total fertility rate, old-age dependency ratio, net migration per 1000 people a year. */
const DEMO_2025: Record<string, [number, number, number]> = {
  USA: [1.6, 0.28, 3], CAN: [1.3, 0.3, 9], MEX: [1.8, 0.13, -0.5], BRA: [1.6, 0.16, 0], ARG: [1.4, 0.18, 0.1], GBR: [1.4, 0.31, 6],
  DEU: [1.4, 0.37, 4], RUS: [1.4, 0.25, 1], TUR: [1.5, 0.15, 0.5], SAU: [2.3, 0.04, 3], ZAF: [2.3, 0.1, 0.5], IND: [2.0, 0.1, -0.4],
  CHN: [1.0, 0.21, -0.2], JPN: [1.2, 0.5, 1], KOR: [0.72, 0.28, 1], AUS: [1.5, 0.27, 8],
};
export type ImmigrationPolicy = 'open' | 'selective' | 'closed';
export interface Demography { tfr: number; oadr: number; oadr0: number; mig: number; pop: number; growth: number; policy: ImmigrationPolicy; refugees: number }

export function demoOf(n: Nation): Demography {
  if (n.demo) return n.demo;
  const d = DEMO_2025[dataIso(n.iso)] ?? [1.8, 0.15, 0];
  n.demo = { tfr: d[0], oadr: d[1], oadr0: d[1], mig: d[2], pop: 1, growth: 0, policy: 'selective', refugees: 0 };
  return n.demo;
}
const POLICY_FACTOR: Record<ImmigrationPolicy, number> = { open: 1.4, selective: 1, closed: 0.3 };

/** Growth lost to ageing since 2025 (% a year, negative). */
export const ageingDrag = (n: Nation) => (n.demo ? Math.max(-0.6, -(n.demo.oadr - n.demo.oadr0)) : 0); // fewer workers per person is counted in population; this is the strain of an older workforce and pension costs

function yearly(w: World) {
  // Refugees: countries with occupied land or a civil war send people to neighbours that will take them.
  const fleeing = new Map<number, number>();
  for (const war of activeWars(w)) for (const side of [war.att, war.def]) {
    const occupied = w.regions.filter((r) => r.owner === side && r.occ).length;
    if (occupied || war.kind === 'civil') fleeing.set(side, (fleeing.get(side) ?? 0) + 2 + occupied);
  }
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const d = demoOf(n);
    const lp = leaderProfile(w, n);
    d.policy = lp.nationalism > 0.7 ? 'closed' : lp.nationalism < 0.35 ? 'open' : 'selective';
    d.tfr = Math.round((d.tfr + (1.5 - d.tfr) * 0.02) * 1000) / 1000;
    const base = (DEMO_2025[dataIso(n.iso)] ?? [1.8, 0.15, 0])[2];
    // Refugees taken in from neighbours at war (per 1000 a year).
    const near = [...fleeing.keys()].filter((id) => id !== n.id && w.regions.some((r) => r.owner === n.id && r.links.some((l) => w.regions[l].owner === id)));
    d.refugees = d.policy === 'closed' ? 0 : near.reduce((t, id) => t + (fleeing.get(id) ?? 0), 0) * (d.policy === 'open' ? 1 : 0.5);
    d.mig = Math.round((base * POLICY_FACTOR[d.policy] + d.refugees - (fleeing.get(n.id) ?? 0)) * 10) / 10;
    // Ageing: low fertility and longer lives age a society; immigrants are mostly young.
    d.oadr = Math.max(0.02, Math.min(0.9, d.oadr + 0.0025 + (2.1 - d.tfr) * 0.002 + techFx(n).lifespan * 0.01 - d.mig * 0.0003));
    // Population: fertility, the momentum of a young age structure, and migration.
    d.growth = Math.round(((d.tfr - 2.1) * 0.35 + Math.max(-0.4, (0.32 - d.oadr) * 2.5) + d.mig / 10) * 100) / 100;
    const k = 1 + d.growth / 100;
    d.pop = Math.round(d.pop * k * 10000) / 10000;
    for (const r of w.regions) if (r.owner === n.id) r.pop = Math.max(1, Math.round(r.pop * k));
    const hh = w.households[n.id];
    if (hh) hh.pop = Math.max(1, Math.round(hh.pop * k));
    // A large intake angers a nationalist public.
    if (d.refugees > 3 && lp.nationalism > 0.5) {
      n.approval = Math.max(5, n.approval - 2);
      record(w, 'politics', `🧳 ${n.name} took in refugees from the war next door; the arrivals are a political battle.`, { nation: n.id });
    }
  }
}

function monthly(w: World) {
  if (dateAt(w.time).month === 0) yearly(w);
}

export function demographyDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
