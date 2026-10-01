// Love and family. People date, fall out, get engaged, marry, have children and
// sometimes divorce; children grow up in the family and come of age as full
// citizens; the bereaved grieve and inherit. The player lives by the same rules:
// ask someone out, take them on dates, propose, marry, start a family — and a
// partner who is neglected may leave.
import { addHeirloom, releaseTrusts } from './legacy';
import type { Citizen, Family, Id, Kid, World } from './types';
import { B } from '../data/balance';
import { NAME_POOLS } from '../data/names';
import { DAY } from '../engine/clock';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { notify, record } from '../engine/events';
import { chance, pick, rand, randInt, shuffle } from '../engine/rng';
import { fail, ok, type Result } from '../engine/result';
import { census, invalidateCensus, residents } from './census';
import { controller, cref, hhref, jailed, player, today } from './query';
import { ageOf, bornYearsAgo, isAdult, standing } from './growth';
import { ideoDistance } from './interact';
import { localNews } from './life';
import { remember } from './story';
import { adjustRel } from './social';
import { newResident, regionTarget } from './population';
import { bump } from './progress';
import { conceive } from './kinship';
import { milestone } from './lifecycle';
import { comeOfAgeFrom } from './childhood';
import { fmtDate } from '../engine/calendar';

export function fam(c: Citizen): Family {
  return (c.family ??= { partner: null, status: 'single', since: c.born, parents: [], children: [], kids: [], exes: [] });
}

const alive = (w: World, id: Id | null | undefined): Citizen | null => (id != null && w.citizens[id] && !w.citizens[id].gone ? w.citizens[id] : null);
export const partnerOf = (w: World, c: Citizen) => alive(w, c.family?.partner);
const surname = (c: Citizen) => c.name.split(' ').slice(-1)[0];
const bumpRel = (a: Citizen, b: Citizen, d: number) => { adjustRel(a, b.id, d); adjustRel(b, a.id, d); };

export const STATUS_LABEL: Record<Family['status'], string> = { single: 'single', dating: 'dating', engaged: 'engaged', married: 'married' };

/** Can these two be a couple? (adults, compatible ages, both free) */
function compatible(w: World, a: Citizen, b: Citizen): number {
  if (a.id === b.id || !isAdult(w, a) || !isAdult(w, b)) return 0;
  const fa = fam(a), fb = fam(b);
  if (fa.partner != null || fb.partner != null) return 0;
  if (fa.parents.includes(b.id) || fb.parents.includes(a.id) || fa.parents.some((x) => fb.parents.includes(x))) return 0; // family
  const ages = [ageOf(w, a), ageOf(w, b)];
  const gap = Math.abs(ages[0] - ages[1]);
  if (gap > Math.max(6, Math.min(...ages) * 0.3)) return 0;
  return Math.max(0, 1 - gap / 20 - ideoDistance(a.ideo, b.ideo) * 0.35);
}

function pair(w: World, a: Citizen, b: Citizen, status: Family['status'], since = w.time) {
  const fa = fam(a), fb = fam(b);
  fa.partner = b.id; fb.partner = a.id;
  fa.status = fb.status = status;
  fa.since = fb.since = since;
  fa.lastDate = fb.lastDate = w.time;
}

function split(w: World, a: Citizen, b: Citizen | null) {
  const fa = fam(a);
  if (b) { const fb = fam(b); if (fb.partner === a.id) { fb.partner = null; fb.status = 'single'; fb.since = w.time; if (!fb.exes.includes(a.id)) fb.exes.push(a.id); } if (!fa.exes.includes(b.id)) fa.exes.push(b.id); }
  fa.partner = null; fa.status = 'single'; fa.since = w.time;
}

