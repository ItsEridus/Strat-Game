// World Situation: the business cycle, commodity markets, disasters, epidemics,
// strikes and unrest — and what you can do about them.
import { MONTHS, dateAt } from '../../engine/calendar';
import { fromLocal as fromL, localStep as stepL, toLocal as toL } from '../../engine/money';
import { fmtDay } from '../../engine/calendar';
import { useState } from 'preact/hooks';
import { TIER_LABEL } from '../../sim/forces';
import { STRATEGY_INFO } from '../../sim/nationalBudget';
import type { World } from '../../sim/types';
import { ActBtn, Bar, Empty, Help, NationChip, Num, Panel, RegionLink, Sparkline } from '../common';
import { player } from '../../sim/query';
import { researchMass, techStanding } from '../../sim/technology';
import { capsOf, techAvg } from '../../sim/strategic';
import { cyberOffence } from '../../sim/cyber';
import { spaceCapability } from '../../sim/space';
import { TECH } from '../../data/techTree';
import { climateCommitment, climateOf, emissionsOf } from '../../sim/climate';
import { gamesOf, softPowerOf } from '../../sim/softPower';
import { energyOf } from '../../sim/energy';
import { reserveShare, riskAppetite, stocksOf, superCycle } from '../../sim/markets';
import { fmtAmt } from '../../engine/money';
import { HAZARDS } from '../../data/hazards';
import { KIND_ICON, activeCrises, donate, joinProtest, joinProtestCheck, lockdownCheck, monthOf, reliefCheck, toggleLockdown, volunteer } from '../../sim/dynamics';

const PHASE: Record<string, string> = { boom: '📈 Boom', expansion: '↗️ Expansion', slowdown: '↘️ Slowdown', recession: '📉 Recession' };

