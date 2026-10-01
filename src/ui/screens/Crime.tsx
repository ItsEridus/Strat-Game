// Law & Order: your standing with the law, street crime, organised crime,
// the police career and national police powers.
import { fmtDay } from '../../engine/calendar';
import { census } from '../../sim/census';
import { useState } from 'preact/hooks';
import type { World } from '../../sim/types';
import { ActBtn, Amt, Bar, CitLink, Empty, Help, Panel, RegionLink, Select } from '../common';
import { controller, jailed, player } from '../../sim/query';
import { nationPerm } from '../../sim/authority';
import { B } from '../../data/balance';
import {
  CRIMES, CRIME_NAME, PRANKS, SRANKS, SYND_JOBS, commitCrime, crimeCheck, crimeLabel, investigate, investigateCheck, jobCheck, joinPolice, joinPoliceCheck,
  joinSyndicate, joinSyndicateCheck, leavePolice, leaveSyndicate, orderRaid, patrol, patrolCheck, policeName, raidCheck, setPoliceFunding, syndicateJob,
} from '../../sim/crime';
import { escapeChance, escapeCheck, funding, hasLiveRecord, incarcerationRate, insideOf, justiceOf, occupancy, paroleChance, paroleCheck, paroleHearing, prisonClass, prisonClassCheck, prisonOf, prisonWork, prisonWorkCheck, spentAt, tryEscape } from '../../sim/prisons';

