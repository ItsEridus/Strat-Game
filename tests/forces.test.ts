import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, produce } from '../src/engine/ledger';
import { DAY, HOUR } from '../src/engine/clock';
import { controller, cref, natref, player } from '../src/sim/query';
import { createCompany, productionFactors } from '../src/sim/company';
import { declareWar, launchBattle } from '../src/sim/war';
import {
  addSp, appointChief, appointChiefCheck, civilianControl, coastal, commandCheck, commanderInChief, dutyCheck, enlist, enlistCheck, formationsOf, militaryTitle, onActiveDuty, publicOffice, returnToDuty, returnToDutyCheck, forcesDaily, forcesTick, nationScores, raiseFormation, rankName, reportForDuty, seasOf, setOrder, superiority, takeCommand,
} from '../src/sim/forces';
import { opCheck } from '../src/sim/intel';
import { RANKS } from '../src/data/military';
import { travelOptions } from '../src/sim/travel';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 81) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const nat = (w: World, name: string) => w.nations.findIndex((n) => n.name === name);
const region = (w: World, name: string, nation: number) => w.regions.find((r) => r.name === name && r.owner === nation)!;

test('every nation fields an army, an air force and (if coastal) a navy, with officers in command', () => {
  const w = fresh();
  for (const n of w.nations) {
    const fs = formationsOf(w, n.id);
    assert.ok(fs.some((f) => f.branch === 'army'), `${n.name} army`);
    assert.ok(fs.some((f) => f.branch === 'air'), `${n.name} air force`);
    if (w.regions.some((r) => r.owner === n.id && coastal(r.id))) assert.ok(fs.some((f) => f.branch === 'navy'), `${n.name} navy`);
    for (const f of fs.filter((x) => x.branch === 'navy')) assert.ok(f.zone && seasOf(f.loc).includes(f.zone), `${f.name} is in its home sea`);
  }
  assert.ok(Object.values(w.forces).some((f) => f.commander != null), 'officers command formations');
  const ranks = nationScores(w);
  assert.equal(ranks.length, w.nations.length);
  assert.ok(ranks[0].total >= ranks[ranks.length - 1].total);
});

test('service careers: enlist, report for duty, promotion by service and command', () => {
  const w = fresh();
  const p = player(w);
  assert.ok(enlist(w, p, 'navy').ok);
  assert.equal(rankName(p), RANKS.navy[0].name);
  p.energy = 100;
  assert.ok(reportForDuty(w, p).ok);
  assert.match(dutyCheck(w, p) ?? '', /already/);
  p.mil.since -= 100 * DAY; // long service
  addSp(w, p, 2000);
  assert.equal(p.mil.rank, 4, 'service alone stops at the senior enlisted ranks');
  p.mil.commissioned = true; // officer training passed
  addSp(w, p, 1);
  const ladder = RANKS.navy;
  assert.ok(ladder[p.mil.rank].command && !ladder[p.mil.rank].flag, 'promoted up to command rank, flag ranks need command time');
  const fleet = formationsOf(w, p.nation).find((f) => f.branch === 'navy')!;
  fleet.commander = null;
  assert.equal(commandCheck(w, p, fleet.id), null);
  assert.ok(takeCommand(w, p, fleet.id).ok);
  p.mil.commands = 10;
  addSp(w, p, 1);
  assert.ok(ladder[p.mil.rank].flag, 'flag rank after 10 days in command');
});

