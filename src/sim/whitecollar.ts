// White-collar crime, cybercrime, laundering and informants (1.7 Law & Order).
//
// - Tax evasion: an owner can hide part of a company's profit from the tax office.
//   The unpaid tax builds up in the books, and tax audits find it (more often where
//   institutions are strong).
// - Embezzlement: an employee skims the employer's account; the books show it in time.
// - Cybercrime: online fraud against households in another country. It is hard to
//   trace, and the case can only be pursued in the victims' country.
// - Insider trading: an insider who buys shares shortly before paying a dividend or
//   issuing shares is flagged by the securities regulator.
// - Dirty money: the proceeds of crime are dirty until they are laundered through a
//   cash business or an organisation (for a cut). Banks report large dirty balances.
// - Informants: detectives turn members of organisations; informants feed evidence
//   until they are found out. Organisation members can be turned too, the player included.
import type { Citizen, Company, Holding, Id, World } from './types';
import { B } from '../data/balance';
import { baselineOf } from '../data/nationBaselines';
import { DAY, dayOf } from '../engine/clock';
import { notify, record } from '../engine/events';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { chance, pick, rand } from '../engine/rng';
import { census } from './census';
import { companyCurrency, controller, coref, cref, hhref, jailed, natref, player, syndref } from './query';
import { practise } from './growth';
import { lifeGate } from './lifecycle';
import { eduOfCitizen } from './education';
import { rank } from '../data/education';
import { openCase } from './crime';

const lawOf = (w: World, nation: Id) => baselineOf(w.nations[nation].iso).law;

// ---------- dirty money ----------

export const dirtyOf = (c: Citizen, code: string) => c.sec.dirty?.[code] ?? 0;
export function markDirty(c: Citizen, code: string, amt: number) {
  if (amt <= 0) return;
  (c.sec.dirty ??= {})[code] = (c.sec.dirty[code] ?? 0) + amt;
}
const clean = (c: Citizen, code: string, amt: number) => { if (c.sec.dirty) { c.sec.dirty[code] = Math.max(0, (c.sec.dirty[code] ?? 0) - amt); if (!c.sec.dirty[code]) delete c.sec.dirty[code]; } };

/** Where dirty money can be washed: one's own company (keeps 30% to cover the tax on the fake sales) or one's organisation (takes a quarter). */
export function launderOptions(w: World, c: Citizen) {
  const own = Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === c.id);
  return { companies: own, syndicate: c.sec.syndicate != null ? w.syndicates[c.sec.syndicate] : null };
}
export function launderCheck(w: World, c: Citizen, code: string, via: 'company' | 'syndicate', coId?: Id): string | null {
  if (jailed(w, c)) return 'You are in prison.';
  if (dirtyOf(c, code) <= 0) return 'You have no dirty money in that currency.';
  if (via === 'company') {
    const co = coId != null ? w.companies[coId] : undefined;
    if (!co || co.owner.k !== 'cit' || co.owner.id !== c.id) return 'You need a business of your own.';
    if (companyCurrency(w, co) !== code) return `${co.name} trades in another currency.`;
  } else if (c.sec.syndicate == null) return 'You are not in an organisation.';
  return null;
}
/** Wash dirty money: it comes back as business income (or through the organisation's fronts). */
export function launder(w: World, c: Citizen, code: string, via: 'company' | 'syndicate', coId?: Id): Result {
  const why = launderCheck(w, c, code, via, coId);
  if (why) return fail(why);
  const amt = Math.min(dirtyOf(c, code), c.wallet[code] ?? 0);
  if (amt <= 0) { clean(c, code, dirtyOf(c, code)); return ok('The dirty money is already spent.'); }
  if (via === 'company') {
    const co = w.companies[coId!];
    const keep = Math.round(amt * 0.3);
    pay(w, cref(c.id), coref(co.id), code, amt, 'Cash takings');
    co.today.revenue += amt; // it shows up as sales in the books, and is taxed as profit
    pay(w, coref(co.id), cref(c.id), code, amt - keep, `Owner's drawings from ${co.name}`);
    clean(c, code, amt);
    c.sec.heat = Math.min(100, c.sec.heat + 3);
    practise(w, c, 'eco', 0.3);
    return ok(`${fmtAmt(code, amt)} went through ${co.name}'s tills as cash sales; ${fmtAmt(code, amt - keep)} came back to you clean (the rest stays to pay the tax on the fake sales).`);
  }
  const s = w.syndicates[c.sec.syndicate!];
  const fee = Math.round(amt * 0.25);
  pay(w, cref(c.id), syndref(s.id), code, fee, `${s.name}: laundering`);
  clean(c, code, amt);
  return ok(`${s.name}'s fronts washed ${fmtAmt(code, amt)} for a quarter (${fmtAmt(code, fee)}).`);
}

