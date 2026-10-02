// Personal wellbeing: happiness and stress. Both drift each day toward what a
// person's life actually looks like (love, family, friends, work, money,
// health, loss, prison, war at home), so one bad day does not ruin anyone but a
// hard season does. The main reasons are kept so the player can see why.
// Deterministic: no dice are rolled here.
import type { Citizen, World } from './types';
import { B } from '../data/balance';
import { DAY } from '../engine/clock';
import { fail, ok, type Result } from '../engine/result';
import { census } from './census';
import { jailed, maxEnergy, player, today } from './query';
import { c as cur } from '../engine/money';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { adjustRel } from './social';
import { petComfort } from './kinship';
import { SIZES } from './housing';
import { incomeOf, loansOf } from './loans';
import { hasQuirk } from './nature';
import { griefOf } from './mentalHealth';

type Part = [string, number];

function parts(w: World, c: Citizen, friends: number): { happy: Part[]; stress: Part[] } {
  const happy: Part[] = [], stress: Part[] = [];
  const L = lifeOf(c);
  const f = c.family;
  const age = ageOf(w, c);
  const adult = age >= B.life.adultAge;
  const partner = f?.partner != null ? w.citizens[f.partner] : null;
  if (f && partner && !partner.gone) {
    happy.push([f.status === 'married' ? 'married life' : f.status === 'engaged' ? 'engaged' : 'in love', f.status === 'married' ? 10 : f.status === 'engaged' ? 8 : 5]);
    if ((partner.rel[c.id] ?? 0) < 20) { happy.push(['trouble with your partner', -8]); stress.push(['trouble with your partner', 15]); }
  }
  const kids = (f?.kids.length ?? 0) + (f?.children.length ?? 0);
  if (hasQuirk(c, 'worrier')) stress.push(['a worrier by nature', 6]);
  if (hasQuirk(c, 'workaholic') && c.job != null) stress.push(['always working', 3]);
  if (kids) { happy.push(['your children', Math.min(9, kids * 3)]); stress.push(['raising children', Math.min(12, (f?.kids.length ?? 0) * 4)]); }
  if (friends) happy.push(['friends', Math.min(6, friends)]);
  else if (adult) happy.push(['loneliness', -4]);
  if (adult && age < B.life.retireAge + 5) {
    if (c.job != null) { happy.push(['a job', 4]); stress.push(['work', 10]); }
    else if (c.retired) happy.push(['retirement', 2]);
    else if (c.persona !== 'industrialist' && c.persona !== 'investor') { happy.push(['no work', -10]); stress.push(['looking for work', 10]); }
  }
  const n = w.nations[c.nation];
  if (n.president === c.id || Object.values(n.cabinet).includes(c.id)) stress.push(['public office', 12]);
  if (c.mil.branch) stress.push(['military service', 5]);
  const cash = c.wallet[n.cur] ?? 0;
  if (adult) {
    if (cash < cur(20)) { happy.push(['money worries', -10]); stress.push(['money worries', 15]); }
    else if (cash < cur(B.living.comfort)) happy.push(['tight budget', -3]);
    else if (cash > cur(B.living.comfort * 3)) happy.push(['financial security', 5]);
  }
  const h = c.health ?? 90;
  happy.push(['health', Math.max(-15, Math.min(8, (h - 70) / 3))]);
  if (h < 50) stress.push(['poor health', 10]);
  const grief = griefOf(w, c);
  if (grief >= 0.5) { happy.push(['grief', -grief]); stress.push(['grief', grief / 2]); }
  for (const x of c.conditions ?? []) {
    if (x.key === 'depression') happy.push(['depression', -4 - x.sev * 4]);
    else if (x.key === 'anxiety') stress.push(['anxiety', 3 + x.sev * 3]);
    else if (x.key === 'burnout') { happy.push(['burnout', -5]); stress.push(['burnout', 8]); }
  }
  if (jailed(w, c)) { happy.push(['prison', -25]); stress.push(['prison', 30]); }
  happy.push(['how the country is run', c.mood * 0.3]);
  const r = w.regions[c.home];
  if (r.occ || r.disrupted > w.time) { happy.push(['war at home', -8]); stress.push(['war at home', 10]); }
  const d = today(w);
  if (L.lastRest != null && d - L.lastRest <= 1) { happy.push(['rest', 2]); stress.push(['rest', -8]); }
  if (L.lastFamily != null && d - L.lastFamily <= 1) { happy.push(['time with family', 5]); stress.push(['time with family', -3]); }
  const home = c.dwelling;
  if (home) {
    const comfort = SIZES[home.size].comfort + (home.kind === 'own' ? 2 : 0);
    if (comfort) happy.push([home.kind === 'own' ? 'a home of your own' : SIZES[home.size].label.toLowerCase(), comfort]);
    if (home.kind === 'family' && ageOf(w, c) >= 28) { happy.push(['still living with family', -2]); stress.push(['still living with family', 2]); }
  }
  const loans = loansOf(w, c);
  if (loans.some((l) => l.missed > 0)) stress.push(['payments in arrears', 10]);
  else if (loans.length) { const share = loans.reduce((t, l) => t + l.payment, 0) / Math.max(1, incomeOf(w, c)); if (share > 0.25) stress.push(['heavy debt repayments', Math.min(8, Math.round(share * 12))]); }
  const pet = petComfort(w, c);
  if (pet >= 30) { happy.push(['a pet at home', pet >= 70 ? 4 : 2]); stress.push(['a pet at home', -3]); }
  const g = L.goods;
  if (g?.clothes && w.time - g.clothes.t < B.goods.clothesDays * DAY) happy.push(['new clothes', B.goods.clothes[g.clothes.q - 1]]);
  if (g?.gadget && w.time - g.gadget.t < B.goods.gadgetDays * DAY) happy.push(['a new gadget', B.goods.gadget[g.gadget.q - 1]]);
  const hobbies = L.lastHobby != null && d - L.lastHobby <= 7 ? Object.values(L.hobbies).filter((v) => v >= 10).length : 0; // kept up this week
  if (hobbies) { happy.push(['hobbies', Math.min(6, hobbies * 2)]); stress.push(['hobbies', -Math.min(9, hobbies * 3)]); }
  return { happy, stress };
}