/** Move a new spouse into the other's home. */
function moveIn(w: World, mover: Citizen, host: Citizen) {
  if (mover.home === host.home || mover.player) return;
  const from = mover.home;
  if (mover.job != null) { const co = w.companies[mover.job]; if (co) co.workers = co.workers.filter((x) => x !== mover.id); mover.job = null; }
  mover.home = mover.loc = mover.mineSite = host.home;
  mover.sec.police = null;
  invalidateCensus(w);
  localNews(w, from, `💍 ${mover.name} moved to ${w.regions[host.home].name} to live with ${host.name}.`);
}

function babyName(w: World, parent: Citizen) {
  const pool = NAME_POOLS[w.nations[parent.nation].cur];
  return `${pick(w, pool.first)} ${surname(parent)}`;
}

export function haveBaby(w: World, a: Citizen, b: Citizen) {
  const kid = { name: babyName(w, a), born: w.time };
  fam(a).kids.push(kid);
  localNews(w, a.home, `👶 ${a.name} and ${b.name} welcomed a baby, ${kid.name.split(' ')[0]}.`);
  return kid;
}

// ---------- death and coming of age ----------

/** A partner, parents and children lose someone. Children still growing up stay with the surviving parent. */
export function bereave(w: World, c: Citizen) {
  const f = c.family;
  if (!f) return;
  const p = player(w);
  const partner = alive(w, f.partner);
  if (partner) {
    const pf = fam(partner);
    pf.partner = null; pf.status = 'single'; pf.since = w.time;
    pf.kids.push(...f.kids); f.kids = [];
    partner.mood = Math.max(-10, partner.mood - 5);
    if (partner.player) notify(w, 'personal', `🕯️ Your ${f.status === 'married' ? 'spouse' : 'partner'} ${c.name} has died. You are ${f.status === 'married' ? 'widowed' : 'alone again'}.`, { critical: true, link: 'character' });
  } else if (f.kids.length) {
    const kin = [...f.parents, ...f.children].map((id) => alive(w, id)).find(Boolean);
    if (kin) fam(kin).kids.push(...f.kids.map((k) => ({ ...k, how: f.parents.includes(kin.id) ? 'grandchild' as const : 'sibling' as const }))); // raised by grandparents or an older sibling
    else for (const k of f.kids) w.life.orphans.push({ name: k.name, born: k.born, parents: [c.id], region: c.home }); // into care, waiting for a family
    if (kin?.player) notify(w, 'personal', `🏠 ${f.kids.map((k) => k.name.split(' ')[0]).join(' and ')} ${f.kids.length > 1 ? 'come' : 'comes'} to live with you now. You are their guardian.`, { critical: true, link: 'life' });
    f.kids = [];
  }
  for (const id of [...f.parents, ...f.children]) { const k = alive(w, id); if (k) k.mood = Math.max(-10, k.mood - 3); if (k?.player) notify(w, 'personal', `🕯️ Your ${f.parents.includes(id) ? 'child' : 'parent'} ${c.name} has died.`, { critical: true }); }
  void p;
}

/** A child raised in a family turns 18 and becomes a citizen in their own right. */
export function kidComesOfAge(w: World, parent: Citizen, kid: Kid) {
  const f = fam(parent);
  f.kids = f.kids.filter((k) => k !== kid);
  const nation = w.nations[parent.nation];
  const c = newResident(w, nation, parent.home, { name: kid.name, age: B.life.adultAge, ideo: chance(w, 0.7) ? parent.ideo : undefined, funded: true });
  c.born = kid.born;
  // A start in life from the family (not from nowhere): a share of their savings, up to a cap.
  const start = Math.min(cur(B.family.startMax), Math.floor((parent.wallet[nation.cur] ?? 0) * B.family.startInLife));
  if (start > 0) pay(w, cref(parent.id), cref(c.id), nation.cur, start, `A start in life for ${kid.name.split(' ')[0]}`);
  const other = alive(w, f.partner);
  fam(c).parents = [parent.id, ...(other && f.status === 'married' ? [other.id] : [])];
  for (const id of fam(c).parents) { const x = w.citizens[id]; fam(x).children.push(c.id); bumpRel(x, c, 50); }
  if (parent.player || other?.player) {
    notify(w, 'personal', `🎓 Your child ${c.name} has turned 18 and is starting out on their own.`, { critical: true, link: 'character' });
    c.rel[player(w).id] = 70;
  }
  comeOfAgeFrom(w, kid, c, parent);
  releaseTrusts(w, kid, c);
  localNews(w, parent.home, `🎓 ${c.name}, ${parent.name}'s child, came of age.`);
  return c;
}

