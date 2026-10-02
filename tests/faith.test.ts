import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { dateAt } from '../src/engine/calendar';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { player } from '../src/sim/query';
import { circlesOf } from '../src/sim/circles';
import { devout, festivalsOf, religionOf, religionStats, setReligion, upcoming } from '../src/sim/faith';
import { valueOf } from '../src/sim/mind';

registerSystems();
const fresh = (seed = 5201) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('religions follow each country; the devout are rarely of no religion', () => {
  const w = fresh();
  advance(w, DAY, false);
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!.id;
  const top = (iso: string) => religionStats(w, by(iso))[0][0];
  assert.equal(top('TUR'), 'muslim');
  assert.equal(top('IND'), 'hindu');
  assert.equal(top('BRA'), 'christian');
  assert.ok(['none', 'buddhist'].includes(top('JPN')));
  const all = census(w).all.filter((c) => !c.player);
  const devoutNone = all.filter((c) => valueOf(w, c, 'faith') >= 0.7 && religionOf(w, c) === 'none').length;
  assert.ok(devoutNone / all.length < 0.03, 'the devout have a faith');
});

test('festivals on their dates; congregations; the player chooses a faith', () => {
  const w = fresh(5202);
  advance(w, DAY, false);
  const f25 = festivalsOf(2025);
  const at = (id: string) => dateAt(f25.find((f) => f.id === id)!.t);
  assert.deepEqual([at('easter').month, at('easter').day], [3, 20], 'Easter 2025: 20 April');
  assert.deepEqual([at('christmas').month, at('christmas').day], [11, 25]);
  assert.deepEqual([at('eidfitr').month, at('eidfitr').day], [2, 30], 'Eid al-Fitr 2025: 30 March');
  const e26 = dateAt(festivalsOf(2026).find((f) => f.id === 'eidfitr')!.t);
  assert.ok(e26.month === 2 && e26.day >= 18 && e26.day <= 21, 'about eleven days earlier the next year');
  assert.equal(dateAt(festivalsOf(2026).find((f) => f.id === 'easter')!.t).day, 5, 'Easter 2026: 5 April');
  const p = player(w);
  assert.ok(setReligion(w, 'buddhist').ok);
  assert.equal(religionOf(w, p), 'buddhist');
  assert.ok(upcoming(w, p, 400).some((f) => f.id === 'vesak'));
  // Congregations gather the devout of one faith.
  const believer = census(w).all.find((c) => !c.player && devout(w, c) && circlesOf(w, c).some((k) => k.kind === 'faith'));
  if (believer) { const cong = circlesOf(w, believer).find((k) => k.kind === 'faith')!; assert.ok(cong.members.every((m) => religionOf(w, m) === religionOf(w, believer))); }
  advance(w, 30 * DAY, false);
  assert.ok(audit(w).ok);
});
