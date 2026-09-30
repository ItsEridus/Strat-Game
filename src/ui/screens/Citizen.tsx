import type { World } from '../../sim/types';
import { Amt, NationChip, Panel, RegionLink, Stat } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import { rankOf } from '../../sim/combatMath';
import { IDEOLOGIES } from '../../data/ideologies';
import { GOLD } from '../../engine/money';
import { CitizenExtras } from './CitizenExtras';

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
        <div class="stats">
          <Stat label="Citizenship"><NationChip w={w} id={c.nation} /></Stat>
          <Stat label="Location"><RegionLink w={w} id={c.loc} /></Stat>
          <Stat label="Level">{c.level}</Stat>
          <Stat label="Profile">{c.player ? 'you' : c.persona}</Stat>
          <Stat label="Ideology">{IDEOLOGIES[c.ideo].name}</Stat>
          <Stat label="Party">{party ? party.name : '—'}</Stat>
          <Stat label="Offices">{offices.join(', ') || '—'}</Stat>
          <Stat label="Influence">{Math.round(c.influence)}</Stat>
          <Stat label="Training power">{c.power.toFixed(1)}</Stat>
          <Stat label="Economic skill">{c.eco.toFixed(1)}</Stat>
          <Stat label="Rank">{rankOf(c.dmgTotal).name}</Stat>
          <Stat label="Employer">{job ? job.name : 'unemployed'}</Stat>
          <Stat label="Companies owned">{owned.length}</Stat>
          {!c.player && <Stat label="Relationship with you">{Math.round(c.rel[p.id] ?? 0)}</Stat>}
          {c.player && <Stat label="Gold"><Amt asset={GOLD} v={c.wallet[GOLD] ?? 0} /></Stat>}
        </div>
      </Panel>
      <CitizenExtras w={w} c={c} />
    </div>
  );
}
