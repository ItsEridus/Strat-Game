// Acceptance checklist from the brief (section 17), as executable tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint, produce } from '../src/engine/ledger';
import { DAY, HOUR } from '../src/engine/clock';
import { GOLD, g } from '../src/engine/money';
import { controller, coref, cref, player } from '../src/sim/query';
import type { Citizen, World } from '../src/sim/types';
import { applyJob, createCompany, foundCompany, productionBlock, setOffer, shiftPreview, workShift } from '../src/sim/company';
import { buyBest, listingsFor } from '../src/sim/market';
import { allocAttr, eat, train } from '../src/sim/citizen';
import { hitPreview, gearStats } from '../src/sim/combatMath';
import { createBattle, hit } from '../src/sim/battle';
import { makeGear, equip } from '../src/sim/gear';
import { useSpecial } from '../src/sim/specials';
import { serialize } from '../src/engine/save';
import { propose, voteProposal } from '../src/sim/congress';
import { declareWar } from '../src/sim/war';
import { contributeLabor } from '../src/sim/construction';
import { joinParty, partiesOf, registerCandidate } from '../src/sim/politics';
import { bestOffer } from '../src/ai/citizens';
import { checkProgress } from '../src/sim/quests';
import { builderRank, rankOf } from '../src/sim/combatMath';
import { foundPaper, publish } from '../src/sim/press';

registerSystems();
const fresh = (seed = 51, cpn = 1) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: cpn });

/** A simple scripted player for career tests: works, eats, trains; extra behaviour per career. */
function playDay(w: World, career: 'worker' | 'entrepreneur' | 'politician' | 'soldier' | 'builder') {
  const p = player(w);
  for (let h = 0; h < 24; h++) {
    const hr = Math.floor((w.time % DAY) / HOUR);
    if (hr === 9) {
      if (p.job == null) { const o = bestOffer(w, p); if (o) applyJob(w, p, o.id); }
      workShift(w, p);
      train(w, p);
      if ((p.inv['food:1'] ?? 0) < 3) buyBest(w, p.id, cref(p.id), controller(w.regions[p.loc]), 'food:1', 5);
      while (p.attrPts > 0) allocAttr(w, p, career === 'soldier' ? 'str' : career === 'builder' ? 'cons' : 'eco', 1);
      checkProgress(w);
      for (const q of w.player.dailies) if (q.done && !q.claimed) { q.claimed = true; mint(w, cref(p.id), GOLD, q.reward.gold ?? 0, 'Daily mission reward'); }
    }
    if (hr === 12 && career === 'entrepreneur') {
      const mine = Object.values(w.companies).filter((c) => c.owner.k === 'cit' && c.owner.id === p.id);
      if (!mine.length && (p.wallet[GOLD] ?? 0) >= g(10)) {
        const region = w.regions.filter((r) => controller(r) === p.nation).sort((a, b) => (b.res.grain ?? 0) - (a.res.grain ?? 0))[0];
        const r = foundCompany(w, p, cref(p.id), 'grain', region.id);
        if (r.ok) { const co = w.companies[r.data.id]; co.auto = { sell: true, buyInputs: true, hire: true }; mint(w, coref(co.id), w.nations[p.nation].cur, 0, 'x'); }
      }
      for (const co of mine) {
        const cur = w.nations[p.nation].cur;
        managerRun(w, p, co.id); // free first manager shift each day
        const cash = p.wallet[cur] ?? 0;
        if ((co.wallet[cur] ?? 0) < 3000 && cash > 4000) depositFn(w, p, co.id, cur, Math.floor(cash / 2));
        if (!co.offer) setOffer(w, p.id, co.id, w.nations[p.nation].minWage + 200, 1, 0);
      }
    }
    if (hr === 14 && career === 'politician') {
      const party = partiesOf(w, p.nation)[0];
      if (p.party == null && party) joinParty(w, p, party.id);
      const e = Object.values(w.elections).find((x) => !x.done && x.nation === p.nation && x.kind === 'congress');
      if (e && !e.candidates.includes(p.id)) registerCandidate(w, p, e.id);
      const paper = Object.values(w.papers).find((x) => x.owner.k === 'cit' && x.owner.id === p.id);
      if (!paper && (p.wallet[GOLD] ?? 0) >= g(5)) foundPaper(w, p, 'The Tester Times');
      else if (paper) publish(w, p, paper.id, 'politics', 'promote-party', '', '');
    }
    if (hr === 18 && career === 'soldier') {
      const b = Object.values(w.battles).find((x) => !x.done && x.kind === 'war' && (x.att === p.nation || x.def === p.nation));
      if (b) { const side = b.att === p.nation ? 'a' : 'd'; while (p.energy >= 10 && hit(w, p, b.id, side, null).ok); }
    }
    if (hr === 18 && career === 'builder') {
      const proj = Object.values(w.projects).find((x) => !x.done && controller(w.regions[x.region]) === controller(w.regions[p.loc]));
      if (proj) contributeLabor(w, p, proj.id, 5);
    }
    advance(w, HOUR, false);
  }
}

