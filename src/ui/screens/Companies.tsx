import { useState } from 'preact/hooks';
import { accounts, corpTaxRate, premisesRent } from '../../sim/companyCosts';
import { fromLocal as fromL, localStep as stepL, toLocal as toL } from '../../engine/money';
import type { Company, Industry, World } from '../../sim/types';
import { ActBtn, Amt, Btn, CitLink, Empty, Grade, Item, Num, Panel, RegionLink, Select, Help, Sparkline } from '../common';
import { store } from '../store';
import { companyCurrency, controller, coref, cref, player } from '../../sim/query';
import {
  deposit, fire, foundCheck, foundCompany, managerCheck, managerCost, managerShift, productionBlock, relocate, setOffer,
  shiftPreview, transferStock, upgradeCompany, upgradeCost, withdraw,
  foundCost,
} from '../../sim/company';
import { INDUSTRIES, INDUSTRY_INFO, grade, gradeLc, itemName, outputKey } from '../../data/items';
import { B } from '../../data/balance';
import { useSort } from '../sort';
import { GOLD, fmtAmt } from '../../engine/money';
import { list, listingsFor, cancelListing, refPrice } from '../../sim/market';
import { usedCap } from '../../engine/ledger';
import { authorize } from '../../sim/authority';
import { unitCost } from '../../ai/economy';
import { listCompanyCheck, listCompany, unlistCompany } from '../../sim/companyMarket';

