// Builds src/data/earth.json from Natural Earth 1:10m data (public domain) and
// tools/earth-defs.mjs. Run: npm run earth. The source files are downloaded to
// tools/ne/ on first run (not committed); the output is committed, so building
// or playing the game never needs this.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { NATIONS, classify, government, HOTSPOTS, ROUTES, NO_WAGE_TAX, FOREST_ZONES, DRY_ZONES } from './earth-defs.mjs';

const require = createRequire(import.meta.url);
const { topology } = require('topojson-server');
const { feature, merge, mesh, neighbors } = require('topojson-client');
const { presimplify, simplify, quantile, sphericalTriangleArea } = require('topojson-simplify');
const { geoNaturalEarth1, geoPath, geoContains, geoBounds, geoCentroid, geoArea, geoDistance, geoGraticule10 } = require('d3-geo');

const NE = new URL('./ne/', import.meta.url);
const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
function load(name) {
  const file = new URL(`${name}.geojson`, NE);
  if (!existsSync(file)) {
    mkdirSync(NE, { recursive: true });
    console.log(`downloading ${name}…`);
    execFileSync('curl', ['-sSfL', '-o', file.pathname, `${SRC}${name}.geojson`]);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

const admin0 = load('ne_10m_admin_0_countries').features.filter((f) => f.properties.ADM0_A3 !== 'ATA');
const admin1 = load('ne_10m_admin_1_states_provinces').features;
const places = load('ne_10m_populated_places_simple').features.map((f) => f.properties);
const geo = load('ne_10m_geography_regions_polys').features.filter((f) => ['Desert', 'Range/mtn', 'Plateau', 'Foothills'].includes(f.properties.FEATURECLA));
const lakes = load('ne_10m_lakes').features.filter((f) => f.properties.scalerank <= 2);

// ---- Regions from admin-1 units ----
const regions = []; // { key, nation, name, kind, units: [feature] }
const byKey = new Map();
const pendingMerges = [];
NATIONS.forEach((n, ni) => {
  for (const f of admin1.filter((x) => x.properties.adm0_a3 === n.iso3)) {
    const c = classify(n.iso3, f.properties);
    if (!c) continue;
    if (c.merge && n.iso3 !== 'GBR') { pendingMerges.push({ key: `${n.iso3}/${c.merge}`, f }); continue; }
    const name = c.merge ?? c.name;
    const key = `${n.iso3}/${name}`;
    let r = byKey.get(key);
    if (!r) { r = { key, nation: ni, name, kind: c.kind, units: [] }; byKey.set(key, r); regions.push(r); }
    r.units.push(f);
  }
});
for (const { key, f } of pendingMerges) byKey.get(key).units.push(f);
// Stable order: by nation, then name.
regions.sort((a, b) => a.nation - b.nation || a.name.localeCompare(b.name));
regions.forEach((r, i) => { r.id = i; for (const u of r.units) u.properties._rid = i; });

// ---- Shared topology: exact shared borders, then topology-preserving simplification ----
const units = regions.flatMap((r) => r.units);
let topo = topology({ units: { type: 'FeatureCollection', features: units }, land: { type: 'FeatureCollection', features: admin0 }, lakes: { type: 'FeatureCollection', features: lakes } }, 1e5);
topo = presimplify(topo, sphericalTriangleArea);
topo = simplify(topo, quantile(topo, 0.12)); // keep the most significant 12% of points
const unitGeoms = topo.objects.units.geometries;

const width = 2000;
const landFc = feature(topo, topo.objects.land);
const projection = geoNaturalEarth1().fitWidth(width, landFc);
const [[, y0], [, y1]] = geoPath(projection).bounds(landFc);
projection.translate([projection.translate()[0], projection.translate()[1] - y0 + 10]);
const height = Math.ceil(y1 - y0 + 20);
const path = geoPath(projection).digits(1);
const r1 = (v) => Math.round(v * 10) / 10;
// Drop specks (islets under ~0.4 px² at full-world zoom) from drawn shapes; the
// largest piece is always kept so every region stays visible.
function drawable(g, min = 0.4) {
  if (g.type !== 'MultiPolygon' && g.type !== 'GeometryCollection') return g;
  const polys = g.type === 'MultiPolygon' ? g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })) : g.geometries.flatMap((x) => (x.type === 'MultiPolygon' ? x.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })) : x.type === 'Polygon' ? [x] : []));
  const areas = polys.map((q) => path.area(q));
  const top = Math.max(...areas);
  return { type: 'MultiPolygon', coordinates: polys.filter((_, i) => areas[i] >= min || areas[i] === top).map((q) => q.coordinates) };
}
const playableIso = new Set(NATIONS.map((n) => n.iso3));

