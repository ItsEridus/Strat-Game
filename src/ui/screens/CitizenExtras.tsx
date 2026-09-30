// Interactions with another citizen: relationships, endorsements, help, recruitment, contracts.
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Btn, Panel, Help } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import { endorse, inviteImmigrant, relTo, requestHelp } from '../../sim/social';
import { invite } from '../../sim/units';

export function CitizenExtras({ w, c }: { w: World; c: Citizen }) {
  const p = player(w);
  if (c.player) return null;
  const rel = relTo(w, c, p.id);
  const myUnit = p.unit != null ? w.units[p.unit] : null;
  const recent = w.log.filter((e) => e.cit === c.id).slice(-6).reverse();
  return (
    <>
      <Panel title="Relationship">
        <p>{c.name}’s opinion of you: <b class={rel > 15 ? 'good' : rel < -10 ? 'bad' : ''}>{Math.round(rel)}</b> (−100…100)</p>
        <Help>Opinions move with your votes, articles, endorsements, contracts, gifts and help. They affect elections, party lists, unit recruitment, contracts, ministerial offers and requests for help.</Help>
        <div class="row">
          <ActBtn small run={(w) => endorse(w, p, c.id)}>Endorse publicly (5⚡)</ActBtn>
          <ActBtn small run={(w) => requestHelp(w, p, c.id, 'supplies')}>Ask for supplies</ActBtn>
          <ActBtn small run={(w) => requestHelp(w, p, c.id, 'endorse')}>Ask for an endorsement</ActBtn>
          <ActBtn small run={(w) => requestHelp(w, p, c.id, 'job')}>Ask for a job</ActBtn>
          {c.nation !== p.nation && <ActBtn small run={(w) => inviteImmigrant(w, p, c.id)}>Invite to immigrate</ActBtn>}
          {myUnit && (myUnit.commander === p.id || myUnit.officers.includes(p.id)) && c.nation === p.nation && <ActBtn small run={(w) => invite(w, p, myUnit.id, c.id)}>Invite to {myUnit.name}</ActBtn>}
          <Btn small kind="ghost" onClick={() => store.go('contracts', { contractTo: c.id })}>Offer a contract</Btn>
        </div>
      </Panel>
      <Panel title="Recent activity">
        {recent.length ? recent.map((e) => <p class="small">{e.text}</p>) : <p class="muted small">Nothing notable recently.</p>}
      </Panel>
    </>
  );
}
