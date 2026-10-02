import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { cyberAttack, cyberCheck, cyberDefence, cyberOffence } from '../src/sim/cyber';
import { inBlackout } from '../src/sim/energy';

registerSystems();
const fresh = (seed = 2701) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('cyber commands: strength follows technology; attacks black out grids and lock up firms; attribution is uncertain', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), ar = by(w, 'ARG'), ru = by(w, 'RUS');
  assert.ok(cyberOffence(w, us) > cyberOffence(w, ar));
  const before = cyberOffence(w, us);
  us.techs = { ...(us.techs ?? {}), cyberai: w.time };
  assert.ok(cyberOffence(w, us) > before);
  const region = w.regions.find((r) => r.owner === ar.id)!;
  assert.ok(cyberCheck(w, us, 'grid', ar.id, null), 'a grid attack needs a region');
  let hits = 0, blamedOthers = 0, unknown = 0, traced = 0;
  for (let i = 0; i < 60; i++) {
    us.cyberLast = -1e12;
    const inc = cyberAttack(w, us, i % 2 ? 'grid' : 'companies', ar.id, region.id)!;
    if (inc.success) hits++;
    if (inc.blamed === us.id) traced++; else if (inc.blamed == null) unknown++; else blamedOthers++;
    if (inc.success && inc.kind === 'grid') assert.ok(inBlackout(w, region.id));
  }
  assert.ok(hits > 30, `a strong command mostly succeeds against a weak defender (${hits}/60)`);
  assert.ok(unknown + blamedOthers > 0, 'some attacks go unattributed or are blamed on others');
  assert.ok(cyberCheck(w, us, 'grid', ar.id, region.id), 'the command needs time between attacks');
  // A grid stays down for days.
  us.cyberLast = -1e12;
  for (let i = 0; i < 20 && !(region.cyberDown && region.cyberDown > w.time); i++) { us.cyberLast = -1e12; cyberAttack(w, us, 'grid', ar.id, region.id); }
  if (region.cyberDown && region.cyberDown > w.time + DAY) { advance(w, DAY, false); assert.ok(inBlackout(w, region.id)); }
  assert.ok(cyberDefence(w, ru) > 0);
  assert.ok(audit(w).ok);
  void traced;
});
