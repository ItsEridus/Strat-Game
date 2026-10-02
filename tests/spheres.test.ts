import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { greatPowers, hedging, patronOf, pull, spheresDaily, spheresOf } from '../src/sim/spheres';
import { briefing } from '../src/sim/briefing';
import { conductsDiplomacy, dipCheck, dipOf, ministerSkill } from '../src/sim/diplomacyActions';
import { signTreaty, willingness } from '../src/sim/treaties';
import { appointCabinetAI } from '../src/sim/politics';
import { timeOfDate } from '../src/engine/calendar';

registerSystems();
const fresh = (seed = 3041) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('spheres of influence: the US pulls its allies; hedgers stay out of alliances', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN'), ca = by(w, 'CAN'), jp = by(w, 'JPN'), ind = by(w, 'IND');
  assert.deepEqual(greatPowers(w).sort(), [us.id, cn.id, by(w, 'RUS').id].sort());
  assert.ok(pull(w, us, ca) > pull(w, cn, ca), 'Canada is pulled by the US');
  assert.equal(patronOf(w, ca.id), us.id);
  assert.equal(patronOf(w, jp.id), us.id);
  // A hedger: make India equally drawn to both.
  const s = spheresOf(w);
  s.hedging[ind.id] = [us.id, cn.id]; delete s.of[ind.id];
  assert.ok(hedging(w, ind.id));
  assert.match(willingness(w, ind, us, 'defence').why, /both powers|non-alignment/);
  assert.ok(audit(w).ok);
});

test('a rival power moving into a sphere is resented', () => {
  const w = fresh(3042);
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN');
  const member = Object.entries(spheresOf(w).of).find(([, p]) => p === us.id)!;
  const m = w.nations[+member[0]];
  w.time = timeOfDate(2025, 1, 1) + 60;
  spheresDaily(w);
  const before = us.relations[cn.id]?.score ?? 0;
  signTreaty(w, 'intel', [m.id, cn.id], { quiet: true });
  w.time = timeOfDate(2025, 2, 1) + 60;
  spheresDaily(w);
  if (patronOf(w, m.id) === us.id) assert.ok((us.relations[cn.id]?.score ?? 0) < before, 'the US resents China moving in');
  assert.ok(audit(w).ok);
});

test('the foreign minister: conducts diplomacy, builds capital, and briefings before decisions', () => {
  const w = fresh(3043);
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  appointCabinetAI(w, n);
  assert.ok(n.cabinet.foreign != null || n.president == null, 'AI governments appoint a foreign minister');
  n.cabinet.foreign = p.id;
  p.influence = 120;
  assert.ok(conductsDiplomacy(n, p.id));
  assert.ok(ministerSkill(w, n) > 0.5);
  dipOf(n).capital = 100;
  const other = w.nations.find((x) => x.id !== n.id && !x.exile)!;
  assert.equal(dipCheck(w, n, 'praise', { target: other.id }), null);
  const br = briefing(w, n, other);
  assert.ok(br.lines.length >= 4 && br.quality > 0);
  assert.ok(br.lines.some((l) => l.head === 'Strength') && br.lines.some((l) => l.head === 'Confidence'));
  assert.ok(audit(w).ok);
});
