// What outlives a person: wills, inheritance tax, trusts for children still
// growing up, heirlooms, and (for the player) succession. When the player dies
// the story continues as their heir, and the life just ended joins the family's
// legacy archive.
import { dynastyOf, noteDeath, noteSuccession } from './dynasty';
import type { Citizen, Id, Kid, World } from './types';
import { pay } from '../engine/ledger';
import { fmtAmt } from '../engine/money';
import { nid, notify, record } from '../engine/events';
import { fail, ok, type Result } from '../engine/result';
import { census, invalidateCensus } from './census';
import { cref, hhref, natref, player } from './query';
import { ageOf } from './growth';
import { lifeOf } from './lifecycle';
import { siblingsOf } from './kinship';
import { settleHome } from './housing';

export interface Will { shares: { id: Id; share: number }[]; kids: number; written: number } // shares of the money (0..1) to named people; `kids`: share held in trust for the children still at home
export interface Trust { id: Id; kid: string; born: number; cur: string; amount: number; from: string }
export interface Heirloom { name: string; origin: string; t: number }
export interface LegacyEntry { id: Id; name: string; born: number; died: number; age: number; cause: string; milestones: string[]; wealth: number; cur: string; heir?: string }

/** Inheritance tax by country: rate above a tax-free amount (game money; simplified from national rules). */
const ESTATE_TAX: Record<string, { rate: number; free: number }> = {
  USA: { rate: 0.4, free: 50000 }, GBR: { rate: 0.4, free: 5000 }, DEU: { rate: 0.15, free: 4000 }, JPN: { rate: 0.3, free: 3000 },
  KOR: { rate: 0.3, free: 3000 }, ZAF: { rate: 0.2, free: 3000 }, TUR: { rate: 0.1, free: 2000 }, BRA: { rate: 0.06, free: 0 },
};

// ---------- heirlooms ----------

/** Something kept and passed down (a wedding ring, an officer's sword, a gold watch...). */
export function addHeirloom(w: World, c: Citizen, name: string, origin: string) {
  const h = (lifeOf(c).heirlooms ??= []);
  if (h.some((x) => x.name === name && x.origin === origin)) return;
  h.push({ name, origin, t: w.time });
  if (h.length > 24) h.shift();
}

// ---------- wills ----------

export function writeWill(w: World, shares: { id: Id; share: number }[], kids: number, c: Citizen = player(w)): Result {
  const total = shares.reduce((t, s) => t + s.share, 0) + kids;
  if (total > 1.0001 || shares.some((s) => s.share < 0) || kids < 0) return fail('Shares must add up to 100% or less (the rest goes to your next of kin).');
  if (shares.some((s) => !w.citizens[s.id] || w.citizens[s.id].gone || s.id === c.id)) return fail('Name living people only.');
  lifeOf(c).will = { shares: shares.filter((s) => s.share > 0), kids, written: w.time };
  return ok('📜 Your will is written and witnessed.');
}

/**
 * Settle the money of an estate: inheritance tax to the state, the will's
 * shares, a trust for children still at home; the rest goes to the next of
 * kin (`heir`) with everything else (called before the remainder is moved).
 */
export function settleWill(w: World, c: Citizen, heir: Citizen | null) {
  settleHome(w, c, heir); // the home passes to the heir, or is sold into the estate
  const code = w.nations[c.nation].cur;
  const cash = c.wallet[code] ?? 0;
  if (cash <= 0) return;
  const tax = ESTATE_TAX[w.nations[c.nation].iso];
  if (tax && cash > tax.free * 100) {
    const due = Math.floor((cash - tax.free * 100) * tax.rate);
    if (due > 0) pay(w, cref(c.id), natref(c.nation), code, due, `Inheritance tax on the estate of ${c.name}`);
  }
  const net = c.wallet[code] ?? 0;
  const will = c.life?.will;
  const kids = (c.family?.kids ?? []).length ? c.family!.kids : [];
  const kidShare = will ? will.kids : heir ? 0 : 1; // with nobody grown-up to inherit, the children's share is all of it
  if (kids.length && kidShare > 0) {
    const each = Math.floor((net * kidShare) / kids.length);
    for (const k of kids) if (each > 0 && pay(w, cref(c.id), hhref(c.nation), code, each, `Held in trust for ${k.name}`)) (w.trusts ??= []).push({ id: nid(w), kid: k.name, born: k.born, cur: code, amount: each, from: c.name });
  }
  for (const s of will?.shares ?? []) {
    const to = w.citizens[s.id];
    if (!to || to.gone || to.id === heir?.id) continue;
    const amt = Math.floor(net * s.share);
    if (amt > 0) pay(w, cref(c.id), cref(to.id), code, amt, `Bequest from ${c.name}`);
  }
  // Heirlooms pass to the next of kin.
  if (heir && c.life?.heirlooms?.length) for (const h of c.life.heirlooms) addHeirloom(w, heir, h.name, h.origin.startsWith('from') ? h.origin : `from ${c.name}: ${h.origin}`);
}

