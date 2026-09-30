import type { Id, World } from '../../sim/types';
import { NationChip, Panel } from '../common';
import { fmtWhen } from '../../engine/clock';

export function Diplomacy({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const rows = Object.entries(n.relations).map(([k, r]) => ({ id: Number(k), r })).sort((a, b) => b.r.score - a.r.score);
  return (
    <Panel title="Diplomatic relations" class="wide">
      <table class="table compact">
        <thead><tr><th>Nation</th><th>Relation</th><th>Status</th><th>Recent reasons</th></tr></thead>
        <tbody>{rows.map(({ id: o, r }) => {
          const status = [n.alliances.includes(o) ? 'allied' : null, n.embargoes.includes(o) ? 'embargo' : null, (n.pacts[o] ?? 0) > w.time ? `pact until ${fmtWhen(w, n.pacts[o])}` : null,
            Object.values(w.wars).some((x) => x.status === 'active' && ((x.att === id && x.def === o) || (x.att === o && x.def === id))) ? 'AT WAR' : null].filter(Boolean).join(', ');
          return (
            <tr><td><NationChip w={w} id={o} /></td><td class={r.score > 20 ? 'good' : r.score < -20 ? 'bad' : ''}>{Math.round(r.score)}</td><td>{status || '—'}</td>
              <td class="small muted">{r.hist.slice(0, 3).map((h) => `${h.delta > 0 ? '+' : ''}${h.delta} ${h.why}`).join('; ')}</td></tr>
          );
        })}</tbody>
      </table>
    </Panel>
  );
}
