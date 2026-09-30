// State / provincial government: the region panel on the map, and the table of
// a nation's states on the Country screen.
import { useState } from 'preact/hooks';
import type { Id, Region, World } from '../../sim/types';
import { ActBtn, Amt, CitLink, Help, Num, Panel, Sparkline } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import { B } from '../../data/balance';
import { EARTH } from '../../data/earth';
import { IDEOLOGIES, IDEOLOGY_LIST } from '../../data/ideologies';
import { dayOf, DAY } from '../../engine/clock';
import { c as cur } from '../../engine/money';
import {
  appointCheck, appointHead, campaign, govTemplate, headOf, legislatureSupport, resignHead, runCheck, runForHead,
  setStateBudget, setStateTax, taxCap, voteCheck, voteState,
} from '../../sim/stategov';

function SeatBar({ seats, size }: { seats: Partial<Record<string, number>>; size: number }) {
  return (
    <div class="seatbar" title={IDEOLOGY_LIST.filter((i) => seats[i]).map((i) => `${IDEOLOGIES[i].name}: ${seats[i]}`).join(' · ')}>
      {IDEOLOGY_LIST.filter((i) => seats[i]).map((i) => <span style={{ width: `${((seats[i] ?? 0) / size) * 100}%`, background: IDEOLOGIES[i].color }} />)}
    </div>
  );
}

export function StateGovPanel({ w, r }: { w: World; r: Region }) {
  const s = w.govs[r.id];
  const tpl = govTemplate(w, r.id);
  const p = player(w);
  const e = EARTH.regions[r.id];
  if (!s || !tpl) {
    return <><h4>Regional government</h4><p class="small muted">{r.name} has no devolved government: it is run directly by the national government of {w.nations[r.owner].name}.</p></>;
  }
  const isHead = s.head.cit === p.id;
  const code = s.cur;
  const regOpen = w.time >= s.nextElection - B.state.regDays * DAY;
  return (
    <>
      <h4>{tpl.mode === 'appointed' ? '🏛️' : '🗳️'} {r.name} government <small class="muted">· seat {e.seat}</small></h4>
      {r.occ && <p class="small warn">Suspended while occupied: no state taxes, spending or elections.</p>}
      <table class="table compact"><tbody>
        <tr><td>{tpl.title}</td><td>{s.head.cit != null ? <CitLink w={w} id={s.head.cit} /> : s.head.name} <span class="ideo-chip" style={{ background: IDEOLOGIES[s.head.ideo].color }}>{IDEOLOGIES[s.head.ideo].name}</span> <small class="muted">{tpl.mode === 'appointed' ? 'appointed' : 'elected'} day {dayOf(s.head.since)}</small></td></tr>
        <tr><td>Approval</td><td>{Math.round(s.approval)}%</td></tr>
        <tr><td>{tpl.legislature}</td><td><SeatBar seats={s.seats} size={s.size} /> <small class="muted">{s.size} seats</small></td></tr>
        <tr><td>State wage tax</td><td>{s.tax}%{taxCap(w, r.id) === 0 ? <small class="muted"> (no wage tax by law)</small> : null} <small class="muted">on shifts worked here, on top of national {w.nations[r.owner].taxes.work}%</small></td></tr>
        <tr><td>Treasury</td><td><Amt asset={code} v={s.wallet[code] ?? 0} /> <Sparkline values={s.stats.revHist} width={80} height={18} /></td></tr>
        <tr><td>Budget</td><td class="small">welfare {Math.round(s.budget.welfare * 100)}% · infrastructure {Math.round(s.budget.infra * 100)}% · business {Math.round(s.budget.business * 100)}% · police {Math.round(s.budget.police * 100)}% · spends {Math.round(s.spendRate * 100)}%/day</td></tr>
        <tr><td>Infrastructure</td><td>level {s.dev}/{B.state.devMax} <small class="muted">(+{Math.round(s.dev * B.state.devBonus * 100)}% production)</small></td></tr>
        <tr><td>{tpl.mode === 'elected' ? 'Next election' : 'Term review'}</td><td>day {dayOf(s.nextElection)}</td></tr>
        <tr><td>Electorate leans</td><td class="small">{IDEOLOGY_LIST.filter((i) => s.lean[i] > 0.08).sort((a, b) => s.lean[b] - s.lean[a]).map((i) => `${IDEOLOGIES[i].name} ${Math.round(s.lean[i] * 100)}%`).join(' · ')}</td></tr>
      </tbody></table>
      {s.last && <p class="small muted">Last election (day {dayOf(s.last.at)}): {s.last.results.map((x) => `${x.name} ${Math.round((x.votes / Math.max(1, s.last!.turnout)) * 100)}%`).join(' · ')}</p>}
      {tpl.mode === 'elected' && <ElectionBox w={w} r={r} regOpen={regOpen} />}
      {tpl.mode === 'appointed' && <AppointBox w={w} r={r} />}
      {isHead && <HeadControls w={w} r={r} />}
    </>
  );
}

