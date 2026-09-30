// Builds src/data/earth.json from Natural Earth country shapes (world-atlas,
// public domain) and tools/earth-defs.mjs. Run: node tools/build-earth.mjs
// The output is committed, so building or playing the game never needs this.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { NATIONS, ROUTES } from './earth-defs.mjs';

const require = createRequire(import.meta.url);
const topo = require('world-atlas/countries-50m.json');
const { feature } = require('topojson-client');
const { presimplify, simplify, quantile } = require('topojson-simplify');
const { geoNaturalEarth1, geoPath, geoStream, geoDistance, geoGraticule10 } = require('d3-geo');
const { Delaunay } = require('d3-delaunay');
const pc = require('polygon-clipping');

const WIDTH = 2000;
// Topology-preserving simplification keeps shared borders identical on both sides.
const simple = simplify(presimplify(topo), quantile(presimplify(topo), 0.45));
const countries = feature(simple, topo.objects.countries).features.filter((f) => f.id !== '010'); // no Antarctica
const land = { type: 'FeatureCollection', features: countries };
const projection = geoNaturalEarth1().fitWidth(WIDTH, land);
const [[, y0], [, y1]] = geoPath(projection).bounds(land);
projection.translate([projection.translate()[0], projection.translate()[1] - y0 + 10]);
const HEIGHT = Math.ceil(y1 - y0 + 20);
const path = geoPath(projection);
const r1 = (v) => Math.round(v * 10) / 10;

/** Project a feature to planar rings (antimeridian-cut by d3) and resolve holes with XOR. */
function planar(f) {
  const rings = [];
  let ring = null;
  geoStream(f, projection.stream({
    point(x, y) { ring.push([r1(x), r1(y)]); },
    lineStart() { ring = []; },
    lineEnd() { if (ring.length > 3) { ring.push(ring[0]); rings.push(ring); } },
    polygonStart() {}, polygonEnd() {}, sphere() {},
  }));
  return pc.xor(...rings.map((r) => [[r]]));
}

const area = (ring) => { let s = 0; for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; return s / 2; };
function centroid(ring) {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const k = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a += k; x += (ring[i][0] + ring[i + 1][0]) * k; y += (ring[i][1] + ring[i + 1][1]) * k;
  }
  return a ? [x / (3 * a), y / (3 * a)] : ring[0];
}
const toPath = (mp) => mp.map((poly) => poly.map((ring) => 'M' + ring.slice(0, -1).map((p) => `${r1(p[0])},${r1(p[1])}`).join('L') + 'Z').join('')).join('');

// Label point: the interior point of the largest piece farthest from its edge (coarse grid search).
function labelPoint(mp) {
  const poly = mp.reduce((b, p) => (Math.abs(area(p[0])) > Math.abs(area(b[0])) ? p : b));
  const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const inside = (x, y) => poly.reduce((ins, ring, ri) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return ri === 0 ? c : ins && !c;
  }, false);
  const edgeDist = (x, y) => {
    let d = Infinity;
    for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (((bx - ax) ** 2 + (by - ay) ** 2) || 1)));
      d = Math.min(d, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
    }
    return d;
  };
  let best = centroid(poly[0]), bestD = inside(...best) ? edgeDist(...best) : -1;
  const step = Math.max(maxX - minX, maxY - minY) / 24;
  for (let x = minX; x <= maxX; x += step) for (let y = minY; y <= maxY; y += step) {
    if (!inside(x, y)) continue;
    const d = edgeDist(x, y);
    if (d > bestD) { bestD = d; best = [x, y]; }
  }
  return [r1(best[0]), r1(best[1])];
}

const out = { width: WIDTH, height: HEIGHT, background: '', graticule: path(geoGraticule10()), nations: [], regions: [], routes: [] };
out.background = countries.map((f) => path(f)).join('').replace(/(\d+\.\d)\d+/g, '$1');

const vkey = (p) => `${r1(p[0])},${r1(p[1])}`;
const vertexSets = [];

