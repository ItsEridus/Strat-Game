// Mergers and acquisitions, and competition policy (1.5 GEO 1). A company is valued
// at its plant, six months of profit (if it makes one), its cash and its stock. Once a
// month, a successful owner may buy a struggling rival in the same industry and country
// at a fair price. The competition authority blocks deals that would leave one owner
// with more than 40% of an industry's sales, or that push a market into high
// concentration (an HHI over 2,500 and a rise of more than 200: the US and EU rule).
import type { AccountRef, Citizen, Company, Id, World } from './types';
import { pay } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { record } from '../engine/events';
import { dateAt } from '../engine/calendar';
import { hash01 } from '../engine/rng';
import { companiesOf } from './census';
import { companyCurrency, controller, cref } from './query';
import { capitalValue } from './companyCosts';
import { refPrice } from './market';

const sales30 = (co: Company) => co.hist.slice(-30).reduce((t, h) => t + h.revenue, 0);
const profit30 = (co: Company) => co.hist.slice(-30).reduce((t, h) => t + h.profit, 0);
const sameOwner = (a: AccountRef, b: AccountRef) => a.k === b.k && a.id === b.id;

/** What a company is worth to a buyer (its currency, minor units). */
export function valuation(w: World, co: Company): number {
  const code = companyCurrency(w, co);
  const nat = controller(w.regions[co.region]);
  const stock = Object.entries(co.inv).reduce((t, [k, q]) => t + (refPrice(w, nat, k) ?? 0) * q, 0);
  return Math.round(capitalValue(w, co) + Math.max(0, profit30(co)) * 6 + (co.wallet[code] ?? 0) + stock);
}

export function hhiOf(sales: number[]): number {
  const total = sales.reduce((a, b) => a + b, 0);
  return total > 0 ? Math.round(sales.reduce((t, x) => t + ((x / total) * 100) ** 2, 0)) : 0;
}

/** The competition authority's view of `buyer` taking over `target`: null if allowed, else why not. */
export function competitionCheck(w: World, buyer: AccountRef, target: Company): string | null {
  const nat = controller(w.regions[target.region]);
  const rivals = companiesOf(w, nat).filter((co) => co.industry === target.industry && w.companies[co.id]);
  const byOwner = new Map<string, number>();
  for (const co of rivals) { const k = `${co.owner.k}:${co.owner.id}`; byOwner.set(k, (byOwner.get(k) ?? 0) + sales30(co)); }
  const before = hhiOf([...byOwner.values()]);
  const bk = `${buyer.k}:${buyer.id}`, tk = `${target.owner.k}:${target.owner.id}`;
  const merged = new Map(byOwner);
  merged.set(bk, (merged.get(bk) ?? 0) + sales30(target));
  merged.set(tk, (merged.get(tk) ?? 0) - sales30(target));
  const after = hhiOf([...merged.values()].filter((x) => x > 0));
  const total = [...merged.values()].reduce((a, b) => a + Math.max(0, b), 0);
  const share = total > 0 ? (merged.get(bk) ?? 0) / total : 0;
  if (share > 0.4) return `The competition authority blocked it: the buyer would control ${Math.round(share * 100)}% of the market.`;
  if (after > 2500 && after - before > 200) return `The competition authority blocked it: the market would become highly concentrated (HHI ${before} → ${after}).`;
  return null;
}

/** Complete a takeover: the buyer pays the owner and takes the company, staff and all. */
export function takeOver(w: World, buyer: Citizen, co: Company, price: number): string | null {
  const code = companyCurrency(w, co);
  if (sameOwner(cref(buyer.id), co.owner)) return 'Already theirs.';
  const blocked = competitionCheck(w, cref(buyer.id), co);
  if (blocked) return blocked;
  if ((buyer.wallet[code] ?? 0) < price) return `The buyer cannot pay ${fmtAmt(code, price)}.`;
  if (!pay(w, cref(buyer.id), co.owner, code, price, `Sale of ${co.name}`)) return 'The payment failed.';
  co.owner = cref(buyer.id);
  co.ownerHist.push({ t: w.time, owner: co.owner, price });
  co.auto = { sell: true, buyInputs: true, hire: true };
  record(w, 'company', `🤝 ${buyer.name} bought ${co.name} for ${fmtAmt(code, price)}.`, { cit: buyer.id, region: co.region });
  return null;
}

/** Monthly: a profitable owner may buy a loss-making rival in the same industry (one deal a country a month). */
export function mergersMonthly(w: World) {
  if (dateAt(w.time).day !== 15) return;
  for (const n of w.nations) {
    const cos = companiesOf(w, n.id).filter((co) => w.companies[co.id] && !co.locked && co.owner.k === 'cit');
    const strugglers = cos.filter((co) => profit30(co) < 0 && co.workers.length > 0 && !w.citizens[co.owner.id]?.player);
    for (const target of strugglers.sort((a, b) => hash01(a.id, w.time, 1510) - hash01(b.id, w.time, 1510))) {
      const code = companyCurrency(w, target);
      const price = valuation(w, target);
      const buyers = cos.filter((co) => co.industry === target.industry && co.id !== target.id && profit30(co) > 0 && co.owner.id !== target.owner.id).map((co) => w.citizens[co.owner.id]).filter((c): c is Citizen => !!c && !c.player && !c.gone && (c.wallet[code] ?? 0) > price * 1.5);
      const buyer = buyers[0];
      if (buyer && !takeOver(w, buyer, target, price)) break;
    }
  }
}

export function acquisitionsOf(w: World, nation: Id) {
  return companiesOf(w, nation).filter((co) => co.ownerHist.length > 1 && co.ownerHist[co.ownerHist.length - 1].price != null && w.time - co.ownerHist[co.ownerHist.length - 1].t < 90 * 1440);
}
