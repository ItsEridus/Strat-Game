// Headless smoke test: runs the game logic for N days with a scripted player.
// Usage: node tools/simulate.js [days] [seed]
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'js');
for (const f of ['util.js', 'data.js', 'world.js', 'economy.js', 'player.js', 'military.js', 'politics.js', 'main.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const G = globalThis.G;
globalThis.localStorage = { setItem() {}, getItem() { return null; }, removeItem() {} };

const days = +process.argv[2] || 365;
const seed = +process.argv[3] || 12345;
G.game.newGame('Tester', 0, seed);

function assertFinite(label, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label} is not finite: ${v} on day ${G.state.day}`);
}

for (let d = 0; d < days; d++) {
  const S = G.state, p = S.player;
  if (!p.job && S.jobs.length) G.economy.takeJob(S.jobs[0].id);
  G.economy.work();
  G.player.train();
  G.player.writeArticle();
  if (p.party === null && p.level >= 3) G.politics.joinParty(G.world.playerNation().parties[0].id);
  if (p.level >= 5 && !p.candidateCongress) G.politics.toggleCandidacy('congress');
  if (p.level >= 8 && !p.candidatePresident) G.politics.toggleCandidacy('president');
  if (p.companies.length < 2 && p.gold >= 15) {
    const r = G.world.regionsOf(p.nation)[0];
    if (r) G.economy.createCompany(p.companies.length ? 'food' : 'farm', r.id);
  }
  for (const c of p.companies) {
    if (c.workers < G.economy.maxWorkers(c)) G.economy.hire(c.id, 1);
    G.economy.manage(c.id);
  }
  if ((p.inv.grain || 0) > 200) G.economy.sell('grain', 100);
  if ((p.inv.food1 || 0) < 10) G.economy.buy('food1', 10);
  if ((p.inv.weapon1 || 0) < 10 && p.money > 500) G.economy.buy('weapon1', 10);
  G.player.eatAll();
  const b = S.battles.find((x) => !x.over && (x.att === p.nation || x.def === p.nation)) || S.battles.find((x) => !x.over);
  if (b) G.military.fight(b.id, G.military.playerSideNation(b) || 'att', 50);
  for (const l of S.laws) if (p.congress) G.politics.vote(l.id, true);
  if (G.world.playerNation().president.player) {
    const n = G.world.playerNation();
    const enemies = G.world.enemiesOf(n.id);
    if (!enemies.length) {
      const nb = G.world.neighborNations(n.id)[0];
      if (nb !== undefined) G.politics.playerPropose('war', nb);
    } else {
      const t = G.world.borderTargets(n.id, enemies[0])[0];
      if (t) G.military.orderAttack(t.id);
    }
  }
  if (!G.world.playerNation().alive) {
    const alt = G.world.aliveNations()[0];
    if (alt && p.gold >= 3) G.player.changeCitizenship(alt.id);
  }

  G.game.endDay();

  for (const k of ['money', 'gold', 'energy', 'strength', 'xp', 'pop', 'rankPts']) assertFinite('player.' + k, p[k]);
  for (const n of S.nations) { assertFinite(n.name + '.treasury', n.treasury); assertFinite(n.name + '.avgWage', n.avgWage); }
  for (const [k, v] of Object.entries(S.market.prices)) assertFinite('price ' + k, v);
  for (const [k, v] of Object.entries(p.inv)) if (v < 0) throw new Error(`negative inventory ${k}=${v}`);
  // JSON round-trip must work (save format).
  if (d % 50 === 0) JSON.parse(JSON.stringify(S));
}

const S = G.state, p = S.player;
console.log(`Day ${S.day}: level ${p.level}, str ${p.strength}, rank ${G.player.rank().name}, money ${p.money.toFixed(0)}, gold ${p.gold}`);
console.log(`Companies ${p.companies.length}, pop ${p.pop}, congress ${p.congress}, president ${G.world.playerNation().president.player}, achievements ${Object.keys(p.achievements).join(',')}`);
console.log('Nations:', S.nations.map((n) => `${n.name}${n.alive ? '' : '†'}:${G.world.regionCount(n.id)}`).join(' '));
console.log(`Wars ${S.wars.length}, active battles ${S.battles.filter((b) => !b.over).length}, news ${S.news.length}`);
console.log('Prices:', Object.entries(S.market.prices).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' '), 'gold=' + S.market.gold.toFixed(1));
console.log('OK');