// ---------- the NPC love life ----------

export function familyDaily(w: World) {
  const d = today(w);
  const all = census(w).all;
  // Couples: courtship, engagements, weddings, babies, break-ups.
  for (const a of all) {
    const f = a.family;
    if (!f || f.partner == null || a.player) continue;
    const b = alive(w, f.partner);
    if (!b) { split(w, a, null); continue; }
    if (b.player || a.id > b.id) continue; // each couple once; the player decides for themselves
    const rel = Math.min(a.rel[b.id] ?? 0, b.rel[a.id] ?? 0);
    const days = (w.time - f.since) / DAY;
    const drift = rand(w, -1.2, 1.8) * (1 - ideoDistance(a.ideo, b.ideo) * 0.5) - (a.mood < -3 || b.mood < -3 ? 0.8 : 0);
    bumpRel(a, b, drift);
    if (f.status === 'dating') {
      if (rel < 10 && chance(w, 0.1)) { split(w, a, b); localNews(w, a.home, `💔 ${a.name} and ${b.name} have split up.`); continue; }
      if (rel >= 60 && days >= 30 && chance(w, 0.02)) { fam(a).status = fam(b).status = 'engaged'; fam(a).since = fam(b).since = w.time; localNews(w, a.home, `💍 ${a.name} and ${b.name} are engaged!`); }
    } else if (f.status === 'engaged') {
      if (rel < 10 && chance(w, 0.1)) { split(w, a, b); localNews(w, a.home, `💔 ${a.name} and ${b.name} called off their engagement.`); continue; }
      if (days >= 20 && chance(w, 0.06)) wed(w, a, b);
    } else if (f.status === 'married') {
      if (rel < 0 && chance(w, 0.02)) { split(w, a, b); localNews(w, a.home, `📄 ${a.name} and ${b.name} are divorcing.`); continue; }
      const young = Math.min(ageOf(w, a), ageOf(w, b)), older = Math.max(ageOf(w, a), ageOf(w, b));
      const kids = fam(a).kids.length + fam(b).kids.length + fam(a).children.length;
      if (young >= 20 && older <= 46 && kids < 4 && chance(w, (0.3 * fertilityFactor(w, a)) / (w.settings.lifeYearDays ?? 365) / (1 + kids))) haveBaby(w, a, b);
    }
  }
  // New couples: neighbours, colleagues, friends of friends.
  for (const r of w.regions) {
    if ((r.id + d) % 3 !== 0) continue;
    const singles = residents(w, r.id).filter((c) => !c.player && c.family?.partner == null && isAdult(w, c) && ageOf(w, c) < 70 && !jailed(w, c));
    if (singles.length < 2) continue;
    const a = pick(w, singles);
    const b = pick(w, singles.filter((x) => x.id !== a.id));
    const k = compatible(w, a, b);
    const workmates = a.job != null && a.job === b.job;
    if (k > 0 && chance(w, k * (workmates ? 0.5 : 0.3))) {
      pair(w, a, b, 'dating');
      bumpRel(a, b, 25);
      if (chance(w, 0.5)) localNews(w, r.id, `💕 ${a.name} and ${b.name} have been seen out together${workmates ? ' (they work together)' : ''}.`);
    } else bumpRel(a, b, randInt(w, -1, 3)); // neighbours get to know each other
  }
  // The player's partner: a relationship needs time.
  const p = player(w);
  const partner = partnerOf(w, p);
  if (partner) {
    const f = fam(p);
    const quiet = (w.time - (f.lastDate ?? f.since)) / DAY;
    if (quiet > 10) adjustRel(partner, p.id, -(quiet > 20 ? 2 : 1));
    if ((partner.rel[p.id] ?? 0) < 5 && chance(w, 0.15)) {
      const was = f.status;
      split(w, p, partner);
      partner.rel[p.id] = Math.min(partner.rel[p.id] ?? 0, -10);
      notify(w, 'personal', `💔 ${partner.name} has left you. ${was === 'married' ? 'They filed for divorce: ' : ''}“You were never there.”`, { critical: true, link: 'character' });
      localNews(w, p.home, `💔 ${p.name} and ${partner.name} have split up.`);
    }
  }
}

