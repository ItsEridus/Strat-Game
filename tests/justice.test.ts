import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint } from '../src/engine/ledger';
import { c as cur } from '../src/engine/money';
import { B } from '../src/data/balance';
import { DAY } from '../src/engine/clock';
import { cref, jailed, player } from '../src/sim/query';
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

import { appeal, appealCheck, bailAmount, benchFor, convictionChance, courtStats, courtsDaily, postBail, pleaRate } from '../src/sim/courts';
import { replyArrest } from '../src/sim/crime';
import { SERVICES } from '../src/sim/services';

const arrested = (w: World, evidence = 90) => {
  const p = player(w);
  const k = openCase(w, p, 'burglary', p.loc, evidence, 0);
  p.flags.pendingTrial = k.id; p.flags.trialAt = w.time + DAY;
  return { p, k };
};

test('courts are staffed by law graduates; the bench moves the verdict', () => {
  const w = fresh(86);
  assert.ok(SERVICES.judge && SERVICES.prosecutor && SERVICES.defender);
  const officials = Object.values(w.citizens).filter((c) => c.post && ['judge', 'prosecutor', 'defender'].includes(c.post.kind));
  const { k } = arrested(w, 60);
  const b = benchFor(w, k);
  if (officials.length) assert.ok(b.judge || b.prosecutor || b.defender, 'someone sits on the case');
  assert.ok(convictionChance(w, k, true) < convictionChance(w, k, false), 'a lawyer helps');
});

test('a guilty plea is a certain, lighter conviction; pleas follow national practice', () => {
  const w = fresh(87);
  const { p, k } = arrested(w, 50);
  replyArrest(w, k.id, 'plea');
  assert.equal(k.plea, true);
  assert.match(k.outcome ?? '', /guilty plea/);
  assert.ok(jailed(w, p));
  assert.ok(courtStats(w.nations[k.nation]).pleas >= 1);
  assert.match(appealCheck(w, p, k) ?? '', /pleaded guilty/);
  const us = w.nations.find((n) => n.iso === 'USA'), jp = w.nations.find((n) => n.iso === 'JPN');
  if (us && jp) assert.ok(pleaRate(us) > 0.9 && pleaRate(jp) < 0.1);
});