/** A point inside a polygon: the sample farthest from its bounding-box edges that lies inside. */
function interiorPoint(poly) {
  const [[w, sth], [e, n]] = geoBounds(poly);
  const east = e < w ? e + 360 : e;
  let best = geoCentroid(poly), bestScore = -1;
  for (let i = 1; i < 20; i++) for (let j = 1; j < 20; j++) {
    let lon = w + ((east - w) * i) / 20; if (lon > 180) lon -= 360;
    const lat = sth + ((n - sth) * j) / 20;
    const score = Math.min(i, 20 - i) + Math.min(j, 20 - j);
    if (score > bestScore && geoContains(poly, [lon, lat])) { bestScore = score; best = [lon, lat]; }
  }
  return best;
}

// Region geometry (merged units) and derived data.
for (const r of regions) {
  const geoms = unitGeoms.filter((g) => g.properties._rid === r.id);
  r.geom = merge(topo, geoms);
  const polys = r.geom.type === 'MultiPolygon' ? r.geom.coordinates : [r.geom.coordinates];
  const largest = polys.map((c) => ({ type: 'Polygon', coordinates: c })).sort((a, b) => geoArea(b) - geoArea(a))[0];
  r.largest = largest;
  const p = r.units[0].properties;
  // Natural Earth's label point when it sits on the mainland part, else the centroid of the largest piece.
  r.label = r.units.length === 1 && p.longitude != null && geoContains(largest, [p.longitude, p.latitude]) ? [p.longitude, p.latitude] : geoCentroid(largest);
  if (!geoContains(largest, r.label)) r.label = interiorPoint(largest);
  const b = path.bounds(r.geom);
  r.span = r1(b[1][0] - b[0][0]);
  r.bounds = geoBounds(r.geom);
}

// ---- Adjacency: shared arcs in the topology ----
const nb = neighbors(unitGeoms);
const links = regions.map(() => new Set());
unitGeoms.forEach((g, i) => { for (const j of nb[i]) { const a = g.properties._rid, b = unitGeoms[j].properties._rid; if (a !== b) { links[a].add(b); links[b].add(a); } } });
// Fallback: borders digitised separately (e.g. between countries) may not share arcs exactly.
const cell = 0.02;
const vset = regions.map((r) => {
  const s = new Set();
  const walk = (c) => (typeof c[0] === 'number' ? s.add(`${Math.round(c[0] / cell)},${Math.round(c[1] / cell)}`) : c.forEach(walk));
  walk(r.geom.coordinates);
  return s;
});
const overlap = (a, b) => !(a[1][0] < b[0][0] - 0.1 || b[1][0] < a[0][0] - 0.1 || a[1][1] < b[0][1] - 0.1 || b[1][1] < a[0][1] - 0.1);
for (let a = 0; a < regions.length; a++) for (let b = a + 1; b < regions.length; b++) {
  if (links[a].has(b) || !overlap(regions[a].bounds, regions[b].bounds)) continue;
  let shared = 0;
  for (const k of vset[a]) if (vset[b].has(k) && ++shared >= 3) break;
  if (shared >= 3) { links[a].add(b); links[b].add(a); }
}
const routes = [];
const addLink = (a, b, name) => { if (a === b || links[a].has(b)) return; links[a].add(b); links[b].add(a); routes.push({ a, b, name }); };
// Straits: join each nation's islands and exclaves to the rest (nearest label points).
NATIONS.forEach((_, ni) => {
  const own = regions.filter((r) => r.nation === ni).map((r) => r.id);
  for (;;) {
    const comp = new Set([own[0]]);
    const st = [own[0]];
    while (st.length) for (const l of links[st.pop()]) if (regions[l].nation === ni && !comp.has(l)) { comp.add(l); st.push(l); }
    if (comp.size === own.length) break;
    let best = null;
    for (const a of comp) for (const b of own) if (!comp.has(b)) {
      const d = geoDistance(regions[a].label, regions[b].label);
      if (!best || d < best.d) best = { a, b, d };
    }
    addLink(best.a, best.b, 'Strait');
  }
});
const find = (key) => { const r = byKey.get(key); if (!r) throw new Error(`Unknown region ${key}`); return r.id; };
for (const [a, b, name] of ROUTES) addLink(find(a), find(b), name);
{
  const seen = new Set([0]); const st = [0];
  while (st.length) for (const l of links[st.pop()]) if (!seen.has(l)) { seen.add(l); st.push(l); }
  if (seen.size !== regions.length) throw new Error(`Map not connected: ${regions.filter((r) => !seen.has(r.id)).map((r) => r.key).join(', ')}`);
}

