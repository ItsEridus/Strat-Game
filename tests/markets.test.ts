import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { peggedAnchor, pegOf, reservePrivilege, reserveShare, riskAppetite, stocksOf, superCycle } from '../src/sim/markets';
import { bondRate } from '../src/sim/publicFinance';

registerSystems();
const fresh = (seed = 3201) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('markets: super-cycles, the riyal peg, reserve currencies, risk appetite and stock indices', () => {
  const w = fresh();
  advance(w, 2 * DAY, false);
  for (const k of ['oil', 'copper', 'grain']) { const f = superCycle(w, k); assert.ok(f >= 0.64 && f <= 1.36, `${k} ${f}`); }
  const sa = by(w, 'SAU'), us = by(w, 'USA'), br = by(w, 'BRA');
  assert.ok(pegOf(w, sa) && pegOf(w, sa)!.to === us.id);
  assert.equal(pegOf(w, br), null);
  us.fxAnchor = Math.round(us.fxAnchor * 1.1);
  assert.equal(peggedAnchor(w, sa), Math.round(us.fxAnchor * pegOf(w, sa)!.ratio));
  assert.ok(reserveShare(us) > 0.5 && reserveShare(br) === 0);
  assert.ok(reservePrivilege(us) > 0.5);
  const r0 = riskAppetite(w);
  w.econ.fear = 1;
  assert.ok(riskAppetite(w) < r0);
  assert.equal(stocksOf(us).index, 1);
  advance(w, 40 * DAY, false);
  assert.ok(stocksOf(us).hist.length >= 1, 'the index moves monthly');
  assert.ok(bondRate(us) > 0);
  assert.ok(audit(w).ok);
});
