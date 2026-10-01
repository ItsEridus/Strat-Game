// Natural hazards (1.9 Sky & ground): how disasters strike and how countries cope.
//
// - Severity is heavy-tailed: most events are minor, about one in ten is major, and a
//   few in a hundred are catastrophic.
// - Preparedness (building standards, levees, emergency services) starts from each
//   country's record: Japan is the best prepared, while Turkey's building codes are
//   poorly enforced. Better infrastructure raises it. Prepared countries lose fewer
//   lives and buildings.
// - Early warning: storms and floods are forecast a day ahead, and evacuation saves lives.
// - The response: emergency services and the army deploy, and allies and friends send
//   aid after major disasters.
// - Insurance: insurers pay companies for their losses, in proportion to how much of
//   the economy is insured (about half in the United States, a twentieth in India).
// - Recovery: destroyed buildings are rebuilt through the construction system.
// - Big earthquakes on coasts can raise tsunamis; volcanoes erupt where real ones are;
//   heatwaves follow the weather.
import type { CrisisKind, Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { notify, record, schedule } from '../engine/events';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { chance, pick, rand } from '../engine/rng';
import { coref, hhref, natref, player } from './query';
import { HANDLERS } from './hooks';
import { capsOf } from './strategic';
import { addCrisis, KIND_ICON } from './dynamics';
import { formationsOf } from './forces';
import { startProject } from './construction';
import { weatherOf } from './weather';
import { EARTH } from '../data/earth';

/** Disaster preparedness (0..1): building standards, warning systems and emergency services. */
const PREPARED: Record<string, number> = { JPN: 0.9, USA: 0.75, DEU: 0.75, GBR: 0.7, CAN: 0.75, AUS: 0.75, KOR: 0.75, CHN: 0.6, RUS: 0.5, TUR: 0.45, MEX: 0.5, BRA: 0.4, ARG: 0.45, ZAF: 0.4, IND: 0.35, SAU: 0.55 };
/** Share of property losses insured (approximate, from reinsurers' protection-gap studies). */
const INSURED: Record<string, number> = { USA: 0.55, CAN: 0.45, AUS: 0.5, GBR: 0.5, DEU: 0.4, JPN: 0.4, KOR: 0.3, CHN: 0.1, IND: 0.05, MEX: 0.12, BRA: 0.1, ARG: 0.1, ZAF: 0.2, RUS: 0.1, TUR: 0.15, SAU: 0.15 };
/** Each market's largest property insurer (for the news). */
const INSURER: Record<string, string> = { USA: 'State Farm', CAN: 'Intact', MEX: 'GNP Seguros', BRA: 'Porto Seguro', ARG: 'Sancor Seguros', GBR: 'Aviva', DEU: 'Allianz', RUS: 'Rosgosstrakh', TUR: 'Anadolu Sigorta', SAU: 'Tawuniya', ZAF: 'Santam', IND: 'New India Assurance', CHN: 'PICC', JPN: 'Tokio Marine', KOR: 'Samsung Fire & Marine', AUS: 'IAG' };

/** Average staffing of a national service across a country's regions (0.6 where nobody is needed). */
const staffing = (w: World, n: Nation, k: 'emergency' | 'meteorology') => { const rs = w.regions.filter((r) => r.owner === n.id && r.staff?.[k] != null); return rs.length ? rs.reduce((t, r) => t + r.staff![k]!, 0) / rs.length : 0.6; };
/** Preparedness: the country's record, its infrastructure since 2025, and how well its emergency services are staffed. */
export const preparedness = (w: World, n: Nation) => Math.max(0.1, Math.min(0.98, (PREPARED[n.iso] ?? 0.45) + (capsOf(w, n).infra - (capsOf(w, n).base?.infra ?? capsOf(w, n).infra)) / 100 + (staffing(w, n, 'emergency') - 0.6) * 0.15));
/** How much a public warning saves: better with a staffed weather service. */
export const warningEffect = (w: World, n: Nation) => Math.min(0.8, preparedness(w, n) * (0.5 + staffing(w, n, 'meteorology') * 0.2));
export const insuredShare = (n: Nation) => INSURED[n.iso] ?? 0.1;

/** How deadly each kind of hazard is, relative to a hurricane of the same severity. */
const LETHALITY: Partial<Record<CrisisKind, number>> = { earthquake: 2.5, tsunami: 2, hurricane: 1, flood: 0.8, eruption: 0.8, heatwave: 0.6, wildfire: 0.3, blizzard: 0.2, drought: 0 };
/** Hazards that are forecast a day ahead. */
export const WARNED: CrisisKind[] = ['hurricane', 'flood', 'eruption', 'blizzard'];
export const SEVERITY_LABEL = ['', 'Minor', 'Severe', 'Major', 'Catastrophic'];

/** A heavy-tailed magnitude (a Pareto draw): most events are small, a few are catastrophic. Returns the severity level 1–4 and the raw size. */
export function heavyTail(w: World): { level: number; size: number } {
  const u = Math.max(1e-6, rand(w, 0, 1));
  const size = Math.min(20, 1 / Math.sqrt(u)); // P(size ≥ x) = 1/x²
  return { level: size < 1.8 ? 1 : size < 3 ? 2 : size < 6 ? 3 : 4, size };
}

export interface Warning { kind: CrisisKind; label: string; regions: Id[]; level: number; size: number; at: number; nation: Id }

/** A hazard is rolled: warned ones arrive tomorrow (with a public warning), others strike now. */
export function hazardArrives(w: World, kind: CrisisKind, label: string, regions: Id[]) {
  const { level, size } = heavyTail(w);
  const nation = w.regions[regions[0]].owner;
  if (WARNED.includes(kind)) {
    const wn: Warning = { kind, label, regions, level, size, at: w.time + DAY, nation };
    (w.warnings ??= []).push(wn);
    schedule(w, wn.at, 'hazardImpact', { i: w.warnings.length - 1, at: wn.at });
    const p = player(w);
    const n = w.nations[nation];
    record(w, 'disaster', `⚠️ ${n.name} issued a ${label.toLowerCase()} warning for ${regions.map((r) => w.regions[r].name).slice(0, 3).join(', ')}${regions.length > 3 ? ' and more' : ''}.`, { region: regions[0], nation });
    if (regions.includes(p.loc)) notify(w, 'personal', `⚠️ ${label} warning for ${w.regions[p.loc].name}: it is expected to hit within a day.`, { critical: true, link: 'local' });
    return;
  }
  strike(w, kind, label, regions, level, size, 0);
}

HANDLERS.hazardImpact = (w, d) => {
  const wn = (w.warnings ?? []).find((x) => x.at === d.at) ?? w.warnings?.[d.i];
  if (!wn) return;
  w.warnings = (w.warnings ?? []).filter((x) => x !== wn);
  strike(w, wn.kind, wn.label, wn.regions, wn.level, wn.size, warningEffect(w, w.nations[wn.nation]));
};

/** The impact: deaths, damage, insurance, the response, aid and reconstruction. */
export function strike(w: World, kind: CrisisKind, label: string, regions: Id[], level: number, size: number, warned: number) {
  const r0 = w.regions[regions[0]];
  const n = w.nations[r0.owner];
  if (!n) return;
  const prep = preparedness(w, n);
  const vuln = 1.7 - prep; // 0.8 (Japan) .. 1.35 (India)
  const army = formationsOf(w, n.id).some((f) => f.branch === 'army' && w.regions[f.loc]?.owner === n.id);
  const c = addCrisis(w, kind, `${level >= 2 ? `${SEVERITY_LABEL[level]} ` : ''}${label.toLowerCase().replace(/^./, (x) => x.toUpperCase())} in ${r0.name}`, regions, n.id, level + 1 + Math.round(level * vuln), level);
  let deaths = 0, lostLevels = 0, insured = 0;
  const p = player(w);
  for (const rid of regions) {
    const r = w.regions[rid];
    if (kind !== 'drought' && kind !== 'heatwave') r.disrupted = Math.max(r.disrupted, w.time + Math.round(level * vuln) * DAY);
    const lethal = LETHALITY[kind] ?? 0.5;
    // Even the worst events kill a few per cent of a region (the 2023 Turkey earthquake: about 1% of the worst-hit provinces).
    const lost = Math.round(r.pop * Math.min(0.03, 0.0012 * Math.pow(size, 2.2) * lethal * vuln * (1 - warned) * (army ? 0.85 : 1)));
    if (lost > 0) { r.pop = Math.max(2000, r.pop - lost); deaths += lost; }
    r.unrest = Math.min(100, r.unrest + 3 * level * vuln);
    if (kind !== 'drought' && kind !== 'heatwave') r.crime = Math.min(100, r.crime + 2 * level);
    // Buildings: stronger codes and levees save more of them.
    if (level >= 2 && (kind === 'earthquake' || kind === 'hurricane' || kind === 'flood' || kind === 'tsunami' || kind === 'eruption')) {
      const hits = Math.max(0, Math.round((level - 1) * vuln * (chance(w, 0.5) ? 1 : 0.5)));
      for (let i = 0; i < hits; i++) {
        const b = (['hospital', 'industrial', 'fields', 'base'] as const).filter((k) => r.bld[k] > 0);
        if (!b.length) break;
        const k = pick(w, b);
        r.bld[k]--; lostLevels++;
        rebuild(w, n, rid, k);
      }
      const s = w.govs[rid];
      if (s && s.dev > 0 && level >= 3) s.dev--;
    }
    // Companies: damage halts work; insurers pay part of the loss.
    if (kind === 'wildfire' || kind === 'hurricane' || kind === 'earthquake' || kind === 'tsunami' || kind === 'flood' || kind === 'eruption') {
      for (const co of Object.values(w.companies)) {
        if (co.region !== rid || !chance(w, Math.min(0.9, 0.2 * level * vuln))) continue;
        const days = Math.max(1, Math.round(level * vuln));
        co.halt = { until: w.time + days * DAY, why: `${label} damage` };
        const daily = co.hist.length ? co.hist.slice(-7).reduce((t, h) => t + h.revenue, 0) / Math.min(7, co.hist.length) : 0;
        const claim = Math.round(daily * days * insuredShare(n));
        const code = w.nations[r.owner]?.cur ?? n.cur;
        const amt = Math.min(claim, Math.floor((w.households[n.id].wallet[code] ?? 0) * 0.01));
        if (amt > 0 && pay(w, hhref(n.id), coref(co.id), code, amt, `Insurance payout (${INSURER[n.iso] ?? 'insurers'})`)) insured += amt;
      }
    }
    if (rid === p.loc && lost > 0) {
      const safe = p.flags.shelteredUntil != null && p.flags.shelteredUntil > w.time;
      if (!safe) p.health = Math.max(5, (p.health ?? 90) - level * 4);
    }
  }
  c.deaths = deaths;
  const where = regions.length > 1 ? `${r0.name} and ${regions.length - 1} neighbouring region${regions.length > 2 ? 's' : ''}` : r0.name;
  const parts = [deaths ? `${deaths.toLocaleString()} dead` : null, lostLevels ? `${lostLevels} building level${lostLevels > 1 ? 's' : ''} destroyed` : null, insured ? `${fmtAmt(n.cur, insured)} in insurance claims` : null, warned ? 'warnings saved lives' : null, army ? 'the army deployed' : null].filter(Boolean);
  record(w, 'disaster', `${KIND_ICON[kind]} ${c.name} (${n.name}): ${where} hit${parts.length ? `; ${parts.join(', ')}` : ''}.`, { region: r0.id, nation: n.id, important: level >= 2 });
  if (regions.includes(p.loc)) notify(w, 'personal', `${KIND_ICON[kind]} ${c.name}: you are in the affected area. Relief work is on the World screen.`, { critical: level >= 2, link: 'world' });
  else if (n.id === p.nation && level >= 2) notify(w, 'politics', `${KIND_ICON[kind]} ${c.name}.`, { link: 'world' });
  if (level >= 3) internationalAid(w, n, c.name);
  // A great earthquake on a coast raises a tsunami.
  if (kind === 'earthquake' && level >= 3 && (EARTH.regions[r0.id].seas ?? []).length && chance(w, 0.5)) {
    const coast = [r0.id, ...r0.links.filter((l) => (EARTH.regions[l].seas ?? []).length && w.regions[l].owner === n.id)];
    strike(w, 'tsunami', 'Tsunami', coast, Math.max(2, level - 1), size * 0.7, 0);
  }
}

/** Rebuild destroyed buildings (AI governments start the project; a player government is told). */
function rebuild(w: World, n: Nation, rid: Id, type: 'hospital' | 'industrial' | 'fields' | 'base') {
  const president = n.president != null ? w.citizens[n.president] : null;
  if (!president) return;
  if (president.player) { notify(w, 'politics', `🏗️ ${w.regions[rid].name} lost a level of its ${type === 'base' ? 'military base' : type}. Rebuild it from the Construction screen.`, { link: 'construction' }); return; }
  if (w.regions[rid].project == null) startProject(w, president.id, n.id, rid, type);
}

/** Allies and friends send aid after a major disaster. */
function internationalAid(w: World, n: Nation, what: string) {
  const donors = w.nations.filter((d) => d.id !== n.id && !d.exile && (n.alliances.includes(d.id) || (d.relations[n.id]?.score ?? 0) >= 20));
  let total = 0;
  for (const d of donors) {
    const amt = Math.min(Math.floor((d.wallet[d.cur] ?? 0) * 0.002), cur(500));
    if (amt > 0 && pay(w, natref(d.id), natref(n.id), d.cur, amt, `Disaster aid to ${n.name}`)) {
      total++;
      d.relations[n.id] = { ...(d.relations[n.id] ?? { score: 0, hist: [] }), score: Math.min(100, (d.relations[n.id]?.score ?? 0) + 3) };
      n.relations[d.id] = { ...(n.relations[d.id] ?? { score: 0, hist: [] }), score: Math.min(100, (n.relations[d.id]?.score ?? 0) + 5) };
    }
  }
  if (total) record(w, 'disaster', `🤝 ${total} countr${total > 1 ? 'ies' : 'y'} sent aid to ${n.name} after the ${what.toLowerCase()}.`, { nation: n.id });
}

/** Daily: heatwaves follow the weather. */
export function naturalDaily(w: World) {
  if (!w.weather) return;
  const s = weatherOf(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const hot = w.regions.filter((r) => r.owner === n.id && (s.today[r.id]?.t ?? 0) >= 38);
    if (hot.length && chance(w, 0.03) && !Object.values(w.crises).some((c) => c.status === 'active' && c.kind === 'heatwave' && c.nation === n.id)) {
      strike(w, 'heatwave', 'Heatwave', hot.slice(0, 4).map((r) => r.id), 1, 1.2 + Math.max(...hot.map((r) => s.today[r.id].t)) / 40, preparedness(w, n) * 0.4);
    }
  }
}
