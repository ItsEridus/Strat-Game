// Personal progression: energy, eating, XP/levels, attributes, training.
// Used identically by the player and AI citizens.
import type { Attr, Citizen, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { consume, mint } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { notify } from '../engine/events';
import { cref, maxEnergy, studyActive, today, xpToNext, jailed } from './query';
import { bump } from './progress';

export const ATTRS: Record<Attr, { name: string; effect: string }> = {
  str: { name: 'Strength', effect: '+5 starting hit damage (before training-power multiplier)' },
  acc: { name: 'Accuracy', effect: '+0.1 percentage point hit chance (no cap)' },
  luck: { name: 'Luck', effect: '+0.1 pt critical chance, +0.2 pt critical damage' },
  end: { name: 'Endurance', effect: '+1 maximum energy' },
  lead: { name: 'Leadership', effect: '+0.1% production of your employees' },
  eco: { name: 'Economic Aptitude', effect: '+0.1 effective economic skill' },
  cons: { name: 'Construction Efficiency', effect: '+0.1% construction progress' },
};

export function allowanceCap(w: World, c: Citizen) {
  return B.food.allowanceMax + (studyActive(w, c, 'provisions') ? 3 : 0);
}

/** Called every 10-minute tick for every citizen. */
export function regenTick(w: World, c: Citizen) {
  const max = maxEnergy(w, c);
  if (c.energy < max) c.energy = Math.min(max, c.energy + B.energy.regenPerTick);
  const cap = allowanceCap(w, c);
  if (c.allowance < cap) {
    c.allowAcc += 10;
    while (c.allowAcc >= B.food.allowanceEvery && c.allowance < cap) {
      c.allowAcc -= B.food.allowanceEvery;
      c.allowance++;
    }
  } else c.allowAcc = 0;
}

/** Minutes until the next allowance point (for the HUD timer). */
export const allowanceEta = (w: World, c: Citizen) => (c.allowance >= allowanceCap(w, c) ? 0 : B.food.allowanceEvery - c.allowAcc);
/** Minutes until energy is full. */
export const energyEta = (w: World, c: Citizen) => Math.ceil(Math.max(0, maxEnergy(w, c) - c.energy) / B.energy.regenPerTick) * 10;

export function spendEnergy(w: World, c: Citizen, n: number): string | null {
  if (c.energy < n) return `Not enough energy (${Math.floor(c.energy)}/${n}).`;
  c.energy -= n;
  return null;
}

export function addXp(w: World, c: Citizen, n: number) {
  c.xp += n;
  while (c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++;
    if (c.level <= B.levels.attrMaxLevel) c.attrPts += B.levels.attrPerLevel;
    mint(w, cref(c.id), GOLD, g(B.levels.goldPerLevel), 'Level-up reward');
    if (c.player) notify(w, 'progress', `⭐ Level ${c.level}! +${B.levels.attrPerLevel} attribute points, +${B.levels.goldPerLevel} gold.`, { link: 'character' });
  }
}

export function eatPreview(w: World, c: Citizen, q: number) {
  const restore = B.food.energy[q - 1];
  const room = Math.max(0, maxEnergy(w, c) - c.energy);
  return { restore, gained: Math.min(restore, room), wasted: Math.max(0, restore - room) };
}

export function eat(w: World, c: Citizen, q: number): Result {
  const key = `food:${q}`;
  if ((c.inv[key] ?? 0) < 1) return fail(`You have no Q${q} food.`);
  if (c.allowance < 1) return fail('No eating allowance left — it regenerates every 45 minutes.');
  const p = eatPreview(w, c, q);
  if (p.gained <= 0) return fail('Energy is already full.');
  consume(w, cref(c.id), key, 1, 'eaten');
  c.allowance--;
  c.energy += p.gained;
  if (c.player) bump(w, 'eat');
  return ok(`Ate Q${q} food: +${p.gained} energy${p.wasted ? ` (${p.wasted} wasted)` : ''}.`);
}

export function allocAttr(w: World, c: Citizen, a: Attr, n: number): Result {
  if (!(a in c.attrs)) return fail('Unknown attribute.');
  if (!Number.isInteger(n) || n < 1) return fail('Invalid amount.');
  if (c.attrPts < n) return fail(`Only ${c.attrPts} unspent points.`);
  c.attrPts -= n;
  c.attrs[a] += n;
  if (a === 'end') c.energy = Math.min(c.energy, maxEnergy(w, c));
  return ok(`${ATTRS[a].name} +${n}.`);
}

export function respec(w: World, c: Citizen): Result {
  if ((c.inv['sp:manual'] ?? 0) < 1) return fail('Requires a Retraining Manual (Shop).');
  consume(w, cref(c.id), 'sp:manual', 1, 'special used');
  let refunded = 0;
  for (const k of Object.keys(c.attrs) as Attr[]) { refunded += c.attrs[k]; c.attrs[k] = 0; }
  c.attrPts += refunded;
  c.energy = Math.min(c.energy, maxEnergy(w, c));
  return ok(`Attributes reset: ${refunded} points to reallocate.`);
}

export function powerGain(w: World, c: Citizen): number {
  const gain = 1 / (Math.log(c.power + 2) / Math.log(B.training.logBase));
  return +(gain * (studyActive(w, c, 'gymrat') ? 1.2 : 1)).toFixed(3);
}

export type TrainMode = 'normal' | 'food' | 'weapons';

export function trainCheck(w: World, c: Citizen, mode: TrainMode): string | null {
  if (jailed(w, c)) return 'You are in prison (the yard has no gym).';
  if (mode === 'food' && (c.inv['food:1'] ?? 0) < 5) return 'Donation training needs 5 Q1 food.';
  if (mode === 'weapons' && (c.inv['wg:1'] ?? 0) < 20) return 'Donation training needs 20 Q1 ground weapons.';
  if (c.energy < B.cost.train) return `Not enough energy (${Math.floor(c.energy)}/${B.cost.train}).`;
  if (c.mining && mode !== 'normal') return 'Donations are blocked while mining.';
  return null;
}

/** First training each day raises training power; extra sessions give XP only (DOC). */
export function train(w: World, c: Citizen, mode: TrainMode = 'normal'): Result {
  const why = trainCheck(w, c, mode);
  if (why) return fail(why);
  c.energy -= B.cost.train;
  const d = today(w);
  let msg = '';
  if (c.lastTrainDay !== d) {
    const gain = powerGain(w, c);
    c.power = +(c.power + gain).toFixed(3);
    c.lastTrainDay = d;
    c.trainsToday = 1;
    msg = `Training power +${gain.toFixed(2)} (now ${c.power.toFixed(1)}).`;
  } else {
    c.trainsToday++;
    msg = 'Extra session: XP only (power grows once per day).';
  }
  let xp = B.xp.train;
  if (mode === 'food') { consume(w, cref(c.id), 'food:1', 5, 'training donation'); xp = B.xp.trainDonate; }
  if (mode === 'weapons') { consume(w, cref(c.id), 'wg:1', 20, 'training donation'); xp = B.xp.trainDonate; }
  addXp(w, c, xp);
  if (c.player) bump(w, 'train');
  return ok(`${msg} +${xp} XP.`);
}
