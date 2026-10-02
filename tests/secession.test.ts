import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { serialize, deserialize } from '../src/engine/save';
import { createState, identityOf } from '../src/sim/secession';
import { activeWars, declareWar, warCheck } from '../src/sim/war';
import { MONEY } from '../src/data/economy';

registerSystems();
const fresh = (seed = 2301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('regions have identities: distinct places high, others low', () => {
  const w = fresh();
  const qc = w.regions.find((r) => r.name === 'Quebec')!;
  assert.ok(identityOf(qc) >= 70);
  const low = w.regions.find((r) => !['Quebec', 'Scotland'].includes(r.name) && r.name === 'Ontario');
  if (low) assert.ok(identityOf(low) < 20);
});

test('a referendum creates a full state: currency, citizens, government, recognition; the ledger balances', () => {
  const w = fresh(2302);
  advance(w, 2 * DAY, false);
  const ca = by(w, 'CAN');
  const qc = w.regions.find((r) => r.name === 'Quebec')!;
  const s = createState(w, ca, [qc.id], 'referendum');
  assert.equal(s.parent, ca.id);
  assert.equal(qc.owner, s.id);
  assert.ok(MONEY[s.cur], 'its currency exists');
  assert.ok((s.wallet[s.cur] ?? 0) > 0, 'a treasury');
  assert.ok(census(w).all.some((c) => c.nation === s.id), 'residents became citizens');
  assert.ok(s.president != null && w.citizens[s.president].nation === s.id, 'a president of its own');
  assert.ok(Object.values(w.parties).some((p: any) => p.nation === s.id), 'parties');
  assert.ok((s.recognisedBy ?? []).includes(ca.id), 'its parent recognises it');
  assert.ok((s.recognisedBy ?? []).length > 8, 'most countries do');
  assert.ok(audit(w).ok);
  advance(w, 35 * DAY, false);
  assert.ok(audit(w).ok, JSON.stringify(audit(w).problems.slice(0, 3)));
  const w2 = deserialize(serialize(w));
  advance(w2, 3 * DAY, false);
  assert.equal(w2.nations[s.id].name, s.name);
  assert.ok(audit(w2).ok);
});

test('a unilateral declaration is recognised by few, and its parent can fight to take it back', () => {
  const w = fresh(2303);
  advance(w, 2 * DAY, false);
  const ru = by(w, 'RUS');
  const ch = w.regions.find((r) => r.name === 'Chechen Republic' && r.owner === ru.id);
  if (!ch) return;
  const s = createState(w, ru, [ch.id], 'declaration');
  assert.ok(!(s.recognisedBy ?? []).includes(ru.id));
  assert.ok((s.recognisedBy ?? []).length < 8);
  assert.ok((ru.relations[s.id]?.score ?? 0) < 0);
  const params = { target: s.id, days: 30, goals: [ch.id] };
  if (!warCheck(w, ru, params)) {
    declareWar(w, ru, params);
    assert.ok(activeWars(w).some((x) => x.att === ru.id && x.def === s.id));
  }
  advance(w, 10 * DAY, false);
  assert.ok(audit(w).ok);
});
