import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { serialize, deserialize } from '../src/engine/save';
import { TECH } from '../src/data/techTree';
import { controlled, hasTech, researchMass, techFx, techGrowth, techMonth, threshold } from '../src/sim/technology';
import { capsOf } from '../src/sim/strategic';
import { power } from '../src/sim/forces';
import { mortality } from '../src/sim/population';
import { energyPrice } from '../src/sim/energy';
import { collectionQuality } from '../src/sim/beliefs';

registerSystems();
const fresh = (seed = 2601) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });
const by = (w: any, iso: string) => w.nations.find((n: any) => n.iso === iso)!;

test('the leaders make breakthroughs first; others adopt them; export controls slow it', () => {
  const w = fresh();
  advance(w, DAY, false);
  const us = by(w, 'USA'), ar = by(w, 'ARG'), ru = by(w, 'RUS');
  assert.ok(researchMass(us) > researchMass(ar) * 3);
  capsOf(w, us).tech.information = threshold(TECH.aiagents); // the domain level the strategic turn would reach
  for (let i = 0; i < 240 && !w.techFirsts?.aiagents; i++) techMonth(w);
  assert.ok(w.techFirsts?.aiagents, 'AI agents arrive within twenty years');
  const first = w.nations[w.techFirsts!.aiagents.nation];
  assert.ok(capsOf(w, first).tech.information >= threshold(TECH.aiagents));
  // Export controls: every holder dislikes Russia.
  for (const n of w.nations) if (hasTech(n, 'aiagents') && n.id !== ru.id) { n.relations[ru.id].score = -50; }
  if (!hasTech(ru, 'aiagents')) assert.ok(controlled(w, ru, 'aiagents'));
  assert.ok(audit(w).ok);
});

test('technologies make growth faster, forces stronger, intelligence sharper, lives longer and energy cheaper', () => {
  const w = fresh(2602);
  advance(w, DAY, false);
  const us = by(w, 'USA'), cn = by(w, 'CHN');
  const f = Object.values(w.forces).find((x) => x.nation === us.id)!;
  const p0 = power(w, f), e0 = energyPrice(w, us), q0 = collectionQuality(w, us, cn);
  const old = census(w).all.find((c) => c.nation === us.id && !c.player)!;
  const m0 = mortality(w, old);
  us.techs = { swarms: w.time, aiagents: w.time, smr: w.time, mrna: w.time, quantum: w.time, genetherapy: w.time };
  assert.ok(techGrowth(w, us) > 0.5);
  assert.ok(power(w, f) > p0);
  assert.ok(energyPrice(w, us) < e0);
  assert.ok(collectionQuality(w, us, cn) > q0 || q0 >= 0.97);
  assert.ok(mortality(w, old) < m0);
  assert.ok(techFx(us).military >= 0.08);
  // Growth from a technology fades after ten years.
  us.techs = { aiagents: w.time - 11 * 365 * DAY };
  assert.equal(techGrowth(w, us), 0);
  const w2 = deserialize(serialize(w));
  assert.ok(hasTech(by(w2, 'USA'), 'aiagents'));
});

test('the innovation system: research workforce, patents and royalties, partnerships and stolen designs', async () => {
  const { gain, researchWorkforce, stealTech } = await import('../src/sim/technology');
  const { signTreaty } = await import('../src/sim/treaties');
  const w = fresh(2603);
  advance(w, 2 * DAY, false);
  const us = by(w, 'USA'), de = by(w, 'DEU'), cn = by(w, 'CHN');
  const wf = researchWorkforce(w, us);
  assert.ok(wf >= 0.5 && wf <= 1.6);
  // A breakthrough is patented; adopters pay royalties.
  gain(w, us, TECH.swarms, 'discovered');
  const pat = w.patents!.find((p) => p.tech === 'swarms')!;
  assert.ok(pat && pat.nation === us.id);
  if (pat.company != null) {
    de.wallet.GOLD = Math.max(de.wallet.GOLD ?? 0, 0);
    const before = pat.royalties;
    if ((de.wallet.GOLD ?? 0) > 1000) { gain(w, de, TECH.swarms, 'adopted'); assert.ok(pat.royalties > before); }
  }
  // Partners never keep technology from each other.
  for (const n of w.nations) if (hasTech(n, 'swarms') && n.id !== cn.id) n.relations[cn.id].score = -60;
  assert.ok(controlled(w, cn, 'swarms'));
  signTreaty(w, 'tech', [us.id, cn.id], { quiet: true });
  assert.ok(!controlled(w, cn, 'swarms'));
  // Spies steal designs when the thief is close enough to use them.
  capsOf(w, cn).tech.military = threshold(TECH.swarms);
  const d = hasTech(cn, 'swarms') ? null : stealTech(w, cn, us);
  if (d) assert.ok(hasTech(cn, d.id));
  assert.ok(audit(w).ok);
});