test('standing formations fight in battles and take losses', () => {
  const w = fresh(82);
  const us = 0, mx = nat(w, 'Mexico');
  const tx = region(w, 'Texas', us), chi = region(w, 'Chihuahua', mx);
  const war = declareWar(w, w.nations[mx], { target: us, days: 8, goals: [tx.id] });
  const def = formationsOf(w, us).find((f) => f.branch === 'army')!;
  def.loc = tx.id;
  const att = formationsOf(w, mx).find((f) => f.branch === 'army')!;
  att.loc = chi.id;
  const { b } = launchBattle(w, mx, war.id, tx.id);
  assert.equal(b.airOnly, false, 'land border');
  assert.ok(setOrder(w, w.nations[mx].president!, att.id, 'support', tx.id).ok);
  const s0 = att.strength;
  for (let i = 0; i < 6; i++) { w.time += 10; forcesTick(w); }
  assert.ok((b.forceDmg?.a ?? 0) > 0 && (b.forceDmg?.d ?? 0) > 0, 'both sides\' formations dealt damage');
  assert.ok(att.strength < s0, 'attrition');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('navies: superiority enables amphibious landings and blockades; sea lanes need it too', () => {
  const w = fresh(83);
  const us = 0, jp = nat(w, 'Japan');
  const target = region(w, 'Hokkaidō', jp);
  w.treaties = {}; // no alliances: the only way in is by sea
  const war = declareWar(w, w.nations[us], { target: jp, days: 8, goals: [target.id] });
  // No navy nearby: an assault on Hokkaidō from the US is air-only.
  const first = launchBattle(w, us, war.id, target.id);
  assert.equal(first.b.airOnly, true);
  first.b.done = true;
  // Send overwhelming US fleets into every sea around Hokkaidō; Japan's fleets go home.
  for (const f of formationsOf(w, jp).filter((x) => x.branch === 'navy')) f.zone = 'Caspian Sea';
  const fleets = formationsOf(w, us).filter((f) => f.branch === 'navy');
  seasOf(target.id).forEach((z, i) => { const f = fleets[i % fleets.length]; f.zone = z; f.strength = 100; });
  for (const z of seasOf(target.id)) assert.ok(superiority(w, us, jp, z), `US rules the ${z}`);
  const landing = launchBattle(w, us, war.id, target.id);
  assert.equal(landing.b.airOnly, false, 'amphibious landing is a ground battle');
  forcesDaily(w);
  assert.equal(target.blockade, us, 'Japanese coast blockaded');
  const co = createCompany(w, cref(Object.values(w.citizens).find((c) => c.nation === jp)!.id), 'grain', 1, target.id);
  assert.ok(productionFactors(w, co, null).factors.some((f) => /blockade/.test(f.label)));
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('armies march overland one region a day; raising forces costs money and stocks', () => {
  const w = fresh(84);
  const p = player(w);
  const n = w.nations[0];
  n.president = p.id;
  const f = formationsOf(w, 0).find((x) => x.branch === 'army')!;
  f.loc = region(w, 'Ohio', 0).id;
  const dest = region(w, 'Illinois', 0).id;
  assert.ok(setOrder(w, p.id, f.id, 'move', dest).ok);
  const hops = f.path.length;
  assert.ok(hops >= 2);
  advance(w, DAY, false);
  assert.equal(f.path.length, hops - 1);
  assert.notEqual(f.loc, region(w, 'Ohio', 0).id);
  produce(w, natref(0), 'wg:1', 200, 'test');
  const before = Object.keys(w.forces).length;
  assert.ok(raiseFormation(w, p.id, 0, 'infantry', n.capital).ok);
  assert.equal(Object.keys(w.forces).length, before + 1);
  // Military sabotage needs a visible target and network.
  const foreign = formationsOf(w, 1)[0];
  assert.match(opCheck(w, p.id, 0, 'milsabotage', 1, null, foreign.id) ?? '', /network|know/);
  assert.ok(travelOptions(w, p, dest).length > 0);
  advance(w, 2 * HOUR, false);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  void controller;
});

test('civilian control: office holders pass to the reserve; the head of government is Commander-in-Chief', () => {
  const w = fresh();
  const p = player(w);
  const n = w.nations[p.nation];
  // Nobody holds office and active service at once after world generation.
  for (const c of Object.values(w.citizens)) if (publicOffice(w, c)) assert.ok(!onActiveDuty(c), `${c.name} holds office on active duty`);
  // The player enlists, rises to command rank, then enters congress.
  assert.ok(enlist(w, p, 'army').ok);
  p.mil.since -= 200 * DAY;
  p.mil.commissioned = true;
  addSp(w, p, 700);
  const fleet = formationsOf(w, p.nation).find((f) => f.branch === 'army')!;
  fleet.commander = null;
  assert.ok(takeCommand(w, p, fleet.id).ok);
  const rank = p.mil.rank;
  n.deputies.push(p.id);
  civilianControl(w);
  assert.ok(p.mil.reserve, 'in the reserve while in office');
  assert.equal(p.mil.rank, rank, 'rank kept');
  assert.equal(fleet.commander, null, 'command handed over');
  assert.match(dutyCheck(w, p) ?? '', /reserve/);
  assert.match(enlistCheck(w, p, 'navy') ?? '', /reserve/);
  assert.match(returnToDutyCheck(w, p) ?? '', /leave office/);
  const days = Math.floor((w.time - p.mil.since) / DAY);
  advance(w, 5 * DAY, false);
  n.deputies = n.deputies.filter((x) => x !== p.id);
  assert.ok(returnToDuty(w, p).ok);
  assert.ok(Math.abs(Math.floor((w.time - p.mil.since) / DAY) - days) <= 1, 'time in the reserve does not count as service');
  // The head of government commands in chief and appoints the chief of staff.
  const pres = commanderInChief(w, n.id)!;
  assert.equal(militaryTitle(w, pres), 'Commander-in-Chief');
  const general = Object.values(w.citizens).find((c) => !c.gone && c.nation === n.id && onActiveDuty(c) && c.id !== n.defense.chief && !appointChiefCheck(w, pres.id, n.id, c.id));
  if (general) {
    assert.match(appointChiefCheck(w, p.id === pres.id ? -1 : p.id, n.id, general.id) ?? '', /Commander-in-Chief/);
    assert.ok(appointChief(w, pres.id, n.id, general.id).ok);
    advance(w, DAY, false);
    assert.equal(n.defense.chief, general.id, 'the appointment stands while the officer remains eligible');
  }
});
