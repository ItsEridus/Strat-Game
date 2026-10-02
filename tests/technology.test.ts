import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { serialize, deserialize } from '../src/engine/save';
import { TECH } from '../src/data/techTree';
import { controlled, hasTech, researchMass, techFx, techGrowth, techMonth, threshold } from '../src/sim/technology';
import { capsOf } from '../src/sim/strategic';
import { power } from '../src/sim/forces';
import { mortality } from '../src/sim/population';
import { energyPrice } from '../src/sim/energy';
import { collectionQuality } from '../src/sim/beliefs';

registerSystems();
const fresh = (seed = 2601) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('the leaders make breakthroughs first; others adopt them; export controls slow it', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), ar = by(w, 'ARG'), ru = by(w, 'RUS');
  assert.ok(researchMass(us) > researchMass(ar) * 3);
  capsOf(w, us).tech.information = threshold(TECH.aiagents); // the domain level the strategic turn would reach
  for (let i = 0; i < 240 && !w.techFirsts?.aiagents; i++) techMonth(w);
  assert.ok(w.techFirsts?.aiagents, 'AI agents arrive within twenty years');
  const first = w.nations[w.techFirsts!.aiagents.nation];
  assert.ok(capsOf(w, first).tech.information >= threshold(TECH.aiagents));
  // Export controls: every holder dislikes Russia.
  for (const n of w.nations) if (hasTech(n, 'aiagents') && n.id !== ru.id) { n.relations[ru.id].score = -50; }
  if (!hasTech(ru, 'aiagents')) assert.ok(controlled(w, ru, 'aiagents'));
  assert.ok(audit(w).ok);
});

test('technologies make growth faster, forces stronger, intelligence sharper, lives longer and energy cheaper', () => {
  const w = fresh(2602);
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN');
  const f = Object.values(w.forces).find((x) => x.nation === us.id)!;
  const p0 = power(w, f), e0 = energyPrice(w, us), q0 = collectionQuality(w, us, cn);
  const old = census(w).all.find((c) => c.nation === us.id && !c.player)!;
  const m0 = mortality(w, old);
  us.techs = { swarms: w.time, aiagents: w.time, smr: w.time, mrna: w.time, quantum: w.time, genetherapy: w.time };
  assert.ok(techGrowth(w, us) > 0.5);
  assert.ok(power(w, f) > p0);
  assert.ok(energyPrice(w, us) < e0);
  assert.ok(collectionQuality(w, us, cn) > q0 || q0 >= 0.97);
  assert.ok(mortality(w, old) < m0);
  assert.ok(techFx(us).military >= 0.08);
  // Growth from a technology fades after ten years.
  us.techs = { aiagents: w.time - 11 * 365 * DAY };
  assert.equal(techGrowth(w, us), 0);
  const w2 = deserialize(serialize(w));
  assert.ok(hasTech(by(w2, 'USA'), 'aiagents'));
});
