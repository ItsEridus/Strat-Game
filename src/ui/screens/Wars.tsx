import type { War, World } from '../../sim/types';
import { tollLine } from '../../sim/warHome';
import { ActBtn, Btn, Empty, NationChip, Panel, RegionLink, Help } from '../common';
import { store } from '../store';
import { controller, player } from '../../sim/query';
import { activeWars, enemyOf, invasionCheck, startInvasion, supplyRoute } from '../../sim/war';
import { fmtWhen } from '../../engine/clock';
import { B } from '../../data/balance';
import { useSort } from '../sort';

export function Wars({ w }: { w: World }) {
  const p = player(w);
  const wars = activeWars(w).sort((a, b) => ((b.att === p.nation || b.def === p.nation) ? 1 : 0) - ((a.att === p.nation || a.def === p.nation) ? 1 : 0));
  const ended = Object.values(w.wars).filter((x) => x.status === 'ended').sort((a, b) => b.declared - a.declared).slice(0, 10);
  const n = w.nations[p.nation];
  const unsupplied = w.regions.filter((r) => r.owner === p.nation && !r.supplied);
  const past = useSort('past-wars', ended, { war: (x) => `${w.nations[x.att].name} ${w.nations[x.def].name}`, declared: (x) => x.declared, outcome: (x) => x.chronicle?.ending?.headline ?? x.outcome ?? '' }, { key: 'declared', dir: 'desc' });
  return (
    <div class="grid">
      <Panel title="Wars" class="wide">
        <Help>Congress declares wars with a deadline ({B.war.durations.join('/')} days) and up to two goal regions. Winning a battle only <b>occupies</b> a region (owner and occupier stay distinct; work tax splits 80/20). Holding the quota of occupations wins: held goals transfer, other occupations return, retained regions lose a building level and a {B.war.pactDays}-day pact follows. Draft declarations and peace terms on the Congress screen.</Help>
        {unsupplied.length > 0 && <p class="warn">⚠️ {n.name} regions cut off from the capital (−10% defending): {unsupplied.map((r) => r.name).join(', ')}.</p>}
        <Btn small onClick={() => store.go('congress')}>Draft war or peace in Congress →</Btn>
      </Panel>
      {wars.map((war) => <WarCard w={w} war={war} />)}
      {!wars.length && <Panel title="Active wars"><Empty>The Reach is at peace.</Empty></Panel>}
      <Panel title="Past wars" class="wide">
        {ended.length ? (
          <table class="table compact">
            <thead><tr>{past.th('war', 'War')}{past.th('declared', 'Declared')}<th>Why it started</th>{past.th('outcome', 'How it ended')}<th /></tr></thead>
            <tbody>{past.rows.map((x) => (
              <tr>
                <td><NationChip w={w} id={x.att} /> vs <NationChip w={w} id={x.def} /></td>
                <td class="small">{fmtWhen(w, x.declared)}</td>
                <td class="small">{x.chronicle?.cause?.summary ?? <span class="muted">not recorded (before 1.3.4)</span>}</td>
                <td class="small">{x.chronicle?.ending?.headline ?? x.outcome}</td>
                <td><Btn small onClick={() => store.go('war', { war: x.id })}>History</Btn></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Empty>None yet.</Empty>}
        <Btn small kind="ghost" onClick={() => store.go('war', { war: null })}>War archive →</Btn>
      </Panel>
    </div>
  );
}

function WarCard({ w, war }: { w: World; war: War }) {
  const p = player(w);
  const mySide = war.att === p.nation || war.def === p.nation ? p.nation : null;
  const battles = war.battles.map((id) => w.battles[id]).filter((b) => b && !b.done);
  const targets = mySide != null ? w.regions.filter((r) => {
    const enemy = enemyOf(war, mySide);
    return (r.owner === enemy && controller(r) === enemy) || (r.owner === mySide && r.occ?.nation === enemy);
  }) : [];
  return (
    <Panel title={<span><NationChip w={w} id={war.att} /> ⚔ <NationChip w={w} id={war.def} /></span>} right={<small class="muted">deadline {fmtWhen(w, war.deadline)}</small>}>
      {war.chronicle?.cause && <p class="small war-why"><b>Why:</b> {war.chronicle.cause.summary}</p>}
      <p>Goals: {war.goals.length ? war.goals.map((g) => <><RegionLink w={w} id={g} />{war.occupied.includes(g) ? ' (held)' : ''} </>) : 'none (punitive war)'}</p>
      <p>Win condition: <b>{war.occupied.length}/{war.quota}</b> occupations held at once. Occupied by attacker: {war.occupied.map((r) => w.regions[r].name).join(', ') || 'none'}. Counter-occupied: {war.counter.map((r) => w.regions[r].name).join(', ') || 'none'}.</p>
      {war.occupied.some((r) => !war.goals.includes(r)) && <p class="small muted">Non-goal occupations count toward the quota but are returned at settlement.</p>}
      {war.surprise && <p class="small warn">😱 The attack took {w.nations[war.def].name} by surprise.</p>}
      <h4>The toll</h4>
      <table class="table compact small"><tbody>{[war.att, war.def].map((s) => (
        <tr><td><NationChip w={w} id={s} />{w.nations[s].mobilised ? ' · mobilised' : ''}</td><td>{tollLine(w, war, s)}</td></tr>
      ))}</tbody></table>
      <h4>Battles</h4>
      {battles.length ? battles.map((b) => (
        <div class="row small"><RegionLink w={w} id={b.region} /> round {b.round} ({b.wins.a}–{b.wins.d}){b.airOnly ? ' · air' : ''}
          <Btn small onClick={() => { w.player.watch = b.id; store.go('battle', { battle: b.id }); }}>Open</Btn></div>
      )) : <Empty>No battles right now.</Empty>}
      {war.offers.filter((o) => o.status === 'open').map((o) => <p class="small">🕊️ Open offer from {w.nations[o.from].name}: {o.kind}.</p>)}
      <Btn small onClick={() => store.go('war', { war: war.id })}>Full history: why, battles, offers →</Btn>
      {mySide != null && (
        <details>
          <summary class="small">Launch an invasion (requires defense authority)</summary>
          {targets.slice(0, 12).map((r) => {
            const route = supplyRoute(w, r.id);
            return (
              <div class="row small"><RegionLink w={w} id={r.id} /> {r.terrain}{r.bld.base ? ` base ${r.bld.base}` : ''}{r.owner === mySide ? ' (liberate)' : ''}{war.goals.includes(r.id) ? ' ★goal' : ''} {route.length ? '' : '· cut off'}
                <ActBtn small why={invasionCheck(w, p.id, war, r.id)} showWhy={false} run={(w) => startInvasion(w, p.id, war.id, r.id)}>Invade</ActBtn></div>
            );
          })}
        </details>
      )}
    </Panel>
  );
}
