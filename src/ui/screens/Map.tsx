import { memo } from 'preact/compat';
import { census } from '../../sim/census';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Region, World } from '../../sim/types';
import { Btn, CitLink, NationChip, Panel, Tabs, Amt } from '../common';
import { store } from '../store';
import { controller, player } from '../../sim/query';
import { INDUSTRY_INFO, grade } from '../../data/items';
import { EARTH } from '../../data/earth';
import { RegionActions } from './RegionActions';
import { StateGovPanel } from './StateGov';
import { activeCrises, KIND_ICON } from '../../sim/dynamics';
import { visible } from '../../sim/forces';
import { BRANCH_ICON } from '../../data/military';

const CRISIS_COLOR: Record<string, string> = { hurricane: '#5b8def', earthquake: '#8e6e53', flood: '#2e86c1', wildfire: '#e67e22', blizzard: '#d6eaf8', drought: '#d4ac0d', epidemic: '#27ae60', protest: '#f39c12', riot: '#c0392b', strike: '#a569bd' };
import { IDEOLOGIES, IDEOLOGY_LIST } from '../../data/ideologies';

const TERRAIN_COLOR: Record<string, string> = { plains: '#9bbf5a', mountains: '#8a7f73', forest: '#3f7d4a', desert: '#d8c27a' };
const RES_ICON: Record<string, string> = { grain: '🌾', iron: '🪨', titanium: '💠', oil: '🛢️' };
type Mode = 'political' | 'military' | 'government' | 'crime' | 'unrest' | 'crises' | 'economic' | 'terrain' | 'pollution' | 'buildings' | 'supply' | 'war';

const MW = EARTH.width, MH = EARTH.height;
const MAX_ZOOM = 14;
interface View { x: number; y: number; w: number }
// The camera survives screen changes (module state, not saved).
let camera: View = { x: 0, y: 0, w: MW };

function clampView(v: View): View {
  const w = Math.max(MW / MAX_ZOOM, Math.min(MW, v.w));
  const h = (w * MH) / MW;
  return { w, x: Math.max(0, Math.min(MW - w, v.x)), y: Math.max(0, Math.min(MH - h, v.y)) };
}

/** Route lines; ones that cross the map edge (e.g. the Pacific) are drawn as two stubs. */
function routeSegments(a: Region, b: Region): [number, number, number, number][] {
  if (Math.abs(a.x - b.x) <= MW / 2) return [[a.x, a.y, b.x, b.y]];
  const [l, r] = a.x < b.x ? [a, b] : [b, a];
  const dx = l.x + MW - r.x;
  const yEdge = l.y + ((r.y - l.y) * l.x) / dx;
  return [[l.x, l.y, 0, yEdge], [r.x, r.y, MW, yEdge]];
}

const routeName = (a: number, b: number) => EARTH.routes.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))?.name;

// Static layers: neutral countries and graticule never change, so they skip re-rendering.
// Lakes and national borders/coastlines sit above the region fills.
const Overlay = memo(() => (
  <>
    <path d={EARTH.lakes} class="lakes" />
    <path d={EARTH.nationBorders} class="nation-borders" />
  </>
));

const Backdrop = memo(() => (
  <>
    <rect x={0} y={0} width={MW} height={MH} class="ocean" />
    <path d={EARTH.graticule} class="graticule" />
    <path d={EARTH.background} class="land" />
  </>
));


