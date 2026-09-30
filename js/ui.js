// DOM rendering. Every view is a function returning an HTML string; clicks are
// routed through [data-act] attributes to the ACTS table, then the UI re-renders.
(function () {
  const G = globalThis.G;
  const U = G.util;
  const D = G.data;
  const W = G.world;
  const $ = (id) => document.getElementById(id);
  const esc = U.esc;

  const TABS = [
    ['home', '🏠', 'Home'],
    ['map', '🗺️', 'Map'],
    ['battles', '⚔️', 'Battles'],
    ['work', '💼', 'Work'],
    ['companies', '🏭', 'Companies'],
    ['market', '📈', 'Market'],
    ['storage', '📦', 'Storage'],
    ['politics', '🏛️', 'Politics'],
    ['world', '🌍', 'World'],
    ['press', '📰', 'Newspaper'],
    ['settings', '⚙️', 'Settings'],
  ];

  const S = () => G.state;
  const P = () => G.state.player;

  // ---------- small helpers ----------
  function nationChip(nid) {
    const n = S().nations[nid];
    return `<span class="chip"><span class="dot" style="background:${n.color}"></span>${esc(n.name)}${n.alive ? '' : ' †'}</span>`;
  }
  function meter(v, max, cls = '') {
    return `<div class="meter ${cls}"><i style="width:${U.clamp((v / max) * 100, 0, 100)}%"></i></div>`;
  }
  function btn(act, label, opts = {}) {
    const data = Object.entries(opts.data || {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    return `<button class="btn ${opts.cls || ''}" data-act="${act}"${data}${opts.disabled ? ' disabled' : ''}${opts.title ? ` title="${esc(opts.title)}"` : ''}>${label}</button>`;
  }
  function val(id) { const el = $(id); return el ? el.value : ''; }

  // ---------- toasts / modal ----------
  G.toast = function (msg, kind = '') {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 4000);
  };
  function modal(html) {
    const m = $('modal');
    m.innerHTML = `<div class="card">${html}</div>`;
    m.hidden = false;
  }
  function closeModal() { $('modal').hidden = true; }

  // ---------- top bar & nav ----------
  function renderTop() {
    const p = P();
    const n = W.playerNation();
    $('topbar').innerHTML = `
      <span class="brand">STRAT GAME</span>
      <div class="stat">Day<b>${S().day}</b></div>
      <div class="stat">${nationChip(n.id)}</div>
      <div class="stat">Energy <b>${p.energy} / ${p.maxEnergy}</b>${meter(p.energy, p.maxEnergy)}</div>
      <div class="stat">Level ${p.level}<b>${p.xp} / ${G.player.xpNeeded(p.level)} xp</b>${meter(p.xp, G.player.xpNeeded(p.level), 'xp')}</div>
      <div class="stat">Credits<b>${U.money(p.money)}</b></div>
      <div class="stat">Gold<b>★ ${U.fmt(p.gold)}</b></div>
      <span class="spacer"></span>
      ${btn('endDay', 'End Day ▶', { cls: 'primary', title: 'Advance to the next day (shortcut: N)' })}`;
  }

  function badges() {
    const p = P();
    const b = {};
    const mine = S().battles.filter((x) => !x.over && (x.att === p.nation || x.def === p.nation)).length;
    if (mine) b.battles = mine;
    const todo = (!p.flags.worked && p.job ? 1 : 0) + (!p.flags.trained ? 1 : 0);
    if (todo) b.home = todo;
    const laws = S().laws.filter((l) => p.congress && l.myVote === null).length;
    if (laws) b.politics = laws;
    return b;
  }

  function renderNav() {
    const b = badges();
    $('nav').innerHTML = TABS.map(([id, icon, label]) =>
      `<button data-act="tab" data-tab="${id}" class="${S().ui.tab === id ? 'active' : ''}"><span>${icon}</span>${label}${b[id] ? `<span class="badge">${b[id]}</span>` : ''}</button>`).join('');
  }

  // ---------- views ----------
  const VIEWS = {};

  VIEWS.home = function () {
    const p = P();
    const n = W.playerNation();
    const r = G.player.rank();
    const food = [1, 2, 3, 4, 5].filter((q) => p.inv['food' + q]);
    const myBattles = S().battles.filter((b) => !b.over && (b.att === p.nation || b.def === p.nation));
    return `
      <div class="grid">
        <div class="card">
          <h3>${esc(p.name)}</h3>
          <dl class="kv">
            <dt>Citizenship</dt><dd>${nationChip(p.nation)}</dd>
            <dt>Level</dt><dd>${p.level}</dd>
            <dt>Strength</dt><dd>${U.fmt(p.strength, 1)}</dd>
            <dt>Military rank</dt><dd>${r.name} <span class="muted small">(${U.fmt(p.rankPts)}${r.next ? ' / ' + U.fmt(r.next) : ''})</span></dd>
            <dt>Economy skill</dt><dd>${p.ecoSkill}</dd>
            <dt>Popularity</dt><dd>${U.fmt(p.pop, 1)}</dd>
            <dt>Damage / hit</dt><dd>~${U.fmt(G.military.hitDamage(p.inv['weapon' + p.weaponQ] ? p.weaponQ : 0))}</dd>
            <dt>Office</dt><dd>${n.president.player ? '👑 President' : p.congress ? '🏛️ Congress member' : p.party !== null ? 'Party member' : 'Citizen'}</dd>
          </dl>
        </div>
        <div class="card">
          <h3>Daily tasks</h3>
          <div class="actions">
            <button class="action" data-act="work" ${p.flags.worked || !p.job ? 'disabled' : ''}>
              <span class="big">💼</span><b>Work</b>
              <small>${p.flags.worked ? 'Done today ✓' : p.job ? `${U.money(p.job.wage)} · ${D.E.work}⚡` : 'No job — see Work tab'}</small>
            </button>
            <button class="action" data-act="train" ${p.flags.trained ? 'disabled' : ''}>
              <span class="big">🏋️</span><b>Train</b>
              <small>${p.flags.trained ? 'Done today ✓' : `+${G.player.trainGain()} str · ${D.E.train}⚡`}</small>
            </button>
            <button class="action" data-act="eatAll" ${!food.length ? 'disabled' : ''}>
              <span class="big">🍞</span><b>Eat</b>
              <small>${p.flags.foodEnergy}/${D.E.foodCap} food energy today</small>
            </button>
            <button class="action" data-act="tab" data-tab="battles">
              <span class="big">⚔️</span><b>Fight</b>
              <small>${myBattles.length} battle${myBattles.length === 1 ? '' : 's'} for ${esc(n.name)}</small>
            </button>
          </div>
          <p class="small muted">Energy refills every day. Food restores up to ${D.E.foodCap} extra energy per day.</p>
        </div>
        <div class="card">
          <h3>Training facility</h3>
          <p>Level ${p.trainLevel} / 5 — training gives <b>+${G.player.trainGain()}</b> strength.</p>
          ${p.trainLevel < 5 ? btn('upgradeTraining', `Upgrade (★ ${D.TRAIN_UPGRADE_COST[p.trainLevel]})`) : '<p class="muted">Maxed out.</p>'}
        </div>
        <div class="card">
          <h3>${esc(n.name)}</h3>
          <dl class="kv">
            <dt>President</dt><dd>${esc(n.president.name)}${n.president.player ? ' (you)' : ''}</dd>
            <dt>Regions</dt><dd>${W.regionCount(n.id)}</dd>
            <dt>Treasury</dt><dd>${U.money(n.treasury)}</dd>
            <dt>At war with</dt><dd>${W.enemiesOf(n.id).map(nationChip).join(' ') || '<span class="muted">nobody</span>'}</dd>
            <dt>Next elections</dt><dd>Congress in ${G.politics.daysUntil('congress')}d · President in ${G.politics.daysUntil('president')}d</dd>
          </dl>
          ${!n.alive ? `<p class="bad">Your nation has fallen. Fight in resistance battles or change citizenship (World tab).</p>` : ''}
        </div>
        <div class="card" style="grid-column:1/-1">
          <h3>Latest news</h3>
          ${newsList(S().news.slice(0, 8))}
        </div>
      </div>`;
  };

  function newsList(items) {
    if (!items.length) return '<p class="muted">Nothing yet.</p>';
    return `<ul class="news-list">${items.map((x) => `<li><span class="d">Day ${x.day}</span>${esc(x.text)}</li>`).join('')}</ul>`;
  }

  VIEWS.map = function () {
    const { w, h } = W.mapSize();
    const sel = S().ui.region;
    const battleRegions = new Set(S().battles.filter((b) => !b.over).map((b) => b.region));
    const capitals = new Set(S().nations.filter((n) => n.alive).map((n) => n.capital));
    const hexes = S().regions.map((r) => {
      const n = S().nations[r.owner];
      const cls = ['hex', r.id === sel ? 'sel' : '', r.owner !== r.core ? 'occupied' : ''].join(' ');
      return `<g data-act="region" data-id="${r.id}">
        <polygon class="${cls}" points="${W.hexPoints(r)}" fill="${n.color}" data-act="region" data-id="${r.id}"></polygon>
        <text x="${r.x}" y="${r.y + 14}">${esc(r.name)}</text>
        <text class="icon" x="${r.x}" y="${r.y - 2}">${battleRegions.has(r.id) ? '⚔️' : capitals.has(r.id) ? '★' : r.resource === 'grain' ? (r.bonus ? '🌾' : '') : (r.bonus ? '🪨' : '')}</text>
      </g>`;
    }).join('');
    const legend = S().nations.filter((n) => n.alive).map((n) => nationChip(n.id)).join('');
    return `
      <h2>World map</h2>
      <div class="map-wrap">
        <div>
          <svg viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}">${hexes}</svg>
          <div class="legend">${legend}</div>
          <p class="small muted">★ capital · ⚔️ active battle · 🌾/🪨 resource bonus · dashed border = occupied territory</p>
        </div>
        <div class="card">${regionPanel(sel)}</div>
      </div>`;
  };

  function regionPanel(id) {
    if (id === null || id === undefined) return '<p class="muted">Click a region for details.</p>';
    const r = S().regions[id];
    const p = P();
    const pn = W.playerNation();
    const battle = S().battles.find((b) => !b.over && b.region === r.id);
    let actions = '';
    if (pn.president.player && r.owner !== p.nation && W.atWar(p.nation, r.owner)) {
      const border = r.neighbors.some((x) => S().regions[x].owner === p.nation);
      actions = btn('attack', '⚔️ Order attack', { cls: 'primary', data: { id: r.id }, disabled: !border || !!battle || G.military.activeBattleBetween(p.nation, r.owner) });
      if (!border) actions += '<p class="small muted">Not on your border.</p>';
    }
    return `
      <h3>${esc(r.name)}</h3>
      <dl class="kv">
        <dt>Owner</dt><dd>${nationChip(r.owner)}</dd>
        <dt>Original</dt><dd>${nationChip(r.core)}</dd>
        <dt>Resource</dt><dd>${r.resource === 'grain' ? '🌾 Grain' : '🪨 Iron'} ${r.bonus ? `<b class="good">+${U.pct(r.bonus)}</b>` : '<span class="muted">(no bonus)</span>'}</dd>
        <dt>Capital</dt><dd>${S().nations[r.owner].capital === r.id ? 'Yes ★' : 'No'}</dd>
        <dt>Neighbours</dt><dd class="small">${r.neighbors.map((x) => esc(S().regions[x].name)).join(', ')}</dd>
      </dl>
      ${battle ? `<p>⚔️ Battle in progress: ${esc(S().nations[battle.att].name)} vs ${esc(S().nations[battle.def].name)} — ${btn('gotoBattle', 'Go fight', { data: { id: battle.id }, cls: 'sm' })}</p>` : ''}
      ${actions}`;
  }

  VIEWS.battles = function () {
    const p = P();
    const active = S().battles.filter((b) => !b.over);
    active.sort((a, b) => (G.military.playerSideNation(b) ? 1 : 0) - (G.military.playerSideNation(a) ? 1 : 0));
    const ended = S().battles.filter((b) => b.over).slice(-8).reverse();
    const weaponOpts = [0, 1, 2, 3, 4, 5].map((q) =>
      `<option value="${q}" ${p.weaponQ === q ? 'selected' : ''}>${q ? `Q${q} weapon (x${D.ITEMS['weapon' + q].mult.toFixed(1)}) — have ${p.inv['weapon' + q] || 0}` : 'Fists (x1.0)'}</option>`).join('');
    return `
      <h2>Battles</h2>
      <div class="card row" style="margin-bottom:1rem">
        <span>Weapon:</span><select id="weaponQ" data-change="weapon">${weaponOpts}</select>
        <span class="muted small">~${U.fmt(G.military.hitDamage(p.inv['weapon' + p.weaponQ] ? p.weaponQ : 0))} dmg / hit · ${D.E.hit}⚡ per hit · ${Math.floor(p.energy / D.E.hit)} hits left</span>
        <span class="spacer"></span>${btn('eatAll', '🍞 Eat food')}
      </div>
      <div class="stack">
        ${active.length ? active.map(battleCard).join('') : '<p class="muted">No active battles. The world is at peace… for now.</p>'}
      </div>
      ${ended.length ? `<h3 style="margin-top:1.5rem">Recently ended</h3><div class="card"><table>
        <tr><th>Region</th><th>Attacker</th><th>Defender</th><th>Result</th><th class="right">Your dmg</th></tr>
        ${ended.map((b) => `<tr><td>${esc(S().regions[b.region].name)}</td><td>${nationChip(b.att)}</td><td>${nationChip(b.def)}</td>
          <td>${b.winner ? `${b.winner === 'att' ? 'Conquered' : 'Defended'} (${b.wins.att}-${b.wins.def})` : 'Cancelled'}</td>
          <td class="right">${U.fmt(b.player.att + b.player.def)}</td></tr>`).join('')}
      </table></div>` : ''}`;
  };

  function battleCard(b) {
    const p = P();
    const a = S().nations[b.att], d = S().nations[b.def];
    const region = S().regions[b.region];
    const forced = G.military.playerSideNation(b);
    const total = b.cur.att + b.cur.def || 1;
    const pips = (n) => `<span class="pips">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
    const sides = forced ? [forced] : ['att', 'def'];
    const hitsLeft = Math.floor(p.energy / D.E.hit);
    const fightBtns = sides.map((s) => {
      const who = s === 'att' ? a : d;
      const label = forced ? '' : ` for ${esc(who.name)}`;
      return `<div class="row">
        ${btn('fight', `Hit${label}`, { data: { id: b.id, side: s, n: 1 }, disabled: hitsLeft < 1 })}
        ${btn('fight', `×5`, { data: { id: b.id, side: s, n: 5 }, disabled: hitsLeft < 1 })}
        ${btn('fight', `All energy`, { cls: 'primary', data: { id: b.id, side: s, n: 999 }, disabled: hitsLeft < 1 })}
      </div>`;
    }).join('');
    const pn = W.playerNation();
    const fund = forced && pn.president.player ? `<div class="row" style="margin-top:.5rem">
        <span class="small muted">Treasury (${U.money(pn.treasury)}):</span>
        <input type="number" id="fund-${b.id}" value="1000" min="1">
        ${btn('fund', 'Fund (1₡ = 1 dmg)', { data: { id: b.id }, cls: 'sm' })}</div>` : '';
    return `
      <div class="card battle ${forced ? 'mine' : ''}">
        <div class="row"><h3 style="margin:0">${b.resistance ? '✊ Resistance: ' : ''}Battle for ${esc(region.name)}</h3>
          <span class="spacer"></span><span class="muted small">Round ${b.round} · started day ${b.started} · first to ${G.military.WIN_ROUNDS}</span></div>
        <div class="vs" style="margin-top:.6rem">
          <span>${nationChip(b.att)} ${pips(b.wins.att)}</span>
          <span class="muted small">${forced ? `You fight for ${esc(forced === 'att' ? a.name : d.name)}` : 'Mercenary — pick a side'}</span>
          <span>${pips(b.wins.def)} ${nationChip(b.def)}</span>
        </div>
        <div class="dmgbar"><i style="width:${(b.cur.att / total) * 100}%;background:${a.color}"></i><i style="width:${(b.cur.def / total) * 100}%;background:${d.color}"></i></div>
        <div class="vs small"><span>${U.fmt(b.cur.att)} dmg</span><span class="muted">this round (more AI damage arrives at day end)</span><span>${U.fmt(b.cur.def)} dmg</span></div>
        <p class="small muted">Your damage in this battle: ${U.fmt(b.player.att + b.player.def)}</p>
        ${fightBtns}${fund}
      </div>`;
  }

  VIEWS.work = function () {
    const p = P();
    const n = W.playerNation();
    return `
      <h2>Work</h2>
      <div class="grid">
        <div class="card">
          <h3>Your job</h3>
          ${p.job ? `<p><b>${esc(p.job.employer)}</b><br>Wage ${U.money(p.job.wage)}/day (income tax ${U.pct(n.incomeTax)})</p>
            <div class="row">${btn('work', p.flags.worked ? 'Worked today ✓' : `Work (${D.E.work}⚡)`, { cls: 'primary', disabled: p.flags.worked })}
            ${btn('quitJob', 'Quit', { cls: 'danger' })}</div>` : '<p class="muted">You are unemployed. Pick an offer below.</p>'}
          <p class="small muted">Economy skill ${p.ecoSkill} — grows with every day worked and raises wage offers and your own company output.</p>
        </div>
        <div class="card">
          <h3>Job market — ${esc(n.name)}</h3>
          <p class="small muted">National average wage: ${U.money(n.avgWage)}. Offers refresh daily.</p>
          ${S().jobs.length ? `<table><tr><th>Employer</th><th class="right">Wage</th><th></th></tr>
            ${S().jobs.map((j) => `<tr><td>${esc(j.employer)}</td><td class="right">${U.money(j.wage)}</td><td class="right">${btn('takeJob', 'Take', { cls: 'sm', data: { id: j.id } })}</td></tr>`).join('')}
          </table>` : '<p class="muted">No offers available.</p>'}
        </div>
      </div>`;
  };

  VIEWS.companies = function () {
    const p = P();
    const my = W.regionsOf(p.nation);
    const typeOpts = Object.entries(D.COMPANY_TYPES).map(([k, t]) => `<option value="${k}">${t.icon} ${t.name} — ★${t.cost}</option>`).join('');
    const regionOpts = my.map((r) => `<option value="${r.id}">${esc(r.name)} — ${r.resource}${r.bonus ? ' +' + U.pct(r.bonus) : ''}</option>`).join('');
    return `
      <h2>Companies</h2>
      <div class="card" style="margin-bottom:1rem">
        <h3>Found a company</h3>
        <div class="row">
          <select id="newType">${typeOpts}</select>
          <select id="newRegion">${regionOpts || '<option value="">No regions</option>'}</select>
          ${btn('createCompany', 'Found', { cls: 'primary', disabled: !my.length })}
        </div>
        <p class="small muted">Farms and mines produce raw goods; they get a big bonus in regions with the matching resource and a penalty elsewhere.
        Factories turn raw goods from your storage into food/weapons of quality equal to the factory level
        (food uses Q×1 grain, weapons use Q×3 iron per unit). Products go to your Storage — sell them on the Market.</p>
      </div>
      <div class="grid">${p.companies.length ? p.companies.map(companyCard).join('') : '<p class="muted">You don\'t own any companies yet. Earn gold by levelling up, winning battle medals, or buying it on the market.</p>'}</div>`;
  };

  function companyCard(c) {
    const t = D.COMPANY_TYPES[c.type];
    const r = S().regions[c.region];
    const out = G.economy.outputKey(c);
    const n = W.playerNation();
    const max = G.economy.maxWorkers(c);
    const inputNote = t.raw ? '' : `<dt>Input</dt><dd>${t.inputPerQ * c.level} ${D.ITEMS[t.input].name}/unit (have ${U.fmt(P().inv[t.input] || 0)})</dd>`;
    return `
      <div class="card">
        <h3>${t.icon} ${t.name} <span class="muted small">Lv ${c.level}</span></h3>
        <dl class="kv">
          <dt>Location</dt><dd>${esc(r.name)} ${r.owner !== P().nation ? '<span class="bad small">(occupied)</span>' : ''}</dd>
          <dt>Produces</dt><dd>${D.ITEMS[out].name} · ~${U.fmt(G.economy.productivity(c), 1)}/worker</dd>
          ${inputNote}
          <dt>Workers</dt><dd>${c.workers} / ${max}</dd>
          <dt>Wage</dt><dd>${U.money(c.wage)} <span class="muted small">(avg ${U.money(n.avgWage)})</span></dd>
          <dt>Yesterday</dt><dd>${c.last} units</dd>
        </dl>
        <div class="row" style="margin-top:.6rem">
          ${btn('manage', c.managed ? 'Worked ✓' : `Work here (${D.E.manage}⚡)`, { cls: 'primary sm', data: { id: c.id }, disabled: c.managed })}
          ${btn('hire', '+1', { cls: 'sm', data: { id: c.id, n: 1 }, title: 'Hire', disabled: c.workers >= max })}
          ${btn('hire', '+5', { cls: 'sm', data: { id: c.id, n: 5 }, title: 'Hire 5', disabled: c.workers >= max })}
          ${btn('hire', '−1', { cls: 'sm', data: { id: c.id, n: -1 }, title: 'Fire', disabled: !c.workers })}
        </div>
        <div class="row" style="margin-top:.5rem">
          <input type="number" id="wage-${c.id}" value="${c.wage}" min="0" step="0.5">
          ${btn('setWage', 'Set wage', { cls: 'sm', data: { id: c.id } })}
          <span class="spacer"></span>
          ${c.level < 5 ? btn('upgradeCompany', `Upgrade ★${G.economy.upgradeCost(c)}`, { cls: 'sm', data: { id: c.id } }) : ''}
          ${btn('sellCompany', 'Sell', { cls: 'sm danger', data: { id: c.id } })}
        </div>
      </div>`;
  }

  VIEWS.market = function () {
    const p = P();
    const m = S().market;
    const rows = Object.entries(D.ITEMS).sort((a, b) => a[1].kind.localeCompare(b[1].kind) || (a[1].q || 0) - (b[1].q || 0)).map(([k, it]) => {
      const h = m.history[k] || [];
      const prev = h.length > 7 ? h[h.length - 8] : h[0];
      const trend = prev ? (m.prices[k] - prev) / prev : 0;
      return `<tr>
        <td>${it.icon} ${it.name}${it.energy ? ` <span class="muted small">+${it.energy}⚡</span>` : ''}${it.mult ? ` <span class="muted small">x${it.mult.toFixed(1)}</span>` : ''}</td>
        <td class="right">${U.money(m.prices[k])}</td>
        <td class="right small ${trend > 0.01 ? 'good' : trend < -0.01 ? 'bad' : 'muted'}">${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend * 100).toFixed(0)}%</td>
        <td class="right">${U.fmt(p.inv[k] || 0)}</td>
        <td><div class="row" style="flex-wrap:nowrap"><input type="number" id="qty-${k}" value="10" min="1">
          ${btn('buy', 'Buy', { cls: 'sm', data: { k } })}${btn('sell', 'Sell', { cls: 'sm', data: { k }, disabled: !p.inv[k] })}</div></td>
      </tr>`;
    }).join('');
    return `
      <h2>Market</h2>
      <div class="grid">
        <div class="card" style="grid-column:1/-1">
          <p class="small muted">Prices move with supply and demand — large orders shift the price, and wars push up weapon and food prices.
          Sales pay ${U.pct(W.playerNation().vat)} VAT to ${esc(W.playerNation().name)}.</p>
          <div class="table-wrap"><table>
            <tr><th>Item</th><th class="right">Price</th><th class="right">7d</th><th class="right">You own</th><th>Trade</th></tr>
            ${rows}
          </table></div>
        </div>
        <div class="card">
          <h3>Gold exchange</h3>
          <p>1 gold ≈ <b>${U.money(m.gold)}</b></p>
          <div class="row"><input type="number" id="qty-gold" value="1" min="1">${btn('buyGold', 'Buy gold')}${btn('sellGold', 'Sell gold')}</div>
        </div>
      </div>`;
  };

  VIEWS.storage = function () {
    const p = P();
    const items = Object.entries(p.inv).filter(([, v]) => v > 0);
    return `
      <h2>Storage</h2>
      <div class="card">
        ${items.length ? `<table><tr><th>Item</th><th class="right">Quantity</th><th class="right">Value</th><th></th></tr>
          ${items.map(([k, v]) => {
            const it = D.ITEMS[k];
            return `<tr><td>${it.icon} ${it.name}</td><td class="right">${U.fmt(v)}</td><td class="right">${U.money(v * S().market.prices[k])}</td>
              <td class="right">${it.kind === 'food' ? btn('eat', `Eat (+${it.energy}⚡)`, { cls: 'sm', data: { q: it.q } }) : ''}
              ${it.kind === 'weapon' ? btn('equip', p.weaponQ === it.q ? 'Equipped' : 'Equip', { cls: 'sm', data: { q: it.q }, disabled: p.weaponQ === it.q }) : ''}</td></tr>`;
          }).join('')}</table>` : '<p class="muted">Empty.</p>'}
      </div>`;
  };

  VIEWS.politics = function () {
    const p = P();
    const n = W.playerNation();
    const totalSeats = D.CONGRESS_SEATS;
    const partyColor = (i) => ['#e0a526', '#3d8fd6', '#c0392b', '#3fb56b', '#8e44ad', '#16a085'][i % 6];
    const seatBar = n.parties.map((pt, i) => `<i style="width:${((n.seats[pt.id] || 0) / totalSeats) * 100}%;background:${partyColor(i)}" title="${esc(pt.name)}"></i>`).join('');
    const laws = S().laws;
    const neighbors = W.neighborNations(n.id).filter((x) => S().nations[x].alive && !W.atWar(n.id, x));
    const enemies = W.enemiesOf(n.id);
    return `
      <h2>Politics — ${esc(n.name)}</h2>
      <div class="grid">
        <div class="card">
          <h3>Government</h3>
          <dl class="kv">
            <dt>President</dt><dd>${esc(n.president.name)}${n.president.player ? ' 👑 (you)' : ''} <span class="muted small">since day ${n.president.since}</span></dd>
            <dt>Treasury</dt><dd>${U.money(n.treasury)}</dd>
            <dt>Income tax</dt><dd>${U.pct(n.incomeTax)}</dd>
            <dt>VAT</dt><dd>${U.pct(n.vat)}</dd>
            <dt>Wars</dt><dd>${enemies.map(nationChip).join(' ') || '<span class="muted">none</span>'}</dd>
          </dl>
        </div>
        <div class="card">
          <h3>Congress</h3>
          <div class="seats">${seatBar}</div>
          <table>${n.parties.map((pt, i) => `<tr>
            <td><span class="dot" style="background:${partyColor(i)}"></span> ${esc(pt.name)} ${p.party === pt.id ? '<b class="good small">(your party)</b>' : ''}<br>
              <span class="muted small">Leader ${esc(pt.leader)} · ${pt.hawk > 0.6 ? 'hawkish' : pt.hawk < 0.35 ? 'dovish' : 'moderate'}</span></td>
            <td class="right">${n.seats[pt.id] || 0} seats</td>
            <td class="right">${p.party === pt.id ? btn('leaveParty', 'Leave', { cls: 'sm danger' }) : btn('joinParty', 'Join', { cls: 'sm', data: { id: pt.id }, disabled: p.level < 3 })}</td>
          </tr>`).join('')}</table>
          ${p.level < 3 ? '<p class="small muted">Reach level 3 to join a party.</p>' : ''}
        </div>
        <div class="card">
          <h3>Elections</h3>
          <p>Congress elections in <b>${G.politics.daysUntil('congress')}</b> days · Presidential in <b>${G.politics.daysUntil('president')}</b> days.</p>
          <p class="small muted">Your electoral strength: ${U.fmt(G.politics.playerScore(), 1)} (popularity, level, medals). Write newspaper articles to grow it.</p>
          <div class="row">
            ${btn('candidacy', p.candidateCongress ? '✓ Running for congress' : 'Run for congress (lvl 5)', { data: { kind: 'congress' }, disabled: p.party === null })}
            ${btn('candidacy', p.candidatePresident ? '✓ Running for president' : 'Run for president (lvl 8)', { data: { kind: 'president' }, disabled: p.party === null })}
          </div>
          ${p.congress ? '<p class="good">🏛️ You hold a congress seat.</p>' : ''}
        </div>
        <div class="card" style="grid-column:1/-1">
          <h3>Proposals</h3>
          ${laws.length ? `<table>${laws.map((l) => `<tr>
            <td>${esc(G.politics.LAW_TEXT[l.type](l))}<br><span class="muted small">Proposed day ${l.day} by ${l.byPlayer ? 'you' : 'congress'} · vote at end of ${l.byPlayer ? 'today' : 'tomorrow'}</span></td>
            <td class="right">${p.congress ? `${btn('vote', l.myVote === true ? '✓ Yes' : 'Yes', { cls: 'sm', data: { id: l.id, v: 1 } })} ${btn('vote', l.myVote === false ? '✓ No' : 'No', { cls: 'sm', data: { id: l.id, v: 0 } })}` : '<span class="muted small">Only congress votes</span>'}</td>
          </tr>`).join('')}</table>` : '<p class="muted">No laws on the table.</p>'}
        </div>
        ${n.president.player ? `
        <div class="card" style="grid-column:1/-1">
          <h3>👑 Presidential orders</h3>
          <div class="stack">
            <div class="row"><b>Declare war on</b>
              <select id="warTarget">${neighbors.map((x) => `<option value="${x}">${esc(S().nations[x].name)}</option>`).join('') || '<option value="">No neighbours</option>'}</select>
              ${btn('propose', 'Propose', { data: { type: 'war' }, disabled: !neighbors.length })}</div>
            <div class="row"><b>Make peace with</b>
              <select id="peaceTarget">${enemies.map((x) => `<option value="${x}">${esc(S().nations[x].name)}</option>`).join('') || '<option value="">No wars</option>'}</select>
              ${btn('propose', 'Propose', { data: { type: 'peace' }, disabled: !enemies.length })}</div>
            <div class="row"><b>Income tax</b> <input type="number" id="incomeTax" value="${Math.round(n.incomeTax * 100)}" min="0" max="50">%
              ${btn('propose', 'Propose', { data: { type: 'incomeTax' } })}
              <b style="margin-left:1rem">VAT</b> <input type="number" id="vat" value="${Math.round(n.vat * 100)}" min="0" max="30">%
              ${btn('propose', 'Propose', { data: { type: 'vat' } })}</div>
            <p class="small muted">Laws pass with a congress majority. To attack, open the Map, select an enemy border region and order an attack. You can fund battles from the treasury on the Battles tab.</p>
          </div>
        </div>` : ''}
      </div>`;
  };

  VIEWS.world = function () {
    const p = P();
    const rows = S().nations.slice().sort((a, b) => W.regionCount(b.id) - W.regionCount(a.id)).map((n) => `<tr>
      <td>${nationChip(n.id)}</td><td class="right">${W.regionCount(n.id)}</td><td class="right">${n.alive ? U.money(n.treasury) : '-'}</td>
      <td>${n.alive ? esc(n.president.name) + (n.president.player ? ' (you)' : '') : '<span class="muted">fallen</span>'}</td>
      <td>${W.enemiesOf(n.id).map(nationChip).join(' ') || '<span class="muted">-</span>'}</td>
      <td class="right">${n.alive && n.id !== p.nation ? btn('citizenship', 'Move here (★3)', { cls: 'sm', data: { id: n.id } }) : ''}</td></tr>`).join('');
    return `
      <h2>World</h2>
      <div class="card"><div class="table-wrap"><table>
        <tr><th>Nation</th><th class="right">Regions</th><th class="right">Treasury</th><th>President</th><th>At war with</th><th></th></tr>
        ${rows}
      </table></div>
      <p class="small muted">Changing citizenship costs 3 gold, halves your popularity and removes you from your party, congress and job.</p></div>`;
  };

  VIEWS.press = function () {
    const p = P();
    const f = S().ui.newsFilter || 'all';
    const items = S().news.filter((x) => f === 'all' || x.kind === f).slice(0, 80);
    return `
      <h2>Newspaper</h2>
      <div class="grid">
        <div class="card">
          <h3>Write an article</h3>
          <p class="small muted">Articles build your subscriber base and popularity, which wins elections. ${D.E.article}⚡, once per day, level 2+.</p>
          <div class="row"><input id="articleTitle" placeholder="Headline (optional)" style="flex:1" maxlength="90">
          ${btn('write', 'Publish', { cls: 'primary', disabled: p.flags.wrote || p.level < 2 })}</div>
          <p>Subscribers: <b>${p.subscribers}</b> · Popularity: <b>${U.fmt(p.pop, 1)}</b></p>
          ${p.articles.length ? `<ul class="news-list">${p.articles.slice(0, 8).map((a) => `<li><span class="d">Day ${a.day}</span>${esc(a.title)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="card">
          <h3>World news</h3>
          <div class="tabs">${['all', 'war', 'politics', 'player'].map((k) => btn('newsFilter', k, { cls: 'sm' + (f === k ? ' primary' : ''), data: { f: k } })).join('')}</div>
          ${newsList(items)}
        </div>
      </div>`;
  };

  VIEWS.settings = function () {
    const p = P();
    return `
      <h2>Settings</h2>
      <div class="grid">
        <div class="card">
          <h3>Save</h3>
          <p class="small muted">The game autosaves in your browser every day and after every action.</p>
          <div class="row">${btn('save', 'Save now')}${btn('export', 'Export save')}${btn('importShow', 'Import save')}</div>
        </div>
        <div class="card">
          <h3>Achievements</h3>
          <table>${G.achievements.list.map((a) => `<tr><td>${p.achievements[a.id] ? '🏅' : '▫️'} <b>${a.name}</b><br><span class="small muted">${a.desc}</span></td>
            <td class="right small">${p.achievements[a.id] ? 'day ' + p.achievements[a.id] : a.gold ? '★' + a.gold : ''}</td></tr>`).join('')}</table>
        </div>
        <div class="card">
          <h3>Danger zone</h3>
          ${btn('newGame', 'Start a new game', { cls: 'danger' })}
        </div>
      </div>`;
  };

  // ---------- start screen ----------
  function renderStart() {
    $('topbar').innerHTML = '';
    $('nav').innerHTML = '';
    $('app').style.display = 'block';
    $('view').innerHTML = `
      <div class="start">
        <h1>STRAT GAME</h1>
        <p>A single-player strategy sandbox of economy, politics and war. Eight AI nations compete for a hex continent.
        Work, train, build companies, trade on the market, fight in battles, run for congress, get elected president and lead your nation to glory.</p>
        <div class="card stack">
          <div class="row"><b>Your name</b><input id="pname" value="Citizen" maxlength="24"></div>
          <div><b>Choose your nation</b>
            <div class="nation-pick">${D.NATIONS.map((n, i) => `<label><input type="radio" name="nation" value="${i}" ${i === 0 ? 'checked' : ''}>
              <span class="dot" style="background:${n.color}"></span>${n.name}</label>`).join('')}</div>
          </div>
          <div class="row"><b>World seed</b><input id="seed" type="number" style="width:140px" placeholder="random">
            <span class="spacer"></span>${btn('importShow', 'Import save')} ${btn('start', 'Start game ▶', { cls: 'primary' })}</div>
        </div>
        <div class="card" style="margin-top:1rem">
          <h3>How to play</h3>
          <ul class="small">
            <li><b>Each day</b> you get a full bar of energy. Spend it to work, train, fight and write articles, then press <b>End Day</b>.</li>
            <li><b>Work</b> earns credits. <b>Train</b> grows strength, which multiplies your battle damage.</li>
            <li><b>Food</b> restores extra energy (up to 100/day). <b>Weapons</b> multiply damage per hit.</li>
            <li><b>Companies</b> (bought with gold) produce raw goods, food and weapons for you to sell.</li>
            <li><b>Battles</b> are best of 5 rounds; each day is a round. Your damage adds to the AI citizens' — train hard enough and you decide wars.</li>
            <li><b>Politics</b>: join a party (lvl 3), win a congress seat (lvl 5) and become president (lvl 8) to declare wars, set taxes and order attacks.</li>
          </ul>
        </div>
      </div>`;
  }

  // ---------- render ----------
  function render() {
    if (!G.state) return renderStart();
    $('app').style.display = '';
    renderTop();
    renderNav();
    const v = VIEWS[S().ui.tab] || VIEWS.home;
    $('view').innerHTML = v();
  }

  function after(result) {
    if (G.state) G.game.save();
    render();
    return result;
  }

  // ---------- actions ----------
  const num = (x) => Number(x);
  const ACTS = {
    tab: (d) => { S().ui.tab = d.tab; window.scrollTo(0, 0); },
    endDay: () => showReport(G.game.endDay()),
    work: () => G.economy.work(),
    train: () => G.player.train(),
    eatAll: () => G.player.eatAll(),
    eat: (d) => G.player.eat(num(d.q)),
    equip: (d) => { P().weaponQ = num(d.q); },
    upgradeTraining: () => G.player.upgradeTraining(),
    region: (d) => { S().ui.region = num(d.id); },
    attack: (d) => G.military.orderAttack(num(d.id)),
    gotoBattle: () => { S().ui.tab = 'battles'; },
    fight: (d) => G.military.fight(num(d.id), d.side, num(d.n)),
    fund: (d) => G.military.fundBattle(num(d.id), num(val('fund-' + d.id))),
    takeJob: (d) => G.economy.takeJob(num(d.id)),
    quitJob: () => G.economy.quitJob(),
    createCompany: () => G.economy.createCompany(val('newType'), num(val('newRegion'))),
    manage: (d) => G.economy.manage(num(d.id)),
    hire: (d) => G.economy.hire(num(d.id), num(d.n)),
    setWage: (d) => G.economy.setWage(num(d.id), num(val('wage-' + d.id))),
    upgradeCompany: (d) => G.economy.upgradeCompany(num(d.id)),
    sellCompany: (d) => { if (confirm('Sell this company for half its gold value?')) G.economy.sellCompany(num(d.id)); },
    buy: (d) => G.economy.buy(d.k, num(val('qty-' + d.k))),
    sell: (d) => G.economy.sell(d.k, num(val('qty-' + d.k))),
    buyGold: () => G.economy.buyGold(num(val('qty-gold'))),
    sellGold: () => G.economy.sellGold(num(val('qty-gold'))),
    joinParty: (d) => G.politics.joinParty(num(d.id)),
    leaveParty: () => G.politics.leaveParty(),
    candidacy: (d) => G.politics.toggleCandidacy(d.kind),
    vote: (d) => G.politics.vote(num(d.id), d.v === '1'),
    propose: (d) => {
      if (d.type === 'war') return G.politics.playerPropose('war', num(val('warTarget')));
      if (d.type === 'peace') return G.politics.playerPropose('peace', num(val('peaceTarget')));
      return G.politics.playerPropose(d.type, null, num(val(d.type)) / 100);
    },
    citizenship: (d) => { if (confirm('Change citizenship? This costs 3 gold.')) G.player.changeCitizenship(num(d.id)); },
    write: () => G.player.writeArticle(val('articleTitle')),
    newsFilter: (d) => { S().ui.newsFilter = d.f; },
    save: () => { G.game.save(); G.ok('Game saved.'); },
    export: () => {
      modal(`<h3>Export save</h3><p class="small muted">Copy this text somewhere safe.</p>
        <textarea readonly onclick="this.select()">${esc(G.game.exportSave())}</textarea>
        <div class="row" style="margin-top:.6rem"><span class="spacer"></span>${btn('closeModal', 'Close')}</div>`);
    },
    importShow: () => {
      modal(`<h3>Import save</h3><textarea id="importText" placeholder="Paste save text here"></textarea>
        <div class="row" style="margin-top:.6rem"><span class="spacer"></span>${btn('closeModal', 'Cancel')}${btn('importDo', 'Import', { cls: 'primary' })}</div>`);
    },
    importDo: () => {
      try { G.game.importSave(val('importText')); closeModal(); G.ok('Save imported.'); } catch (e) { G.fail('Import failed: ' + e.message); }
    },
    closeModal: () => closeModal(),
    newGame: () => { if (confirm('Abandon this game and start over?')) G.game.wipe(); },
    start: () => {
      const nation = num((document.querySelector('input[name=nation]:checked') || {}).value || 0);
      const seedRaw = val('seed');
      const seed = seedRaw ? num(seedRaw) : Math.floor(Math.random() * 2 ** 31);
      G.game.newGame(val('pname').trim().slice(0, 24) || 'Citizen', nation, seed);
      showReport([`Welcome to ${D.NATIONS[nation].name}! Take a job on the Work tab, train, and check the Battles tab. Press End Day when you're out of energy.`], 'Day 1');
    },
  };

  function showReport(lines, title) {
    if (!lines || !lines.length) return G.toast(`☀️ Day ${S().day} begins.`);
    modal(`<h3>${title || `☀️ Day ${S().day}`}</h3><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <div class="row"><span class="spacer"></span>${btn('closeModal', 'Continue', { cls: 'primary' })}</div>`);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACTS[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset);
    after(); // re-renders the page; an open modal is left intact
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset.change === 'weapon') { P().weaponQ = num(e.target.value); after(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!G.state || e.target.matches('input, textarea, select')) return;
    if (e.key === 'n' || e.key === 'N') { if ($('modal').hidden) { showReport(G.game.endDay()); after(); } }
    if (e.key === 'Escape') closeModal();
  });

  G.ui = { render };
  G.game.load();
  render();
})();
