import type { Ministry, World } from '../../sim/types';
import { Amt, Bar, CitLink, NationChip, Panel, RegionLink, Select, Sparkline, Stat, Help } from '../common';
import { store } from '../store';
import { citizensOf, player, seatShare } from '../../sim/query';
import { taxCeilings } from '../../sim/taxes';
import { MINISTRY_INFO } from '../../sim/authority';
import { IDEOLOGIES } from '../../data/ideologies';
import { GOLD, fmtAmt } from '../../engine/money';
import { itemName } from '../../data/items';
import { CountryExtras } from './CountryExtras';
import { StatesTable } from './StateGov';
import { livingStandards } from '../../sim/livingStandards';
import { BARGAINING, benefitRules } from '../../sim/labour';
import { inflation, priceChange } from '../../sim/statistics';
import { capsOf, techAvg } from '../../sim/strategic';
import { TECH_DOMAINS, TECH_LABEL } from '../../data/nationBaselines';
import { policyRateOf } from '../../sim/loans';
import { depositRate } from '../../sim/banking';
import { MONTHS } from '../../engine/calendar';
import { bondRate, dailyRevenue, dailySpending } from '../../sim/publicFinance';
import { BASKET_LABELS, basketOf } from '../../data/economy';
import { B } from '../../data/balance';
import { c as cur } from '../../engine/money';
import { rentOf } from '../../sim/housing';
import type { Id } from '../../sim/types';

function DevelopmentPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const c = capsOf(w, n);
  const pct = (x: number) => `${Math.round(x * 100)}`;
  const bar = (label: string, v: number) => <div class="row small"><span style={{ width: '9em' }}>{label}</span><Bar v={v} max={100} color="#3fb5a8" label={`${Math.round(v)}`} /></div>;
  return <>
    <div class="stats">
      <div class="stat"><small>Productivity since 2025</small><b>{c.productivity >= 1 ? '+' : ''}{((c.productivity - 1) * 100).toFixed(1)}%</b><Sparkline values={c.hist.map((h) => h.productivity)} width={150} height={30} /></div>
      <div class="stat"><small>Growth rate</small><b>{c.growth.toFixed(1)}% a year</b><Sparkline values={c.hist.map((h) => h.growth)} width={150} height={30} /></div>
      <div class="stat"><small>Technology (average)</small><b>{techAvg(c).toFixed(1)}</b><Sparkline values={c.hist.map((h) => h.tech)} width={150} height={30} /></div>
    </div>
    {c.why.length > 0 && <p class="small">This month's growth: {c.why.join(' · ')} (percentage points).</p>}
    <div class="grid2">
      <div>{TECH_DOMAINS.map((d) => bar(`${TECH_LABEL[d]} technology`, c.tech[d]))}</div>
      <div>{bar('Human capital', c.human)}{bar('Infrastructure', c.infra)}{bar('Cohesion', c.cohesion)}
        <p class="small muted">Institutions: rule of law {pct(c.inst.law)} · control of corruption {pct(c.inst.corruption)} · government effectiveness {pct(c.inst.effectiveness)} · press freedom {pct(c.inst.press)} (of 100).</p></div>
    </div>
    <Help>Each month, R&D adds technology (with diminishing returns) and the leaders' know-how spreads through trade. Productivity grows at the country's potential rate (IMF), adjusted for skills, infrastructure, institutions, catching up, unrest, war and the world economy, and raises what every company produces. Starting levels are real 2025 data. The Pace of history setting (Settings) can speed this up.</Help>
  </>;
}

function EconomyPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const s = n.stats2;
  const ms = s?.months ?? [];
  const last = ms[ms.length - 1];
  const chart = (label: string, values: number[], text: string) => <div class="stat"><small>{label}</small><b>{text}</b><Sparkline values={values} width={150} height={30} /></div>;
  const cpiNowV = s?.cpi.at(-1) ?? 100;
  return <>
    <div class="stats">
      {chart('GDP (last month)', ms.map((m) => m.gdp / Math.max(1, m.days)), last ? `${fmtAmt(n.cur, Math.round(last.gdp / Math.max(1, last.days)))} a day` : 'first month in progress')}
      {chart('Prices (CPI)', (s?.cpi ?? []).slice(-90), cpiNowV.toFixed(1))}
      {chart('Inflation (a year)', ms.filter((m) => m.inflation != null).map((m) => m.inflation!), inflation(w, id) != null ? `${inflation(w, id)!.toFixed(1)}%` : priceChange(w, id) != null ? `${priceChange(w, id)! >= 0 ? '+' : ''}${priceChange(w, id)!.toFixed(1)}% since January` : 'from next year')}
      {chart('Unemployment', ms.map((m) => m.unemployment * 100), `${(n.unemployment * 100).toFixed(1)}%`)}
      {chart('Central bank rate', ms.map((m) => m.rate), `${policyRateOf(w, id).toFixed(2)}% (savings ${depositRate(w, id).toFixed(2)}%)`)}
      {chart('Average pay on offer', ms.map((m) => m.wage), last ? fmtAmt(n.cur, last.wage) : '—')}
      {chart('Trade balance (30 days)', ms.map((m) => m.exports - m.imports), fmtAmt(GOLD, (n.trade?.hist ?? []).reduce((t, d) => t + d.exp - d.imp, 0)))}
    </div>
    {ms.length > 0 && <table class="table compact small"><thead><tr><th>Month</th><th class="num">GDP a day</th><th class="num">CPI</th><th class="num">Inflation</th><th class="num">Unemployment</th><th class="num">Pay</th><th class="num">Exports</th><th class="num">Imports</th></tr></thead>
      <tbody>{ms.slice(-6).reverse().map((m) => { const [y, mo] = m.key.split('-').map(Number); return <tr><td>{MONTHS[mo - 1]} {y}</td><td class="num">{fmtAmt(n.cur, Math.round(m.gdp / Math.max(1, m.days)))}</td><td class="num">{m.cpi.toFixed(1)}</td><td class="num">{m.inflation == null ? '—' : `${m.inflation.toFixed(1)}%`}</td><td class="num">{(m.unemployment * 100).toFixed(1)}%</td><td class="num">{fmtAmt(n.cur, m.wage)}</td><td class="num">{fmtAmt(GOLD, m.exports)}</td><td class="num">{fmtAmt(GOLD, m.imports)}</td></tr>; })}</tbody></table>}
    <Help>Official statistics, computed from what happens in the simulation. Inflation compares prices with a year before; until there is a year of data, the change since January is shown. GDP is the value companies add (sales less materials) plus government spending. Prices follow a basket: food 40%, rent 27%, transport 10%, clothes 10%, electronics 8% and medicine 5%. A month's figures are published on the 1st.</Help>
  </>;
}

function LivingPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const s = livingStandards(w, id);
  const day = cur(B.living.essentials);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return <>
    <table class="table compact small"><tbody>
      <tr><td>Median income</td><td class="num">{fmtAmt(n.cur, s.medianIncome)} a day</td></tr>
      <tr><td>Income inequality (Gini)</td><td class="num">{s.incomeGini.toFixed(2)}</td></tr>
      <tr><td>Wealth inequality (Gini)</td><td class="num">{s.wealthGini.toFixed(2)}</td></tr>
      <tr><td>In relative poverty</td><td class="num">{pct(s.poverty)}</td></tr>
      <tr><td>Well off (twice the median or more)</td><td class="num">{pct(s.comfortable)}</td></tr>
      <tr><td>Median wealth</td><td class="num">{fmtAmt(n.cur, s.medianWealth)}</td></tr>
    </tbody></table>
    <p class="small"><b>Labour market:</b> unemployment {pct(n.unemployment)} · minimum wage {fmtAmt(n.cur, n.minWage)} a shift · {benefitRules(w, id).rate ? `unemployment benefit ${pct(benefitRules(w, id).rate)} of the last wage for ${benefitRules(w, id).weeks} weeks` : 'no unemployment insurance'} · {pct(BARGAINING[n.iso] ?? 0.2)} of firms under collective agreements.</p>
    <p class="small"><b>Cost of living:</b> a single adult's everyday costs come to about {fmtAmt(n.cur, day)} a day, plus rent (a flat in {w.regions[n.capital].name}: {fmtAmt(n.cur, rentOf(w, n.capital, 'flat'))} a day).</p>
    <p class="small muted">{basketOf(n.cur).map((sh, i) => `${BASKET_LABELS[i].toLowerCase()} ${Math.round(sh * 100)}%`).join(' · ')}</p>
    <Help>Measured from the {s.adults} adult citizens: income is pay and benefits per day, smoothed over about a month; wealth is cash plus the value of a home owned, less debts. Relative poverty is an income under 60% of the median (the OECD and EU line).</Help>
  </>;
}

