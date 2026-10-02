import { useState } from 'preact/hooks';
import type { Industry, World } from '../../sim/types';
import { ActBtn, Amt, Empty, Grade, Panel, RegionLink, Help, CitLink, Select } from '../common';
import { useSort } from '../sort';
import { controller, companyCurrency, effEco, player } from '../../sim/query';
import { applyCheck, applyJob, netWage, publicWorksCheck, publicWorksShift, publicWorksWage, quitJob, shiftCheck, shiftPreview, workShift } from '../../sim/company';
import { INDUSTRY_INFO, itemName } from '../../data/items';
import { B } from '../../data/balance';
import { SERVICES, SERVICE_KEYS, leavePost, maxGrade, postCheck, postTitle, postsIn, salary, serviceShift, serviceShiftCheck, staffOf, takePost } from '../../sim/services';

export function Jobs({ w }: { w: World }) {
  const p = player(w);
  const nat = controller(w.regions[p.loc]);
  const n = w.nations[nat];
  const job = p.job != null ? w.companies[p.job] : null;
  const offers = Object.values(w.companies)
    .filter((co) => co.offer && controller(w.regions[co.region]) === nat && !(co.owner.k === 'cit' && co.owner.id === p.id))
    .map((co) => ({ co, nw: netWage(w, co, p), why: applyCheck(w, p, co), open: co.offer!.slots - co.workers.length }))
    .sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0) || b.nw.net - a.nw.net);
  const [industry, setIndustry] = useState<Industry | 'all'>('all');
  const industries = [...new Set(offers.map((o) => o.co.industry))].sort((a, b) => INDUSTRY_INFO[a].name.localeCompare(INDUSTRY_INFO[b].name));
  const shown = industry === 'all' ? offers : offers.filter((o) => o.co.industry === industry);
  const ownerName = (o: (typeof offers)[number]) => (o.co.owner.k === 'cit' ? w.citizens[o.co.owner.id]?.name ?? '' : o.co.owner.k === 'nat' ? 'State' : 'Holding');
  const sort = useSort('jobs', shown, {
    employer: (o) => o.co.name, industry: (o) => INDUSTRY_INFO[o.co.industry].name, grade: (o) => o.co.q, where: (o) => w.regions[o.co.region].name,
    owner: ownerName, gross: (o) => o.nw.gross, net: (o) => o.nw.net, skill: { get: (o) => o.co.offer!.minEco, first: 'asc' }, open: (o) => o.open,
  }, { key: 'net', dir: 'desc' });
  return (
    <div class="grid">
      <Panel title="Your employment">
        {job ? (
          <>
            <p><b>{job.name}</b> — {INDUSTRY_INFO[job.industry].icon} {INDUSTRY_INFO[job.industry].name} (<Grade q={job.q} />) in <RegionLink w={w} id={job.region} /></p>
            {(() => {
              const nw = netWage(w, job, p);
              const pv = shiftPreview(w, job, p);
              const cur = companyCurrency(w, job);
              return (
                <ul class="small">
                  <li>Gross <Amt asset={cur} v={nw.gross} /> − work tax {nw.rate}% (<Amt asset={cur} v={nw.tax} />) = <b>net <Amt asset={cur} v={nw.net} /></b> per shift</li>
                  <li>Each shift produces ≈{pv.units.toFixed(1)} {itemName(pv.key)} and grows economic skill (now {effEco(w, p).toFixed(2)}).</li>
                </ul>
              );
            })()}
            <ActBtn kind="primary" why={shiftCheck(w, p)} run={(w) => workShift(w, p)}>Work shift (−{B.cost.work}⚡)</ActBtn>
            <ActBtn kind="danger" run={(w) => quitJob(w, p)} confirm="Resign from this job?">Resign</ActBtn>
          </>
        ) : p.post ? <p>You work in public service: <b>{postTitle(p.post)}</b> in <RegionLink w={w} id={p.post.region} />.</p> : <Empty>You are unemployed. Pick an offer below, take a public post, or a public-works shift.</Empty>}
      </Panel>
      <Panel title="Public service" class="wide">
        {p.post && (
          <div class="row wrap">
            <span>{SERVICES[p.post.kind].icon} <b>{postTitle(p.post)}</b> · <Amt asset={n.cur} v={salary(w, p.post.region, p.post.kind, p.post.grade)} /> a shift · {p.post.shifts} shifts at this grade{p.post.grade < Math.min(4, maxGrade(p, p.post.kind)) ? ` (next: ${SERVICES[p.post.kind].ladder[p.post.grade + 1].toLowerCase()} after about ${40 + p.post.grade * 60})` : p.post.grade < 4 ? ' (a higher qualification opens the next grade)' : ''}</span>
            <ActBtn kind="primary" why={serviceShiftCheck(w, p)} run={(w) => serviceShift(w, p)}>Work shift (−{B.cost.work}⚡)</ActBtn>
            <ActBtn kind="danger" confirm="Leave public service?" run={(w) => leavePost(w, p)}>Resign</ActBtn>
          </div>
        )}
        <table class="table compact">
          <thead><tr><th>Career</th><th>Where</th><th>Starting grade</th><th class="num">Pay a shift</th><th class="num">Posts</th><th /></tr></thead>
          <tbody>
            {SERVICE_KEYS.map((k) => {
              const s = SERVICES[k];
              const g = Math.max(0, Math.min(1, maxGrade(p, k)));
              return (
                <tr>
                  <td>{s.icon} {s.label} <small class="muted">· {s.ladder.join(' → ')}</small></td>
                  <td class="small">{w.regions[p.home].name} {s.place}</td>
                  <td class="small">{maxGrade(p, k) < 0 ? <span class="muted">not qualified</span> : s.ladder[g]}</td>
                  <td class="num"><Amt asset={w.nations[controller(w.regions[p.home])].cur} v={salary(w, p.home, k, g)} /></td>
                  <td class="num small">{staffOf(w, p.home, k).length}/{postsIn(w, p.home, k)}</td>
                  <td><ActBtn small why={postCheck(w, p, k)} run={(w) => takePost(w, k)}>Apply</ActBtn></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Help>Teachers, nurses, doctors, civil servants and engineers are paid a salary by the state. Each grade needs a qualification (see Education on the Life screen); promotions come with service and good work. Staffing makes schools and clinics better.</Help>
      </Panel>
      <Panel title="Public works (fallback)">
        <p>The state pays a low wage (<Amt asset={n.cur} v={publicWorksWage(w, nat)} />) from the treasury for civic labour. Shifts also help any national construction priority. One shift per day, shared with regular work.</p>
        <ActBtn why={publicWorksCheck(w, p)} run={(w) => publicWorksShift(w, p)}>Work public shift</ActBtn>
      </Panel>
      <Panel title={`Job market — ${n.name} (you are here)`} class="wide">
        <Help>Wages are paid by the employer from its funds; work tax goes to the treasury of the nation administering the region (80/20 split with the rightful owner in occupied regions). Minimum wage here: <Amt asset={n.cur} v={n.minWage} />. Offers are unavailable when the employer can’t fund wages.</Help>
        {offers.length > 0 && (
          <div class="table-tools">
            <label>Industry <Select value={industry} options={[['all', `All industries (${offers.length})`], ...industries.map((i) => [i, `${INDUSTRY_INFO[i].icon} ${INDUSTRY_INFO[i].name} (${offers.filter((o) => o.co.industry === i).length})`] as [Industry, string])]} onChange={setIndustry} /></label>
            <small class="muted">Click a column heading to sort.</small>
          </div>
        )}
        {shown.length ? (
          <table class="table">
            <thead><tr>{sort.th('employer', 'Employer')}{sort.th('industry', 'Industry')}{sort.th('grade', 'Grade')}{sort.th('where', 'Where')}{sort.th('owner', 'Owner')}{sort.th('gross', 'Gross', 'num')}{sort.th('net', 'Net', 'num')}{sort.th('skill', 'Min skill')}{sort.th('open', 'Open')}<th /></tr></thead>
            <tbody>
              {sort.rows.map(({ co, nw, why, open }) => (
                <tr class={why ? 'dim' : ''}>
                  <td>{co.name}</td><td>{INDUSTRY_INFO[co.industry].icon} {INDUSTRY_INFO[co.industry].name}</td><td><Grade q={co.q} /></td><td><RegionLink w={w} id={co.region} /></td>
                  <td>{co.owner.k === 'cit' ? <CitLink w={w} id={co.owner.id} /> : co.owner.k === 'nat' ? 'State' : 'Holding'}</td>
                  <td class="num"><Amt asset={n.cur} v={nw.gross} /></td><td class="num"><b><Amt asset={n.cur} v={nw.net} /></b></td>
                  <td>{co.offer!.minEco}</td><td>{open > 0 ? open : 'full'}</td>
                  <td>{p.job === co.id ? 'current' : <ActBtn small why={why} run={(w) => applyJob(w, p, co.id)}>Apply</ActBtn>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>{offers.length ? 'No offers in this industry right now.' : `No offers in ${n.name} right now.`}</Empty>}
      </Panel>
    </div>
  );
}
