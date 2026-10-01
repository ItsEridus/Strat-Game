import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { createBattle, finishBattle } from '../src/sim/battle';
import { WAR_PROPOSAL, PEACE_PROPOSAL, declareWar, launchBattle, onWarDeadline, peaceHousekeeping } from '../src/sim/war';
import { warChronicleDaily } from '../src/sim/warChronicle';
import { deserialize, serialize } from '../src/engine/save';
import type { Proposal, World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 1341) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
function neighbours(w: World) {
  const capitals = new Set(w.nations.map((n) => n.capital));
  for (const r of w.regions) for (const l of r.links) { const o = w.regions[l]; if (o.owner !== r.owner && !capitals.has(o.id)) return { a: r.owner, b: o.owner, border: o.id }; }
  throw new Error('no border');
}
/** A passed congress vote, as congress hands it to enact(). */
function passed(w: World, nation: number, type: string, params: Record<string, any>): Proposal {
  const n = w.nations[nation];
  const voters = [...new Set([...(n.deputies ?? []), ...(n.president != null ? [n.president] : [])])];
  const votes: Record<number, 'y' | 'n'> = {};
  voters.forEach((id, i) => { votes[id] = i % 3 === 2 ? 'n' : 'y'; });
  return { id: 999000 + nation, nation, type: type as any, params, author: n.president ?? voters[0], created: w.time, closes: w.time, votes, status: 'passed', effect: '', cost: 0 } as Proposal;
}

test('a declaration records why: the weighed factors, the proposer, the vote and both sides\' view', () => {
  const w = fresh();
  const { a, b, border } = neighbours(w);
  w.nations[a].relations[b].score = -40;
  w.nations[a].relations[b].hist.unshift({ t: w.time, delta: -12, why: 'border tension' });
  const p = passed(w, a, 'war', { target: b, days: 14, goals: [border] });
  const msg = WAR_PROPOSAL.enact(w, w.nations[a], p);
  assert.match(msg, /War declared/);
  const war = Object.values(w.wars).find((x) => x.att === a && x.def === b)!;
  const cause = war.chronicle!.cause!;
  assert.match(cause.summary, new RegExp(`${w.nations[a].name} went to war with ${w.nations[b].name}`));
  assert.match(cause.summary, new RegExp(w.regions[border].name));
  const labels = cause.factors.map((f) => f.label);
  for (const l of ['Balance of power', 'Relations', 'Ideology in congress', 'Public mood', 'Other wars', 'The prize', 'Old grievances', 'The border', 'Opportunity', 'Alliances']) assert.ok(labels.includes(l), l);
  const rel = cause.factors.find((f) => f.label === 'Relations')!;
  assert.ok(rel.weight > 0, 'bad relations pushed toward war');
  assert.match(rel.detail, /-40|−40/);
  assert.match(rel.detail, /border tension/);
  assert.equal(cause.by?.id, p.author);
  assert.ok(cause.vote && cause.vote.yes > 0 && cause.vote.yes + cause.vote.no === Object.keys(p.votes).length);
  assert.ok(cause.defender.length >= 4);
  assert.equal(cause.snapshot.relation, -40, 'read before the declaration changed relations');
  assert.equal(war.chronicle!.events[0].icon, '🔥');
});

test('battles are recorded in full, and a conquest explains itself', () => {
  const w = fresh(1342);
  const { a, b, border } = neighbours(w);
  const war = declareWar(w, w.nations[a], { target: b, days: 8, goals: [border] });
  const { b: bt } = launchBattle(w, a, war.id, border);
  const c = war.chronicle!;
  assert.ok(c.battles[bt.id], 'battle opened');
  assert.match(c.events.at(-1)!.text, new RegExp(`attacked ${w.regions[border].name}`));
  finishBattle(w, bt, 'a');
  const rec = c.battles[bt.id];
  assert.equal(rec.winner, a);
  assert.ok(rec.rounds && rec.damage && rec.fighters && rec.result);
  assert.match(rec.result!, /occupied/);
  // Two more occupations reach the quota of three.
  for (const m of w.regions.filter((x) => x.owner === b && x.id !== border).slice(0, 2)) {
    const bb = createBattle(w, 'war', m.id, a, b, war.id);
    war.battles.push(bb.id);
    finishBattle(w, bb, 'a');
  }
  assert.equal(war.status, 'ended');
  const end = c.ending!;
  assert.equal(end.kind, 'conquest');
  assert.equal(end.winner, a);
  assert.match(end.headline, /won: it held 3 of the 3/);
  assert.ok(end.terms.some((t) => /changed hands/.test(t)));
  assert.ok(end.aftermath.some((t) => /Relations/.test(t)));
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
});

test('peace offers, their votes and replies are recorded, and so is an armistice', () => {
  const w = fresh(1343);
  const { a, b, border } = neighbours(w);
  const war = declareWar(w, w.nations[a], { target: b, days: 14, goals: [border] });
  const offer = passed(w, a, 'peace', { war: war.id, kind: 'armistice' });
  assert.match(PEACE_PROPOSAL.enact(w, w.nations[a], offer), /Terms sent/);
  const c = war.chronicle!;
  assert.ok(c.events.some((e) => e.icon === '🕊️' && /armistice/.test(e.text) && /Why:/.test(e.text)), 'offer recorded with reasons');
  const open = war.offers.find((o) => o.status === 'open')!;
  const reply = passed(w, b, 'peace', { war: war.id, kind: 'accept', offer: open.id });
  PEACE_PROPOSAL.enact(w, w.nations[b], reply);
  assert.equal(war.status, 'ended');
  assert.ok(c.events.some((e) => e.icon === '🤝'), 'acceptance recorded');
  assert.equal(c.ending!.kind, 'armistice');
  assert.match(c.ending!.headline, /Armistice/);
});

test('a rejected offer and a deadline are explained', () => {
  const w = fresh(1344);
  const { a, b, border } = neighbours(w);
  const war = declareWar(w, w.nations[a], { target: b, days: 8, goals: [border] });
  PEACE_PROPOSAL.enact(w, w.nations[b], passed(w, b, 'peace', { war: war.id, kind: 'demand' }));
  for (const p of Object.values(w.proposals)) if (p.type === 'peace' && p.status === 'open') p.status = 'failed';
  w.time += 3 * 60;
  peaceHousekeeping(w);
  assert.ok(war.chronicle!.events.some((e) => e.icon === '✋' && /rejected/.test(e.text)), 'rejection recorded');
  war.extensions = 2; war.exhaust = { [a]: 90, [b]: 90 }; // nothing left to fight with
  onWarDeadline(w, war.id);
  assert.equal(war.chronicle!.ending!.kind, 'deadline');
  assert.match(war.chronicle!.ending!.headline, /deadline ran out/);
});

test('the home front is followed, and chronicles survive save and load', () => {
  const w = fresh(1345);
  const { a, b, border } = neighbours(w);
  const war = declareWar(w, w.nations[a], { target: b, days: 21, goals: [border] });
  w.nations[a].approval -= 12;
  warChronicleDaily(w);
  assert.ok(war.chronicle!.events.some((e) => e.icon === '🏠' && /approval fell/.test(e.text)));
  advance(w, DAY, false);
  const back = deserialize(serialize(w));
  assert.deepEqual(back.wars[war.id].chronicle, w.wars[war.id].chronicle);
});
