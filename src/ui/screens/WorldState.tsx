// World Situation: the business cycle, commodity markets, disasters, epidemics,
// strikes and unrest — and what you can do about them.
import { MONTHS, dateAt } from '../../engine/calendar';
import { fmtDay } from '../../engine/calendar';
import { useState } from 'preact/hooks';
import type { World } from '../../sim/types';
import { ActBtn, Empty, Help, Num, Panel, RegionLink, Sparkline } from '../common';
import { player } from '../../sim/query';
import { c as cur, fmtAmt } from '../../engine/money';
import { EARTH } from '../../data/earth';
import { HAZARDS } from '../../data/hazards';
import { KIND_ICON, activeCrises, donate, joinProtest, joinProtestCheck, lockdownCheck, monthOf, reliefCheck, toggleLockdown, volunteer } from '../../sim/dynamics';

const PHASE: Record<string, string> = { boom: '📈 Boom', expansion: '↗️ Expansion', slowdown: '↘️ Slowdown', recession: '📉 Recession' };

export function WorldState({ w }: { w: World }) {
  const p = player(w);
  const e = w.econ;
  const crises = activeCrises(w).sort((a, b) => b.severity - a.severity || b.id - a.id);
  const month = monthOf(w);
  const iso = EARTH.nations[p.nation].iso;
  const season = [...new Set(HAZARDS.filter((h) => (!h.months.length || h.months.includes(month)) && h.regions.some((r) => r.startsWith(`${iso}/`))).map((h) => h.label))];
  const [gift, setGift] = useState(25);
  const past = Object.values(w.crises).filter((c) => c.status === 'over').sort((a, b) => b.end - a.end).slice(0, 10);
  return (
    <div class="grid">
      <Panel title="🌐 World economy">
        <p><b>{PHASE[e.phase]}</b> <small class="muted">(cycle {e.cycle >= 0 ? '+' : ''}{e.cycle.toFixed(2)})</small></p>
        <Sparkline values={e.hist.length ? e.hist : [0]} width={300} height={50} />
        <p class="small">Household spending {e.cycle >= 0 ? '+' : ''}{Math.round(e.cycle * 30)}% · crime pressure {e.cycle < 0 ? `+${Math.round(-e.cycle * 10)}` : 'normal'}</p>
        <table class="table compact small"><tbody>{Object.entries(e.commodity).map(([k, v]) => (
          <tr><td>{k}</td><td class={v > 1 ? 'good' : v < 1 ? 'bad' : ''}>{v === 1 ? 'normal output' : `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}% world output`}</td></tr>
        ))}</tbody></table>
        <Help>The world economy moves in cycles: booms lift household spending (and wage pressure), recessions cut it and push crime and unrest up. Commodity shocks change raw-material output for every producer.</Help>
      </Panel>

      <Panel title={`📅 ${MONTHS[month - 1]} ${dateAt(w.time).year}`}>
        <p class="small">In season for {w.nations[p.nation].name}: {season.join(', ') || 'no major hazards'}.</p>
        <Help>Disasters strike their real hazard zones in season: hurricanes on the Gulf coast, typhoons in East Asia, earthquakes along fault lines, monsoon floods, wildfires, blizzards and droughts. Epidemics can start anywhere and spread along borders.</Help>
      </Panel>

      <Panel title="🚨 Active situations" class="wide">
        {crises.length ? crises.map((c) => {
          const here = c.regions.includes(p.loc);
          const natural = ['hurricane', 'earthquake', 'flood', 'wildfire', 'blizzard', 'drought', 'epidemic'].includes(c.kind);
          return (
            <div class="card">
              <b>{KIND_ICON[c.kind]} {c.name}</b> <small class="muted">since {fmtDay(c.start)} · until ~{fmtDay(c.end)}{c.severity > 1 ? ` · severity ${c.severity}` : ''}{c.deaths ? ` · ${c.deaths.toLocaleString()} dead` : ''}{c.relief ? ` · relief ${fmtAmt(c.nation != null ? w.nations[c.nation].cur : 'USD', c.relief)}` : ''}</small>
              {c.regions.length > 0 && <p class="small">Affected: {c.regions.slice(0, 12).map((r, i) => <>{i ? ', ' : ''}<RegionLink w={w} id={r} />{c.lockdown?.includes(r) ? ' 🔒' : ''}</>)}{c.regions.length > 12 ? ` +${c.regions.length - 12} more` : ''}</p>}
              <div class="row small">
                {natural && <ActBtn small why={reliefCheck(w, p, c.id)} showWhy={here} run={(w) => volunteer(w, p, c.id)}>Volunteer (−20⚡)</ActBtn>}
                {natural && c.nation != null && <><Num value={gift} onInput={setGift} min={1} width={70} /><ActBtn small run={(w) => donate(w, p, c.id, cur(gift))}>Donate</ActBtn></>}
                {(c.kind === 'protest' || c.kind === 'riot') && <ActBtn small kind={c.kind === 'riot' ? 'danger' : undefined} why={joinProtestCheck(w, p)} showWhy={here} run={(w) => joinProtest(w, p)}>Join</ActBtn>}
                {c.kind === 'epidemic' && c.regions.filter((r) => !lockdownCheck(w, p, r)).map((r) => <ActBtn small run={(w) => toggleLockdown(w, p, r)}>{c.lockdown?.includes(r) ? 'Lift' : 'Order'} lockdown in {w.regions[r].name}</ActBtn>)}
              </div>
            </div>
          );
        }) : <Empty>Nothing major is happening right now.</Empty>}
      </Panel>

      <Panel title="🗓️ Recent history">
        {past.length ? <ul class="small">{past.map((c) => <li>{KIND_ICON[c.kind]} {c.name} ({fmtDay(c.start)} – {fmtDay(c.end)}){c.deaths ? `, ${c.deaths.toLocaleString()} dead` : ''}</li>)}</ul> : <Empty>No past events yet.</Empty>}
      </Panel>
    </div>
  );
}
