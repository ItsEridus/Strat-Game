import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { attemptCoup, coupRisk } from '../src/sim/uprisings';
import { regimeOf } from '../src/sim/regimes';

registerSystems();
const fresh = (seed = 2101) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('coups are far likelier in personalist regimes than in full democracies', () => {
  const w = fresh();
  advance(w, DAY, false);
  assert.ok(coupRisk(w, by(w, 'RUS')) > coupRisk(w, by(w, 'DEU')) * 10);
});

test('a coup either installs a junta or ends in treason charges and a purge', () => {
  const w = fresh(2102);
  advance(w, DAY, false);
  const tr = by(w, 'TUR');
  const officer = census(w).all.find((c: any) => c.nation === tr.id && !c.player)!;
  officer.mil.branch = 'army'; officer.mil.reserve = false; officer.mil.commissioned = true; officer.traits.loyalty = 0.1;
  const r = attemptCoup(w, tr, officer);
  if (r === 'success') { assert.equal(regimeOf(tr).type, 'junta'); assert.equal(tr.president, officer.id); }
  else { assert.equal(r, 'failed'); assert.ok(Object.values(w.cases).some((k: any) => k.kind === 'treason' && k.suspect === officer.id)); assert.ok((tr.coupProof ?? 0) >= 0.3); }
  assert.ok(audit(w).ok);
});
