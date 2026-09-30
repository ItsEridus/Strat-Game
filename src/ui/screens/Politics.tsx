import { useState } from 'preact/hooks';
import type { Election, Ideology, World } from '../../sim/types';
import { ActBtn, CitLink, Empty, NationChip, Panel, Select, Help, Tabs } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import {
  castVote, foundParty, foundPartyCheck, joinParty, joinPartyCheck, leaveParty, partiesOf, registerCandidate, registerCheck,
  seekNomination, setNominee, setPartyList, voteCheck,
} from '../../sim/politics';
import { IDEOLOGIES, IDEOLOGY_LIST } from '../../data/ideologies';
import { B } from '../../data/balance';
import { fmtClock, fmtWhen } from '../../engine/clock';

export function Politics({ w }: { w: World }) {
  const p = player(w);
  const nid = store.sel.polNation ?? p.nation;
  const n = w.nations[nid];
  const tab = store.sel.polTab ?? 'elections';
  const parties = partiesOf(w, nid).sort((a, b) => b.support - a.support);
  const myParty = p.party != null ? w.parties[p.party] : null;
  const upcoming = Object.values(w.elections).filter((e) => !e.done && e.nation === nid && (e.kind !== 'party' || e.party === p.party)).sort((a, b) => a.at - b.at);
  const past = Object.values(w.elections).filter((e) => e.done && e.nation === nid && e.result && (e.kind !== 'party' || e.party === p.party)).sort((a, b) => b.at - a.at).slice(0, 8);
  return (
    <div class="grid">
      <Panel title={<span>Parties & elections — <NationChip w={w} id={nid} /></span>} class="wide" right={
        <>
          <Select value={nid} options={w.nations.map((x) => [x.id, x.name])} onChange={(v) => store.go('politics', { polNation: v })} />
          <Tabs tabs={[['elections', 'Elections'], ['parties', 'Parties'], ['mine', 'My party']]} value={tab} onChange={(t) => store.go('politics', { polTab: t })} />
        </>
      }>
        <Help>Elections run on the calendar (president day {B.politics.days.president}, party leaders day {B.politics.days.party}, congress day {B.politics.days.congress}). Voters weigh ideology, candidates’ influence, party support, their relationship with candidates, and — for the governing side — approval ({Math.round(n.approval)}%), living standards and war performance.</Help>
      </Panel>
      {tab === 'elections' && (
        <>
          <Panel title="Upcoming">
            {upcoming.length ? upcoming.map((e) => <ElectionCard w={w} e={e} />) : <Empty>No elections within the next week.</Empty>}
          </Panel>
          <Panel title="Results">
            {past.length ? past.map((e) => <ResultCard w={w} e={e} />) : <Empty>No results yet.</Empty>}
          </Panel>
        </>
      )}
      {tab === 'parties' && (
        <Panel title="Parties" class="wide">
          <table class="table">
            <thead><tr><th>Party</th><th>Ideology</th><th>Leader</th><th>Members</th><th>Support</th><th>Seats</th><th /></tr></thead>
            <tbody>{parties.map((pt) => (
              <tr>
                <td><i class="dot" style={{ background: pt.color }} /> <b>{pt.name}</b></td>
                <td title={IDEOLOGIES[pt.ideo].desc}>{IDEOLOGIES[pt.ideo].name}</td>
                <td><CitLink w={w} id={pt.leader} /></td>
                <td>{pt.members.length}</td><td>{Math.round(pt.support)}%</td><td>{n.seats[pt.id] ?? 0}</td>
                <td>{nid === p.nation && (p.party === pt.id ? 'member' : <ActBtn small why={joinPartyCheck(w, p, pt.id)} run={(w) => joinParty(w, p, pt.id)}>Join</ActBtn>)}</td>
              </tr>
            ))}</tbody>
          </table>
          {nid === p.nation && <FoundParty w={w} />}
        </Panel>
      )}
      {tab === 'mine' && (myParty ? <MyParty w={w} /> : <Panel title="My party"><Empty>You are not in a party. Join one on the Parties tab (level {B.politics.partyLevel}+).</Empty></Panel>)}
    </div>
  );
}