/** Families have more children where the region is growing and fewer where it is crowded (and never past the world's size budget). */
function fertilityFactor(w: World, c: Citizen): number {
  const r = w.regions[c.home];
  const n = residents(w, r.id).length;
  const t = regionTarget(w, r);
  const world = census(w).all.length / Math.max(1, w.calendar.basePop ?? census(w).all.length);
  if (world > B.population.worldCap) return 0.3;
  return n < t ? 1.3 : n > t * 1.2 ? 0.5 : 1;
}

function wed(w: World, a: Citizen, b: Citizen) {
  fam(a).status = fam(b).status = 'married';
  fam(a).since = fam(b).since = w.time;
  // One household: the one with a job (or the player) keeps their home.
  const stay = a.player ? a : b.player ? b : a.job != null || b.job == null ? a : b;
  moveIn(w, stay === a ? b : a, stay);
  localNews(w, stay.home, `💒 ${a.name} and ${b.name} were married today.`);
  const guests = residents(w, stay.home).filter((x) => !x.player && x.id !== a.id && x.id !== b.id).slice(0, 6);
  for (const g of guests) { adjustRel(g, a.id, 2); adjustRel(g, b.id, 2); }
}

/** Genesis: couples, children growing up at home, and grown-up children living nearby. */
export function initFamilies(w: World) {
  for (const r of w.regions) {
    const people = shuffle(w, residents(w, r.id).filter((c) => !c.player));
    for (const c of people) fam(c);
    const adults = people.filter((c) => ageOf(w, c) >= 22);
    for (const a of adults) {
      if (a.family!.partner != null || !chance(w, ageOf(w, a) >= 28 ? 0.62 : 0.3)) continue;
      const b = adults.find((x) => x.family!.partner == null && compatible(w, a, x) > 0.2);
      if (!b) continue;
      const years = Math.max(0, Math.min(ageOf(w, a), ageOf(w, b)) - randInt(w, 20, 32));
      const married = years > 0 && chance(w, 0.8);
      pair(w, a, b, married ? 'married' : 'dating', married ? bornYearsAgo(w, years, randInt(w, 0, 300)) : w.time - randInt(w, 10, 300) * DAY);
      bumpRel(a, b, randInt(w, 40, 80));
      if (!married) continue;
      // Children still at home: born after the wedding, under 18 now.
      const young = Math.min(ageOf(w, a), ageOf(w, b));
      const n = young < 25 ? 0 : weightedKids(w);
      for (let i = 0; i < n; i++) {
        const kidAge = randInt(w, 0, Math.min(17, years, young - 20));
        if (kidAge < 0) continue;
        fam(a).kids.push({ name: babyName(w, a), born: bornYearsAgo(w, kidAge, randInt(w, 0, 364)) });
      }
    }
    // Grown-up children: an older resident with a younger one who shares their surname or simply lives nearby.
    for (const old of people.filter((c) => ageOf(w, c) >= 45)) {
      if (!chance(w, 0.35)) continue;
      const kid = people.find((x) => x.id !== old.id && !fam(x).parents.length && ageOf(w, old) - ageOf(w, x) >= 20 && ageOf(w, old) - ageOf(w, x) <= 40 && x.family?.partner !== old.id);
      if (!kid) continue;
      fam(kid).parents.push(old.id);
      fam(old).children.push(kid.id);
      const spouse = alive(w, fam(old).partner);
      if (spouse && fam(old).status === 'married') { fam(kid).parents.push(spouse.id); fam(spouse).children.push(kid.id); }
      bumpRel(old, kid, randInt(w, 30, 70));
    }
  }
}