export function WorldState({ w }: { w: World }) {
  const p = player(w);
  const e = w.econ;
  const crises = activeCrises(w).sort((a, b) => b.severity - a.severity || b.id - a.id);
  const month = monthOf(w);
  const iso = w.nations[p.nation].iso;
  const season = [...new Set(HAZARDS.filter((h) => (!h.months.length || h.months.includes(month)) && h.regions.some((r) => r.startsWith(`${iso}/`))).map((h) => h.label))];
  const [gift, setGift] = useState(() => Math.round(toL(w.nations[p.nation].cur, 2500)));
  const past = Object.values(w.crises).filter((c) => c.status === 'over').sort((a, b) => b.end - a.end).slice(0, 10);
  return (
    <div class="grid">
      <Panel title="📰 The State of the World" class="wide"><YearReports w={w} /></Panel>
      <Panel title="🌐 World economy">
        <p><b>{PHASE[e.phase]}</b> <small class="muted">(cycle {e.cycle >= 0 ? '+' : ''}{e.cycle.toFixed(2)})</small></p>
        <Sparkline values={e.hist.length ? e.hist : [0]} width={300} height={50} />
        <p class="small">Household spending {e.cycle >= 0 ? '+' : ''}{Math.round(e.cycle * 30)}% · crime pressure {e.cycle < 0 ? `+${Math.round(-e.cycle * 10)}` : 'normal'}</p>
        <p class="small">Appetite for risk {Math.round(riskAppetite(w) * 100)}%{(e.fear ?? 0) > 0.1 ? ' (markets are frightened)' : ''}: {riskAppetite(w) > 0.55 ? 'money flows into emerging markets' : riskAppetite(w) < 0.4 ? 'money flees emerging markets' : 'capital flows are calm'}.</p>
        <table class="table compact small"><thead><tr><th>Stock market</th><th>Index (2025 = 1)</th><th>Bubble</th></tr></thead><tbody>
          {w.nations.filter((n) => !n.exile).map((n) => ({ n, s: stocksOf(n) })).sort((a, b) => b.s.index - a.s.index).slice(0, 8).map(({ n, s }) => <tr><td><NationChip w={w} id={n.id} /></td><td>{s.index.toFixed(2)}{s.lastCrash != null && w.time - s.lastCrash < 365 * 1440 ? ' 📉' : ''}</td><td>{s.bubble > 0.5 ? 'frothy' : s.bubble > 0.25 ? 'rising' : '—'}</td></tr>)}
        </tbody></table>
        <p class="small">Commodity super-cycles (long-run prices against normal): {['oil', 'copper', 'grain', 'iron'].map((k) => `${k} ${superCycle(w, k) >= 1 ? '+' : ''}${Math.round((superCycle(w, k) - 1) * 100)}%`).join(', ')}.</p>
        <p class="small">World reserves: {w.nations.filter((n) => reserveShare(n) > 0.01).sort((a, b) => reserveShare(b) - reserveShare(a)).map((n) => `${n.adj} ${Math.round(reserveShare(n) * 100)}%`).join(', ')}.</p>
        <table class="table compact small"><tbody>{Object.entries(e.commodity).map(([k, v]) => (
          <tr><td>{k}</td><td class={v > 1 ? 'good' : v < 1 ? 'bad' : ''}>{v === 1 ? 'normal output' : `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}% world output`}</td></tr>
        ))}</tbody></table>
        <Help>The world economy moves in cycles: booms lift household spending (and wage pressure), recessions cut it and push crime and unrest up. Commodity shocks change raw-material output for every producer.</Help>
      </Panel>

      <Panel title={`📅 ${MONTHS[month - 1]} ${dateAt(w.time).year}`}>
        <p class="small">In season for {w.nations[p.nation].name}: {season.join(', ') || 'no major hazards'}.</p>
        <Help>Disasters strike their real hazard zones in season: hurricanes on the Gulf coast, typhoons in East Asia, earthquakes along fault lines, monsoon floods, wildfires, blizzards and droughts. Epidemics can start anywhere and spread along borders.</Help>
      </Panel>

      <Panel title="🚨 Active situations" class="wide">
        {crises.length ? crises.map((c) => {
          const here = c.regions.includes(p.loc);
          const natural = ['hurricane', 'earthquake', 'flood', 'wildfire', 'blizzard', 'drought', 'epidemic'].includes(c.kind);
          return (
            <div class="card">
              <b>{KIND_ICON[c.kind]} {c.name}</b> <small class="muted">since {fmtDay(c.start)} · until ~{fmtDay(c.end)}{c.severity > 1 ? ` · severity ${c.severity}` : ''}{c.deaths ? ` · ${c.deaths.toLocaleString()} dead` : ''}{c.relief ? ` · relief ${fmtAmt(c.nation != null ? w.nations[c.nation].cur : 'USD', c.relief)}` : ''}</small>
              {c.regions.length > 0 && <p class="small">Affected: {c.regions.slice(0, 12).map((r, i) => <>{i ? ', ' : ''}<RegionLink w={w} id={r} />{c.lockdown?.includes(r) ? ' 🔒' : ''}</>)}{c.regions.length > 12 ? ` +${c.regions.length - 12} more` : ''}</p>}
              <div class="row small">
                {natural && <ActBtn small why={reliefCheck(w, p, c.id)} showWhy={here} run={(w) => volunteer(w, p, c.id)}>Volunteer (−20⚡)</ActBtn>}
                {natural && c.nation != null && <><Num value={gift} onInput={setGift} min={1} step={stepL(w.nations[p.nation].cur)} width={90} /><ActBtn small run={(w) => donate(w, p, c.id, fromL(w.nations[p.nation].cur, gift))}>Donate</ActBtn></>}
                {(c.kind === 'protest' || c.kind === 'riot') && <ActBtn small kind={c.kind === 'riot' ? 'danger' : undefined} why={joinProtestCheck(w, p)} showWhy={here} run={(w) => joinProtest(w, p)}>Join</ActBtn>}
                {c.kind === 'epidemic' && c.regions.filter((r) => !lockdownCheck(w, p, r)).map((r) => <ActBtn small run={(w) => toggleLockdown(w, p, r)}>{c.lockdown?.includes(r) ? 'Lift' : 'Order'} lockdown in {w.regions[r].name}</ActBtn>)}
              </div>
            </div>
          );
        }) : <Empty>Nothing major is happening right now.</Empty>}
      </Panel>

      <Panel title="🌡️ Climate" class="wide"><Climate w={w} /></Panel>
      <Panel title="🎭 Soft power and prestige"><SoftPower w={w} /></Panel>
      <Panel title="🔬 The technology race" class="wide"><TechRace w={w} /></Panel>
      <Panel title="🏛️ Rise & fall" class="wide"><RiseFall w={w} /></Panel>

      <Panel title="🗓️ Recent history">
        {past.length ? <ul class="small">{past.map((c) => <li>{KIND_ICON[c.kind]} {c.name} ({fmtDay(c.start)} – {fmtDay(c.end)}){c.deaths ? `, ${c.deaths.toLocaleString()} dead` : ''}</li>)}</ul> : <Empty>No past events yet.</Empty>}
      </Panel>
    </div>
  );
}

