// Places in the region: districts, venues, who is where, familiarity, exploring and appointments.
import { useState } from 'preact/hooks';
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Bar, Btn, CitLink, Empty, Help, Panel, Tabs } from '../common';
import { store } from '../store';
import { Avatar } from '../Avatar';
import { fmtDur } from '../../engine/clock';
import { fmtDate, fmtTime } from '../../engine/calendar';
import { player } from '../../sim/query';
import { DISTRICTS, type DistrictId } from '../../data/places';
import {
  LOCAL_ACTS, arrangeMeeting, arrangeMeetingCheck, availability, cancelAppointment, districtsOf, explore, exploreCheck, familiarity,
  goTo, goToCheck, isKnown, keepAppointment, keepAppointmentCheck, localAct, localActCheck, nextDiscovery, peopleAt, position, venueById, venuesOf,
  type LocalAct, type Venue,
} from '../../sim/places';
import { familyTime, familyTimeCheck, rest, restCheck } from '../../sim/wellbeing';
import { goOnDate, partnerOf, romanceCheck } from '../../sim/family';
import { startTalk, talkCheck } from '../../sim/interact';
import { train, trainCheck } from '../../sim/citizen';
import { DOING_INFO, nowDoing } from '../../sim/life';

export function PlacesPanel({ w }: { w: World }) {
  const p = player(w);
  const pos = position(w);
  const [district, setDistrict] = useState<DistrictId>(pos.district);
  const ds = districtsOf(w, p.loc);
  const d = ds.includes(district) ? district : ds[0];
  const all = venuesOf(w, p.loc);
  const inD = all.filter((v) => v.district === d);
  const known = inD.filter((v) => isKnown(w, p.loc, v) && !(v.kind === 'home' && p.home !== p.loc));
  const hidden = inD.length - known.length - (inD.some((v) => v.kind === 'home') && p.home !== p.loc ? 1 : 0);
  const fam = familiarity(w, p.loc);
  const next = nextDiscovery(w, p.loc);
  const here = pos.venue ? venueById(w, p.loc, pos.venue) : null;
  return (
    <Panel title={`📍 Around ${w.regions[p.loc].name}`} class="wide places" right={<ActBtn small kind="primary" why={exploreCheck(w)} run={(w) => explore(w)}>🧭 Explore ({5}⚡)</ActBtn>}>
      <div class="fam">
        <small class="muted">Familiarity {Math.round(fam)}/100{next ? ` · at ${next.at}: ${next.text}` : ' · you know this place inside out'}</small>
        <Bar v={fam} max={100} color="var(--teal)" />
      </div>
      <Tabs tabs={ds.map((x) => [x, `${DISTRICTS[x].icon} ${DISTRICTS[x].name}`] as [DistrictId, string])} value={d} onChange={setDistrict} />
      <p class="small muted">{DISTRICTS[d].desc}</p>
      <div class="venue-grid">
        {known.map((v) => <VenueCard w={w} v={v} here={pos.venue === v.id} />)}
        {hidden > 0 && <div class="venue-card unknown"><b>❔ {hidden} place{hidden > 1 ? 's' : ''} not yet found</b><small class="muted">Explore to get to know the area.</small></div>}
      </div>
      {here && <PlaceDetail w={w} v={here} />}
    </Panel>
  );
}

function VenueCard({ w, v, here }: { w: World; v: Venue; here: boolean }) {
  const p = player(w);
  const n = peopleAt(w, p.loc, v.id).length;
  return (
    <button class={`venue-card ${here ? 'on' : ''}`} onClick={() => store.act((w) => goTo(w, v.id))} disabled={!!goToCheck(w, v.id)} title={v.desc}>
      <b>{v.icon} {v.name}</b>
      <small class="muted">{here ? 'You are here' : v.desc.length > 70 ? `${v.desc.slice(0, 68)}…` : v.desc}</small>
      {n > 0 && <small class="people-count">👥 {n}</small>}
    </button>
  );
}

