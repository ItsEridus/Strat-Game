// Game lifecycle: new game, day cycle, save/load.
(function () {
  const G = globalThis.G;
  const SAVE_KEY = 'strat-game-save-v1';

  // Feedback helpers used by every action. The UI replaces G.toast.
  G.toast = G.toast || function () {};
  G.ok = (msg) => { G.toast(msg, 'good'); return { ok: true, msg }; };
  G.fail = (msg) => { G.toast(msg, 'bad'); return { ok: false, msg }; };

  function newGame(name, nation, seed) {
    G.state = {
      version: 1,
      seed: seed >>> 0,
      rng: seed | 0,
      day: 1, nextId: 1,
      regions: [], nations: [], wars: [], battles: [], laws: [], news: [], jobs: [],
      market: null,
      player: null,
      ui: { tab: 'home', region: null, battle: null },
    };
    G.world.generateWorld();
    G.state.player = G.player.newPlayer(name || 'Citizen', nation);
    G.economy.initMarket();
    G.economy.generateJobs();

    // Start with a couple of wars so the world is alive from day one.
    const nations = G.state.nations;
    for (let i = 0; i < 2; i++) {
      const a = G.util.pick(nations.filter((n) => n.id !== nation));
      const nbs = G.world.neighborNations(a.id).filter((x) => x !== nation);
      if (nbs.length) G.military.declareWar(a.id, G.util.pick(nbs));
    }
    G.military.dailyWars();
    G.news(`🌍 A new era begins. ${G.state.player.name} becomes a citizen of ${nations[nation].name}.`, 'player');
    G.dayReport = [];
    save();
  }

  function endDay() {
    const S = G.state;
    G.dayReport = [];
    const moneyBefore = S.player.money;

    G.military.resolveBattles();
    G.politics.resolveLaws();
    G.economy.dailyCompanies();
    G.politics.dailyNations();
    G.military.dailyWars();
    G.economy.dailyMarket();

    S.day++;
    const cycle = G.data.ELECTION_CYCLE;
    if (S.day % cycle === cycle / 2) G.politics.congressElection();
    if (S.day % cycle === 0) G.politics.presidentialElections();

    G.player.dailyReset();
    G.economy.generateJobs();
    G.achievements.check();

    const delta = S.player.money - moneyBefore;
    if (Math.abs(delta) > 0.01) G.report(`💰 Overnight balance change: ${delta >= 0 ? '+' : ''}${G.util.money(delta)}.`);
    save();
    return G.dayReport;
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.state)); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      G.state = JSON.parse(raw);
      return true;
    } catch (e) { return false; }
  }
  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    G.state = null;
  }
  function exportSave() { return JSON.stringify(G.state); }
  function importSave(text) {
    const s = JSON.parse(text);
    if (!s || !s.player || !s.regions) throw new Error('Not a valid save file.');
    G.state = s;
    save();
  }

  G.game = { newGame, endDay, save, load, wipe, exportSave, importSave };
})();