const clamp = (x: number) => Math.max(0, Math.min(100, x));

/** Daily: everyone's happiness and stress move toward what their life is like. */
export function wellbeingDaily(w: World) {
  const p = player(w);
  let playerFriends = 0;
  for (const c of census(w).all) if (!c.player && (c.rel[p.id] ?? 0) >= 50) playerFriends++;
  for (const c of census(w).all) {
    const friends = c.player ? playerFriends : Object.values(c.rel).filter((v) => v >= 50).length;
    const { happy, stress } = parts(w, c, friends);
    const L = lifeOf(c);
    const ht = clamp(46 + happy.reduce((t, [, v]) => t + v, 0) - L.stress / 5);
    const st = clamp(15 + stress.reduce((t, [, v]) => t + v, 0));
    L.happiness = Math.round((L.happiness + (ht - L.happiness) * 0.08) * 10) / 10;
    L.stress = Math.round((L.stress + (st - L.stress) * 0.08) * 10) / 10;
    if (L.grief) L.grief = L.grief < 0.5 ? 0 : Math.round(L.grief * 0.9 * 10) / 10;
    if (c.player) {
      const top = (xs: Part[]) => xs.filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4).map(([k, v]) => `${v > 0 ? '+' : '−'} ${k}`);
      L.why = { happiness: top(happy), stress: top(stress) };
    }
  }
}

export function wellbeingLabel(v: number, kind: 'happiness' | 'stress') {
  if (kind === 'happiness') return v >= 80 ? 'thriving' : v >= 60 ? 'content' : v >= 40 ? 'getting by' : v >= 20 ? 'unhappy' : 'miserable';
  return v >= 80 ? 'overwhelmed' : v >= 60 ? 'strained' : v >= 35 ? 'busy' : 'calm';
}

// ---------- everyday activities ----------

export function restCheck(w: World, c: Citizen): string | null {
  if (c.gone) return 'No longer living.';
  if (lifeOf(c).lastRest === today(w)) return 'You already took time to rest today.';
  return null;
}

/** An evening off: less stress, a little happier. */
export function rest(w: World, c: Citizen = player(w)): Result {
  const why = restCheck(w, c);
  if (why) return fail(why);
  const L = lifeOf(c);
  L.lastRest = today(w);
  L.stress = clamp(L.stress - 2); // the lasting benefit comes through the daily balance (see parts)
  L.happiness = clamp(L.happiness + 0.5);
  c.energy = Math.min(c.energy + 5, maxEnergy(w, c));
  return ok(`You took the evening off. Stress ${Math.round(L.stress)}.`);
}

/** Family members close enough to spend time with. */
export function familyAround(w: World, c: Citizen): Citizen[] {
  const f = c.family;
  if (!f) return [];
  const ids = [f.partner, ...f.parents, ...f.children].filter((x): x is number => x != null);
  return ids.map((id) => w.citizens[id]).filter((x) => x && !x.gone && x.loc === c.loc);
}

export function familyTimeCheck(w: World, c: Citizen): string | null {
  if (c.gone) return 'No longer living.';
  if (jailed(w, c)) return 'You are in prison: family can visit on Sundays.';
  if (lifeOf(c).lastFamily === today(w)) return 'You already spent time with family today.';
  if (!familyAround(w, c).length && !c.family?.kids.length) return 'None of your family is nearby.';
  if (c.energy < 5) return 'Needs 5 energy.';
  return null;
}

/** Time with the people at home: closer bonds, a happier and calmer life. */
export function familyTime(w: World, c: Citizen = player(w)): Result {
  const why = familyTimeCheck(w, c);
  if (why) return fail(why);
  const L = lifeOf(c);
  L.lastFamily = today(w);
  c.energy -= 5;
  const who = familyAround(w, c);
  for (const x of who) { adjustRel(x, c.id, 3); adjustRel(c, x.id, 2); }
  if (c.family) c.family.lastDate = Math.max(c.family.lastDate ?? 0, w.time - DAY / 2);
  const partner = c.family?.partner != null ? w.citizens[c.family.partner] : null;
  if (partner && who.includes(partner)) partner.family!.lastDate = c.family!.lastDate;
  L.happiness = clamp(L.happiness + 1);
  L.stress = clamp(L.stress - 1);
  const names = [...who.map((x) => x.name.split(' ')[0]), ...(c.family?.kids ?? []).map((k) => k.name.split(' ')[0])];
  return ok(`An evening with ${names.slice(0, 4).join(', ')}${names.length > 4 ? ' and the rest of the family' : ''}.`);
}
