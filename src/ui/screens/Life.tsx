// The life hub: one place for who you are, how you are, the people in your life,
// your money, your routine and what comes next.
import { fmtDate } from '../../engine/calendar';
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Bar, Btn, CitLink, Empty, Help, Panel, RegionLink, Stat } from '../common';
import { store } from '../store';
import { DAY, fmtDur } from '../../engine/clock';
import { c as cur, fmtAmt } from '../../engine/money';
import { player, maxEnergy } from '../../sim/query';
import { ageOf, calendarPace, nextBirthday, reputation } from '../../sim/growth';
import { STAGE_INFO, lifeOf, lifeStage, occupation, routineBudget, routineOf } from '../../sim/lifecycle';
import { familyTime, familyTimeCheck, rest, restCheck, wellbeingLabel } from '../../sim/wellbeing';
import { healthLabel } from '../../sim/population';
import { PET_KINDS, adoptCheck, adoptPet, careCheck, careForPet, dueText, expecting, petAge, petsOf, siblingsOf } from '../../sim/kinship';
import { HOBBIES, HOBBY_ENERGY, hobbyCheck, hobbyLevel, pursueHobby } from '../../sim/hobbies';
import { STATUS_LABEL, breakUp, familyOf, goOnDate, marry, partnerOf, propose, romanceCheck, tryForChild } from '../../sim/family';

