// The decades campaign (2.5): start scenarios and the World Almanac.
// - Scenarios change the world of 2025 before play begins:
//   - the present day (the world as it is);
//   - a new cold war: two blocs (the United States and its allies against China and Russia),
//     hostile relations, sanctions between the blocs, a Sino-Russian alliance, technology
//     partnerships within the West and an arms race;
//   - a multipolar world: American weight smaller, China, India and the middle powers
//     larger, the dollar's reserve role reduced and American alliances strained.
// - The World Almanac keeps the record of the campaign: every head of government of every
//   country, and each country's statistics year by year (economy, population, output per
//   worker, technology, soft power, credit rating, and the world's temperature).
import type { Id, World } from './types';
import { dateAt } from '../engine/calendar';
import { record } from '../engine/events';
import { dataIso } from '../data/isoAlias';
import { baselineOf } from '../data/nationBaselines';
import { capsOf, historyPace, techAvg } from './strategic';
import { signTreaty } from './treaties';
import { tiesOfPair } from './relations';
import { creditOf, ratingLabel } from './sovereign';
import { softPowerOf } from './softPower';
import { demoOf } from './demography';
import { climateOf } from './climate';

export type Scenario = 'present' | 'coldwar' | 'multipolar';
export const SCENARIOS: Record<Scenario, { label: string; desc: string }> = {
  present: { label: 'The present day (2025)', desc: 'The world as it is.' },
  coldwar: { label: 'A new cold war', desc: 'Two blocs: the United States and its allies against China and Russia, with sanctions, an arms race and technology kept within each bloc.' },
  multipolar: { label: 'A multipolar world', desc: 'American weight is smaller; China, India and the middle powers are larger; the dollar matters less and old alliances are strained.' },
};

const WEST = ['USA', 'CAN', 'GBR', 'DEU', 'JPN', 'KOR', 'AUS'];
const EAST = ['CHN', 'RUS'];

function applyScenario(w: World) {
  const s = w.settings.scenario ?? 'present';
  w.scenarioApplied = true;
  if (s === 'present') return;
  const by = (iso: string) => w.nations.find((n) => dataIso(n.iso) === iso);
  const setRel = (a: Id, b: Id, v: number) => { const r = w.nations[a].relations[b]; if (r) r.score = v; };
  if (s === 'coldwar') {
    const west = WEST.map(by).filter(Boolean) as World['nations'];
    const east = EAST.map(by).filter(Boolean) as World['nations'];
    for (const a of west) for (const b of east) {
      setRel(a.id, b.id, -70); setRel(b.id, a.id, -70);
      // Deep distrust that lasts: trust, where it settles, and grievances on both sides.
      for (const [x, y] of [[a, b], [b, a]]) { const t = tiesOfPair(w, x, y); t.trust = -60; t.base = -60; t.grievance = Math.max(t.grievance, 30); t.interdep = Math.min(t.interdep, 15); t.threat = Math.max(t.threat, 50); } // decoupled, and afraid of each other
      if (!a.embargoes.includes(b.id)) a.embargoes.push(b.id);
      if (!b.embargoes.includes(a.id)) b.embargoes.push(a.id);
    }
    if (east.length === 2) signTreaty(w, 'defence', east.map((n) => n.id), { name: 'Sino-Russian alliance', quiet: true });
    if (west.length > 1) signTreaty(w, 'tech', west.map((n) => n.id), { name: 'Western technology partnership', quiet: true, years: null });
    for (const n of [...east, west[0]]) if (n) n.defense.budget = Math.round(n.defense.budget * 1.3 * 1000) / 1000;
    record(w, 'diplomacy', '🧊 A new cold war divides the world: the United States and its allies face China and Russia, with sanctions and an arms race between the blocs.', { important: true });
  } else if (s === 'multipolar') {
    const scale: Record<string, number> = { USA: 0.85, CHN: 1.15, IND: 1.3, BRA: 1.1, TUR: 1.1, SAU: 1.1, MEX: 1.05, ZAF: 1.05 };
    for (const n of w.nations) {
      const k = scale[dataIso(n.iso)];
      if (k) capsOf(w, n).productivity *= k;
    }
    const us = by('USA'), cn = by('CHN');
    if (us) { us.reserveShare = 0.45; for (const iso of WEST.slice(1)) { const a = by(iso); if (a) { setRel(a.id, us.id, (a.relations[us.id]?.score ?? 0) - 20); setRel(us.id, a.id, (us.relations[a.id]?.score ?? 0) - 20); } } }
    if (cn) cn.reserveShare = 0.1;
    record(w, 'diplomacy', '🌐 A multipolar world: no single power leads; China, India and the middle powers carry more weight, and old alliances are strained.', { important: true });
  }
}

// ---------- the World Almanac ----------

export interface LeaderTerm { id: Id; name: string; from: number; to?: number; party?: string }
export interface YearStat { year: number; economy: number; pop: number; prod: number; tech: number; soft: number; rating: string; temp: number }
export interface Almanac { leaders: Record<Id, LeaderTerm[]>; years: Record<Id, YearStat[]> }
export const almanacOf = (w: World): Almanac => (w.almanac ??= { leaders: {}, years: {} });

function noteLeaders(w: World) {
  const a = almanacOf(w);
  for (const n of w.nations) {
    const list = (a.leaders[n.id] ??= []);
    const cur = list[list.length - 1];
    const pres = n.president;
    if (cur && !cur.to && cur.id === pres) continue;
    if (cur && !cur.to) cur.to = w.time;
    if (pres != null && w.citizens[pres]) {
      const c = w.citizens[pres];
      list.push({ id: c.id, name: c.name, from: w.time, party: c.party != null ? w.parties[c.party]?.name : undefined });
    }
  }
}

function noteYear(w: World) {
  const a = almanacOf(w);
  const year = dateAt(w.time).year;
  const temp = climateOf(w).temp;
  for (const n of w.nations) {
    if (n.dissolved != null) continue;
    const caps = capsOf(w, n);
    const rows = (a.years[n.id] ??= []);
    if (rows.some((r) => r.year === year)) continue;
    rows.push({
      year, economy: Math.round(baselineOf(n.iso).gdpShare * caps.productivity * demoOf(n).pop * 100) / 100, pop: Math.round(demoOf(n).pop * 1000) / 1000,
      prod: Math.round(caps.productivity * 100) / 100, tech: Math.round(techAvg(caps) * 10) / 10, soft: Math.round(softPowerOf(n)), rating: ratingLabel(creditOf(n).score), temp,
    });
  }
}

function monthly(w: World) {
  if (dateAt(w.time).month === 0) noteYear(w);
}

export function almanacDaily(w: World) {
  if (!w.scenarioApplied) applyScenario(w);
  noteLeaders(w); // cheap: one comparison per country
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