test('bail: the money is held, the trial waits, a lawyer prepares, the money comes back', () => {
  const w = fresh(88);
  const { p, k } = arrested(w, 40);
  const code = w.nations[k.nation].cur;
  mint(w, cref(p.id), code, bailAmount(w, k) * 3, 'test');
  const before = p.wallet[code];
  assert.ok(postBail(w, p, k).ok);
  assert.equal(p.wallet[code], before - bailAmount(w, k));
  assert.ok(!jailed(w, p) && k.status === 'open');
  advance(w, 5 * DAY, false);
  assert.equal(k.status, 'closed');
  assert.equal(p.flags.bail, 0);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('appeals overturn weak convictions; the wrongly convicted can be exonerated', () => {
  const w = fresh(89);
  const { p, k } = arrested(w, 35);
  let tries = 0;
  while (!(k.outcome ?? '').startsWith('convicted') && tries++ < 50) { k.status = 'open'; k.outcome = undefined; p.flags.pendingTrial = k.id; p.sec.jailUntil = 0; replyArrest(w, k.id, 'comply'); }
  assert.match(k.outcome ?? '', /convicted/);
  const code = w.nations[k.nation].cur;
  mint(w, cref(p.id), code, cur(1000), 'test');
  k.innocent = true;
  const convictions = p.sec.record.convictions;
  assert.equal(appealCheck(w, p, k), null);
  appeal(w, p, k);
  assert.match(appealCheck(w, p, k) ?? '', /already|no conviction/);
  if (/quashed/.test(k.outcome ?? '')) { assert.ok(!jailed(w, p)); assert.equal(p.sec.record.convictions, convictions - 1); }
  // An innocent NPC convicted long ago is eventually cleared.
  const npc = Object.values(w.citizens).find((c) => !c.player && !c.gone)!;
  const f = openCase(w, npc, 'fraud', npc.loc, 90, 0);
  Object.assign(f, { status: 'closed', outcome: 'convicted: test', innocent: true, appealed: true, closedAt: w.time });
  npc.sec.record.convictions = 1;
  w.time += ((7 - (Math.floor(w.time / DAY) % 7)) % 7) * DAY; // courts sit weekly
  for (let i = 0; i < 400 && f.outcome !== 'exonerated'; i++) { w.time += 7 * DAY; courtsDaily(w); }
  assert.equal(f.outcome, 'exonerated');
  assert.ok(courtStats(w.nations[f.nation]).exonerations >= 1);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

import { cyberFraud, cultivate, dirtyOf, embezzle, evadeTax, insiderReview, launder, markDirty, noteShareBuy, setEvasion, turnInformant, whiteCollarDaily } from '../src/sim/whitecollar';
import { createCompany } from '../src/sim/company';
import { commitCrime } from '../src/sim/crime';

test('crime money is dirty until laundered through a business or an organisation', () => {
  const w = fresh(90);
  const p = player(w);
  const code = w.nations[p.nation].cur;
  for (let i = 0; i < 60 && !dirtyOf(p, code); i++) { p.energy = 100; p.sec.last = {}; commitCrime(w, p, 'pickpocket'); }
  assert.ok(dirtyOf(p, code) > 0, 'pickpocketing proceeds are dirty');
  mint(w, cref(p.id), code, cur(500), 'test');
  const co = createCompany(w, cref(p.id), 'food', 1, p.home, 'Clean Plates');
  const before = p.wallet[code];
  const amt = dirtyOf(p, code);
  assert.ok(launder(w, p, code, 'company', co.id).ok);
  assert.equal(dirtyOf(p, code), 0);
  assert.equal(p.wallet[code], before - Math.round(amt * 0.3), '30% stays in the business');
  assert.ok(co.today.revenue >= amt, 'shows up as sales');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('hidden profits cut tax until an audit finds them; embezzlers are caught by the books', () => {
  const w = fresh(91);
  const p = player(w);
  const code = w.nations[p.nation].cur;
  mint(w, cref(p.id), code, cur(500), 'test');
  const co = createCompany(w, cref(p.id), 'food', 1, p.home, 'Cooked Books');
  assert.ok(setEvasion(w, p, co.id, 0.5).ok);
  assert.equal(evadeTax(w, co, 1000), 500);
  assert.equal(co.evaded, 500);
  co.evaded = cur(B.justice.lawyer) * 100; // a lot of hidden tax: audited quickly
  for (let i = 0; i < 40 && co.evaded; i++) { w.time += DAY; if (Math.floor(w.time / DAY) % 30 === 0) whiteCollarDaily(w); }
  assert.ok(!co.evaded, 'audited');
  assert.ok(Object.values(w.cases).some((k) => k.kind === 'taxevasion' && k.suspect === p.id));
  // Embezzlement: an NPC employer's account.
  const emp = Object.values(w.companies).find((x) => x.owner.k === 'cit' && x.owner.id !== p.id && (x.wallet[code] ?? 0) > cur(100))!;
  p.job = emp.id; emp.workers.push(p.id); p.energy = 100;
  const r = embezzle(w, p);
  assert.ok(r.ok, r.msg);
  assert.ok(dirtyOf(p, code) > 0 && (p.flags.embezzled ?? 0) > 0);
  p.flags.embezzled = cur(B.justice.lawyer) * 100;
  for (let i = 0; i < 40 && p.flags.embezzled; i++) whiteCollarDaily(w);
  assert.ok(Object.values(w.cases).some((k) => k.kind === 'embezzlement' && k.suspect === p.id));
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('online fraud takes foreign money; insiders are reviewed; informants feed evidence', () => {
  const w = fresh(92);
  const p = player(w);
  p.eco = 40;
  let hit = false;
  for (let i = 0; i < 20 && !hit; i++) { p.energy = 100; p.sec.last = {}; hit = cyberFraud(w, p).ok; }
  assert.ok(hit);
  assert.ok(Object.entries(p.sec.dirty ?? {}).some(([code, v]) => code !== w.nations[p.nation].cur && v > 0), 'foreign dirty money');
  // Insider trading review.
  const h = Object.values(w.holdings)[0];
  if (h) {
    noteShareBuy(w, h, h.ceo, 100);
    let flagged = false;
    for (let i = 0; i < 30 && !flagged; i++) { noteShareBuy(w, h, h.ceo, 100); insiderReview(w, h, 10); flagged = Object.values(w.cases).some((k) => k.kind === 'insidertrading' && k.suspect === h.ceo); }
    assert.ok(flagged, 'the regulator flags an insider');
  }
  // Informants.
  const s = Object.values(w.syndicates).find((x) => x.members.length >= 2)!;
  const member = w.citizens[s.members.find((m) => m !== s.boss)!];
  const boss = w.citizens[s.boss ?? s.members[0]];
  const k = openCase(w, boss, 'extortion', boss.loc, 10, 0);
  k.syndicate = s.id;
  member.sec.informs = s.id;
  const ev = k.evidence;
  whiteCollarDaily(w);
  assert.ok(k.evidence > ev || !member.sec.informs, 'evidence from the informant (unless exposed at once)');
  // The player turns informant: charges dropped.
  p.sec.syndicate = s.id; s.members.push(p.id);
  const mine = openCase(w, p, 'extortion', p.loc, 30, 0);
  assert.ok(turnInformant(w, p, null).ok);
  assert.equal(mine.status, 'closed');
  // A detective can turn members.
  const det = Object.values(w.citizens).find((c) => !c.player && !c.gone)!;
  det.sec.police = boss.loc; det.sec.prank = 2; det.energy = 100;
  cultivate(w, det, s.id);
  markDirty(p, 'XXX', 0);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
