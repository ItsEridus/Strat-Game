import { useState } from 'preact/hooks';
// The life hub: one place for who you are, how you are, the people in your life,
// your money, your routine and what comes next.
import { MONTHS, fmtDate } from '../../engine/calendar';
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Bar, Btn, CitLink, Empty, Help, Panel, RegionLink, Stat } from '../common';
import { store } from '../store';
import { B } from '../../data/balance';
import { fmtDur } from '../../engine/clock';
import { c as cur, fmtAmt } from '../../engine/money';
import { player, maxEnergy } from '../../sim/query';
import { ageOf, calendarPace, nextBirthday, reputation } from '../../sim/growth';
import { STAGE_INFO, lifeOf, lifeStage, occupation, routineBudget, routineOf } from '../../sim/lifecycle';
import { familyTime, familyTimeCheck, rest, restCheck, wellbeingLabel } from '../../sim/wellbeing';
import { healthLabel } from '../../sim/population';
import { KID_HOW, adoptChildCheck, adoptionOf, applyToAdopt, inCare, PET_KINDS, adoptCheck, adoptPet, careCheck, careForPet, dueText, expecting, petAge, petsOf, siblingsOf } from '../../sim/kinship';
import { courseDays, dropOut, eduOfCitizen, enroll, enrollCheck, hasUniversity, levelLabel, schoolQuality, setEduFunding, study, studyCheck } from '../../sim/education';
import { COURSES, FIELDS, eduOf, type Course, type Field } from '../../data/education';
import { nationPerm } from '../../sim/authority';
import { controller } from '../../sim/query';
import { SIZES, buyCheck, buyHome, housingCost, priceOf, rentCheck, rentHome, rentOf, sellHome, type HomeSize } from '../../sim/housing';
import { KIND, buyWithMortgage, creditOf, incomeOf, loanCheck, loansOf, mortgageCheck, rateFor, repayLoan, takePersonalLoan } from '../../sim/loans';
import { CONDITIONS, clinicCheck, conditionsOf, endLeave, parentalCheck, takeParentalLeave, treated, visitClinic, visitCost } from '../../sim/health';
import { pensionOf, pensionQuote, pensionRules, retire, retireCheck } from '../../sim/pensions';
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

      <Panel title="Health"><HealthPanel w={w} p={p} /></Panel>

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
        <div class="row">
          {adoptionOf(w, p) ? <small class="muted">📝 Adoption application being assessed: a decision around {dueText(adoptionOf(w, p)!.ready)}.</small>
            : <ActBtn small why={adoptChildCheck(w, p)} confirm={`Apply to adopt? The fees (${fmtAmt(w.nations[p.nation].cur, cur(B.family.adoptFee))}) go to the state; the assessment takes about a month. ${inCare(w, p.nation).length} ${inCare(w, p.nation).length === 1 ? 'child is' : 'children are'} in care in ${w.nations[p.nation].name}.`} run={(w) => applyToAdopt(w)}>🏠 Adopt a child</ActBtn>}
        </div>
        {fam.kids.length > 0 && <Help>Each child at home costs {fmtAmt(w.nations[p.nation].cur, cur(B.family.childPerDay))} a day (food, clothes, school things), paid with your living costs. When they turn {B.life.adultAge} they set out on their own with a start from your savings.</Help>}
        {!partner && <Help>Single. Get to know people in your Neighbourhood; once someone likes you (relationship 30+), you can ask them out from their profile.</Help>}
      </Panel>

      <Panel title="Home"><HomePanel w={w} p={p} /></Panel>

      <Panel title="Education"><EducationPanel w={w} p={p} /></Panel>

      <Panel title="Pets"><Pets w={w} p={p} /></Panel>

      <Panel title="Hobbies"><Hobbies w={w} p={p} /></Panel>

      <Panel title="Retirement"><RetirementPanel w={w} p={p} /></Panel>

      <Panel title="Loans and credit"><LoansPanel w={w} p={p} /></Panel>

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