// ---------- tax evasion ----------

export function setEvasionCheck(w: World, c: Citizen, co: Company | undefined): string | null {
  if (!co || co.owner.k !== 'cit' || co.owner.id !== c.id) return 'Only the owner keeps the books.';
  return null;
}
/** Hide a share of profit from the tax office (0 = honest books). */
export function setEvasion(w: World, c: Citizen, coId: Id, share: number): Result {
  const co = w.companies[coId];
  const why = setEvasionCheck(w, c, co);
  if (why) return fail(why);
  co.evade = Math.max(0, Math.min(0.8, share));
  if (!co.evade) delete co.evade;
  return ok(co.evade ? `${co.name} now declares ${Math.round((1 - co.evade) * 100)}% of its profit.` : `${co.name}'s books are honest again.`);
}
/** Called when corporate tax is due: the share withheld, and the record of it. */
export function evadeTax(w: World, co: Company, tax: number): number {
  if (!co.evade || tax <= 0) return tax;
  const hidden = Math.round(tax * co.evade);
  co.evaded = (co.evaded ?? 0) + hidden;
  return tax - hidden;
}
/** Monthly tax audits: the more is owed, and the stronger the tax office, the likelier it is found. */
function taxAudits(w: World) {
  for (const co of Object.values(w.companies)) {
    if (!co.evaded || co.owner.k !== 'cit') continue;
    const owner = w.citizens[co.owner.id];
    if (!owner) continue;
    const nat = controller(w.regions[co.region]);
    const code = companyCurrency(w, co);
    const p = Math.min(0.6, 0.05 + lawOf(w, nat) * 0.2 + co.evaded / Math.max(1, cur(B.justice.lawyer) * 40));
    if (!chance(w, p)) continue;
    // Back taxes come first, from the company.
    const back = Math.min(co.evaded, co.wallet[code] ?? 0);
    if (back > 0) pay(w, coref(co.id), natref(nat), code, back, 'Back taxes after an audit');
    const k = openCase(w, owner, 'taxevasion', co.region, 45 + lawOf(w, nat) * 40, co.evaded);
    k.loot = co.evaded;
    co.evaded = 0; delete co.evade;
    if (owner.player) notify(w, 'personal', `🧾 The tax office audited ${co.name}: ${fmtAmt(code, back)} in back taxes, and a tax evasion investigation.`, { critical: true, link: 'crime' });
    else if (nat === player(w).nation) record(w, 'justice', `🧾 Tax inspectors found hidden profits at ${co.name}.`, { nation: nat });
  }
}

// ---------- embezzlement ----------