export function Life({ w }: { w: World }) {
  const p = player(w);
  const L = lifeOf(p);
  const stage = STAGE_INFO[lifeStage(w, p)];
  const fam = familyOf(w, p);
  const partner = partnerOf(w, p);
  const age = ageOf(w, p);
  const bday = nextBirthday(w, p);
  const rep = reputation(p);
  return (
    <div class="grid life">
      <Panel title={`${stage.icon} ${p.name}`} class="wide hero" right={<Btn kind="primary" onClick={() => store.startAdvance(bday, `your ${age + 1}th birthday`)}>🎂 Advance to next birthday</Btn>}>
        <div class="stats">
          <Stat label="Age">{age}</Stat>
          <Stat label="Stage of life">{stage.label}</Stat>
          <Stat label="Lives in"><RegionLink w={w} id={p.home} /></Stat>
          <Stat label="Occupation">{occupation(w, p)}</Stat>
          <Stat label="Relationship">{STATUS_LABEL[fam.status]}{partner ? <> · <CitLink w={w} id={partner.id} /></> : null}</Stat>
          <Stat label="Reputation">{rep.icon} {rep.name}</Stat>
        </div>
        <p class="small muted">{fmtDate(w.time, 'long')} · {calendarPace(w) ? `born ${fmtDate(p.born, 'long')} · ` : ''}next birthday {calendarPace(w) ? `on ${fmtDate(bday, 'dayMonth')} (in ${fmtDur(bday - w.time)})` : `in ${fmtDur(bday - w.time)}`} · a time of {stage.can}.{calendarPace(w) ? '' : ` People age ${Math.round(365 / (w.settings.lifeYearDays ?? 365))} years per calendar year.`}</p>
      </Panel>

      <Panel title="How you are">
        <Gauge label="❤️ Health" v={p.health ?? 90} text={healthLabel(p.health ?? 90)} color="#e0605a" />
        <Gauge label="🙂 Happiness" v={L.happiness} text={wellbeingLabel(L.happiness, 'happiness')} color="#e0a526" why={L.why?.happiness} />
        <Gauge label="🌡️ Stress" v={L.stress} text={wellbeingLabel(L.stress, 'stress')} color="#8e7cc3" why={L.why?.stress} />
        <Gauge label="⚡ Energy" v={(p.energy / maxEnergy(w, p)) * 100} text={`${Math.floor(p.energy)}/${maxEnergy(w, p)}`} color="#3fb5a8" />
        <div class="row">
          <ActBtn small why={restCheck(w, p)} run={(w) => rest(w)}>😌 Take the evening off</ActBtn>
          <ActBtn small why={familyTimeCheck(w, p)} run={(w) => familyTime(w)}>🏡 Time with family</ActBtn>
        </div>
      </Panel>

      <Panel title="Family & close ones" right={<Btn small kind="ghost" onClick={() => store.go('people')}>People</Btn>}>
        <People w={w} p={p} />
        {partner && (
          <div class="row">
            <ActBtn small why={romanceCheck(w, p, partner, 'date')} run={(w) => goOnDate(w)}>🌹 Evening out</ActBtn>
            {fam.status === 'dating' && <ActBtn small why={romanceCheck(w, p, partner, 'propose')} run={(w) => propose(w)}>💍 Propose</ActBtn>}
            {fam.status === 'engaged' && <ActBtn small kind="primary" why={romanceCheck(w, p, partner, 'wed')} run={(w) => marry(w)}>💒 Get married</ActBtn>}
            {fam.status === 'married' && <ActBtn small why={romanceCheck(w, p, partner, 'child')} run={(w) => tryForChild(w)}>👶 Try for a child</ActBtn>}
            <ActBtn small kind="danger" confirm={fam.status === 'married' ? 'Divorce? A quarter of your savings goes to the settlement.' : 'End the relationship?'} run={(w) => breakUp(w)}>{fam.status === 'married' ? 'Divorce' : 'Break up'}</ActBtn>
          </div>
        )}
        {expecting(w, p) && <p class="small">🤰 A baby is on the way, due around {dueText(expecting(w, p)!.due)}.</p>}
        {!partner && <Help>Single. Get to know people in your Neighbourhood; once someone likes you (relationship 30+), you can ask them out from their profile.</Help>}
      </Panel>

      <Panel title="Pets"><Pets w={w} p={p} /></Panel>

      <Panel title="Hobbies"><Hobbies w={w} p={p} /></Panel>

      <Panel title="Money this month"><Budget w={w} p={p} /></Panel>

      <Panel title="Daily routine"><RoutinePanel w={w} p={p} /></Panel>

      <Panel title="Recent milestones" right={<Btn small kind="ghost" onClick={() => store.go('journal')}>Journal</Btn>}>
        {L.milestones.length ? <ul class="small milestones">{[...L.milestones].reverse().slice(0, 10).map((m) => <li><span class="muted">age {m.age}</span> {m.text}</li>)}</ul> : <Empty>Your story is just beginning.</Empty>}
      </Panel>

      <Panel title="Go to" class="wide">
        <div class="row wrap">
          {([['character', '🧍 Character'], ['jobs', '💼 Work'], ['local', '🏘️ Neighbourhood'], ['market', '🛒 Market'], ['companies', '🏭 Companies'], ['politics', '🗳️ Politics'], ['forces', '🎖️ Military'], ['journal', '📓 Journal']] as const).map(([id, label]) => <Btn small kind="ghost" onClick={() => store.go(id)}>{label}</Btn>)}
        </div>
      </Panel>
    </div>
  );
}

