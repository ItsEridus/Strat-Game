// Self-employment and small businesses (1.5 GEO 1). A qualified person can work for
// themselves: a plumber or electrician taking jobs, a tutor, a taxi driver, or the
// owner of a neighbourhood café, restaurant or shop, a doctor's practice or a law firm.
// Takings come from local customers (the background economy), depend on skill, the
// size of the place and the state of the economy, and vary from day to day; costs
// (supplies, rent) go back to it. A business that keeps losing money closes.
import type { Citizen, Id, World } from './types';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { B } from '../data/balance';
import { rank, type EduLevel, type Field } from '../data/education';
import { census } from './census';
import { controller, cref, hhref, jailed, natref, player, today } from './query';
import { progressive } from '../data/economy';
import { ageOf } from './growth';
import { eduOfCitizen } from './education';
import { priceIndex } from './housing';
import { logWork, endWork } from './services';
import { pickStable } from './places';
import { VENUE_KINDS } from '../data/places';

export type BizKind = 'trades' | 'tutor' | 'taxi' | 'cafe' | 'restaurant' | 'shop' | 'practice' | 'lawfirm';
interface BizDef { label: string; icon: string; title: string; start: number; takings: number; costs: number; edu: EduLevel; field?: Field[]; rent: number }
/** Start-up cost, typical daily takings and the share that goes on supplies (units of value), and daily rent. */
export const BIZ: Record<BizKind, BizDef> = {
  trades: { label: 'Trades business', icon: '🔧', title: 'Self-employed tradesperson', start: 80, takings: 14, costs: 0.25, edu: 'vocational', field: ['trades', 'engineering'], rent: 0 },
  tutor: { label: 'Private tutoring', icon: '📝', title: 'Private tutor', start: 10, takings: 9, costs: 0.05, edu: 'bachelor', rent: 0 },
  taxi: { label: 'Taxi', icon: '🚕', title: 'Taxi driver', start: 120, takings: 13, costs: 0.35, edu: 'school', rent: 0 },
  cafe: { label: 'Café', icon: '☕', title: 'Café owner', start: 250, takings: 26, costs: 0.45, edu: 'school', rent: 2.5 },
  restaurant: { label: 'Restaurant', icon: '🍽️', title: 'Restaurant owner', start: 500, takings: 45, costs: 0.5, edu: 'vocational', rent: 4 },
  shop: { label: 'Shop', icon: '🛍️', title: 'Shopkeeper', start: 300, takings: 32, costs: 0.6, edu: 'school', rent: 3 },
  practice: { label: "Doctor's practice", icon: '🩺', title: 'Doctor in private practice', start: 600, takings: 60, costs: 0.3, edu: 'master', field: ['medicine'], rent: 4 },
  lawfirm: { label: 'Law firm', icon: '⚖️', title: 'Lawyer in private practice', start: 300, takings: 40, costs: 0.2, edu: 'master', field: ['law'], rent: 3 },
};
export const BIZ_KEYS = Object.keys(BIZ) as BizKind[];
/** Self-employed share of workers (ILO/OECD, latest, rounded; India and Mexico capped for the scale of the game). */
export const SELF_EMPLOYED: Record<string, number> = { USA: 0.07, CAN: 0.08, MEX: 0.25, BRA: 0.25, ARG: 0.22, GBR: 0.14, DEU: 0.09, RUS: 0.07, TUR: 0.25, SAU: 0.04, ZAF: 0.1, IND: 0.3, CHN: 0.15, JPN: 0.1, KOR: 0.2, AUS: 0.09 };

export interface Business { kind: BizKind; name: string; region: Id; since: number; hist: { rev: number; cost: number }[] }

const qualifies = (c: Citizen, d: BizDef) => {
  const e = eduOfCitizen(c);
  return rank(e.level) >= rank(d.edu) && (!d.field || (e.field != null && d.field.includes(e.field)));
};
const nameFor = (w: World, region: Id, kind: BizKind, c: Citizen) => {
  if (kind === 'cafe' || kind === 'restaurant') return pickStable(VENUE_KINDS[kind].names, `${region}:${kind}:${c.id}`);
  const surname = c.name.split(' ').slice(-1)[0];
  return ({ trades: `${surname} & Sons`, tutor: `${surname} Tutoring`, taxi: `${surname} Cabs`, shop: `${surname}'s`, practice: `Dr ${surname}'s Practice`, lawfirm: `${surname} Legal` } as Record<BizKind, string>)[kind];
};

export function startCheck(w: World, c: Citizen, kind: BizKind): string | null {
  const d = BIZ[kind];
  if (ageOf(w, c) < B.life.adultAge) return 'You need to be an adult to run a business.';
  if (jailed(w, c)) return 'Not from prison.';
  if (c.business) return 'You already run a business.';
  if (!qualifies(c, d)) return `You need ${d.edu === 'school' ? 'to have finished school' : `a ${d.edu} qualification`}${d.field ? ` (${d.field.join(' or ')})` : ''}.`;
  const nat = controller(w.regions[c.loc]);
  if (nat !== c.nation) return 'Start a business in your own country.';
  const code = w.nations[nat].cur;
  if ((c.wallet[code] ?? 0) < cur(d.start)) return `Setting up costs ${fmtAmt(code, cur(d.start))}.`;
  return null;
}

