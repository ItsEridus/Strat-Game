import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { audit, produce } from '../src/engine/ledger';
import { DAY } from '../src/engine/clock';
import { cref, natref, player } from '../src/sim/query';
import { deserialize, serialize } from '../src/engine/save';
import { GRADES, INDUSTRIES, PRODUCTS, grade, itemName, stars } from '../src/data/items';
import { HOTSPOTS, NEW_RAWS } from '../src/data/resources';
import { companiesOf } from '../src/sim/census';
import { delivered, fundProject, startProject } from '../src/sim/construction';
import { goodsDaily, useGood, useGoodCheck } from '../src/sim/goods';
import { wellbeingDaily } from '../src/sim/wellbeing';
import { entrepreneurship } from '../src/ai/economy';
import { c as cur } from '../src/engine/money';

registerSystems();
const fresh = (seed = 1301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 3, lifeYearDays: 36 });

test('grades read as words: basic to top-grade, with stars', () => {
  assert.deepEqual(GRADES, ['Basic', 'Standard', 'Good', 'Premium', 'Top-grade']);
  assert.equal(grade(4), 'Premium');
  assert.equal(stars(2), '★★☆☆☆');
  assert.equal(itemName('food:4'), 'Premium food');
  assert.equal(itemName('wg:1'), 'Basic ground weapon');
  assert.equal(itemName('ticket:5'), 'Top-grade ticket');
  assert.equal(itemName('materials:3'), 'Good building materials');
  assert.equal(itemName('copper'), 'Copper');
  assert.equal(INDUSTRIES.length, 15);
});

test('new worlds have timber, cotton and copper where real producers are, and every nation has some', () => {
  const w = fresh();
  for (const k of NEW_RAWS) {
    for (const name of HOTSPOTS[k]!) {
      const r = w.regions.find((x) => x.name === name);
      assert.ok(r, `${name} exists`);
      assert.ok((r!.res[k] ?? 0) >= 2, `${name} is rich in ${k}`);
    }
    for (const n of w.nations) assert.ok(w.regions.some((r) => r.core === n.id && r.res[k]), `${n.name} has ${k}`);
  }
  // Every nation starts with at least one company in every industry.
  for (const n of w.nations) for (const ind of INDUSTRIES) assert.ok(companiesOf(w, n.id).some((co) => co.industry === ind), `${n.name}: ${ind}`);
});

test('the new industries produce, sell to households, and keep the books balanced', () => {
  const w = fresh(1302);
  for (let d = 0; d < 4; d++) advance(w, DAY, false);
  const made = (p: string) => Object.values(w.companies).filter((co) => co.industry === p).reduce((t, co) => t + co.lifetime.produced, 0);
  for (const p of ['materials', 'clothing', 'electronics', 'medicine']) assert.ok(made(p) > 0, `${p} produced`);
  const traded = (kind: string) => Object.keys(w.trades).some((k) => k.split('|')[1]?.startsWith(`${kind}:`) && w.trades[k].length > 0);
  for (const p of ['clothing', 'electronics', 'medicine']) assert.ok(traded(p), `${p} sold on a market`);
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
  void PRODUCTS;
});

test('construction takes building materials by grade, from national storage too', () => {
  const w = fresh(1303);
  const n = w.nations[0];
  const rid = w.regions.find((r) => r.owner === 0 && r.project == null)!.id;
  assert.ok(startProject(w, n.president!, 0, rid, 'industrial').ok);
  const proj = Object.values(w.projects).find((x) => x.region === rid && !x.done)!;
  const need = proj.needMats.materials;
  assert.ok(need > 0, 'materials are needed');
  produce(w, natref(0), 'materials:2', 5, 'test');
  produce(w, natref(0), 'materials:5', Math.ceil(need / 5) + 2, 'test');
  const r = fundProject(w, n.president!, proj.id);
  assert.ok(r.ok, r.msg);
  assert.ok(delivered(proj, 'materials') >= need, 'top-grade units count five each');
  assert.ok((n.inv['materials:5'] ?? 0) >= 1, 'no more taken than needed');
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
});

test('medicine restores health once a day; clothes lift spirits for a month', () => {
  const w = fresh(1304);
  const p = player(w);
  p.health = 50;
  produce(w, cref(p.id), 'medicine:3', 2, 'test');
  const r = useGood(w, p, 'medicine:3');
  assert.ok(r.ok, r.msg);
  assert.equal(p.health, 60);
  assert.match(useGoodCheck(w, p, 'medicine:3') ?? '', /once a day|One dose a day/);
  produce(w, cref(p.id), 'clothing:4', 1, 'test');
  assert.ok(useGood(w, p, 'clothing:4').ok);
  wellbeingDaily(w);
  assert.ok(p.life!.why!.happiness.some((x) => /new clothes/.test(x)), p.life!.why!.happiness.join(', '));
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
});

test('AI citizens look after themselves the same way', () => {
  const w = fresh(1305);
  const p = player(w);
  const npc = Object.values(w.citizens).find((c) => !c.player && !c.gone && c.nation === p.nation)!;
  npc.health = 40;
  produce(w, cref(npc.id), 'medicine:2', 1, 'test');
  goodsDaily(w);
  assert.equal(npc.health, 47, 'took the medicine they had');
  assert.equal(npc.inv['medicine:2'] ?? 0, 0);
  assert.ok(audit(w).ok, audit(w).problems.join('\n'));
});

test('older saves gain the new deposits without rolling dice, and someone starts the missing industries', () => {
  const w = fresh(1306);
  const data = JSON.parse(serialize(w));
  data.version = 8;
  for (const r of data.world.regions) for (const k of NEW_RAWS) delete r.res[k];
  const text = JSON.stringify(data);
  const a = deserialize(text), b = deserialize(text);
  assert.equal(a.rng, w.rng, 'upgrading rolls no dice');
  assert.deepEqual(a.regions.map((r) => r.res), b.regions.map((r) => r.res), 'the same deposits every time');
  assert.ok(a.regions.find((r) => r.name === 'Arizona')!.res.copper! >= 2);
  // An economy without any clothing maker in one country: an entrepreneur starts one.
  for (const co of companiesOf(a, 0)) if (co.industry === 'clothing') co.industry = 'food';
  for (const c of Object.values(a.citizens)) if (c.nation === 0 && !c.player && (c.persona === 'industrialist' || c.persona === 'investor')) { c.wallet.GOLD = (c.wallet.GOLD ?? 0) + 100_000; c.wallet[a.nations[0].cur] = (c.wallet[a.nations[0].cur] ?? 0) + cur(500); }
  for (let i = 0; i < 80 && !companiesOf(a, 0).some((co) => co.industry === 'clothing'); i++) entrepreneurship(a);
  assert.ok(companiesOf(a, 0).some((co) => co.industry === 'clothing'), 'a clothing company was founded');
});
