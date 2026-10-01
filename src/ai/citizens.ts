// AI citizen routines. Personas shape priorities; every action goes through the
// same validated action functions the player uses.
import { ageOf } from '../sim/growth';
import type { Citizen, Company, World } from '../sim/types';
import { B } from '../data/balance';
import { hourOf } from '../engine/clock';
import { chance } from '../engine/rng';
import { GOLD, c as cur, g } from '../engine/money';
import { applyJob, netWage, publicWorksShift, quitJob, workShift } from '../sim/company';
import { jobLost } from '../sim/labour';
import { serviceShift } from '../sim/services';
import { companiesIn, companiesOf } from '../sim/census';
import { eat, train } from '../sim/citizen';
import { contributeLabor } from '../sim/construction';
import { restockWeapons } from './military';
import { buyBest, listingsFor } from '../sim/market';
import { buyGold, sellGold, midRate } from '../sim/fx';
import { controller, cref, effEco, maxEnergy, today, jailed } from '../sim/query';

/**
 * Best job the citizen qualifies for, by net wage, preferring work near home:
 * jobs in the home region count in full, next door at 90%, further away at 75%.
 * Beyond the neighbourhood, a sample of the country's openings is considered.
 */
export function bestOffer(w: World, c: Citizen) {
  const nat = controller(w.regions[c.loc]);
  const cur_ = w.nations[nat].cur;
  const eco = effEco(w, c);
  const home = w.regions[c.home];
  const near = new Set<number>([c.home, ...home.links]);
  const open = (co: Company) => w.companies[co.id] && co.offer && co.offer.slots > co.workers.length && controller(w.regions[co.region]) === nat;
  let cands = [...near].flatMap((r) => companiesIn(w, r)).filter(open);
  if (cands.length < 3) {
    const all = companiesOf(w, nat);
    for (let i = 0, k = (c.id * 7919 + today(w)) % Math.max(1, all.length); i < Math.min(40, all.length); i++, k = (k + 37) % all.length) if (open(all[k])) cands.push(all[k]);
  }
  let best: { id: number; net: number } | null = null;
  for (const co of cands) {
    if (co.owner.k === 'cit' && co.owner.id === c.id) continue;
    if (eco < (co.offer?.minEco ?? 0)) continue;
    if ((co.wallet[cur_] ?? 0) < (co.offer?.wage ?? 0) * 2) continue; // avoid employers who can't pay
    const pref = co.region === c.home ? 1 : near.has(co.region) ? 0.9 : 0.75;
    const net = netWage(w, co, c).net * pref;
    if (!best || net > best.net) best = { id: co.id, net };
  }
  return best;
}

function currentNet(w: World, c: Citizen) {
  if (c.job == null) return 0;
  const co = w.companies[c.job];
  if (!co) return 0;
  const pref = co.region === c.home ? 1 : w.regions[c.home].links.includes(co.region) ? 0.9 : 0.75;
  return netWage(w, co, c).net * pref;
}

/** Buy food when stocks are low, choosing the best energy per currency. */
export function restockFood(w: World, c: Citizen, target: number) {
  const nat = controller(w.regions[c.loc]);
  const n = w.nations[nat];
  let have = 0;
  for (let q = 1; q <= 5; q++) have += c.inv[`food:${q}`] ?? 0;
  if (have >= target) return;
  const cash = c.wallet[n.cur] ?? 0;
  const reserve = cur(B.living.perDay * 3);
  if (cash <= reserve) return;
  const opts = [1, 2, 3, 4, 5].map((q) => {
    const l = listingsFor(w, nat, `food:${q}`)[0];
    return l ? { q, per: l.price / B.food.energy[q - 1], price: l.price } : null;
  }).filter(Boolean).sort((a, b) => a!.per - b!.per) as { q: number; price: number }[];
  const o = opts[0];
  if (!o) return;
  const n_ = Math.min(target - have, Math.floor((cash - reserve) / o.price));
  if (n_ > 0) buyBest(w, c.id, cref(c.id), nat, `food:${o.q}`, n_, Math.round(o.price * 1.2));
}

