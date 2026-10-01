import type { Citizen, World } from '../../sim/types';
import { calendarPace } from '../../sim/growth';
import { fmtDate } from '../../engine/calendar';
import { militaryTitle } from '../../sim/forces';
import { askOut, romanceCheck } from '../../sim/family';
import { GIFTABLE, giftCheck, giftValue, giveGift } from '../../sim/kinship';
import { itemName, kindOf } from '../../data/items';
import { ageOf, reputation } from '../../sim/growth';
import { Amt, NationChip, Panel, RegionLink, Stat } from '../common';
import { store } from '../store';
import { player, jailed } from '../../sim/query';
import { rankOf } from '../../sim/combatMath';
import { activityOf, goalText } from '../../sim/npc';
import { IDEOLOGIES } from '../../data/ideologies';
import { GOLD } from '../../engine/money';
import { CitizenExtras } from './CitizenExtras';
import { Avatar } from '../Avatar';
import { ActBtn } from '../common';
import { familyRegard, memoriesOf } from '../../sim/story';
import { levelLabel } from '../../sim/education';
import { postTitle } from '../../sim/services';
import { BACKGROUNDS, QUIRKS, TALENTS, backgroundOf, natureOf } from '../../sim/nature';
import { startTalk, talkCheck } from '../../sim/interact';

