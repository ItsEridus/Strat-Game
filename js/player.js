// Player progression and personal actions.
(function () {
  const G = globalThis.G;
  const U = G.util;
  const D = G.data;
  function P() { return G.state.player; }

  function newPlayer(name, nation) {
    return {
      name, nation,
      level: 1, xp: 0,
      strength: 10, trainLevel: 1,
      energy: 100, maxEnergy: 100,
      money: 300, gold: 5,
      inv: { food1: 10, weapon1: 5 },
      rankPts: 0,
      workCount: 0, ecoSkill: 1,
      job: null,
      pop: 0, party: null, congress: false, candidateCongress: false, candidatePresident: false,
      subscribers: 0, articles: [],
      companies: [],
      flags: { worked: false, trained: false, wrote: false, foodEnergy: 0 },
      stats: { heroes: 0, damage: 0, battles: 0, termsServed: 0, trains: 0 },
      weaponQ: 1,
      achievements: {},
    };
  }

  function xpNeeded(level) { return 20 + (level - 1) * 15; }

  function addXp(n) {
    const p = P();
    p.xp += n;
    while (p.xp >= xpNeeded(p.level)) {
      p.xp -= xpNeeded(p.level);
      p.level++;
      const gold = 1 + Math.floor(p.level / 5);
      p.gold += gold;
      p.maxEnergy = Math.min(D.MAX_LEVEL_ENERGY, p.maxEnergy + 5);
      p.energy = p.maxEnergy;
      p.pop += 1;
      G.toast(`⭐ Level up! You are now level ${p.level} (+${gold} gold, energy refilled).`, 'good');
      G.news(`${p.name} reached level ${p.level}.`, 'player');
    }
  }

  function spend(energy) {
    const p = P();
    if (p.energy < energy) { G.fail(`Not enough energy (need ${energy}). Eat food or end the day.`); return false; }
    p.energy -= energy;
    return true;
  }

  function trainGain() {
    // Diminishing returns on raw strength, boosted by training facilities.
    const p = P();
    return +((2 + (p.trainLevel - 1) * 1.5) * (1 / (1 + p.strength / 800))).toFixed(2);
  }

  function train() {
    const p = P();
    if (p.flags.trained) return G.fail('Already trained today.');
    if (!spend(D.E.train)) return;
    const g = trainGain();
    p.strength = +(p.strength + g).toFixed(2);
    p.flags.trained = true;
    p.stats.trains++;
    addXp(D.XP.train);
    G.achievements.check();
    return G.ok(`Trained: +${g} strength.`);
  }

  function upgradeTraining() {
    const p = P();
    if (p.trainLevel >= 5) return G.fail('Training facilities maxed.');
    const cost = D.TRAIN_UPGRADE_COST[p.trainLevel];
    if (p.gold < cost) return G.fail(`Need ${cost} gold.`);
    p.gold -= cost;
    p.trainLevel++;
    return G.ok(`Training facility upgraded to level ${p.trainLevel}.`);
  }

  function eat(q) {
    const p = P();
    const key = 'food' + q;
    if (!p.inv[key]) return G.fail(`No ${D.ITEMS[key].name} in inventory.`);
    const gain = D.ITEMS[key].energy;
    if (p.energy >= p.maxEnergy) return G.fail('Energy is already full.');
    if (p.flags.foodEnergy >= D.E.foodCap) return G.fail(`You've eaten enough today (${D.E.foodCap} energy max from food).`);
    const actual = Math.min(gain, p.maxEnergy - p.energy, D.E.foodCap - p.flags.foodEnergy);
    p.energy += actual;
    p.flags.foodEnergy += actual;
    G.economy.addItem(key, -1);
    return G.ok(`Ate ${D.ITEMS[key].name}: +${actual} energy.`);
  }

  // Eat until full or out of food / food cap, best quality first.
  function eatAll() {
    const p = P();
    let total = 0;
    for (let q = 5; q >= 1; q--) {
      while (p.inv['food' + q] && p.energy < p.maxEnergy && p.flags.foodEnergy < D.E.foodCap) {
        const before = p.energy;
        const key = 'food' + q;
        const actual = Math.min(D.ITEMS[key].energy, p.maxEnergy - p.energy, D.E.foodCap - p.flags.foodEnergy);
        p.energy += actual; p.flags.foodEnergy += actual;
        G.economy.addItem(key, -1);
        total += p.energy - before;
      }
    }
    if (!total) return G.fail('Nothing to eat, energy full, or daily food limit reached.');
    return G.ok(`Ate food: +${total} energy.`);
  }

  function rank(pts = P().rankPts) {
    let i = 0;
    while (i + 1 < D.RANKS.length && pts >= D.RANKS[i + 1].pts) i++;
    return { index: i, name: D.RANKS[i].name, next: D.RANKS[i + 1] ? D.RANKS[i + 1].pts : null, cur: D.RANKS[i].pts };
  }

  function writeArticle(title) {
    const p = P();
    if (p.level < 2) return G.fail('Reach level 2 to publish a newspaper.');
    if (p.flags.wrote) return G.fail('You already published today.');
    if (!spend(D.E.article)) return;
    title = (title || '').trim().slice(0, 90) || U.pick([
      'Why our nation must stand strong', 'The economy: a citizen\'s view', 'Letter to Congress',
      'Taxes are theft? A debate', 'Glory to the soldiers at the front', 'Reform now!',
    ]);
    const newSubs = U.randInt(1, 3) + Math.floor(Math.sqrt(p.pop) / 4);
    p.subscribers += newSubs;
    const popGain = +(1.5 + Math.sqrt(p.subscribers) * 0.3).toFixed(1);
    p.pop = +(p.pop + popGain).toFixed(1);
    p.flags.wrote = true;
    p.articles.unshift({ day: G.state.day, title, subs: newSubs });
    if (p.articles.length > 50) p.articles.length = 50;
    if (p.party !== null) {
      const party = G.world.playerNation().parties.find((x) => x.id === p.party);
      if (party) party.popularity += 0.5;
    }
    addXp(D.XP.article);
    G.news(`📰 ${p.name} published: "${title}"`, 'player');
    return G.ok(`Article published: +${popGain} popularity, +${newSubs} subscribers.`);
  }

  function changeCitizenship(nid) {
    const p = P();
    const n = G.world.nation(nid);
    if (!n || !n.alive) return G.fail('That nation does not exist.');
    if (nid === p.nation) return G.fail('You are already a citizen.');
    const cost = 3;
    if (p.gold < cost) return G.fail(`Need ${cost} gold for new papers.`);
    const old = G.world.playerNation();
    if (old.president.player) {
      old.president = { name: G.world.personName(), player: false, since: G.state.day };
    }
    p.gold -= cost;
    p.nation = nid;
    p.party = null; p.congress = false; p.candidateCongress = false; p.candidatePresident = false;
    p.job = null;
    p.pop = Math.floor(p.pop / 2);
    G.state.laws = G.state.laws.filter((l) => l.nation === nid);
    G.economy.generateJobs();
    G.news(`${p.name} emigrated from ${old.name} to ${n.name}.`, 'player');
    return G.ok(`You are now a citizen of ${n.name}. Find a new job!`);
  }

  function dailyReset() {
    const p = P();
    p.energy = p.maxEnergy;
    p.flags = { worked: false, trained: false, wrote: false, foodEnergy: 0 };
    p.pop = +(p.pop * 0.97).toFixed(2);
    // Job loss if the employer's nation is gone or you emigrated.
    if (p.job) {
      const jn = G.world.nation(p.job.nation);
      if (!jn.alive || p.job.nation !== p.nation) {
        p.job = null;
        G.report('💼 Your employer shut down. Find a new job.');
      } else if (U.chance(0.015)) {
        G.report(`💼 ${p.job.employer} went bankrupt. You are unemployed.`);
        p.job = null;
      }
    }
  }

  G.player = { newPlayer, xpNeeded, addXp, spend, train, trainGain, upgradeTraining, eat, eatAll, rank, writeArticle, changeCitizenship, dailyReset };

  // ---------- achievements ----------
  const ACH = [
    { id: 'work30', name: 'Hard Worker', desc: 'Work 30 days', gold: 5, test: (p) => p.workCount >= 30 },
    { id: 'train30', name: 'Super Soldier', desc: 'Train 30 days', gold: 5, test: (p) => p.stats.trains >= 30 },
    { id: 'hero', name: 'Battle Hero', desc: 'Become battle hero', gold: 0, test: (p) => p.stats.heroes >= 1 },
    { id: 'dmg100k', name: 'Warmonger', desc: 'Deal 100k total damage', gold: 10, test: (p) => p.stats.damage >= 100000 },
    { id: 'tycoon', name: 'Tycoon', desc: 'Own 3 companies', gold: 5, test: (p) => p.companies.length >= 3 },
    { id: 'rich', name: 'Millionaire (almost)', desc: 'Hold ₡10,000', gold: 5, test: (p) => p.money >= 10000 },
    { id: 'congress', name: 'Congressman', desc: 'Win a congress seat', gold: 5, test: (p) => p.congress },
    { id: 'president', name: 'Head of State', desc: 'Become president', gold: 10, test: () => G.world.playerNation().president.player },
    { id: 'press', name: 'Media Mogul', desc: '100 newspaper subscribers', gold: 5, test: (p) => p.subscribers >= 100 },
    { id: 'emperor', name: 'World Emperor', desc: 'Your nation owns every region', gold: 50, test: (p) => G.state.regions.every((r) => r.owner === p.nation) },
  ];
  G.achievements = {
    list: ACH,
    check() {
      const p = P();
      for (const a of ACH) {
        if (!p.achievements[a.id] && a.test(p)) {
          p.achievements[a.id] = G.state.day;
          p.gold += a.gold;
          G.toast(`🏅 Achievement: ${a.name}${a.gold ? ` (+${a.gold} gold)` : ''}`, 'good');
          G.news(`🏅 ${p.name} earned "${a.name}".`, 'player');
        }
      }
    },
  };
})();