/** Start a business where you are: pay the set-up costs (equipment, fit-out, licence). Leaves any job. */
export function startBusiness(w: World, kind: BizKind, c: Citizen = player(w)): Result {
  const why = startCheck(w, c, kind);
  if (why) return fail(why);
  const d = BIZ[kind];
  const nat = controller(w.regions[c.loc]);
  const code = w.nations[nat].cur;
  pay(w, cref(c.id), hhref(nat), code, cur(d.start), `Setting up: ${d.label.toLowerCase()}`);
  if (c.job != null && w.companies[c.job]) { const co = w.companies[c.job]; co.workers = co.workers.filter((x) => x !== c.id); c.job = null; endWork(w, c, 'left to work for themselves'); }
  c.business = { kind, name: nameFor(w, c.loc, kind, c), region: c.loc, since: w.time, hist: [] };
  delete c.benefit;
  logWork(w, c, `${d.title} (${c.business.name})`, w.regions[c.loc].name);
  return ok(`${d.icon} ${c.business.name} is open for business.`);
}

export function closeBusiness(w: World, c: Citizen = player(w), why = 'closed the business'): Result {
  if (!c.business) return fail('You do not run a business.');
  const name = c.business.name;
  delete c.business;
  endWork(w, c, why);
  return ok(`${name} has closed.`);
}

/** Today's takings: base × skill × local prices × the economy × a daily draw (some days are slow). */
function takings(w: World, c: Citizen, b: Business): number {
  const d = BIZ[b.kind];
  const skill = 0.8 + Math.min(0.6, (c.eco + c.attrs.lead) / 100);
  const local = Math.sqrt(priceIndex(w.regions[b.region]));
  const economy = 1 + 0.25 * w.econ.cycle;
  const day = 0.6 + hash01(c.id, today(w), 1503) * 0.8;
  return Math.round(cur(d.takings) * skill * local * economy * day);
}

export function smallBusinessDaily(w: World) {
  for (const c of census(w).all) {
    const b = c.business;
    if (!b || c.gone || jailed(w, c)) continue;
    const nat = controller(w.regions[b.region]);
    const n = w.nations[nat];
    const hh = w.households[nat];
    const rev = Math.min(takings(w, c, b), Math.floor((hh.wallet[n.cur] ?? 0) / 1000));
    if (rev > 0) pay(w, hhref(nat), cref(c.id), n.cur, rev, `Takings: ${b.name}`);
    const d = BIZ[b.kind];
    const cost = Math.min(c.wallet[n.cur] ?? 0, Math.round(rev * d.costs + cur(d.rent) * priceIndex(w.regions[b.region])));
    if (cost > 0) pay(w, cref(c.id), hhref(nat), n.cur, cost, `Supplies and rent: ${b.name}`);
    // Profit is taxed as income, at the national rate for that level of earnings.
    const profit = rev - cost;
    const tax = profit > 0 ? Math.min(c.wallet[n.cur] ?? 0, Math.round((profit * n.taxes.work * progressive(profit / cur(B.wages.start))) / 100)) : 0;
    if (tax > 0 && pay(w, cref(c.id), natref(nat), n.cur, tax, 'Income tax (self-employed)')) n.stats.revToday += tax;
    c.incomeToday += profit - tax;
    b.hist.push({ rev, cost: cost + tax });
    if (b.hist.length > 30) b.hist.shift();
    // Two months of losses with little cash left: the business closes.
    const month = b.hist.reduce((t, h) => t + h.rev - h.cost, 0);
    if (!c.player && b.hist.length >= 30 && month < 0 && (c.wallet[n.cur] ?? 0) < cur(d.start) / 2) closeBusiness(w, c, 'the business failed');
  }
  // People set up on their own until each country has about its real share of self-employed workers
  // (more in good times); the unemployed first, then some employees.
  const d0 = today(w);
  const force = new Map<Id, Citizen[]>(), self = new Map<Id, number>();
  for (const c of census(w).all) {
    if (c.player || c.gone || c.retired || c.edu?.enrolled) continue;
    const a = ageOf(w, c);
    if (a < 20 || a > 64) continue;
    if (c.business) { self.set(c.nation, (self.get(c.nation) ?? 0) + 1); continue; }
    if (c.post || (c.mil?.branch && !c.mil.reserve)) continue;
    force.set(c.nation, [...(force.get(c.nation) ?? []), c]);
  }
  for (const n of w.nations) {
    const pool = force.get(n.id) ?? [];
    const target = (SELF_EMPLOYED[n.iso] ?? 0.1) * (1 + 0.1 * w.econ.cycle);
    let starts = 0;
    if ((self.get(n.id) ?? 0) >= target * (pool.length + (self.get(n.id) ?? 0))) continue;
    const order = [...pool].sort((a, b) => (a.job == null ? 0 : 1) - (b.job == null ? 0 : 1) || hash01(a.id, d0, 1504) - hash01(b.id, d0, 1504));
    for (const c of order) {
      if (starts >= 2) break;
      const kinds = BIZ_KEYS.filter((k) => !startCheck(w, c, k));
      if (!kinds.length) continue;
      if (startBusiness(w, kinds[Math.floor(hash01(c.id, d0, 1505) * kinds.length)], c).ok) starts++;
    }
  }
}

/** A month's trading, for the accounts. */
export function bizMonth(c: Citizen) {
  const h = c.business?.hist ?? [];
  const rev = h.reduce((t, x) => t + x.rev, 0), cost = h.reduce((t, x) => t + x.cost, 0);
  return { days: h.length, rev, cost, profit: rev - cost };
}
