// Fixed-point accounting. Gold is stored in thousandths, national currencies in
// hundredths. All balances are integers; conversions round explicitly.
export const GOLD = 'GOLD';

export const scaleOf = (asset: string) => (asset === GOLD ? 1000 : 100);
export const toMinor = (asset: string, whole: number) => Math.round(whole * scaleOf(asset));
export const toWhole = (asset: string, minor: number) => minor / scaleOf(asset);
export const g = (whole: number) => Math.round(whole * 1000); // gold → minor
export const c = (whole: number) => Math.round(whole * 100); // currency → minor

export function fmtAmt(asset: string, minor: number, opts: { sign?: boolean } = {}): string {
  const whole = toWhole(asset, minor);
  const digits = asset === GOLD ? (Math.abs(whole) < 10 ? 3 : 2) : 2;
  const s = whole.toLocaleString('en-US', { minimumFractionDigits: Math.abs(whole) >= 10000 ? 0 : digits, maximumFractionDigits: Math.abs(whole) >= 10000 ? 0 : digits });
  const sign = opts.sign && minor > 0 ? '+' : '';
  return asset === GOLD ? `${sign}${s} g` : `${sign}${s} ${asset}`;
}

/** currency minor units for `goldMinor` gold at `rate` (currency minor per whole gold). Floors. */
export const curForGold = (goldMinor: number, rate: number) => Math.floor((goldMinor * rate) / 1000);
/** gold minor units purchasable with `curMinor` at `rate`. Floors. */
export const goldForCur = (curMinor: number, rate: number) => Math.floor((curMinor * 1000) / rate);
