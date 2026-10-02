// Automation and society (2.4 Frontiers). Robotics, AI agents, humanoid robots and (one
// day) human-level AI let machines do a growing share of routine work (techFx automation).
// - Firms automate: each month some firms replace a worker in a routine job with a machine.
//   The machine is bought (from the domestic economy) and from then on does that worker's
//   share of the output, so the firm makes as much with fewer people: wages fall, profits
//   (and the owners' wealth) rise. How exposed a job is depends on its family: office,
//   transport, retail and factory work most; care, trades, teaching and science least
//   (after Frey & Osborne and the OECD's estimates of task automation).
// - Some jobs are created: firms in electronics and medicine take on more people as
//   automation spreads.
// - Society responds: displaced workers are unhappy and look for work or retrain; when
//   automation displaces many people the public turns against it, and a government under
//   pressure may tax automation, which makes it dearer (the tax goes to the treasury).
// - Your own firms automate only when you choose (Companies screen).
import type { Citizen, Company, Id, Nation, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { pay } from '../engine/ledger';
import { fail, ok, type Result } from '../engine/result';
import { fmtAmt } from '../engine/money';
import { OCCUPATIONS, type Family } from '../data/occupations';
import { B } from '../data/balance';
import { techFx } from './technology';
import { historyPace } from './strategic';
import { occupationOf, jobLost } from './labour';
import { endWork } from './services';
import { companyCurrency, controller, coref, cref, hhref, natref, player } from './query';
import { authorize } from './authority';
import { leaderProfile } from './relations';
import { lifeOf } from './lifecycle';

/** How much of each kind of work machines can take over (0–1). */
export const EXPOSURE: Record<Family, number> = {
  office: 0.65, transport: 0.6, retail: 0.5, manufacturing: 0.55, finance: 0.45, extraction: 0.35, agriculture: 0.35,
  it: 0.3, public: 0.3, arts: 0.2, trades: 0.15, security: 0.12, health: 0.1, education: 0.1, science: 0.08,
};
export const exposureOf = (w: World, c: Citizen) => { const k = occupationOf(w, c); return k && OCCUPATIONS[k] ? EXPOSURE[OCCUPATIONS[k].family] : 0; };

/** Output multiplier from a firm's machines: each does a worker's share, but machines need people to run them. */
export function machineFactor(co: Company): number {
  const m = co.machines ?? 0;
  if (!m) return 1;
  const people = Math.max(1, co.workers.length);
  return 1 + Math.min(m, people * 2) / people;
}
/** What a machine costs up front (leased or financed): about eight days of the job's wage, doubled under a robot tax. */
export function machineCost(w: World, co: Company): number {
  const n = w.nations[controller(w.regions[co.region])];
  const wage = co.offer?.wage ?? n.minWage;
  return wage * 8 * (n.robotTax ? 2 : 1);
}

/** Replace one worker with a machine. Returns the displaced worker. */
function automateOne(w: World, co: Company, c: Citizen): boolean {
  const n = w.nations[controller(w.regions[co.region])];
  const code = companyCurrency(w, co);
  const cost = machineCost(w, co);
  // The firm pays; if it is short, its owner invests.
  const owner = co.owner.k === 'cit' ? w.citizens[co.owner.id] : null;
  const payer = (co.wallet[code] ?? 0) >= cost ? coref(co.id) : owner && !owner.player && (owner.wallet[code] ?? 0) >= cost ? cref(owner.id) : null;
  if (!payer) return false;
  const half = n.robotTax ? Math.floor(cost / 2) : 0;
  if (!pay(w, payer, hhref(n.id), code, cost - half, 'Machinery (automation)')) return false;
  if (half > 0) pay(w, payer, natref(n.id), code, half, 'Robot tax');
  co.machines = (co.machines ?? 0) + 1;
  co.workers = co.workers.filter((x) => x !== c.id);
  if (co.offer) co.offer.slots = Math.max(co.workers.length, co.offer.slots - 1);
  c.job = null;
  endWork(w, c, 'replaced by automation');
  jobLost(w, c, co, co.offer?.wage ?? n.minWage);
  c.flags.displaced = w.time;
  c.mood = Math.max(-1, c.mood - 0.3);
  if (c.life) lifeOf(c).stress = Math.min(100, lifeOf(c).stress + 15);
  n.displaced = (n.displaced ?? 0) + 1;
  if (c.player) notify(w, 'economy', `🤖 ${co.name} replaced your job with a machine. You were made redundant; retraining or a new trade may be the way forward.`, { critical: true, link: 'jobs' });
  return true;
}

/** The player automates a position in a firm they run. */
export function automateCheck(w: World, actor: Id, coId: Id): string | null {
  const co = w.companies[coId];
  if (!co) return 'Company not found.';
  if (authorize(w, actor, coref(coId), 'manage')) return 'You do not run this company.';
  const n = w.nations[controller(w.regions[co.region])];
  if (techFx(n).automation <= 0) return `${n.name} does not yet have the technology (advanced robotics or AI agents).`;
  const target = co.workers.map((id) => w.citizens[id]).filter((c) => c && !c.player && exposureOf(w, c) >= 0.3);
  if (!target.length) return 'No worker here does work a machine can take over.';
  if ((co.machines ?? 0) >= co.workers.length * 2) return 'Machines need people to run them: no more than two per worker.';
  if ((co.wallet[companyCurrency(w, co)] ?? 0) < machineCost(w, co)) return `Needs ${fmtAmt(companyCurrency(w, co), Math.round(machineCost(w, co)))} in the company account.`;
  return null;
}
export function automate(w: World, actor: Id, coId: Id): Result {
  const why = automateCheck(w, actor, coId);
  if (why) return fail(why);
  const co = w.companies[coId];
  const c = co.workers.map((id) => w.citizens[id]).filter((x) => x && !x.player && exposureOf(w, x) >= 0.3).sort((a, b) => exposureOf(w, b) - exposureOf(w, a) || a.id - b.id)[0];
  return automateOne(w, co, c) ? ok(`A machine now does ${c.name}'s work; ${c.name} was made redundant.`) : fail('The purchase did not go through.');
}

/** One month of automation (exported for tests). */
export function automationMonth(w: World) {
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile || n.dissolved != null) continue;
    const reach = techFx(n).automation;
    if (reach <= 0) continue;
    // Adoption follows the technology over years; a robot tax slows it.
    n.automated = n.automated ?? 0;
    const step = Math.max(0, reach - n.automated) * 0.04 * (n.robotTax ? 0.5 : 1);
    n.automated = Math.min(reach, n.automated + step);
    let displaced = 0;
    for (const co of Object.values(w.companies)) {
      if (controller(w.regions[co.region]) !== n.id || !co.workers.length) continue;
      if (co.owner.k === 'cit' && co.owner.id === pl.id) continue; // the player's own firms automate only by choice
      for (const id of co.workers.slice()) {
        const c = w.citizens[id];
        if (!c || (co.machines ?? 0) >= co.workers.length * 2) break;
        if (chance(w, step * exposureOf(w, c) * 2) && automateOne(w, co, c)) displaced++;
      }
    }
    // New work: electronics and medicine grow with automation.
    if (displaced >= 3) {
      const grow = Object.values(w.companies).filter((co) => controller(w.regions[co.region]) === n.id && (co.industry === 'electronics' || co.industry === 'medicine') && co.offer && co.offer.slots < B.company.maxWorkers[co.q - 1]);
      for (const co of grow.slice(0, Math.floor(displaced / 3))) co.offer!.slots++;
    }
    // Backlash: many displaced, an unhappy public; a government under pressure taxes automation.
    n.backlash = Math.max(0, Math.min(100, (n.backlash ?? 0) * 0.9 + displaced * 2));
    if ((n.backlash ?? 0) > 20) n.approval = Math.max(5, n.approval - (n.backlash ?? 0) / 40);
    if (!n.robotTax && (n.backlash ?? 0) > 35 && n.approval < 50 && n.president !== pl.id && chance(w, 0.1 + (1 - leaderProfile(w, n).risk) * 0.1)) {
      n.robotTax = w.time;
      const text = `🤖 ${n.name} introduced a tax on automation after a wave of job losses: machines now cost firms twice as much, and half goes to the treasury.`;
      record(w, 'politics', text, { nation: n.id, important: true });
      (n.chronicle ??= []).push({ t: w.time, text });
      if (pl.nation === n.id) notify(w, 'politics', text);
    } else if (n.robotTax && (n.backlash ?? 0) < 5 && w.time - n.robotTax > 3 * 365 * DAY && chance(w, 0.03)) {
      delete n.robotTax;
      record(w, 'politics', `🤖 ${n.name} repealed its tax on automation.`, { nation: n.id });
    }
  }
}

export function automationDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) automationMonth(w);
}

/** Robot tax for the player's government (proposals come later): shown in the UI. */
export const robotTaxOn = (n: Nation) => n.robotTax != null;
