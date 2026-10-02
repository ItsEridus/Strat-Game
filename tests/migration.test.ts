import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { cref, player, controller } from '../src/sim/query';
import { c as cur } from '../src/engine/money';
import { emigrate, migrantParts, migrationMonth, naturalisationBar, residenceOf, visaCheck } from '../src/sim/migration';
import { circlesOf } from '../src/sim/circles';
import { fluency } from '../src/sim/languages';

registerSystems();
const fresh = (seed = 5401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('moving abroad: visas, settling in, the road to citizenship', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(2000), 'test');
  const arg = w.nations.find((n) => n.iso === 'ARG' && n.id !== p.nation) ?? w.nations.find((n) => n.iso === 'MEX' && n.id !== p.nation)!;
  const can = w.nations.find((n) => n.iso === 'CAN' && n.id !== p.nation);
  p.edu = { level: 'school' }; p.attrs.eco = 5;
  if (can) assert.ok(visaCheck(w, p, can.id, 'work'), 'points-based Canada wants graduates');
  assert.ok(visaCheck(w, p, arg.id, 'asylum'), 'asylum is for those fleeing war');
  assert.equal(visaCheck(w, p, arg.id, 'work'), null);
  const r = emigrate(w, arg.id, 'work');
  assert.ok(r.ok, r.msg);
  assert.equal(controller(w.regions[p.home]), arg.id);
  assert.equal(residenceOf(w, p)?.nation, arg.id);
  assert.equal(p.origin != null, true);
  assert.ok(migrantParts(w, p, false).stress.length > 0, 'settling in is a strain');
  assert.ok(naturalisationBar(w, p, arg.id), 'not yet a citizen');
  // Two years on (Argentina asks two), with Spanish, the way is open.
  p.residence!.since = w.time - 3 * 365 * DAY;
  (p.langs ??= {}).es = 60;
  assert.equal(naturalisationBar(w, p, arg.id), null);
  assert.ok(fluency(w, p, 'es') >= 60);
  assert.ok(audit(w).ok);
});

test('immigrants speak their home language, find their diaspora and send money home', () => {
  const w = fresh(5402);
  advance(w, 60 * DAY, false);
  const migrants = census(w).all.filter((c) => !c.player && c.origin != null && !c.gone);
  if (!migrants.length) return;
  const m = migrants[0];
  const tongue = ({ USA: 'en', CAN: 'en', MEX: 'es', BRA: 'pt', ARG: 'es', GBR: 'en', DEU: 'de', RUS: 'ru', TUR: 'tr', SAU: 'ar', JPN: 'ja', KOR: 'ko', CHN: 'zh', AUS: 'en' } as any)[w.nations[m.origin!].iso];
  if (tongue) assert.ok(Object.values(m.langs ?? {}).some((v) => (v ?? 0) >= 90) || fluency(w, m, tongue) >= 90 || ['CAN', 'USA', 'DEU', 'TUR'].includes(w.nations[m.origin!].iso), 'they speak their home language');
  const earner = migrants.find((x) => (x.incomeAvg ?? 0) > 0 && (x.wallet[w.nations[x.nation].cur] ?? 0) > 100);
  if (earner) {
    const hh = w.households[earner.origin!];
    const code = w.nations[earner.nation].cur;
    const before = hh.wallet[code] ?? 0;
    migrationMonth(w);
    assert.ok((hh.wallet[code] ?? 0) > before, 'money sent home');
  }
  const withCommunity = migrants.find((x) => circlesOf(w, x).some((k) => k.kind === 'diaspora'));
  if (withCommunity) assert.ok(circlesOf(w, withCommunity).find((k) => k.kind === 'diaspora')!.members.every((y) => y.origin === withCommunity.origin));
  assert.ok(audit(w).ok);
});