function weightedKids(w: World) { const r = rand(w, 0, 1); return r < 0.3 ? 0 : r < 0.6 ? 1 : r < 0.88 ? 2 : 3; }

/** The player's parents: two older people in their home region (or a single parent). */
export function initPlayerFamily(w: World) {
  const p = player(w);
  fam(p);
  const pool = residents(w, p.home).filter((c) => !c.player && ageOf(w, c) >= ageOf(w, p) + 20 && ageOf(w, c) <= ageOf(w, p) + 42 && !fam(c).kids.length);
  const mum = pool.find((c) => fam(c).status === 'married' && alive(w, fam(c).partner) && pool.includes(alive(w, fam(c).partner)!)) ?? pool[0];
  if (!mum) return;
  const parents = [mum, ...(fam(mum).status === 'married' && alive(w, fam(mum).partner) ? [alive(w, fam(mum).partner)!] : [])];
  for (const x of parents) { fam(x).children.push(p.id); fam(p).parents.push(x.id); x.rel[p.id] = 75; p.rel[x.id] = 60; }
}

// ---------- the player's love life ----------

export function romanceCheck(w: World, p: Citizen, npc: Citizen | undefined, what: 'ask' | 'date' | 'propose' | 'wed' | 'leave' | 'child'): string | null {
  const f = fam(p);
  if (what === 'leave') return f.partner == null ? 'You are not seeing anyone.' : null;
  if (!npc || npc.player || npc.gone) return 'Nobody to see.';
  if (jailed(w, p)) return 'You are in prison.';
  if (what === 'ask') {
    if (!isAdult(w, p) || !isAdult(w, npc)) return 'Only adults.';
    if (f.partner != null) return `You are ${STATUS_LABEL[f.status]} to ${w.citizens[f.partner]?.name}.`;
    if (fam(npc).partner != null) return `${npc.name} is ${STATUS_LABEL[fam(npc).status]}.`;
    if (fam(p).parents.includes(npc.id) || fam(p).children.includes(npc.id)) return 'Family.';
    if (npc.loc !== p.loc) return `${npc.name} is in ${w.regions[npc.loc].name}.`;
    if ((npc.rel[p.id] ?? 0) < 30) return `${npc.name} barely knows you (relationship 30+ first: talk, help, spend time).`;
    if (fam(npc).exes.includes(p.id) && (npc.rel[p.id] ?? 0) < 60) return 'You have history. They are not ready to try again.';
    if ((p.flags.askedOut ?? -1) === today(w)) return 'Once a day is plenty.';
    return null;
  }
  if (f.partner !== npc.id) return `You are not seeing ${npc.name}.`;
  if (what === 'date') {
    if (npc.loc !== p.loc) return `${npc.name} is in ${w.regions[npc.loc].name}.`;
    if (p.energy < 15) return 'Needs 15 energy.';
    if ((f.lastDate ?? 0) >= Math.floor(w.time / DAY) * DAY) return 'You already spent time together today.';
    const code = w.nations[controller(w.regions[p.loc])].cur;
    if ((p.wallet[code] ?? 0) < cur(B.family.dateCost)) return `An evening out costs about ${fmtAmt(code, cur(B.family.dateCost))}.`;
    return null;
  }
  if (what === 'propose') {
    if (f.status !== 'dating') return f.status === 'engaged' ? 'You are already engaged.' : 'You are already married.';
    if ((w.time - f.since) / DAY < 14) return 'Give it a little longer (two weeks together).';
    if (npc.loc !== p.loc) return `Propose in person: ${npc.name} is in ${w.regions[npc.loc].name}.`;
    return null;
  }
  if (what === 'wed') {
    if (f.status !== 'engaged') return 'You need to be engaged.';
    if (npc.loc !== p.loc) return `${npc.name} is in ${w.regions[npc.loc].name}.`;
    const code = w.nations[controller(w.regions[p.loc])].cur;
    if ((p.wallet[code] ?? 0) < cur(B.family.weddingCost)) return `A modest wedding costs ${fmtAmt(code, cur(B.family.weddingCost))}.`;
    return null;
  }
  if (what === 'child') {
    if (f.status !== 'married') return 'Start a family once you are married.';
    if (ageOf(w, npc) > 46 && ageOf(w, p) > 46) return 'That chapter has passed.';
    if ((p.flags.triedChild ?? -1) === today(w)) return 'Not today.';
    const due = w.life.pregnancies.find((x) => x.parents.includes(p.id));
    if (due) return `A baby is already on the way (due ${fmtDate(due.due, 'medium')}).`;
    if (f.kids.length >= 6) return 'A full house already.';
    return null;
  }
  return null;
}

