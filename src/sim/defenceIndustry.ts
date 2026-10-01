// The defence industry (1.8 Arsenal): R&D programmes, deliveries and the arms trade.
//
// - R&D programmes: named, with a budget, a schedule and technical risk. They are paid
//   from the defence R&D money each month. Setbacks bring delays and cost overruns, and
//   badly overrun programmes are cancelled. A completed programme raises the best
//   generation the country can build in that class (its frontier), with spin-offs to
//   civilian technology. A new combat aircraft takes 10–20 years, as in reality.
// - Deliveries: the domestic contractor turns its own output (aerospace or ground-weapons
//   goods) into equipment for the forces. Without the goods, renewal slows.
// - The arms trade: countries that cannot build a class well buy it abroad, from a
//   country that will grant an export licence. Payments go to the seller's contractor,
//   and the buyer depends on the seller for spare parts.
import type { Id, Nation, World } from './types';
import { CLASS_INFO, EQUIP_CLASSES, defenceBaseline, type EquipClass } from '../data/arsenal';
import { consume, pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { nid, notify, record } from '../engine/events';
import { chance, hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { outputKey } from '../data/items';
import { companyCurrency, coref, natref, player } from './query';
import { capsOf } from './strategic';
import { dailyRevenue } from './publicFinance';
import { nationPerm } from './authority';
import { warBetween } from './war';
import { arsenalOf, contractorOf, defenceNorm } from './arsenal';

export interface Programme {
  id: Id; name: string; cls: EquipClass; target: number; // the generation it will deliver
  start: number; months: number; // planned length
  monthly: number; // planned spending a month
  progress: number; // 0..1
  overrun: number; // share over the planned cost
  slips: number; // setbacks so far
  starved: number; // months funded below half
  elapsed?: number; // strategic months so far
  status: 'running' | 'done' | 'cancelled'; ended?: number;
}
export interface ArmsOrder { id: Id; seller: Id; cls: EquipClass; gen: number; share: number; cost: number; months: number; paid: number; delivered: number; start: number; status: 'running' | 'done' | 'halted' }

/** How much of the R&D budget a programme in each class takes. */
const WEIGHT: Record<EquipClass, number> = { smallarms: 0.06, armour: 0.15, artillery: 0.1, airdefence: 0.15, fighters: 0.35, bombers: 0.3, drones: 0.1, helicopters: 0.15, surface: 0.2, submarines: 0.25, carriers: 0.3, missiles: 0.2, c4isr: 0.12, ew: 0.1 };
const CODE_NAMES = ['Tempest', 'Valkyrie', 'Aurora', 'Sentinel', 'Trident', 'Harbinger', 'Kestrel', 'Basilisk', 'Thunder', 'Nightjar', 'Phalanx', 'Corsair', 'Halberd', 'Meridian', 'Polaris', 'Wyvern', 'Saber', 'Typhoon', 'Griffin', 'Lancer', 'Osprey', 'Vanguard', 'Talon', 'Mistral'];

const programmesOf = (n: Nation) => (n.programmes ??= []);
const ordersOf = (n: Nation) => (n.armsOrders ??= []);
export const runningProgrammes = (n: Nation) => programmesOf(n).filter((p) => p.status === 'running');
export const runningOrders = (n: Nation) => ordersOf(n).filter((o) => o.status === 'running');

/** The usual monthly R&D money for a country (its normal budget share). */
/** Revenue for planning (a floor before the first day's figures exist). */
const planRevenue = (n: Nation) => Math.max(dailyRevenue(n), cur(200));
/** How many major programmes the defence industry can carry (about 6 for the United States, 1 for Mexico). */
export const maxProgrammes = (n: Nation) => Math.max(1, Math.round(defenceBaseline(n.iso).split.rd * 40 * Math.min(1.5, n.defense.budget / Math.max(0.001, defenceNorm(n)))));
const rdMonthlyNorm = (n: Nation) => planRevenue(n) * defenceNorm(n) * defenceBaseline(n.iso).split.rd * 30;

// ---------- R&D programmes ----------

export function programmeCheck(w: World, actor: Id | null, n: Nation, cls: EquipClass): string | null {
  if (actor != null && !nationPerm(w, actor, n.id, 'war')) return 'Only the Minister of Defence or the national leader starts programmes.';
  const a = arsenalOf(w, n);
  if (a[cls].frontier >= 6) return 'This class is at the frontier of what anyone can build.';
  if (!a[cls].gen && cls !== 'drones' && cls !== 'missiles') return 'The country does not field this class; buy it abroad first.';
  if (runningProgrammes(n).some((p) => p.cls === cls)) return 'A programme for this class is already running.';
  if (runningProgrammes(n).length >= maxProgrammes(n)) return `The defence industry can run ${maxProgrammes(n)} major programme${maxProgrammes(n) > 1 ? 's' : ''} at a time.`;
  const committed = runningProgrammes(n).reduce((t, p) => t + p.monthly, 0);
  if (committed + rdMonthlyNorm(n) * WEIGHT[cls] > rdMonthlyNorm(n) * 1.3) return 'The R&D budget is fully committed.';
  return null;
}

/** Start an R&D programme for the next generation of a class. */
export function startProgramme(w: World, actor: Id | null, n: Nation, cls: EquipClass): Result {
  const why = programmeCheck(w, actor, n, cls);
  if (why) return fail(why);
  const a = arsenalOf(w, n);
  const [lo, hi] = CLASS_INFO[cls].build;
  const tech = capsOf(w, n).tech.military / 100;
  const years = Math.round(hi - (hi - lo) * Math.min(1, tech) * (0.5 + hash01(n.id, w.time, cls.length) * 0.5));
  const used = new Set(programmesOf(n).map((x) => x.name));
  const pool = CODE_NAMES.filter((x) => !used.has(x));
  const name = (pool.length ? pool : CODE_NAMES)[Math.floor(hash01(n.id, w.time, programmesOf(n).length) * (pool.length || CODE_NAMES.length))];
  const p: Programme = { id: nid(w), name, cls, target: Math.min(6, Math.max(a[cls].frontier, 2) + 0.5), start: w.time, months: years * 12, monthly: Math.max(1, Math.round(rdMonthlyNorm(n) * WEIGHT[cls])), progress: 0, overrun: 0, slips: 0, starved: 0, status: 'running' };
  programmesOf(n).push(p);
  chronicle(w, n, `🔬 ${n.name} launched the ${name} programme: generation ${p.target} ${CLASS_INFO[cls].label.toLowerCase()}, planned to enter service in ${years} years.`);
  return ok(`The ${name} programme is under way: ${years} years and ${fmtAmt(n.cur, p.monthly)} a month, if all goes to plan.`);
}

export function cancelProgramme(w: World, actor: Id | null, n: Nation, pid: Id, why = 'the government cancelled it'): Result {
  if (actor != null && !nationPerm(w, actor, n.id, 'war')) return fail('Only the Minister of Defence or the national leader cancels programmes.');
  const p = programmesOf(n).find((x) => x.id === pid && x.status === 'running');
  if (!p) return fail('No such programme.');
  p.status = 'cancelled'; p.ended = w.time;
  chronicle(w, n, `✂️ The ${p.name} ${CLASS_INFO[p.cls].label.toLowerCase()} programme was cancelled after ${Math.round((p.elapsed ?? 0) / 12)} years: ${why}.`);
  return ok(`The ${p.name} programme is cancelled.`);
}

/** One month of R&D: money is shared out, setbacks happen, programmes finish or are cancelled. */
function programmesMonth(w: World, n: Nation, rd: number) {
  const run = runningProgrammes(n);
  if (!run.length) return;
  const want = run.reduce((t, p) => t + p.monthly, 0);
  const share = want > 0 ? Math.min(1.2, rd / want) : 0;
  const a = arsenalOf(w, n);
  for (const p of run) {
    p.starved = share < 0.5 ? p.starved + 1 : 0;
    p.elapsed = (p.elapsed ?? 0) + 1;
    // Technical risk: harder leaps beyond the country's current frontier slip more often.
    const leap = p.target - a[p.cls].frontier;
    if (chance(w, (0.012 + leap * 0.02) * managementFactor(w, n))) {
      p.slips++;
      p.overrun = Math.round((p.overrun + 0.05 + hash01(p.id, p.slips) * 0.1) * 100) / 100;
      p.progress = Math.max(0, p.progress - 0.02);
      if (n.id === player(w).nation && p.slips % 3 === 1) record(w, 'military', `⚠️ The ${p.name} programme hit technical problems: now ${Math.round(p.overrun * 100)}% over budget.`, { nation: n.id });
    }
    p.progress = Math.min(1, p.progress + (share / p.months) / (1 + p.overrun));
    if (p.progress >= 1) { finish(w, n, p); continue; }
    // Badly overrun or starved programmes are cut.
    if ((p.overrun > 0.8 && chance(w, 0.05)) || p.starved >= 18) cancelProgramme(w, null, n, p.id, p.starved >= 18 ? 'it went unfunded for a year and a half' : `it ran ${Math.round(p.overrun * 100)}% over budget`);
  }
}

function finish(w: World, n: Nation, p: Programme) {
  p.status = 'done'; p.ended = w.time;
  const a = arsenalOf(w, n);
  a[p.cls].frontier = Math.max(a[p.cls].frontier, p.target);
  if (!a[p.cls].gen) { a[p.cls].gen = Math.max(1, p.target - 1); a[p.cls].age = 0; }
  // Spin-offs to civilian technology.
  const c = capsOf(w, n);
  c.tech.military = Math.min(130, c.tech.military + 1.5);
  const civ = p.cls === 'c4isr' || p.cls === 'ew' || p.cls === 'drones' ? 'information' : p.cls === 'missiles' || p.cls === 'bombers' ? 'space' : 'industrial';
  c.tech[civ] = Math.min(130, c.tech[civ] + 0.5);
  const years = Math.round((p.elapsed ?? 0) / 12);
  chronicle(w, n, `🎖️ The ${p.name} entered service: ${n.adj} forces can now field generation ${p.target} ${CLASS_INFO[p.cls].label.toLowerCase()} (${years} years${p.overrun > 0.05 ? `, ${Math.round(p.overrun * 100)}% over budget` : ''}).`);
}

/** Experienced programme managers in the defence ministry cut technical setbacks (up to a third). */
export function managementFactor(w: World, n: Nation): number {
  let senior = 0;
  for (const c of Object.values(w.citizens)) if (c.post?.kind === 'procurement' && c.post.grade >= 2 && w.regions[c.post.region].owner === n.id) senior++;
  return 1 - Math.min(0.33, senior * 0.08);
}

// ---------- deliveries from the domestic contractor ----------

/** Real inputs: the contractor's own goods become equipment. Returns how much of the month's renewal they could support (0.5..1). */
export function deliveryInputs(w: World, n: Nation, spent: number): number {
  const co = contractorOf(w, n.id);
  if (!co || spent <= 0) return 1;
  const key = outputKey(co.industry, co.q);
  const need = Math.max(1, Math.min(300, Math.round(spent / cur(20))));
  const have = Math.min(need, co.inv[key] ?? 0);
  if (have > 0) consume(w, coref(co.id), key, have, 'Delivered to the armed forces');
  return 0.5 + 0.5 * (have / need);
}

// ---------- the arms trade ----------

/** Whether a seller grants an export licence to a buyer. */
export function exportLicence(w: World, seller: Nation, buyer: Nation): string | null {
  if (seller.id === buyer.id) return 'Cannot buy from yourself.';
  if (warBetween(w, seller.id, buyer.id)) return `${seller.name} is at war with ${buyer.name}.`;
  if (seller.embargoes.includes(buyer.id) || buyer.embargoes.includes(seller.id)) return 'An embargo is in force.';
  // Licences go to allies and friends; rival great powers do not arm each other.
  if (!seller.alliances.includes(buyer.id) && (seller.relations[buyer.id]?.score ?? 0) < 15) return `${seller.name} licenses weapons only to allies and friendly countries.`;
  const big = (x: Nation) => x.iso === 'USA' || x.iso === 'CHN' || x.iso === 'RUS';
  if (big(seller) && big(buyer)) return `${seller.name} does not arm a rival great power.`;
  // No sales to a country at war with the seller's allies.
  if (seller.alliances.some((ally) => warBetween(w, ally, buyer.id))) return `${buyer.name} is at war with an ally of ${seller.name}.`;
  return null;
}

/** The best seller for a class: the highest frontier among countries that will sell. */
export function bestSeller(w: World, buyer: Nation, cls: EquipClass): Nation | null {
  let best: Nation | null = null;
  for (const s of w.nations) {
    if (s.exile || exportLicence(w, s, buyer)) continue;
    const f = arsenalOf(w, s)[cls].frontier;
    if (f >= arsenalOf(w, buyer)[cls].frontier + 1 && (!best || f > arsenalOf(w, best)[cls].frontier)) best = s;
  }
  return best;
}

export function orderCheck(w: World, actor: Id | null, n: Nation, cls: EquipClass, seller: Nation | null): string | null {
  if (actor != null && !nationPerm(w, actor, n.id, 'war')) return 'Only the Minister of Defence or the national leader places arms orders.';
  if (!seller) return 'Nobody with better equipment will sell this class to you.';
  const why = exportLicence(w, seller, n);
  if (why) return why;
  if (runningOrders(n).some((o) => o.cls === cls)) return 'An order for this class is already being delivered.';
  return null;
}

/** Buy a third of a class's equipment abroad, paid and delivered over two to four years. */
export function placeOrder(w: World, actor: Id | null, n: Nation, cls: EquipClass, seller: Nation): Result {
  const why = orderCheck(w, actor, n, cls, seller);
  if (why) return fail(why);
  const months = 24 + Math.floor(hash01(n.id, seller.id, cls.length) * 24);
  const cost = Math.max(1, Math.round(planRevenue(n) * defenceNorm(n) * defenceBaseline(n.iso).split.procurement * 30 * months * WEIGHT[cls] * 1.5));
  const gen = Math.max(1, arsenalOf(w, seller)[cls].frontier - 0.5); // export variants are a step behind
  const o: ArmsOrder = { id: nid(w), seller: seller.id, cls, gen, share: 0.33, cost, months, paid: 0, delivered: 0, start: w.time, status: 'running' };
  ordersOf(n).push(o);
  chronicle(w, n, `🤝 ${n.name} ordered generation ${gen} ${CLASS_INFO[cls].label.toLowerCase()} from ${seller.name} (${fmtAmt(n.cur, cost)} over ${Math.round(months / 12)} years).`);
  return ok(`Order placed with ${seller.name}: ${fmtAmt(n.cur, cost)}, delivered over ${months} months.`);
}

/** Monthly instalment owed on running orders (the buyer's daily contracts shrink to make room). */
export const orderInstalments = (n: Nation) => runningOrders(n).reduce((t, o) => t + o.cost / o.months, 0);

function ordersMonth(w: World, n: Nation) {
  const a = arsenalOf(w, n);
  for (const o of runningOrders(n)) {
    const s = w.nations[o.seller];
    // A licence can be withdrawn: war, embargo, broken relations halt deliveries.
    if (!s || exportLicence(w, s, n)) { o.status = 'halted'; chronicle(w, n, `⛔ ${s?.name ?? 'The seller'} halted deliveries of ${CLASS_INFO[o.cls].label.toLowerCase()} to ${n.name}.`); continue; }
    const due = Math.min(Math.ceil(o.cost / o.months), o.cost - o.paid);
    const co = contractorOf(w, s.id);
    const to = co && companyCurrency(w, co) ? coref(co.id) : natref(s.id);
    if (due > 0 && (n.wallet[n.cur] ?? 0) >= due && pay(w, natref(n.id), to, n.cur, due, `Arms order from ${s.name}`)) { o.paid += due; n.stats.spendToday += due; }
    const deliveredNow = Math.min(o.paid / o.cost, (w.time - o.start) / (o.months * 1440 * 30)) - o.delivered;
    if (deliveredNow > 0) {
      const dq = deliveredNow * o.share;
      const st = a[o.cls];
      if (!st.gen) { st.gen = o.gen; st.age = 0; }
      st.age = st.age * (1 - dq);
      st.gen = Math.round((st.gen + (o.gen - st.gen) * dq) * 1000) / 1000;
      st.supplier = o.seller;
      o.delivered += deliveredNow;
    }
    if (o.delivered >= 0.999) { o.status = 'done'; chronicle(w, n, `📦 The last of the ${s.adj} ${CLASS_INFO[o.cls].label.toLowerCase()} were delivered to ${n.name}.`); }
  }
}

/** Spare parts: equipment bought abroad wears twice as fast when the supplier is hostile. */
export function cutOff(w: World, n: Nation, cls: EquipClass): boolean {
  const s = arsenalOf(w, n)[cls].supplier;
  if (s == null || s === n.id) return false;
  const seller = w.nations[s];
  return !seller || !!warBetween(w, s, n.id) || seller.embargoes.includes(n.id) || n.embargoes.includes(s);
}

// ---------- AI and the monthly turn ----------

function chronicle(w: World, n: Nation, text: string) {
  (n.chronicle ??= []).push({ t: w.time, text });
  if (n.chronicle.length > 200) n.chronicle.shift();
  record(w, 'military', text, { nation: n.id, important: n.id === player(w).nation });
  if (n.id === player(w).nation) notify(w, 'politics', text, { link: 'forces' });
}

/** AI defence ministries: keep programmes running where they lag, and buy abroad what they cannot build. */
function defenceIndustryAI(w: World, n: Nation) {
  const president = n.president != null ? w.citizens[n.president] : null;
  if (president?.player) return;
  const a = arsenalOf(w, n);
  const leader = (cls: EquipClass) => Math.max(...w.nations.map((x) => arsenalOf(w, x)[cls].frontier));
  // Start a programme in the class that lags the world most (leaders work on the next generation).
  const cands = EQUIP_CLASSES.filter((cls) => !programmeCheck(w, null, n, cls)).sort((x, y) => (leader(y) - a[y].frontier) * WEIGHT[y] - (leader(x) - a[x].frontier) * WEIGHT[x]);
  if (cands.length && chance(w, 0.25)) startProgramme(w, null, n, cands[0]);
  // Buy abroad where the gap is large and nobody at home is closing it.
  for (const cls of EQUIP_CLASSES) {
    if (!a[cls].gen) continue;
    if (runningProgrammes(n).some((p) => p.cls === cls) || runningOrders(n).some((o) => o.cls === cls)) continue;
    const s = bestSeller(w, n, cls);
    if (runningOrders(n).length >= 2) break;
    if (s && arsenalOf(w, s)[cls].frontier - a[cls].gen >= 1.5 && chance(w, 0.05) && !orderCheck(w, null, n, cls, s)) placeOrder(w, null, n, cls, s);
  }
}

/** The monthly turn for the defence industry (called from the arsenal's month). */
export function defenceIndustryMonth(w: World, n: Nation, rd: number) {
  programmesMonth(w, n, rd);
  ordersMonth(w, n);
  defenceIndustryAI(w, n);
  if (programmesOf(n).length > 40) n.programmes = programmesOf(n).filter((p) => p.status === 'running' || (p.ended ?? 0) > w.time - 1440 * 365 * 20).slice(-40);
  if (ordersOf(n).length > 40) n.armsOrders = ordersOf(n).slice(-40);
}
