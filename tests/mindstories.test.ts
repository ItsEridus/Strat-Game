import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { chooseStory, triggerStory } from '../src/sim/story';
import { lifeOf } from '../src/sim/lifecycle';
import { note } from '../src/sim/ties';

registerSystems();
const fresh = (seed = 4101) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('stories of the mind: a low season, an anniversary, a craving, an old flame', () => {
  const w = fresh();
  advance(w, DAY, false);
  const p = player(w);
  // A low season: depression, and pushing through alone.
  p.conditions = [{ key: 'depression', since: w.time, sev: 1 }];
  const a = triggerStory(w, 'mind.lowSeason');
  assert.ok(a.ok, a.msg);
  const s0 = lifeOf(p).stress;
  assert.ok(chooseStory(w, (a as any).data.id, 'alone', 'main').ok);
  assert.ok(lifeOf(p).stress > s0);
  // The anniversary of a loss.
  (p.mh ??= {}).losses = [{ id: 999999, name: 'Ada Lovelace', t: w.time - 365 * DAY - DAY, depth: 30, who: 'parent' }];
  const b = triggerStory(w, 'mind.anniversary');
  assert.ok(b.ok, b.msg);
  assert.ok(chooseStory(w, (b as any).data.id, 'visit', 'main').ok);
  // A craving after quitting: holding on weakens the habit.
  p.habits = { smoking: { level: 60, since: w.time - 900 * DAY, quit: w.time - 10 * DAY } };
  const c = triggerStory(w, 'habit.craving');
  assert.ok(c.ok, c.msg);
  assert.ok(chooseStory(w, (c as any).data.id, 'hold', 'main').ok);
  assert.ok(p.habits.smoking!.level < 60 && p.habits.smoking!.quit != null);
  // An old flame, both single.
  if (p.family?.partner == null) {
    const ex = census(w).all.find((x) => !x.player && !x.gone && ageOf(w, x) >= 20 && x.family?.partner == null)!;
    note(w, p, ex, 'flame', 50, 'the time they were together');
    const d = triggerStory(w, 'ties.oldFlame');
    assert.ok(d.ok, d.msg);
    const r0 = ex.rel[p.id] ?? 0;
    assert.ok(chooseStory(w, (d as any).data.id, 'meet', 'main').ok);
    assert.ok((ex.rel[p.id] ?? 0) > r0);
  }
  assert.ok(audit(w).ok);
});
