// The end of a company (1.5 GEO 1), and business demography. A company closes when
// its owner winds it down (no staff for two months and losing money) or when it is
// insolvent (it cannot pay its staff for a fortnight and its owner cannot help). In
// either case the books are settled in the legal order: staff first (redundancy pay
// and wages), then the owner gets what remains; stock goes to the owner (or is sold
// for scrap if there is no room), listings and currency orders are withdrawn. Births
// and deaths are counted per country, as statistics offices do.
import type { Company, Id, World } from './types';
import { burn, consume, moveItems, pay } from '../engine/ledger';
import { notify, record } from '../engine/events';
import { census, invalidateCensus } from './census';
import { companyCurrency, controller, coref } from './query';
import { forceCancelListing } from './market';
import { forceCancelOrder } from './fx';
import { endWork } from './services';
import { jobLost } from './labour';

export interface Demography { born: number; died: number; hist: { born: number; died: number }[] }
const demo = (w: World, nation: Id): Demography => ((w.nations[nation] as { demography?: Demography }).demography ??= { born: 0, died: 0, hist: [] });
export const demographyOf = (w: World, nation: Id) => demo(w, nation);
export function noteBirth(w: World, co: Company) { demo(w, controller(w.regions[co.region])).born++; }

/** Close a company and settle its books. Returns false if it cannot close now (held by an open contract). */
export function closeCompany(w: World, co: Company, why: 'insolvent' | 'wound up' | 'closed by its owner'): boolean {
  if (co.locked || !w.companies[co.id]) return false;
  const nat = controller(w.regions[co.region]);
  const ref = coref(co.id);
  // Withdraw everything it has on offer.
  for (const l of Object.values(w.listings)) if (l.seller.k === 'co' && l.seller.id === co.id) forceCancelListing(w, l.id);
  for (const o of Object.values(w.fx)) if (o.maker.k === 'co' && o.maker.id === co.id) forceCancelOrder(w, o.id);
  // Staff first: redundancy pay (as far as the money goes), then benefit.
  for (const id of [...co.workers]) {
    const c = w.citizens[id];
    if (!c) continue;
    c.job = null;
    endWork(w, c, why === 'insolvent' ? `${co.name} went bust` : `${co.name} closed`);
    jobLost(w, c, co, co.offer?.wage ?? 0);
    if (c.player) notify(w, 'economy', `🏚️ ${co.name} ${why === 'insolvent' ? 'has gone bust' : 'has closed'}; you lost your job.${c.benefit ? ' You can claim unemployment benefit.' : ''}`, { critical: true, link: 'jobs' });
  }
  co.workers = [];
  // Then the owner: remaining money and stock.
  for (const [asset, amt] of Object.entries(co.wallet)) if (amt > 0 && !pay(w, ref, co.owner, asset, amt, `Final settlement of ${co.name}`)) burn(w, ref, asset, amt, `${co.name} wound up`);
  for (const [k, q] of Object.entries(co.inv)) if (q > 0 && !moveItems(w, ref, co.owner, k, q)) consume(w, ref, k, q, `${co.name}: stock sold for scrap`);
  const d = demo(w, nat);
  d.died++;
  record(w, 'company', `🏚️ ${co.name} (${w.regions[co.region].name}) ${why === 'insolvent' ? 'went bust' : 'closed'}.`, { region: co.region });
  delete w.companies[co.id];
  invalidateCensus(w);
  return true;
}

/** Daily: unpaid staff and idle plants. The player's own companies are never closed without them. */
export function companyLifeDaily(w: World) {
  const closedToday = new Map<Id, number>(); // at most two closures a day per country, so a shake-out is gradual
  for (const co of census(w).companies) {
    if (!w.companies[co.id] || co.locked) continue;
    const owner = co.owner.k === 'cit' ? w.citizens[co.owner.id] : null;
    if (owner?.player) continue;
    if (co.owner.k === 'nat' || co.state) continue; // state firms are kept going by the treasury
    const h = co.hist.slice(-60);
    const code = companyCurrency(w, co);
    const cash = co.wallet[code] ?? 0;
    const wage = co.offer?.wage ?? 0;
    // Insolvent: staff on the books but no money to pay them for two weeks.
    const unpaid = co.workers.length > 0 && h.length >= 14 && h.slice(-14).every((d) => d.wages === 0) && cash < wage;
    // Wound up: no staff, nothing made and losing money for a month (the history kept).
    const idle = co.workers.length === 0 && h.length >= 30 && h.reduce((t, d) => t + d.profit, 0) < 0 && h.every((d) => d.produced === 0);
    const nat = controller(w.regions[co.region]);
    if ((closedToday.get(nat) ?? 0) >= 2 || !(unpaid || idle)) continue;
    if (closeCompany(w, co, unpaid ? 'insolvent' : 'wound up')) closedToday.set(nat, (closedToday.get(nat) ?? 0) + 1);
  }
  // Monthly roll of births and deaths.
  if (Math.floor(w.time / 1440) % 30 === 0) {
    for (const n of w.nations) {
      const d = demo(w, n.id);
      d.hist.push({ born: d.born, died: d.died });
      if (d.hist.length > 12) d.hist.shift();
      d.born = 0; d.died = 0;
    }
  }
}
