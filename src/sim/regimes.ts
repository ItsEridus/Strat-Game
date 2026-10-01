// Regimes as rule sets (2.3 Rise & fall). Every country has a regime type that sets the
// rules of its politics:
// - whether elections are free, or managed in favour of those in power;
// - term limits for the head of government;
// - how free the press is allowed to be;
// - how much the state relies on repression;
// - how power passes on (elections, the party, a royal heir, a military council).
// The sixteen countries start from their real regimes in 2025 (rounded from the
// EIU Democracy Index and V-Dem). Legitimacy (0–100) follows how well the regime
// performs, how popular the government is and how much it represses. Regimes change:
// democracies backslide when leaders are nationalist and legitimacy is low; autocracies
// open up when legitimacy collapses and society is freer. Coups and revolutions come next.
import type { Citizen, Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { player } from './query';
import { capsOf, historyPace } from './strategic';
import { leaderProfile } from './relations';

export type RegimeType = 'full' | 'flawed' | 'hybrid' | 'oneparty' | 'personalist' | 'junta' | 'monarchy';
export interface RegimeRules {
  label: string; free: boolean; managed: number; termLimit: number | null; press: number; repression: number;
  succession: 'election' | 'party' | 'heir' | 'council'; desc: string; rank: number;
}
export const REGIMES: Record<RegimeType, RegimeRules> = {
  full: { label: 'Full democracy', free: true, managed: 0, termLimit: 2, press: 0.85, repression: 0, succession: 'election', rank: 6, desc: 'Free and fair elections, independent courts and a free press.' },
  flawed: { label: 'Flawed democracy', free: true, managed: 0, termLimit: 2, press: 0.65, repression: 0.05, succession: 'election', rank: 5, desc: 'Free elections, with weaker institutions, polarisation or pressure on the press.' },
  hybrid: { label: 'Hybrid regime', free: false, managed: 15, termLimit: null, press: 0.4, repression: 0.25, succession: 'election', rank: 4, desc: 'Elections are held but tilted towards those in power; courts and media are leaned on.' },
  oneparty: { label: 'One-party state', free: false, managed: 60, termLimit: null, press: 0.1, repression: 0.6, succession: 'party', rank: 2, desc: 'One party rules; elections confirm its choices; the press is controlled.' },
  personalist: { label: 'Personalist autocracy', free: false, managed: 40, termLimit: null, press: 0.15, repression: 0.55, succession: 'election', rank: 2, desc: 'Power rests with one leader; elections are staged and rivals sidelined.' },
  junta: { label: 'Military junta', free: false, managed: 50, termLimit: null, press: 0.1, repression: 0.7, succession: 'council', rank: 1, desc: 'The armed forces rule through a council of officers.' },
  monarchy: { label: 'Absolute monarchy', free: false, managed: 200, termLimit: null, press: 0.1, repression: 0.6, succession: 'heir', rank: 1, desc: 'The monarch rules; there is no contest for the head of state.' },
};
/** The regimes of 2025 (EIU and V-Dem, rounded). */
const START: Record<string, RegimeType> = {
  CAN: 'full', DEU: 'full', GBR: 'full', JPN: 'full', AUS: 'full', KOR: 'full',
  USA: 'flawed', BRA: 'flawed', ARG: 'flawed', ZAF: 'flawed', IND: 'flawed',
  MEX: 'hybrid', TUR: 'hybrid', RUS: 'personalist', CHN: 'oneparty', SAU: 'monarchy',
};
const LADDER: RegimeType[] = ['personalist', 'hybrid', 'flawed', 'full'];

export interface Regime { type: RegimeType; since: number; legitimacy: number; history: { t: number; from: RegimeType; to: RegimeType; why: string }[] }
export function regimeOf(n: Nation): Regime {
  return (n.regime ??= { type: START[n.iso] ?? 'flawed', since: -1, legitimacy: 60, history: [] });
}
export const rulesOf = (n: Nation) => REGIMES[regimeOf(n).type];
export const isDemocracy = (n: Nation) => rulesOf(n).free;

/** The extra pull the regime gives those in power at the polls (0 in a democracy). */
export function managedBonus(w: World, n: Nation, cand: Citizen | null, partyId: Id | null | undefined): number {
  const r = rulesOf(n);
  if (!r.managed) return 0;
  const pres = n.president != null ? w.citizens[n.president] : null;
  if (cand && pres && cand.id === pres.id) return r.managed;
  if (partyId != null && pres?.party === partyId) return r.managed * (r.succession === 'party' ? 1 : 0.6);
  return 0;
}

/** Term limits: someone who has served the limit cannot be nominated again. */
export function termLimited(w: World, n: Nation, c: Citizen): boolean {
  const lim = rulesOf(n).termLimit;
  return lim != null && (c.flags.termsServed ?? 0) >= lim;
}

/** Change regime, with the reason, for the record. */
export function changeRegime(w: World, n: Nation, to: RegimeType, why: string) {
  const r = regimeOf(n);
  if (r.type === to) return;
  r.history.push({ t: w.time, from: r.type, to, why });
  if (r.history.length > 30) r.history.shift();
  const better = REGIMES[to].rank > REGIMES[r.type].rank;
  r.type = to;
  r.since = w.time;
  const text = `${better ? '🗽' : '⛓️'} ${n.name} became a ${REGIMES[to].label.toLowerCase()}: ${why}.`;
  record(w, 'politics', text, { nation: n.id, important: true });
  (n.chronicle ??= []).push({ t: w.time, text });
  if (player(w).nation === n.id) notify(w, 'politics', text, { critical: true });
}

function monthly(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const r = regimeOf(n);
    const rules = REGIMES[r.type];
    const caps = capsOf(w, n);
    // Legitimacy: performance, popularity, democracy, and the cost of repression.
    const target = Math.max(0, Math.min(100, 50 + caps.growth * 4 + (n.approval - 50) * 0.5 - n.unemployment * 60 + (rules.free ? 12 : 0) - rules.repression * 15 + (caps.cohesion - 50) * 0.2));
    r.legitimacy = Math.round((r.legitimacy + (target - r.legitimacy) * 0.1) * 10) / 10;
    // The press drifts towards what the regime allows.
    caps.inst.press = Math.round((caps.inst.press + (rules.press - caps.inst.press) * 0.02) * 1000) / 1000;
    if (w.time - r.since < 365 * DAY) continue; // a new regime gets a year before it can change again
    const lp = leaderProfile(w, n);
    const step = LADDER.indexOf(r.type);
    if (rules.free) {
      // Backsliding: a nationalist leader, a weak regime, an unhappy public.
      // Strong courts and a long democratic habit resist it.
      const p = (0.001 + Math.max(0, lp.nationalism - 0.5) * 0.006 + (r.legitimacy < 35 ? 0.008 : 0) + (n.approval < 30 ? 0.004 : 0)) * Math.max(0.1, 1.15 - caps.inst.law);
      if (step > 0 && chance(w, p)) {
        changeRegime(w, n, LADDER[step - 1], r.type === 'full' ? 'the government leaned on the courts and the press' : 'elections were tilted and opponents harassed');
        caps.inst.law = Math.max(0.1, caps.inst.law - 0.05);
      }
    } else {
      // Opening up: legitimacy collapses, society is freer than the regime would like.
      const p = 0.0004 + (r.legitimacy < 30 ? 0.008 : 0) + (caps.inst.press > 0.5 ? 0.002 : 0) + (n.approval < 30 ? 0.003 : 0);
      if (chance(w, p)) {
        const to: RegimeType = r.type === 'hybrid' ? 'flawed' : 'hybrid';
        changeRegime(w, n, to, r.type === 'hybrid' ? 'a free election was allowed and the opposition won its place' : 'the rulers opened up under pressure: opposition parties were allowed to compete');
      }
    }
  }
}

export function regimesDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) monthly(w);
}
