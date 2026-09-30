import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, mint, burn } from '../src/engine/ledger';
import { DAY, HOUR } from '../src/engine/clock';
import { GOLD, c as cur, g } from '../src/engine/money';
import { sendMsg } from '../src/engine/events';
import { controller, cref, coref, player } from '../src/sim/query';
import { createCompany, setOffer } from '../src/sim/company';
import { transferCompany } from '../src/sim/companyMarket';
import { addCrisis } from '../src/sim/dynamics';
import { respond } from '../src/sim/inbox';
import { chooseStory, memoriesOf, triggerStory, viewStage } from '../src/sim/story';
import type { Company, World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 111) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

/** A player-owned company with workers, then a strike exactly as strikesDaily raises it. */
function strikeAtMyCompany(w: World): { co: Company; msgId: number } {
  const p = player(w);
  mint(w, cref(p.id), GOLD, g(40), 'test');
  const co = createCompany(w, cref(p.id), 'grain', 1, p.loc);
  mint(w, coref(co.id), 'USD', cur(2000), 'test');
  setOffer(w, p.id, co.id, cur(6), 4, 0);
  for (const c of Object.values(w.citizens).filter((x) => !x.player && x.nation === p.nation).slice(0, 4)) { if (c.job != null) { const o = w.companies[c.job]; if (o) o.workers = o.workers.filter((x) => x !== c.id); } co.workers.push(c.id); c.job = co.id; }
  co.halt = { until: w.time + 3 * DAY, why: 'Workers on strike' };
  const k = addCrisis(w, 'strike', `Strike at ${co.name}`, [co.region], p.nation, 3, 1);
  k.company = co.id;
  const m = sendMsg(w, { from: co.workers[0], subject: `✊ Strike at ${co.name}`, kind: 'npc', body: 'They want more.', options: [{ id: 'meet', label: 'Meet' }, { id: 'split', label: 'Split' }, { id: 'refuse', label: 'Refuse' }], payload: { handler: 'strike', co: co.id, demand: cur(9), crisis: k.id } });
  return { co, msgId: m.id };
}
const storyFor = (w: World, def: string) => Object.values(w.story.instances).find((i) => i.def === def)!;

test('wage dispute (owner): meeting, compromise through the same reply, follow-up and a kept promise', () => {
  const w = fresh();
  const { co, msgId } = strikeAtMyCompany(w);
  const inst = storyFor(w, 'chain.wage.owner');
  const crew = [...co.workers];
  assert.ok(inst, 'the strike message became a story');
  assert.ok(chooseStory(w, inst.id, 'committee', 'walkout').ok);
  assert.match(viewStage(w, inst).text, /canteen/);
  assert.ok(chooseStory(w, inst.id, 'reply:split', 'committee').ok);
  assert.equal(w.inbox.find((m) => m.id === msgId)!.resolved, 'split', 'the inbox message is answered too');
  assert.equal(respond(w, msgId, 'meet').ok, false, 'cannot answer twice');
  assert.equal(co.offer!.wage, Math.round((cur(6) + cur(9)) / 2));
  assert.equal(inst.status, 'waiting');
  advance(w, 2 * DAY + HOUR, false);
  assert.equal(inst.stage, 'aftermath');
  assert.ok(chooseStory(w, inst.id, 'promise', 'aftermath').ok);
  assert.ok(w.story.journal.some((j) => j.kind === 'promise'));
  advance(w, 21 * DAY + HOUR, false);
  assert.equal(inst.stage, 'review');
  const wage = co.offer!.wage;
  assert.ok(chooseStory(w, inst.id, 'honor', 'review').ok);
  assert.equal(co.offer!.wage, Math.round(wage * 1.05));
  assert.equal(inst.ending, 'kept');
  assert.ok(crew.some((id) => memoriesOf(w, id).some((m) => /review|split/.test(m.text))), 'the workers remember');
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});

test('wage dispute: answering in the inbox moves the story on once; a sold company ends it without owner powers', () => {
  const w = fresh(112);
  const { co, msgId } = strikeAtMyCompany(w);
  const inst = storyFor(w, 'chain.wage.owner');
  assert.ok(respond(w, msgId, 'meet').ok, 'answered from the inbox');
  assert.equal(co.offer!.wage, cur(9));
  assert.equal(inst.status, 'waiting', 'the story followed the inbox reply');
  assert.equal(inst.decisions.length, 1);
  assert.equal(chooseStory(w, inst.id, 'reply:split').ok, false, 'no second settlement');
  // Another strike, then the company is sold before the owner decides.
  const w2 = fresh(113);
  const s2 = strikeAtMyCompany(w2);
  const i2 = storyFor(w2, 'chain.wage.owner');
  const buyer = Object.values(w2.citizens).find((c) => !c.player)!;
  transferCompany(w2, s2.co, cref(buyer.id), 0);
  const wage = s2.co.offer!.wage;
  assert.equal(chooseStory(w2, i2.id, 'reply:meet', 'walkout').ok, false);
  assert.equal(s2.co.offer!.wage, wage, 'a former owner cannot change wages');
  assert.equal(i2.ending, 'sold');
  assert.equal(respond(w2, s2.msgId, 'meet').ok, false, 'the stale inbox message is refused too');
});