export function CitizenProfile({ w }: { w: World }) {
  const id = store.sel.citizen ?? w.playerId;
  const c = w.citizens[id];
  if (!c) return <p>Citizen not found.</p>;
  const p = player(w);
  const party = c.party != null ? w.parties[c.party] : null;
  const job = c.job != null ? w.companies[c.job] : null;
  const owned = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === c.id);
  const n = w.nations[c.nation];
  const offices = [n.president === c.id ? n.leader : null, ...Object.entries(n.cabinet).filter(([, v]) => v === c.id).map(([k]) => `Minister (${k})`), n.deputies.includes(c.id) ? 'Deputy' : null].filter(Boolean);
  return (
    <div class="grid">
      <Panel title={`${c.name}${c.player ? ' (you)' : ''}`} class="wide">
        <div class="profile-head"><Avatar c={c} size={112} badge={false} w={w} /><div class="stats">
          <Stat label="Citizenship"><NationChip w={w} id={c.nation} /></Stat>
          <Stat label="Location"><RegionLink w={w} id={c.loc} /></Stat>
          <Stat label="Age">{ageOf(w, c)}{calendarPace(w) ? <small class="muted"> · born {fmtDate(c.born, 'short')}</small> : null}</Stat><Stat label="Reputation">{reputation(c).icon} {reputation(c).name}</Stat>
          <Stat label="Profile">{c.player ? 'you' : c.persona}</Stat>
          <Stat label="Ideology">{IDEOLOGIES[c.ideo].name}</Stat>
          <Stat label="Party">{party ? party.name : '—'}</Stat>
          <Stat label="Offices">{offices.join(', ') || '—'}</Stat>
          <Stat label="Influence">{Math.round(c.influence)}</Stat>
          <Stat label="Training power">{c.power.toFixed(1)}</Stat>
          <Stat label="Economic skill">{c.eco.toFixed(1)}</Stat>
          <Stat label="Military">{militaryTitle(w, c)}</Stat>
          <Stat label="Combat rank">{rankOf(c.dmgTotal).name}</Stat>
          <Stat label="Employer">{job ? job.name : 'unemployed'}</Stat>
          <Stat label="Companies owned">{owned.length}</Stat>
          {!c.player && <Stat label="Relationship with you">{Math.round(c.rel[p.id] ?? 0)}</Stat>}
          <Stat label="Doing">{activityOf(w, c)}</Stat>
          {!c.player && c.sec.goal && (Math.abs(c.rel[p.id] ?? 0) >= 20 || c.sec.fame > 5 || c.influence > 30) && <Stat label="Ambition">{goalText(w, c)}</Stat>}
          <Stat label="Education">{levelLabel(c)}</Stat>
          <Stat label="Grew up">{BACKGROUNDS[backgroundOf(w, c)].label}</Stat>
          <Stat label="Nature">{TALENTS[natureOf(c).talent].icon} {TALENTS[natureOf(c).talent].label}{natureOf(c).quirks.map((q) => ` · ${QUIRKS[q].icon} ${QUIRKS[q].label}`).join('')}</Stat>
          {c.post && <Stat label="Public service">{postTitle(c.post)}</Stat>}
          <Stat label="Fame">{c.sec.fame.toFixed(0)}</Stat>
          <Stat label="Public record">{c.sec.record.convictions ? `${c.sec.record.convictions} conviction${c.sec.record.convictions > 1 ? 's' : ''}` : 'clean'}{jailed(w, c) ? ' · in prison' : ''}</Stat>
          {p.sec.rivals.includes(c.id) && <Stat label="Status">😠 your rival</Stat>}
          {c.player && <Stat label="Gold"><Amt asset={GOLD} v={c.wallet[GOLD] ?? 0} /></Stat>}
        </div></div>
      </Panel>
      {!c.player && <Panel title={`💭 What ${c.name.split(' ')[0]} remembers about you`}>
        {memoriesOf(w, c.id).length ? <ul class="memories">{memoriesOf(w, c.id).slice().reverse().map((m) => <li><span class={m.delta > 0 ? 'good' : m.delta < 0 ? 'bad' : 'muted'}>{m.delta > 0 ? '▲' : m.delta < 0 ? '▼' : '•'}</span> You {m.text} <small class="muted">({fmtDate(m.t, 'medium')}{m.visibility === 'public' ? ', public' : ''})</small></li>)}</ul> : <p class="muted small">Nothing in particular yet. First impressions are made in conversation and in what you do.</p>}
        {familyRegard(w, c.id, p) !== 0 && <p class="small muted">{familyRegard(w, c.id, p) > 0 ? '🙂 Thinks well of your family' : '😒 Holds something against your family'} ({familyRegard(w, c.id, p) > 0 ? '+' : ''}{familyRegard(w, c.id, p)}).</p>}
        {!c.player && c.loc === p.loc && <ActBtn small why={talkCheck(w, p, c)} run={(w) => startTalk(w, c.id)}>💬 Talk</ActBtn>}
        {!c.player && !c.gone && p.family?.partner !== c.id && <ActBtn small why={romanceCheck(w, p, c, 'ask')} run={(w) => askOut(w, c.id)}>💕 Ask out</ActBtn>}
        {!c.player && !c.gone && <Gifts w={w} p={p} c={c} />}
      </Panel>}
      {(c.life?.work?.length ?? 0) > 0 && <Panel title="Work history">
        <table class="table compact small"><tbody>{[...c.life!.work!].reverse().map((x) => <tr><td>{x.what}</td><td class="muted">{x.where}</td><td>{fmtDate(x.from, 'short')} – {x.to ? fmtDate(x.to, 'short') : 'now'}</td><td class="muted">{x.why ?? ''}</td></tr>)}</tbody></table>
      </Panel>}
      <CitizenExtras w={w} c={c} />
    </div>
  );
}

/** Flowers, or something from one's own things (clothing, gadgets, food, medicine). */
function Gifts({ w, p, c }: { w: World; p: Citizen; c: Citizen }) {
  const items = Object.keys(p.inv).filter((k) => (p.inv[k] ?? 0) >= 1 && GIFTABLE.includes(kindOf(k)) && giftValue(k) > 0)
    .sort((a, b) => giftValue(b) - giftValue(a)).slice(0, 4);
  return (
    <div class="row wrap gifts">
      <small class="muted">Give a gift:</small>
      <ActBtn small showWhy={false} why={giftCheck(w, p, c, 'flowers')} run={(w) => giveGift(w, c.id, 'flowers')}>💐 Flowers</ActBtn>
      {items.map((k) => <ActBtn small showWhy={false} why={giftCheck(w, p, c, k)} run={(w) => giveGift(w, c.id, k)}>🎁 {itemName(k)}</ActBtn>)}
    </div>
  );
}
