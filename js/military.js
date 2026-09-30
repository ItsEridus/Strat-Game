// Wars, battles and combat.
(function () {
  const G = globalThis.G;
  const U = G.util;
  const D = G.data;
  const WIN_ROUNDS = 3;

  function S() { return G.state; }
  function P() { return G.state.player; }

  function hitDamage(weaponQ) {
    const p = P();
    const r = G.player.rank();
    const w = weaponQ > 0 ? D.ITEMS['weapon' + weaponQ].mult : 1;
    return 60 * (1 + p.strength / 50) * (1 + r.index * 0.05) * w;
  }

  // Damage the AI citizens of a nation put into one round of a battle.
  function aiRoundDamage(nid, battle, side) {
    const S_ = S();
    const n = S_.nations[nid];
    const regions = G.world.regionCount(nid);
    let dmg = 6000 * (1 + 0.35 * Math.sqrt(regions)) * U.rand(0.7, 1.3) * (1 + S_.day / 400);
    const region = S_.regions[battle.region];
    if (side === 'def' && region.core === nid) dmg *= 1.1;
    if (side === 'att' && battle.resistance) dmg *= 1.2;
    // AI governments pour money into the war effort. The player-led nation only funds when told to.
    if (n.alive && !(n.president.player && nid === P().nation)) {
      const spend = Math.min(n.treasury * 0.05, 1500);
      n.treasury -= spend;
      dmg += spend;
    }
    return Math.round(dmg);
  }

  function startBattle(att, def, regionId, resistance = false) {
    const region = S().regions[regionId];
    if (S().battles.some((b) => !b.over && b.region === regionId)) return null;
    const b = {
      id: U.nextId(), att, def, region: regionId, resistance,
      round: 1, wins: { att: 0, def: 0 },
      cur: { att: 0, def: 0 }, rounds: [], player: { att: 0, def: 0 },
      total: { att: 0, def: 0 },
      started: S().day, over: false, winner: null,
    };
    rollRound(b);
    S().battles.push(b);
    const an = S().nations[att], dn = S().nations[def];
    G.news(resistance
      ? `✊ Resistance! ${an.adj} patriots rise up in ${region.name} against ${dn.name}.`
      : `⚔️ ${an.name} attacks ${region.name} (${dn.name}).`, 'war');
    if (att === P().nation || def === P().nation) G.report(`⚔️ New battle for ${region.name}: ${an.name} vs ${dn.name}.`);
    return b;
  }

  // AI soldiers fight in the "morning" of every round so the player can see the state.
  function rollRound(b) {
    b.cur.att = Math.round(aiRoundDamage(b.att, b, 'att') * 0.8);
    b.cur.def = Math.round(aiRoundDamage(b.def, b, 'def') * 0.8);
  }

  function playerSideNation(b) {
    const p = P();
    if (b.att === p.nation) return 'att';
    if (b.def === p.nation) return 'def';
    return null; // mercenary: may choose
  }

  function fight(battleId, side, hits) {
    const p = P();
    const b = S().battles.find((x) => x.id === battleId);
    if (!b || b.over) return G.fail('Battle is over.');
    const forced = playerSideNation(b);
    if (forced && forced !== side) return G.fail('You cannot fight against your own nation.');
    let dealt = 0, done = 0;
    for (let i = 0; i < hits; i++) {
      if (p.energy < D.E.hit) break;
      p.energy -= D.E.hit;
      let q = p.weaponQ;
      if (q > 0 && !p.inv['weapon' + q]) q = 0;
      if (q > 0) G.economy.addItem('weapon' + q, -1);
      const dmg = Math.round(hitDamage(q) * U.rand(0.9, 1.1));
      dealt += dmg; done++;
      G.player.addXp(D.XP.hit);
    }
    if (!done) return G.fail(`Not enough energy (need ${D.E.hit} per hit).`);
    b.cur[side] += dealt;
    b.player[side] += dealt;
    p.rankPts += dealt;
    p.stats.damage += dealt;
    G.achievements.check();
    return G.ok(`💥 ${done} hit${done > 1 ? 's' : ''} for ${U.fmt(dealt)} damage.`);
  }

  // End of day: late AI surge, decide the round, maybe decide the battle.
  function resolveBattles() {
    for (const b of S().battles) {
      if (b.over) continue;
      b.cur.att += Math.round(aiRoundDamage(b.att, b, 'att') * U.rand(0.1, 0.3));
      b.cur.def += Math.round(aiRoundDamage(b.def, b, 'def') * U.rand(0.1, 0.3));
      const w = b.cur.att > b.cur.def ? 'att' : 'def';
      b.wins[w]++;
      b.total.att += b.cur.att; b.total.def += b.cur.def;
      b.rounds.push({ att: b.cur.att, def: b.cur.def, winner: w });
      const region = S().regions[b.region];
      if (b.wins.att >= WIN_ROUNDS || b.wins.def >= WIN_ROUNDS) {
        endBattle(b, b.wins.att >= WIN_ROUNDS ? 'att' : 'def');
      } else {
        b.round++;
        b.cur = { att: 0, def: 0 };
        rollRound(b);
      }
      if (!b.over && (b.player.att || b.player.def)) {
        G.report(`⚔️ ${region.name}: round ${b.rounds.length} won by ${S().nations[b[w]].name} (${b.wins.att}-${b.wins.def}).`);
      }
    }
    // Drop old finished battles.
    S().battles = S().battles.filter((b) => !b.over || S().day - b.endDay < 10);
  }

  function endBattle(b, winnerSide) {
    const S_ = S();
    const p = P();
    b.over = true; b.winner = winnerSide; b.endDay = S_.day;
    const region = S_.regions[b.region];
    const winner = S_.nations[b[winnerSide]];
    const loser = S_.nations[b[winnerSide === 'att' ? 'def' : 'att']];

    // Battle hero: a large share of your side's damage.
    for (const side of ['att', 'def']) {
      if (b.player[side] > 0) {
        p.stats.battles++;
        if (b.player[side] >= b.total[side] * 0.25) {
          p.stats.heroes++; p.gold += 2; p.pop += 3;
          G.report(`🎖️ Battle Hero in ${region.name}! +2 gold.`);
          G.news(`🎖️ ${p.name} was Battle Hero in ${region.name}.`, 'player');
        }
      }
    }

    if (winnerSide === 'att') {
      const prevOwner = region.owner;
      region.owner = b.att;
      if (!winner.alive) revive(winner, region);
      G.news(`🏳️ ${winner.name} captured ${region.name} from ${loser.name}.`, 'war');
      if (prevOwner === p.nation || b.att === p.nation) G.report(`🏳️ ${region.name} now belongs to ${winner.name}.`);
      if (S_.nations[prevOwner].capital === region.id) moveCapital(S_.nations[prevOwner]);
      if (G.world.regionCount(prevOwner) === 0) eliminate(S_.nations[prevOwner], winner);
    } else {
      G.news(`🛡️ ${winner.name} held ${region.name} against ${loser.name}.`, 'war');
      if (b.att === p.nation || b.def === p.nation) G.report(`🛡️ ${winner.name} won the battle for ${region.name}.`);
    }
    G.achievements.check();
  }

  function moveCapital(n) {
    const rs = G.world.regionsOf(n.id);
    if (!rs.length) return;
    n.capital = (rs.find((r) => r.core === n.id) || rs[0]).id;
    G.news(`🏛️ ${n.name} moved its capital to ${S().regions[n.capital].name}.`, 'war');
  }

  function revive(n, region) {
    n.alive = true;
    n.capital = region.id;
    n.treasury = 2000;
    n.president = { name: G.world.personName(), player: false, since: S().day };
    G.news(`🎉 ${n.name} is reborn after liberating ${region.name}!`, 'war');
  }

  function eliminate(n, by) {
    const S_ = S();
    n.alive = false;
    S_.wars = S_.wars.filter((w) => w.a !== n.id && w.b !== n.id);
    for (const b of S_.battles) if (!b.over && !b.resistance && (b.att === n.id || b.def === n.id)) { b.over = true; b.winner = null; b.endDay = S_.day; }
    G.news(`💀 ${n.name} has been wiped off the map by ${by.name}.`, 'war');
    if (n.id === P().nation) {
      if (n.president.player) n.president.player = false;
      P().congress = false;
      G.report(`💀 Your nation ${n.name} has fallen! Liberate it through resistance battles or change citizenship.`);
    }
  }

  function declareWar(a, b) {
    if (a === b || G.world.atWar(a, b) || !S().nations[a].alive || !S().nations[b].alive) return false;
    S().wars.push({ a, b, since: S().day });
    const na = S().nations[a], nb = S().nations[b];
    G.news(`🔥 ${na.name} declared war on ${nb.name}!`, 'war');
    if (a === P().nation || b === P().nation) G.report(`🔥 War: ${na.name} vs ${nb.name}.`);
    return true;
  }

  function makePeace(a, b) {
    const before = S().wars.length;
    S().wars = S().wars.filter((w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
    if (S().wars.length === before) return false;
    for (const bt of S().battles) {
      if (!bt.over && !bt.resistance && ((bt.att === a && bt.def === b) || (bt.att === b && bt.def === a))) {
        bt.over = true; bt.winner = null; bt.endDay = S().day;
      }
    }
    G.news(`🕊️ ${S().nations[a].name} and ${S().nations[b].name} signed a peace treaty.`, 'war');
    if (a === P().nation || b === P().nation) G.report(`🕊️ Peace between ${S().nations[a].name} and ${S().nations[b].name}.`);
    return true;
  }

  function activeBattleBetween(a, b) {
    return S().battles.some((x) => !x.over && !x.resistance && ((x.att === a && x.def === b) || (x.att === b && x.def === a)));
  }

  // Each war spawns battles; the side that attacks is weighted by strength.
  function dailyWars() {
    const S_ = S();
    for (const w of S_.wars.slice()) {
      if (activeBattleBetween(w.a, w.b)) continue;
      const aTargets = G.world.borderTargets(w.a, w.b);
      const bTargets = G.world.borderTargets(w.b, w.a);
      if (!aTargets.length && !bTargets.length) { makePeace(w.a, w.b); continue; }
      if (!U.chance(0.6)) continue;
      const cand = [];
      const playerPres = G.world.playerNation().president.player;
      // A player-led nation only attacks when the player orders it.
      if (aTargets.length && !(playerPres && w.a === P().nation)) cand.push({ att: w.a, def: w.b, t: aTargets });
      if (bTargets.length && !(playerPres && w.b === P().nation)) cand.push({ att: w.b, def: w.a, t: bTargets });
      if (!cand.length) continue;
      const c = U.weighted(cand, (x) => G.world.regionCount(x.att) + 1);
      const target = U.weighted(c.t, (r) => (r.core === c.att ? 4 : 1) * (r.id === S_.nations[c.def].capital ? 0.3 : 1));
      startBattle(c.att, c.def, target.id);
    }
    // Resistance movements in occupied land.
    for (const r of S_.regions) {
      if (r.owner === r.core || S_.battles.some((b) => !b.over && b.region === r.id)) continue;
      const coreAlive = S_.nations[r.core].alive;
      if (U.chance(coreAlive ? 0.01 : 0.03)) startBattle(r.core, r.owner, r.id, true);
    }
  }

  // President order: attack a region (requires war and border).
  function orderAttack(regionId) {
    const p = P();
    const n = G.world.playerNation();
    const r = S().regions[regionId];
    if (!n.president.player) return G.fail('Only the president can order attacks.');
    if (!G.world.atWar(n.id, r.owner)) return G.fail(`You are not at war with ${S().nations[r.owner].name}.`);
    if (!r.neighbors.some((x) => S().regions[x].owner === n.id)) return G.fail('Region is not on your border.');
    if (activeBattleBetween(n.id, r.owner)) return G.fail('A battle against this nation is already underway.');
    startBattle(n.id, r.owner, regionId);
    return G.ok(`Attack on ${r.name} launched!`);
  }

  // President: spend treasury on a battle. 1₡ = 1 damage.
  function fundBattle(battleId, amount) {
    const n = G.world.playerNation();
    const b = S().battles.find((x) => x.id === battleId);
    if (!n.president.player) return G.fail('Only the president can fund battles.');
    if (!b || b.over) return G.fail('Battle is over.');
    const side = playerSideNation(b);
    if (!side) return G.fail('Your nation is not part of this battle.');
    amount = Math.floor(amount);
    if (!(amount > 0) || amount > n.treasury) return G.fail('Invalid amount.');
    n.treasury -= amount;
    b.cur[side] += amount;
    return G.ok(`Treasury funds deployed: +${U.fmt(amount)} damage.`);
  }

  G.military = {
    WIN_ROUNDS, hitDamage, startBattle, fight, resolveBattles, declareWar, makePeace,
    dailyWars, orderAttack, fundBattle, playerSideNation, activeBattleBetween,
  };
})();
