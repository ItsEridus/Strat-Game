import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { player } from '../src/sim/query';
import { serialize, deserialize } from '../src/engine/save';
import { c as cur } from '../src/engine/money';
import {
  active, banned, habitRisk, habitStats, habitToll, habitsMonth, indulge, indulgeCheck, placeBet, prices, quitHabit, raiseTobaccoDuty, tobaccoDuty,
} from '../src/sim/habits';
import { mentalRisks } from '../src/sim/mentalHealth';
import type { World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 3901) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const adults = (w: World) => census(w).all.filter((c) => !c.gone && !c.player && ageOf(w, c) >= 18);

test('habits follow each country and sex: Chinese men smoke, Saudis do not drink; prices and duty differ', () => {
  const w = fresh();
  advance(w, DAY, false);
  assert.ok(w.habitsSeeded);
  const by = (iso: string) => w.nations.find((n) => n.iso === iso)!;
  const chn = habitStats(w, by('CHN').id), gbr = habitStats(w, by('GBR').id), sau = habitStats(w, by('SAU').id);
  assert.ok(chn.smokersMen > chn.smokersWomen + 0.15, `men smoke far more in China (${chn.smokersMen} vs ${chn.smokersWomen})`);
  assert.ok(chn.smokersMen > gbr.smokersMen, 'more than in Britain');
  assert.ok(sau.heavyDrinking < 0.01 && banned(by('SAU'), 'drinking'));
  assert.ok(prices(w, by('AUS')).pack > prices(w, by('IND')).pack * 8, 'cigarettes cost a fortune in Australia');
  const all = w.nations.map((n) => habitStats(w, n.id)).filter((s) => s.adults > 30);
  const smoke = all.reduce((t, s) => t + (s.smokersMen + s.smokersWomen) / 2, 0) / all.length;
  assert.ok(smoke > 0.08 && smoke < 0.3, `about one adult in six smokes (${smoke})`);
});

test('habits harm health, cost money every month (duty to the state) and feed depression', () => {
  const w = fresh(3902);
  advance(w, DAY, false);
  const c = adults(w).find((x) => !x.habits && (x.wallet[w.nations[x.nation].cur] ?? 0) > cur(50))!;
  const r0 = habitRisk(c, 'cancer'), d0 = mentalRisks(w, c).depression;
  c.habits = { smoking: { level: 80, since: w.time }, drinking: { level: 70, since: w.time } };
  assert.ok(habitRisk(c, 'cancer') > r0 * 2.5 && habitToll(c) > 10);
  assert.ok(mentalRisks(w, c).depression > d0 * 1.4, 'heavy drinking raises the risk of depression');
  const n = w.nations[c.nation];
  const cash0 = c.wallet[n.cur], state0 = n.wallet[n.cur];
  habitsMonth(w);
  assert.ok(c.wallet[n.cur] < cash0, 'it costs money');
  assert.ok(n.wallet[n.cur] !== state0, 'duty goes to the treasury');
  assert.ok(audit(w).ok);
});

test('quitting: most relapse, help makes it more likely to last; a year off and the habit is gone', () => {
  const w = fresh(3903);
  advance(w, DAY, false);
  const group = adults(w).slice(0, 200);
  for (const [i, c] of group.entries()) { c.habits = { smoking: { level: 70, since: w.time - 3000 * DAY, quit: w.time, helped: i % 2 === 0 } }; }
  for (let m = 0; m < 13; m++) { w.time += 30 * DAY; habitsMonth(w); }
  const off = (helped: number) => group.filter((c, i) => i % 2 === helped && (!c.habits?.smoking || c.habits.smoking.quit != null)).length;
  assert.ok(off(0) < 80 && off(1) < 80, `most relapse (${off(0)}, ${off(1)} of 100 still off)`);
  assert.ok(off(0) > off(1), `help makes it more likely to last (${off(0)} vs ${off(1)})`);
  assert.ok(group.some((c) => !c.habits?.smoking), 'some put it behind them for good');
});

test('the player: a night out, quitting with help, a bet; tobacco duty; saved', () => {
  const w = fresh(3904);
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  const h = banned(n, 'drinking') ? 'smoking' : 'drinking';
  if (!indulgeCheck(w, p, h)) {
    const r = indulge(w, p, h);
    assert.ok(r.ok, r.msg);
    assert.ok(active(p, h) > 0);
    assert.ok(indulgeCheck(w, p, h), 'once a day');
    assert.ok(quitHabit(w, p, h, false).ok);
    assert.equal(active(p, h), 0);
  }
  if (!banned(n, 'gambling') && (p.wallet[n.cur] ?? 0) >= cur(1)) {
    const r = placeBet(w, p, cur(1));
    assert.ok(r.ok, r.msg);
    assert.ok(p.habits?.gambling);
  }
  n.president = p.id;
  const d0 = tobaccoDuty(n), pack0 = prices(w, n).pack;
  assert.ok(raiseTobaccoDuty(w).ok);
  assert.ok(tobaccoDuty(n) > d0 && prices(w, n).pack > pack0);
  const w2 = deserialize(serialize(w));
  assert.equal(w2.nations[n.id].tobacco, n.tobacco);
  assert.ok(audit(w).ok);
});

test('over two years habits hold roughly steady, smoking slowly declines', () => {
  const w = fresh(3905);
  advance(w, DAY, false);
  const rate = () => { const s = w.nations.map((n) => habitStats(w, n.id)).filter((x) => x.adults > 30); return s.reduce((t, x) => t + (x.smokersMen + x.smokersWomen) / 2, 0) / s.length; };
  const r0 = rate();
  for (let m = 0; m < 24; m++) { w.time += 30 * DAY; habitsMonth(w); }
  const r1 = rate();
  assert.ok(r1 < r0 * 1.15 && r1 > r0 * 0.6, `smoking ${r0.toFixed(3)} → ${r1.toFixed(3)}`);
  assert.ok(audit(w).ok);
});