export function askOut(w: World, npcId: Id): Result {
  const p = player(w);
  const npc = w.citizens[npcId];
  const why = romanceCheck(w, p, npc, 'ask');
  if (why) return fail(why);
  p.flags.askedOut = today(w);
  const chanceYes = Math.max(0.05, Math.min(0.9, 0.25 + ((npc.rel[p.id] ?? 0) - 30) / 80 + standing(p) / 400 + p.attrs.lead / 200 - ideoDistance(npc.ideo, p.ideo) * 0.25 - Math.abs(ageOf(w, npc) - ageOf(w, p)) / 60));
  if (!chance(w, chanceYes)) {
    remember(w, npc, -2, 'asked me out; I said no');
    return ok(`${npc.name} smiles, but says no — “I like you, just not like that.” (${Math.round(chanceYes * 100)}% chance)`);
  }
  pair(w, p, npc, 'dating');
  remember(w, npc, 8, 'asked me out, and I said yes', 'witnessed');
  localNews(w, p.home, `💕 ${p.name} and ${npc.name} are seeing each other.`);
  return ok(`${npc.name} says yes! You are now dating.`);
}

export function goOnDate(w: World): Result {
  const p = player(w);
  const npc = partnerOf(w, p);
  const why = romanceCheck(w, p, npc ?? undefined, 'date');
  if (why) return fail(why);
  const code = w.nations[controller(w.regions[p.loc])].cur;
  pay(w, cref(p.id), hhref(controller(w.regions[p.loc])), code, cur(B.family.dateCost), 'An evening out');
  p.energy -= 15;
  fam(p).lastDate = fam(npc!).lastDate = w.time;
  const d = randInt(w, 3, 8) - (ideoDistance(npc!.ideo, p.ideo) > 0.6 ? 2 : 0);
  adjustRel(npc!, p.id, d);
  p.mood = Math.min(10, p.mood + 1);
  const where = pick(w, ['dinner by the river', 'a film and late noodles', 'a walk and a long talk', 'a concert downtown', 'cooking together at home', 'a day trip out of town']);
  bump(w, 'date');
  return ok(`You and ${npc!.name} had ${where}. ${d >= 6 ? 'A wonderful evening.' : d >= 3 ? 'A good evening.' : 'A slightly awkward evening.'} (relationship ${Math.round(npc!.rel[p.id] ?? 0)})`);
}