/** Soft power ranking and the Olympics and World Expos, past and planned. */
function SoftPower({ w }: { w: World }) {
  const ranked = w.nations.filter((n) => !n.exile).sort((a, b) => softPowerOf(b) - softPowerOf(a));
  const year = dateAt(w.time).year;
  const games = gamesOf(w).slice().sort((a, b) => a.year - b.year);
  return (
    <>
      <table class="table compact small"><tbody>{ranked.slice(0, 10).map((n, i) => <tr><td>{i + 1}</td><td><NationChip w={w} id={n.id} /></td><td><Bar v={softPowerOf(n)} max={100} color="#8a63d2" label={`${Math.round(softPowerOf(n))}`} /></td></tr>)}</tbody></table>
      <ul class="small">{games.filter((g) => g.year >= year - 4).slice(0, 6).map((g) => <li>{g.kind === 'olympics' ? '🏅 Summer Olympics' : '🎪 World Expo'} {g.year}: {w.nations[g.host].name}{g.city ? ` (${g.city})` : ''}{g.done ? ' ✓' : ''}</li>)}</ul>
      <Help>Soft power starts from the Brand Finance index (2025) and drifts with freedom, aggression, breakthroughs, space missions, hosting the Olympics or a World Expo, and the strength of a country's universities and economy. Others warm to attractive countries, and foreign students add to their research.</Help>
    </>
  );
}

/** Climate: temperature, sea level, emissions, the biggest emitters and the climate treaty. */
function Climate({ w }: { w: World }) {
  const c = climateOf(w);
  const paris = Object.values(w.treaties ?? {}).find((t) => t.kind === 'climate' && t.status === 'active');
  const emitters = w.nations.filter((n) => !n.exile).map((n) => ({ n, e: emissionsOf(w, n) })).sort((a, b) => b.e - a.e).slice(0, 6);
  const total = c.hist.length ? c.hist[c.hist.length - 1].gt : null;
  return (
    <>
      <p><b>{c.temp.toFixed(2)}°C</b> above pre-industrial levels · sea level +{Math.round(c.sea * 100)} cm since 2025{total != null ? ` · ${total} billion tonnes of CO₂ last year` : ''}</p>
      {c.hist.length > 1 && <Sparkline values={c.hist.map((h) => h.temp)} width={300} height={40} />}
      <table class="table compact small"><thead><tr><th>Largest emitters</th><th>CO₂ (Gt a year)</th><th>Fossil share of energy</th><th>Climate agreement</th></tr></thead><tbody>
        {emitters.map(({ n, e }) => <tr><td><NationChip w={w} id={n.id} /></td><td>{e.toFixed(2)}</td><td>{Math.round(['coal', 'gas', 'oil'].reduce((t, s) => t + ((energyOf(n).mix as any)[s] ?? 0), 0) * 100)}%</td><td>{paris?.parties.includes(n.id) ? (climateCommitment(w, n) > 0.5 ? 'member' : 'member (in name)') : 'outside'}</td></tr>)}
      </tbody></table>
      <Help>Temperature follows cumulative emissions (about 0.45°C per thousand billion tonnes). A warmer world brings hotter weather (more near the poles), more frequent storms, floods, droughts and wildfires, poorer harvests in hot zones and better ones in cold zones, coastal flooding as the sea rises, and people moving from the hottest regions. The energy transition is faster for committed members of the climate agreement and with clean-energy technology; nationalist governments and fuel exporters tend to leave or do little.</Help>
    </>
  );
}

