// Personal condition: energy, eating, skills (grown by practice, see growth.ts), training.
// Used identically by the player and AI citizens.
import { lifeGate } from './lifecycle';
import type { Attr, Citizen, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { consume } from '../engine/ledger';
import { cref, maxEnergy, studyActive, today, jailed } from './query';
import { practise } from './growth';
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
/** Energy and food allowance recover over `ticks` ten-minute ticks. */
export function regenTick(w: World, c: Citizen, ticks = 1) {
  const max = maxEnergy(w, c);
  if (c.energy < max) c.energy = Math.min(max, c.energy + B.energy.regenPerTick * ticks);
  const cap = allowanceCap(w, c);
  if (c.allowance < cap) {
    c.allowAcc += 10 * ticks;
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

/** A study manual: a few evenings of reading improve your weakest skill. */
export function studyManual(w: World, c: Citizen): Result {
  if ((c.inv['sp:manual'] ?? 0) < 1) return fail('Requires a Study Manual (Shop).');
  consume(w, cref(c.id), 'sp:manual', 1, 'special used');
  const a = (Object.keys(c.attrs) as Attr[]).filter((k) => k !== 'luck').sort((x, y) => c.attrs[x] - c.attrs[y])[0];
  const before = c.attrs[a];
  practise(w, c, a, 5);
  return ok(`You studied ${ATTRS[a].name.toLowerCase()}: ${before.toFixed(1)} → ${c.attrs[a].toFixed(1)}.`);
}

export function powerGain(w: World, c: Citizen): number {
  const gain = 1 / (Math.log(c.power + 2) / Math.log(B.training.logBase));
  return +(gain * (studyActive(w, c, 'gymrat') ? 1.2 : 1)).toFixed(3);
}

export type TrainMode = 'normal' | 'food' | 'weapons';

export function trainCheck(w: World, c: Citizen, mode: TrainMode): string | null {
  const tooYoung = lifeGate(w, c, 13, 'Training at the grounds');
  if (tooYoung) return tooYoung;
  if (jailed(w, c)) return 'You are in prison (the yard has no gym).';
  if (mode === 'food' && (c.inv['food:1'] ?? 0) < 5) return 'Donation training needs 5 Q1 food.';
  if (mode === 'weapons' && (c.inv['wg:1'] ?? 0) < 20) return 'Donation training needs 20 Q1 ground weapons.';
  if (c.energy < B.cost.train) return `Not enough energy (${Math.floor(c.energy)}/${B.cost.train}).`;
  if (c.mining && mode !== 'normal') return 'Donations are blocked while mining.';
  return null;
}

/** First training each day raises training power; every session builds strength and endurance (less each time). */
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
    msg = 'Extra session: power grows once per day, but your body still gets stronger.';
  }
  const effort = B.practice.train / Math.max(1, c.trainsToday);
  const str0 = c.attrs.str, end0 = c.attrs.end;
  practise(w, c, 'str', effort);
  practise(w, c, 'end', effort * 0.5);
  if (mode === 'food') { consume(w, cref(c.id), 'food:1', 5, 'training donation'); practise(w, c, 'lead', B.practice.trainDonate); c.influence += 0.2; }
  if (mode === 'weapons') { consume(w, cref(c.id), 'wg:1', 20, 'training donation'); practise(w, c, 'lead', B.practice.trainDonate); c.influence += 0.2; }
  if (c.player) bump(w, 'train');
  return ok(`${msg} Strength ${str0.toFixed(1)} → ${c.attrs.str.toFixed(1)}, endurance ${end0.toFixed(1)} → ${c.attrs.end.toFixed(1)}.${mode !== 'normal' ? ' The donation was noticed (+standing).' : ''}`);
}
