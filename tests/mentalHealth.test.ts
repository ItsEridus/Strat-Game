import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { ageOf } from '../src/sim/growth';
import { lifeOf } from '../src/sim/lifecycle';
import { die } from '../src/sim/population';
import { tooIll } from '../src/sim/health';
import { serialize, deserialize } from '../src/engine/save';
import { player } from '../src/sim/query';
import { statisticalSkip } from '../src/sim/statYear';
import {
  griefOf, helpSeeking, mentalHealthMonth, mentalHealthStats, mentalRisks, mourningOf, nationMH, setProgramme, startTherapy, stopTherapy,
  talkCheck, talkToSomeone, therapyOptions,
} from '../src/sim/mentalHealth';
import type { Citizen, World } from '../src/sim/types';

registerSystems();
const fresh = (seed = 3801) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });
const adults = (w: World) => census(w).all.filter((c) => !c.gone && !c.player && ageOf(w, c) >= 20 && ageOf(w, c) < 60);

test('risk follows life: stress, loneliness and losing work; some start the game already ill; stigma and access decide who seeks help', () => {
  const w = fresh();
  advance(w, DAY, false);
  assert.ok(w.mhSeeded);
  const s = w.nations.map((n) => mentalHealthStats(w, n.id)).filter((x) => x.adults > 20);
  const avgIll = s.reduce((t, x) => t + x.ill, 0) / s.length;
  assert.ok(avgIll > 0.01 && avgIll < 0.2, `some people start the game struggling (${avgIll})`);
  const c = adults(w).find((x) => x.job != null && !x.conditions?.length)!;
  const calm = mentalRisks(w, c, true).depression;
  lifeOf(c).stress = 70;
  const strained = mentalRisks(w, c, false).depression;
  assert.ok(strained > calm * 3, 'heavy stress and loneliness raise the risk of depression');
  assert.ok(mentalRisks(w, c, false).burnout > mentalRisks(w, { ...c, job: null, post: undefined, business: undefined } as Citizen, false).burnout, 'burnout comes from work');
  // Seeking help: easier where care is reachable and stigma low.
  const gbr = adults(w).find((x) => w.nations[x.nation].iso === 'GBR')!;
  const ind = adults(w).find((x) => w.nations[x.nation].iso === 'IND')!;
  const x = { key: 'depression' as const, since: w.time, sev: 2 };
  assert.ok(helpSeeking(w, gbr, x) > helpSeeking(w, ind, x) * 2);
  assert.ok(nationMH(w.nations[ind.nation]).stigma > nationMH(w.nations[gbr.nation]).stigma);
});

test('episodes lift faster with treatment and support, and each makes the next more likely', () => {
  const w = fresh(3802);
  advance(w, DAY, false);
  const group = adults(w).slice(0, 160);
  for (const [i, c] of group.entries()) {
    c.conditions = [{ key: 'depression', since: w.time, sev: 2, ...(i % 2 ? {} : { sought: true, treatedUntil: w.time + 400 * DAY }) }];
    lifeOf(c).stress = 30;
  }
  const risk0 = mentalRisks(w, group[0]).depression;
  for (let m = 0; m < 6; m++) mentalHealthMonth(w);
  const still = (odd: number) => group.filter((c, i) => i % 2 === odd && c.conditions?.some((x) => x.key === 'depression')).length;
  assert.ok(still(0) < still(1), `treated recover sooner (${still(0)} vs ${still(1)} of 80 still depressed)`);
  const recovered = group.find((c) => !c.conditions?.some((x) => x.key === 'depression') && (c.mh?.episodes ?? 0) > 0)!;
  assert.ok(recovered, 'someone recovered');
  if (recovered === group[0]) assert.ok(mentalRisks(w, group[0]).depression > risk0 * 1.2, 'a past episode raises the risk');
  // Moderate depression untreated keeps people off work.
  const c = adults(w).find((x) => !x.conditions?.length)!;
  c.conditions = [{ key: 'depression', since: w.time, sev: 2 }];
  assert.ok(tooIll(w, c));
  c.conditions[0].treatedUntil = w.time + 30 * DAY;
  assert.ok(!tooIll(w, c), 'treated moderate depression: back to work');
  c.conditions = [{ key: 'burnout', since: w.time, sev: 2, until: w.time + 40 * DAY }];
  assert.ok(tooIll(w, c), 'burnout means time off');
  assert.ok(audit(w).ok);
});

