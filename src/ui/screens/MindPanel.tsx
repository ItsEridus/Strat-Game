// Mind and mood (2.6): the player's mental health, grief, therapy and the people they can talk to;
// and a country's mental health (prevalence, care, stigma and its government's programme).
import type { Citizen, Id, World } from '../../sim/types';
import { ActBtn, Empty, Help, Panel } from '../common';
import { fmtDate } from '../../engine/calendar';
import { fmtAmt } from '../../engine/money';
import { player } from '../../sim/query';
import { CONDITIONS, clinicCheck, treated, visitClinic, visitCost } from '../../sim/health';
import {
  LOSS_LABEL, SEVERITY, confidants, griefOf, griefStage, mentalConditions, mentalHealthStats, nationMH, programmeCheck, setProgramme,
  startTherapy, stigmaLabel, stopTherapy, talkCheck, talkToSomeone, therapyCheck, therapyOptions,
} from '../../sim/mentalHealth';

export function MindPanel({ w, p }: { w: World; p: Citizen }) {
  const conds = mentalConditions(p);
  const losses = (p.mh?.losses ?? []).slice().reverse();
  const t = p.mh?.therapy;
  const opts = therapyOptions(w, p);
  const v = visitCost(w, p);
  const m = nationMH(w.nations[p.nation]);
  const who = confidants(w, p)[0];
  const grief = griefOf(w, p);
  return (
    <div>
      {conds.length ? (
        <table class="table compact small"><tbody>{conds.map((x) => (
          <tr>
            <td>{CONDITIONS[x.key].icon} {CONDITIONS[x.key].label}</td>
            <td>{SEVERITY[x.sev]}</td>
            <td class="muted">since {fmtDate(x.since, 'dayMonth')}{x.until ? `, until about ${fmtDate(x.until, 'dayMonth')}` : ''}</td>
            <td class={treated(w, x) ? 'good' : 'bad'}>{treated(w, x) ? `medication until ${fmtDate(x.treatedUntil!, 'dayMonth')}` : 'no medication'}</td>
          </tr>
        ))}</tbody></table>
      ) : <p class="small muted">No depression, anxiety or burnout. Stress {Math.round(p.life?.stress ?? 0)}.</p>}
      {losses.length > 0 && <>
        <h4>Grief{grief >= 1 ? ` (weighing ${Math.round(grief)})` : ''}</h4>
        <ul class="small">{losses.map((l) => <li>🕯️ {l.name}, {LOSS_LABEL[l.who]} (died {fmtDate(l.t, 'medium')}): {griefStage(w, l)}</li>)}</ul>
      </>}
      {t && <p class="small">🛋️ {t.route === 'public' ? 'Public' : 'Private'} talking therapy: {w.time < t.start ? `on the waiting list; first session about ${fmtDate(t.start, 'dayMonth')}` : `session ${t.sessions} of ${t.of}`}{t.price ? ` · ${fmtAmt(w.nations[t.nation].cur, t.price)} a session` : ' · free'}.</p>}
      <div class="row">
        <ActBtn small why={talkCheck(w, p)} run={(w) => talkToSomeone(w)}>💬 Talk to {who ? who.name.split(' ')[0] : 'someone'}</ActBtn>
        {t ? <ActBtn small kind="ghost" confirm="Stop going to therapy?" run={(w) => stopTherapy(w)}>Stop therapy</ActBtn>
          : opts.map((o) => <ActBtn small why={therapyCheck(w, p, o.route)} run={(w) => startTherapy(w, undefined, o.route)}>🛋️ {o.route === 'public' ? `Public therapy (${o.weeks} week wait, ${o.price ? fmtAmt(o.code, o.price) : 'free'})` : `Private therapy (${fmtAmt(o.code, o.price)} a session)`}</ActBtn>)}
        {conds.length > 0 && <ActBtn small why={clinicCheck(w, p)} run={(w) => visitClinic(w)}>🏥 See a doctor ({v.patient ? fmtAmt(v.code, v.patient) : 'free'})</ActBtn>}
      </div>
      <Help>Depression, anxiety and burnout come from stress, loneliness, losing work, grief, poor health and your own temperament, and each episode makes the next more likely. Medication from a doctor, a course of therapy and the support of people close to you all help them lift; untreated depression under heavy stress gets worse. Grief eases over months and comes back on anniversaries. In {w.nations[p.nation].name}, about {Math.round(m.access * 100)}% of people who need care get it, and stigma is {stigmaLabel(m.stigma)}: not everyone you confide in will understand.</Help>
    </div>
  );
}

export function MentalHealthPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const p = player(w);
  const m = nationMH(n);
  const s = mentalHealthStats(w, id);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <Panel title="🧠 Mental health">
      {s.adults ? <table class="table compact small"><tbody>
        <tr><td>Adults with depression</td><td>{pct(s.depression)}</td></tr>
        <tr><td>Adults with anxiety</td><td>{pct(s.anxiety)}</td></tr>
        <tr><td>Workers burnt out</td><td>{pct(s.burnout)}</td></tr>
        <tr><td>Of those struggling, in care</td><td>{Math.round(s.treated * 100)}%</td></tr>
        <tr><td>Access to care</td><td>{Math.round(m.access * 100)}% of those who need it</td></tr>
        <tr><td>Stigma</td><td>{stigmaLabel(m.stigma)} ({Math.round(m.stigma * 100)})</td></tr>
        <tr><td>National programme</td><td>{m.programme != null ? `since ${fmtDate(m.programme, 'medium')}` : 'none'}</td></tr>
      </tbody></table> : <Empty>No figures.</Empty>}
      {n.president === p.id && <ActBtn small why={programmeCheck(w, n)} run={(w) => setProgramme(w, m.programme == null)}>{m.programme == null ? '🧠 Launch a mental-health programme' : 'End the mental-health programme'}</ActBtn>}
      <Help>Figures are for the simulated people. Access starts from the World Mental Health surveys (about half of those in need get care in rich countries, under one in ten in India) and grows slowly; stigma, which keeps people (men most of all) from seeking help, fades over the decades. A national programme (about 0.4% of revenue) halves waiting lists for talking therapy and speeds both.</Help>
    </Panel>
  );
}
