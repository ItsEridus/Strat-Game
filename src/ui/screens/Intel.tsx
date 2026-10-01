// Intelligence: your nation's service, networks, dossiers, operations, careers,
// and the double life of an asset.
import { fmtDay } from '../../engine/calendar';
import { census } from '../../sim/census';
import { useState } from 'preact/hooks';
import type { Id, OpKind, World } from '../../sim/types';
import { ActBtn, Bar, CitLink, Empty, Help, NationChip, Panel, Select } from '../common';
import { controller, player } from '../../sim/query';
import { visible } from '../../sim/forces';
import { nationPerm } from '../../sim/authority';
import { B } from '../../data/balance';
import { DIRECTORATES, DIR_INFO, type Directorate } from '../../data/intelServices';
import { MEASURES, MEASURE_LABEL, believed, estimateOf, rangeOf } from '../../sim/beliefs';
import { militaryPower } from '../../sim/war';
import { MOTIVE_LABEL, agentsOf, coverFactor, placementOf } from '../../sim/collection';
import { OP_DIR, dirOfAgent, joinDirectorate, orgOf, prioritise, staffByDir } from '../../sim/intelOrg';
import { ARANKS, OPS, analyze, analyzeCheck, joinAgency, joinAgencyCheck, knownDossier, launchOp, leaveAgency, opCheck, quitAsset, setAgencyBudget } from '../../sim/intel';

