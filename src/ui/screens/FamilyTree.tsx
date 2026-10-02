// The family tree and chronicle (3.0).
import type { Citizen, World } from '../../sim/types';
import { CitLink, Help } from '../common';
import { fmtDate, dateAt } from '../../engine/calendar';
import { descendants, dynastyOf, eldest, generationOf, generations, type TreeNode } from '../../sim/dynasty';
import { dynastyLeaders, familyFirmLabel, moneyKind, nameStanding, surnameOf } from '../../sim/familyName';

function Node({ w, n }: { w: World; n: TreeNode }) {
  const years = `${dateAt(n.born).year}${n.died ? `–${dateAt(n.died).year}` : ''}`;
  return (
    <li>
      {n.id != null ? <CitLink w={w} id={n.id} /> : n.name} <span class="muted">({years}{n.atHome ? ', at home' : ''})</span>{n.you ? ' ⭐ you' : ''}
      {n.spouse && <> ⚭ <CitLink w={w} id={n.spouse.id} /></>}
      {n.children.length > 0 && <ul>{n.children.map((c) => <Node w={w} n={c} />)}</ul>}
    </li>
  );
}

export function FamilyTree({ w, p }: { w: World; p: Citizen }) {
  const d = dynastyOf(w);
  const root = eldest(w, p);
  const tree = descendants(w, root, 4);
  const gens = generations(w);
  const events = d.events.slice(-30).reverse();
  return (
    <div class="grid two">
      <div>
        <h4>🌳 The {d.name} family tree</h4>
        <ul class="small tree">{<Node w={w} n={tree} />}</ul>
        <Help>Drawn from who is whose parent, child and spouse, as far back as the records go; children still growing up at home are shown with their families. You are generation {generationOf(w, p.id) ?? 1} of the {d.name} line.</Help>
      </div>
      <div>
        <h4>🏛️ The family name</h4>
        <p class="small">The {surnameOf(p.name)} name stands at {nameStanding(w, p.nation, surnameOf(p.name))} in {w.nations[p.nation].name}{dynastyLeaders(w, p) ? `, with ${dynastyLeaders(w, p)} head${dynastyLeaders(w, p) > 1 ? 's' : ''} of government in the family` : ''}.{moneyKind(w, p) === 'old' ? ' Old money.' : moneyKind(w, p) === 'new' ? ' New money.' : ''}</p>
        {Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id && familyFirmLabel(co)).map((co) => <p class="small">🏭 {co.name}: {familyFirmLabel(co)}.</p>)}
        <h4>📖 The family chronicle</h4>
        <ul class="small">{gens.map((g) => <li><b>Generation {g.gen}: {g.name}</b> <span class="muted">({dateAt(g.from).year}–{g.to ? dateAt(g.to).year : 'now'})</span>{g.summary.length ? <div class="muted">{g.summary.join(' · ')}</div> : null}</li>)}</ul>
        <ul class="small">{events.map((e) => <li><span class="muted">{fmtDate(e.t, 'medium')}</span> {e.text}</li>)}</ul>
      </div>
    </div>
  );
}