function RetirementPanel({ w, p }: { w: World; p: Citizen }) {
  const code = w.nations[p.nation].cur;
  const r = pensionRules(w, p);
  const pen = pensionOf(p);
  const q = pensionQuote(w, p);
  return (
    <div>
      {p.retired ? (
        <p>🌅 Retired{pen.since ? ` since ${fmtDate(pen.since, 'medium')}` : ''}. Pensions a day: {fmtAmt(code, pen.state ?? 0)} state{pen.private ? ` · ${fmtAmt(code, pen.private)} private (pot ${fmtAmt(code, pen.pot)})` : ''}{pen.military ? ` · ${fmtAmt(code, pen.military)} military` : ''}.</p>
      ) : (
        <>
          <div class="stats">
            <Stat label="Pension age">{r.age} <small class="muted">(earliest {r.age - 5})</small></Stat>
            <Stat label="Working years on record">{q.years} of 35</Stat>
            <Stat label="Pension pot">{fmtAmt(code, pen.pot)}</Stat>
            <Stat label="If you retired now">{fmtAmt(code, q.state + q.private + q.military)} a day</Stat>
          </div>
          <ActBtn small why={retireCheck(w, p)} confirm={`Retire now? You leave work${q.early ? ` and your state pension is ${q.early * 6}% lower for retiring early` : ''}.`} run={(w) => retire(w)}>🌅 Retire</ActBtn>
        </>
      )}
      <Help>Every paid shift counts toward the state pension (full after 35 years) and pays {Math.round(r.contrib * 100)}% of your wage into your pension pot{r.contrib ? '' : ' (your country has no funded pension; the state pension is the main one)'}. The pot is paid out over about 20 years. Twenty years in uniform earn a military pension.</Help>
    </div>
  );
}

function HealthPanel({ w, p }: { w: World; p: Citizen }) {
  const conds = conditionsOf(p);
  const v = visitCost(w, p);
  const leave = p.leave && p.leave.until > w.time ? p.leave : null;
  return (
    <div>
      {conds.length ? (
        <table class="table compact small"><tbody>{conds.map((x) => (
          <tr>
            <td>{CONDITIONS[x.key].icon} {CONDITIONS[x.key].label}</td>
            <td class="muted">{CONDITIONS[x.key].chronic && !x.until ? 'long-term' : x.until ? `until about ${fmtDate(x.until, 'dayMonth')}` : ''}</td>
            <td class={treated(w, x) ? 'good' : 'bad'}>{treated(w, x) ? `treated until ${fmtDate(x.treatedUntil!, 'dayMonth')}` : 'untreated'}</td>
          </tr>
        ))}</tbody></table>
      ) : <p class="small muted">No illnesses or injuries.</p>}
      <div class="row">
        <ActBtn small why={clinicCheck(w, p)} run={(w) => visitClinic(w)}>🏥 See a doctor ({v.patient ? fmtAmt(v.code, v.patient) : 'free'})</ActBtn>
        {leave ? <ActBtn small kind="ghost" run={(w) => endLeave(w)}>{leave.kind === 'parental' ? 'End parental leave' : 'Back to work'}</ActBtn>
          : <ActBtn small why={parentalCheck(w, p)} run={(w) => takeParentalLeave(w)}>👶 Parental leave</ActBtn>}
      </div>
      {leave && <p class="small">{leave.kind === 'parental' ? '👶 On parental leave' : '🛌 On sick leave'} until {fmtDate(leave.until, 'medium')}.</p>}
      <Help>Treatment heals illnesses faster and keeps long-term conditions in check for 30 days at a time. What a visit costs depends on your country's health system. The badly ill go on sick leave, with sick pay for up to four weeks.</Help>
    </div>
  );
}

