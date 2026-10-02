// Everyday goods. Medicine restores health and helps recovery for a few days;
// new clothes and gadgets lift a person's spirits for a while (see wellbeing).
// The player and AI citizens use them the same way, buying on the real market.
import type { Citizen, World } from './types';
import { B } from '../data/balance';
import { gradeLc, itemName, kindOf, qualityOf } from '../data/items';
import { fail, ok, type Result } from '../engine/result';
import { consume } from '../engine/ledger';
import { c as cur } from '../engine/money';
import { chance, hash01 } from '../engine/rng';
import { census } from './census';
import { controller, cref, jailed, today } from './query';
import { lifeOf } from './lifecycle';
import { lookOf, SHIRTS } from './looks';
import { buyBest, listingsFor } from './market';

export const USABLE = ['medicine', 'clothing', 'electronics'];
const healthOf = (c: Citizen) => c.health ?? 90;

export function useGoodCheck(w: World, c: Citizen, key: string): string | null {
  const kind = kindOf(key);
  if (!USABLE.includes(kind) || !qualityOf(key)) return 'This cannot be used.';
  if ((c.inv[key] ?? 0) < 1) return `You have no ${itemName(key).toLowerCase()}.`;
  if (kind === 'medicine') {
    if (lifeOf(c).treated === today(w)) return 'One dose a day.';
    if (healthOf(c) >= 100) return 'You are in perfect health.';
  }
  return null;
}

export function useGood(w: World, c: Citizen, key: string): Result {
  const why = useGoodCheck(w, c, key);
  if (why) return fail(why);
  const kind = kindOf(key), q = qualityOf(key);
  const L = lifeOf(c);
  consume(w, cref(c.id), key, 1, kind === 'medicine' ? 'medicine taken' : 'put to use');
  if (kind === 'medicine') {
    const before = healthOf(c);
    c.health = Math.min(100, before + B.goods.medicine[q - 1]);
    L.treated = today(w);
    return ok(`Took ${gradeLc(q)} medicine: health ${Math.round(before)} → ${Math.round(c.health)}, and a better recovery for ${B.goods.treatmentDays} days.`);
  }
  if (kind === 'clothing') {
    (L.goods ??= {}).clothes = { t: w.time, q };
    if (c.player) { const was = lookOf(w, c).clothes ?? 0; c.look = { ...lookOf(w, c), clothes: (was + 1 + Math.floor(hash01(c.id, today(w), 77) * (SHIRTS.length - 1))) % SHIRTS.length }; }
    return ok(`New ${gradeLc(q)} clothes: you feel good in them (for about a month).`);
  }
  (L.goods ??= {}).gadget = { t: w.time, q };
  return ok(`A new ${gradeLc(q)} gadget: a small joy for the next three months.`);
}

/** The best grade of a good someone can buy here within a budget (none if nothing fits). */
function affordable(w: World, market: number, kind: string, budget: number): { key: string; price: number } | null {
  for (let q = 5; q >= 1; q--) {
    const l = listingsFor(w, market, `${kind}:${q}`)[0];
    if (l && l.price <= budget) return { key: `${kind}:${q}`, price: l.price };
  }
  return null;
}

/** The best grade someone already owns. */
const owned = (c: Citizen, kind: string) => [5, 4, 3, 2, 1].map((q) => `${kind}:${q}`).find((k) => (c.inv[k] ?? 0) > 0) ?? null;

/**
 * AI citizens look after themselves as the player can: the unwell take medicine
 * (buying some if they have none), and people with money to spare buy new
 * clothes about once a month and a gadget every few months.
 */
export function goodsDaily(w: World) {
  for (const c of census(w).all) {
    if (c.player || jailed(w, c)) continue;
    const market = controller(w.regions[c.loc]);
    const money = w.nations[market].cur;
    const cash = c.wallet[money] ?? 0;
    const buy = (kind: string, share: number) => {
      const o = affordable(w, market, kind, Math.floor(cash * share));
      if (!o) return null;
      const r = buyBest(w, c.id, cref(c.id), market, o.key, 1, o.price);
      return r.ok ? o.key : null;
    };
    if (healthOf(c) < 60 && lifeOf(c).treated !== today(w)) {
      const k = owned(c, 'medicine') ?? (cash > cur(15) ? buy('medicine', 0.1) : null);
      if (k) useGood(w, c, k);
    }
    const spare = cash - cur(B.living.comfort);
    if (spare <= 0) continue;
    if (chance(w, 1 / 30)) { const k = owned(c, 'clothing') ?? buy('clothing', 0.04); if (k) useGood(w, c, k); }
    if (spare > cur(B.living.comfort) && chance(w, 1 / 90)) { const k = owned(c, 'electronics') ?? buy('electronics', 0.06); if (k) useGood(w, c, k); }
  }
}
