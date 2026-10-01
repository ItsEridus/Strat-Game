// Family life beyond romance: pregnancies that end in a birth months later,
// brothers and sisters, gifts that warm a relationship, and pets that need
// looking after. Money and goods move through the ledger like everything else.
import { releaseTrusts } from './legacy';
import type { Citizen, Id, Kid, Pet, World } from './types';
import { B } from '../data/balance';
import { gradeLc, itemName, kindOf, qualityOf } from '../data/items';
import { DAY } from '../engine/clock';
import { fmtDate } from '../engine/calendar';
import { moveItems, pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { nid, notify } from '../engine/events';
import { chance, pick, randInt } from '../engine/rng';
import { NAME_POOLS } from '../data/names';
import { census } from './census';
import { newResident } from './population';
import { fail, ok, type Result } from '../engine/result';
import { controller, cref, hhref, jailed, natref, player, today } from './query';
import { ageOf, bornYearsAgo, lifeYear } from './growth';
import { lifeOf, milestone } from './lifecycle';
import { remember } from './story';
import { adjustRel } from './social';
import { fam, haveBaby } from './family';

// ---------- pregnancy ----------

/** A pregnancy the player is part of, if any. */
export const expecting = (w: World, c: Citizen) => w.life.pregnancies.find((p) => p.parents.includes(c.id));

/** A child is on the way: born about nine months later (on the pace of life). */
export function conceive(w: World, a: Citizen, b: Citizen) {
  const due = w.time + Math.round(lifeYear(w) * 0.75);
  const preg = { id: nid(w), parents: [a.id, b.id], due, home: a.home };
  w.life.pregnancies.push(preg);
  return preg;
}

/** Hourly: babies due are born. */
export function pregnanciesHourly(w: World) {
  const due = w.life.pregnancies.filter((p) => p.due <= w.time);
  if (!due.length) return;
  w.life.pregnancies = w.life.pregnancies.filter((p) => p.due > w.time);
  for (const p of due) {
    const [a, b] = p.parents.map((id) => w.citizens[id]);
    if (!a || !b || a.gone) continue;
    const kid = haveBaby(w, a, b);
    const pl = player(w);
    if (p.parents.includes(pl.id)) {
      const other = a.id === pl.id ? b : a;
      notify(w, 'personal', `👶 ${kid.name} is born! ${other.gone ? '' : `You and ${other.name.split(' ')[0]} are parents now. `}Children grow up at home and come of age at ${B.life.adultAge}.`, { critical: true, link: 'life' });
      milestone(w, pl, 'child', `${kid.name} was born`);
      if (!other.gone) remember(w, other, 10, 'had a child with me', 'public');
    }
  }
}

// ---------- brothers and sisters ----------

/** Brothers and sisters: the other children of one's parents (grown-up citizens and children at home). */
export function siblingsOf(w: World, c: Citizen): { grown: Citizen[]; young: { name: string; born: number }[] } {
  const f = fam(c);
  const grown = new Map<Id, Citizen>();
  const young: { name: string; born: number }[] = [];
  for (const pid of f.parents) {
    const parent = w.citizens[pid];
    if (!parent) continue;
    for (const id of fam(parent).children) if (id !== c.id && w.citizens[id]) grown.set(id, w.citizens[id]);
    for (const k of fam(parent).kids) if (!young.some((y) => y.name === k.name && y.born === k.born)) young.push(k);
  }
  return { grown: [...grown.values()], young };
}

// ---------- gifts ----------

/** What a gift is worth to the one who receives it (relationship points). */
export function giftValue(key: string): number {
  if (key === 'flowers') return 4;
  const q = qualityOf(key);
  switch (kindOf(key)) {
    case 'clothing': return 3 + 2 * q;
    case 'electronics': return 4 + 3 * q;
    case 'food': return 1 + q;
    case 'medicine': return 2 + q;
    default: return 0;
  }
}
export const GIFTABLE = ['clothing', 'electronics', 'food', 'medicine'];

export function giftCheck(w: World, p: Citizen, npc: Citizen | undefined, key: string): string | null {
  if (!npc || npc.gone || npc.player) return 'Nobody to give it to.';
  if (jailed(w, p)) return 'You are in prison.';
  if (npc.loc !== p.loc) return `${npc.name} is in ${w.regions[npc.loc].name}.`;
  if ((lifeOf(npc).giftDay ?? -1) === today(w) && lifeOf(npc).giftFrom === p.id) return 'One gift a day is enough.';
  if (key === 'flowers') {
    const code = w.nations[controller(w.regions[p.loc])].cur;
    if ((p.wallet[code] ?? 0) < cur(B.family.flowers)) return `Flowers cost ${fmtAmt(code, cur(B.family.flowers))}.`;
    return null;
  }
  if (!GIFTABLE.includes(kindOf(key)) || !giftValue(key)) return 'Not something to give.';
  if ((p.inv[key] ?? 0) < 1) return `You have no ${itemName(key).toLowerCase()}.`;
  return null;
}

export function giveGift(w: World, npcId: Id, key: string): Result {
  const p = player(w);
  const npc = w.citizens[npcId];
  const why = giftCheck(w, p, npc, key);
  if (why) return fail(why);
  const what = key === 'flowers' ? 'flowers' : `${gradeLc(qualityOf(key))} ${itemName(key).split(' ').slice(1).join(' ')}`;
  if (key === 'flowers') {
    const code = w.nations[controller(w.regions[p.loc])].cur;
    pay(w, cref(p.id), hhref(controller(w.regions[p.loc])), code, cur(B.family.flowers), `Flowers for ${npc.name}`);
  } else moveItems(w, cref(p.id), cref(npc.id), key, 1);
  const L = lifeOf(npc);
  L.giftDay = today(w); L.giftFrom = p.id;
  const v = giftValue(key);
  remember(w, npc, v, `gave me ${what}`, 'private');
  adjustRel(p, npc.id, Math.round(v / 2));
  return ok(`${npc.name.split(' ')[0]} is touched by the ${what} (+${v}).`);
}

// ---------- pets ----------

export const PET_KINDS: Record<string, { icon: string; label: string; cost: number; upkeep: number; lifespan: number; names: string[] }> = {
  dog: { icon: '🐕', label: 'Dog', cost: 60, upkeep: 2, lifespan: 13, names: ['Max', 'Bella', 'Rocky', 'Luna', 'Buddy', 'Daisy', 'Charlie', 'Milo', 'Ruby', 'Scout'] },
  cat: { icon: '🐈', label: 'Cat', cost: 40, upkeep: 1, lifespan: 15, names: ['Oliver', 'Chloe', 'Leo', 'Nala', 'Simba', 'Misty', 'Tiger', 'Pepper', 'Mochi', 'Smokey'] },
};
export const petsOf = (w: World, c: Citizen) => w.life.pets.filter((x) => x.owner === c.id && !x.gone);
export const petAge = (w: World, pet: Pet) => Math.floor((w.time - pet.born) / lifeYear(w));

export function adoptCheck(w: World, p: Citizen, kind: string): string | null {
  const k = PET_KINDS[kind];
  if (!k) return 'Unknown animal.';
  if (jailed(w, p)) return 'You are in prison.';
  if (petsOf(w, p).length >= 3) return 'Three pets is a full house.';
  const code = w.nations[p.nation].cur;
  if ((p.wallet[code] ?? 0) < cur(k.cost)) return `Adoption fees and supplies come to ${fmtAmt(code, cur(k.cost))}.`;
  return null;
}

export function adoptPet(w: World, kind: string): Result {
  const p = player(w);
  const why = adoptCheck(w, p, kind);
  if (why) return fail(why);
  const k = PET_KINDS[kind];
  const code = w.nations[p.nation].cur;
  pay(w, cref(p.id), hhref(p.nation), code, cur(k.cost), `Adopting a ${k.label.toLowerCase()}`);
  const pet: Pet = { id: nid(w), name: pick(w, k.names), kind, born: w.time - Math.round(lifeYear(w) * (1 + (w.rng & 3))), owner: p.id, health: 90, bond: 30, lastCare: today(w) };
  w.life.pets.push(pet);
  milestone(w, p, 'pet', `adopted ${pet.name}, a ${k.label.toLowerCase()}`);
  return ok(`${k.icon} Meet ${pet.name}! Look after them every day or two: a walk, play, a fuss.`);
}

export function careCheck(w: World, p: Citizen, pet: Pet | undefined): string | null {
  if (!pet || pet.gone || pet.owner !== p.id) return 'Not your pet.';
  if (pet.lastCare === today(w)) return `${pet.name} has had your attention today.`;
  if (p.energy < 5) return 'Needs 5 energy.';
  return null;
}

export function careForPet(w: World, petId: Id): Result {
  const p = player(w);
  const pet = w.life.pets.find((x) => x.id === petId);
  const why = careCheck(w, p, pet);
  if (why) return fail(why);
  p.energy -= 5;
  pet!.lastCare = today(w);
  pet!.bond = Math.min(100, pet!.bond + 8);
  pet!.health = Math.min(100, pet!.health + 2);
  return ok(`${PET_KINDS[pet!.kind].icon} ${pet!.name} ${pet!.kind === 'dog' ? 'loved the walk' : 'curled up on your lap'} (bond ${Math.round(pet!.bond)}).`);
}

/** Daily: upkeep, neglect, old age. */
export function petsDaily(w: World) {
  const d = today(w);
  for (const pet of w.life.pets) {
    if (pet.gone) continue;
    const owner = w.citizens[pet.owner];
    const k = PET_KINDS[pet.kind];
    if (!owner || owner.gone) { pet.gone = { t: w.time, why: 'rehomed' }; continue; }
    const code = w.nations[owner.nation].cur;
    const fed = pay(w, cref(owner.id), hhref(owner.nation), code, cur(k.upkeep), `Food and care for ${pet.name}`);
    if (!fed) pet.health = Math.max(0, pet.health - 6);
    if (d - pet.lastCare > 2) pet.bond = Math.max(0, pet.bond - 3);
    const age = petAge(w, pet);
    if (age > k.lifespan - 3) pet.health = Math.max(0, pet.health - 0.4);
    const dies = pet.health <= 0 || (age >= k.lifespan - 2 && chance(w, 0.2 / (w.settings.lifeYearDays ?? 365) * (age - k.lifespan + 3)));
    if (dies) {
      pet.gone = { t: w.time, why: 'died' };
      if (owner.player) {
        notify(w, 'personal', `🕊️ ${pet.name} has died${pet.health <= 0 ? '' : ` at ${age}, after a good long life`}.`, { critical: true, link: 'life' });
        milestone(w, owner, 'pet', `lost ${pet.name}`);
        const L = lifeOf(owner);
        L.grief = Math.min(20, (L.grief ?? 0) + Math.round(pet.bond / 8));
      }
    } else if (pet.bond < 5 && d - pet.lastCare > 14) {
      pet.gone = { t: w.time, why: 'rehomed' };
      if (owner.player) notify(w, 'personal', `${k.icon} ${pet.name} was neglected and has been rehomed by a shelter.`, { critical: true, link: 'life' });
    }
  }
  if (w.life.pets.length > 60) w.life.pets = w.life.pets.filter((x) => !x.gone || w.time - x.gone.t < 365 * DAY);
}

/** A happy home: a pet one is close to lifts the spirits (read by wellbeing). */
export const petComfort = (w: World, c: Citizen) => petsOf(w, c).reduce((best, x) => Math.max(best, x.bond), 0);

export const dueText = (due: number) => fmtDate(due, 'long');

// ---------- adoption and children in care ----------

/** Children in care in a country, waiting for a family. */
export const inCare = (w: World, nation: Id) => w.life.orphans.filter((o) => controller(w.regions[o.region]) === nation);
export const adoptionOf = (w: World, c: Citizen) => w.life.adoptions.find((a) => a.parents.includes(c.id));
const surnameOf = (c: Citizen) => c.name.split(' ').slice(1).join(' ') || c.name;
const renamed = (name: string, family: Citizen) => `${name.split(' ')[0]} ${surnameOf(family)}`;

export function adoptChildCheck(w: World, p: Citizen): string | null {
  if (jailed(w, p)) return 'You are in prison.';
  if (ageOf(w, p) < 21) return 'Adoptive parents must be 21 or older.';
  if (adoptionOf(w, p)) return 'Your application is already being assessed.';
  const f = fam(p);
  if (f.status === 'dating' || f.status === 'engaged') return 'Couples apply together once married (or apply on your own while single).';
  if (f.kids.length >= 6) return 'A full house already.';
  const code = w.nations[p.nation].cur;
  if ((p.wallet[code] ?? 0) < cur(B.family.adoptFee)) return `The adoption fees come to ${fmtAmt(code, cur(B.family.adoptFee))}.`;
  return null;
}

/** Apply to adopt: the fee goes to the state, and an assessment takes about a month. */
export function applyToAdopt(w: World): Result {
  const p = player(w);
  const why = adoptChildCheck(w, p);
  if (why) return fail(why);
  const code = w.nations[p.nation].cur;
  pay(w, cref(p.id), natref(p.nation), code, cur(B.family.adoptFee), 'Adoption fees');
  const partner = fam(p).status === 'married' && fam(p).partner != null ? w.citizens[fam(p).partner!] : null;
  w.life.adoptions.push({ id: nid(w), parents: [p.id, ...(partner ? [partner.id] : [])], ready: w.time + B.family.adoptDays * DAY, fee: cur(B.family.adoptFee), cur: code });
  return ok(`📝 Application sent. A social worker will visit; a decision comes around ${dueText(w.time + B.family.adoptDays * DAY)}.`);
}

/** A child in care joins a family (the youngest waiting, or one from the wider care system). */
function placeChild(w: World, parent: Citizen): Kid {
  const waiting = inCare(w, parent.nation).sort((a, b) => b.born - a.born);
  const o = waiting.find((x) => ageOf(w, x) < 12) ?? waiting[0];
  let kid: Kid;
  if (o) {
    w.life.orphans.splice(w.life.orphans.indexOf(o), 1);
    kid = { name: renamed(o.name, parent), born: o.born, how: 'adopted' };
  } else {
    const pool = NAME_POOLS[w.nations[parent.nation].cur];
    kid = { name: `${pick(w, pool.first)} ${surnameOf(parent)}`, born: bornYearsAgo(w, randInt(w, 1, 9), randInt(w, 0, 300)), how: 'adopted' };
  }
  fam(parent).kids.push(kid);
  return kid;
}

/** Daily: applications decided, children in care placed with families or leaving care at 18. */
export function adoptionsDaily(w: World) {
  for (const a of w.life.adoptions.filter((x) => x.ready <= w.time)) {
    w.life.adoptions.splice(w.life.adoptions.indexOf(a), 1);
    const parent = w.citizens[a.parents[0]];
    if (!parent || parent.gone) continue;
    if (jailed(w, parent)) { if (parent.player) notify(w, 'personal', '📝 Your adoption application was turned down: a parent in prison cannot adopt.', { critical: true, link: 'life' }); continue; }
    const kid = placeChild(w, parent);
    if (parent.player) {
      notify(w, 'personal', `🏠 ${kid.name}, ${ageOf(w, kid)}, is coming home with you. Welcome to the family!`, { critical: true, link: 'life' });
      milestone(w, parent, 'child', `adopted ${kid.name}`);
      const other = a.parents[1] != null ? w.citizens[a.parents[1]] : null;
      if (other && !other.gone) remember(w, other, 8, 'adopted a child with me', 'public');
    }
  }
  // Families nearby adopt children in care now and then (married couples with room at home).
  if (w.life.orphans.length && chance(w, 0.2)) {
    const o = pick(w, w.life.orphans);
    const nation = controller(w.regions[o.region]);
    const home = census(w).all.find((c) => !c.player && !c.gone && c.nation === nation && c.home === o.region && c.family?.status === 'married' && c.family.kids.length < 3 && ageOf(w, c) >= 25 && ageOf(w, c) <= 50 && chance(w, 0.1));
    if (home) { w.life.orphans.splice(w.life.orphans.indexOf(o), 1); fam(home).kids.push({ name: renamed(o.name, home), born: o.born, how: 'adopted' }); }
  }
  // Leaving care at 18: a citizen in their own right, with a small grant from the state.
  for (const o of w.life.orphans.filter((x) => ageOf(w, x) >= B.life.adultAge)) {
    w.life.orphans.splice(w.life.orphans.indexOf(o), 1);
    const nation = w.nations[controller(w.regions[o.region])];
    const c = newResident(w, nation, o.region, { name: o.name, age: B.life.adultAge, funded: true });
    c.born = o.born;
    fam(c).parents = o.parents.filter((id) => w.citizens[id]);
    releaseTrusts(w, o, c);
    pay(w, natref(nation.id), cref(c.id), nation.cur, cur(B.family.careLeaver), 'Leaving-care grant');
  }
}

/** Where a child at home came from, in words. */
export const KID_HOW: Record<NonNullable<Kid['how']>, string> = { adopted: 'adopted', grandchild: 'grandchild, in your care', sibling: 'younger sibling, in your care', stepchild: 'stepchild', fostered: 'fostered' };