function LoansPanel({ w, p }: { w: World; p: Citizen }) {
  const code = w.nations[p.nation].cur;
  const loans = loansOf(w, p);
  const [amt, setAmt] = useState(20);
  return (
    <div>
      <div class="stats">
        <Stat label="Credit score">{creditOf(p)}</Stat>
        <Stat label="Income lenders count">{fmtAmt(code, incomeOf(w, p))} a day</Stat>
        <Stat label="Personal loan rate">{rateFor(w, p, 'personal')}%</Stat>
        <Stat label="Mortgage rate">{rateFor(w, p, 'mortgage')}%</Stat>
      </div>
      {loans.length ? (
        <table class="table compact small">
          <thead><tr><th>Loan</th><th class="num">Owed</th><th class="num">Rate</th><th class="num">A day</th><th /></tr></thead>
          <tbody>{loans.map((l) => (
            <tr>
              <td>{KIND[l.kind].icon} {KIND[l.kind].label} <small class="muted">· {l.note}{l.missed ? ` · ⚠️ ${l.missed} missed` : ''}{l.start > w.time ? ' · payments not started' : ''}</small></td>
              <td class="num">{fmtAmt(l.cur, l.balance)}</td><td class="num">{l.rate}%</td><td class="num">{fmtAmt(l.cur, l.payment)}</td>
              <td><ActBtn small kind="ghost" confirm={`Pay off ${fmtAmt(l.cur, l.balance)} now?`} run={(w) => repayLoan(w, l.id)}>Pay off</ActBtn></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <Empty>No loans.</Empty>}
      <div class="row small">Personal loan
        <select value={amt} onChange={(ev) => setAmt(+(ev.target as HTMLSelectElement).value)}>{[20, 50, 100, 200, 500, 1000].map((x) => <option value={x}>{fmtAmt(code, cur(x))}</option>)}</select>
        <ActBtn small why={loanCheck(w, p, 'personal', cur(amt))} run={(w) => takePersonalLoan(w, cur(amt))}>Borrow</ActBtn>
      </div>
      <Help>Rates follow your country's central-bank rate plus a margin; weak credit costs more. Repayments may take up to {Math.round(B.loans.maxShare * 100)}% of your income. Missed payments hurt your credit, and a mortgage {B.loans.repossessAfter} days in arrears ends in repossession. Paying on time builds credit.</Help>
    </div>
  );
}

function HomePanel({ w, p }: { w: World; p: Citizen }) {
  const h = p.dwelling;
  const here = p.loc;
  const code = w.nations[controller(w.regions[here])].cur;
  const homeCode = h ? w.nations[controller(w.regions[h.region])].cur : code;
  const sizes = Object.keys(SIZES) as HomeSize[];
  return (
    <div>
      {h ? (
        <p>{SIZES[h.size].icon} <b>{h.kind === 'family' ? 'Living with family' : `${h.kind === 'own' ? 'You own' : 'You rent'} a ${SIZES[h.size].label.toLowerCase()}`}</b> in <RegionLink w={w} id={h.region} />
          {h.kind !== 'family' && <> · {fmtAmt(homeCode, housingCost(w, h))} a day {h.kind === 'rent' ? 'rent' : 'upkeep and property tax'}</>}
          {h.kind === 'own' && <> · worth about {fmtAmt(homeCode, priceOf(w, h.region, h.size))}{h.paid ? ` (bought for ${fmtAmt(homeCode, h.paid)})` : ''}</>}</p>
      ) : <Empty>No home on record.</Empty>}
      <table class="table compact small">
        <thead><tr><th>In {w.regions[here].name}</th><th class="num">Rent a day</th><th class="num">Price</th><th /></tr></thead>
        <tbody>{sizes.map((s) => (
          <tr>
            <td>{SIZES[s].icon} {SIZES[s].label}</td>
            <td class="num">{fmtAmt(code, rentOf(w, here, s))}</td>
            <td class="num">{fmtAmt(code, priceOf(w, here, s))}</td>
            <td class="row"><ActBtn small why={rentCheck(w, p, s)} run={(w) => rentHome(w, s)}>Rent</ActBtn><ActBtn small why={buyCheck(w, p, s)} run={(w) => buyHome(w, s)}>Buy</ActBtn><ActBtn small why={mortgageCheck(w, p, s)} run={(w) => buyWithMortgage(w, s)}>Mortgage</ActBtn></td>
          </tr>
        ))}</tbody>
      </table>
      {h?.kind === 'own' && <ActBtn small kind="ghost" confirm={`Sell your home for about ${fmtAmt(homeCode, Math.floor(priceOf(w, h.region, h.size) * (1 - B.housing.fees)))} after fees?`} run={(w) => sellHome(w)}>Sell your home</ActBtn>}
      <Help>Renting or buying where you are now makes it your home region; a spouse moves with you. Prices follow how sought-after a region is and change slowly. Renting needs a deposit and the first month; buying costs the price plus {Math.round(B.housing.fees * 100)}% fees.</Help>
    </div>
  );
}

function EducationPanel({ w, p }: { w: World; p: Citizen }) {
  const e = eduOfCitizen(p);
  const r = w.regions[p.home];
  const nat = controller(r);
  const code = w.nations[nat].cur;
  const [course, setCourse] = useState<Course>('bachelor');
  const [field, setField] = useState<Field>('business');
  const [loan, setLoan] = useState(false);
  const [share, setShare] = useState(Math.round((w.nations[p.nation].eduFunding ?? eduOf(w.nations[p.nation].iso).funding) * 100));
  const fee = (k: Course) => cur(Math.round(eduOf(w.nations[nat].iso).tuition * COURSES[k].tuition));
  return (
    <div>
      <p><b>{levelLabel(p)}</b></p>
      {e.enrolled ? (
        <>
          <p class="small">{COURSES[e.enrolled.course].icon} Studying for a {COURSES[e.enrolled.course].label.toLowerCase()} in {FIELDS[e.enrolled.field].label.toLowerCase()} in {w.regions[e.enrolled.region].name}: {Math.floor(e.enrolled.days)} of {e.enrolled.need} study days.</p>
          <Bar v={e.enrolled.days} max={e.enrolled.need} color="#3fb5a8" />
          <div class="row">
            <ActBtn small kind="primary" why={studyCheck(w, p)} run={(w) => study(w)}>📚 Go to classes</ActBtn>
            <ActBtn small kind="ghost" confirm="Leave your course? Fees already paid are not refunded." run={(w) => dropOut(w)}>Drop out</ActBtn>
          </div>
          <Help>Classes run in your daily routine at 09:00 ("School / studies"). A year's fees are due at the start of each academic year.</Help>
        </>
      ) : (
        <>
          <div class="row wrap small">
            <select value={course} onChange={(ev) => setCourse((ev.target as HTMLSelectElement).value as Course)}>{(Object.keys(COURSES) as Course[]).map((k) => <option value={k}>{COURSES[k].icon} {COURSES[k].label} ({COURSES[k].years} yr)</option>)}</select>
            <select value={field} onChange={(ev) => setField((ev.target as HTMLSelectElement).value as Field)}>{(Object.keys(FIELDS) as Field[]).map((k) => <option value={k}>{FIELDS[k].icon} {FIELDS[k].label}</option>)}</select>
            <label class="check"><input type="checkbox" checked={loan} onChange={() => setLoan(!loan)} /> with a student loan</label>
            <ActBtn small why={enrollCheck(w, p, course, field, loan)} run={(w) => enroll(w, course, field, p, loan)}>Enrol ({fee(course) ? `${fmtAmt(code, fee(course))} a year` : 'no fees'})</ActBtn>
          </div>
          <Help>About {courseDays(w, course)} study days. Studying builds the skills of your field.</Help>
        </>
      )}
      <p class="small muted">Schools in {r.name}: quality {schoolQuality(w, r)}/100 · {hasUniversity(w, r) ? `University of ${r.name}` : 'no university (colleges offer vocational courses)'}.</p>
      {nationPerm(w, p.id, p.nation, 'money') && <div class="row small">Education funding
        <select value={share} onChange={(ev) => setShare(+(ev.target as HTMLSelectElement).value)}>{[0, 2, 3, 4, 5, 6, 8, 10, 12, 15].map((x) => <option value={x}>{x}% of revenue</option>)}</select>
        <ActBtn small run={(w) => setEduFunding(w, p.id, p.nation, share / 100)}>Set</ActBtn></div>}
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
        {fam.kids.map((k) => <tr><td class="muted small">Child</td><td>{k.name} <small class="muted">· {ageOf(w, k)} · at home{k.how ? ` · ${KID_HOW[k.how]}` : ''}</small></td><td /></tr>)}
        {sib.grown.map((c) => <tr><td class="muted small">Sibling</td><td><CitLink w={w} id={c.id} />{c.gone ? <small class="muted"> ({c.gone.why === 'died' ? 'died' : 'moved abroad'})</small> : <small class="muted"> · {ageOf(w, c)} · {occupation(w, c)}</small>}</td><td class="num small">{c.gone ? '' : `♥ ${Math.round(c.rel[p.id] ?? 0)}`}</td></tr>)}
        {sib.young.map((k) => <tr><td class="muted small">Sibling</td><td>{k.name} <small class="muted">· {ageOf(w, k)} · at home with your parents</small></td><td /></tr>)}
      </tbody>
    </table>
  );
}

function Budget({ w, p }: { w: World; p: Citizen }) {
  const code = w.nations[p.nation].cur;
  const months = (w.budget ?? []).filter((m) => m.asset[code]);
  const [idx, setIdx] = useState(-1);
  const m = months.at(idx) ?? months.at(-1);
  const cats = Object.entries(m?.asset[code] ?? {});
  const inc = cats.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const out = cats.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const total = (xs: [string, number][]) => xs.reduce((t, [, v]) => t + v, 0);
  const kids = p.family?.kids.length ?? 0;
  const fixed = cur(B.living.essentials) + housingCost(w, p.dwelling) + cur(B.family.childPerDay) * kids + petsOf(w, p).reduce((t, x) => t + cur(PET_KINDS[x.kind].upkeep), 0);
  const cash = p.wallet[code] ?? 0;
  const label = (key: string) => { const [y, mo] = key.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
  const row = ([k, v]: [string, number]) => <tr><td>{k}</td><td class={`num ${v >= 0 ? 'good' : 'bad'}`}>{v >= 0 ? '+' : '−'}{fmtAmt(code, Math.abs(v))}</td></tr>;
  return (
    <div>
      <div class="row between">
        <Btn small kind="ghost" why={!m || months.indexOf(m) <= 0 ? 'No earlier month' : null} onClick={() => setIdx(months.indexOf(m!) - 1 - months.length)}>‹</Btn>
        <b>{m ? label(m.key) : 'This month'}</b>
        <Btn small kind="ghost" why={!m || months.indexOf(m) >= months.length - 1 ? 'No later month' : null} onClick={() => setIdx(months.indexOf(m!) + 1 - months.length)}>›</Btn>
      </div>
      <div class="stats">
        <Stat label="Cash">{fmtAmt(code, cash)}</Stat>
        <Stat label="Money in">{fmtAmt(code, total(inc))}</Stat>
        <Stat label="Money out">{fmtAmt(code, -total(out))}</Stat>
        <Stat label="Net">{total(cats) >= 0 ? '+' : '−'}{fmtAmt(code, Math.abs(total(cats)))}</Stat>
      </div>
      {cats.length ? <table class="table compact small"><tbody>{inc.map(row)}{out.map(row)}</tbody></table> : <Empty>No money in or out yet this month.</Empty>}
      <p class="small muted">Fixed costs: {fmtAmt(code, fixed)} a day (essentials{p.dwelling && p.dwelling.kind !== 'family' ? (p.dwelling.kind === 'rent' ? ', rent' : ', home upkeep') : ''}{kids ? `, ${kids} child${kids > 1 ? 'ren' : ''}` : ''}{petsOf(w, p).length ? ', pets' : ''}). {fixed > 0 ? `Your cash covers about ${Math.floor(cash / fixed)} days of them.` : ''}</p>
    </div>
  );
}

function RoutinePanel({ w, p }: { w: World; p: Citizen }) {
  const r = routineOf(w);
  const b = routineBudget(w, r);
  const toggle = (k: 'work' | 'train' | 'family' | 'rest' | 'jobHunt' | 'school') => { r[k] = !r[k]; if (k === 'train') w.settings.autoTrain = r.train; store.emit(); };
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div>
      <label class="check"><input type="checkbox" checked={r.work} onChange={() => toggle('work')} /> Work my shift at {hh(p.workHour)} {p.job == null ? <small class="muted">(no job yet)</small> : null}</label>
      <label class="check"><input type="checkbox" checked={!!r.jobHunt} onChange={() => toggle('jobHunt')} /> Look for work when unemployed (apply to the best offer nearby)</label>
      {p.edu?.enrolled && <label class="check"><input type="checkbox" checked={r.school} onChange={() => toggle('school')} /> Classes at 09:00</label>}
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