function PlaceDetail({ w, v }: { w: World; v: Venue }) {
  const p = player(w);
  const people = peopleAt(w, p.loc, v.id).sort((a, b) => (b.rel[p.id] ?? 0) - (a.rel[p.id] ?? 0));
  const partner = partnerOf(w, p);
  const acts = (Object.keys(LOCAL_ACTS) as LocalAct[]).filter((k) => LOCAL_ACTS[k].venue === v.kind);
  return (
    <div class="place-detail">
      <h4>{v.icon} {v.name}</h4>
      <p class="small">{v.desc}</p>
      <div class="row">
        {acts.map((k) => <ActBtn small why={localActCheck(w, k)} run={(w) => localAct(w, k)}>{LOCAL_ACTS[k].label}</ActBtn>)}
        {v.kind === 'home' && <><ActBtn small why={restCheck(w, p)} run={(w) => rest(w)}>😌 Evening off</ActBtn><ActBtn small why={familyTimeCheck(w, p)} run={(w) => familyTime(w)}>🏡 Family time</ActBtn></>}
        {(v.kind === 'restaurant' || v.kind === 'cafe') && partner && <ActBtn small why={romanceCheck(w, p, partner, 'date')} run={(w) => goOnDate(w)}>🌹 Evening out with {partner.name.split(' ')[0]}</ActBtn>}
        {v.kind === 'gym' && <ActBtn small why={trainCheck(w, p, 'normal')} run={(w) => train(w, p, 'normal')}>🏋️ Train</ActBtn>}
        {v.company != null && <Btn small onClick={() => store.go('jobs')}>💼 Jobs here</Btn>}
        {v.screen && <Btn small kind="ghost" onClick={() => store.go(v.screen!)}>Open {screenName(v.screen)}</Btn>}
      </div>
      <h4>People here</h4>
      {people.length ? <div class="people-grid">{people.slice(0, 12).map((c) => <MiniPerson w={w} c={c} />)}</div> : <Empty>Nobody you could talk to right now.</Empty>}
    </div>
  );
}

const screenName = (id: string) => ({ character: 'training', library: 'library', politics: 'politics', crime: 'law & order', press: 'newspapers', market: 'the market', fx: 'the currency market', companies: 'companies', map: 'the map (travel)', forces: 'the armed forces' } as Record<string, string>)[id] ?? id;

function MiniPerson({ w, c }: { w: World; c: Citizen }) {
  const p = player(w);
  const rel = Math.round(c.rel[p.id] ?? 0);
  return (
    <div class={`person ${rel >= 30 ? 'friend' : rel <= -30 ? 'rival' : ''}`}>
      <Avatar c={c} size={36} />
      <div class="person-body">
        <CitLink w={w} id={c.id} />
        <small class="muted">{DOING_INFO[nowDoing(w, c)].icon} {DOING_INFO[nowDoing(w, c)].label} · ♥ {rel}</small>
      </div>
      <ActBtn small why={talkCheck(w, p, c)} showWhy={false} run={(w) => startTalk(w, c.id)}>💬</ActBtn>
    </div>
  );
}

/** Availability line and meeting controls for a person card. */
export function MeetControls({ w, c }: { w: World; c: Citizen }) {
  const a = availability(w, c);
  if (a.now) return null;
  return (
    <small class="avail">
      <span class="muted">{a.why}{a.next ? ` · free ${fmtWhenShort(w, a.next)}` : ''}</span>
      {a.next && <button class="btn sm ghost" onClick={() => store.startAdvance(a.next!, `${c.name.split(' ')[0]} is free`)}>Wait</button>}
      <ActBtn small why={arrangeMeetingCheck(w, c)} showWhy={false} run={(w) => arrangeMeeting(w, c.id)}>Arrange to meet</ActBtn>
    </small>
  );
}

const fmtWhenShort = (w: World, t: number) => (t - w.time < 24 * 60 ? `at ${fmtTime(t, !!w.settings.clock24)}` : `${fmtDate(t, 'medium')}`);

export function AppointmentsPanel({ w }: { w: World }) {
  const list = [...w.story.appointments].sort((a, b) => a.at - b.at);
  if (!list.length) return null;
  return (
    <Panel title="⏰ Appointments">
      <table class="table compact small"><tbody>
        {list.map((a) => {
          const v = venueById(w, a.region, a.venue);
          return (
            <tr>
              <td><b>{fmtDate(a.at, 'medium')} · {fmtTime(a.at, !!w.settings.clock24)}</b><br /><span class="muted">{a.what} with <CitLink w={w} id={a.npc} /> at {v?.name ?? 'the meeting place'}{a.at > w.time ? ` (in ${fmtDur(a.at - w.time)})` : ''}</span></td>
              <td class="num">
                <ActBtn small kind="primary" why={keepAppointmentCheck(w, a.id)} showWhy={false} run={(w) => keepAppointment(w, a.id)}>Go</ActBtn>
                {a.at > w.time + 30 && <button class="btn sm ghost" onClick={() => store.startAdvance(a.at - 10, 'your meeting')}>Wait</button>}
                <ActBtn small kind="ghost" run={(w) => cancelAppointment(w, a.id)}>Cancel</ActBtn>
              </td>
            </tr>
          );
        })}
      </tbody></table>
      <Help>People keep appointments at the time they suggested; turning up late by more than two hours counts as standing them up.</Help>
    </Panel>
  );
}