function ElectionBox({ w, r, regOpen }: { w: World; r: Region; regOpen: boolean }) {
  const s = w.govs[r.id]!;
  const p = player(w);
  const [amt, setAmt] = useState(50);
  const mine = s.candidates.find((c) => c.cit === p.id);
  return (
    <div class="card">
      {s.candidates.length > 0 ? (
        <>
          <b>Candidates</b>
          <table class="table compact"><tbody>{s.candidates.map((c, i) => (
            <tr><td>{c.cit != null ? <CitLink w={w} id={c.cit} /> : c.name}</td><td><span class="ideo-chip" style={{ background: IDEOLOGIES[c.ideo].color }}>{IDEOLOGIES[c.ideo].name}</span></td>
              <td><ActBtn small why={voteCheck(w, p.id, r.id, i)} showWhy={false} run={(w) => voteState(w, p.id, r.id, i)}>Vote</ActBtn></td></tr>
          ))}</tbody></table>
        </>
      ) : <p class="small muted">{regOpen ? 'Registration is open.' : `Registration opens on day ${dayOf(s.nextElection - B.state.regDays * DAY)}.`}</p>}
      {!mine && <ActBtn small why={runCheck(w, p.id, r.id)} run={(w) => runForHead(w, p.id, r.id)}>Run for {govTemplate(w, r.id)!.title}</ActBtn>}
      {mine && (
        <div class="row small">Campaign spending <Num value={amt} onInput={setAmt} min={1} width={80} /> {s.cur}
          <ActBtn small run={(w) => campaign(w, p.id, r.id, cur(amt))}>Spend</ActBtn> <span class="muted">spent so far {(mine.campaign / 100).toFixed(0)} {s.cur}</span></div>
      )}
      <Help>Residents who are citizens vote; the background electorate follows its ideological leaning, the incumbent's approval, candidates' influence and campaign spending (paid to local households). Citizens living here with standing {B.state.candRep}+ can run.</Help>
    </div>
  );
}

function AppointBox({ w, r }: { w: World; r: Region }) {
  const p = player(w);
  const n = w.nations[r.owner];
  if (n.president !== p.id) return <p class="small muted">The {govTemplate(w, r.id)!.title} is appointed by the {n.leader.toLowerCase()} of {n.name}.</p>;
  const cands = Object.values(w.citizens).filter((c) => c.nation === r.owner && c.loc === r.id && headOf(w, c.id) == null).slice(0, 8);
  return (
    <div class="card">
      <b>Appoint</b> <small class="muted">(you are {n.leader})</small>
      <div class="row small">
        <ActBtn small why={appointCheck(w, p.id, r.id, null)} run={(w) => appointHead(w, p.id, r.id, null)}>A new career official</ActBtn>
        <ActBtn small why={appointCheck(w, p.id, r.id, p.id)} run={(w) => appointHead(w, p.id, r.id, p.id)}>Yourself</ActBtn>
        {cands.filter((c) => !c.player).map((c) => <ActBtn small why={appointCheck(w, p.id, r.id, c.id)} run={(w) => appointHead(w, p.id, r.id, c.id)}>{c.name} ({IDEOLOGIES[c.ideo].name})</ActBtn>)}
      </div>
    </div>
  );
}

