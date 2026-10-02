import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { sexOf } from '../src/sim/looks';
import { attracted, divorce, lawOf, marriageBar, orientationOf, partnershipMonth, sameSex } from '../src/sim/partnership';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 4401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const adults = (w: World) => census(w).all.filter((c) => !c.gone && !c.player && ageOf(w, c) >= 20);

test('whom people are drawn to; couples follow it; marriage follows the law', () => {
  const w = fresh();
  advance(w, DAY, false);
  const all = adults(w);
  const straight = all.filter((c) => orientationOf(c) === 'straight').length / all.length;
  assert.ok(straight > 0.85 && straight < 0.95, `most are straight (${straight})`);
  const couples = all.filter((c) => c.family?.partner != null && c.id < c.family.partner!);
  const ss = couples.filter((c) => sameSex(w, c, w.citizens[c.family!.partner!])).length / Math.max(1, couples.length);
  assert.ok(ss < 0.15, `same-sex couples are a minority (${ss})`);
  const m = all.find((c) => sexOf(w, c) === 'm' && orientationOf(c) === 'straight')!;
  const f = all.find((c) => sexOf(w, c) === 'f')!;
  const m2 = all.find((c) => sexOf(w, c) === 'm' && c.id !== m.id)!;
  assert.ok(attracted(w, m, f) && !attracted(w, m, m2));
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!;
  assert.equal(marriageBar(w, m, m2, by('CAN')), null, 'Canada: same-sex marriage');
  assert.ok(marriageBar(w, m, m2, by('CHN')), 'China: none');
  assert.equal(marriageBar(w, m, f, by('SAU')), null);
  assert.equal(lawOf(by('SAU')).ss, 'persecuted');
  // Married same-sex couples only where it is allowed.
  for (const c of couples) {
    const o = w.citizens[c.family!.partner!];
    if (c.family!.status === 'married' && sameSex(w, c, o)) assert.equal(marriageBar(w, c, o, w.nations[c.nation]), null);
  }
});

test('divorce under the law: savings evened out, maintenance paid monthly', () => {
  const w = fresh(4402);
  advance(w, DAY, false);
  const gbr = w.nations.find((n) => n.iso === 'GBR')!;
  const people = adults(w).filter((c) => c.nation === gbr.id).sort((a, b) => (b.wallet[gbr.cur] ?? 0) - (a.wallet[gbr.cur] ?? 0));
  const rich = people[0], poor = people[people.length - 1];
  rich.incomeAvg = Math.max(rich.incomeAvg ?? 0, (poor.incomeAvg ?? 0) + 500);
  const r0 = rich.wallet[gbr.cur] ?? 0, p0 = poor.wallet[gbr.cur] ?? 0;
  const text = divorce(w, rich, poor, gbr);
  assert.ok(/British|law/.test(text), text);
  assert.ok((poor.wallet[gbr.cur] ?? 0) > p0 && (rich.wallet[gbr.cur] ?? 0) < r0, 'savings evened out');
  assert.ok(rich.alimony && rich.alimony.to === poor.id, 'maintenance ordered');
  const p1 = poor.wallet[gbr.cur] ?? 0;
  partnershipMonth(w);
  assert.ok((poor.wallet[gbr.cur] ?? 0) > p1, 'maintenance paid');
  assert.ok(audit(w).ok);
});