/** Eat the most efficient food until energy is near full or allowance runs out. */
export function eatUp(w: World, c: Citizen, upTo: number) {
  let guard = 0;
  while (c.energy < upTo && c.allowance > 0 && guard++ < 10) {
    let done = false;
    for (let q = 1; q <= 5 && !done; q++) {
      if ((c.inv[`food:${q}`] ?? 0) > 0 && maxEnergy(w, c) - c.energy >= B.food.energy[q - 1] * 0.7) done = eat(w, c, q).ok;
    }
    if (!done) break;
  }
}

export function citizenHourly(w: World, c: Citizen) {
  if (jailed(w, c) || ageOf(w, c) < 16) return; // children are at home and at school, not at work
  const h = hourOf(w.time);
  const d = today(w);
  const home = w.nations[c.nation];

  // Work
  if (h === c.workHour && c.lastWorkDay !== d && c.post) serviceShift(w, c);
  else if (c.business) { /* runs their own business (sim/smallBusiness.ts) */ }
  else if (h === c.workHour && c.lastWorkDay !== d) {
    if (c.job != null) {
      const r = workShift(w, c);
      if (!r.ok && /cannot pay|no longer exists|Out of|storage/.test(r.msg) && chance(w, 0.5)) { const wage = w.companies[c.job]?.offer?.wage ?? 0; quitJob(w, c, true); if (/cannot pay/.test(r.msg)) jobLost(w, c, null, wage); }
    }
    // Job search / switching (weekly-ish, or when unemployed)
    if (c.job == null || (d + c.id) % 7 === 0) {
      const best = bestOffer(w, c);
      const curNet = currentNet(w, c);
      if (best && (c.job == null || best.net > curNet * 1.15)) {
        applyJob(w, c, best.id);
        if (c.lastWorkDay !== d) workShift(w, c);
      }
    }
    if (c.lastWorkDay !== d && c.job == null && c.persona !== 'industrialist' && c.persona !== 'investor') publicWorksShift(w, c);
  }

  // Train (first daily session) — nearly everyone, soldiers always.
  if (h === c.trainHour && c.lastTrainDay !== d && (c.persona === 'soldier' || chance(w, 0.7 * c.traits.activity))) train(w, c);

  // Builders (and some civic-minded others) put labour into the national priority project.
  if (h === (c.trainHour + 2) % 24 && (c.persona === 'builder' || chance(w, 0.12))) {
    const nat = controller(w.regions[c.loc]);
    const pid = w.nations[nat].priorities.project;
    const proj = pid != null ? w.projects[pid] : undefined;
    if (proj && !proj.done && c.energy >= 40) contributeLabor(w, c, proj.id, c.persona === 'builder' ? 3 : 1);
  }

  // Evening shopping.
  if (h === 18) {
    const target = c.persona === 'soldier' ? 12 : 4;
    restockFood(w, c, target);
    restockWeapons(w, c);
  }

  // Portfolio: savers keep roughly half their wealth in gold; others cash out gold above a small float.
  if (h === 20 && (d + c.id) % 3 === 0) {
    const cash = c.wallet[home.cur] ?? 0;
    const gold = c.wallet[GOLD] ?? 0;
    const rate = home.fxAnchor || midRate(w, home.cur);
    const saver = c.persona === 'investor' || c.persona === 'industrialist' || c.persona === 'merchant';
    const goldVal = (gold * rate) / 1000;
    const share = goldVal / Math.max(1, goldVal + cash);
    if (saver) {
      if (share < 0.4 && cash > cur(250)) buyGold(w, c.id, cref(c.id), home.cur, Math.floor(((cash - cur(200)) * 1000) / rate / 4), Math.round(rate * 1.04));
      else if (share > 0.6 && gold > g(2)) sellGold(w, c.id, cref(c.id), home.cur, Math.floor(gold / 5), Math.round(rate * 0.96));
    } else if (gold > g(4) || (cash < cur(15) && gold > g(0.5))) {
      sellGold(w, c.id, cref(c.id), home.cur, Math.max(g(0.5), gold - g(3)), Math.round(rate * 0.95));
    }
  }
}
