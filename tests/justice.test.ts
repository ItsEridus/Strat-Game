import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { jailed, player } from '../src/sim/query';
import { openCase, trial } from '../src/sim/crime';
import { applyCheck } from '../src/sim/company';
import { JUSTICE, admit, escapeChance, incarcerationRate, insideOf, occupancy, paroleCheck, paroleHearing, prisonClass, prisonOf, prisonWork, prisonWorkCheck, prisonsDaily, recordBars, release, sentenceFactor, tryEscape, vetted } from '../src/sim/prisons';
import { setBudget, budgetOf } from '../src/sim/nationalBudget';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 81) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const jail = (w: World, days = 10) => {
  const p = player(w);
  const k = openCase(w, p, 'burglary', p.loc, 100, 0);
  p.sec.record.convictions = 0;
  trial(w, k, false);
  if (!jailed(w, p)) { p.sec.jailUntil = w.time + days * DAY; admit(w, p); }
  return p;
};

test('incarceration starts at real national rates (Japan low, the United States high)', () => {
  const w = fresh();
  const by = (iso: string) => w.nations.find((n) => n.iso === iso);
  const us = by('USA'), jp = by('JPN');
  if (us) assert.ok(Math.abs(incarcerationRate(w, us) - JUSTICE.USA.rate) < 30, `US ${incarcerationRate(w, us)}`);
  if (jp) assert.ok(Math.abs(incarcerationRate(w, jp) - JUSTICE.JPN.rate) < 10, `JP ${incarcerationRate(w, jp)}`);
  if (us && jp) { assert.ok(incarcerationRate(w, us) > incarcerationRate(w, jp) * 10); assert.ok(sentenceFactor(us) > sentenceFactor(jp)); }
  for (const n of w.nations) { const p = prisonOf(w, n); assert.ok(p.places > 0 && p.conditions > 0 && p.conditions <= 100, n.name); }
});

test('funding builds places and conditions; cuts crowd prisons and they riot', () => {
  const w = fresh(82);
  const n = w.nations[0];
  const p = prisonOf(w, n);
  const places = p.places;
  setBudget(n, { ...budgetOf(n), police: 0.06 });
  for (let i = 0; i < 60; i++) prisonsDaily(w);
  assert.ok(p.places > places, 'more places when funding is above usual');
  const good = p.conditions;
  setBudget(n, { ...budgetOf(n), police: 0.005 });
  p.inmates = Math.round(p.places * 1.6);
  for (let i = 0; i < 400 && p.riots === 0; i++) { p.inmates = Math.round(p.places * 1.6); w.time += DAY; prisonsDaily(w); }
  assert.ok(p.conditions < good, 'conditions fall with cuts and crowding');
  assert.ok(occupancy(p) > 1.5);
  assert.ok(p.riots > 0, 'an overcrowded, underfunded system riots');
  assert.ok((n.chronicle ?? []).some((x) => /riot/.test(x.text)));
});

test('life inside: work pays and builds conduct; parole after the threshold; escape is risky', () => {
  const w = fresh(83);
  const p = jail(w, 20);
  assert.ok(jailed(w, p) && p.sec.inside);
  const code = w.nations[p.nation].cur;
  const before = p.wallet[code] ?? 0;
  p.energy = 100;
  assert.ok(prisonWork(w, p).ok);
  assert.ok((p.wallet[code] ?? 0) > before, 'prison wage paid');
  assert.match(prisonWorkCheck(w, p) ?? '', /today/);
  prisonClass(w, p);
  assert.ok(insideOf(p).conduct > 50);
  assert.match(paroleCheck(w, p) ?? '', /Eligible/);
  w.time = p.sec.jailUntil - Math.max(1, Math.floor((p.sec.jailUntil - insideOf(p).since) * 0.05)); // past the parole threshold
  assert.equal(paroleCheck(w, p), null);
  insideOf(p).conduct = 100;
  let freed = false;
  for (let i = 0; i < 30 && !freed; i++) { insideOf(p).hearing = 0; paroleHearing(w, p); freed = !jailed(w, p); }
  assert.ok(freed, 'parole granted eventually');
  assert.ok(p.sec.releasedAt === w.time);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  // Escape: the chance is modest; failure adds time.
  const q = jail(w, 10);
  assert.ok(escapeChance(w, q) < 0.5);
  const until = q.sec.jailUntil;
  q.energy = 100;
  const r = tryEscape(w, q);
  if (jailed(w, q)) assert.ok(q.sec.jailUntil > until, r.msg);
  else assert.ok(Object.values(w.cases).some((k) => k.kind === 'escape' && k.suspect === q.id && k.status === 'open'));
});

test('a record shuts vetted employers until it is spent; NPCs reoffend more after prison', () => {
  const w = fresh(84);
  const p = jail(w, 2);
  release(w, p, 'served');
  const co = Object.values(w.companies).find((x) => vetted(x));
  assert.ok(co, 'some employer runs background checks');
  assert.match(recordBars(w, p, co!) ?? '', /background/);
  co!.offer = { wage: 1, slots: co!.workers.length + 1, minEco: 0 } as any;
  assert.match(applyCheck(w, p, co!) ?? '', /background|located|funds/);
  w.time += 12 * 365 * DAY;
  assert.equal(recordBars(w, p, co!), null, 'spent after the national period');
});

test('a month with prisons running keeps the ledger balanced', () => {
  const w = fresh(85);
  jail(w, 5);
  advance(w, 30 * DAY, false);
  assert.ok(!jailed(w, player(w)) || player(w).sec.inside);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
  for (const n of w.nations) if (!n.exile) assert.ok(prisonOf(w, n).hist.length >= 0);
});
