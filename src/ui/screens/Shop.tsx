import type { World } from '../../sim/types';
import { ActBtn, Amt, CitLink, Empty, Grade, Panel, RegionLink, Help } from '../common';
import { cref, player, companyCurrency } from '../../sim/query';
import { SPECIALS, INDUSTRY_INFO, outputKey, itemName } from '../../data/items';
import { useSort } from '../sort';
import { buySpecial, shopPrice } from '../../sim/specials';
import { buyCompany, buyCompanyCheck, companyValue } from '../../sim/companyMarket';
import { productionFactors, baseUnits } from '../../sim/company';
import { GOLD, fmtAmt } from '../../engine/money';

export function Shop({ w }: { w: World }) {
  const p = player(w);
  return (
    <div class="grid">
      <Panel title="Bazaar (special items)" class="wide">
        <Help>All items are earnable with in-game gold — there are no real-money purchases. Buffs of the same type refresh rather than stack. Pirate-event resource depots grant a discount to their holders’ citizens.</Help>
        <table class="table">
          <tbody>{Object.entries(SPECIALS).map(([id, s]) => (
            <tr><td>{s.icon} <b>{s.name}</b></td><td class="small">{s.desc}</td><td class="num">{fmtAmt(GOLD, shopPrice(w, p, id))}</td><td>you have {p.inv[`sp:${id}`] ?? 0}</td>
              <td><ActBtn small run={(w) => buySpecial(w, p, id, 1)}>Buy</ActBtn></td></tr>
          ))}</tbody>
        </table>
      </Panel>
    </div>
  );
}

export function BusinessMarket({ w }: { w: World }) {
  const p = player(w);
  const listed = Object.values(w.companies).filter((c) => c.forSale != null).sort((a, b) => a.forSale! - b.forSale!);
  const profit14 = (c: (typeof listed)[number]) => c.hist.slice(-14).reduce((s, h) => s + h.profit, 0);
  const sort = useSort('business-market', listed, {
    company: (c) => c.name, industry: (c) => INDUSTRY_INFO[c.industry].name, grade: (c) => c.q, where: (c) => w.regions[c.region].name,
    workers: (c) => c.workers.length, profit: profit14, value: (c) => companyValue(w, c), asking: { get: (c) => c.forSale!, first: 'asc' },
  }, { key: 'asking', dir: 'asc' });
  return (
    <div class="grid">
      <Panel title="Business market" class="wide">
        <Help>Companies listed for gold. Listed companies produce {`20%`} less until sold (wiki: listing reduces production; size chosen). A purchase moves the gold and ownership atomically; workers, stock, funds and accounting history stay with the company.</Help>
        {listed.length ? (
          <table class="table">
            <thead><tr>{sort.th('company', 'Company')}{sort.th('industry', 'Industry')}{sort.th('grade', 'Grade')}{sort.th('where', 'Location')}<th>Owner</th>{sort.th('workers', 'Workers')}<th>Output/shift</th>{sort.th('profit', '14-day profit', 'num')}{sort.th('value', 'Est. value', 'num')}{sort.th('asking', 'Asking', 'num')}<th /></tr></thead>
            <tbody>{sort.rows.map((c) => {
              const cur = companyCurrency(w, c);
              const units = baseUnits(c) * productionFactors(w, c, null).mult;
              return (
                <tr><td>{c.name}</td><td>{INDUSTRY_INFO[c.industry].icon} {INDUSTRY_INFO[c.industry].name}</td><td><Grade q={c.q} /></td><td><RegionLink w={w} id={c.region} /></td>
                  <td>{c.owner.k === 'cit' ? <CitLink w={w} id={c.owner.id} /> : c.owner.k}</td><td>{c.workers.length}</td>
                  <td>{units.toFixed(1)} {itemName(outputKey(c.industry, c.q))}</td>
                  <td class="num"><Amt asset={cur} v={c.hist.slice(-14).reduce((s, h) => s + h.profit, 0)} sign /></td>
                  <td class="num">{fmtAmt(GOLD, companyValue(w, c))}</td><td class="num"><b>{fmtAmt(GOLD, c.forSale!)}</b></td>
                  <td><ActBtn small why={buyCompanyCheck(w, p.id, cref(p.id), c)} showWhy={false} run={(w) => buyCompany(w, p.id, cref(p.id), c.id)}>Buy</ActBtn></td></tr>
              );
            })}</tbody>
          </table>
        ) : <Empty>No companies for sale. List your own from its company page.</Empty>}
      </Panel>
    </div>
  );
}