test('therapy: a waiting list or a fee, weekly sessions paid through the ledger; talking to someone', () => {
  const w = fresh(3803);
  advance(w, DAY, false);
  const c = adults(w).find((x) => w.nations[x.nation].iso === 'GBR')!;
  c.conditions = [{ key: 'anxiety', since: w.time, sev: 2 }];
  const pub = therapyOptions(w, c).find((o) => o.route === 'public')!;
  assert.ok(pub.weeks >= 5 && pub.price === 0, 'GBR: free public therapy after a wait');
  const usa = adults(w).find((x) => w.nations[x.nation].iso === 'USA')!;
  assert.ok(!therapyOptions(w, usa).some((o) => o.route === 'public'), 'USA: private therapy only');
  assert.ok(startTherapy(w, c, 'public').ok);
  assert.ok(c.conditions[0].sought);
  assert.ok(!startTherapy(w, c, 'private').ok, 'one course at a time');
  advance(w, (pub.weeks + 3) * 7 * DAY, false);
  assert.ok((c.mh?.therapy?.sessions ?? 0) >= 2 || !c.mh?.therapy, `sessions began after the wait (${c.mh?.therapy?.sessions})`);
  assert.ok(stopTherapy(w, c).ok || !c.mh?.therapy);
  // Private therapy costs money.
  const d = adults(w).find((x) => w.nations[x.nation].iso === 'USA' && (x.wallet[w.nations[x.nation].cur] ?? 0) > 5000)!;
  if (d) {
    d.conditions = [{ key: 'depression', since: w.time, sev: 1 }];
    assert.ok(startTherapy(w, d, 'private').ok);
    assert.ok((d.mh?.therapy?.price ?? 0) > 0, 'private sessions have a fee');
    advance(w, 15 * DAY, false);
    assert.ok((d.mh?.therapy?.sessions ?? 0) >= 1 || !d.mh?.therapy, 'sessions are held (and paid) weekly');
  }
  // Talking to someone.
  const p = player(w);
  const friend = adults(w).find((x) => x.nation === p.nation)!;
  friend.rel[p.id] = 80;
  assert.equal(talkCheck(w, p), null);
  const r = talkToSomeone(w, p);
  assert.ok(r.ok, r.msg);
  assert.ok(talkCheck(w, p), 'once a day');
  assert.ok(audit(w).ok);
});

test('grief has a course: raw, easing over months, back on anniversaries; it weighs on wellbeing', () => {
  const w = fresh(3804);
  advance(w, DAY, false);
  const couple = adults(w).find((x) => x.family?.partner != null && w.citizens[x.family.partner] && !w.citizens[x.family.partner].gone && !w.citizens[x.family.partner].player)!;
  assert.ok(couple, 'a couple to test with');
  const partner = w.citizens[couple.family!.partner!];
  advance(w, 3 * DAY, false);
  const h0 = lifeOf(partner).happiness;
  die(w, couple, 'in an accident');
  const loss = partner.mh?.losses?.find((l) => l.id === couple.id)!;
  assert.ok(loss && loss.who === 'partner');
  const g0 = griefOf(w, partner);
  assert.ok(g0 >= 20, `raw grief (${g0})`);
  const at = (days: number) => mourningOf({ ...w, time: loss.t + days * DAY } as World, loss);
  assert.ok(at(180) < at(10) / 2, 'it eases over months');
  assert.ok(at(365 + 2) > at(365 - 20) + 3, 'and comes back on the anniversary');
  advance(w, 3 * DAY, false);
  assert.ok(lifeOf(partner).happiness < h0 - 2 || partner.gone, 'grief weighs on happiness');
  assert.ok(audit(w).ok);
});

test('a national programme widens access and fades stigma; it all survives a save', () => {
  const w = fresh(3805);
  advance(w, DAY, false);
  const p = player(w);
  const n = w.nations[p.nation];
  n.president = p.id;
  const m0 = { ...nationMH(n) };
  assert.ok(setProgramme(w, true).ok);
  assert.ok(!setProgramme(w, true).ok);
  const other = w.nations.find((x) => x.id !== n.id && nationMH(x).programme == null)!;
  const o0 = { ...nationMH(other) };
  statisticalSkip(w, w.time + 400 * DAY);
  const gain = nationMH(n).access - m0.access, gain2 = nationMH(other).access - o0.access;
  if (nationMH(other).programme == null) assert.ok(gain > gain2, 'faster with a programme');
  assert.ok(nationMH(n).stigma < m0.stigma);
  const w2 = deserialize(serialize(w));
  assert.ok(w2.nations[n.id].mh?.programme != null);
  assert.ok(w2.mhSeeded);
  assert.ok(audit(w).ok);
});
