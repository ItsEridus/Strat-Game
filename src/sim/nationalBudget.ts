// National budgets and grand strategy (1.6 GEO 2). A government divides its revenue
// between defence, intelligence, police, education, health, research, infrastructure
// and welfare. The first four already fund their services (forces, the intelligence
// service, the police and schools); health, research and infrastructure are paid out
// daily to the people who do the work and raise the country's capabilities; welfare
// sets the transfers to households. Budgets change by law, through congress.
//
// Each AI government follows a grand strategy, chosen each January (or when war
// breaks out) from its situation: development first, a military build-up, regional
// leadership, reform or retrenchment. It proposes a budget to match, and the
// country's chronicle records why the strategy changed.
import type { Nation, World } from './types';
import { pay } from '../engine/ledger';
import { dateAt } from '../engine/calendar';
import { record } from '../engine/events';
import { hhref, natref } from './query';
import { B } from '../data/balance';
import { baselineOf } from '../data/nationBaselines';
import { capsOf } from './strategic';
import { dailyRevenue } from './publicFinance';
import { EXTRA_PROPOSALS } from './congressExtra';
import { nationScores } from './forces';
import { defenceNorm } from './arsenal';
import { defenceLobby } from './forceStructure';

export type BudgetLine = 'defence' | 'intelligence' | 'police' | 'education' | 'health' | 'research' | 'infrastructure' | 'welfare';
export const BUDGET_LINES: BudgetLine[] = ['defence', 'intelligence', 'police', 'education', 'health', 'research', 'infrastructure', 'welfare'];
export const LINE_LABEL: Record<BudgetLine, string> = { defence: 'Defence', intelligence: 'Intelligence', police: 'Police', education: 'Education', health: 'Health', research: 'Research', infrastructure: 'Infrastructure', welfare: 'Welfare' };
export type Budget = Record<BudgetLine, number>; // shares of daily revenue

export type Strategy = 'development' | 'buildup' | 'regional' | 'reform' | 'retrenchment';
export const STRATEGY_INFO: Record<Strategy, { label: string; icon: string; desc: string }> = {
  development: { label: 'Development first', icon: '🏗️', desc: 'grow the economy: research, education and infrastructure come first' },
  buildup: { label: 'Military build-up', icon: '🛡️', desc: 'threatened or at war: defence and intelligence come first' },
  regional: { label: 'Regional leadership', icon: '🌐', desc: 'a strong power extending its reach: defence, intelligence and research' },
  reform: { label: 'Reform', icon: '⚖️', desc: 'weak institutions: police, education and health to rebuild the state' },
  retrenchment: { label: 'Retrenchment', icon: '✂️', desc: 'too much debt: spending cut across the board' },
};

/** Health, research and infrastructure defaults (shares of revenue), from real spending patterns. */
const defaults = (n: Nation): Pick<Budget, 'health' | 'research' | 'infrastructure'> => ({ health: 0.06, research: 0.02 + baselineOf(n.iso).rd * 0.008, infrastructure: 0.05 });

/** The budget in force: the existing service settings plus the new lines. */
export function budgetOf(n: Nation): Budget {
  const extra = n.budgetExtra ?? defaults(n);
  return {
    defence: n.defense.budget, intelligence: n.agency.budget, police: n.policeFunding, education: n.eduFunding ?? 0.05,
    health: extra.health, research: extra.research, infrastructure: extra.infrastructure, welfare: n.welfare ?? WELFARE,
  };
}
export const budgetTotal = (b: Budget) => BUDGET_LINES.reduce((t, k) => t + b[k], 0);

export function setBudget(n: Nation, b: Budget) {
  n.defense.budget = b.defence;
  n.agency.budget = b.intelligence;
  n.policeFunding = b.police;
  n.eduFunding = b.education;
  n.budgetExtra = { health: b.health, research: b.research, infrastructure: b.infrastructure };
  n.welfare = b.welfare;
}

/** How much the research line multiplies a country's R&D against its 2025 level. */
export const researchFactor = (n: Nation) => budgetOf(n).research / defaults(n).research;
export const infraFactor = (n: Nation) => budgetOf(n).infrastructure / defaults(n).infrastructure;
export const healthFactor = (n: Nation) => budgetOf(n).health / defaults(n).health;
/** Welfare scales the daily transfers to households (15% = the usual 2% of the treasury a day). */
/** Default welfare share of revenue (pensions, benefits and other transfers are about a third of government spending). */
export const WELFARE = 0.35;
/**
 * Today's transfers to households: the welfare share of revenue, never more than 2% of the treasury in a day.
 * (Transfers used to be 2% of the treasury, so borrowed money flowed straight out as transfers.)
 */
export const welfareTransfer = (n: Nation) => Math.min(Math.round(dailyRevenue(n) * (n.welfare ?? WELFARE)), Math.floor((n.wallet[n.cur] ?? 0) * B.treasury.householdTransfer));

/** Daily spending on health, research and infrastructure: wages and contracts in the background economy. */
export function budgetDaily(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const b = budgetOf(n);
    const rev = dailyRevenue(n);
    for (const k of ['health', 'research', 'infrastructure'] as const) {
      const amt = Math.min(Math.round(rev * b[k]), Math.floor((n.wallet[n.cur] ?? 0) * 0.05));
      if (amt > 0 && pay(w, natref(n.id), hhref(n.id), n.cur, amt, `Public spending: ${LINE_LABEL[k].toLowerCase()}`)) n.stats.spendToday += amt;
    }
  }
  for (const n of w.nations) if (!n.exile && !n.strategy) reviewStrategy(w, n, 'the start of the period');
  if (dateAt(w.time).day === 1 && dateAt(w.time).month === 0) for (const n of w.nations) if (!n.exile) reviewStrategy(w, n, 'the new year');
}

