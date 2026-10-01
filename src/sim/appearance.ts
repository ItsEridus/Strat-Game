// Changing how you look during a life: a haircut or a new colour at the
// hairdresser, glasses from the optician, a tattoo or piercing (or having one
// removed), shaving or growing a beard, and taking your partner's surname.
// Paid services go to local households through the ledger like any purchase.
import type { Citizen, World } from './types';
import { pay } from '../engine/ledger';
import { c as cur, fmtAmt } from '../engine/money';
import { fail, ok, type Result } from '../engine/result';
import { controller, cref, hhref, jailed, player } from './query';
import { HAIR_COLORS, HAIR_STYLES, lookOf, type Look } from './looks';
import { partnerOf, familyOf } from './family';
import { isMinor } from './childhood';

export type LookChange = 'hair' | 'colour' | 'glasses' | 'mark' | 'beard';
/** What each change costs, in days of essentials (about 4 a day). */
export const LOOK_PRICES: Record<LookChange, { label: string; icon: string; price: number }> = {
  hair: { label: 'Haircut', icon: '💇', price: 6 },
  colour: { label: 'Hair colour', icon: '🎨', price: 12 },
  glasses: { label: 'Glasses or contacts', icon: '👓', price: 20 },
  mark: { label: 'Tattoo or piercing', icon: '🖋️', price: 30 },
  beard: { label: 'Beard', icon: '🧔', price: 0 },
};

export function lookCost(w: World, c: Citizen, k: LookChange) {
  const nat = controller(w.regions[c.loc]);
  const code = w.nations[nat].cur;
  return { code, amount: cur(LOOK_PRICES[k].price), nat };
}

export function changeLookCheck(w: World, c: Citizen, k: LookChange, value: number | boolean | Look['mark']): string | null {
  if (jailed(w, c)) return 'Not while you are in prison.';
  const now = lookOf(w, c);
  if (k === 'hair' && (typeof value !== 'number' || value < 0 || value >= HAIR_STYLES.length)) return 'Pick a style.';
  if (k === 'colour' && (typeof value !== 'number' || value < 0 || value >= HAIR_COLORS.length)) return 'Pick a colour.';
  if (k === 'beard' && (typeof value !== 'number' || value < 0 || value > 3)) return 'Pick a beard.';
  if (k === 'beard' && value && isMinor(w, c)) return 'Not yet.';
  if (k === 'mark' && value && isMinor(w, c)) return 'You need to be 18 for a tattoo or piercing.';
  const field = ({ hair: 'hair', colour: 'hairColor', glasses: 'glasses', mark: 'mark', beard: 'beard' } as const)[k];
  if ((now[field] ?? null) === (value ?? null)) return 'That is how you look already.';
  const { code, amount } = lookCost(w, c, k);
  // Taking glasses off or a mark away costs the same as getting them (laser surgery, removal).
  if (amount && (c.wallet[code] ?? 0) < amount) return `It costs ${fmtAmt(code, amount)}.`;
  return null;
}

/** Change one thing about how you look (paid where it is a service). */
export function changeLook(w: World, k: LookChange, value: number | boolean | Look['mark'], c: Citizen = player(w)): Result {
  const why = changeLookCheck(w, c, k, value);
  if (why) return fail(why);
  const { code, amount, nat } = lookCost(w, c, k);
  if (amount) pay(w, cref(c.id), hhref(nat), code, amount, LOOK_PRICES[k].label);
  const look = { ...lookOf(w, c) };
  if (k === 'hair') look.hair = value as number;
  if (k === 'colour') look.hairColor = value as number;
  if (k === 'glasses') look.glasses = !!value;
  if (k === 'mark') look.mark = (value || null) as Look['mark'];
  if (k === 'beard') look.beard = value as number;
  c.look = look;
  const what = k === 'hair' ? `a new haircut (${HAIR_STYLES[look.hair].toLowerCase()})` : k === 'colour' ? 'a new hair colour' : k === 'glasses' ? (look.glasses ? 'new glasses' : 'contact lenses') : k === 'mark' ? (look.mark ? `a ${look.mark}` : 'the mark removed') : look.beard ? 'a beard' : 'a clean shave';
  return ok(`You have ${what}${amount ? ` (${fmtAmt(code, amount)})` : ''}.`);
}

const surname = (c: Citizen) => c.name.split(' ').slice(1).join(' ');
export function takeSurnameCheck(w: World, c: Citizen): string | null {
  const p = partnerOf(w, c);
  if (!p || familyOf(w, c).status !== 'married') return 'Only when you are married.';
  if (!surname(p) || surname(p) === surname(c)) return 'You already share a surname.';
  return null;
}
/** Take your spouse's surname (free, at the registry office). */
export function takeSurname(w: World, c: Citizen = player(w)): Result {
  const why = takeSurnameCheck(w, c);
  if (why) return fail(why);
  const p = partnerOf(w, c)!;
  const before = c.name;
  c.name = `${c.name.split(' ')[0]} ${surname(p)}`;
  return ok(`${before} is now ${c.name}.`);
}
