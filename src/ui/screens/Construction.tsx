import { useState } from 'preact/hooks';
import type { BuildingType, Project, World } from '../../sim/types';
import { ActBtn, Bar, CitLink, Empty, NationChip, Num, Panel, RegionLink, Select, Help } from '../common';
import { store } from '../store';
import { cref, natref, player } from '../../sim/query';
import { BUILDINGS, contributeLabor, donateCheck, donateMaterials, fundProject, laborCheck, laborPoints, projectNeeds, startCheck, startProject } from '../../sim/construction';
import { builderRank } from '../../sim/combatMath';
import { itemName } from '../../data/items';
import { B } from '../../data/balance';
import { fmtWhen } from '../../engine/clock';

export function Construction({ w }: { w: World }) {
  const p = player(w);
  const nid = store.sel.conNat ?? p.nation;
  const projects = Object.values(w.projects).filter((x) => x.nation === nid).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || b.started - a.started);
  const active = projects.filter((x) => !x.done);
  const br = builderRank(p.buildTotal);
  return (
    <div class="grid">
      <Panel title={<span>Construction — <NationChip w={w} id={nid} /></span>} class="wide" right={<Select value={nid} options={w.nations.map((x) => [x.id, x.name])} onChange={(v) => store.go('construction', { conNat: v })} />}>
        <Help>Governments open sites; anyone in the country can contribute labour ({B.cost.build} energy → {B.construction.ptsPerAction} base points, wiki) or deliver materials. Your builder rank {br.index} (+{Math.round(br.bonus * 100)}%) rises with lifetime points ({Math.round(p.buildTotal).toLocaleString()}). Sites complete once, consuming their materials; top contributors are rewarded.</Help>
        <div class="stats">{(Object.keys(BUILDINGS) as BuildingType[]).map((b) => <div class="stat"><small>{BUILDINGS[b].icon} {BUILDINGS[b].name}</small><b class="small">{BUILDINGS[b].effect}</b></div>)}</div>
      </Panel>
      {active.map((pr) => <ProjectCard w={w} pr={pr} />)}
      {!active.length && <Panel title="Active sites"><Empty>No active construction in {w.nations[nid].name}.</Empty></Panel>}
      <StartPanel w={w} nid={nid} />
      <Panel title="Completed" class="wide">
        <table class="table compact"><tbody>{projects.filter((x) => x.done).slice(0, 20).map((x) => (
          <tr><td>{BUILDINGS[x.type].icon} {BUILDINGS[x.type].name} L{x.level}</td><td><RegionLink w={w} id={x.region} /></td><td>{fmtWhen(w, x.done!)}</td>
            <td class="small">top: {Object.entries(x.contrib).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => w.citizens[Number(id)]?.name).join(', ')}</td></tr>
        ))}</tbody></table>
      </Panel>
    </div>
  );
}

function ProjectCard({ w, pr }: { w: World; pr: Project }) {
  const p = player(w);
  const n = w.nations[pr.nation];
  const [qty, setQty] = useState(10);
  const top = Object.entries(pr.contrib).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <Panel title={`${BUILDINGS[pr.type].icon} ${BUILDINGS[pr.type].name} L${pr.level}`} right={<RegionLink w={w} id={pr.region} />}>
      {n.priorities.project === pr.id && <p class="small good">★ National priority (public works shifts also add points)</p>}
      <Bar v={pr.points} max={pr.needPts} color="#e0a526" label={`Labour ${Math.round(pr.points)}/${pr.needPts}`} />
      {Object.entries(pr.needMats).map(([k, need]) => <Bar v={pr.mats[k] ?? 0} max={need} color="#5b8def" label={`${itemName(k)} ${pr.mats[k] ?? 0}/${need}`} />)}
      <p class="small">Your labour: {laborPoints(w, p, pr)} points per {B.cost.build} energy.</p>
      <ActBtn kind="primary" why={laborCheck(w, p, pr)} run={(w) => contributeLabor(w, p, pr.id, 1)}>Work ×1</ActBtn>
      <ActBtn why={laborCheck(w, p, pr)} showWhy={false} run={(w) => contributeLabor(w, p, pr.id, 5)}>Work ×5</ActBtn>
      <div class="form row">
        <Num value={qty} min={1} onInput={setQty} />
        {Object.keys(pr.needMats).map((k) => <ActBtn small why={donateCheck(w, p.id, cref(p.id), pr, k, qty)} showWhy={false} run={(w) => donateMaterials(w, p.id, cref(p.id), pr.id, k, qty)}>Deliver {itemName(k)} (have {p.inv[k] ?? 0})</ActBtn>)}
      </div>
      <ActBtn small why={null} run={(w) => fundProject(w, p.id, pr.id)} title="Requires construction authority">Deliver from national storage</ActBtn>
      <p class="small muted">Top contributors: {top.map(([id, v]) => `${w.citizens[Number(id)]?.name} (${Math.round(v)})`).join(', ') || 'none yet'}</p>
    </Panel>
  );
}

function StartPanel({ w, nid }: { w: World; nid: number }) {
  const p = player(w);
  const regions = w.regions.filter((r) => r.owner === nid && !r.occ);
  const [rid, setRid] = useState(regions[0]?.id ?? 0);
  const [type, setType] = useState<BuildingType>('hospital');
  const r = w.regions[rid];
  const why = startCheck(w, p.id, nid, rid, type);
  const need = r ? projectNeeds(w, rid, type, r.bld[type] + 1, w.nations[nid]) : null;
  return (
    <Panel title="Open a construction site">
      <div class="form">
        <label>Region <Select value={rid} options={regions.map((x) => [x.id, `${x.name} (H${x.bld.hospital} F${x.bld.fields} I${x.bld.industrial} B${x.bld.base})`])} onChange={setRid} /></label>
        <label>Building <Select value={type} options={(Object.keys(BUILDINGS) as BuildingType[]).map((b) => [b, BUILDINGS[b].name])} onChange={setType} /></label>
      </div>
      {need && <p class="small">Level {r.bld[type] + 1} needs {need.needPts} labour points and {Object.entries(need.needMats).map(([k, v]) => `${v} ${itemName(k)}`).join(', ')} (scaled by population; centralist congresses pay more).</p>}
      <ActBtn why={why} run={(w) => startProject(w, p.id, nid, rid, type)}>Start construction</ActBtn>
      <p class="small muted">Requires the president, vice president or development minister (<CitLink w={w} id={w.nations[nid].cabinet.development} /> now).</p>
      {void natref}
    </Panel>
  );
}
