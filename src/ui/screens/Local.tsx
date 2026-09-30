// Neighbourhood: the place you are in right now — its people, what they are
// doing this hour, what worries them, its businesses and its news — and the
// things you can do here in person: talk, canvass, hold a rally.
import { ageOf } from '../../sim/growth';
import { useState } from 'preact/hooks';
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Amt, CitLink, Empty, Help, Panel, RegionLink, Select } from '../common';
import { Avatar } from '../Avatar';
import { store } from '../store';
import { controller, player } from '../../sim/query';
import { presentIn, residents, companiesIn } from '../../sim/census';
import { DOING_INFO, activityCounts, nowDoing } from '../../sim/life';
import { ISSUES, ISSUE_INFO, attitude, canvass, canvassCheck, holdRally, localIssues, playerCandidacy, pledgeOf, rallyCheck, rallyCost, startTalk, talkCheck, type Issue } from '../../sim/interact';
import { govTemplate } from '../../sim/stategov';
import { IDEOLOGIES } from '../../data/ideologies';
import { INDUSTRY_INFO } from '../../data/items';
import { dayOf, hourOf } from '../../engine/clock';
import { monthOf } from '../../sim/dynamics';

type Filter = 'here' | 'residents' | 'friends' | 'pledged';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function timeOfDay(h: number) { return h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night'; }

export function Local({ w }: { w: World }) {
  const p = player(w);
  const r = w.regions[p.loc];
  const nat = controller(r);
  const n = w.nations[nat];
  const s = w.govs[r.id];
  const tpl = govTemplate(w, r.id);
  const [filter, setFilter] = useState<Filter>('here');
  const [page, setPage] = useState(0);
  const [issue, setIssue] = useState<Issue>(localIssues(w, r.id)[0].issue);
  const issues = localIssues(w, r.id);
  const counts = activityCounts(w, r.id);
  const pop = residents(w, r.id).filter((c) => !c.player);
  const mood = pop.length ? pop.reduce((t, c) => t + c.mood, 0) / pop.length : 0;
  const cand = playerCandidacy(w);
  const pool: Citizen[] = (filter === 'here' ? [...presentIn(w, r.id)] : filter === 'residents' ? [...residents(w, r.id)] : filter === 'friends' ? [...presentIn(w, r.id)].filter((c) => (c.rel[p.id] ?? 0) >= 20) : [...residents(w, r.id)].filter((c) => pledgeOf(w, c) === p.id))
    .filter((c) => !c.player)
    .sort((a, b) => (b.rel[p.id] ?? 0) - (a.rel[p.id] ?? 0) || b.influence - a.influence || a.id - b.id);
  const per = 18;
  const shown = pool.slice(page * per, page * per + per);
  const cos = companiesIn(w, r.id).slice().sort((a, b) => (b.offer && b.workers.length < b.offer.slots ? 1 : 0) - (a.offer && a.workers.length < a.offer.slots ? 1 : 0) || b.workers.length - a.workers.length);
  const news = (r.news ?? []).slice().reverse();
  const h = hourOf(w.time);
  return (
    <div class="grid local">
      <section class="panel wide local-hero">
        <div>
          <h2>{r.name}</h2>
          <p class="muted">{timeOfDay(h)} · {MONTHS[(monthOf(w) - 1) % 12]} · {n.name}{r.occ ? ` (occupied by ${w.nations[r.occ.nation].name})` : ''}
            {s?.head.name ? <> · {tpl?.title} {s.head.cit != null ? <CitLink w={w} id={s.head.cit} /> : s.head.name} ({IDEOLOGIES[s.head.ideo].name})</> : null}</p>
          <p>{pop.length.toLocaleString()} citizens live here among {r.pop.toLocaleString()} residents. The mood is <b class={mood > 0.15 ? 'good' : mood < -0.15 ? 'bad' : ''}>{mood > 0.3 ? 'upbeat' : mood > 0.1 ? 'content' : mood > -0.1 ? 'uneasy' : 'angry'}</b>.</p>
          <div class="doing-row">{(Object.keys(DOING_INFO) as (keyof typeof DOING_INFO)[]).filter((k) => counts[k] > 0).map((k) => <span class="chip">{DOING_INFO[k].icon} {counts[k]} {DOING_INFO[k].label}</span>)}</div>
        </div>
        <div class="hero-issues">
          <h4>What people here worry about</h4>
          {issues.slice(0, 4).map((x) => (
            <div class="issue"><span>{ISSUE_INFO[x.issue].icon} {ISSUE_INFO[x.issue].name}</span><div class="bar"><i style={{ width: `${Math.round(Math.min(1, x.severity) * 100)}%`, background: x.severity > 0.6 ? 'var(--bad)' : x.severity > 0.35 ? 'var(--warn)' : 'var(--good)' }} /></div><small class="muted">{x.why}</small></div>
          ))}
        </div>
      </section>

      <Panel title="📣 Win people over" class="wide">
        <div class="row">
          <ActBtn kind="primary" why={canvassCheck(w, p)} run={(w) => canvass(w)}>🚪 Canvass door to door (−15⚡)</ActBtn>
          <span class="row small">Hold a rally on <Select value={issue} options={ISSUES.map((i) => [i, `${ISSUE_INFO[i].icon} ${ISSUE_INFO[i].name}`])} onChange={setIssue} />
            <ActBtn why={rallyCheck(w, p, issue)} run={(w) => holdRally(w, issue)}>Rally (−30⚡, <Amt asset={n.cur} v={rallyCost(w, r.id)} />)</ActBtn></span>
        </div>
        <Help>{cand ? `You are running for ${cand.label}. ` : ''}Residents stand for their region's electorate: every one you win over shifts real votes (in state elections half the result follows what the residents decide). Rallies work best on the issue people here care about most; canvassing meets people one by one and learns what matters to them. Promises of support last 30 days.</Help>
      </Panel>

      <Panel title={`👥 People (${pool.length})`} class="wide" right={<span class="row small">{(['here', 'residents', 'friends', 'pledged'] as Filter[]).map((f) => <button class={`btn sm ${filter === f ? 'primary' : 'ghost'}`} onClick={() => { setFilter(f); setPage(0); }}>{{ here: 'Here now', residents: 'Residents', friends: 'Friends', pledged: 'Pledged to you' }[f]}</button>)}</span>}>
        {shown.length ? <div class="people-grid">{shown.map((c) => <PersonCard w={w} c={c} />)}</div> : <Empty>{filter === 'pledged' ? 'Nobody has promised you their vote here yet.' : 'Nobody here.'}</Empty>}
        {pool.length > per && <div class="row small"><button class="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Prev</button> {page + 1} / {Math.ceil(pool.length / per)} <button class="btn sm" disabled={(page + 1) * per >= pool.length} onClick={() => setPage(page + 1)}>Next ›</button></div>}
      </Panel>

      <Panel title={`🏪 Local businesses (${cos.length})`}>
        {cos.length ? <table class="table compact small"><tbody>{cos.slice(0, 12).map((co) => {
          const open = co.offer && co.workers.length < co.offer.slots;
          return <tr><td>{INDUSTRY_INFO[co.industry].icon} {co.name} <small class="muted">Q{co.q}</small><br /><small class="muted">{co.owner.k === 'cit' ? <CitLink w={w} id={co.owner.id} /> : co.owner.k === 'nat' ? 'state-owned' : 'holding'} · {co.workers.length} staff</small></td>
            <td>{open ? <span class="good">hiring · <Amt asset={n.cur} v={co.offer!.wage} /></span> : <span class="muted">full</span>}</td></tr>;
        })}</tbody></table> : <Empty>No businesses here yet — a gap in the market?</Empty>}
        <div class="row"><button class="btn sm" onClick={() => store.go('jobs')}>Find work</button><button class="btn sm" onClick={() => store.go('companies')}>Start a business</button></div>
      </Panel>

      <Panel title="📰 Local news">
        {news.length ? <ul class="news small">{news.map((x) => <li><small class="muted">day {dayOf(x.t)}</small> {x.text}</li>)}</ul> : <Empty>A quiet place. Nothing has made the local paper lately.</Empty>}
        <div class="row small">Elsewhere: {w.regions[r.id].links.slice(0, 6).map((l) => <RegionLink w={w} id={l} />).reduce((a: any[], x, i) => (i ? [...a, ', ', x] : [x]), [])}</div>
      </Panel>
    </div>
  );
}

function PersonCard({ w, c }: { w: World; c: Citizen }) {
  const p = player(w);
  const rel = Math.round(c.rel[p.id] ?? 0);
  const d = nowDoing(w, c);
  const issue = c.flags.toldIssue != null ? ISSUES[c.flags.toldIssue] : null;
  const pledged = pledgeOf(w, c) === p.id;
  const job = c.job != null ? w.companies[c.job] : null;
  return (
    <div class={`person ${p.sec.rivals.includes(c.id) ? 'rival' : rel >= 30 ? 'friend' : ''}`}>
      <Avatar c={c} />
      <div class="person-body">
        <b class="link" onClick={() => store.go('citizen', { citizen: c.id })}>{c.name}</b>
        <small class="muted">{c.persona} · {ageOf(w, c)}{job ? ` · ${job.name}` : ''}</small>
        <small>{DOING_INFO[d].icon} {DOING_INFO[d].label}{c.home !== c.loc ? ` · visiting from ${w.regions[c.home].name}` : ''}</small>
        <small><span class={rel >= 10 ? 'good' : rel <= -10 ? 'bad' : 'muted'}>{attitude(rel)}</span>{issue ? <> · cares about {ISSUE_INFO[issue].icon}</> : null}{pledged ? <> · <span class="good">🗳️ your vote</span></> : null}</small>
      </div>
      <ActBtn small why={talkCheck(w, p, c)} showWhy={false} run={(w) => startTalk(w, c.id)}>💬 Talk</ActBtn>
    </div>
  );
}