export function embezzleCheck(w: World, c: Citizen): string | null {
  const young = lifeGate(w, c, 18, 'Crime');
  if (young) return young;
  if (jailed(w, c)) return 'You are in prison.';
  const co = c.job != null ? w.companies[c.job] : undefined;
  if (!co) return 'You need an employer to steal from.';
  if (co.owner.k === 'cit' && co.owner.id === c.id) return 'It is already your money.';
  if (c.energy < 15) return 'Needs 15 energy.';
  if ((c.sec.last.embezzle ?? -1e12) > w.time - 3 * DAY) return 'Too soon: the books need to settle first.';
  return null;
}
/** Skim the employer's account: small amounts go unnoticed for a while; the books catch up. */
export function embezzle(w: World, c: Citizen): Result {
  const why = embezzleCheck(w, c);
  if (why) return fail(why);
  const co = w.companies[c.job!];
  const code = companyCurrency(w, co);
  c.energy -= 15;
  c.sec.last.embezzle = w.time;
  const amt = Math.min(Math.floor((co.wallet[code] ?? 0) * rand(w, 0.01, 0.03)), Math.round(cur(B.justice.lawyer) * (0.5 + c.eco / 40)));
  if (amt <= 0) return fail(`${co.name}'s account is empty.`);
  pay(w, coref(co.id), cref(c.id), code, amt, 'Expenses claim');
  markDirty(c, code, amt);
  c.flags.embezzled = (c.flags.embezzled ?? 0) + amt;
  c.flags.embezzledFrom = co.id;
  c.sec.record.crimes++;
  practise(w, c, 'eco', 0.3);
  return ok(`${fmtAmt(code, amt)} left ${co.name}'s account as a padded expenses claim.`);
}
/** Daily: the books catch embezzlers; the bigger the hole, the sooner. */
function catchEmbezzlers(w: World) {
  for (const c of census(w).all) {
    const amt = c.flags.embezzled ?? 0;
    if (!amt) continue;
    const co = w.companies[c.flags.embezzledFrom ?? -1];
    if (!co) { c.flags.embezzled = 0; continue; }
    const nat = controller(w.regions[co.region]);
    if (!chance(w, Math.min(0.25, 0.01 + amt / Math.max(1, cur(B.justice.lawyer) * 100)))) continue;
    openCase(w, c, 'embezzlement', co.region, 50 + lawOf(w, nat) * 20, amt);
    c.flags.embezzled = 0;
    if (co.owner.k === 'cit' && w.citizens[co.owner.id]) w.citizens[co.owner.id].rel[c.id] = -60;
    if (c.player) notify(w, 'personal', `🧾 ${co.name}'s accountant found the hole in the books. The police have the file.`, { critical: true, link: 'crime' });
  }
}

// ---------- cybercrime ----------

const techSavvy = (c: Citizen) => { const e = eduOfCitizen(c); return (e.field === 'engineering' || e.field === 'science') && rank(e.level) >= 1; };
export function cyberCheck(w: World, c: Citizen): string | null {
  const young = lifeGate(w, c, 18, 'Crime');
  if (young) return young;
  if (jailed(w, c)) return 'You are in prison.';
  if (!techSavvy(c) && c.eco < 15) return 'Needs technical training (engineering or science) or economic skill 15.';
  if (c.energy < 25) return 'Needs 25 energy.';
  if ((c.sec.last.cyber ?? -1e12) > w.time - 2 * DAY) return 'Your last campaign is still running.';
  return null;
}
/** An online fraud campaign against households abroad: hard to trace, and only their country can prosecute. */
export function cyberFraud(w: World, c: Citizen): Result {
  const why = cyberCheck(w, c);
  if (why) return fail(why);
  c.energy -= 25;
  c.sec.last.cyber = w.time;
  c.sec.record.crimes++;
  const targets = w.nations.filter((n) => !n.exile && n.id !== c.nation);
  const t = pick(w, targets);
  const skill = (techSavvy(c) ? 0.2 : 0) + c.eco / 100;
  practise(w, c, 'eco', 0.4);
  if (!chance(w, 0.35 + skill)) return fail(`The phishing campaign against ${t.name} caught nobody.`);
  const loot = Math.min(Math.floor((w.households[t.id].wallet[t.cur] ?? 0) * 0.0005), Math.round(cur(B.justice.lawyer) * (1 + skill * 2)));
  if (loot <= 0) return fail('Nothing came of it.');
  pay(w, hhref(t.id), cref(c.id), t.cur, loot, 'Online fraud');
  markDirty(c, t.cur, loot);
  c.sec.notoriety += 1;
  // Detection: cyber units are strongest where institutions are.
  if (chance(w, 0.04 + lawOf(w, t.id) * 0.1)) {
    const cap = w.regions.filter((r) => r.owner === t.id).sort((a, b) => b.pop - a.pop)[0];
    if (cap) openCase(w, c, 'cybercrime', cap.id, 40, loot);
  }
  return ok(`Households in ${t.name} paid ${fmtAmt(t.cur, loot)} into your accounts.`);
}

// ---------- insider trading ----------

