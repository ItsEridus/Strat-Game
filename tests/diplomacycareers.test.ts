import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { player } from '../src/sim/query';
import { SERVICES, nationalStaffing } from '../src/sim/services';
import { occupationOf } from '../src/sim/labour';
import { chooseStory, triggerStory } from '../src/sim/story';
import { declareWar } from '../src/sim/war';
import { intlOf, tableResolution } from '../src/sim/intlOrgs';
import { dipOf, diplomacyActionsDaily } from '../src/sim/diplomacyActions';
import type { Crisis } from '../src/sim/crises';

registerSystems();
const fresh = (seed = 991) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('the foreign service, trade negotiators and international civil servants are careers with real effects', () => {
  const w = fresh();
  advance(w, DAY, false);
  assert.equal(SERVICES.diplomat.ladder[4], 'Ambassador');
  assert.equal(SERVICES.intlcivil.ladder[4], 'Under-secretary-general');
  const p = player(w);
  p.post = { kind: 'diplomat', region: p.home, grade: 4, since: w.time, promoted: w.time, shifts: 0, lastDay: -1 };
  assert.equal(occupationOf(w, p), 'ambassador');
  // Diplomats build diplomatic capital faster.
  const n = w.nations[p.nation];
  for (const r of w.regions) if (r.owner === n.id) r.staff = { ...(r.staff ?? { school: 1, clinic: 1, offices: 1 }), diplomacy: 0 };
  dipOf(n).capital = 0; diplomacyActionsDaily(w);
  const low = dipOf(n).capital;
  for (const r of w.regions) if (r.owner === n.id) r.staff!.diplomacy = 1;
  assert.equal(nationalStaffing(w, n.id, 'diplomacy'), 1);
  dipOf(n).capital = 0; diplomacyActionsDaily(w);
  assert.ok(dipOf(n).capital > low, `${dipOf(n).capital} > ${low}`);
});

test('stories: the summit, the note from the embassy and the vote in the Council', () => {
  const w = fresh(992);
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  const other = w.nations.find((x) => x.id !== n.id)!;
  // The summit (as head of government).
  n.president = p.id;
  (n.summits ??= {})[other.id] = w.time;
  const s = triggerStory(w, 'diplomacy.summit');
  assert.ok(s.ok, s.msg);
  assert.ok(chooseStory(w, (s as any).data.id, 'safe', 'main').ok);
  // The note from the embassy (as a diplomat, in a crisis).
  n.president = null;
  p.post = { kind: 'diplomat', region: p.home, grade: 1, since: w.time, promoted: w.time, shifts: 0, lastDay: -1 };
  const cr: Crisis = { id: 77777, kind: 'naval', a: other.id, b: n.id, level: 3, started: w.time, next: w.time + 3 * DAY, moves: [], status: 'active' };
  (w.standoffs ??= []).push(cr);
  const e = triggerStory(w, 'diplomacy.embassy');
  assert.ok(e.ok, e.msg);
  assert.ok(chooseStory(w, (e as any).data.id, 'channel', 'main').ok);
  // The vote in the Council (as head of government again).
  n.president = p.id;
  const att = w.nations.find((x) => x.id !== n.id && x.id !== other.id && !x.alliances.includes(n.id))!;
  const victim = w.nations.find((x) => x.id !== n.id && x.id !== att.id && !att.alliances.includes(x.id) && (att.pacts[x.id] ?? 0) <= w.time)!;
  w.wars = {};
  declareWar(w, att, { target: victim.id, days: 21, goals: [] });
  const r = tableResolution(w, victim, 'ga', 'condemn', att.id)!;
  assert.ok(r);
  const v = triggerStory(w, 'diplomacy.council');
  assert.ok(v.ok, v.msg);
  assert.ok(chooseStory(w, (v as any).data.id, 'y', 'main').ok);
  assert.equal(intlOf(w).resolutions.find((x) => x.id === r.id)!.votes[n.id], 'y');
  assert.ok(audit(w).ok);
});
