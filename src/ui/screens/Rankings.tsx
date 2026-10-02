// Rankings: world power index of nations and citizen leaderboards.
import { militaryTitle } from '../../sim/forces';
import { census } from '../../sim/census';
import { useState } from 'preact/hooks';
import { useSort } from '../sort';
import type { Citizen, World } from '../../sim/types';
import { Bar, CitLink, Help, NationChip, Panel, Sparkline } from '../common';
import { player } from '../../sim/query';
import { TIER_LABEL, nationScores } from '../../sim/forces';
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
  const ranked = scores.map((s, i) => ({ ...s, rank: i + 1 }));
  const sort = useSort('power', ranked, {
    rank: { get: (s) => s.rank, first: 'asc' }, nation: (s) => w.nations[s.id].name, total: (s) => s.total, army: (s) => s.army, navy: (s) => s.navy, air: (s) => s.air,
    economy: (s) => s.economy, stability: (s) => s.stability, intel: (s) => s.intel,
  }, { key: 'rank', dir: 'asc' });
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
          <thead><tr>{sort.th('rank', '#')}{sort.th('nation', 'Nation')}{sort.th('total', 'Power index')}<th>Tier</th>{sort.th('army', '🪖 Army')}{sort.th('navy', '⚓ Navy')}{sort.th('air', '✈️ Air')}{sort.th('economy', 'Economy')}{sort.th('stability', 'Stability')}{sort.th('intel', 'Intelligence')}</tr></thead>
          <tbody>{sort.rows.map((s) => (
            <tr class={s.id === p.nation ? 'me' : ''}><td>{s.rank}</td><td><NationChip w={w} id={s.id} /></td><td><Bar v={s.total} max={100} color="#e0a526" label={`${s.total}`} /></td><td class="small">{TIER_LABEL[s.tier]} <Sparkline values={(w.nations[s.id].powerHist ?? []).slice(-24).map((h) => h.total)} width={60} height={16} /></td>
              <td><Bar v={s.army} max={maxOf('army')} color="#46b873" label={`${Math.round(s.army)}`} /></td>
              <td><Bar v={s.navy} max={maxOf('navy')} color="#5b8def" label={`${Math.round(s.navy)}`} /></td>
              <td><Bar v={s.air} max={maxOf('air')} color="#8a63d2" label={`${Math.round(s.air)}`} /></td>
              <td><Bar v={s.economy} max={maxOf('economy')} color="#c28a2e" label={`${Math.round(s.economy)}`} /></td>
              <td>{Math.round(s.stability)}</td><td>{Math.round(s.intel)}</td></tr>
          ))}</tbody>
        </table></div>
        <Help>Power index 2.0 weighs economic mass (30%: the real 2025 share of world GDP, grown by productivity since), military capability (30%: formations and citizen soldiers × the quality of military technology × readiness), technology (15%), stability (10%), intelligence (8%) and population (7%). Tiers: superpower (80+), great power (58+), middle power (45+), regional power (35+) and minor power. It moves as wars, crises and policies play out.</Help>
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
