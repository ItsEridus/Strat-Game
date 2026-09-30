// Travel and citizenship. Location (where you are) and citizenship (who you
// belong to) are separate. Travel shows methods, ticket use and energy first.
import type { Citizen, Id, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { burn, consume } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { notify, record, sendMsg } from '../engine/events';
import { controller, cref, player, studyActive } from './query';
import { bump } from './progress';
import { authorize } from './authority';
import { leaveParty } from './politics';

export function distance(w: World, from: Id, to: Id): number {
  if (from === to) return 0;
  const seen = new Map<Id, number>([[from, 0]]);
  const q = [from];
  while (q.length) {
    const id = q.shift()!;
    for (const l of w.regions[id].links) if (!seen.has(l)) {
      seen.set(l, seen.get(id)! + 1);
      if (l === to) return seen.get(l)!;
      q.push(l);
    }
  }
  return Infinity;
}

export interface TravelOption { id: string; label: string; ticket: string | null; energy: number; why: string | null }

export function travelOptions(w: World, c: Citizen, dest: Id): TravelOption[] {
  const d = distance(w, c.loc, dest);
  const light = studyActive(w, c, 'packinglight') ? 0.75 : 1;
  const opts: TravelOption[] = [];
  const base = c.mining ? 'Travel is blocked while mining.' : c.loc === dest ? 'You are already here.' : null;
  if (d === 1) {
    const e = Math.round(B.travel.walkEnergy * light);
    opts.push({ id: 'walk', label: 'Walk (neighbouring region)', ticket: null, energy: e, why: base ?? (c.energy < e ? `Needs ${e} energy.` : null) });
  }
  for (let q = 1; q <= 5; q++) {
    const range = B.travel.ticketRange[q - 1];
    const e = Math.round(B.travel.energyPerHop * d * (1 - B.travel.qualityDiscount * (q - 1)) * light);
    const key = `ticket:${q}`;
    const why = base ?? (d > range ? `Q${q} tickets reach ${range} region${range > 1 ? 's' : ''} (this trip is ${d}).` : (c.inv[key] ?? 0) < 1 ? `You have no Q${q} tickets.` : c.energy < e ? `Needs ${e} energy.` : null);
    opts.push({ id: `t${q}`, label: `Q${q} ticket (range ${range})`, ticket: key, energy: e, why });
  }
  return opts;
}

export function travel(w: World, c: Citizen, dest: Id, method: string): Result {
  const opt = travelOptions(w, c, dest).find((o) => o.id === method);
  if (!opt) return fail('That travel method is not available for this trip.');
  if (opt.why) return fail(opt.why);
  c.energy -= opt.energy;
  if (opt.ticket) consume(w, cref(c.id), opt.ticket, 1, 'travel');
  const from = w.regions[c.loc].name;
  c.loc = dest;
  if (c.player) bump(w, 'travel');
  return ok(`Travelled from ${from} to ${w.regions[dest].name} (${opt.energy} energy${opt.ticket ? ', 1 ticket' : ''}).`);
}

// ---------- citizenship ----------
export function citizenshipCheck(w: World, c: Citizen, nation: Id): string | null {
  const n = w.nations[nation];
  if (!n) return 'Unknown nation.';
  if (c.nation === nation) return 'You are already a citizen.';
  if (n.requests.some((r) => r.cit === c.id)) return 'Application already pending.';
  if (controller(w.regions[c.loc]) !== nation) return `You must be located in ${n.name} to apply.`;
  if ((c.wallet[GOLD] ?? 0) < g(B.citizenship.cost)) return `The application fee is ${B.citizenship.cost} gold.`;
  return null;
}

export function applyCitizenship(w: World, c: Citizen, nation: Id): Result {
  const why = citizenshipCheck(w, c, nation);
  if (why) return fail(why);
  burn(w, cref(c.id), GOLD, g(B.citizenship.cost), 'Citizenship application fee');
  const n = w.nations[nation];
  n.requests.push({ cit: c.id, t: w.time });
  const official = n.cabinet.recruitment ?? n.president;
  const pl = player(w);
  if (official === pl.id && !c.player) {
    sendMsg(w, { from: c.id, subject: `Citizenship application: ${c.name}`, body: `${c.name} (${w.nations[c.nation].name}, level ${c.level}, ${c.persona}) asks to become a citizen of ${n.name}.`, kind: 'gov', options: [{ id: 'approve', label: 'Approve' }, { id: 'deny', label: 'Deny' }], payload: { handler: 'citizenship', nation, cit: c.id } });
  }
  return ok(`Application submitted to ${n.name}. The recruitment minister will decide.`);
}

export function decideCitizenship(w: World, actor: Id, nation: Id, cit: Id, approve: boolean): Result {
  const n = w.nations[nation];
  if (authorize(w, actor, { k: 'nat', id: nation }, 'recruit')) return fail('Only the recruitment minister or president decides citizenship.');
  const req = n.requests.find((r) => r.cit === cit);
  if (!req) return fail('No such application.');
  n.requests = n.requests.filter((r) => r !== req);
  const c = w.citizens[cit];
  if (!approve) {
    if (c.player) notify(w, 'personal', `${n.name} rejected your citizenship application.`, { critical: true });
    return ok(`Application from ${c.name} denied.`);
  }
  changeCitizenship(w, c, nation);
  return ok(`${c.name} is now a citizen of ${n.name}.`);
}

function changeCitizenship(w: World, c: Citizen, nation: Id) {
  const old = w.nations[c.nation];
  if (c.party != null) leaveParty(w, c);
  old.deputies = old.deputies.filter((x) => x !== c.id);
  for (const [k, v] of Object.entries(old.cabinet)) if (v === c.id) delete (old.cabinet as any)[k];
  if (old.president === c.id) old.president = old.cabinet.vp ?? null;
  c.nation = nation;
  c.influence = Math.round(c.influence / 2);
  record(w, 'citizenship', `${c.name} left ${old.name} to become a citizen of ${w.nations[nation].name}.`, { cit: c.id, nation, player: c.player });
  if (c.player) notify(w, 'personal', `🛂 You are now a citizen of ${w.nations[nation].name}.`, { critical: true });
}

/** AI recruitment ministers decide pending applications. */
export function aiCitizenshipDecisions(w: World) {
  const pl = player(w);
  for (const n of w.nations) {
    const official = n.cabinet.recruitment ?? n.president;
    if (official == null || official === pl.id) continue;
    for (const r of n.requests.slice()) {
      if (w.time - r.t < 6 * 60) continue;
      const c = w.citizens[r.cit];
      if (!c) { n.requests = n.requests.filter((x) => x !== r); continue; }
      const hostile = (n.relations[c.nation]?.score ?? 0) < -30;
      const atWar = Object.values(w.wars).some((x) => x.status === 'active' && ((x.att === n.id && x.def === c.nation) || (x.def === n.id && x.att === c.nation)));
      decideCitizenship(w, official, n.id, c.id, !hostile && !atWar);
    }
  }
}