export const isInsider = (h: Holding, id: Id) => h.ceo === id || Object.values(h.roles).includes(id);
/** Called when shares change hands: remember insiders' purchases. */
export function noteShareBuy(w: World, h: Holding, buyer: Id, qty: number) {
  if (!isInsider(h, buyer)) return;
  (h.insiderBuys ??= []).push({ cit: buyer, t: w.time, qty });
  if (h.insiderBuys.length > 30) h.insiderBuys.shift();
}
/** Called when an insider moves the price (a dividend or an issue): purchases in the week before are reviewed. */
export function insiderReview(w: World, h: Holding, gainPerShare: number) {
  const recent = (h.insiderBuys ?? []).filter((b) => w.time - b.t <= 7 * DAY);
  if (!recent.length) return;
  h.insiderBuys = (h.insiderBuys ?? []).filter((b) => w.time - b.t > 7 * DAY);
  for (const b of recent) {
    const c = w.citizens[b.cit];
    if (!c || !chance(w, 0.2 + lawOf(w, h.nation) * 0.5)) continue;
    const rid = w.regions.find((r) => r.owner === h.nation)?.id ?? c.loc;
    openCase(w, c, 'insidertrading', rid, 55, Math.max(0, Math.round(gainPerShare * b.qty)));
    if (c.player) notify(w, 'personal', `📈 The securities regulator is asking about your ${h.name} share purchases.`, { critical: true, link: 'crime' });
  }
}

// ---------- informants ----------

export const informantsOf = (w: World, sid: Id) => census(w).all.filter((c) => c.sec.informs === sid && c.sec.syndicate === sid);

export function cultivateCheck(w: World, c: Citizen, sid: Id): string | null {
  if (c.sec.police == null) return 'Only police officers run informants.';
  if (c.sec.prank < 2) return 'Detectives and above run informants.';
  if (!w.syndicates[sid]) return 'Unknown organisation.';
  if (c.energy < 20) return 'Needs 20 energy.';
  if ((c.sec.last.cultivate ?? -1e12) > w.time - 3 * DAY) return 'Give the last approach time.';
  return null;
}
/** A detective approaches a member of an organisation with a choice: talk, or face what we have on you. */
export function cultivate(w: World, c: Citizen, sid: Id): Result {
  const why = cultivateCheck(w, c, sid);
  if (why) return fail(why);
  c.energy -= 20;
  c.sec.last.cultivate = w.time;
  const s = w.syndicates[sid];
  const pool = s.members.map((m) => w.citizens[m]).filter((m) => m && !m.player && m.sec.informs == null && m.id !== s.boss && !jailed(w, m));
  if (!pool.length) return fail(`Nobody in ${s.name} can be approached.`);
  const t = pool.sort((a, b) => a.traits.loyalty - b.traits.loyalty)[0];
  const exposed = Object.values(w.cases).some((k) => k.status === 'open' && k.suspect === t.id);
  if (!chance(w, Math.min(0.8, 0.2 + (1 - t.traits.loyalty) * 0.4 + (exposed ? 0.25 : 0) + c.attrs.lead / 200))) {
    s.heat = Math.min(100, s.heat + 5);
    return fail(`${t.name} told you where to go — and probably told ${s.name} about the approach.`);
  }
  t.sec.informs = sid;
  t.sec.handler = c.id;
  practise(w, c, 'lead', 0.4);
  return ok(`${t.name} agreed to talk. ${s.name}'s business is about to get harder.`);
}
/** Daily: informants feed evidence on their organisation; some are found out. */
function informantsDaily(w: World) {
  for (const c of census(w).all) {
    const sid = c.sec.informs;
    if (sid == null) continue;
    const s = w.syndicates[sid];
    if (!s || c.sec.syndicate !== sid) { c.sec.informs = undefined; c.sec.handler = undefined; continue; }
    for (const k of Object.values(w.cases)) if (k.status === 'open' && k.syndicate === sid && k.suspect !== c.id) k.evidence = Math.min(100, k.evidence + 3);
    s.heat = Math.min(100, s.heat + 1);
    if (c.player) {
      const n = w.nations[s.nation];
      const stipend = Math.round(cur(B.wages.min) * 0.5);
      if (dayOf(w.time) % 7 === 0 && (n.wallet[n.cur] ?? 0) > stipend) pay(w, natref(n.id), cref(c.id), n.cur, stipend, 'Informant payments');
    }
    if (chance(w, 0.004 * (s.strength / 50) + (c.player ? 0.003 : 0))) {
      // Found out.
      c.sec.informs = undefined; c.sec.handler = undefined;
      s.members = s.members.filter((m) => m !== c.id);
      c.sec.syndicate = null; c.sec.srank = 0;
      c.health = Math.max(5, (c.health ?? 90) - 30);
      if (c.player) notify(w, 'personal', `🐀 ${s.name} found out you were talking to the police. You are out — and lucky to be breathing.`, { critical: true, link: 'crime' });
      if (s.nation === player(w).nation) record(w, 'crime', `🐀 A police informant inside ${s.name} was exposed and badly beaten.`, { nation: s.nation });
    }
  }
}
/** Become an informant (the player, from a story or the police approach). */
export function turnInformant(w: World, c: Citizen, handler: Id | null): Result {
  const sid = c.sec.syndicate;
  if (sid == null) return fail('You are not in an organisation.');
  c.sec.informs = sid;
  c.sec.handler = handler ?? undefined;
  // The deal: charges against you are dropped.
  for (const k of Object.values(w.cases)) if (k.status === 'open' && k.suspect === c.id && k.kind !== 'espionage') { k.status = 'closed'; k.outcome = 'dropped (informant deal)'; }
  c.sec.heat = Math.max(0, c.sec.heat - 40);
  return ok(`You are now a police informant inside ${w.syndicates[sid].name}. The charges against you have gone away.`);
}