export function Country({ w }: { w: World }) {
  const p = player(w);
  const id = store.sel.nation ?? p.nation;
  const n = w.nations[id];
  const ceil = taxCeilings(w, n);
  const share = seatShare(w, n);
  const regions = w.regions.filter((r) => r.owner === id);
  const occupiedByThem = w.regions.filter((r) => r.occ?.nation === id);
  return (
    <div class="grid">
      <Panel title={<span>🏛️ <NationChip w={w} id={id} /></span>} class="wide" right={<Select value={id} options={w.nations.map((x) => [x.id, x.name])} onChange={(v) => store.go('country', { nation: v })} />}>
        <div class="stats">
          <Stat label={n.leader}><CitLink w={w} id={n.president} /></Stat>
          <Stat label="Approval">{Math.round(n.approval)}%</Stat>
          <Stat label="Treasury"><Amt asset={n.cur} v={n.wallet[n.cur] ?? 0} /> · <Amt asset={GOLD} v={n.wallet[GOLD] ?? 0} /></Stat>
          <Stat label="Citizens">{citizensOf(w, id).length} (+{w.households[id].pop.toLocaleString()} residents)</Stat>
          <Stat label="Regions">{regions.length}{occupiedByThem.length ? ` (+${occupiedByThem.length} occupied)` : ''}</Stat>
          <Stat label="Status">{n.exile ? 'Nation in exile' : 'Sovereign'}</Stat>
        </div>
      </Panel>
      <Panel title="Taxes & labour law">
        <table class="table compact"><tbody>
          <tr><td>Income tax (on a typical wage; progressive)</td><td>{n.taxes.work}%</td><td class="small muted">ceiling {ceil.work.toFixed(1)}%</td></tr>
          <tr><td>VAT</td><td>{n.taxes.vat}%</td><td class="small muted">ceiling {ceil.vat.toFixed(1)}%</td></tr>
          <tr><td>Import tax</td><td>{n.taxes.import}%</td><td class="small muted">ceiling {ceil.import.toFixed(1)}%</td></tr>
          <tr><td>Minimum wage</td><td>{fmtAmt(n.cur, n.minWage)}</td><td /></tr>
        </tbody></table>
        <Help>Ceilings = 25 + 0.5 × communist seat % − 0.4 (import) / 0.3 (VAT, work) × capitalist seat % (documented formula; mixed-congress combination is an interpretation).</Help>
      </Panel>
      <Panel title="Economy" class="wide"><EconomyPanel w={w} id={id} /></Panel>
      <Panel title="National development" class="wide"><DevelopmentPanel w={w} id={id} /></Panel>
      <Panel title="Public finances">
        <table class="table compact small"><tbody>
          <tr><td>Revenue (a day, last month)</td><td class="num">{fmtAmt(n.cur, Math.round(dailyRevenue(n)))}</td></tr>
          <tr><td>Spending (a day, last month)</td><td class="num">{fmtAmt(n.cur, Math.round(dailySpending(n)))}</td></tr>
          <tr><td>{dailyRevenue(n) >= dailySpending(n) ? 'Surplus' : 'Deficit'}</td><td class="num">{fmtAmt(n.cur, Math.round(Math.abs(dailyRevenue(n) - dailySpending(n))))} a day</td></tr>
          <tr><td>Public debt</td><td class="num">{fmtAmt(n.cur, n.debt ?? 0)}{dailyRevenue(n) > 0 && n.debt ? ` (${((n.debt ?? 0) / (dailyRevenue(n) * 365)).toFixed(2)} years of revenue)` : ''}</td></tr>
          <tr><td>Interest rate on bonds</td><td class="num">{bondRate(n).toFixed(2)}%</td></tr>
          <tr><td>Interest paid so far</td><td class="num">{fmtAmt(n.cur, n.interestPaid ?? 0)}</td></tr>
          <tr><td>Exports (last 30 days)</td><td class="num">{fmtAmt(GOLD, (n.trade?.hist ?? []).reduce((t, d) => t + d.exp, 0))}</td></tr>
          <tr><td>Imports (last 30 days)</td><td class="num">{fmtAmt(GOLD, (n.trade?.hist ?? []).reduce((t, d) => t + d.imp, 0))}</td></tr>
        </tbody></table>
        <Help>When the treasury runs short, the government sells bonds (up to three years of revenue) and pays interest to bondholders; when money is plentiful it repays them. Heavier debt costs more.</Help>
      </Panel>
      <Panel title="Living standards">
        <LivingPanel w={w} id={id} />
      </Panel>
      <Panel title="Revenue (daily)">
        <Sparkline values={n.stats.revHist} width={260} height={50} />
        <p class="small">Lifetime revenue {fmtAmt(n.cur, n.stats.revenue)} · spending {fmtAmt(n.cur, n.stats.spending)} · printed {fmtAmt(n.cur, n.printed)}</p>
        <p class="small">National storage: {Object.entries(n.inv).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${itemName(k)}`).join(', ') || 'empty'}</p>
      </Panel>
      <Panel title="Ideology mix (by congress seats)">
        {Object.entries(share).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
          <div class="row small"><i class="dot" style={{ background: IDEOLOGIES[k as keyof typeof IDEOLOGIES].color }} /> {IDEOLOGIES[k as keyof typeof IDEOLOGIES].name} {Math.round(v * 100)}% <span class="muted">— {IDEOLOGIES[k as keyof typeof IDEOLOGIES].desc}</span></div>
        ))}
      </Panel>
      <Panel title="Cabinet">
        <table class="table compact"><tbody>
          {(Object.keys(MINISTRY_INFO) as Ministry[]).map((m) => (
            <tr><td title={MINISTRY_INFO[m].desc}>{MINISTRY_INFO[m].name}</td><td><CitLink w={w} id={n.cabinet[m]} /></td></tr>
          ))}
        </tbody></table>
      </Panel>
      <Panel title={`${n.legislature} (${n.deputies.length} deputies + ${n.leader.toLowerCase()})`}>
        <ul class="small">{n.deputies.map((d) => <li><CitLink w={w} id={d} /> <span class="muted">{w.citizens[d]?.party != null ? w.parties[w.citizens[d].party!]?.name : ''}</span></li>)}</ul>
      </Panel>
      <Panel title="Occupied & conquered regions">
        {regions.some((r) => r.occ || r.core !== id) || w.regions.some((r) => r.core === id && r.owner !== id)
          ? <ul class="small">
              {regions.filter((r) => r.occ || r.core !== id).map((r) => <li><RegionLink w={w} id={r.id} />{r.occ ? <> — occupied by <NationChip w={w} id={r.occ.nation} /></> : ''}{r.core !== id ? ' (conquered)' : ''}</li>)}
              {w.regions.filter((r) => r.core === id && r.owner !== id).map((r) => <li><RegionLink w={w} id={r.id} /> — lost to <NationChip w={w} id={r.owner} /></li>)}
            </ul>
          : <p class="small muted">All {regions.length} regions are held and unoccupied. Every region is listed with its government below.</p>}
      </Panel>
      <CountryExtras w={w} id={id} />
      <StatesTable w={w} nation={id} />
    </div>
  );
}