function Hobbies({ w, p }: { w: World; p: Citizen }) {
  const L = lifeOf(p);
  const code = w.nations[p.nation].cur;
  return (
    <>
      <table class="table compact">
        <tbody>
          {Object.entries(HOBBIES).map(([k, h]) => {
            const v = L.hobbies[k] ?? 0;
            return (
              <tr>
                <td>{h.icon} {h.label}{h.fit ? <small class="muted"> · keeps you fit</small> : h.social ? <small class="muted"> · meet people</small> : null}</td>
                <td class="small">{v > 0 ? <>{hobbyLevel(v)} <span class="muted">({Math.floor(v)})</span></> : <span class="muted">never tried</span>}</td>
                <td><ActBtn small why={hobbyCheck(w, p, k)} run={(w) => pursueHobby(w, k)}>{v > 0 ? 'Spend an evening' : 'Try it'}{h.cost ? <small class="muted"> {fmtAmt(code, cur(h.cost))}</small> : null}</ActBtn></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Help>One hobby evening a day ({HOBBY_ENERGY} energy). You get better by doing it, quickly at first. Hobbies you keep up (10+) lift happiness and ease stress; set one in your daily routine.</Help>
    </>
  );
}

function Pets({ w, p }: { w: World; p: Citizen }) {
  const pets = petsOf(w, p);
  const code = w.nations[p.nation].cur;
  return (
    <>
      {pets.length ? (
        <table class="table compact">
          <tbody>
            {pets.map((x) => (
              <tr>
                <td>{PET_KINDS[x.kind].icon} <b>{x.name}</b> <small class="muted">· {PET_KINDS[x.kind].label.toLowerCase()}, {petAge(w, x)}</small></td>
                <td class="small">❤️ {Math.round(x.health)} · bond {Math.round(x.bond)}</td>
                <td><ActBtn small why={careCheck(w, p, x)} run={(w) => careForPet(w, x.id)}>{x.kind === 'dog' ? '🦮 Walk' : '🧶 Play'}</ActBtn></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>No pets. A dog or a cat you look after lifts your spirits.</Empty>}
      <div class="row">
        {Object.entries(PET_KINDS).map(([k, v]) => <ActBtn small why={adoptCheck(w, p, k)} run={(w) => adoptPet(w, k)}>{v.icon} Adopt a {v.label.toLowerCase()} <small class="muted">{fmtAmt(code, cur(v.cost))}</small></ActBtn>)}
      </div>
      <Help>Pets cost a little every day for food and care. Give them attention (5 energy) every day or two; neglected pets lose their bond and may be rehomed.</Help>
    </>
  );
}

function Gauge({ label, v, text, color, why }: { label: string; v: number; text: string; color: string; why?: string[] }) {
  return (
    <div class="gauge">
      <div class="row between"><small>{label}</small><small class="muted">{Math.round(v)} · {text}</small></div>
      <Bar v={v} max={100} color={color} />
      {why && why.length > 0 && <small class="muted why">{why.join(' · ')}</small>}
    </div>
  );
}

function People({ w, p }: { w: World; p: Citizen }) {
  const fam = familyOf(w, p);
  const rows: [string, Citizen][] = [];
  if (fam.partner) rows.push([fam.status === 'married' ? 'Spouse' : fam.status === 'engaged' ? 'Fiancé(e)' : 'Partner', fam.partner]);
  for (const x of fam.parents) rows.push(['Parent', x]);
  for (const x of fam.children) rows.push(['Child', x]);
  const friends = Object.values(w.citizens).filter((c) => !c.gone && !c.player && (c.rel[p.id] ?? 0) >= 50 && !rows.some(([, r]) => r.id === c.id)).sort((a, b) => (b.rel[p.id] ?? 0) - (a.rel[p.id] ?? 0)).slice(0, 5);
  for (const x of friends) rows.push(['Friend', x]);
  const sib = siblingsOf(w, p);
  for (const [, c] of rows) { const i = sib.grown.indexOf(c); if (i >= 0) sib.grown.splice(i, 1); }
  if (!rows.length && !fam.kids.length && !sib.grown.length && !sib.young.length) return <Empty>No family nearby and no close friends yet.</Empty>;
  return (
    <table class="table compact">
      <tbody>
        {rows.map(([role, c]) => (
          <tr>
            <td class="muted small">{role}</td>
            <td><CitLink w={w} id={c.id} />{c.gone ? <small class="muted"> ({c.gone.why === 'died' ? 'died' : 'moved abroad'})</small> : <small class="muted"> · {ageOf(w, c)} · {occupation(w, c)}</small>}</td>
            <td class="num small">{c.gone ? '' : `♥ ${Math.round(c.rel[p.id] ?? 0)}`}</td>
          </tr>
        ))}
        {fam.kids.map((k) => <tr><td class="muted small">Child</td><td>{k.name} <small class="muted">· {ageOf(w, k)} · at home</small></td><td /></tr>)}
        {sib.grown.map((c) => <tr><td class="muted small">Sibling</td><td><CitLink w={w} id={c.id} />{c.gone ? <small class="muted"> ({c.gone.why === 'died' ? 'died' : 'moved abroad'})</small> : <small class="muted"> · {ageOf(w, c)} · {occupation(w, c)}</small>}</td><td class="num small">{c.gone ? '' : `♥ ${Math.round(c.rel[p.id] ?? 0)}`}</td></tr>)}
        {sib.young.map((k) => <tr><td class="muted small">Sibling</td><td>{k.name} <small class="muted">· {ageOf(w, k)} · at home with your parents</small></td><td /></tr>)}
      </tbody>
    </table>
  );
}

function Budget({ w, p }: { w: World; p: Citizen }) {
  const cur = w.nations[p.nation].cur;
  const since = w.time - 30 * DAY;
  const rows = w.ledger.filter((e) => e.t >= since && e.asset === cur);
  const income = rows.filter((e) => e.amount > 0).reduce((t, e) => t + e.amount, 0);
  const spend = rows.filter((e) => e.amount < 0).reduce((t, e) => t - e.amount, 0);
  const cats = new Map<string, number>();
  for (const e of rows) { const k = e.text.replace(/ (from|to|at|in|for) .*$/, '').replace(/[0-9#]+/g, '').trim() || 'Other'; cats.set(k, (cats.get(k) ?? 0) + e.amount); }
  const top = [...cats.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  return (
    <div>
      <div class="stats">
        <Stat label="Cash">{fmtAmt(cur, p.wallet[cur] ?? 0)}</Stat>
        <Stat label="In (30 days)">{fmtAmt(cur, income)}</Stat>
        <Stat label="Out (30 days)">{fmtAmt(cur, spend)}</Stat>
      </div>
      {top.length ? <table class="table compact small"><tbody>{top.map(([k, v]) => <tr><td>{k}</td><td class={`num ${v >= 0 ? 'good' : 'bad'}`}>{v >= 0 ? '+' : '−'}{fmtAmt(cur, Math.abs(v))}</td></tr>)}</tbody></table> : <Empty>No transactions in the last 30 days.</Empty>}
      <small class="muted">From your actual transactions (last 300 kept). Daily living costs are paid automatically.</small>
    </div>
  );
}

function RoutinePanel({ w, p }: { w: World; p: Citizen }) {
  const r = routineOf(w);
  const b = routineBudget(w, r);
  const toggle = (k: 'work' | 'train' | 'family' | 'rest' | 'jobHunt') => { r[k] = !r[k]; if (k === 'train') w.settings.autoTrain = r.train; store.emit(); };
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div>
      <label class="check"><input type="checkbox" checked={r.work} onChange={() => toggle('work')} /> Work my shift at {hh(p.workHour)} {p.job == null ? <small class="muted">(no job yet)</small> : null}</label>
      <label class="check"><input type="checkbox" checked={!!r.jobHunt} onChange={() => toggle('jobHunt')} /> Look for work when unemployed (apply to the best offer nearby)</label>
      <label class="check"><input type="checkbox" checked={r.train} onChange={() => toggle('train')} /> Train at {hh(p.trainHour)}</label>
      <label class="check"><input type="checkbox" checked={r.family} onChange={() => toggle('family')} /> Evening with family at 19:00</label>
      <label class="check">Hobby at 20:00: <select value={r.hobby ?? ''} onChange={(e) => { r.hobby = (e.target as HTMLSelectElement).value || null; store.emit(); }}>
        <option value="">none</option>
        {Object.entries(HOBBIES).map(([k, h]) => <option value={k}>{h.icon} {h.label}</option>)}
      </select></label>
      <label class="check"><input type="checkbox" checked={r.rest} onChange={() => toggle('rest')} /> Rest at 21:00</label>
      <p class="small muted">{b.hours} of {b.free} waking hours planned. Routine actions are the same as doing them yourself: one paid shift a day, and only when you are able.</p>
      {b.clashes.map((c) => <p class="small bad">⚠ {c}</p>)}
    </div>
  );
}
