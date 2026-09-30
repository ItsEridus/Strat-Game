import type { World } from '../../sim/types';
import { ActBtn, Amt, Empty, Grade, Panel, RegionLink, Help, CitLink } from '../common';
import { controller, companyCurrency, effEco, player } from '../../sim/query';
import { applyCheck, applyJob, netWage, publicWorksCheck, publicWorksShift, publicWorksWage, quitJob, shiftCheck, shiftPreview, workShift } from '../../sim/company';
import { INDUSTRY_INFO, itemName } from '../../data/items';
import { B } from '../../data/balance';

export function Jobs({ w }: { w: World }) {
  const p = player(w);
  const nat = controller(w.regions[p.loc]);
  const n = w.nations[nat];
  const job = p.job != null ? w.companies[p.job] : null;
  const offers = Object.values(w.companies)
    .filter((co) => co.offer && controller(w.regions[co.region]) === nat && !(co.owner.k === 'cit' && co.owner.id === p.id))
    .map((co) => ({ co, nw: netWage(w, co, p), why: applyCheck(w, p, co), open: co.offer!.slots - co.workers.length }))
    .sort((a, b) => (a.why ? 1 : 0) - (b.why ? 1 : 0) || b.nw.net - a.nw.net);
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
        ) : <Empty>You are unemployed. Pick an offer below, or take a public-works shift.</Empty>}
      </Panel>
      <Panel title="Public works (fallback)">
        <p>The state pays a low wage (<Amt asset={n.cur} v={publicWorksWage(w, nat)} />) from the treasury for civic labour. Shifts also help any national construction priority. One shift per day, shared with regular work.</p>
        <ActBtn why={publicWorksCheck(w, p)} run={(w) => publicWorksShift(w, p)}>Work public shift</ActBtn>
      </Panel>
      <Panel title={`Job market — ${n.name} (you are here)`} class="wide">
        <Help>Wages are paid by the employer from its funds; work tax goes to the treasury of the nation administering the region (80/20 split with the rightful owner in occupied regions). Minimum wage here: <Amt asset={n.cur} v={n.minWage} />. Offers are unavailable when the employer can’t fund wages.</Help>
        {offers.length ? (
          <table class="table">
            <thead><tr><th>Employer</th><th>Industry</th><th>Where</th><th>Owner</th><th class="num">Gross</th><th class="num">Net</th><th>Min skill</th><th>Open</th><th /></tr></thead>
            <tbody>
              {offers.map(({ co, nw, why, open }) => (
                <tr class={why ? 'dim' : ''}>
                  <td>{co.name}</td><td>{INDUSTRY_INFO[co.industry].icon} <Grade q={co.q} /></td><td><RegionLink w={w} id={co.region} /></td>
                  <td>{co.owner.k === 'cit' ? <CitLink w={w} id={co.owner.id} /> : co.owner.k === 'nat' ? 'State' : 'Holding'}</td>
                  <td class="num"><Amt asset={n.cur} v={nw.gross} /></td><td class="num"><b><Amt asset={n.cur} v={nw.net} /></b></td>
                  <td>{co.offer!.minEco}</td><td>{open > 0 ? open : 'full'}</td>
                  <td>{p.job === co.id ? 'current' : <ActBtn small why={why} run={(w) => applyJob(w, p, co.id)}>Apply</ActBtn>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No offers in {n.name} right now.</Empty>}
      </Panel>
    </div>
  );
}