/** The technology race: research effort, technologies, world firsts, cyber and space, country by country. */
function TechRace({ w }: { w: World }) {
  const rows = w.nations.filter((n) => !n.exile).map((n) => ({ n, st: techStanding(w, n), mass: researchMass(n, w), avg: techAvg(capsOf(w, n)), cyb: cyberOffence(w, n), sp: spaceCapability(w, n) }))
    .sort((a, b) => b.avg - a.avg || a.n.id - b.n.id);
  const recent = Object.entries(w.techFirsts ?? {}).sort((a, b) => b[1].t - a[1].t).slice(0, 6);
  return (
    <>
      <table class="table compact small"><thead><tr><th>Country</th><th>Technology</th><th>Research effort</th><th>Frontier tech</th><th>World firsts</th><th>Cyber offence</th><th>Space</th></tr></thead><tbody>
        {rows.map((r) => <tr><td><NationChip w={w} id={r.n.id} /></td><td>{r.avg.toFixed(1)}</td><td>{r.mass.toFixed(1)}</td><td>{r.st.held}</td><td>{r.st.firsts}</td><td>{Math.round(r.cyb)}</td><td>{Math.round(r.sp)}</td></tr>)}
      </tbody></table>
      {recent.length > 0 && <ul class="small">{recent.map(([id, f]) => <li><span class="muted">{fmtDay(f.t)}</span> {TECH[id]?.icon} {TECH[id]?.name}: first achieved by {w.nations[f.nation].name}</li>)}</ul>}
      <Help>Technology is the average of the six domains (100 = the 2025 leader in each). Research effort is R&D spending times the size of the economy times the research workforce: spending more on research moves a country up the table over the decades, and a lead shows in growth, armed forces, intelligence and space.</Help>
    </>
  );
}

/** The Rise & Fall timeline: regime changes, coups, revolutions, new states, civil wars, mergers and puppets. */
const RISE_FALL = /^(🪖|✊|🗽|⛓️|🎉|🏴|⚔️|🗺️|🤝|🏚️|🏗️|🎎|📢|🩸)/;
function RiseFall({ w }: { w: World }) {
  const seen = new Set<string>();
  const items: { t: number; text: string }[] = [];
  for (const n of w.nations) for (const e of n.chronicle ?? []) {
    const k = `${e.t}|${e.text}`;
    if (!RISE_FALL.test(e.text) || seen.has(k)) continue;
    seen.add(k);
    items.push(e);
  }
  items.sort((a, b) => b.t - a.t);
  const born = w.nations.filter((n) => n.founded != null && n.dissolved == null).length;
  const gone = w.nations.filter((n) => n.dissolved != null).length;
  return (
    <>
      <p class="small">{w.nations.filter((n) => n.dissolved == null).length} countries today{born ? `, ${born} of them born in play` : ''}{gone ? `; ${gone} no longer exist` : ''}.</p>
      {items.length ? <ul class="small">{items.slice(0, 40).map((e) => <li><span class="muted">{fmtDay(e.t)}</span> {e.text}</li>)}</ul> : <Empty>No regime has fallen and no border has moved yet.</Empty>}
      <Help>Coups, revolutions, democratisation and backsliding, secession, civil wars, new and vanished states, puppets and failed states, across the whole world, newest first.</Help>
    </>
  );
}

function YearReports({ w }: { w: World }) {
  const reports = w.yearReports ?? [];
  const [i, setI] = useState(-1);
  const r = reports.at(i) ?? reports.at(-1);
  if (!r) return <p class="small muted">The first report comes out on 1 January, summing up the year for every country: growth, power, jobs, prices and debt.</p>;
  return <>
    <div class="row between"><b>{r.year}</b><span>{reports.map((x, j) => <button type="button" class={`btn small ghost${x === r ? ' on' : ''}`} onClick={() => setI(j - reports.length)}>{x.year}</button>)}</span></div>
    <ul class="small">{r.headlines.map((h) => <li>{h}</li>)}</ul>
    <div class="scroll-x"><table class="table compact small"><thead><tr><th>#</th><th>Country</th><th>Tier</th><th class="num">Power</th><th class="num">Growth</th><th class="num">Unemployment</th><th class="num">Inflation</th><th class="num">Debt (years of revenue)</th><th>Strategy</th></tr></thead>
      <tbody>{r.rows.map((x) => <tr><td>{x.rank}</td><td><NationChip w={w} id={x.nation} /></td><td>{TIER_LABEL[x.tier]}</td><td class="num">{x.power}</td><td class="num">{x.growth.toFixed(1)}%</td><td class="num">{Math.round(x.unemployment * 100)}%</td><td class="num">{x.inflation == null ? '—' : `${x.inflation.toFixed(1)}%`}</td><td class="num">{x.debtYears.toFixed(2)}</td><td>{x.strategy ? STRATEGY_INFO[x.strategy as keyof typeof STRATEGY_INFO].label : '—'}</td></tr>)}</tbody></table></div>
  </>;
}