export function MapScreen({ w }: { w: World }) {
  const p = player(w);
  const mode: Mode = store.sel.mapMode ?? 'political';
  const selId = store.sel.region ?? p.loc;
  const sel = w.regions[selId];
  const [view, setViewState] = useState<View>(camera);
  const setView = (v: View) => { camera = clampView(v); setViewState(camera); };
  const svgRef = useRef<SVGSVGElement>(null);
  const [pxWidth, setPxWidth] = useState(1000);
  const drag = useRef<{ sx: number; sy: number; v: View; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => setPxWidth(el.clientWidth || 1000);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    // Wheel zoom needs a non-passive listener to stop the page scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { ro?.disconnect(); el.removeEventListener('wheel', onWheel); };
  }, []);

  function zoomAt(factor: number, fx = 0.5, fy = 0.5) {
    const v = camera;
    const h = (v.w * MH) / MW;
    const nw = Math.max(MW / MAX_ZOOM, Math.min(MW, v.w / factor));
    const nh = (nw * MH) / MW;
    setView({ w: nw, x: v.x + fx * v.w - fx * nw, y: v.y + fy * h - fy * nh });
  }
  const focus = (r: Region, zoom = 4) => { const nw = MW / zoom; setView({ w: nw, x: r.x - nw / 2, y: r.y - (nw * MH) / MW / 2 }); };

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, v: camera, moved: false };
    suppressClick.current = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !svgRef.current) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); }
    const k = d.v.w / svgRef.current.clientWidth;
    setView({ w: d.v.w, x: d.v.x - dx * k, y: d.v.y - dy * k });
  };
  const onPointerUp = () => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; };
  const pick = (r: Region) => { if (suppressClick.current) { suppressClick.current = false; return; } store.go('map', { region: r.id }); };

  const zoom = MW / view.w;
  const u = view.w / pxWidth; // map units per screen pixel, for constant-size text
  const battleRegions = new Set(Object.values(w.battles).filter((b) => !b.done && b.kind === 'war').map((b) => b.region));
  const capitals = new Set(w.nations.filter((n) => !n.exile).map((n) => n.capital));
  const forcesAt = new Map<number, Record<string, number>>();
  const fleetsAt = new Map<string, Record<number, number>>();
  if (mode === 'military') for (const f of Object.values(w.forces)) {
    if (!visible(w, p.nation, f)) continue;
    if (f.branch === 'navy') { if (f.zone) { const m = fleetsAt.get(f.zone) ?? {}; m[f.nation] = (m[f.nation] ?? 0) + 1; fleetsAt.set(f.zone, m); } continue; }
    const m = forcesAt.get(f.loc) ?? {}; m[f.branch] = (m[f.branch] ?? 0) + 1; forcesAt.set(f.loc, m);
  }
  const crisisAt = new Map<number, string>();
  for (const c of activeCrises(w)) for (const rid of c.regions) if (!crisisAt.has(rid)) crisisAt.set(rid, c.kind);
  const warPairs = new Set(Object.values(w.wars).filter((x) => x.status === 'active').flatMap((x) => [`${x.att}:${x.def}`, `${x.def}:${x.att}`]));
  const goalRegions = new Set(Object.values(w.wars).filter((x) => x.status === 'active').flatMap((x) => x.goals));
  const fill = (r: Region) => {
    const ctl = w.nations[controller(r)];
    switch (mode) {
      case 'terrain': return TERRAIN_COLOR[r.terrain];
      case 'pollution': return `hsl(${Math.round(120 - r.pollution * 120)}, 55%, 42%)`;
      case 'economic': return `hsl(210, 25%, ${22 + Math.min(40, r.pop / 3000)}%)`;
      case 'buildings': { const t = r.bld.hospital + r.bld.fields + r.bld.industrial + r.bld.base; return `hsl(40, 60%, ${18 + t * 3}%)`; }
      case 'supply': return r.supplied ? ctl.color : '#5a1d1d';
      case 'crime': return `hsl(${Math.round(120 - r.crime * 1.2)}, 60%, ${30 + r.crime / 5}%)`;
      case 'unrest': return `hsl(${Math.round(50 - r.unrest / 2)}, ${40 + r.unrest / 2}%, ${28 + r.unrest / 4}%)`;
      case 'crises': { const c = crisisAt.get(r.id); return c ? CRISIS_COLOR[c] ?? '#c0392b' : '#3a414d'; }
      case 'government': { const s = w.govs[r.id]; return s ? IDEOLOGIES[s.head.ideo].color : '#3a414d'; }
      default: return ctl.color;
    }
  };
  const label = (r: Region) => {
    if (mode === 'economic') return Object.entries(r.res).map(([k, v]) => RES_ICON[k] + v).join(' ');
    if (mode === 'buildings') return `H${r.bld.hospital} F${r.bld.fields} I${r.bld.industrial} B${r.bld.base}`;
    if (mode === 'pollution') return `${Math.round(r.pollution * 100)}%`;
    if (mode === 'terrain') return r.terrain;
    if (mode === 'crime') return `${Math.round(r.crime)}`;
    if (mode === 'unrest') return `${Math.round(r.unrest)}`;
    if (mode === 'military') { const fs = forcesAt.get(r.id); return fs ? (['army', 'air'] as const).map((b) => fs[b] ? `${BRANCH_ICON[b]}${fs[b]}` : '').join('') : ''; }
    if (mode === 'crises') return crisisAt.has(r.id) ? KIND_ICON[crisisAt.get(r.id) as keyof typeof KIND_ICON] : '';
    return '';
  };
  const tip = (r: Region) => {
    const ctl = controller(r);
    return `${r.name} — ${w.nations[r.owner].name}${r.occ ? ` (occupied by ${w.nations[ctl].name})` : ''}${r.core !== r.owner ? ` · rightful: ${w.nations[r.core].name}` : ''}`;
  };
  const showRegionNames = zoom >= 2.4;
  const showDetail = zoom >= 1.6;
  return (
    <div class="map-layout">
      <Panel title="World map" class="map-panel" right={
        <Tabs<Mode> tabs={[['political', 'Political'], ['military', 'Military'], ['government', 'Governments'], ['crime', 'Crime'], ['unrest', 'Unrest'], ['crises', 'Crises'], ['economic', 'Resources'], ['terrain', 'Terrain'], ['pollution', 'Pollution'], ['buildings', 'Buildings'], ['supply', 'Supply'], ['war', 'War']]} value={mode} onChange={(m) => store.go('map', { mapMode: m })} />
      }>
        <div class="map-wrap">
          <svg ref={svgRef} viewBox={`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${((view.w * MH) / MW).toFixed(1)}`} class="map"
            style={{ aspectRatio: `${MW} / ${MH}` }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
            onDblClick={(e) => { const rect = svgRef.current!.getBoundingClientRect(); zoomAt(2, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height); }}>
            <defs>
              <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="2" height="4" fill="currentColor" opacity="0.8" />
              </pattern>
            </defs>
            <Backdrop />
            {w.regions.map((r) => {
              const e = EARTH.regions[r.id];
              const cls = `region ${r.id === selId ? 'sel' : ''} ${mode === 'war' && goalRegions.has(r.id) ? 'goal' : ''} ${mode === 'supply' && !r.supplied ? 'cut' : ''}`;
              return (
                <g onClick={() => pick(r)} class="rg">
                  <path d={e.path} fill={fill(r)} class={cls}><title>{tip(r)}</title></path>
                  {r.occ && mode !== 'terrain' && <path d={e.path} fill="url(#hatch)" style={{ color: w.nations[r.occ.nation].color }} class="occ-overlay" />}
                </g>
              );
            })}
            {/* the selected region's outline on top of its neighbours */}
            <Overlay />
            {mode === 'military' && EARTH.seas.map((z) => {
              const fl = fleetsAt.get(z.name);
              return (
                <g class="sea-label">
                  <text x={z.x} y={z.y} class="sealabel" style={{ fontSize: `${10 * u}px`, strokeWidth: `${2.5 * u}px` }}>{z.name}</text>
                  {fl && <text x={z.x} y={z.y + 13 * u} class="ricon" style={{ fontSize: `${11 * u}px` }}>{Object.values(fl).map((c) => `⚓${c}`).join(' ')}</text>}
                  {fl && Object.keys(fl).map((n, i) => <circle cx={z.x - 10 * u + i * 9 * u} cy={z.y + 24 * u} r={3.5 * u} fill={w.nations[Number(n)].color} stroke="#000" stroke-width={u / 2} />)}
                </g>
              );
            })}
            {sel && <path d={EARTH.regions[sel.id].path} class="sel-outline" />}
            {EARTH.routes.flatMap((rt) => routeSegments(w.regions[rt.a], w.regions[rt.b]).map(([x1, y1, x2, y2]) => (
              <line x1={x1} y1={y1} x2={x2} y2={y2} class={`route ${rt.name === 'Strait' ? 'strait' : ''} ${warPairs.has(`${controller(w.regions[rt.a])}:${controller(w.regions[rt.b])}`) ? 'front' : ''}`}><title>{rt.name === 'Strait' ? 'Strait' : `${rt.name} route`}: {w.regions[rt.a].name} ↔ {w.regions[rt.b].name}</title></line>
            )))}
            {!showRegionNames && w.nations.filter((n) => !n.exile).map((n) => {
              const e = EARTH.nations[n.id];
              // Small countries get their three-letter code until zoomed in.
              const text = e.span / u > n.name.length * 9 ? n.name : e.code;
              return <text x={e.label[0]} y={e.label[1]} class="nlabel" style={{ fontSize: `${(text === n.name ? 12 : 10) * u}px`, strokeWidth: `${3 * u}px` }}>{text}</text>;
            })}
            {w.regions.map((r) => {
              const icon = `${battleRegions.has(r.id) ? '⚔️' : capitals.has(r.id) ? '★' : ''}${r.id === p.loc ? '📍' : ''}`;
              const extra = showDetail ? label(r) : '';
              return (
                <g class="rtext">
                  {icon && <text x={r.x} y={r.y - (showRegionNames ? 7 * u : -4 * u)} class="ricon" style={{ fontSize: `${13 * u}px` }}>{icon}</text>}
                  {showRegionNames && (EARTH.regions[r.id].span / u > r.name.length * 5.5 || zoom >= 9) && <text x={r.x} y={r.y + 4 * u} class="rname" style={{ fontSize: `${11 * u}px`, strokeWidth: `${2.5 * u}px` }}>{r.name}</text>}
                  {extra && <text x={r.x} y={r.y + (showRegionNames ? 16 : 6) * u} class="rlabel" style={{ fontSize: `${10 * u}px`, strokeWidth: `${2.5 * u}px` }}>{extra}</text>}
                  {r.core !== r.owner && mode === 'political' && showDetail && <circle cx={r.x + 12 * u} cy={r.y - 12 * u} r={4 * u} fill={w.nations[r.core].color} stroke="#000" stroke-width={u} />}
                </g>
              );
            })}
          </svg>
          <div class="map-controls">
            <button class="btn sm" title="Zoom in" onClick={() => zoomAt(1.6)}>＋</button>
            <button class="btn sm" title="Zoom out" onClick={() => zoomAt(1 / 1.6)}>－</button>
            <button class="btn sm" title="Whole world" onClick={() => setView({ x: 0, y: 0, w: MW })}>🌍</button>
            <button class="btn sm" title="Your location" onClick={() => focus(w.regions[p.loc])}>📍</button>
            {sel && <button class="btn sm" title="Selected region" onClick={() => focus(sel)}>🔎</button>}
          </div>
        </div>
        <div class="row small map-find">
          <span class="muted">Scroll or ＋/－ to zoom, drag to pan, double-click to zoom in. Find:</span>
          <select value={selId} onChange={(e) => { const r = w.regions[Number((e.target as HTMLSelectElement).value)]; store.go('map', { region: r.id }); focus(r); }}>
            {w.nations.map((n) => (
              <optgroup label={n.name}>
                {w.regions.filter((r) => r.core === n.id).map((r) => <option value={r.id}>{r.name}{r.owner !== n.id ? ` (${w.nations[r.owner].name})` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div class="legend">
          {mode === 'government'
            ? IDEOLOGY_LIST.map((i) => <span class="ideo-chip" style={{ background: IDEOLOGIES[i].color }}>{IDEOLOGIES[i].name}</span>)
            : w.nations.map((n) => <NationChip w={w} id={n.id} />)}
          {mode === 'government' && <span class="muted small">Colour = ideology of each state/provincial head · grey = no regional government.</span>}
          <span class="muted small">★ capital · 📍 you · ⚔️ battle · hatched = occupied (occupier colour) · dot = rightful owner · dashed = sea lane / corridor (red between nations at war)</span>
        </div>
      </Panel>
      {sel && <RegionInfo w={w} r={sel} />}
    </div>
  );
}

function RegionInfo({ w, r }: { w: World; r: Region }) {
  const companies = Object.values(w.companies).filter((c) => c.region === r.id);
  const residents = census(w).all.filter((c) => c.loc === r.id);
  const owner = w.nations[r.owner];
  const ruler = w.nations[controller(r)];
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
        <tr><td>Seat · largest city</td><td>{EARTH.regions[r.id].seat}{EARTH.regions[r.id].city !== EARTH.regions[r.id].seat ? ` · ${EARTH.regions[r.id].city}` : ''}</td></tr>
        <tr><td>Population</td><td>{r.pop.toLocaleString()} residents · {residents.length} citizens here</td></tr>
        <tr><td>Pollution</td><td>{Math.round(r.pollution * 100)}% (output ×{(1 - 0.9 * r.pollution).toFixed(2)})</td></tr>
        <tr><td>Buildings</td><td>🏥 {r.bld.hospital} · 🌾 fields {r.bld.fields} · 🏭 industrial {r.bld.industrial} · 🛡️ base {r.bld.base}</td></tr>
        <tr><td>Construction</td><td>{proj ? <span class="link" onClick={() => store.go('construction', { project: proj.id })}>{proj.type} L{proj.level}: {Math.round(proj.points)}/{proj.needPts} pts</span> : 'none'}</td></tr>
        <tr><td>Treasury (owner)</td><td><Amt asset={owner.cur} v={owner.wallet[owner.cur] ?? 0} /></td></tr>
        <tr><td>National leader</td><td>{ruler.leader} <CitLink w={w} id={ruler.president} /></td></tr>
        <tr><td>Connections</td><td class="small">{r.links.map((l) => {
          const o = w.regions[l];
          const via = routeName(r.id, l);
          return <div><span class="link" onClick={() => store.go('map', { region: l })}>{o.name}</span> <span class="muted">({w.nations[controller(o)].name}{via ? ` · ${via === 'Strait' ? 'strait' : via}` : ''})</span></div>;
        })}</td></tr>
      </tbody></table>
      {battles.map((b) => <p>⚔️ Battle: <NationChip w={w} id={b.att} /> vs <NationChip w={w} id={b.def} /> <Btn small onClick={() => store.go('battle', { battle: b.id })}>Open</Btn></p>)}
      <h4>Companies ({companies.length})</h4>
      <ul class="small">{companies.slice(0, 12).map((c) => <li>{INDUSTRY_INFO[c.industry].icon} {c.name} · {grade(c.q)} · {c.workers.length} workers</li>)}</ul>
      <StateGovPanel w={w} r={r} />
      <RegionActions w={w} r={r} />
    </Panel>
  );
}
