// Shared helpers. Every module attaches itself to the global `G` namespace so the
// game runs from a plain file:// double-click with no build step or server.
(function () {
  const G = (globalThis.G = globalThis.G || {});

  // Seeded RNG (mulberry32). The seed lives in G.state.rng so saves are reproducible.
  function rng() {
    let t = (G.state.rng = (G.state.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  G.util = {
    rng,
    rand: (a, b) => a + rng() * (b - a),
    randInt: (a, b) => Math.floor(a + rng() * (b - a + 1)),
    chance: (p) => rng() < p,
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    weighted(items, weightFn) {
      const total = items.reduce((s, it) => s + Math.max(0, weightFn(it)), 0);
      let r = rng() * total;
      for (const it of items) {
        r -= Math.max(0, weightFn(it));
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
    nextId: () => G.state.nextId++,
    fmt(n, digits = 0) {
      if (n === null || n === undefined || Number.isNaN(n)) return '-';
      const abs = Math.abs(n);
      if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
      if (abs >= 1e4) return (n / 1e3).toFixed(1) + 'k';
      return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },
    money: (n) => '₡' + G.util.fmt(n, Math.abs(n) < 100 ? 2 : 0),
    pct: (v) => Math.round(v * 100) + '%',
    esc: (s) =>
      String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  };

  // News feed + end-of-day report for the player.
  G.news = function (text, kind = 'world') {
    G.state.news.unshift({ day: G.state.day, text, kind });
    if (G.state.news.length > 400) G.state.news.length = 400;
  };
  G.report = function (text) {
    (G.dayReport = G.dayReport || []).push(text);
  };
})();