export function propose(w: World): Result {
  const p = player(w);
  const npc = partnerOf(w, p);
  const why = romanceCheck(w, p, npc ?? undefined, 'propose');
  if (why) return fail(why);
  const rel = npc!.rel[p.id] ?? 0;
  const yes = Math.max(0.05, Math.min(0.95, (rel - 50) / 40));
  if (!chance(w, yes)) {
    adjustRel(npc!, p.id, -5);
    return ok(`${npc!.name} takes your hand. “Not yet. Ask me again when we're sure.” (relationship ${Math.round(rel)}; ${Math.round(yes * 100)}% chance)`);
  }
  fam(p).status = fam(npc!).status = 'engaged';
  fam(p).since = fam(npc!).since = w.time;
  remember(w, npc!, 10, 'asked me to marry them — I said yes', 'public');
  localNews(w, p.home, `💍 ${p.name} and ${npc!.name} are engaged!`);
  return ok(`${npc!.name} said yes! You are engaged. Plan the wedding when you're ready.`);
}

export function marry(w: World): Result {
  const p = player(w);
  const npc = partnerOf(w, p);
  const why = romanceCheck(w, p, npc ?? undefined, 'wed');
  if (why) return fail(why);
  const nat = controller(w.regions[p.loc]);
  pay(w, cref(p.id), hhref(nat), w.nations[nat].cur, cur(B.family.weddingCost), 'Wedding');
  wed(w, p, npc!);
  fam(p).lastDate = w.time;
  remember(w, npc!, 15, 'married me', 'public');
  addHeirloom(w, p, 'Wedding ring', `married ${npc!.name}, ${fmtDate(w.time, 'long')}`);
  p.influence += 1;
  record(w, 'people', `💒 ${p.name} married ${npc!.name} in ${w.regions[p.loc].name}.`, { cit: p.id, player: true });
  return ok(`You married ${npc!.name}. They move in with you in ${w.regions[p.home].name}.`);
}

export function breakUp(w: World): Result {
  const p = player(w);
  const why = romanceCheck(w, p, undefined, 'leave');
  if (why) return fail(why);
  const npc = partnerOf(w, p);
  const f = fam(p);
  const was = f.status;
  if (was === 'married' && npc) {
    // A divorce settlement: a quarter of your cash in your home currency.
    const code = w.nations[p.nation].cur;
    const share = Math.floor((p.wallet[code] ?? 0) * 0.25);
    if (share > 0) pay(w, cref(p.id), cref(npc.id), code, share, 'Divorce settlement');
  }
  split(w, p, npc);
  if (npc) { remember(w, npc, -30, was === 'married' ? 'divorced me' : 'broke up with me'); localNews(w, p.home, `💔 ${p.name} and ${npc.name} have split up.`); }
  return ok(was === 'married' ? 'The divorce is final. A quarter of your savings went to the settlement.' : 'You ended it.');
}

export function tryForChild(w: World): Result {
  const p = player(w);
  const npc = partnerOf(w, p);
  const why = romanceCheck(w, p, npc ?? undefined, 'child');
  if (why) return fail(why);
  p.flags.triedChild = today(w);
  const young = Math.min(ageOf(w, p), ageOf(w, npc!));
  const odds = young > 44 ? 0.03 : young > 38 ? 0.08 : 0.15;
  if (!chance(w, odds)) return ok('Not this time. (Babies take their time; try again another day.)');
  const preg = conceive(w, p, npc!); // the child is listed once, with the player
  remember(w, npc!, 6, 'is expecting a child with me', 'private');
  milestone(w, p, 'expecting', `learned a baby is on the way with ${npc!.name}`);
  return ok(`🤰 A baby is on the way! Due around ${fmtDate(preg.due, 'long')}.`);
}

/** Everyone the player is related to (for the family panel). */
export function familyOf(w: World, c: Citizen) {
  const f = fam(c);
  const get = (ids: Id[]) => ids.map((id) => w.citizens[id]).filter(Boolean);
  const partner = f.partner != null ? w.citizens[f.partner] : null;
  const kids = [...f.kids, ...(partner && f.status === 'married' ? fam(partner).kids : [])];
  return { status: f.status, since: f.since, partner, parents: get(f.parents), children: get(f.children), kids, exes: get(f.exes) };
}
