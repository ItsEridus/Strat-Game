// Cars (2.8 Life 2.0: the everyday): buying, running and crashing them.
// - Buying: a used runabout, a new family car, a premium car or an electric one, at prices that
//   differ by country (import duties make cars dear in Brazil, Argentina and Turkey; cars are
//   cheap in India and China). Cars lose about 15% of their value a year; sell at what they are worth.
// - Running: fuel at the pump (from about 60 US cents a litre in Saudi Arabia and Russia to nearly
//   $2 in Germany and Britain, rising and falling with the world oil price), or charging for an
//   electric car (much cheaper per kilometre), plus insurance and upkeep, every month; more for
//   long commutes.
// - Accidents: the risk of a crash follows the country's road safety (WHO road deaths per 100,000:
//   about 3 in Britain, Germany and Japan, 13 in the United States, over 20 in South Africa), and
//   the driver: young drivers, drink, little sleep and a taste for risk. Most crashes cost money;
//   some injure; a few kill.
// - Everyone else drives too: people own cars as often as in their country, pay to run them and
//   have accidents.
import type { Citizen, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify } from '../engine/events';
import { chance, hash01 } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { dataIso } from '../data/isoAlias';
import { census } from './census';
import { cref, hhref, jailed, natref, player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { injure } from './health';
import { die } from './population';
import { worldPriceRatio } from './trade';
import { active } from './habits';
import { hasCar, reachOf, sleepOf, type Car } from './everyday';

export interface CarModel { tier: number; name: string; icon: string; usd: number; electric?: boolean }
export const MODELS: CarModel[] = [
  { tier: 1, name: 'A used runabout', icon: '🚙', usd: 8000 },
  { tier: 2, name: 'A new family car', icon: '🚗', usd: 25000 },
  { tier: 3, name: 'A premium saloon', icon: '🏎️', usd: 55000 },
  { tier: 4, name: 'An electric car', icon: '🔋', usd: 38000, electric: true },
];
/** 2025: what cars cost against the US (duties and local makers), petrol per litre (US$), road deaths per 100,000. */
const ROADS_2025: Record<string, [number, number, number]> = {
  USA: [1, 0.9, 12.8], CAN: [1.05, 1.2, 5.3], MEX: [1, 1.2, 13], BRA: [1.5, 1.2, 16], ARG: [1.6, 1.1, 14], GBR: [1.1, 1.8, 2.9],
  DEU: [1, 1.9, 3.3], RUS: [1.2, 0.65, 12], TUR: [1.8, 1.4, 7.5], SAU: [0.9, 0.6, 18], ZAF: [1.1, 1.3, 22], IND: [0.6, 1.2, 15.6],
  CHN: [0.8, 1.1, 17], JPN: [0.9, 1.2, 2.6], KOR: [0.9, 1.3, 6.5], AUS: [1.1, 1.3, 4.5],
};
const roads = (w: World, nation: number) => { const d = ROADS_2025[dataIso(w.nations[nation].iso)] ?? [1, 1.1, 12]; return { price: d[0], petrol: d[1], deaths: d[2] }; };

/** What a model costs new in a country (local money). */
export const carPrice = (w: World, nation: number, m: CarModel) => Math.round((cur(m.usd) / 10) * roads(w, nation).price);
/** What a car is worth now (about 15% less each year). */
export const carValue = (w: World, car: Car) => Math.round(car.price * Math.pow(0.85, (w.time - car.bought) / (365 * DAY)));

/** Kilometres a month: the commute plus everything else. */
function kmMonth(w: World, c: Citizen): number {
  const r = reachOf(w, c);
  return 500 + (r === 'local' ? 400 : r === 'near' ? 1200 : r === 'far' ? 2500 : 0);
}
/** A month of running a car: fuel or charging, insurance and upkeep (local money). */
export function runningCost(w: World, c: Citizen, car?: Car | null): number {
  const rd = roads(w, c.nation);
  const electric = car ? MODELS.find((m) => m.tier === car.tier)?.electric : false;
  const km = kmMonth(w, c);
  const pump = (cur(rd.petrol) / 10) * (0.45 + 0.55 * worldPriceRatio(w, 'oil')); // taxes cushion the world price
  const energy = electric ? km * 0.18 * pump * 0.3 : km * 0.07 * pump; // about a third of the cost a kilometre on electricity
  const price = car?.price ?? carPrice(w, c.nation, MODELS[1]) * 0.6;
  return Math.round(energy + price * 0.06 / 12);
}

/** How likely a driver is to crash this month (any crash; injuries and deaths are a share of these). */
export function crashRisk(w: World, c: Citizen): number {
  const base = roads(w, c.nation).deaths / 12.8 * 0.05 / 12; // about one driver in twenty crashes a year in the United States
  const age = ageOf(w, c);
  return base * (age < 25 ? 2 : age > 75 ? 1.5 : 1) * (active(c, 'drinking') >= 50 ? 3 : 1) * (sleepOf(w, c).hours < 6 ? 1.5 : 1) * (0.6 + c.traits.risk * 0.8) * (reachOf(w, c) === 'far' ? 1.5 : 1);
}

function crash(w: World, c: Citizen) {
  const n = w.nations[c.nation];
  const deaths = roads(w, c.nation).deaths;
  const r = hash01(c.id, Math.floor(w.time / DAY), 3101);
  const fatal = r < deaths / 12.8 * 0.004; // a few in a thousand crashes kill (more where roads are deadly)
  const hurt = !fatal && r < 0.15;
  const damage = Math.round(carPrice(w, c.nation, MODELS[1]) * (0.02 + hash01(c.id, Math.floor(w.time / DAY), 3102) * 0.08));
  const paid = Math.min(damage, Math.floor((c.wallet[n.cur] ?? 0) * 0.3));
  if (paid > 0) pay(w, cref(c.id), hhref(n.id), n.cur, paid, 'Car repairs (accident)');
  if (fatal && !c.player) { die(w, c, 'in a road accident'); return; }
  if (hurt || (fatal && c.player)) injure(w, c);
  if (c.player) {
    lifeOf(c).stress = Math.min(100, lifeOf(c).stress + 15);
    notify(w, 'personal', `💥 ${hurt || fatal ? 'A bad crash: you are hurt and the car is damaged' : 'A crash: nobody is hurt, but the car needs repairs'}${paid ? ` (${fmtAmt(n.cur, paid)})` : ''}.`, { critical: hurt || fatal, link: 'life' });
  }
}

/** A month on the roads: running costs and accidents for every driver. */
export function carsMonth(w: World) {
  for (const c of census(w).all) {
    if (c.gone || jailed(w, c) || ageOf(w, c) < 18 || !hasCar(w, c)) continue;
    const n = w.nations[c.nation];
    const cost = runningCost(w, c, c.car);
    const amt = Math.min(cost, Math.floor((c.wallet[n.cur] ?? 0) * 0.25));
    if (amt > 0) {
      const duty = Math.round(amt * 0.3); // fuel duty and insurance tax
      pay(w, cref(c.id), natref(n.id), n.cur, duty, 'Fuel duty');
      pay(w, cref(c.id), hhref(n.id), n.cur, amt - duty, 'Running a car');
    }
    if (chance(w, crashRisk(w, c))) crash(w, c);
  }
}
export function carsDaily(w: World) {
  if (dateAt(w.time).day === 1) carsMonth(w);
}

// ---------- the player ----------

export function buyCarCheck(w: World, c: Citizen, tier: number): string | null {
  const m = MODELS.find((x) => x.tier === tier);
  if (!m) return 'No such car.';
  if (ageOf(w, c) < 18) return 'You are too young to drive.';
  const n = w.nations[c.nation];
  const trade = c.car ? carValue(w, c.car) : 0;
  const price = carPrice(w, c.nation, m);
  if ((c.wallet[n.cur] ?? 0) + trade < price) return `It costs ${fmtAmt(n.cur, price)}${trade ? ` (your car is worth ${fmtAmt(n.cur, trade)} in part-exchange)` : ''}.`;
  return null;
}
/** Buy a car (your old one goes in part-exchange). */
export function buyCar(w: World, tier: number, c: Citizen = player(w)): Result {
  const why = buyCarCheck(w, c, tier);
  if (why) return fail(why);
  const m = MODELS.find((x) => x.tier === tier)!;
  const n = w.nations[c.nation];
  const price = carPrice(w, c.nation, m);
  const trade = c.car ? carValue(w, c.car) : 0;
  if (trade) pay(w, hhref(n.id), cref(c.id), n.cur, Math.min(trade, w.households[n.id]?.wallet[n.cur] ?? 0), 'Part-exchange');
  pay(w, cref(c.id), hhref(n.id), n.cur, price, `Bought ${m.name.toLowerCase()}`);
  c.car = { model: m.name, bought: w.time, price, value: price, tier };
  return ok(`${m.icon} ${m.name}, yours for ${fmtAmt(n.cur, price)}. Running it costs about ${fmtAmt(n.cur, runningCost(w, c, c.car))} a month.`);
}
export function sellCar(w: World, c: Citizen = player(w)): Result {
  if (!c.car) return fail('You have no car.');
  const n = w.nations[c.nation];
  const v = carValue(w, c.car);
  const got = Math.min(v, w.households[n.id]?.wallet[n.cur] ?? 0);
  if (got > 0) pay(w, hhref(n.id), cref(c.id), n.cur, got, 'Sold a car');
  c.car = null;
  if (c.commute === 'car') delete c.commute;
  return ok(`Sold for ${fmtAmt(n.cur, got)}.`);
}
