// Tax rules: ceilings from congress ideology shares (DOC formula interpretation)
// and work-tax routing (occupied regions split 80/20 occupier/owner, DOC).
import type { AccountRef, Citizen, Id, Nation, World } from './types';
import { B } from '../data/balance';
import { pay } from '../engine/ledger';
import { natref, regref, seatShare } from './query';
import { stateTaxRate } from './stategov';

export function taxCeilings(w: World, n: Nation) {
  const s = seatShare(w, n);
  const com = (s.communism ?? 0) * 100;
  const cap = (s.capitalism ?? 0) * 100;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    import: clamp(B.taxes.ceilingBase + B.taxes.communistPts * com - B.taxes.capitalistImportPts * cap),
    vat: clamp(B.taxes.ceilingBase + B.taxes.communistPts * com - B.taxes.capitalistVatWorkPts * cap),
    work: clamp(B.taxes.ceilingBase + B.taxes.communistPts * com - B.taxes.capitalistVatWorkPts * cap),
  };
}

/** Clamp a nation's taxes to its current ceilings (called when congress changes). */
export function enforceCeilings(w: World, n: Nation) {
  const c = taxCeilings(w, n);
  n.taxes.work = Math.min(n.taxes.work, Math.floor(c.work));
  n.taxes.vat = Math.min(n.taxes.vat, Math.floor(c.vat));
  n.taxes.import = Math.min(n.taxes.import, Math.floor(c.import));
}

/** Work tax on a shift in region `rid` for `worker`. Returns tax breakdown (minor units). */
export function workTaxFor(w: World, rid: Id, worker: Citizen, gross: number) {
  const r = w.regions[rid];
  const taxNation = r.occ ? w.nations[r.occ.nation] : w.nations[r.owner];
  let rate = taxNation.taxes.work;
  // Exile relief: a host holding an exiled nation's rightful regions grants its citizens relief (DOC; size SOLO).
  const home = w.nations[worker.nation];
  if (home.exile && home.id !== taxNation.id && w.regions.some((x) => x.core === home.id && x.owner === taxNation.id)) rate *= 1 - B.taxes.exileRelief;
  const natTax = Math.round((gross * rate) / 100);
  // State/provincial wage tax on top (suspended under occupation).
  const stateRate = stateTaxRate(w, rid);
  const stTax = Math.round((gross * stateRate) / 100);
  const state: TaxPart[] = stTax > 0 ? [{ region: rid, amt: stTax }] : [];
  const tax = natTax + stTax;
  if (!r.occ) return { tax, parts: [{ nation: r.owner, amt: natTax }, ...state], rate: rate + stateRate, stateRate, natRate: rate };
  const occ = Math.round(natTax * B.taxes.occupierShare);
  return { tax, parts: [{ nation: r.occ.nation, amt: occ }, { nation: r.owner, amt: natTax - occ }], rate, stateRate: 0, natRate: rate };
}

export type TaxPart = { nation: Id; amt: number } | { region: Id; amt: number };

/** Pay the work-tax parts from `payer` (who holds the gross) to the treasuries. */
export function remitWorkTax(w: World, payer: AccountRef, cur: string, parts: TaxPart[]) {
  for (const p of parts) {
    if (p.amt <= 0) continue;
    if ('region' in p) { if (pay(w, payer, regref(p.region), cur, p.amt, 'State wage tax')) w.govs[p.region]!.stats.revToday += p.amt; }
    else if (pay(w, payer, natref(p.nation), cur, p.amt, 'Work tax')) w.nations[p.nation].stats.revToday += p.amt;
  }
}