// ---- Places: seats of government and population weight ----
const inside = (r, lon, lat) => {
  const [[w, s], [e, n]] = r.bounds;
  if (lat < s - 0.01 || lat > n + 0.01) return false;
  if (w <= e && (lon < w - 0.01 || lon > e + 0.01)) return false;
  return geoContains(r.geom, [lon, lat]);
};
for (const r of regions) { r.popReal = 0; r.places = []; }
for (const pl of places) {
  if (!pl.pop_max || pl.featurecla === 'Scientific station') continue;
  const iso = pl.adm0_a3;
  const cands = regions.filter((r) => NATIONS[r.nation].iso3 === iso);
  const r = cands.find((x) => inside(x, pl.longitude, pl.latitude));
  if (!r) continue;
  r.popReal += pl.pop_max;
  r.places.push(pl);
}
for (const r of regions) {
  const bySize = [...r.places].sort((a, b) => b.pop_max - a.pop_max);
  const seat = r.places.filter((p) => /Admin-0 capital$/.test(p.featurecla)).sort((a, b) => b.pop_max - a.pop_max)[0]
    ?? r.places.filter((p) => /Admin-1 capital|region capital/.test(p.featurecla)).sort((a, b) => b.pop_max - a.pop_max)[0]
    ?? bySize[0];
  r.seat = seat?.name ?? r.name;
  r.city = bySize[0]?.name ?? r.seat;
  if (!r.popReal) r.popReal = 20000;
}

// ---- Terrain: sample points inside the region against real deserts and ranges ----
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const geoBox = geo.map((f) => ({ f, cls: f.properties.FEATURECLA, b: geoBounds(f) }));
function terrainOf(r) {
  const [[w, s], [e, n]] = geoBounds(r.largest);
  const east = e < w ? e + 360 : e;
  const votes = { plains: 0, forest: 0, desert: 0, mountains: 0 };
  let got = 0;
  for (let t = 0; t < 600 && got < 40; t++) {
    let lon = w + rnd() * (east - w); if (lon > 180) lon -= 360;
    const lat = s + rnd() * (n - s);
    if (!geoContains(r.largest, [lon, lat])) continue;
    got++;
    let cls = null;
    for (const g of geoBox) {
      const [[gw, gs], [ge, gn]] = g.b;
      if (lat < gs || lat > gn || (gw <= ge && (lon < gw || lon > ge))) continue;
      if (geoContains(g.f, [lon, lat])) { cls = g.cls; if (cls === 'Desert' || cls === 'Range/mtn') break; }
    }
    const inZone = (zones) => zones.some(([zw, zs, ze, zn]) => lon >= zw && lon <= ze && lat >= zs && lat <= zn);
    if (cls === 'Range/mtn') votes.mountains += 1;
    else if (cls === 'Plateau' || cls === 'Foothills') votes.mountains += 0.5;
    if (cls === 'Desert' || inZone(DRY_ZONES)) votes.desert += 1;
    else if (inZone(FOREST_ZONES)) votes.forest += 1;
    else votes.plains += 1;
  }
  // Dense, mostly urban regions read as open (plains) ground.
  const km2 = geoArea(r.geom) * 6371 ** 2;
  if (r.popReal / km2 > 1500) return 'plains';
  if (!got) return 'plains';
  if (votes.mountains / got >= 0.45) return 'mountains';
  const { mountains, ...rest } = votes;
  return Object.entries(rest).sort((a, b) => b[1] - a[1])[0][0];
}

