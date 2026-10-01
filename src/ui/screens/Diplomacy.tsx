// Diplomacy: how a country sees every other (and why), its blocs and alliances, and
// the outlook of its head of government.
import type { Id, World } from '../../sim/types';
import { Bar, CitLink, Help, NationChip, Panel } from '../common';
import { fmtWhen } from '../../engine/clock';
import { BLOCS } from '../../data/diplomacy';
import { blocsOf, leaderProfile, prestigeOf, tiesOfPair } from '../../sim/relations';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Diplomacy({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const rows = Object.entries(n.relations).map(([k, r]) => ({ id: Number(k), r })).filter(({ id: o }) => w.nations[o]).sort((a, b) => b.r.score - a.r.score);
  const lp = leaderProfile(w, n);
  return (
    <>
      <Panel title="Diplomatic relations" class="wide">
        <div class="scroll-x"><table class="table compact small">
          <thead><tr><th>Nation</th><th>Relation</th><th>Trust</th><th>Affinity</th><th>Threat</th><th>Trade ties</th><th>Grievances</th><th>Status</th><th>Recent</th></tr></thead>
          <tbody>{rows.map(({ id: o, r }) => {
            const t = tiesOfPair(w, n, w.nations[o]);
            const status = [n.alliances.includes(o) ? 'allied' : null, n.embargoes.includes(o) ? 'embargo' : null, (n.pacts[o] ?? 0) > w.time ? `pact until ${fmtWhen(w, n.pacts[o])}` : null,
              Object.values(w.wars).some((x) => x.status === 'active' && ((x.att === id && x.def === o) || (x.att === o && x.def === id))) ? 'AT WAR' : null].filter(Boolean).join(', ');
            return (
              <tr><td><NationChip w={w} id={o} /></td>
                <td class={r.score > 20 ? 'good' : r.score < -20 ? 'bad' : ''}><b>{Math.round(r.score)}</b></td>
                <td class={t.trust > 20 ? 'good' : t.trust < -20 ? 'bad' : ''}>{Math.round(t.trust)}</td>
                <td>{t.affinity}</td>
                <td class={t.threat > 40 ? 'bad' : t.threat > 20 ? 'warn' : ''}>{t.threat}</td>
                <td>{Math.round(t.interdep)}</td>
                <td class={t.grievance > 30 ? 'bad' : ''}>{Math.round(t.grievance)}</td>
                <td>{status || '—'}</td>
                <td class="small muted">{r.hist.slice(0, 2).map((h) => `${h.delta > 0 ? '+' : ''}${h.delta} ${h.why}`).join('; ')}</td></tr>
            );
          })}</tbody>
        </table></div>
        <Help>A relation is built from trust (what each side has done to the other, remembered and slowly fading), affinity (similar governments, a shared language and blocs), threat (the other side's military power, its closeness and its intentions), trade ties, and grievances (territorial disputes and historical wrongs; lost wars add new ones). The score moves towards that blend day by day.</Help>
      </Panel>
      <Panel title="Blocs and alliances">
        <table class="table compact small"><tbody>{blocsOf(n).map((b) => (
          <tr><td><b>{b.name}</b><br /><small class="muted">{b.desc}</small></td><td>{b.members.map((iso) => w.nations.find((x) => x.iso === iso)).filter(Boolean).map((x) => <NationChip w={w} id={x!.id} />)}</td></tr>
        ))}</tbody></table>
        {!blocsOf(n).length && <p class="small muted">{n.name} belongs to none of the main blocs ({BLOCS.map((b) => b.name).join(', ')}).</p>}
        <p class="small">Standing in the world: <b>{prestigeOf(w, n)}</b> / 100</p>
      </Panel>
      <Panel title="The head of government's outlook">
        <p class="small">{n.leader}: {n.president != null ? <CitLink w={w} id={n.president} /> : 'vacant'}</p>
        <table class="table compact small"><tbody>
          <tr><td>Hawk or dove</td><td><Bar v={lp.hawk * 100} max={100} color="#e0574f" label={lp.hawk > 0.6 ? `hawk (${pct(lp.hawk)})` : lp.hawk < 0.4 ? `dove (${pct(lp.hawk)})` : `centrist (${pct(lp.hawk)})`} /></td></tr>
          <tr><td>Appetite for risk</td><td><Bar v={lp.risk * 100} max={100} color="#e39b3a" label={pct(lp.risk)} /></td></tr>
          <tr><td>Ideologue or pragmatist</td><td><Bar v={lp.ideologue * 100} max={100} color="#9b6bd6" label={lp.ideologue > 0.6 ? 'ideologue' : 'pragmatist'} /></td></tr>
          <tr><td>Nationalism</td><td><Bar v={lp.nationalism * 100} max={100} color="#5b8def" label={pct(lp.nationalism)} /></td></tr>
        </tbody></table>
        <Help>The leader's character colours foreign policy: hawks see more threat and are readier to use force; doves trust more. A change of leader can change a country's course.</Help>
      </Panel>
    </>
  );
}
