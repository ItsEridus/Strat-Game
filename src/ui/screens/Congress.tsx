import { useState } from 'preact/hooks';
import type { Proposal, ProposalType, World } from '../../sim/types';
import { ActBtn, CitLink, Empty, NationChip, Num, Panel, Select, Help } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import { PROPOSAL_INFO, describe, eligibleVoters, propose, proposeCheck, voteCheck, voteProposal } from '../../sim/congress';
import { EXTRA_PROPOSALS } from '../../sim/congressExtra';
import { taxCeilings } from '../../sim/taxes';
import { B } from '../../data/balance';
import { c as cur } from '../../engine/money';
import { fmtWhen } from '../../engine/clock';
import { ProposalParams } from './ProposalParams';

export const proposalName = (t: string) => PROPOSAL_INFO[t]?.name ?? EXTRA_PROPOSALS[t]?.info.name ?? t;

export function Congress({ w }: { w: World }) {
  const p = player(w);
  const nid = store.sel.conNation ?? p.nation;
  const n = w.nations[nid];
  const open = Object.values(w.proposals).filter((x) => x.nation === nid && x.status === 'open').sort((a, b) => a.closes - b.closes);
  const closed = Object.values(w.proposals).filter((x) => x.nation === nid && x.status !== 'open').sort((a, b) => b.created - a.created).slice(0, 25);
  const member = eligibleVoters(n).includes(p.id);
  return (
    <div class="grid">
      <Panel title={<span>Congress — <NationChip w={w} id={nid} /></span>} class="wide" right={<Select value={nid} options={w.nations.map((x) => [x.id, x.name])} onChange={(v) => store.go('congress', { conNation: v })} />}>
        <Help>{n.deputies.length} deputies plus the president vote. Most laws close as soon as an absolute majority is reached; money printing, impeachment, new elections and war run the full {B.politics.voteHours} hours and pass on a majority of votes cast. Each deputy may author {B.politics.proposalsPerDeputy} proposals per mandate. {member ? 'You have a vote.' : 'You are not a member of congress.'}</Help>
      </Panel>
      <Panel title="Open proposals" class="wide">
        {open.length ? open.map((pr) => <ProposalCard w={w} pr={pr} />) : <Empty>Nothing on the floor.</Empty>}
      </Panel>
      {nid === p.nation && <Draft w={w} />}
      <Panel title="Recent decisions & voting records">
        {closed.length ? closed.map((pr) => (
          <details class="card">
            <summary>{pr.status === 'passed' ? '✅' : '❌'} {proposalName(pr.type)} <small class="muted">by {w.citizens[pr.author]?.name} · {fmtWhen(w, pr.created)}</small></summary>
            <p class="small">{pr.effect}</p>
            <VoteList w={w} pr={pr} />
          </details>
        )) : <Empty>No history yet.</Empty>}
      </Panel>
    </div>
  );
}

function VoteList({ w, pr }: { w: World; pr: Proposal }) {
  const yes = Object.entries(pr.votes).filter(([, v]) => v === 'y').map(([id]) => Number(id));
  const no = Object.entries(pr.votes).filter(([, v]) => v === 'n').map(([id]) => Number(id));
  return (
    <div class="small">
      <div><b class="good">Yes ({yes.length}):</b> {yes.map((id) => <><CitLink w={w} id={id} />{' '}</>)}</div>
      <div><b class="bad">No ({no.length}):</b> {no.map((id) => <><CitLink w={w} id={id} />{' '}</>)}</div>
    </div>
  );
}