export function Intel({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const a = n.agency;
  const official = nationPerm(w, p.id, p.nation, 'intel');
  const foreign = w.nations.filter((x) => x.id !== p.nation);
  const ops = Object.values(w.ops).filter((o) => o.nation === p.nation && (official || o.agent === p.id)).sort((x, y) => y.id - x.id).slice(0, 15);
  const against = Object.values(w.ops).filter((o) => o.target === p.nation && o.nation !== p.nation && o.status === 'exposed').sort((x, y) => y.id - x.id).slice(0, 8);
  return (
    <div class="grid">
      <Panel title={`🕵️ ${a.name}`} class="wide">
        <div class="stats">
          <div class="stat"><small>Director</small><b><CitLink w={w} id={n.cabinet.intelligence ?? n.president} /></b></div>
          <div class="stat"><small>Budget</small><b>{(a.budget * 100).toFixed(1)}% of revenue</b></div>
          <div class="stat"><small>Counter-intelligence</small><Bar v={a.counter} max={100} color="#5b8def" label={`${Math.round(a.counter)}`} /></div>
          <div class="stat"><small>Operations</small><b>{a.opsRun} run · {a.exposed} exposed · {a.caught} foreign agents caught</b></div>
          <div class="stat"><small>Focus</small><b>{a.focus.map((f) => w.nations[f].name).join(', ') || '—'}</b></div>
        </div>
        <h4>Network penetration</h4>
        <div class="netgrid">{foreign.map((o) => (
          <div><NationChip w={w} id={o.id} /><Bar v={a.network[o.id] ?? 0} max={100} color="#8a63d2" label={`${Math.round(a.network[o.id] ?? 0)}`} /></div>
        ))}</div>
        <Help>The budget builds networks in the focus countries (slower against strong counter-intelligence) and sustains counter-intelligence at home. Deeper networks unlock bolder operations and raise success odds. Exposed operations cost relations, networks and sometimes agents.</Help>
      </Panel>

      <Directorates w={w} official={official} />
      {(official || p.sec.agency === p.nation || n.president === p.id) && <Estimates w={w} />}
      {(official || (p.sec.agency === p.nation && p.sec.arank >= 2)) && <Sources w={w} />}
      {official && <DirectorPanel w={w} />}
      <CareerPanel w={w} />
      {(official || (p.sec.agency === p.nation && p.sec.arank >= 1)) && <OpsPanel w={w} />}

      <Panel title="📁 Dossiers">
        {foreign.filter((o) => knownDossier(w, p.nation, o.id)).map((o) => {
          const d = knownDossier(w, p.nation, o.id)!;
          return <details><summary><NationChip w={w} id={o.id} /> <small class="muted">{fmtDay(d.t)}</small></summary><ul class="small">{d.lines.map((l) => <li>{l}</li>)}</ul></details>;
        })}
        {!foreign.some((o) => knownDossier(w, p.nation, o.id)) && <Empty>No current dossiers. "Gather intelligence" operations produce them (valid 10 days).</Empty>}
      </Panel>

      <Panel title="📜 Operations">
        {ops.length ? <table class="table compact small"><tbody>{ops.map((o) => (
          <tr><td>{OPS[o.kind].name}</td><td>{o.kind === 'counter' ? 'home' : <NationChip w={w} id={o.target} />}</td><td class={o.status === 'exposed' ? 'bad' : o.status === 'success' ? 'good' : ''}>{o.status}</td><td class="muted">{o.result ?? `ends ${fmtDay(o.ends)}`}</td></tr>
        ))}</tbody></table> : <Empty>{official || p.sec.agency != null ? 'No operations yet.' : 'Operations are classified. Join the service or hold office to see them.'}</Empty>}
        {against.length > 0 && <><h4>Foreign operations exposed at home</h4><ul class="small">{against.map((o) => <li>{w.nations[o.nation].name}: {OPS[o.kind].name.toLowerCase()} ({fmtDay(o.ends)})</li>)}</ul></>}
      </Panel>
    </div>
  );
}

function DirectorPanel({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const [budget, setBudget] = useState(Math.round(n.agency.budget * 1000) / 10);
  const [focus, setFocus] = useState<Id[]>(n.agency.focus);
  return (
    <Panel title="🏛️ Direct the service">
      <div class="row small">Budget <Select value={budget} options={[0, 1, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15].map((x) => [x, `${x}% of revenue`])} onChange={setBudget} /></div>
      <div class="checks small">{w.nations.filter((x) => x.id !== p.nation).map((x) => (
        <label><input type="checkbox" checked={focus.includes(x.id)} onChange={() => setFocus(focus.includes(x.id) ? focus.filter((f) => f !== x.id) : [...focus, x.id].slice(-4))} />{x.name}</label>
      ))}</div>
      <ActBtn small run={(w) => setAgencyBudget(w, p.id, p.nation, budget / 100, focus)}>Apply (up to 4 focus countries)</ActBtn>
    </Panel>
  );
}

function CareerPanel({ w }: { w: World }) {
  const p = player(w);
  const [dir, setDir] = useState<Directorate>(dirOfAgent(p));
  const [target, setTarget] = useState(w.nations.find((x) => x.id !== p.nation)!.id);
  return (
    <Panel title="🎖️ Your intelligence career">
      {p.sec.agency == null ? (
        <>
          <p class="small">Join the {w.nations[p.nation].agency.name} (age {B.intel.age}+, standing {B.intel.rep}+, clean record). Analysts file reports that deepen networks; case officers run operations; field agents run the risky ones.</p>
          <ActBtn why={joinAgencyCheck(w, p)} run={(w) => joinAgency(w, p)}>Apply to the service</ActBtn>
        </>
      ) : (
        <>
          <p><b>{ARANKS[p.sec.arank]}</b>, {DIR_INFO[dirOfAgent(p)].label.toLowerCase()} directorate · tradecraft {p.sec.tradecraft.toFixed(1)} · successful operations {p.flags.opWins ?? 0}</p>
          <div class="row small">Transfer to <Select value={dir} options={DIRECTORATES.map((d) => [d, DIR_INFO[d].label] as [Directorate, string])} onChange={setDir} />
            <ActBtn small why={dir === dirOfAgent(p) ? 'You already serve there.' : null} run={(w) => joinDirectorate(w, p, dir)}>Transfer</ActBtn></div>
          <p class="small muted">Operations run by your own directorate go a little better.</p>
          <div class="row small">File a report on <Select value={target} options={w.nations.filter((x) => x.id !== p.nation).map((x) => [x.id, x.name])} onChange={setTarget} />
            <ActBtn small why={analyzeCheck(w, p, target)} run={(w) => analyze(w, p, target)}>Analyse (−10⚡)</ActBtn></div>
          <ActBtn small kind="ghost" confirm="Resign from the service?" run={(w) => leaveAgency(w, p)}>Resign</ActBtn>
        </>
      )}
      {p.sec.asset != null && (
        <div class="card"><b class="warn">You secretly work for the {w.nations[p.sec.asset].agency.name}.</b> <small>Payments arrive daily; counter-intelligence sweeps may catch you.</small>
          <ActBtn small kind="danger" run={(w) => quitAsset(w, p)}>Cut contact</ActBtn></div>
      )}
    </Panel>
  );
}

function OpsPanel({ w }: { w: World }) {
  const p = player(w);
  const foreign = w.nations.filter((x) => x.id !== p.nation);
  const [kind, setKind] = useState<OpKind>('intel');
  const [target, setTarget] = useState(foreign[0].id);
  const regions = w.regions.filter((r) => controller(r) === target);
  const [region, setRegion] = useState<Id>(regions[0]?.id ?? -1);
  const subjects = census(w).all.filter((c) => c.nation === target).sort((a, b) => b.influence - a.influence).slice(0, 25);
  const [subject, setSubject] = useState<Id>(subjects[0]?.id ?? -1);
  const forces = Object.values(w.forces).filter((f) => f.nation === target && visible(w, p.nation, f)).sort((a, b) => b.strength - a.strength);
  const [fid, setFid] = useState<Id>(forces[0]?.id ?? -1);
  const def = OPS[kind];
  const rid = def.needs === 'region' ? (regions.some((r) => r.id === region) ? region : regions[0]?.id ?? null) : null;
  const sid = def.needs === 'subject' ? (subjects.some((c) => c.id === subject) ? subject : subjects[0]?.id ?? null) : def.needs === 'formation' ? (forces.some((f) => f.id === fid) ? fid : forces[0]?.id ?? null) : null;
  return (
    <Panel title="🗂️ Plan an operation" class="wide">
      <div class="row small">
        <Select value={kind} options={(Object.keys(OPS) as OpKind[]).map((k) => [k, `${OPS[k].name} (${B.intel.opCost[k]})`])} onChange={setKind} />
        {kind !== 'counter' && <Select value={target} options={foreign.map((x) => [x.id, `${x.name} · network ${Math.round(w.nations[p.nation].agency.network[x.id] ?? 0)}`])} onChange={setTarget} />}
        {def.needs === 'region' && <Select value={rid ?? -1} options={regions.map((r) => [r.id, r.name])} onChange={setRegion} />}
        {def.needs === 'formation' && <Select value={sid ?? -1} options={forces.map((f) => [f.id, `${f.name} (${f.branch === 'navy' ? f.zone : w.regions[f.loc].name})`])} onChange={setFid} />}
        {def.needs === 'subject' && <Select value={sid ?? -1} options={subjects.map((c) => [c.id, `${c.name} (influence ${Math.round(c.influence)})`])} onChange={setSubject} />}
        <ActBtn kind="primary" why={opCheck(w, p.id, p.nation, kind, target, rid, sid)} run={(w) => launchOp(w, p.id, p.nation, kind, target, rid, sid)}>Launch</ActBtn>
      </div>
      <p class="small muted">{def.desc} Needs network {B.intel.minNetwork[kind]}, takes {B.intel.opHours[kind]}h, costs {B.intel.opCost[kind]} from the treasury{def.relation ? `; if exposed, relations fall ~${-def.relation - 6}` : ''}.</p>
    </Panel>
  );
}

function Directorates({ w, official }: { w: World; official: boolean }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const o = orgOf(n);
  const staff = staffByDir(w, n.id);
  return (
    <Panel title="🏢 Directorates" class="wide">
      <div class="scroll-x"><table class="table compact small">
        <thead><tr><th>Directorate</th><th>Strength</th><th>Trend</th><th>Budget</th><th>Staff</th><th>Runs</th>{official && <th></th>}</tr></thead>
        <tbody>{DIRECTORATES.map((d) => {
          const trend = o.prev ? o.dirs[d] - o.prev[d] : 0;
          const runs = (Object.keys(OPS) as OpKind[]).filter((k) => OP_DIR[k] === d).map((k) => OPS[k].name.toLowerCase());
          return (
            <tr><td title={DIR_INFO[d].desc}>{DIR_INFO[d].icon} {DIR_INFO[d].label}{o.lessons[d] > 0.3 ? <small class="muted"> (learning from failure)</small> : null}</td>
              <td><Bar v={o.dirs[d]} max={100} color="#8a63d2" label={`${Math.round(o.dirs[d])}`} /></td>
              <td class={trend > 0.05 ? 'good' : trend < -0.05 ? 'bad' : 'muted'}>{trend > 0.05 ? '▲' : trend < -0.05 ? '▼' : '—'}</td>
              <td>{Math.round(o.split[d] * 100)}%</td><td>{staff[d]}</td><td class="muted">{runs.join(', ') || '—'}</td>
              {official && <td><ActBtn small run={(w) => prioritise(w, p.id, p.nation, d)}>Prioritise</ActBtn></td>}</tr>
          );
        })}</tbody>
      </table></div>
      <Help>A service is eight directorates. Each starts from the real service's strengths in 2025 and moves, month by month, towards what the country now gives it: money (the budget and how it is divided), technology (signals, open sources and cyber follow information technology; imagery follows space), people, and experience. Failed and exposed operations teach lessons, and the directorate improves faster for a while afterwards. Every operation draws on the directorate that runs it.</Help>
    </Panel>
  );
}

function Estimates({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const own = Math.max(1, militaryPower(w, n.id));
  const foreign = w.nations.filter((x) => x.id !== n.id && !x.exile);
  const x = (v: number) => `${(v / own).toFixed(2)}×`;
  const lastReview = (t: typeof foreign[number]) => { const r = estimateOf(w, n, t).review; return r?.[r.length - 1]; };
  return (
    <Panel title="📊 What we believe" class="wide">
      <div class="scroll-x"><table class="table compact small">
        <thead><tr><th>Country</th><th>Military power (ours = 1)</th><th>Hostility towards us</th><th>How well we see them</th><th>Assessed</th><th>Last year's estimate, checked</th></tr></thead>
        <tbody>{foreign.map((t) => {
          const e = estimateOf(w, n, t);
          const [lo, hi] = rangeOf(w, n, t, 'mil');
          const h = believed(w, n, t, 'hostile');
          const rv = lastReview(t);
          return (
            <tr><td><NationChip w={w} id={t.id} /></td>
              <td><b>{x(believed(w, n, t, 'mil'))}</b> <small class="muted">({x(lo)}–{x(hi)})</small></td>
              <td class={h > 40 ? 'bad' : h > 10 ? 'warn' : 'good'}>{Math.round(h)} <small class="muted">±{Math.round(e.sd.hostile)}</small></td>
              <td><Bar v={e.quality * 100} max={100} color="#5b8def" label={`${Math.round(e.quality * 100)}%`} /></td>
              <td class="muted">{fmtDay(e.t)}</td>
              <td class="small">{rv ? `power ${Math.round((rv.est.mil / Math.max(1, rv.truth.mil) - 1) * 100)}% off; hostility ${Math.round(rv.est.hostile - rv.truth.hostile)} points off` : '—'}</td></tr>
          );
        })}</tbody>
      </table></div>
      <Help>Governments act on what they believe, not on the truth. Each estimate comes with a range that depends on how well the service can see the country: its network there, its signals, imagery, open-source and analysis directorates, how open the country is, and how good its counter-intelligence is. Estimates carry misperceptions that correct themselves only slowly, and hawkish leaders read more menace into what they cannot see. Decisions about war, crises and alliances use these estimates, so surprise attacks and miscalculations happen. Each January the service's estimates are checked against the truth ({MEASURES.map((k) => MEASURE_LABEL[k].toLowerCase()).join(', ')}).</Help>
    </Panel>
  );
}

function Sources({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const agents = agentsOf(w, n.id);
  const defections = (w.defections ?? []).filter((d) => d.from === n.id || d.to === n.id).slice(-8).reverse();
  return (
    <Panel title="🗝️ Sources">
      {agents.length ? <table class="table compact small"><tbody>{agents.map((c) => (
        <tr><td><CitLink w={w} id={c.id} /></td><td><NationChip w={w} id={c.nation} /></td><td>{placementOf(w, c).label}</td><td class="muted">{MOTIVE_LABEL[c.sec.motive ?? 'money']}</td></tr>
      ))}</tbody></table> : <Empty>No agents in place. Recruit them with "Recruit an asset"; officials see far more than ordinary citizens.</Empty>}
      <p class="small">Diplomatic cover: {w.nations.filter((t) => t.id !== n.id && coverFactor(w, n, t) < 1).map((t) => t.name).join(', ') || 'our embassies are open everywhere'}{w.nations.some((t) => t.id !== n.id && coverFactor(w, n, t) < 1) ? ' (no embassy cover: networks grow slowly)' : ''}.</p>
      {defections.length > 0 && <><h4>Defections</h4><ul class="small">{defections.map((d) => <li>{fmtDay(d.t)}: {w.citizens[d.cit]?.name ?? 'someone'}, {d.what} of {w.nations[d.from].name}, to {w.nations[d.to].name}</li>)}</ul></>}
      <Help>Agents work for money, conviction, coercion or vanity. Convinced agents are steady; mercenaries leave when the money stops; coerced ones may confess; vain ones drift away. What an agent sees depends on where they sit: a minister or an intelligence officer is worth far more than a clerk, and agents in place see past the other side's counter-intelligence. Officials of failing governments sometimes defect to a rival, carrying what they know. Embassies give intelligence stations cover: networks grow slowly where diplomats were expelled or there is war.</Help>
    </Panel>
  );
}