/** The strategy a government's situation calls for, with the reason. */
export function chooseStrategy(w: World, n: Nation): { kind: Strategy; why: string } {
  const atWar = Object.values(w.wars).some((x) => x.status === 'active' && (x.att === n.id || x.def === n.id));
  if (atWar) return { kind: 'buildup', why: 'the country is at war' };
  const debtYears = (n.debt ?? 0) / Math.max(1, dailyRevenue(n) * 365);
  if (debtYears > 1.5) return { kind: 'retrenchment', why: `public debt has reached ${debtYears.toFixed(1)} years of revenue` };
  const c = capsOf(w, n);
  if (c.inst.effectiveness < 0.45 || c.cohesion < 40) return { kind: 'reform', why: c.cohesion < 40 ? 'the country is restless and divided' : 'the state works poorly' };
  const score = nationScores(w).find((s) => s.id === n.id);
  if (score && (score.tier === 'superpower' || score.tier === 'great')) return { kind: 'regional', why: `it is a ${score.tier === 'superpower' ? 'superpower' : 'great power'} with interests to protect` };
  return { kind: 'development', why: 'peace and room to grow' };
}

/** The budget a strategy wants, from the current one. */
export function strategyBudget(n: Nation, kind: Strategy): Budget {
  const b = { ...budgetOf(n) };
  const d = defaults(n);
  const set = (k: BudgetLine, v: number) => { b[k] = Math.round(v * 1000) / 1000; };
  switch (kind) {
    case 'development': set('research', d.research * 1.4); set('infrastructure', d.infrastructure * 1.4); set('education', Math.max(b.education, 0.06)); set('defence', Math.min(b.defence, defenceNorm(n))); break;
    case 'buildup': set('defence', Math.max(b.defence, defenceNorm(n) * 1.6)); set('intelligence', Math.max(b.intelligence, B.intel.budget * 1.5)); set('research', d.research); set('infrastructure', d.infrastructure * 0.8); break;
    case 'regional': set('defence', defenceNorm(n) * 1.2); set('intelligence', B.intel.budget * 1.3); set('research', d.research * 1.2); break;
    case 'reform': set('police', Math.max(b.police, 0.035)); set('education', Math.max(b.education, 0.065)); set('health', d.health * 1.3); break;
    case 'retrenchment': for (const k of BUDGET_LINES) set(k, b[k] * 0.85); break;
  }
  return b;
}

/** Review the strategy; if it changes, record why and put a matching budget before congress (AI governments). */
export function reviewStrategy(w: World, n: Nation, occasion: string) {
  const next = chooseStrategy(w, n);
  const prev = n.strategy?.kind;
  if (prev === next.kind) return;
  n.strategy = { kind: next.kind, since: w.time, why: next.why };
  const text = `${STRATEGY_INFO[next.kind].icon} ${n.name} adopted a strategy of ${STRATEGY_INFO[next.kind].label.toLowerCase()} at ${occasion}: ${next.why}.`;
  (n.chronicle ??= []).push({ t: w.time, text });
  if (n.chronicle.length > 200) n.chronicle.shift();
  record(w, 'politics', text, { nation: n.id });
  // An AI government enacts its matching budget directly when the leader is not the player (a budget law follows).
  const president = n.president != null ? w.citizens[n.president] : null;
  if (!president?.player) setBudget(n, strategyBudget(n, next.kind));
}

/** The budget law: congress votes on a whole budget. */
EXTRA_PROPOSALS.budget = {
  info: { name: 'Pass a budget', fullTerm: false },
  describe: (_w, n, params) => {
    const now = budgetOf(n);
    const changes = BUDGET_LINES.filter((k) => Math.abs((params[k] ?? now[k]) - now[k]) > 0.0005).map((k) => `${LINE_LABEL[k]} ${(now[k] * 100).toFixed(1)}% → ${((params[k] ?? now[k]) * 100).toFixed(1)}%`);
    return { effect: changes.length ? `${changes.join(', ')} (shares of daily revenue).` : 'No change.', cost: 0 };
  },
  check: (_w, n, _c, params) => {
    const b = { ...budgetOf(n), ...params } as Budget;
    if (BUDGET_LINES.some((k) => !(b[k] >= 0 && b[k] <= 0.5))) return 'Each line is between 0% and 50% of revenue.';
    if (budgetTotal(b) > 1.2) return 'The budget cannot plan to spend more than 120% of revenue.';
    const now = budgetOf(n);
    if (BUDGET_LINES.every((k) => Math.abs(b[k] - now[k]) < 0.0005)) return 'That is the budget already in force.';
    return null;
  },
  support: (w, n, _d, params) => {
    // Lawmakers back budgets that fit the country's situation.
    const want = strategyBudget(n, chooseStrategy(w, n).kind);
    const b = { ...budgetOf(n), ...params } as Budget;
    const dist = BUDGET_LINES.reduce((t, k) => t + Math.abs(b[k] - want[k]), 0);
    // Defence contractors lobby for bigger defence budgets; their workers are voters.
    const lobby = b.defence > budgetOf(n).defence + 0.0005 ? defenceLobby(w, n) : 0;
    return 0.3 - dist * 3 + lobby;
  },
  enact: (_w, n, p) => { setBudget(n, { ...budgetOf(n), ...p.params } as Budget); return 'The new budget is in force.'; },
  aiOptions: (w, n) => [{ params: strategyBudget(n, chooseStrategy(w, n).kind), weight: 1 }],
};

export const strategyOf = (n: Nation) => n.strategy;
