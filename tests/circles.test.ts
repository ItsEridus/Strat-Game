import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { circleAct, circleActCheck, circlesMonth, circlesOf, standingIn, workStanding, workmates } from '../src/sim/circles';

registerSystems();
const fresh = (seed = 4201) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('circles: who is in them, standing within them, a week with them', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  const circles = circlesOf(w, p);
  assert.ok(circles.some((c) => c.kind === 'neighbours'), 'everyone has neighbours');
  const nb = circles.find((c) => c.kind === 'neighbours')!;
  const s0 = standingIn(p, nb);
  if (!circleActCheck(w, p, 'neighbours')) {
    assert.ok(circleAct(w, 'neighbours').ok);
    assert.ok(standingIn(p, circlesOf(w, p).find((c) => c.kind === 'neighbours')!) > s0, 'helping a neighbour raises your standing');
    assert.ok(circleActCheck(w, p, 'neighbours'), 'once a week');
  }
  assert.ok(audit(w).ok);
});

test('people in circles grow closer; workplace standing; address books stay small', () => {
  const w = fresh(4202);
  advance(w, DAY, false);
  const co = Object.values(w.companies).filter((x) => x.workers.length >= 4).sort((a, b) => b.workers.length - a.workers.length)[0];
  const staff = co.workers.map((id) => w.citizens[id]).filter((c) => !c.player);
  const sum = () => staff.reduce((t, a) => t + staff.reduce((u, b) => u + (a === b ? 0 : (a.rel[b.id] ?? 0)), 0), 0);
  const before = sum();
  for (let m = 0; m < 12; m++) circlesMonth(w);
  assert.ok(sum() > before, 'workmates grow closer over a year');
  const c = staff[0];
  assert.ok(workmates(w, c).length > 0);
  for (const x of workmates(w, c)) x.rel[c.id] = 60;
  assert.ok(workStanding(w, c) >= 50, 'well liked at work');
  for (let i = 0; i < 80; i++) c.rel[100000 + i] = 1;
  circlesMonth(w);
  assert.ok(Object.keys(c.rel).length <= 40);
  assert.ok(audit(w).ok);
});