export function Crime({ w }: { w: World }) {
  const p = player(w);
  const r = w.regions[p.loc];
  const nat = controller(r);
  const mine = Object.values(w.cases).filter((k) => k.suspect === p.id).sort((a, b) => b.id - a.id);
  const synd = p.sec.syndicate != null ? w.syndicates[p.sec.syndicate] : null;
  const onTurf = Object.values(w.syndicates).filter((s) => s.turf.includes(p.loc));
  return (
    <div class="grid">
      <Panel title="⚖️ You and the law" class="wide">
        <div class="stats">
          <div class="stat"><small>Police attention (heat)</small><Bar v={p.sec.heat} max={100} color="#e0574f" label={`${Math.round(p.sec.heat)}`} /></div>
          <div class="stat"><small>Notoriety</small><b>{p.sec.notoriety.toFixed(0)}</b></div>
          <div class="stat"><small>Fame</small><b>{p.sec.fame.toFixed(0)}</b></div>
          <div class="stat"><small>Record</small><b>{p.sec.record.crimes} crimes · {p.sec.record.arrests} arrests · {p.sec.record.convictions} convictions</b></div>
          <div class="stat"><small>Status</small><b class={jailed(w, p) ? 'bad' : ''}>{jailed(w, p) ? `In prison until ${fmtDay(p.sec.jailUntil)}` : 'Free'}</b></div>
        </div>
        {mine.filter((k) => k.status === 'open').map((k) => (
          <div class="track"><span>🚨 {CRIME_NAME[k.kind]} investigation in {w.regions[k.region].name} ({w.nations[k.nation].name})</span><Bar v={k.evidence} max={100} color="#e39b3a" label={`evidence ${Math.round(k.evidence)}% (arrest at ${B.police.arrestAt}%)`} /></div>
        ))}
        {!mine.some((k) => k.status === 'open') && <p class="small muted">No open investigations against you.</p>}
        <Help>Crimes raise heat and notoriety. If someone sees you, police open a case; evidence grows with local policing and your heat. At {B.police.arrestAt}% you are arrested wherever that nation's police reach you, and tried: a lawyer helps; a bribe might work where police are weak. Heat falls {B.justice.heatDecay}/day. Convictions cost fines, prison time (no work, travel, training or fighting), office, and votes.</Help>
      </Panel>

      {jailed(w, p) && (() => {
        const ins = insideOf(p);
        return (
          <Panel title="🔒 Life inside" class="wide">
            <div class="stats">
              <div class="stat"><small>Release</small><b>{fmtDay(p.sec.jailUntil)}</b></div>
              <div class="stat"><small>Conduct</small><Bar v={ins.conduct} max={100} color="#5b8def" label={`${Math.round(ins.conduct)}`} /></div>
              <div class="stat"><small>Earned inside</small><b><Amt asset={w.nations[p.nation].cur} v={ins.earned} /></b></div>
              <div class="stat"><small>Parole chance</small><b>{Math.round(paroleChance(w, p) * 100)}%</b></div>
            </div>
            <div class="row wrap">
              <ActBtn kind="primary" why={prisonWorkCheck(w, p)} run={(w) => prisonWork(w, p)}>Work a shift</ActBtn>
              <ActBtn why={prisonClassCheck(w, p)} run={(w) => prisonClass(w, p)}>Go to class</ActBtn>
              <ActBtn why={paroleCheck(w, p)} run={(w) => paroleHearing(w, p)}>Apply for parole</ActBtn>
              <ActBtn kind="danger" why={escapeCheck(w, p)} confirm={`Try to escape? About a ${Math.round(escapeChance(w, p) * 100)}% chance; if caught, extra time and a ruined file.`} run={(w) => tryEscape(w, p)}>Try to escape</ActBtn>
            </div>
            <Help>Work and classes build conduct, which the parole board weighs with your record. The board can hear you after {Math.round(justiceOf(w.nations[p.nation]).parole * 100)}% of your sentence. Gangs prey on newcomers in crowded, run-down prisons; members of an organisation are protected.</Help>
          </Panel>
        );
      })()}

      {(() => {
        const n = w.nations[p.nation];
        const ps = prisonOf(w, n);
        const j = justiceOf(n);
        return (
          <Panel title={`🏛️ Prisons in ${n.name}`}>
            <table class="table compact"><tbody>
              <tr><td>Prisoners</td><td>{ps.inmates.toLocaleString()} · {Math.round(incarcerationRate(w, n))} per 100,000 people</td></tr>
              <tr><td>Places</td><td>{ps.places.toLocaleString()} · <span class={occupancy(ps) > 1.15 ? 'bad' : ''}>{Math.round(occupancy(ps) * 100)}% full</span></td></tr>
              <tr><td>Conditions</td><td><Bar v={ps.conditions} max={100} color={ps.conditions < 35 ? '#e0574f' : '#4caf7d'} label={`${Math.round(ps.conditions)}`} /></td></tr>
              <tr><td>Funding</td><td>{Math.round(funding(n) * 100)}% of the usual level</td></tr>
              <tr><td>Sentences</td><td>{j.sentence >= 1.2 ? 'harsh' : j.sentence <= 0.85 ? 'lenient' : 'typical'} (×{j.sentence}) · parole after {Math.round(j.parole * 100)}%</td></tr>
              <tr><td>Reoffending</td><td>about {Math.round(j.reoffend * 100)}% within two years</td></tr>
              <tr><td>Riots · escapes</td><td>{ps.riots} · {ps.escapes}</td></tr>
            </tbody></table>
            {hasLiveRecord(w, p) && <p class="small bad">Your conviction shows on background checks until {fmtDay(spentAt(w, p))}: state companies and the medicine, aerospace and electronics industries will not hire you.</p>}
            <Help>Incarceration follows each country's real rate (about 33 per 100,000 in Japan, over 500 in the United States) and moves with crime. The police budget builds places and keeps conditions decent; overcrowded, run-down prisons riot. Records are spent after {j.spentYears} years here.</Help>
          </Panel>
        );
      })()}

      <Panel title={`📍 ${r.name}: ${policeName(w, r.id)}`}>
        <table class="table compact"><tbody>
          <tr><td>Crime</td><td><Bar v={r.crime} max={100} color="#e0574f" label={`${Math.round(r.crime)} · ${crimeLabel(r.crime)}`} /></td></tr>
          <tr><td>Policing</td><td><Bar v={r.police} max={100} color="#5b8def" label={`${Math.round(r.police)}`} /></td></tr>
          <tr><td>Unrest</td><td><Bar v={r.unrest} max={100} color="#e39b3a" label={`${Math.round(r.unrest)}`} /></td></tr>
          <tr><td>Organised crime</td><td>{onTurf.length ? onTurf.map((s) => `${s.name} (${s.style})`).join(', ') : <span class="muted">none known</span>}</td></tr>
          <tr><td>Officers here</td><td>{census(w).all.filter((c) => c.sec.police === r.id).length}</td></tr>
        </tbody></table>
        <Help>Crime rises with unemployment, poverty, recession, city size, unrest and gangs, and falls with policing (state police budgets, national police funding, officers) and welfare. Above 50 it cuts local production.</Help>
      </Panel>

      <Panel title="🦹 Street crime">
        {(Object.keys(CRIMES) as (keyof typeof CRIMES)[]).map((k) => (
          <div class="track"><span><b>{CRIMES[k].name}</b><br /><small class="muted">{CRIMES[k].desc} −{CRIMES[k].energy}⚡ · heat +{CRIMES[k].heat}</small></span>
            <ActBtn small kind="danger" why={crimeCheck(w, p, k)} run={(w) => commitCrime(w, p, k)}>Do it</ActBtn></div>
        ))}
      </Panel>

      <Panel title="🎩 Organised crime">
        {synd ? (
          <>
            <p><b>{synd.name}</b> <small class="muted">({synd.style} · {w.nations[synd.nation].name})</small> — you are <b>{SRANKS[p.sec.srank]}</b>.</p>
            <p class="small">Strength {Math.round(synd.strength)} · {synd.members.length} members · turf: {synd.turf.map((t) => w.regions[t].name).join(', ')} · treasury <Amt asset={w.nations[synd.nation].cur} v={synd.wallet[w.nations[synd.nation].cur] ?? 0} /> · boss {synd.boss != null ? <CitLink w={w} id={synd.boss} /> : 'none'}{synd.feuds.length ? ` · at war with ${synd.feuds.map((f) => w.syndicates[f]?.name).join(', ')}` : ''}</p>
            {(Object.keys(SYND_JOBS) as (keyof typeof SYND_JOBS)[]).map((j) => (
              <div class="track"><span><b>{SYND_JOBS[j].name}</b> <small class="muted">({SRANKS[SYND_JOBS[j].rank]}+)</small><br /><small class="muted">{SYND_JOBS[j].desc} −{SYND_JOBS[j].energy}⚡ · heat +{SYND_JOBS[j].heat}</small></span>
                <ActBtn small kind="danger" why={jobCheck(w, p, j)} run={(w) => syndicateJob(w, p, j)}>Go</ActBtn></div>
            ))}
            <ActBtn small kind="ghost" confirm="Walk away from the organisation?" run={(w) => leaveSyndicate(w, p)}>Leave</ActBtn>
          </>
        ) : (
          <>
            <table class="table compact small"><tbody>
              {Object.values(w.syndicates).filter((s) => s.nation === p.nation || s.turf.includes(p.loc)).sort((a, b) => b.strength - a.strength).map((s) => (
                <tr><td><b>{s.name}</b><br /><small class="muted">{s.style} · strength {Math.round(s.strength)} · {s.turf.length} region{s.turf.length > 1 ? 's' : ''}{s.feuds.length ? ' · gang war' : ''}</small></td>
                  <td><ActBtn small why={joinSyndicateCheck(w, p, s.id)} showWhy={false} run={(w) => joinSyndicate(w, p, s.id)}>Approach</ActBtn></td></tr>
              ))}
            </tbody></table>
            <Help>Organisations skim their turf, extort businesses, recruit the jobless and desperate, expand into weakly policed regions, fight each other and get raided. Associates get jobs; results earn promotion up to {SRANKS[3]} — and the boss's chair when it falls empty.</Help>
          </>
        )}
      </Panel>

      <PolicePanel w={w} />

      {nationPerm(w, p.id, p.nation, 'police') && <InteriorPanel w={w} />}

      <Panel title="📰 Crime & justice news" class="wide">
        <ul class="small">{w.log.filter((e) => (e.type === 'crime' || e.type === 'justice') && (e.nation == null || e.nation === p.nation || e.nation === nat)).slice(-15).reverse().map((e) => <li>{fmtDay(e.t)}: {e.text}</li>)}</ul>
      </Panel>
    </div>
  );
}

