// World generation (hex map, regions, nations) and world queries.
(function () {
  const G = globalThis.G;
  const U = G.util;
  const D = G.data;

  const W = 11;
  const H = 8;
  const HEX = 40; // hex radius in SVG units

  function neighborsOf(col, row) {
    const odd = row & 1;
    const dirs = odd
      ? [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]]
      : [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
    return dirs.map(([dc, dr]) => [col + dc, row + dr]);
  }

  function hexCenter(col, row) {
    return { x: HEX * Math.sqrt(3) * (col + 0.5 * (row & 1)) + HEX, y: HEX * 1.5 * row + HEX };
  }

  function uniqueName(used) {
    for (let i = 0; i < 200; i++) {
      const n = U.pick(D.REGION_PREFIX) + U.pick(D.REGION_SUFFIX);
      if (!used.has(n)) { used.add(n); return n; }
    }
    return 'Region ' + used.size;
  }

  function personName() {
    return U.pick(D.FIRST_NAMES) + ' ' + U.pick(D.LAST_NAMES);
  }

  function generateMap() {
    // Land mask: noisy ellipse.
    const cells = new Map();
    const cx = (W - 1) / 2, cy = (H - 1) / 2;
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const d = ((c - cx) / (W / 2)) ** 2 + ((r - cy) / (H / 2)) ** 2;
        if (d < 1 + U.rand(-0.35, 0.15)) cells.set(c + ',' + r, { col: c, row: r });
      }
    }
    // Keep the largest connected component.
    const seen = new Set();
    let best = [];
    for (const key of cells.keys()) {
      if (seen.has(key)) continue;
      const comp = [];
      const stack = [key];
      seen.add(key);
      while (stack.length) {
        const k = stack.pop();
        comp.push(k);
        const { col, row } = cells.get(k);
        for (const [nc, nr] of neighborsOf(col, row)) {
          const nk = nc + ',' + nr;
          if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      if (comp.length > best.length) best = comp;
    }

    const used = new Set();
    const regions = best.map((k, i) => {
      const { col, row } = cells.get(k);
      const { x, y } = hexCenter(col, row);
      return {
        id: i, name: uniqueName(used), col, row, x, y,
        owner: -1, core: -1,
        resource: U.chance(0.5) ? 'grain' : 'iron',
        bonus: U.pick([0, 0, 0.25, 0.25, 0.5]),
        neighbors: [],
      };
    });
    const byKey = new Map(regions.map((r) => [r.col + ',' + r.row, r]));
    for (const r of regions) {
      r.neighbors = neighborsOf(r.col, r.row).map(([c, rr]) => byKey.get(c + ',' + rr)).filter(Boolean).map((n) => n.id);
    }
    return regions;
  }

  function bfsDist(regions, from) {
    const dist = new Array(regions.length).fill(Infinity);
    dist[from] = 0;
    const q = [from];
    while (q.length) {
      const id = q.shift();
      for (const n of regions[id].neighbors) if (dist[n] === Infinity) { dist[n] = dist[id] + 1; q.push(n); }
    }
    return dist;
  }

  function generateWorld() {
    const S = G.state;
    const regions = generateMap();
    S.regions = regions;

    // Farthest-point sampling for capitals.
    const count = D.NATIONS.length;
    const seeds = [U.randInt(0, regions.length - 1)];
    const minDist = bfsDist(regions, seeds[0]);
    while (seeds.length < count) {
      let bestId = 0, bestD = -1;
      for (const r of regions) if (minDist[r.id] > bestD && !seeds.includes(r.id)) { bestD = minDist[r.id]; bestId = r.id; }
      seeds.push(bestId);
      const d = bfsDist(regions, bestId);
      for (let i = 0; i < d.length; i++) minDist[i] = Math.min(minDist[i], d[i]);
    }

    S.nations = D.NATIONS.map((t, i) => {
      const parties = U.shuffle(D.PARTIES.slice()).slice(0, 4).map((p, j) => ({
        id: j, name: p.name, hawk: p.hawk, popularity: U.rand(15, 40), leader: personName(),
      }));
      return {
        id: i, name: t.name, adj: t.adj, color: t.color,
        capital: seeds[i], alive: true,
        treasury: U.randInt(4000, 9000),
        incomeTax: U.pick([0.08, 0.1, 0.12, 0.15]),
        vat: U.pick([0.05, 0.08, 0.1]),
        avgWage: U.rand(24, 36),
        aggression: U.rand(0.2, 1),
        president: { name: personName(), player: false, since: 1 },
        parties,
        seats: {},
        warFatigue: {},
      };
    });
    for (const n of S.nations) assignSeats(n);

    // Grow territories round-robin from the capitals.
    seeds.forEach((id, i) => { regions[id].owner = i; });
    let unclaimed = regions.length - seeds.length;
    while (unclaimed > 0) {
      let progressed = false;
      for (const n of U.shuffle(S.nations.slice())) {
        const frontier = [];
        for (const r of regions) if (r.owner === n.id) for (const nb of r.neighbors) if (regions[nb].owner === -1) frontier.push(nb);
        if (!frontier.length) continue;
        regions[U.pick(frontier)].owner = n.id;
        unclaimed--;
        progressed = true;
        if (!unclaimed) break;
      }
      if (!progressed) break;
    }
    for (const r of regions) r.core = r.owner;
  }

  function assignSeats(nation, extraPop = {}) {
    const total = D.CONGRESS_SEATS;
    const weights = nation.parties.map((p) => (p.popularity + (extraPop[p.id] || 0)) * U.rand(0.8, 1.2));
    const sum = weights.reduce((a, b) => a + b, 0);
    const seats = {};
    let given = 0;
    nation.parties.forEach((p, i) => { seats[p.id] = Math.floor((weights[i] / sum) * total); given += seats[p.id]; });
    // Largest remainder.
    const rema = nation.parties.map((p, i) => [p.id, (weights[i] / sum) * total - seats[p.id]]).sort((a, b) => b[1] - a[1]);
    for (let i = 0; given < total; i++, given++) seats[rema[i % rema.length][0]]++;
    nation.seats = seats;
  }

  // ---------- queries ----------
  const W_ = {
    HEX, W, H,
    personName,
    assignSeats,
    generateWorld,
    nation: (id) => G.state.nations[id],
    region: (id) => G.state.regions[id],
    regionsOf: (nid) => G.state.regions.filter((r) => r.owner === nid),
    regionCount: (nid) => G.state.regions.reduce((s, r) => s + (r.owner === nid ? 1 : 0), 0),
    aliveNations: () => G.state.nations.filter((n) => n.alive),
    playerNation: () => G.state.nations[G.state.player.nation],
    atWar(a, b) {
      return G.state.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
    },
    warsOf: (nid) => G.state.wars.filter((w) => w.a === nid || w.b === nid),
    enemiesOf: (nid) => W_.warsOf(nid).map((w) => (w.a === nid ? w.b : w.a)),
    // Regions owned by `def` that touch territory owned by `att`.
    borderTargets(att, def) {
      return G.state.regions.filter((r) => r.owner === def && r.neighbors.some((n) => G.state.regions[n].owner === att));
    },
    neighborNations(nid) {
      const set = new Set();
      for (const r of G.state.regions) if (r.owner === nid) for (const n of r.neighbors) {
        const o = G.state.regions[n].owner;
        if (o !== nid && o >= 0) set.add(o);
      }
      return [...set];
    },
    hexPoints(r) {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        pts.push((r.x + (HEX - 1) * Math.cos(a)).toFixed(1) + ',' + (r.y + (HEX - 1) * Math.sin(a)).toFixed(1));
      }
      return pts.join(' ');
    },
    mapSize() {
      return { w: HEX * Math.sqrt(3) * (W + 0.5) + HEX, h: HEX * 1.5 * (H - 1) + HEX * 2 };
    },
  };
  G.world = W_;
})();