// ---------- AI ----------

/** Daily: audits, the books, informants and NPC white-collar crime. */
export function whiteCollarDaily(w: World) {
  catchEmbezzlers(w);
  informantsDaily(w);
  if (dayOf(w.time) % 30 === 0) taxAudits(w);
  // Dirty balances can never exceed what is actually held; banks report large ones.
  for (const c of census(w).all) {
    if (!c.sec.dirty) continue;
    for (const code of Object.keys(c.sec.dirty)) {
      c.sec.dirty[code] = Math.min(c.sec.dirty[code], c.wallet[code] ?? 0);
      if (!c.sec.dirty[code]) { delete c.sec.dirty[code]; continue; }
      const nat = w.nations.find((n) => n.cur === code);
      if (!nat) continue;
      const big = c.sec.dirty[code] / Math.max(1, cur(B.justice.lawyer) * 10);
      if (big > 0.3 && chance(w, Math.min(0.05, 0.004 * big * (0.5 + lawOf(w, nat.id))))) {
        const rid = c.loc != null && controller(w.regions[c.loc]) === nat.id ? c.loc : (w.regions.find((r) => r.owner === nat.id)?.id ?? c.loc);
        openCase(w, c, 'laundering', rid, 35, c.sec.dirty[code]);
        if (c.player) notify(w, 'personal', '🏦 Your bank filed a suspicious activity report on your account.', { link: 'crime' });
      }
    }
    if (!Object.keys(c.sec.dirty).length) delete c.sec.dirty;
  }
  for (const c of census(w).all) {
    if (c.player || jailed(w, c) || (c.id + dayOf(w.time)) % 15 !== 0) continue;
    // NPC organisation members wash their money through the organisation.
    if (c.sec.dirty && c.sec.syndicate != null) for (const code of Object.keys(c.sec.dirty)) if (!launderCheck(w, c, code, 'syndicate')) launder(w, c, code, 'syndicate');
    // Greedy owners cook the books; greedy employees skim.
    if (c.traits.greed > 0.75 && c.traits.loyalty < 0.4) {
      const co = Object.values(w.companies).find((x) => x.owner.k === 'cit' && x.owner.id === c.id && !x.evade);
      if (co && chance(w, 0.2)) setEvasion(w, c, co.id, 0.3);
      else if (!embezzleCheck(w, c) && chance(w, 0.2)) embezzle(w, c);
    }
    // Rare: technically skilled NPCs turn to online fraud.
    if (c.traits.greed > 0.7 && c.traits.risk > 0.6 && chance(w, 0.05) && !cyberCheck(w, c)) cyberFraud(w, c);
  }
  // Detectives cultivate informants in organisations active in their region.
  for (const c of census(w).all) {
    if (c.player || c.sec.police == null || c.sec.prank < 2 || (c.id + dayOf(w.time)) % 20 !== 0) continue;
    const s = Object.values(w.syndicates).find((x) => x.turf.includes(c.sec.police!));
    if (s && informantsOf(w, s.id).length < 2 && !cultivateCheck(w, c, s.id)) cultivate(w, c, s.id);
  }
}