function PolicePanel({ w }: { w: World }) {
  const p = player(w);
  if (p.sec.police == null) {
    return (
      <Panel title="👮 Police service">
        <p class="small">Serve in the {policeName(w, p.loc)}: patrol daily to cut crime and build cases, arrest suspects, rise from Officer to Chief. Paid from the police budget.</p>
        <ActBtn why={joinPoliceCheck(w, p)} run={(w) => joinPolice(w, p)}>Join the {policeName(w, p.loc)}</ActBtn>
      </Panel>
    );
  }
  const jur = w.regions[p.sec.police].owner;
  const cases = Object.values(w.cases).filter((k) => k.status === 'open' && w.regions[k.region].owner === jur && k.suspect !== p.id).sort((a, b) => b.evidence - a.evidence).slice(0, 10);
  const next = B.police.rankAt[p.sec.prank + 1];
  return (
    <Panel title={`👮 ${PRANKS[p.sec.prank]}, ${policeName(w, p.sec.police)}`}>
      <p class="small">{p.sec.collars} arrests{next != null ? ` · ${next - p.sec.collars} more for ${PRANKS[p.sec.prank + 1]}` : ''}.</p>
      <ActBtn kind="primary" why={patrolCheck(w, p)} run={(w) => patrol(w, p)}>Patrol (−{B.police.patrolEnergy}⚡)</ActBtn>
      <h4>Open cases in your jurisdiction</h4>
      {cases.length ? <table class="table compact small"><tbody>{cases.map((k) => (
        <tr><td>{CRIME_NAME[k.kind]}</td><td><RegionLink w={w} id={k.region} /></td><td>{p.sec.prank >= 2 ? <CitLink w={w} id={k.suspect} /> : <span class="muted">suspect withheld</span>}</td><td>{Math.round(k.evidence)}%</td>
          <td><ActBtn small why={investigateCheck(w, p, k.id)} showWhy={false} run={(w) => investigate(w, p, k.id)}>Investigate</ActBtn></td></tr>
      ))}</tbody></table> : <Empty>No open cases.</Empty>}
      <ActBtn small kind="ghost" confirm="Hand in your badge?" run={(w) => leavePolice(w, p)}>Resign</ActBtn>
    </Panel>
  );
}

function InteriorPanel({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const [share, setShare] = useState(Math.round(n.policeFunding * 100));
  const synds = Object.values(w.syndicates).filter((s) => s.nation === p.nation);
  const [target, setTarget] = useState(synds[0]?.id ?? -1);
  return (
    <Panel title="🏛️ National police powers">
      <div class="row small">National police funding
        <Select value={share} options={[0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15].map((x) => [x, `${x}% of revenue`])} onChange={setShare} />
        <ActBtn small run={(w) => setPoliceFunding(w, p.id, p.nation, share / 100)}>Set</ActBtn></div>
      {synds.length > 0 && <div class="row small">Raid
        <Select value={target} options={synds.map((s) => [s.id, `${s.name} (strength ${Math.round(s.strength)})`])} onChange={setTarget} />
        <ActBtn small why={raidCheck(w, p.id, target)} run={(w) => orderRaid(w, p.id, target)}>Order raid (100)</ActBtn></div>}
      <Help>Funding the {n.name} national police raises policing everywhere (and costs the treasury daily). Raids seize assets, arrest members and weaken organisations.</Help>
    </Panel>
  );
}