function ProposalCard({ w, pr }: { w: World; pr: Proposal }) {
  const p = player(w);
  const n = w.nations[pr.nation];
  const elig = eligibleVoters(n).length;
  return (
    <div class="card">
      <h4>{proposalName(pr.type)} <small class="muted">by <CitLink w={w} id={pr.author} /> · closes {fmtWhen(w, pr.closes)}{pr.fullTerm ? ' (full term)' : ''}</small></h4>
      <p>{pr.effect}</p>
      {pr.cost > 0 && <p class="small warn">Treasury cost: {(pr.cost / 1000).toFixed(2)} gold</p>}
      <p class="small">{Object.values(pr.votes).length}/{elig} voted · majority needed {Math.floor(elig / 2) + 1}</p>
      <VoteList w={w} pr={pr} />
      <ActBtn small kind="primary" why={voteCheck(w, p, pr)} run={(w) => voteProposal(w, p, pr.id, true)}>Vote yes</ActBtn>
      <ActBtn small why={voteCheck(w, p, pr)} showWhy={false} run={(w) => voteProposal(w, p, pr.id, false)}>Vote no</ActBtn>
    </div>
  );
}

function Draft({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const types = [...Object.keys(PROPOSAL_INFO), ...Object.keys(EXTRA_PROPOSALS)] as ProposalType[];
  const [type, setType] = useState<ProposalType>('workTax');
  const [params, setParams] = useState<Record<string, any>>({ value: n.taxes.work });
  const ceil = taxCeilings(w, n);
  const d = describe(w, n, type, params);
  const why = proposeCheck(w, p, type, params);
  const change = (t: ProposalType) => {
    setType(t);
    const others = w.nations.filter((x) => x.id !== n.id);
    const defaults: Record<string, any> = { workTax: { value: n.taxes.work }, vat: { value: n.taxes.vat }, importTax: { value: n.taxes.import }, minWage: { value: n.minWage }, print: { amount: cur(1000) }, embargo: { target: others[0].id }, liftEmbargo: { target: n.embargoes[0] ?? others[0].id }, alliance: { target: others[0].id }, breakAlliance: { target: n.alliances[0] ?? others[0].id }, impeach: {}, newElection: {} };
    setParams(defaults[t] ?? EXTRA_PROPOSALS[t]?.aiOptions(w, n, p)[0]?.params ?? {});
  };
  return (
    <Panel title="Draft a proposal">
      <div class="form">
        <label>Type <Select value={type} options={types.map((t) => [t, proposalName(t)])} onChange={change} /></label>
        {['workTax', 'vat', 'importTax'].includes(type) && <label>Rate % <Num value={params.value ?? 0} onInput={(v) => setParams({ value: Math.round(v) })} /> <small class="muted">ceiling {Math.floor(ceil[type === 'workTax' ? 'work' : type === 'vat' ? 'vat' : 'import'])}%</small></label>}
        {type === 'minWage' && <label>Wage ({n.cur}) <Num value={(params.value ?? 0) / 100} step={0.5} onInput={(v) => setParams({ value: cur(v) })} /></label>}
        {type === 'print' && <label>Amount ({n.cur}) <Num value={(params.amount ?? 0) / 100} step={100} onInput={(v) => setParams({ amount: cur(v) })} /></label>}
        {['embargo', 'liftEmbargo', 'alliance', 'breakAlliance'].includes(type) && <label>Nation <Select value={params.target ?? 0} options={w.nations.filter((x) => x.id !== n.id).map((x) => [x.id, x.name])} onChange={(v) => setParams({ target: v })} /></label>}
        {EXTRA_PROPOSALS[type] && <ProposalParams w={w} type={type} params={params} setParams={setParams} />}
      </div>
      <p class="small"><b>Expected effect:</b> {d.effect}</p>
      {d.cost > 0 && <p class="small warn">Treasury cost: {(d.cost / 1000).toFixed(2)} gold</p>}
      <p class="small muted">Implementation: immediately when passed. Proposals used this mandate: {n.propCount[p.id] ?? 0}/{B.politics.proposalsPerDeputy}.</p>
      <ActBtn kind="primary" why={why} run={(w) => propose(w, p, type, params)}>Submit to congress</ActBtn>
    </Panel>
  );
}