export function Companies({ w }: { w: World }) {
  const p = player(w);
  const mine = Object.values(w.companies).filter((co) => !authorize(w, p.id, coref(co.id), 'manage'));
  const sel = store.sel.company != null ? w.companies[store.sel.company] : undefined;
  const profit1 = (co: (typeof mine)[number]) => co.hist[co.hist.length - 1]?.profit ?? 0;
  const sort = useSort('companies', mine, {
    name: (co) => co.name, industry: (co) => INDUSTRY_INFO[co.industry].name, grade: (co) => co.q, region: (co) => w.regions[co.region].name,
    workers: (co) => co.workers.length, funds: (co) => co.wallet[companyCurrency(w, co)] ?? 0, stock: (co) => co.inv[outputKey(co.industry, co.q)] ?? 0,
    profit: profit1, status: { get: (co) => co.shortage ?? '', first: 'desc' },
  }, { key: 'name', dir: 'asc' });
  if (sel && mine.includes(sel)) return <CompanyDetail w={w} co={sel} />;
  return (
    <div class="grid">
      <FoundPanel w={w} />
      <Panel title="Your companies" class="wide">
        {mine.length ? (
          <table class="table">
            <thead><tr>{sort.th('name', 'Name')}{sort.th('industry', 'Industry')}{sort.th('grade', 'Grade')}{sort.th('region', 'Region')}{sort.th('workers', 'Workers')}{sort.th('funds', 'Funds')}{sort.th('stock', 'Stock')}{sort.th('profit', 'Yesterday')}{sort.th('status', 'Status')}</tr></thead>
            <tbody>
              {sort.rows.map((co) => {
                const c = companyCurrency(w, co);
                const last = co.hist[co.hist.length - 1];
                const key = outputKey(co.industry, co.q);
                return (
                  <tr class="link-row" onClick={() => store.go('companies', { company: co.id })}>
                    <td><b>{co.name}</b>{co.owner.k === 'hold' ? <small class="muted"> (holding)</small> : null}</td>
                    <td>{INDUSTRY_INFO[co.industry].icon} {INDUSTRY_INFO[co.industry].name}</td><td><Grade q={co.q} /></td>
                    <td><RegionLink w={w} id={co.region} /></td>
                    <td>{co.workers.length}/{co.offer?.slots ?? 0}</td>
                    <td><Amt asset={c} v={co.wallet[c] ?? 0} /></td>
                    <td>{co.inv[key] ?? 0}</td>
                    <td>{last ? `${last.produced} made, profit ${fmtAmt(c, last.profit)}` : '—'}</td>
                    <td class="small">{co.shortage ? <span class="warn">{co.shortage}</span> : 'OK'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>You don’t own a company yet. Founding a basic-grade company here costs {fmtAmt(GOLD, foundCost(w, p.loc))}; the tutorial reward covers it.</Empty>}
      </Panel>
    </div>
  );
}

function FoundPanel({ w }: { w: World }) {
  const p = player(w);
  const nat = controller(w.regions[p.loc]);
  const regions = w.regions.filter((r) => controller(r) === nat);
  const [ind, setInd] = useState<Industry>('grain');
  const [region, setRegion] = useState(p.loc);
  const [name, setName] = useState('');
  const r = w.regions[region];
  const raw = INDUSTRY_INFO[ind].raw;
  return (
    <Panel title="Found a company" class="wide">
      <div class="form row">
        <label>Industry <Select value={ind} options={INDUSTRIES.map((i) => [i, `${INDUSTRY_INFO[i].icon} ${INDUSTRY_INFO[i].name}`])} onChange={setInd} /></label>
        <label>Region <Select value={region} options={regions.map((x) => [x.id, `${x.name} (${Object.entries(x.res).map(([k, v]) => `${k} ${v}`).join(', ') || 'no resources'}; pollution ${Math.round(x.pollution * 100)}%)`])} onChange={setRegion} /></label>
        <label>Name <input value={name} placeholder="optional" onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
        <ActBtn kind="primary" why={foundCheck(w, p, cref(p.id), ind, region)} run={(w) => {
          const res = foundCompany(w, p, cref(p.id), ind, region, name);
          if (res.ok) store.sel.company = res.data.id;
          return res;
        }}>Found (basic grade, {fmtAmt(GOLD, foundCost(w, region))})</ActBtn>
      </div>
      <Help>
        {raw ? <>Raw producers need no inputs. Output depends on the region’s <b>{ind}</b> richness (here: {(r?.res as any)?.[ind] ?? 0} → ×{B.company.richness[(r?.res as any)?.[ind] ?? 0]}), Production Fields, pollution, and workers’ skill.</>
          : <>Factories consume {itemName((B.company.recipes as any)[ind].input)} ({(B.company.recipes as any)[ind].perQ}× the grade per unit: a premium unit takes four times the input of a basic one). Industrial Zones raise output. Place factories in low-pollution regions.</>}
        {' '}A company's grade is the grade of what it makes and sets how many people it can employ. Costs by grade (basic → top-grade): {B.company.foundCost.join(' / ')} gold; you start at basic and upgrade later.
      </Help>
    </Panel>
  );
}

function CompanyDetail({ w, co }: { w: World; co: Company }) {
  const p = player(w);
  const c = companyCurrency(w, co);
  const key = outputKey(co.industry, co.q);
  const pv = shiftPreview(w, co, null);
  const mv = shiftPreview(w, co, p);
  const market = controller(w.regions[co.region]);
  const n = w.nations[market];
  const [wage, setWage] = useState(() => Math.round(toL(c, co.offer ? co.offer.wage : Math.max(n.minWage, B.wages.start * 100)) * 100) / 100);
  const [slots, setSlots] = useState(co.offer?.slots ?? 1);
  const [minEco, setMinEco] = useState(co.offer?.minEco ?? 0);
  const [amt, setAmt] = useState(() => Math.round(toL(c, 10000)));
  const [sellQty, setSellQty] = useState(co.inv[key] ?? 0);
  const [price, setPrice] = useState(Math.round(toL(n.cur, co.prices[key] ?? refPrice(w, market, key) ?? 300) * 100) / 100);
  const [moveKey, setMoveKey] = useState(pv.inputKey ?? key);
  const [moveQty, setMoveQty] = useState(10);
  const [dest, setDest] = useState(co.region);
  const [salePrice, setSalePrice] = useState(B.company.foundCost[co.q - 1]);
  const mine = listingsFor(w, market, key).filter((l) => l.seller.k === 'co' && l.seller.id === co.id);
  const block = productionBlock(w, co, pv.units);
  const payroll = (co.offer?.wage ?? 0) * co.workers.length;
  return (
    <div class="grid">
      <Panel title={`${INDUSTRY_INFO[co.industry].icon} ${co.name} — ${grade(co.q)}`} class="wide" right={<Btn small kind="ghost" onClick={() => store.go('companies', { company: null })}>← All companies</Btn>}>
        <div class="stats">
          <div class="stat"><small>Location</small><b><RegionLink w={w} id={co.region} /></b></div>
          <div class="stat"><small>Funds</small><b><Amt asset={c} v={co.wallet[c] ?? 0} /></b></div>
          <div class="stat"><small>Daily payroll</small><b><Amt asset={c} v={payroll} /></b></div>
          <div class="stat"><small>Unit cost (est.)</small><b><Amt asset={c} v={unitCost(w, co)} /></b></div>
          <div class="stat"><small>Warehouse</small><b>{usedCap(co.inv)}/{B.company.storage}</b></div>
          <div class="stat"><small>Status</small><b class={block ? 'warn' : ''}>{block ?? co.shortage ?? 'Ready'}</b></div>
        </div>
      </Panel>
      <Panel title="Production preview">
        <p>Per worker shift ≈ <b>{pv.units.toFixed(2)}</b> {itemName(key)} (base {pv.factors.length ? '' : ''}{INDUSTRY_INFO[co.industry].raw ? B.company.rawPerShift : (B.company.recipes as any)[co.industry].perShift}).
          {pv.inputKey && <> Consumes {pv.inputPer} {itemName(pv.inputKey)} per unit.</>}</p>
        <ul class="small">{pv.factors.map((f) => <li>{f.label}: ×{f.mult.toFixed(2)}</li>)}</ul>
        <p>Your manager shift ≈ <b>{mv.units.toFixed(2)}</b> units. Cost: {managerCost(p, w) ? fmtAmt(GOLD, managerCost(p, w)) : 'free (first today)'}; later shifts double (chosen rule).</p>
        <ActBtn kind="primary" why={managerCheck(w, p, co)} run={(w) => managerShift(w, p, co.id)}>Work as manager (−{B.cost.manager}⚡)</ActBtn>
      </Panel>
      <Panel title="Workforce & job offer">
        <div class="form">
          <label>Gross wage ({c}) <Num value={wage} step={stepL(c) / 2} onInput={setWage} /></label>
          <label>Positions <Num value={slots} min={0} max={B.company.maxWorkers[co.q - 1]} onInput={setSlots} /></label>
          <label>Min. skill <Num value={minEco} min={0} step={0.5} onInput={setMinEco} /></label>
          <ActBtn run={(w) => setOffer(w, p.id, co.id, fromL(c, wage), slots, minEco)}>Post offer</ActBtn>
        </div>
        <p class="small muted">Minimum wage {fmtAmt(n.cur, n.minWage)}. Max {B.company.maxWorkers[co.q - 1]} employees at {gradeLc(co.q)} grade. Workers switch employers for ≥15% better net pay; unfilled vacancies mean your wage is uncompetitive.</p>
        {co.workers.length > 0 && <StaffTable w={w} co={co} />}
        {!co.workers.length && <Empty>No employees.</Empty>}
      </Panel>
      <Panel title="Accounts (last 30 days)"><AccountsPanel w={w} co={co} /></Panel>
      <Panel title="Funds">
        <div class="form row">
          <label>Amount ({c}) <Num value={amt} step={stepL(c)} onInput={setAmt} /></label>
          <ActBtn run={(w) => deposit(w, p, co.id, c, fromL(c, amt))}>Deposit</ActBtn>
          <ActBtn run={(w) => withdraw(w, p, co.id, c, fromL(c, amt))}>Withdraw</ActBtn>
        </div>
        <p class="small muted">Company and personal money are separate ledgers. Wages are paid from company funds in {c}.</p>
      </Panel>
      <Panel title="Warehouse & sales">
        <ul class="inv-list">{Object.entries(co.inv).map(([k, v]) => <li><Item k={k} n={v} /></li>)}</ul>
        {!Object.keys(co.inv).length && <Empty>Empty warehouse.</Empty>}
        <div class="form row">
          <label>Sell <Num value={sellQty} min={1} onInput={setSellQty} /></label>
          <label>at ({n.cur}) <Num value={price} step={stepL(n.cur) / 10} onInput={setPrice} /></label>
          <ActBtn run={(w) => list(w, p.id, coref(co.id), market, key, sellQty, fromL(n.cur, price))}>List on {n.name} market</ActBtn>
        </div>
        {mine.map((l) => <div class="small">Listed {l.qty} @ {fmtAmt(n.cur, l.price)} <ActBtn small kind="ghost" run={(w) => cancelListing(w, p.id, l.id)}>Withdraw</ActBtn></div>)}
        <div class="form row">
          <label>Move <Select value={moveKey} options={[...new Set([key, ...(pv.inputKey ? [pv.inputKey] : []), ...Object.keys(co.inv), ...Object.keys(p.inv).filter((k) => !k.startsWith('sp:'))])].map((k) => [k, itemName(k)])} onChange={setMoveKey} /></label>
          <Num value={moveQty} min={1} onInput={setMoveQty} />
          <ActBtn run={(w) => transferStock(w, p, co.id, moveKey, moveQty, true)}>→ company</ActBtn>
          <ActBtn run={(w) => transferStock(w, p, co.id, moveKey, moveQty, false)}>→ me</ActBtn>
        </div>
      </Panel>
      <Panel title="Automation">
        {(['sell', 'buyInputs', 'hire'] as const).map((k) => (
          <label class="check"><input type="checkbox" checked={co.auto[k]} onChange={() => { co.auto[k] = !co.auto[k]; store.emit(); }} />
            {{ sell: 'Auto-list output daily at an adaptive price', buyInputs: 'Auto-buy inputs from the market (keeps ~2 days)', hire: 'Auto-adjust wage and positions' }[k]}</label>
        ))}
        <p class="small muted">Runs at 05:00 each day using the same actions and money as manual play.</p>
      </Panel>
      <Panel title="Upgrade, relocate, sell">
        <p>Upgrade to {co.q < 5 ? grade(co.q + 1) : 'a higher grade'}: {co.q < 5 ? fmtAmt(GOLD, upgradeCost(w, p, co)) : '—'}</p>
        <ActBtn why={co.q >= 5 ? 'Already top grade.' : null} run={(w) => upgradeCompany(w, p, co.id, cref(p.id))}>Upgrade</ActBtn>
        <div class="form row">
          <label>Move to <Select value={dest} options={w.regions.filter((r) => controller(r) === market).map((r) => [r.id, r.name])} onChange={setDest} /></label>
          <ActBtn run={(w) => relocate(w, p, co.id, dest)}>Relocate ({B.company.relocateFee} g, {B.company.relocateCooldownDays}d cooldown)</ActBtn>
        </div>
        <div class="form row">
          {co.forSale == null ? (<>
            <label>Ask (gold) <Num value={salePrice} onInput={setSalePrice} /></label>
            <ActBtn why={listCompanyCheck(w, p, co)} run={(w) => listCompany(w, p, co.id, Math.round(salePrice * 1000))}>List on company market</ActBtn>
          </>) : <>Listed for {fmtAmt(GOLD, co.forSale)} (production −{B.company.listedPenalty * 100}%) <ActBtn run={(w) => unlistCompany(w, p, co.id)}>Unlist</ActBtn></>}
        </div>
      </Panel>
      <Panel title="Accounting (last 30 days)" class="wide">
        <Sparkline values={co.hist.map((h) => h.profit)} width={300} height={40} />
        <table class="table compact">
          <thead><tr><th>Day</th><th>Produced</th><th>Inputs used</th><th>Sold</th><th class="num">Revenue</th><th class="num">Wages</th><th class="num">Inputs bought</th><th class="num">Profit</th></tr></thead>
          <tbody>{co.hist.slice().reverse().slice(0, 14).map((h) => (
            <tr><td>{h.day}</td><td>{h.produced}</td><td>{h.consumed}</td><td>{h.sold}</td><td class="num">{fmtAmt(c, h.revenue)}</td><td class="num">{fmtAmt(c, h.wages)}</td><td class="num">{fmtAmt(c, h.inputCost)}</td><td class="num"><Amt asset={c} v={h.profit} sign /></td></tr>
          ))}</tbody>
        </table>
        <p class="small muted">Lifetime: produced {co.lifetime.produced.toLocaleString()}, revenue {fmtAmt(c, co.lifetime.revenue)}, wages {fmtAmt(c, co.lifetime.wages)}. Ownership history: {co.ownerHist.map((h) => `${h.owner.k}#${h.owner.id}`).join(' → ')}.</p>
      </Panel>
    </div>
  );
}

/** Employees, sortable by name or skill. */
function StaffTable({ w, co }: { w: World; co: Company }) {
  const p = player(w);
  const sort = useSort('staff', co.workers.map((id) => w.citizens[id]).filter(Boolean), { name: (c) => c.name, skill: (c) => c.eco }, { key: 'skill', dir: 'desc' });
  return (
    <table class="table compact">
      <thead><tr>{sort.th('name', 'Employee')}{sort.th('skill', 'Economic skill')}<th /></tr></thead>
      <tbody>{sort.rows.map((c) => <tr><td><CitLink w={w} id={c.id} /></td><td>{c.eco.toFixed(1)}</td><td><ActBtn small kind="danger" run={(w) => fire(w, p.id, co.id, c.id)}>Dismiss</ActBtn></td></tr>)}</tbody>
    </table>
  );
}

function AccountsPanel({ w, co }: { w: World; co: Company }) {
  const a = accounts(w, co);
  const c = companyCurrency(w, co);
  const row = (label: string, v: number, strong = false) => <tr><td>{strong ? <b>{label}</b> : label}</td><td class={`num ${v < 0 ? 'bad' : ''}`}>{strong ? <b>{fmtAmt(c, v)}</b> : fmtAmt(c, v)}</td></tr>;
  const stock = Object.entries(co.inv).reduce((t, [k, q]) => t + (refPrice(w, controller(w.regions[co.region]), k) ?? 0) * q, 0);
  if (!a.days) return <Empty>No trading days yet.</Empty>;
  return <>
    <table class="table compact small"><tbody>
      {row('Sales', a.revenue)}
      {row('Wages', -a.wages)}
      {row('Materials', -a.inputs)}
      {row('Premises and energy', -a.overheads)}
      {row('Depreciation', -a.depreciation)}
      {row('Operating profit', a.operating, true)}
      {row(`Corporate tax (${Math.round(corpTaxRate(w, co) * 100)}%)`, -a.tax)}
      {row('Net profit', a.net, true)}
    </tbody></table>
    <p class="small"><b>Balance sheet:</b> cash {fmtAmt(c, co.wallet[c] ?? 0)} · stock {fmtAmt(c, stock)} · plant and equipment {fmtAmt(c, a.capital)} · total {fmtAmt(c, (co.wallet[c] ?? 0) + stock + a.capital)}</p>
    <p class="small muted">Rent for premises is {fmtAmt(c, premisesRent(w, co))} a day here. Corporate tax is paid on the first of each month on the previous month's profit.</p>
  </>;
}