/** A child comes of age (or leaves care): any trust in their name is paid out. */
export function releaseTrusts(w: World, kid: Kid, to: Citizen) {
  for (const t of (w.trusts ?? []).filter((x) => x.kid === kid.name && x.born === kid.born)) {
    if (pay(w, hhref(to.nation), cref(to.id), t.cur, t.amount, `Trust from ${t.from}`)) w.trusts = w.trusts!.filter((x) => x !== t);
    if (to.player) notify(w, 'personal', `💼 A trust set up by ${t.from} is yours now: ${fmtAmt(t.cur, t.amount)}.`, { critical: true, link: 'life' });
  }
}

// ---------- the player's death and succession ----------

/** Who carries on: the will's main heir if family and grown up, else spouse, eldest grown child, sibling, parent. */
export function successor(w: World, p: Citizen): Citizen | null {
  const alive = (id: Id | null | undefined) => (id != null && w.citizens[id] && !w.citizens[id].gone && ageOf(w, w.citizens[id]) >= 18 ? w.citizens[id] : null);
  const f = p.family;
  const kin = [f?.status === 'married' ? f.partner : null, ...(f?.children ?? []).slice().sort((a, b) => (w.citizens[a]?.born ?? 0) - (w.citizens[b]?.born ?? 0)), ...siblingsOf(w, p).grown.map((x) => x.id), ...(f?.parents ?? [])];
  const named = (p.life?.will?.shares ?? []).slice().sort((a, b) => b.share - a.share).map((s) => s.id).find((id) => kin.includes(id) && alive(id));
  if (named != null) return alive(named);
  for (const id of kin) { const c = alive(id); if (c) return c; }
  return null;
}

/** Record a life in the legacy archive. */
function archive(w: World, p: Citizen, cause: string, heir: Citizen | null): LegacyEntry {
  const code = w.nations[p.nation].cur;
  const e: LegacyEntry = {
    id: p.id, name: p.name, born: p.born, died: w.time, age: ageOf(w, p), cause,
    milestones: (p.life?.milestones ?? []).slice(-12).map((m) => `${m.age}: ${m.text}`), wealth: p.wallet[code] ?? 0, cur: code, heir: heir?.name,
  };
  (w.legacy ??= []).push(e);
  return e;
}

/**
 * The player dies: their estate is settled like anyone's, the life is archived,
 * and play continues as the successor (if there is one). Returns the new player.
 */
export function playerDies(w: World, cause: string, deps: { releaseRoles: (w: World, c: Citizen, why: string) => void; settleEstate: (w: World, c: Citizen, heir: Citizen | null) => void; bereave: (w: World, c: Citizen) => void }): Citizen | null {
  const p = player(w);
  const heir = successor(w, p);
  dynastyOf(w);
  const entry = archive(w, p, cause, heir);
  noteDeath(w, p, cause);
  if (heir) noteSuccession(w, p, heir);
  deps.releaseRoles(w, p, 'died');
  deps.settleEstate(w, p, heir);
  deps.bereave(w, p);
  p.gone = { t: w.time, why: 'died', note: cause };
  record(w, 'people', `🕯️ ${p.name} died in ${w.regions[p.home].name}, aged ${entry.age} (${cause}).`, { cit: p.id, nation: p.nation, important: true, player: true });
  if (!heir) { w.life.ended = { t: w.time, name: p.name }; invalidateCensus(w); return null; }
  p.player = false;
  heir.player = true;
  w.playerId = heir.id;
  heir.trip = null;
  invalidateCensus(w);
  lifeOf(heir).grief = Math.min(20, (lifeOf(heir).grief ?? 0) + 15);
  w.life.succession = { t: w.time, from: p.name, age: entry.age, cause, to: heir.name, toAge: ageOf(w, heir), heirlooms: lifeOf(heir).heirlooms?.length ?? 0 };
  notify(w, 'personal', `🕯️ ${p.name} has died, aged ${entry.age} (${cause}). You carry on as ${heir.name}, ${ageOf(w, heir)}, who inherits${p.life?.heirlooms?.length ? ' the family heirlooms' : ''}.`, { critical: true, link: 'life' });
  return heir;
}

/** Continue a line that ended without an heir: as any grown-up living in the same place. */
export function continueAsNewcomer(w: World): Result {
  if (!w.life.ended) return fail('Your line has not ended.');
  const dead = w.citizens[w.playerId];
  const pick = census(w).all.filter((c) => !c.gone && ageOf(w, c) >= 18 && ageOf(w, c) < 40 && c.home === dead.home).sort((a, b) => a.id - b.id)[0] ?? census(w).all.find((c) => !c.gone && ageOf(w, c) >= 18);
  if (!pick) return fail('Nobody to carry on.');
  pick.player = true;
  w.playerId = pick.id;
  delete w.life.ended;
  invalidateCensus(w);
  return ok(`A new life begins: you are ${pick.name}, ${ageOf(w, pick)}, of ${w.regions[pick.home].name}.`);
}
