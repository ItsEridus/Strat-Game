// Parameter editors for war, peace and nuclear proposals.
import type { World } from '../../sim/types';
import { Num, Select } from '../common';
import { BUDGET_LINES, LINE_LABEL, budgetOf, budgetTotal, type Budget } from '../../sim/nationalBudget';
import { player } from '../../sim/query';
import { B } from '../../data/balance';
import { activeWars, enemyOf } from '../../sim/war';

export function ProposalParams({ w, type, params, setParams }: { w: World; type: string; params: Record<string, any>; setParams: (p: Record<string, any>) => void }) {
  const p = player(w);
  const n = w.nations[p.nation];
  if (type === 'budget') {
    const b = { ...budgetOf(n), ...params } as Budget;
    return <>{BUDGET_LINES.map((k) => <label>{LINE_LABEL[k]} (% of revenue) <Num value={Math.round(b[k] * 1000) / 10} step={0.5} min={0} max={50} onInput={(v) => setParams({ ...b, [k]: v / 100 })} /></label>)}
      <span class="small muted">Total {(budgetTotal(b) * 100).toFixed(1)}% of revenue.</span></>;
  }
  if (type === 'war') {
    const others = w.nations.filter((x) => x.id !== n.id);
    const target = params.target ?? others[0].id;
    const regions = w.regions.filter((r) => r.owner === target);
    const goals: number[] = params.goals ?? [];
    const set = (patch: Record<string, any>) => setParams({ target, days: params.days ?? 14, goals, ...patch });
    return (
      <>
        <label>Target <Select value={target} options={others.map((x) => [x.id, x.name])} onChange={(v) => set({ target: v, goals: [] })} /></label>
        <label>Duration <Select value={params.days ?? 14} options={B.war.durations.map((d) => [d, `${d} days`])} onChange={(v) => set({ days: v })} /></label>
        <label>Goal 1 <Select value={goals[0] ?? -1} options={[[-1, '— none —'], ...regions.map((r) => [r.id, r.name] as [number, string])]} onChange={(v) => set({ goals: [v, goals[1]].filter((x) => x != null && x >= 0) })} /></label>
        <label>Goal 2 <Select value={goals[1] ?? -1} options={[[-1, '— none —'], ...regions.map((r) => [r.id, r.name] as [number, string])]} onChange={(v) => set({ goals: [goals[0], v].filter((x) => x != null && x >= 0) })} /></label>
      </>
    );
  }
  if (type === 'peace') {
    const wars = activeWars(w).filter((x) => x.att === n.id || x.def === n.id);
    const war = w.wars[params.war] ?? wars[0];
    const set = (patch: Record<string, any>) => setParams({ war: war?.id, kind: params.kind ?? 'armistice', ...params, ...patch });
    if (!war) return <span class="muted">Your nation is not at war.</span>;
    const mineHeld = war.att === n.id ? war.occupied : war.counter;
    const theirsHeld = war.att === n.id ? war.counter : war.occupied;
    const offers = war.offers.filter((o) => o.status === 'open' && o.from !== n.id);
    return (
      <>
        <label>War <Select value={war.id} options={wars.map((x) => [x.id, `vs ${w.nations[enemyOf(x, n.id)].name}`])} onChange={(v) => set({ war: v })} /></label>
        <label>Terms <Select value={params.kind ?? 'armistice'} options={[['armistice', 'Armistice (all occupations return)'], ['surrender', 'Surrender (unilateral)'], ['demand', 'Demand (keep held claims)'], ['trade', 'Trade one region each way'], ...(offers.length ? [['accept', 'Accept their offer'] as [string, string]] : [])]} onChange={(v) => set({ kind: v, offer: offers[0]?.id })} /></label>
        {params.kind === 'trade' && <>
          <label>Keep <Select value={params.take ?? -1} options={[[-1, '—'], ...mineHeld.map((r) => [r, w.regions[r].name] as [number, string])]} onChange={(v) => set({ take: v })} /></label>
          <label>Cede <Select value={params.give ?? -1} options={[[-1, '—'], ...theirsHeld.map((r) => [r, w.regions[r].name] as [number, string])]} onChange={(v) => set({ give: v })} /></label>
        </>}
      </>
    );
  }
  if (type === 'nuke') return <NukeParams w={w} params={params} setParams={setParams} />;
  return null;
}

import { NukeParams } from './NukeParams';