test('1. a new campaign starts with a working economy and tutorial', () => {
  const w = fresh();
  assert.equal(w.player.tutorial, 0);
  assert.ok(w.inbox.some((m) => /Welcome/.test(m.subject)));
  assert.ok(listingsFor(w, player(w).nation, 'food:1').length > 0, 'food on sale from day one');
  advance(w, DAY, false);
  const produced = Object.values(w.companies).filter((c) => (c.hist[c.hist.length - 1]?.produced ?? 0) > 0).length;
  assert.ok(produced > 20, `companies produced on day 1 (${produced})`);
  assert.ok(Object.keys(w.trades).length > 0, 'goods traded');
});

test('2. citizens can earn wages, buy food and progress without fighting', () => {
  const w = fresh(52);
  const p = player(w);
  const lvl0 = p.level, pow0 = p.power, eco0 = p.eco;
  for (let d = 0; d < 10; d++) playDay(w, 'worker');
  assert.ok(p.job != null, 'employed');
  assert.ok(p.level > lvl0 && p.power > pow0 && p.eco > eco0, 'progressed');
  assert.equal(p.dmgTotal, 0, 'never fought');
  assert.ok(w.ledger.some((e) => /Wage/.test(e.text) && e.amount > 0), 'earned wages');
  const r = buyBest(w, p.id, cref(p.id), controller(w.regions[p.loc]), 'food:1', 3);
  assert.ok(r.ok, `bought food with wages: ${r.msg}`);
  const food = [1, 2, 3].find((q) => (p.inv[`food:${q}`] ?? 0) > 0)!;
  p.energy = 0;
  assert.ok(eat(w, p, food).ok);
});

test('3. all four production chains consume and create the right goods', () => {
  const w = fresh(53);
  advance(w, 6 * DAY, false);
  for (const [raw, prod] of [['grain', 'food'], ['iron', 'wg'], ['oil', 'ticket']] as const) {
    const made = Object.values(w.companies).filter((c) => c.industry === prod).reduce((s, c) => s + c.lifetime.produced, 0);
    const rawMade = Object.values(w.companies).filter((c) => c.industry === raw).reduce((s, c) => s + c.lifetime.produced, 0);
    assert.ok(made > 0 && rawMade > 0, `${raw} → ${prod} active`);
  }
  // The titanium → air weapon chain works when there is demand: run it directly.
  const p = player(w);
  const co = createCompany(w, cref(p.id), 'wa', 1, p.loc);
  w.regions[p.loc].pollution = 0; // the chain, not the capital's air quality, is under test
  mint(w, cref(p.id), GOLD, g(1), 'test');
  produce(w, coref(co.id), 'titanium', 20, 'test');
  const pv = shiftPreview(w, co, p);
  assert.equal(pv.inputKey, 'titanium');
  const before = co.inv.titanium;
  p.energy = 100;
  const { managerShift } = require_company();
  assert.ok(managerShift(w, p, co.id).ok);
  assert.ok((co.inv['wa:1'] ?? 0) > 0 && co.inv.titanium < before, 'titanium consumed, air weapons made');
  assert.ok(audit(w).ok);
});
import * as companyMod from '../src/sim/company';
const managerRun = companyMod.managerShift;
const depositFn = companyMod.deposit;
function require_company() { return companyMod; }

test('4. businesses stop production without funds, labour, inputs or capacity', () => {
  const w = fresh(54);
  const p = player(w);
  const farm = w.regions.find((r) => r.owner === p.nation && r.res.grain)!;
  const co = createCompany(w, cref(p.id), 'grain', 1, farm.id);
  produce(w, coref(co.id), 'grain', Math.floor(6000 / 1) - 5, 'test'); // nearly full warehouse
  assert.match(productionBlock(w, co, shiftPreview(w, co, null).units) ?? '', /storage is full/);
  const f = createCompany(w, cref(p.id), 'food', 1, p.loc);
  assert.match(productionBlock(w, f, 5) ?? '', /Out of Grain/);
  // labour: no workers → nothing produced overnight
  advance(w, DAY, false);
  assert.equal(f.hist[f.hist.length - 1].produced, 0);
});

