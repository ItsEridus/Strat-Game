// Market, jobs and player-owned companies.
(function () {
  const G = globalThis.G;
  const U = G.util;
  const D = G.data;

  function S() { return G.state; }
  function P() { return G.state.player; }

  // ---------- market ----------
  function initMarket() {
    const prices = {};
    for (const [k, it] of Object.entries(D.ITEMS)) prices[k] = it.base * U.rand(0.9, 1.1);
    S().market = { prices, gold: D.GOLD_BASE_PRICE, history: {} };
  }

  // Demand shifts with the state of the world: war drives weapons and food up.
  function targetPrice(key) {
    const it = D.ITEMS[key];
    const battles = S().battles.filter((b) => !b.over).length;
    let m = 1;
    if (it.kind === 'weapon') m += Math.min(0.6, battles * 0.06);
    if (it.kind === 'food') m += Math.min(0.3, battles * 0.03);
    if (it.kind === 'raw') m += Math.min(0.2, battles * 0.02);
    return it.base * m * (1 + S().day / 1000); // gentle inflation
  }

  function dailyMarket() {
    const m = S().market;
    for (const k of Object.keys(D.ITEMS)) {
      const t = targetPrice(k) * U.rand(0.93, 1.07);
      m.prices[k] += (t - m.prices[k]) * 0.2;
      (m.history[k] = m.history[k] || []).push(+m.prices[k].toFixed(2));
      if (m.history[k].length > 30) m.history[k].shift();
    }
    const gt = D.GOLD_BASE_PRICE * (1 + S().day / 600) * U.rand(0.95, 1.05);
    m.gold += (gt - m.gold) * 0.15;
  }

  // Cost of buying qty units (each unit pushes the price up).
  function quoteBuy(key, qty) {
    const it = D.ITEMS[key];
    let p = S().market.prices[key], total = 0;
    for (let i = 0; i < qty; i++) { total += p; p *= 1 + it.impact; }
    return { total, endPrice: p };
  }
  function quoteSell(key, qty) {
    const it = D.ITEMS[key];
    let p = S().market.prices[key], total = 0;
    for (let i = 0; i < qty; i++) { total += p * 0.95; p *= 1 - it.impact; }
    const nation = G.world.playerNation();
    const tax = total * nation.vat;
    return { total: total - tax, tax, endPrice: p };
  }

  function buy(key, qty) {
    qty = Math.floor(qty);
    if (!(qty > 0)) return G.fail('Enter a quantity.');
    const q = quoteBuy(key, qty);
    if (P().money < q.total) return G.fail(`Not enough credits (need ${U.money(q.total)}).`);
    P().money -= q.total;
    S().market.prices[key] = q.endPrice;
    addItem(key, qty);
    return G.ok(`Bought ${qty} ${D.ITEMS[key].name} for ${U.money(q.total)}.`);
  }

  function sell(key, qty) {
    qty = Math.floor(qty);
    if (!(qty > 0)) return G.fail('Enter a quantity.');
    if ((P().inv[key] || 0) < qty) return G.fail('You do not have that many.');
    const q = quoteSell(key, qty);
    P().money += q.total;
    G.world.playerNation().treasury += q.tax;
    S().market.prices[key] = q.endPrice;
    addItem(key, -qty);
    return G.ok(`Sold ${qty} ${D.ITEMS[key].name} for ${U.money(q.total)} (VAT ${U.money(q.tax)}).`);
  }

  function buyGold(n) {
    n = Math.floor(n);
    if (!(n > 0)) return G.fail('Enter an amount.');
    let p = S().market.gold, total = 0;
    for (let i = 0; i < n; i++) { total += p * 1.02; p *= 1.01; }
    if (P().money < total) return G.fail(`Need ${U.money(total)}.`);
    P().money -= total; P().gold += n; S().market.gold = p;
    return G.ok(`Bought ${n} gold for ${U.money(total)}.`);
  }
  function sellGold(n) {
    n = Math.floor(n);
    if (!(n > 0)) return G.fail('Enter an amount.');
    if (P().gold < n) return G.fail('Not enough gold.');
    let p = S().market.gold, total = 0;
    for (let i = 0; i < n; i++) { total += p * 0.98; p *= 0.99; }
    P().money += total; P().gold -= n; S().market.gold = p;
    return G.ok(`Sold ${n} gold for ${U.money(total)}.`);
  }

  function addItem(key, qty) {
    const inv = P().inv;
    inv[key] = (inv[key] || 0) + qty;
    if (inv[key] <= 0) delete inv[key];
  }

  // ---------- jobs ----------
  function wageSkillFactor() { return 1 + (P().ecoSkill - 1) * 0.15; }

  function generateJobs() {
    const n = G.world.playerNation();
    S().jobs = [];
    if (!n.alive) return;
    for (let i = 0; i < 6; i++) {
      S().jobs.push({
        id: U.nextId(),
        employer: `${n.name} ${U.pick(D.EMPLOYER_WORDS)}${U.chance(0.5) ? ' Co.' : ''}`,
        wage: Math.round(n.avgWage * U.rand(0.7, 1.35) * wageSkillFactor() * 10) / 10,
      });
    }
    S().jobs.sort((a, b) => b.wage - a.wage);
  }

  function takeJob(id) {
    const j = S().jobs.find((x) => x.id === id);
    if (!j) return G.fail('Offer no longer available.');
    P().job = { employer: j.employer, wage: j.wage, nation: P().nation };
    S().jobs = S().jobs.filter((x) => x.id !== id);
    return G.ok(`You now work for ${j.employer} at ${U.money(j.wage)}/day.`);
  }
  function quitJob() {
    P().job = null;
    return G.ok('You quit your job.');
  }

  function work() {
    const p = P();
    if (!p.job) return G.fail('You need a job first (Work tab).');
    if (p.flags.worked) return G.fail('Already worked today.');
    if (!G.player.spend(D.E.work)) return;
    const nation = G.world.nation(p.job.nation);
    const gross = p.job.wage;
    const tax = gross * nation.incomeTax;
    p.money += gross - tax;
    nation.treasury += tax;
    p.flags.worked = true;
    p.workCount++;
    p.ecoSkill = +(1 + Math.sqrt(p.workCount) * 0.35).toFixed(2);
    G.player.addXp(D.XP.work);
    return G.ok(`Worked at ${p.job.employer}: +${U.money(gross - tax)} (tax ${U.money(tax)}).`);
  }

  // ---------- companies ----------
  function maxWorkers(c) { return c.level * 5; }

  function productivity(c) {
    const region = S().regions[c.region];
    const t = D.COMPANY_TYPES[c.type];
    const avg = G.world.nation(P().nation).avgWage || 30;
    const motivation = U.clamp(c.wage / avg, 0.5, 1.25);
    let out = t.perWorker * motivation;
    if (t.raw) {
      out *= 1 + 0.1 * (c.level - 1);
      if (region.resource === t.resource) out *= 1 + region.bonus;
      else out *= 0.6;
    }
    return out;
  }

  function outputKey(c) {
    const t = D.COMPANY_TYPES[c.type];
    return t.raw ? t.output : t.output + c.level;
  }

  // Produce `units` of output, limited by raw input in the player's storage.
  function produce(c, units) {
    const t = D.COMPANY_TYPES[c.type];
    units = Math.floor(units);
    if (!t.raw) {
      const per = t.inputPerQ * c.level;
      const have = P().inv[t.input] || 0;
      units = Math.min(units, Math.floor(have / per));
      if (units > 0) addItem(t.input, -units * per);
    }
    if (units > 0) addItem(outputKey(c), units);
    return units;
  }

  function createCompany(type, regionId) {
    const t = D.COMPANY_TYPES[type];
    const region = S().regions[regionId];
    if (!t || !region) return G.fail('Invalid company.');
    if (region.owner !== P().nation) return G.fail('You can only build in your own nation.');
    if (P().gold < t.cost) return G.fail(`Need ${t.cost} gold.`);
    P().gold -= t.cost;
    const nation = G.world.playerNation();
    const c = { id: U.nextId(), type, region: regionId, level: 1, workers: 0, wage: Math.round(nation.avgWage), managed: false, last: 0 };
    P().companies.push(c);
    return G.ok(`Founded a ${t.name} in ${region.name}.`);
  }

  function company(id) { return P().companies.find((c) => c.id === id); }

  function upgradeCost(c) { return [0, 15, 30, 50, 80][c.level] || Infinity; }

  function upgradeCompany(id) {
    const c = company(id);
    if (!c) return;
    if (c.level >= 5) return G.fail('Already max level.');
    const cost = upgradeCost(c);
    if (P().gold < cost) return G.fail(`Need ${cost} gold.`);
    P().gold -= cost;
    c.level++;
    return G.ok(`${D.COMPANY_TYPES[c.type].name} upgraded to level ${c.level}.`);
  }

  function hire(id, n) {
    const c = company(id);
    if (!c) return;
    const nation = G.world.playerNation();
    const target = U.clamp(c.workers + n, 0, maxWorkers(c));
    if (n > 0 && c.wage < nation.avgWage * 0.6) return G.fail('Nobody will work for that wage. Raise it.');
    c.workers = target;
    return G.ok(`${D.COMPANY_TYPES[c.type].name} now has ${c.workers} workers.`);
  }

  function setWage(id, w) {
    const c = company(id);
    if (!c || !(w >= 0)) return G.fail('Invalid wage.');
    c.wage = Math.round(w * 10) / 10;
    return G.ok(`Wage set to ${U.money(c.wage)}.`);
  }

  function manage(id) {
    const c = company(id);
    if (!c) return;
    if (c.managed) return G.fail('You already worked here today.');
    const t = D.COMPANY_TYPES[c.type];
    if (!t.raw) {
      const per = t.inputPerQ * c.level;
      if ((P().inv[t.input] || 0) < per) return G.fail(`Needs ${D.ITEMS[t.input].name} in storage.`);
    }
    if (!G.player.spend(D.E.manage)) return;
    const base = t.perWorker * (t.raw ? productivityRaw(c) : 1);
    const made = produce(c, base * 1.5 * (1 + (P().ecoSkill - 1) * 0.5));
    c.managed = true;
    G.player.addXp(D.XP.manage);
    return G.ok(`You produced ${made} ${D.ITEMS[outputKey(c)].name}.`);
  }
  function productivityRaw(c) {
    const region = S().regions[c.region];
    const t = D.COMPANY_TYPES[c.type];
    let m = 1 + 0.1 * (c.level - 1);
    m *= region.resource === t.resource ? 1 + region.bonus : 0.6;
    return m;
  }

  function sellCompany(id) {
    const c = company(id);
    if (!c) return;
    const t = D.COMPANY_TYPES[c.type];
    let refund = Math.floor(t.cost / 2);
    for (let l = 1; l < c.level; l++) refund += Math.floor([0, 15, 30, 50, 80][l] / 2);
    P().gold += refund;
    P().companies = P().companies.filter((x) => x.id !== id);
    return G.ok(`Company sold for ${refund} gold.`);
  }

  function dailyCompanies() {
    const p = P();
    for (const c of p.companies) {
      c.managed = false;
      if (c.workers <= 0) { c.last = 0; continue; }
      const payroll = c.workers * c.wage;
      if (p.money < payroll) {
        const affordable = c.wage > 0 ? Math.floor(p.money / c.wage) : c.workers;
        G.report(`⚠️ Could not pay all workers at your ${D.COMPANY_TYPES[c.type].name}: ${c.workers - affordable} quit.`);
        c.workers = affordable;
      }
      p.money -= c.workers * c.wage;
      const avg = G.world.playerNation().avgWage;
      if (c.wage < avg * 0.6 && c.workers > 0) {
        const quit = Math.ceil(c.workers / 2);
        c.workers -= quit;
        G.report(`⚠️ ${quit} workers quit your ${D.COMPANY_TYPES[c.type].name} over low wages.`);
      }
      c.last = produce(c, c.workers * productivity(c));
      if (c.workers > 0) {
        G.report(`${D.COMPANY_TYPES[c.type].icon} ${D.COMPANY_TYPES[c.type].name} (${S().regions[c.region].name}) produced ${c.last} ${D.ITEMS[outputKey(c)].name}, payroll ${U.money(c.workers * c.wage)}.`);
      }
    }
  }

  G.economy = {
    initMarket, dailyMarket, quoteBuy, quoteSell, buy, sell, buyGold, sellGold, addItem,
    generateJobs, takeJob, quitJob, work,
    createCompany, upgradeCompany, upgradeCost, hire, setWage, manage, sellCompany, dailyCompanies,
    maxWorkers, productivity, outputKey,
  };
})();
