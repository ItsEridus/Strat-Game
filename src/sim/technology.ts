// Technology (2.4 Frontiers). Countries advance in six technology domains (strategic.ts:
// R&D with diminishing returns, plus know-how spreading from the leaders). On top of that
// sits a tree of concrete technologies (data/techTree.ts):
// - Discovery: once a country's level in a domain reaches a technology's threshold, its
//   researchers may make the breakthrough. The chance each month grows with the size of
//   its research effort (R&D spending times the size of its economy); uncertain
//   breakthroughs (fusion, human-level AI, slowing ageing) are much less likely.
// - Diffusion: once one country has it, others close to the threshold adopt it, faster
//   with good institutions and trade with the holders; export controls by every holder
//   that dislikes them slow it.
// - Effects: extra growth for a decade after adoption, stronger forces, sharper
//   intelligence, longer lives, cheaper energy, and (later) automation.
// - The innovation system (2.3.2): the research effort counts government laboratories
//   (researchers are citizens with careers in the research service) and the scientists
//   and engineers firms employ. A breakthrough is patented by a firm at home, with a lead
//   researcher who becomes known for it; countries that later adopt the technology pay
//   the patent holder royalties. Technology partnerships (a treaty) speed adoption between
//   partners; spies can steal what a rival has (a cyber intrusion, intel.ts).
import type { Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { DAY } from '../engine/clock';
import { TECHS, TECH, type TechDef, type TechEffects } from '../data/techTree';
import { BASELINES, TECH_DOMAINS, baselineOf, type TechDomain } from '../data/nationBaselines';
import { capsOf, historyPace } from './strategic';
import { researchFactor } from './nationalBudget';
import { coref, natref, player } from './query';
import { nationalStaffing } from './services';
import { nationals } from './census';
import { occupationOf } from './labour';
import { treatyBetween } from './treaties';
import { studentPull } from './softPower';
import { pay } from '../engine/ledger';
import { GOLD } from '../engine/money';
import type { Id } from './types';
import { sectorCut } from './tradePolicy';

export interface TechFirst { nation: number; t: number }
const YEAR = 365 * DAY;

/** Each domain's world leader in 2025: a technology's level is measured from it (100 = that leader). */
const LEAD_2025 = Object.fromEntries(TECH_DOMAINS.map((d) => [d, Math.max(...Object.values(BASELINES).map((b) => b.tech[d]))])) as Record<TechDomain, number>;
/** The domain level a country needs before it can make (or adopt) a technology. */
export const threshold = (d: TechDef) => LEAD_2025[d.domain] * d.level / 100;

/** The technologies a country has, with when it got them. */
export const techsOf = (n: Nation) => (n.techs ??= {});
export const hasTech = (n: Nation, id: string) => techsOf(n)[id] != null;

const fxCache = new WeakMap<Nation, { k: number; fx: Required<TechEffects> }>();
/** The combined lasting effects of a country's technologies (productivity is handled separately: it fades). */
export function techFx(n: Nation): Required<TechEffects> {
  const ts = techsOf(n);
  const k = Object.keys(ts).length;
  const hit = fxCache.get(n);
  if (hit && hit.k === k) return hit.fx;
  const fx = { productivity: 0, military: 0, intel: 0, lifespan: 0, energy: 0, automation: 0, prestige: 0 };
  for (const id of Object.keys(ts)) { const d = TECH[id]; if (!d) continue; for (const [key, v] of Object.entries(d.fx)) (fx as any)[key] += v; }
  fxCache.set(n, { k, fx });
  return fx;
}
/** Extra growth (% a year) from technologies adopted in the last ten years. */
export function techGrowth(w: World, n: Nation): number {
  let g = 0;
  for (const [id, t] of Object.entries(techsOf(n))) if (w.time - t < 10 * YEAR) g += TECH[id]?.fx.productivity ?? 0;
  return g * 0.5; // potential growth already includes ordinary technical progress: only half is extra
}
/** The size of a country's research effort (relative: the US is about 10). */
export function researchMass(n: Nation, w?: World): number {
  const b = baselineOf(n.iso);
  const people = w ? researchWorkforce(w, n) : 1;
  return b.rd * researchFactor(n) * Math.sqrt(Math.max(0.05, b.gdpShare)) * people;
}
const SCIENCE = new Set(['scientist', 'chemist', 'electrical', 'aeroeng', 'defeng', 'geologist', 'developer']);
/** How well staffed the country's research is (1 = normal): government laboratories and firms' scientists. */
export function researchWorkforce(w: World, n: Nation): number {
  const lab = nationalStaffing(w, n.id, 'research');
  const all = nationals(w, n.id);
  const sci = all.filter((c) => !c.gone && SCIENCE.has(occupationOf(w, c) ?? '')).length / Math.max(1, all.length);
  return Math.max(0.5, Math.min(1.7, (0.6 + lab * 0.4 + Math.min(0.6, sci * 8)) * studentPull(n))); // foreign students and researchers follow soft power
}

export interface Patent { tech: string; nation: Id; company: Id | null; researcher: Id | null; t: number; royalties: number }
/** Patent a breakthrough: a firm in the right industry, and the lead researcher. */
function patent(w: World, n: Nation, d: TechDef): Patent {
  const ind: Record<string, string[]> = { information: ['electronics'], military: ['wa', 'wg'], medical: ['medicine'], space: ['wa', 'electronics'], energy: ['oil', 'electronics'], industrial: ['materials', 'electronics'] };
  const cos = Object.values(w.companies).filter((co) => w.regions[co.region]?.owner === n.id && (ind[d.domain] ?? []).includes(co.industry)).sort((a, b) => b.workers.length - a.workers.length || a.id - b.id);
  const lab = nationals(w, n.id).filter((c) => !c.gone && (c.post?.kind === 'research' || occupationOf(w, c) === 'scientist')).sort((a, b) => (b.post?.grade ?? 0) - (a.post?.grade ?? 0) || b.influence - a.influence || a.id - b.id)[0];
  const p: Patent = { tech: d.id, nation: n.id, company: cos[0]?.id ?? null, researcher: lab?.id ?? null, t: w.time, royalties: 0 };
  (w.patents ??= []).push(p);
  if (lab) {
    lab.sec.fame += 6; lab.influence += 15;
    lab.flags.breakthroughs = (lab.flags.breakthroughs ?? 0) + 1;
    if (lab.player) notify(w, 'personal', `${d.icon} Your team made the breakthrough: ${d.name.toLowerCase()}. Your name is on the patent.`, { critical: true });
  }
  return p;
}
/** Adopters pay the patent holder (a small share of their gold reserves, once). */
function royalties(w: World, n: Nation, d: TechDef) {
  const p = (w.patents ?? []).find((x) => x.tech === d.id);
  if (!p || p.company == null || p.nation === n.id || !w.companies[p.company]) return;
  const amt = Math.floor((n.wallet[GOLD] ?? 0) * 0.002);
  if (amt > 0 && pay(w, natref(n.id), coref(p.company), GOLD, amt, `Royalties: ${d.name}`)) p.royalties += amt;
}
const partners = (w: World, a: Nation, b: Nation) => !!treatyBetween(w, a.id, b.id, 'tech');

export function gain(w: World, n: Nation, d: TechDef, how: 'discovered' | 'adopted' | 'stolen') {
  techsOf(n)[d.id] = w.time;
  const firsts = (w.techFirsts ??= {});
  const first = !firsts[d.id];
  if (first) firsts[d.id] = { nation: n.id, t: w.time };
  const pat = first ? patent(w, n, d) : null;
  if (how === 'adopted') royalties(w, n, d);
  const who = pat?.researcher != null ? ` The team was led by ${w.citizens[pat.researcher].name}${pat.company != null ? `; ${w.companies[pat.company].name} holds the patent` : ''}.` : '';
  const text = first
    ? `${d.icon} Breakthrough: ${n.adj} researchers achieved ${d.name.toLowerCase()}, a world first.${who}`
    : `${d.icon} ${n.name} ${how === 'discovered' ? 'developed' : how === 'stolen' ? 'copied (from stolen designs)' : 'adopted'} ${d.name.toLowerCase()}.`;
  record(w, 'politics', text, { nation: n.id, important: first });
  if (first) (n.chronicle ??= []).push({ t: w.time, text });
  // A prestige mission impresses the world.
  if (first && d.fx.prestige) for (const o of w.nations) { const rel = o.relations[n.id]; if (o.id !== n.id && !o.exile && rel) rel.score = Math.min(100, rel.score + d.fx.prestige / 4); }
  if (player(w).nation === n.id && (first || d.fx.productivity || d.fx.military)) notify(w, 'politics', text, { critical: first });
}

/** Do all the holders of a technology who dislike `n` keep it from them? */
export function controlled(w: World, n: Nation, id: string): boolean {
  const holders = w.nations.filter((o) => o.id !== n.id && !o.exile && hasTech(o, id));
  return holders.length > 0 && holders.every((o) => !partners(w, o, n) && ((o.relations[n.id]?.score ?? 0) < -20 || o.embargoes.includes(n.id) || sectorCut(w, o.id, n.id, 'tech')));
}

export function techMonth(w: World) {
  for (const d of TECHS) {
    const known = !!w.techFirsts?.[d.id];
    for (const n of w.nations) {
      if (n.exile || n.dissolved != null || hasTech(n, d.id)) continue;
      const level = capsOf(w, n).tech[d.domain];
      if (!known) {
        // Discovery.
        if (level < threshold(d)) continue;
        const p = 0.02 * researchMass(n, w) / 5 * (d.uncertain ? 0.15 : 1);
        if (chance(w, p)) gain(w, n, d, 'discovered');
      } else {
        // Diffusion from those who have it.
        const blocked = controlled(w, n, d.id);
        if (level < threshold(d) - (blocked ? 0 : 4)) continue;
        const eff = capsOf(w, n).inst.effectiveness;
        const partnered = w.nations.some((o) => o.id !== n.id && hasTech(o, d.id) && partners(w, o, n));
        const p = (0.04 + eff * 0.06 + (level >= threshold(d) ? 0.05 : 0) + (partnered ? 0.08 : 0)) * (blocked ? 0.3 : 1);
        if (chance(w, p)) gain(w, n, d, 'adopted');
      }
    }
  }
}

export function technologyDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) techMonth(w);
}

/** Spies copy a technology the target has, if the thief's own level is close enough to use it. */
export function stealTech(w: World, thief: Nation, target: Nation): TechDef | null {
  const level = capsOf(w, thief).tech;
  const d = TECHS.find((x) => hasTech(target, x.id) && !hasTech(thief, x.id) && level[x.domain] >= threshold(x) - 8);
  if (!d) return null;
  gain(w, thief, d, 'stolen');
  return d;
}

/** A country's place in the technology race: technologies held, and world firsts. */
export function techStanding(w: World, n: Nation) {
  const held = Object.keys(techsOf(n)).length;
  const firsts = Object.values(w.techFirsts ?? {}).filter((f) => f.nation === n.id).length;
  return { held, firsts };
}