test('wage dispute (worker): a striking employee joins, mediates or stays home', () => {
  const w = fresh(114);
  const p = player(w);
  const owner = Object.values(w.citizens).find((c) => !c.player && c.nation === p.nation)!;
  const co = createCompany(w, cref(owner.id), 'grain', 1, p.loc);
  mint(w, coref(co.id), 'USD', cur(1000), 'test');
  setOffer(w, owner.id, co.id, cur(6), 5, 0);
  for (const c of Object.values(w.citizens).filter((x) => !x.player && x.id !== owner.id && x.nation === p.nation).slice(0, 3)) { co.workers.push(c.id); c.job = co.id; }
  co.workers.push(p.id); p.job = co.id;
  const k = addCrisis(w, 'strike', `Strike at ${co.name}`, [co.region], p.nation, 2, 1);
  k.company = co.id;
  advance(w, HOUR, false);
  const inst = storyFor(w, 'chain.wage.worker');
  assert.ok(inst, 'a striking worker is drawn in');
  assert.ok(chooseStory(w, inst.id, 'join', 'picket').ok);
  assert.ok(memoriesOf(w, owner.id).some((m) => /strike/.test(m.text)), 'the owner noticed');
  advance(w, 3 * DAY, false);
  assert.equal(inst.stage, 'back');
  assert.ok(chooseStory(w, inst.id, 'ok', 'back').ok);
  assert.equal(inst.status, 'completed');
});

test('borrowed trust: a real loan, repaid early — and a default made good', () => {
  const w = fresh(115);
  const p = player(w);
  const f = Object.values(w.citizens).find((c) => !c.player && c.nation === p.nation)!;
  mint(w, cref(f.id), 'USD', cur(500), 'test');
  sendMsg(w, { from: f.id, subject: `${f.name} offers a loan`, kind: 'npc', body: 'Loan?', options: [{ id: 'accept', label: 'Accept' }, { id: 'decline', label: 'No' }], payload: { handler: 'loanOffer', from: f.id, amount: cur(100) } });
  const inst = storyFor(w, 'chain.loan');
  assert.ok(chooseStory(w, inst.id, 'ask', 'offer').ok);
  const before = p.wallet.USD ?? 0;
  assert.ok(chooseStory(w, inst.id, 'reply:accept', 'offer').ok);
  assert.equal(p.wallet.USD, before + cur(100));
  advance(w, 8 * DAY + HOUR, false);
  assert.equal(inst.stage, 'due');
  mint(w, cref(p.id), 'USD', cur(50), 'test');
  assert.ok(chooseStory(w, inst.id, 'early', 'due').ok);
  assert.equal(p.flags[`loan_${f.id}`], undefined, 'debt cleared once');
  assert.equal(inst.ending, 'honoured-early');
  // Default: no money on the due date, then make good.
  const w2 = fresh(116);
  const p2 = player(w2);
  const f2 = Object.values(w2.citizens).find((c) => !c.player && c.nation === p2.nation)!;
  mint(w2, cref(f2.id), 'USD', cur(500), 'test');
  sendMsg(w2, { from: f2.id, subject: 'loan', kind: 'npc', body: 'Loan?', options: [{ id: 'accept', label: 'Accept' }, { id: 'decline', label: 'No' }], payload: { handler: 'loanOffer', from: f2.id, amount: cur(100) } });
  const i2 = storyFor(w2, 'chain.loan');
  chooseStory(w2, i2.id, 'reply:accept', 'offer');
  advance(w2, 8 * DAY + HOUR, false);
  chooseStory(w2, i2.id, 'fine', 'due');
  burn(w2, cref(p2.id), 'USD', p2.wallet.USD ?? 0, 'test');
  advance(w2, 3 * DAY, false);
  assert.equal(i2.stage, 'settle');
  assert.ok(memoriesOf(w2, f2.id).some((m) => /defaulted/.test(m.text)));
  mint(w2, cref(p2.id), 'USD', cur(200), 'test');
  assert.ok(chooseStory(w2, i2.id, 'makegood', 'settle').ok);
  assert.equal(i2.ending, 'made-good');
  assert.ok(audit(w2).ok, audit(w2).problems.join('; '));
});

test('the price of a meal: real prices, real groceries, a follow-up a week later', () => {
  const w = fresh(117);
  const p = player(w);
  const nat = controller(w.regions[p.loc]);
  advance(w, 2 * DAY, false);
  w.trades[`${nat}|food:1`] = Array.from({ length: 10 }, (_, d) => ({ day: d, qty: 10, value: 10 * 100, lo: 100, hi: 100 }));
  mint(w, cref(p.id), 'USD', cur(300), 'test');
  const t = triggerStory(w, 'chain.meal');
  assert.ok(t.ok, t.msg);
  const inst = w.story.instances[t.data.id];
  const contact = w.citizens[inst.bind.contact as number];
  const food0 = contact.inv['food:1'] ?? 0;
  const r = chooseStory(w, inst.id, 'buy', 'shelf');
  assert.ok(r.ok, r.msg);
  assert.ok((contact.inv['food:1'] ?? 0) > food0, 'they received real food');
  assert.equal(inst.stage, 'why');
  assert.match(viewStage(w, inst).text, /picture is clear/);
  assert.ok(chooseStory(w, inst.id, 'watch', 'why').ok);
  advance(w, 5 * DAY + HOUR, false);
  assert.equal(inst.stage, 'week');
  assert.ok(chooseStory(w, inst.id, 'ok', 'week').ok);
  assert.ok(audit(w).ok, audit(w).problems.join('; '));
});
