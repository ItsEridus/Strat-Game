// Gold mining: each citizen is assigned a site; a timed 1h or 2h shift there
// yields gold (wiki 0.5 / 0.8) scaled by equipment, skill, studies and a global
// multiplier. Mining blocks travel, fighting, market trading and donations but
// allows work and training. Rewards are calculated once at completion.
import type { Citizen, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { mint } from '../engine/ledger';
import { GOLD, fmtAmt, g } from '../engine/money';
import { HOUR } from '../engine/clock';
import { notify, schedule } from '../engine/events';
import { pick } from '../engine/rng';
import { cref, effEco, studyActive } from './query';
import { gearStats } from './combatMath';
import { rollDrop } from './gear';
import { distance } from './travel';
import { bump } from './progress';

export function miningPreview(w: World, c: Citizen, hours: 1 | 2) {
  const base = B.mining.yields[hours];
  const equip = 1 + (gearStats(w, c).mine ?? 0) / 100;
  const skill = 1 + effEco(w, c) * 0.02;
  const study = studyActive(w, c, 'doubleshift') ? 1.5 : 1;
  const mult = B.mining.globalMult;
  return { base, equip, skill, study, mult, total: base * equip * skill * study * mult };
}

export function mineCheck(w: World, c: Citizen): string | null {
  if (c.mining) return 'Already mining.';
  if (c.loc !== c.mineSite) return `Your assigned site is ${w.regions[c.mineSite].name} (${distance(w, c.loc, c.mineSite)} regions away) — travel there first.`;
  if (c.energy < B.cost.mineStart) return `Needs ${B.cost.mineStart} energy.`;
  return null;
}

export function startMining(w: World, c: Citizen, hours: 1 | 2): Result {
  const why = mineCheck(w, c);
  if (why) return fail(why);
  c.energy -= B.cost.mineStart;
  c.mining = { region: c.loc, start: w.time, end: w.time + hours * HOUR };
  schedule(w, c.mining.end, 'mineEnd', { cit: c.id, end: c.mining.end });
  return ok(`Mining shift started (${hours}h). Travel, fighting, trading and donations are blocked until it ends; working and training are allowed.`);
}

export function cancelMining(w: World, c: Citizen): Result {
  if (!c.mining) return fail('Not mining.');
  c.mining = null;
  return ok('Shift abandoned — progress forfeited.');
}

/** Scheduled completion: pays once, assigns a new site. */
export function onMineEnd(w: World, citId: number, end: number) {
  const c = w.citizens[citId];
  if (!c || !c.mining || c.mining.end !== end) return; // cancelled or already paid
  const hours = Math.round((c.mining.end - c.mining.start) / HOUR) as 1 | 2;
  const pv = miningPreview(w, c, hours);
  const amt = g(pv.total);
  mint(w, cref(c.id), GOLD, amt, 'Gold mining');
  rollDrop(w, c, B.gear.dropMine, 'mining');
  c.mining = null;
  assignSite(w, c);
  if (c.player) {
    bump(w, 'mine');
    notify(w, 'progress', `⛏️ Mining shift complete: +${fmtAmt(GOLD, amt)}. Next site: ${w.regions[c.mineSite].name}.`, { link: 'mining' });
  }
}

/** A new site elsewhere: for the player within two regions; AI sites stay home. */
export function assignSite(w: World, c: Citizen) {
  const near = w.regions.filter((r) => r.id !== c.loc && distance(w, c.loc, r.id) <= 2);
  c.mineSite = c.player ? (near.length ? pick(w, near).id : c.loc) : c.loc;
}

/** AI: some citizens mine when at their site with energy to spare. */
export function aiMining(w: World) {
  for (const c of Object.values(w.citizens)) {
    if (c.player || c.mining || c.energy < 50) continue;
    if (!(c.persona === 'worker' || c.persona === 'investor') || (c.id + Math.floor(w.time / HOUR)) % 120 !== 0) continue; // ~0.2 shifts/day each
    if (c.loc !== c.mineSite) { c.mineSite = c.loc; continue; }
    startMining(w, c, 2);
  }
}
