// Rankings: world power index of nations and citizen leaderboards.
import { militaryTitle } from '../../sim/forces';
import { census } from '../../sim/census';
import { useState } from 'preact/hooks';
import type { Citizen, World } from '../../sim/types';
import { Bar, CitLink, Help, NationChip, Panel } from '../common';
import { player } from '../../sim/query';
import { nationScores } from '../../sim/forces';
import { BRANCH_ICON } from '../../data/military';
import { GOLD, fmtAmt } from '../../engine/money';

type Board = 'military' | 'damage' | 'wealth' | 'influence' | 'fame';

const wealthOf = (w: World, c: Citizen) => {
  const n = w.nations[c.nation];
  const rate = n.fxAnchor || 10000;
  return (c.wallet[GOLD] ?? 0) + ((c.wallet[n.cur] ?? 0) * 1000) / rate;
};

export function Rankings({ w }: { w: World }) {
  const p = player(w);
  const scores = nationScores(w);
  const [board, setBoard] = useState<Board>('military');
  const key: Record<Board, (c: Citizen) => number> = {
    military: (c) => (w.nations[c.nation].president === c.id ? 1e9 : c.mil.branch ? 1000 * c.mil.rank + c.mil.sp : -1), // Commanders-in-Chief head the chain of command
    damage: (c) => c.dmgTotal,
    wealth: (c) => wealthOf(w, c),
    influence: (c) => c.influence,
    fame: (c) => c.sec.fame,
  };
  const all = census(w).all.filter((c) => key[board](c) >= 0).sort((a, b) => key[board](b) - key[board](a) || a.id - b.id);
  const mine = all.findIndex((c) => c.id === p.id);
  const show = (c: Citizen) => board === 'military' ? (w.nations[c.nation].president === c.id ? `🏛️ Commander-in-Chief (${w.nations[c.nation].name})` : `${BRANCH_ICON[c.mil.branch!]} ${militaryTitle(w, c)}`) : board === 'damage' ? c.dmgTotal.toLocaleString() : board === 'wealth' ? fmtAmt(GOLD, Math.round(wealthOf(w, c))) : Math.round(key[board](c)).toLocaleString();
  const maxOf = (k: 'military' | 'army' | 'navy' | 'air' | 'economy') => Math.max(1e-9, ...scores.map((s) => s[k]));
  return (
    <div class="grid">
      <Panel title="🌍 World power ranking" class="wide">
        <div class="scroll-x"><table class="table compact small">
          <thead><tr><th>#</th><th>Nation</th><th>Power index</th><th>🪖 Army</th><th>⚓ Navy</th><th>✈️ Air</th><th>Economy</th><th>Stability</th><th>Intelligence</th></tr></thead>
          <tbody>{scores.map((s, i) => (
            <tr class={s.id === p.nation ? 'me' : ''}><td>{i + 1}</td><td><NationChip w={w} id={s.id} /></td><td><Bar v={s.total} max={100} color="#e0a526" label={`${s.total}`} /></td>
              <td><Bar v={s.army} max={maxOf('army')} color="#46b873" label={`${Math.round(s.army)}`} /></td>
              <td><Bar v={s.navy} max={maxOf('navy')} color="#5b8def" label={`${Math.round(s.navy)}`} /></td>
              <td><Bar v={s.air} max={maxOf('air')} color="#8a63d2" label={`${Math.round(s.air)}`} /></td>
              <td><Bar v={s.economy} max={maxOf('economy')} color="#c28a2e" label={`${Math.round(s.economy)}`} /></td>
              <td>{Math.round(s.stability)}</td><td>{Math.round(s.intel)}</td></tr>
          ))}</tbody>
        </table></div>
        <Help>The power index weighs military strength (40%: formations and citizen soldiers), economy (25%: production and reserves), stability (15%: approval against crime and unrest), intelligence (10%) and population (10%). It moves as wars, crises and policies play out.</Help>
      </Panel>
      <Panel title="🏆 Leaderboards" class="wide" right={<span class="row small">{(['military', 'damage', 'wealth', 'influence', 'fame'] as Board[]).map((b) => <button class={`btn sm ${board === b ? 'primary' : 'ghost'}`} onClick={() => setBoard(b)}>{b}</button>)}</span>}>
        <table class="table compact small"><tbody>
          {all.slice(0, 20).map((c, i) => <tr class={c.id === p.id ? 'me' : ''}><td>{i + 1}</td><td><CitLink w={w} id={c.id} /></td><td><NationChip w={w} id={c.nation} /></td><td>{show(c)}</td></tr>)}
        </tbody></table>
        <p class="small">{mine >= 0 ? `Your position: #${mine + 1} of ${all.length} (${show(p)}).` : board === 'military' ? 'Enlist in the armed forces to appear on this board.' : ''}</p>
      </Panel>
    </div>
  );
}