function HeadControls({ w, r }: { w: World; r: Region }) {
  const s = w.govs[r.id]!;
  const p = player(w);
  const tpl = govTemplate(w, r.id)!;
  const [tax, setTax] = useState(s.tax);
  const [wel, setWel] = useState(Math.round(s.budget.welfare * 100));
  const [inf, setInf] = useState(Math.round(s.budget.infra * 100));
  const [pol, setPol] = useState(Math.round(s.budget.police * 100));
  const [rate, setRate] = useState(Math.round(s.spendRate * 100));
  const bus = 100 - wel - inf - pol;
  const dir = Math.sign(tax - s.tax);
  const support = dir ? Math.round(legislatureSupport(s, dir) * 100) : null;
  return (
    <div class="card">
      <b>You govern {r.name}</b> <small class="muted">salary {B.state.salary} {s.cur}/day</small>
      <div class="row small">Wage tax <Num value={tax} onInput={setTax} min={0} max={taxCap(w, r.id)} width={60} />%
        <ActBtn small run={(w) => setStateTax(w, p.id, r.id, tax)}>Put to the {tpl.legislature}</ActBtn>
        {support != null && <span class="muted">{tpl.mode === 'appointed' ? '' : `~${support}% of seats favour this direction`}</span>}</div>
      <div class="row small">Welfare <Num value={wel} onInput={setWel} min={0} max={100} width={55} />% · Infrastructure <Num value={inf} onInput={setInf} min={0} max={100} width={55} />% · Police <Num value={pol} onInput={setPol} min={0} max={100} width={55} />% · Business {bus}% · Spend <Num value={rate} onInput={setRate} min={5} max={60} width={55} />%/day
        <ActBtn small why={bus < 0 ? 'Shares exceed 100%.' : null} run={(w) => setStateBudget(w, p.id, r.id, { welfare: wel / 100, infra: inf / 100, business: bus / 100, police: pol / 100 }, rate / 100)}>Set budget</ActBtn></div>
      <ActBtn small kind="danger" confirm="Resign your office?" run={(w) => resignHead(w, p.id)}>Resign</ActBtn>
      <Help>Welfare goes to residents and lifts approval where the electorate leans left; infrastructure builds toward the next level (+{B.state.devBonus * 100}% production each); business support is paid to local companies per worker. Tax changes need a majority of the legislature and can move {B.state.taxStep} points every {B.state.taxCooldownDays} days.</Help>
    </div>
  );
}

/** Country screen: every state/province with its government at a glance. */
export function StatesTable({ w, nation }: { w: World; nation: Id }) {
  const [sort, setSort] = useState<'name' | 'pop' | 'tax' | 'approval'>('name');
  const rows = w.regions.filter((r) => r.owner === nation);
  const key = (r: Region) => {
    const s = w.govs[r.id];
    return sort === 'pop' ? -r.pop : sort === 'tax' ? -(s?.tax ?? -1) : sort === 'approval' ? -(s?.approval ?? -1) : 0;
  };
  rows.sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
  const th = (k: typeof sort, label: string) => <th class="link" onClick={() => setSort(k)}>{label}{sort === k ? ' ▾' : ''}</th>;
  return (
    <Panel title={`States, provinces & regions (${rows.length})`} class="wide">
      <div class="scroll-x"><table class="table compact small">
        <thead><tr>{th('name', 'Region')}<th>Seat</th>{th('pop', 'Residents')}<th>Head</th><th>Party line</th>{th('approval', 'Approval')}{th('tax', 'Wage tax')}<th>Treasury</th><th>Infra</th><th>Next vote</th></tr></thead>
        <tbody>{rows.map((r) => {
          const s = w.govs[r.id];
          const tpl = govTemplate(w, r.id);
          return (
            <tr>
              <td><span class="link" onClick={() => store.go('map', { region: r.id })}>{r.name}</span>{r.occ ? ' ⚔️' : ''}</td>
              <td>{EARTH.regions[r.id].seat}</td>
              <td>{r.pop.toLocaleString()}</td>
              {s && tpl ? <>
                <td>{tpl.title} {s.head.cit != null ? <CitLink w={w} id={s.head.cit} /> : s.head.name}</td>
                <td><span class="ideo-chip" style={{ background: IDEOLOGIES[s.head.ideo].color }}>{IDEOLOGIES[s.head.ideo].name}</span></td>
                <td>{Math.round(s.approval)}%</td>
                <td>{s.tax}%</td>
                <td><Amt asset={s.cur} v={s.wallet[s.cur] ?? 0} /></td>
                <td>{s.dev}</td>
                <td>{tpl.mode === 'elected' ? `day ${dayOf(s.nextElection)}` : 'appointed'}</td>
              </> : <td colSpan={7} class="muted">governed directly by the national government</td>}
            </tr>
          );
        })}</tbody>
      </table></div>
    </Panel>
  );
}
