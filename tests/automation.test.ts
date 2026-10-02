import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { automate, automateCheck, automationMonth, exposureOf, machineFactor } from '../src/sim/automation';
import { controller, player } from '../src/sim/query';

registerSystems();
const fresh = (seed = 2901) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 4 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('automation: firms replace routine jobs with machines and keep their output; the public reacts', () => {
  const w = fresh();
  advance(w, 3 * DAY, false);
  const us = by(w, 'USA');
  const cos = Object.values(w.companies).filter((c) => controller(w.regions[c.region]) === us.id && c.workers.length);
  const workers0 = cos.reduce((s, c) => s + c.workers.length, 0);
  // Robotics and AI agents arrive.
  us.techs = { robotics: w.time, aiagents: w.time, humanoids: w.time };
  for (let i = 0; i < 36; i++) automationMonth(w);
  assert.ok((us.automated ?? 0) > 0.05, `automated ${us.automated}`);
  const machines = cos.reduce((s, c) => s + (c.machines ?? 0), 0);
  assert.ok(machines > 0 && (us.displaced ?? 0) > 0, `machines ${machines}, displaced ${us.displaced}`);
  assert.ok(cos.reduce((s, c) => s + c.workers.length, 0) < workers0);
  const auto = cos.find((c) => (c.machines ?? 0) > 0)!;
  assert.ok(machineFactor(auto) > 1, 'machines add to output');
  const displaced = Object.values(w.citizens).find((c) => c.flags.displaced != null);
  assert.ok(displaced && displaced.job == null);
  assert.ok(exposureOf(w, w.citizens[cos[0].workers[0] ?? displaced!.id]) >= 0);
  // Without the technology, nothing to automate.
  const ar = by(w, 'ARG');
  const arCo = Object.values(w.companies).find((c) => controller(w.regions[c.region]) === ar.id && c.workers.length);
  if (arCo) { arCo.owner = { k: 'cit', id: player(w).id }; assert.ok(automateCheck(w, player(w).id, arCo.id)); assert.ok(!automate(w, player(w).id, arCo.id).ok); }
  assert.ok(audit(w).ok, JSON.stringify(audit(w).problems.slice(0, 3)));
  advance(w, 2 * DAY, false);
  assert.ok(audit(w).ok);
});
