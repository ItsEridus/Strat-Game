// Fixed-point accounting. Gold is stored in thousandths, national currencies in
// hundredths. All balances are integers; conversions round explicitly.
import { MONEY, unitPrice } from '../data/economy';

export const GOLD = 'GOLD';

export const scaleOf = (asset: string) => (asset === GOLD ? 1000 : 100);
export const toMinor = (asset: string, whole: number) => Math.round(whole * scaleOf(asset));
export const toWhole = (asset: string, minor: number) => minor / scaleOf(asset);
export const g = (whole: number) => Math.round(whole * 1000); // gold → minor
export const c = (whole: number) => Math.round(whole * 100); // currency → minor

// Formatters are expensive to create, so they are cached by fraction digits.
const FORMATS = new Map<number, Intl.NumberFormat>();
const fmt = (d: number) => {
  let f = FORMATS.get(d);
  if (!f) FORMATS.set(d, (f = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })));
  return f;
};

/** An amount as people in that country would write it: real currency at real prices (data/economy.ts). */
export function fmtAmt(asset: string, minor: number, opts: { sign?: boolean } = {}): string {
  if (asset === GOLD) {
    const whole = toWhole(asset, minor);
    const s = fmt(Math.abs(whole) >= 10000 ? 0 : Math.abs(whole) < 10 ? 3 : 2).format(whole);
    return `${opts.sign && minor > 0 ? '+' : ''}${s} g`;
  }
  const m = MONEY[asset];
  const whole = toLocal(asset, minor);
  const a = Math.abs(whole);
  const s = fmt(!m || m.digits === 0 || a >= 10000 ? 0 : 2).format(a);
  const sign = minor < 0 ? '-' : opts.sign && minor > 0 ? '+' : '';
  return m ? `${sign}${m.symbol}${s}` : `${sign}${s} ${asset}`;
}
/** Whole local currency for an internal amount (minor units of value). */
export const toLocal = (asset: string, minor: number) => (asset === GOLD ? minor / 1000 : (minor / 100) * unitPrice(asset));
/** Internal minor units for an amount of local currency someone typed in. */
export const fromLocal = (asset: string, whole: number) => (asset === GOLD ? Math.round(whole * 1000) : Math.round((whole / unitPrice(asset)) * 100));
/** A sensible step for typing amounts in this currency. */
export const localStep = (asset: string) => { const u = unitPrice(asset); return u >= 1000 ? 1000 : u >= 100 ? 100 : u >= 10 ? 10 : 1; };

/** currency minor units for `goldMinor` gold at `rate` (currency minor per whole gold). Floors. */
export const curForGold = (goldMinor: number, rate: number) => Math.floor((goldMinor * rate) / 1000);
/** gold minor units purchasable with `curMinor` at `rate`. Floors. */
export const goldForCur = (curMinor: number, rate: number) => Math.floor((curMinor * 1000) / rate);