// Listed farm belts are open, cultivated land unless mostly mountainous.
const farmBelt = (r, t) => (HOTSPOTS[r.key]?.includes('grain') && t !== 'mountains' ? 'plains' : t);

// ---- Output ----
const out = {
  width, height,
  // Neutral countries only; playable land is drawn as regions.
  background: path(drawable({ type: 'GeometryCollection', geometries: feature(topo, topo.objects.land).features.filter((f) => !playableIso.has(f.properties.ADM0_A3)).map((f) => f.geometry) })),
  lakes: path(feature(topo, topo.objects.lakes)),
  graticule: path(geoGraticule10()),
  // Coastlines and international borders of playable nations (drawn over region fills).
  nationBorders: path(mesh(topo, topo.objects.units, (a, b) => a === b || regions[a.properties._rid].nation !== regions[b.properties._rid].nation)),
  nations: [], regions: [], routes,
};
const nationPop = Object.fromEntries(admin0.map((f) => [f.properties.ADM0_A3, f.properties.POP_EST]));
NATIONS.forEach((n, ni) => {
  const own = regions.filter((r) => r.nation === ni);
  const outline = merge(topo, unitGeoms.filter((g) => regions[g.properties._rid].nation === ni));
  const polys = outline.coordinates.map((c) => ({ type: 'Polygon', coordinates: c })).sort((a, b) => geoArea(b) - geoArea(a));
  const [lx, ly] = projection(geoCentroid(polys[0]));
  const b = path.bounds(polys[0]);
  const capital = own.find((r) => r.name === n.capital);
  if (!capital) throw new Error(`Capital region ${n.capital} missing for ${n.name}`);
  out.nations.push({
    name: n.name, code: n.code, adj: n.adj, color: n.color, cur: n.cur, iso: n.iso3, leader: n.leader, legislature: n.legislature,
    capital: capital.id, pop: nationPop[n.iso3] ?? 0, label: [r1(lx), r1(ly)], span: r1(b[1][0] - b[0][0]),
  });
});
for (const r of regions) {
  const [x, y] = projection(r.label);
  const gov = government(NATIONS[r.nation].iso3, r.name, r.kind);
  out.regions.push({
    name: r.name, nation: r.nation, kind: r.kind, seat: r.seat, city: r.city, gov, noWageTax: NO_WAGE_TAX.includes(r.key) || undefined,
    terrain: farmBelt(r, terrainOf(r)), res: HOTSPOTS[r.key] ?? [], popReal: r.popReal,
    x: r1(x), y: r1(y), lon: +r.label[0].toFixed(3), lat: +r.label[1].toFixed(3), span: r.span, path: path(drawable(r.geom)), links: [...links[r.id]].sort((a, b) => a - b),
  });
}
for (const k of Object.keys(HOTSPOTS)) find(k);

writeFileSync(new URL('../src/data/earth.json', import.meta.url), JSON.stringify(out));
const count = (iso) => regions.filter((r) => NATIONS[r.nation].iso3 === iso).length;
console.log(`earth.json: ${regions.length} regions (${NATIONS.map((n) => `${n.code} ${count(n.iso3)}`).join(', ')}), ${routes.length} routes, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
const t = {}; for (const r of out.regions) t[r.terrain] = (t[r.terrain] ?? 0) + 1;
console.log('terrain:', JSON.stringify(t), '| straits:', routes.filter((x) => x.name === 'Strait').map((x) => `${regions[x.a].name}–${regions[x.b].name}`).join('; '));
const cross = out.regions.flatMap((r, i) => r.links.filter((l) => l > i && out.regions[l].nation !== r.nation && !routes.some((x) => (x.a === i && x.b === l) || (x.a === l && x.b === i))).map((l) => `${r.name}–${out.regions[l].name}`));
console.log(`land borders between nations (${cross.length}):`, cross.join('; '));