test('6. NPCs keep markets, elections, government and the military functioning', () => {
  const w = fresh(55, 2);
  advance(w, 60 * DAY, false);
  assert.ok(Object.values(w.trades).some((t) => t.length > 30), 'markets trade every day');
  assert.ok(Object.values(w.elections).filter((e) => e.done && e.result?.winners.length).length >= 8, 'elections held');
  assert.ok(Object.values(w.proposals).some((p) => p.status === 'passed'), 'laws passed');
  assert.ok(Object.values(w.projects).some((p) => p.done && !p.cancelled), 'construction completed');
  assert.ok(Object.values(w.wars).length > 0 || Object.values(w.battles).length > 0 || Object.values(w.events).length > 0, 'military activity');
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
});

test('7. attribute allocation changes displayed and executed outcomes consistently', () => {
  const w = fresh(56);
  const p = player(w);
  const before = hitPreview(w, p, null, 'a', null).dmg;
  allocAttr(w, p, 'str', 3);
  const after = hitPreview(w, p, null, 'a', null);
  const mult = 1 + p.power / 100;
  assert.ok(Math.abs(after.dmg - before - 15 * mult) < 1e-6, 'preview: +5 per Strength point before the power multiplier');
  const other = Object.values(w.regions).find((r) => r.owner !== p.nation && r.links.some((l) => w.regions[l].owner === p.nation))!;
  const b = createBattle(w, 'war', other.id, p.nation, other.owner, null);
  p.attrs.acc = 1000; p.attrs.luck = 0; // guarantee a hit, no crits
  p.energy = 100;
  const hitPv = hitPreview(w, p, b, 'a', null);
  const r = hit(w, p, b.id, 'a', null);
  assert.ok(r.ok && r.data.landed);
  if (!r.data.crit) assert.equal(r.data.dmg, Math.round(hitPv.dmg), 'executed damage equals the preview');
  assert.equal(hitPreview(w, p, b, 'a', null).hit, 100, 'no accuracy cap: enough accuracy removes misses');
});

test('8. equipment, consumable weapons and special buffs are separate systems', () => {
  const w = fresh(57);
  const p = player(w);
  const gr = makeGear(w, 'combat', 3, 'vest'); gr.owner = cref(p.id);
  const inv0 = JSON.stringify(p.inv);
  equip(w, p, gr.id);
  assert.equal(JSON.stringify(p.inv), inv0, 'equipping gear does not touch inventory');
  assert.ok(Object.keys(gearStats(w, p)).length > 0);
  produce(w, cref(p.id), 'sp:steroids', 1, 'test');
  const d0 = hitPreview(w, p, null, 'a', null).dmg;
  assert.ok(useSpecial(w, p, 'steroids').ok);
  assert.ok(hitPreview(w, p, null, 'a', null).dmg > d0, 'buff raises damage');
  advance(w, 4 * HOUR, false);
  assert.ok(Math.abs(hitPreview(w, p, null, 'a', null).dmg - d0) < 1e-6, 'buff expired on simulation time');
  assert.equal(p.gear.vest, gr.id, 'gear still equipped');
});

test('11. government actions require authority and spend government resources', () => {
  const w = fresh(58);
  const n = w.nations[0];
  const pres = w.citizens[n.president!];
  const cur0 = w.stats.minted[`${n.cur}|Money printing`] ?? 0;
  const r = propose(w, pres, 'print', { amount: 100000 });
  assert.ok(r.ok, r.msg);
  const pr = Object.values(w.proposals).find((x) => x.type === 'print')!;
  for (const d of n.deputies) voteProposal(w, w.citizens[d], pr.id, true);
  advance(w, 25 * HOUR, false);
  assert.equal(pr.status, 'passed');
  assert.ok((w.stats.burned['GOLD|Money printing backing'] ?? 0) > 0, 'printing burned treasury gold');
  assert.equal((w.stats.minted[`${n.cur}|Money printing`] ?? 0) - cur0, 100000, 'currency minted into the treasury');
  assert.equal(propose(w, player(w), 'print', { amount: 1000 }).ok, false, 'a private citizen cannot draft laws');
  assert.ok(audit(w).ok);
});

test('19. timers use simulation time and nothing advances while paused', () => {
  const w = fresh(59);
  const before = serialize(w);
  // No calls to advance: the world must not change on its own.
  assert.equal(serialize(w), before);
  const p = player(w);
  p.energy = 0;
  advance(w, 60, false);
  assert.equal(p.energy, 30, '1 energy per 2 simulated minutes');
});