for (const [ni, def] of NATIONS.entries()) {
  const f = countries.find((c) => c.id === def.iso);
  if (!f) throw new Error(`No shape for ${def.name}`);
  const centres = def.regions.map(([, lon, lat]) => [lon, lat]);
  // Extra Voronoi seeds (anchors) let a region claim land its main centre would lose.
  const seeds = def.regions.flatMap(([, lon, lat, , , , anchors], i) => [[lon, lat, i], ...(anchors ?? []).map(([a, b]) => [a, b, i])]);
  // Drop far-flung parts (e.g. Hawaii) that no listed region is near.
  const parts = planar(f).filter((poly) => {
    const ll = projection.invert(centroid(poly[0]));
    return centres.some((c) => geoDistance(c, ll) < 0.32);
  });
  const pts = seeds.map(([lon, lat]) => projection([lon, lat]));
  const allX = parts.flatMap((p) => p[0].map((q) => q[0])), allY = parts.flatMap((p) => p[0].map((q) => q[1]));
  const vor = Delaunay.from(pts).voronoi([Math.min(...allX) - 50, Math.min(...allY) - 50, Math.max(...allX) + 50, Math.max(...allY) + 50]);
  const [lx, ly] = labelPoint(parts);
  out.nations.push({ name: def.name, code: def.code, adj: def.adj, color: def.color, cur: def.cur, iso: def.iso, leader: def.leader, legislature: def.legislature,
    label: [lx, ly], span: r1(Math.max(...allX) - Math.min(...allX)) });
  def.regions.forEach(([name, , , terrain, res, capital], i) => {
    const cells = seeds.map((s, k) => (s[2] === i ? [vor.cellPolygon(k).map((p) => [r1(p[0]), r1(p[1])])] : null)).filter(Boolean);
    const shape = pc.intersection(pc.union(...cells), parts);
    if (!shape.length) throw new Error(`Empty region ${def.name}/${name}`);
    const [x, y] = labelPoint(shape);
    const xs = shape.flatMap((poly) => poly[0].map((q) => q[0]));
    out.regions.push({ name, nation: ni, capital: !!capital, terrain, res, x, y, span: r1(Math.max(...xs) - Math.min(...xs)), path: toPath(shape), links: [] });
    vertexSets.push(new Set(shape.flatMap((poly) => poly.flatMap((ring) => ring.map(vkey)))));
  });
}

// Land links: regions whose clipped shapes share at least two border vertices.
const R = out.regions;
const link = (a, b) => { if (a !== b && !R[a].links.includes(b)) { R[a].links.push(b); R[b].links.push(a); } };
for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
  let shared = 0;
  for (const k of vertexSets[a]) if (vertexSets[b].has(k) && ++shared >= 2) break;
  if (shared >= 2) link(a, b);
}

// Straits: join a country's islands/exclaves to the rest (closest pair of label points).
for (let ni = 0; ni < NATIONS.length; ni++) {
  const own = R.map((r, i) => i).filter((i) => R[i].nation === ni);
  for (;;) {
    const comp = new Set([own[0]]);
    const stack = [own[0]];
    while (stack.length) for (const l of R[stack.pop()].links) if (R[l].nation === ni && !comp.has(l)) { comp.add(l); stack.push(l); }
    if (comp.size === own.length) break;
    let best = null;
    for (const a of comp) for (const b of own) if (!comp.has(b)) {
      const d = Math.hypot(R[a].x - R[b].x, R[a].y - R[b].y);
      if (!best || d < best.d) best = { a, b, d };
    }
    link(best.a, best.b);
    out.routes.push({ a: best.a, b: best.b, name: 'Strait' });
  }
}

// Sea lanes and corridors.
const byKey = (key) => {
  const [nation, region] = key.split('/');
  const i = R.findIndex((r) => NATIONS[r.nation].name === nation && r.name === region);
  if (i < 0) throw new Error(`Unknown route end ${key}`);
  return i;
};
for (const [a, b, name] of ROUTES) { const ia = byKey(a), ib = byKey(b); link(ia, ib); out.routes.push({ a: ia, b: ib, name }); }

// Whole graph must be connected (travel and supply depend on it).
const seen = new Set([0]); const st = [0];
while (st.length) for (const l of R[st.pop()].links) if (!seen.has(l)) { seen.add(l); st.push(l); }
if (seen.size !== R.length) throw new Error(`Map not connected: ${R.filter((_, i) => !seen.has(i)).map((r) => r.name).join(', ')}`);
for (const r of R) r.links.sort((a, b) => a - b);

writeFileSync(new URL('../src/data/earth.json', import.meta.url), JSON.stringify(out));
const foreign = R.flatMap((r, i) => r.links.filter((l) => l > i && R[l].nation !== r.nation && !out.routes.some((x) => (x.a === i && x.b === l) || (x.a === l && x.b === i))).map((l) => `${r.name}–${R[l].name}`));
console.log(`earth.json: ${R.length} regions, ${out.nations.length} nations, ${out.routes.length} routes, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
console.log('Land borders between nations:', foreign.join('; '));
console.log('Straits:', out.routes.filter((x) => x.name === 'Strait').map((x) => `${R[x.a].name}–${R[x.b].name}`).join('; '));
