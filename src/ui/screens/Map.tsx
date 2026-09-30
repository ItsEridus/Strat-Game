import type { Region, World } from '../../sim/types';
import { Btn, CitLink, NationChip, Panel, Tabs, Amt } from '../common';
import { store } from '../store';
import { controller, player } from '../../sim/query';
import { INDUSTRY_INFO } from '../../data/items';
import { RegionActions } from './RegionActions';

const HEX = 40;
const TERRAIN_COLOR: Record<string, string> = { plains: '#9bbf5a', mountains: '#8a7f73', forest: '#3f7d4a', desert: '#d8c27a' };
const RES_ICON: Record<string, string> = { grain: '🌾', iron: '🪨', titanium: '💠', oil: '🛢️' };
type Mode = 'political' | 'economic' | 'terrain' | 'pollution' | 'buildings' | 'supply' | 'war';

function hexPoints(r: Region) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(r.x + (HEX - 1) * Math.cos(a)).toFixed(1)},${(r.y + (HEX - 1) * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function MapScreen({ w }: { w: World }) {
  const p = player(w);
  const mode: Mode = store.sel.mapMode ?? 'political';
  const selId = store.sel.region ?? p.loc;
  const sel = w.regions[selId];
  const maxX = Math.max(...w.regions.map((r) => r.x)) + HEX * 1.2;
  const maxY = Math.max(...w.regions.map((r) => r.y)) + HEX * 1.2;
  const battleRegions = new Set(Object.values(w.battles).filter((b) => !b.done && b.kind === 'war').map((b) => b.region));
  const capitals = new Set(w.nations.map((n) => n.capital));
  const goalRegions = new Set(Object.values(w.wars).filter((x) => x.status === 'active').flatMap((x) => x.goals));
  const fill = (r: Region) => {
    const ctl = w.nations[controller(r)];
    switch (mode) {
      case 'terrain': return TERRAIN_COLOR[r.terrain];
      case 'pollution': return `hsl(${Math.round(120 - r.pollution * 120)}, 55%, 42%)`;
      case 'economic': return `hsl(210, 20%, ${22 + Math.min(40, r.pop / 3000)}%)`;
      case 'buildings': { const t = r.bld.hospital + r.bld.fields + r.bld.industrial + r.bld.base; return `hsl(40, 60%, ${18 + t * 3}%)`; }
      case 'supply': return r.supplied ? ctl.color : '#5a1d1d';
      default: return ctl.color;
    }
  };
  const label = (r: Region) => {
    if (mode === 'economic') return Object.entries(r.res).map(([k, v]) => RES_ICON[k] + v).join(' ');
    if (mode === 'buildings') return `H${r.bld.hospital} F${r.bld.fields} I${r.bld.industrial} B${r.bld.base}`;
    if (mode === 'pollution') return `${Math.round(r.pollution * 100)}%`;
    if (mode === 'terrain') return r.terrain;
    return '';
  };
  return (
    <div class="map-layout">
      <Panel title="World map" class="map-panel" right={
        <Tabs<Mode> tabs={[['political', 'Political'], ['economic', 'Resources'], ['terrain', 'Terrain'], ['pollution', 'Pollution'], ['buildings', 'Buildings'], ['supply', 'Supply'], ['war', 'War']]} value={mode} onChange={(m) => store.go('map', { mapMode: m })} />
      }>
        <svg viewBox={`0 0 ${maxX.toFixed(0)} ${maxY.toFixed(0)}`} class="map">
          {/* connections */}
          {w.regions.flatMap((r) => r.links.filter((l) => l > r.id).map((l) => {
            const o = w.regions[l];
            const border = controller(o) !== controller(r);
            return <line x1={r.x} y1={r.y} x2={o.x} y2={o.y} class={`link-line ${border ? 'border' : ''}`} />;
          }))}
          {w.regions.map((r) => {
            const occ = r.occ != null;
            return (
              <g onClick={() => store.go('map', { region: r.id })} class="hexg">
                <polygon points={hexPoints(r)} fill={fill(r)} class={`hex ${r.id === selId ? 'sel' : ''} ${occ ? 'occ' : ''} ${mode === 'war' && goalRegions.has(r.id) ? 'goal' : ''}`} />
                {occ && mode !== 'terrain' && <polygon points={hexPoints(r)} fill="url(#hatch)" style={{ color: w.nations[r.occ!.nation].color }} class="occ-overlay" />}
                {r.core !== r.owner && mode === 'political' && <circle cx={r.x + 22} cy={r.y - 20} r={5} fill={w.nations[r.core].color} stroke="#000" />}
                <text x={r.x} y={r.y + 16} class="rname">{r.name}</text>
                <text x={r.x} y={r.y - 2} class="ricon">
                  {battleRegions.has(r.id) ? '⚔️' : capitals.has(r.id) ? '★' : ''}{r.id === p.loc ? '📍' : ''}
                </text>
                {label(r) && <text x={r.x} y={r.y + 27} class="rlabel">{label(r)}</text>}
              </g>
            );
          })}
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="3" height="6" fill="currentColor" opacity="0.75" />
            </pattern>
          </defs>
        </svg>
        <div class="legend">
          {w.nations.map((n) => <NationChip w={w} id={n.id} />)}
          <span class="muted small">★ capital · 📍 you · ⚔️ battle · hatched = occupied (occupier colour) · dot = rightful owner · red edge = border</span>
        </div>
      </Panel>
      {sel && <RegionInfo w={w} r={sel} />}
    </div>
  );
}

function RegionInfo({ w, r }: { w: World; r: Region }) {
  const companies = Object.values(w.companies).filter((c) => c.region === r.id);
  const residents = Object.values(w.citizens).filter((c) => c.loc === r.id);
  const owner = w.nations[r.owner];
  const battles = Object.values(w.battles).filter((b) => !b.done && b.region === r.id);
  const proj = r.project != null ? w.projects[r.project] : null;
  return (
    <Panel title={`${r.name}`} class="region-panel">
      <table class="table compact"><tbody>
        <tr><td>Legal owner</td><td><NationChip w={w} id={r.owner} /></td></tr>
        <tr><td>Rightful (core)</td><td><NationChip w={w} id={r.core} /></td></tr>
        <tr><td>Occupier</td><td>{r.occ ? <NationChip w={w} id={r.occ.nation} /> : <span class="muted">none</span>}</td></tr>
        <tr><td>Capital</td><td>{owner.capital === r.id ? `★ ${owner.name}` : w.nations.some((n) => n.capital === r.id) ? `rightful capital of ${w.nations.find((n) => n.capital === r.id)!.name}` : 'no'}</td></tr>
        <tr><td>Supply to capital</td><td>{r.supplied ? 'connected' : <b class="warn">cut</b>}</td></tr>
        <tr><td>Terrain</td><td>{r.terrain}</td></tr>
        <tr><td>Resources</td><td>{Object.entries(r.res).map(([k, v]) => `${RES_ICON[k]} ${k} ${'●'.repeat(v)}`).join('  ') || 'none'}</td></tr>
        <tr><td>Population</td><td>{r.pop.toLocaleString()} residents · {residents.length} citizens here</td></tr>
        <tr><td>Pollution</td><td>{Math.round(r.pollution * 100)}% (output ×{(1 - 0.9 * r.pollution).toFixed(2)})</td></tr>
        <tr><td>Buildings</td><td>🏥 {r.bld.hospital} · 🌾 fields {r.bld.fields} · 🏭 industrial {r.bld.industrial} · 🛡️ base {r.bld.base}</td></tr>
        <tr><td>Construction</td><td>{proj ? <span class="link" onClick={() => store.go('construction', { project: proj.id })}>{proj.type} L{proj.level}: {Math.round(proj.points)}/{proj.needPts} pts</span> : 'none'}</td></tr>
        <tr><td>Treasury (owner)</td><td><Amt asset={owner.cur} v={owner.wallet[owner.cur] ?? 0} /></td></tr>
        <tr><td>Governor</td><td>President <CitLink w={w} id={w.nations[controller(r)].president} /></td></tr>
      </tbody></table>
      {battles.map((b) => <p>⚔️ Battle: <NationChip w={w} id={b.att} /> vs <NationChip w={w} id={b.def} /> <Btn small onClick={() => store.go('battle', { battle: b.id })}>Open</Btn></p>)}
      <h4>Companies ({companies.length})</h4>
      <ul class="small">{companies.slice(0, 12).map((c) => <li>{INDUSTRY_INFO[c.industry].icon} {c.name} Q{c.q} · {c.workers.length} workers</li>)}</ul>
      <RegionActions w={w} r={r} />
    </Panel>
  );
}