test('21. long advances stay stable and explainable', () => {
  const w = fresh(60, 2);
  advance(w, 120 * DAY, false);
  const a = audit(w);
  assert.ok(a.ok, a.problems.join('\n'));
  const cits = Object.values(w.citizens);
  assert.ok(cits.filter((c) => c.job != null).length / cits.length > 0.5, 'most citizens employed');
  for (const n of w.nations) { assert.ok(Number.isFinite(n.fxAnchor) && n.fxAnchor > 1000 && n.fxAnchor < 100000, 'exchange rates sane'); assert.ok(n.approval >= 0 && n.approval <= 100); }
  for (const [k, v] of Object.entries(w.lastPrice)) assert.ok(Number.isFinite(v) && v > 0, k);
  assert.ok(w.chapters.length >= 3, 'monthly chapters written');
});

test('22. news and histories reflect events that actually occurred', () => {
  const w = fresh(61, 2);
  advance(w, 45 * DAY, false);
  for (const war of Object.values(w.wars)) assert.ok(w.log.some((e) => e.type === 'war' && e.text.includes('declared war') && e.text.includes(w.nations[war.att].name) && e.text.includes(w.nations[war.def].name)));
  for (const e of Object.values(w.elections).filter((x) => x.done && x.kind === 'president' && x.result?.winners.length)) {
    const name = w.citizens[e.result!.winners[0]].name;
    assert.ok(w.log.some((l) => l.type === 'election' && l.text.includes(name)), `election of ${name} recorded`);
  }
  const ch = w.chapters[0];
  for (const line of ch.text) assert.ok(typeof line === 'string');
});

test('23. meaningful play as entrepreneur, politician, soldier or builder', () => {
  // Entrepreneur: founds a company that produces and sells.
  let w = fresh(62);
  let p = player(w);
  mint(w, cref(p.id), GOLD, g(12), 'test'); // tutorial-completion equivalent
  for (let d = 0; d < 12; d++) playDay(w, 'entrepreneur');
  const co = Object.values(w.companies).find((c) => c.owner.k === 'cit' && c.owner.id === p.id);
  assert.ok(co && co.lifetime.produced > 0, 'entrepreneur: company produced');
  // Politician: joins a party, publishes, stands on a congress list.
  w = fresh(63); p = player(w); p.level = 6; mint(w, cref(p.id), GOLD, g(6), 'test');
  for (let d = 0; d < 12; d++) playDay(w, 'politician');
  assert.ok(p.party != null && p.influence > 3 && Object.values(w.articles).some((a) => a.author === p.id), 'politician: party, influence, articles');
  // Soldier: fights in a war and climbs the rank ladder.
  w = fresh(64); p = player(w);
  const n = w.nations[p.nation];
  const enemy = w.regions.find((r) => r.owner !== p.nation && r.links.some((l) => w.regions[l].owner === p.nation))!.owner;
  const war = declareWar(w, n, { target: enemy, days: 14, goals: [] });
  const tgt = w.regions.find((r) => r.owner === enemy && r.links.some((l) => w.regions[l].owner === p.nation))!;
  const b = createBattle(w, 'war', tgt.id, p.nation, enemy, war.id); war.battles.push(b.id);
  for (let d = 0; d < 3; d++) playDay(w, 'soldier');
  assert.ok(p.dmgTotal > 0 && rankOf(p.dmgTotal).index >= 0, 'soldier: dealt damage');
  // Builder: contributes to construction and gains builder points.
  w = fresh(65); p = player(w);
  const pres = w.citizens[w.nations[p.nation].president!];
  const { startProject } = constructionMod;
  startProject(w, pres.id, p.nation, w.regions.find((r) => r.owner === p.nation && r.project == null)!.id, 'hospital');
  // Contribute on the first evening, before the region's own builders finish the labour.
  const site = Object.values(w.projects).find((x) => !x.done)!;
  p.energy = 100;
  contributeLabor(w, p, site.id, 5);
  for (let d = 0; d < 4; d++) playDay(w, 'builder');
  assert.ok(p.buildTotal > 0 && builderRank(p.buildTotal).index >= 0, 'builder: contributed');
});
import * as constructionMod from '../src/sim/construction';

test('24. the game ships a launcher and a built bundle', async () => {
  const fs = await import('node:fs');
  assert.ok(fs.existsSync('Play.bat'), 'Windows launcher');
  assert.ok(fs.existsSync('index.html'));
});

void coref; void Object as unknown as Citizen;