function ElectionCard({ w, e }: { w: World; e: Election }) {
  const p = player(w);
  const n = w.nations[e.nation];
  const title = e.kind === 'president' ? `${n.leader} election` : e.kind === 'congress' ? `${n.legislature} election` : `Party leader: ${w.parties[e.party!]?.name}`;
  const regOpen = w.time < e.regClose;
  const choices: [number, string][] = e.kind === 'congress'
    ? partiesOf(w, e.nation).map((pt) => [pt.id, pt.name])
    : e.candidates.map((id) => [id, `${w.citizens[id]?.name} (${w.parties[w.citizens[id]?.party ?? -1]?.name ?? 'independent'})`]);
  const [choice, setChoice] = useState<number>(e.playerVote ?? choices[0]?.[0] ?? -1);
  return (
    <div class="card">
      <h4>{title}</h4>
      <p class="small">{fmtClock(w, e.at)} ({fmtWhen(w, e.at)}) · registration {regOpen ? `closes ${fmtWhen(w, e.regClose)}` : 'closed'}</p>
      {e.kind !== 'congress' && <p class="small">Candidates: {e.candidates.length ? e.candidates.map((id) => w.citizens[id]?.name).join(', ') : 'announced when registration closes'}</p>}
      {e.kind === 'congress' && <p class="small">{e.candidates.length} registered list candidates. Seats: {n.congressSize}, allocated by D'Hondt.</p>}
      {e.kind !== 'president' && <ActBtn small why={registerCheck(w, p, e)} run={(w) => registerCandidate(w, p, e.id)}>{e.kind === 'congress' ? 'Register on my party list' : 'Run for party leader'}</ActBtn>}
      {e.kind === 'president' && p.party != null && <ActBtn small why={!regOpen ? 'Registration has closed.' : null} run={(w) => seekNomination(w, p)}>Seek my party’s nomination</ActBtn>}
      {choices.length > 0 && (
        <div class="row">
          <Select value={choice} options={choices} onChange={setChoice} />
          <ActBtn small why={voteCheck(w, p, e)} run={(w) => castVote(w, p, e.id, choice)}>{e.playerVote != null ? 'Change vote' : 'Vote'}</ActBtn>
          {e.playerVote != null && <small class="good">✓ voted</small>}
        </div>
      )}
    </div>
  );
}

function ResultCard({ w, e }: { w: World; e: Election }) {
  const r = e.result!;
  const total = r.tallies.reduce((s, t) => s + t.votes, 0) || 1;
  return (
    <details class="card" open={e === Object.values(w.elections).filter((x) => x.done && x.nation === e.nation).sort((a, b) => b.at - a.at)[0]}>
      <summary><b>{e.kind === 'president' ? w.nations[e.nation].leader : e.kind === 'congress' ? w.nations[e.nation].legislature : 'Party leader'}</b> · day {Math.floor(e.at / 1440)} · turnout {r.turnout}/{r.electorate}</summary>
      <table class="table compact"><tbody>
        {r.tallies.map((t) => (
          <tr><td>{e.kind === 'congress' ? w.parties[t.cand]?.name ?? 'dissolved party' : <CitLink w={w} id={t.cand} />}</td>
            <td class="num">{t.votes.toLocaleString()}</td><td class="num">{Math.round((t.votes / total) * 100)}%</td>
            {r.seats && <td class="num">{r.seats[t.cand] ?? 0} seats</td>}</tr>
        ))}
      </tbody></table>
      {r.explain.map((x) => <p class="small">{x}</p>)}
    </details>
  );
}

function FoundParty({ w }: { w: World }) {
  const p = player(w);
  const [name, setName] = useState('');
  const [ideo, setIdeo] = useState<Ideology>('capitalism');
  return (
    <div class="form row">
      <b>Found a party</b>
      <input placeholder="Party name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      <Select value={ideo} options={IDEOLOGY_LIST.map((i) => [i, IDEOLOGIES[i].name])} onChange={setIdeo} />
      <ActBtn why={foundPartyCheck(w, p) ?? (!name.trim() ? 'Choose a name.' : null)} run={(w) => foundParty(w, p, ideo, name)}>Found ({B.politics.partyFoundCost} gold)</ActBtn>
    </div>
  );
}

function MyParty({ w }: { w: World }) {
  const p = player(w);
  const pt = w.parties[p.party!];
  const n = w.nations[pt.nation];
  const leader = pt.leader === p.id;
  const [list, setList] = useState<number[]>(pt.list.length ? pt.list : pt.members);
  const others = partiesOf(w, pt.nation).filter((x) => x.id !== pt.id);
  const [nominee, setNom] = useState<number>(pt.nominee ?? -1);
  const [coal, setCoal] = useState<number>(pt.coalition ?? others[0]?.id ?? -1);
  const move = (i: number, d: number) => { const l = list.slice(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setList(l); };
  return (
    <>
      <Panel title={pt.name}>
        <p>{IDEOLOGIES[pt.ideo].name} — {IDEOLOGIES[pt.ideo].desc}</p>
        <p>Leader <CitLink w={w} id={pt.leader} /> · {pt.members.length} members · support {Math.round(pt.support)}% · {n.seats[pt.id] ?? 0} seats</p>
        <p>Presidential nominee: {pt.nominee != null ? <CitLink w={w} id={pt.nominee} /> : pt.coalition != null ? `backing ${w.parties[pt.coalition]?.name}` : 'none'}</p>
        <ActBtn kind="danger" run={(w) => leaveParty(w, p)} confirm="Leave your party?">Leave party</ActBtn>
        {!leader && <ActBtn run={(w) => seekNomination(w, p)}>Seek presidential nomination</ActBtn>}
      </Panel>
      <Panel title={leader ? 'Leader tools: congress list' : 'Congress priority list'}>
        <Help>Seats are filled from the top of this list. {leader ? 'As leader you set the order.' : 'The leader ranks members by influence and their opinion of them.'}</Help>
        <ol class="small">{list.map((id, i) => (
          <li><CitLink w={w} id={id} /> <span class="muted">influence {Math.round(w.citizens[id]?.influence ?? 0)}</span>
            {leader && <> <button class="btn sm ghost" onClick={() => move(i, -1)}>↑</button><button class="btn sm ghost" onClick={() => move(i, 1)}>↓</button></>}</li>
        ))}</ol>
        {leader && <ActBtn run={(w) => setPartyList(w, p, list)}>Save list</ActBtn>}
        {leader && (
          <div class="form">
            <label>Nominee <Select value={nominee} options={[[-1, '— none —'], ...pt.members.map((id) => [id, w.citizens[id].name] as [number, string])]} onChange={setNom} /></label>
            {nominee === -1 && <label>Back coalition partner <Select value={coal} options={others.map((x) => [x.id, x.name])} onChange={setCoal} /></label>}
            <ActBtn run={(w) => setNominee(w, p, nominee === -1 ? null : nominee, nominee === -1 ? coal : null)}>Set</ActBtn>
          </div>
        )}
      </Panel>
    </>
  );
}
