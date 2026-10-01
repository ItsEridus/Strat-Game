// Real money (1.5 ECON). The simulation keeps every amount in one real unit of
// value: what about 10 US dollars buys in the United States in early 2025.
// Each currency shows that value at its real exchange rate and price level, so a
// wage that buys the same groceries reads $80 in Ohio and ₹1,590 in Maharashtra,
// and a gold coin buys far more in a cheap country than in an expensive one.
//
// Sources: exchange rates are early-January 2025 market rates; price levels are
// the World Bank ICP "price level ratio of PPP conversion factor to market
// exchange rate" (2023–2024, rounded); GDP per head is IMF WEO 2024 at PPP;
// minimum wages are the national (or typical regional) 2025 rate per hour.
export interface Money { name: string; symbol: string; fx: number; level: number; digits: 0 | 2; gdpPc: number; minWage: number }

/** Real US dollars in one unit of value. */
export const UNIT_USD = 10;

export const MONEY: Record<string, Money> = {
  USD: { name: 'US dollar', symbol: '$', fx: 1, level: 1, digits: 2, gdpPc: 85.8, minWage: 7.25 },
  CAD: { name: 'Canadian dollar', symbol: 'C$', fx: 1.44, level: 0.84, digits: 2, gdpPc: 62.7, minWage: 17.3 },
  MXN: { name: 'Mexican peso', symbol: 'MX$', fx: 20.5, level: 0.56, digits: 2, gdpPc: 25.4, minWage: 34.9 },
  BRL: { name: 'Brazilian real', symbol: 'R$', fx: 6.15, level: 0.47, digits: 2, gdpPc: 22.3, minWage: 6.9 },
  ARS: { name: 'Argentine peso', symbol: 'AR$', fx: 1035, level: 0.55, digits: 0, gdpPc: 29.4, minWage: 1500 },
  GBP: { name: 'Pound sterling', symbol: '£', fx: 0.8, level: 0.9, digits: 2, gdpPc: 58.9, minWage: 12.21 },
  EUR: { name: 'Euro', symbol: '€', fx: 0.97, level: 0.82, digits: 2, gdpPc: 69.3, minWage: 12.82 },
  RUB: { name: 'Russian rouble', symbol: '₽', fx: 101, level: 0.34, digits: 0, gdpPc: 45.8, minWage: 135 },
  TRY: { name: 'Turkish lira', symbol: '₺', fx: 35.4, level: 0.36, digits: 2, gdpPc: 44.6, minWage: 132 },
  SAR: { name: 'Saudi riyal', symbol: 'SR', fx: 3.75, level: 0.5, digits: 2, gdpPc: 70.3, minWage: 21.9 },
  ZAR: { name: 'South African rand', symbol: 'R', fx: 18.8, level: 0.4, digits: 2, gdpPc: 16.3, minWage: 28.8 },
  INR: { name: 'Indian rupee', symbol: '₹', fx: 85.7, level: 0.23, digits: 0, gdpPc: 10.9, minWage: 55 },
  CNY: { name: 'Chinese yuan', symbol: 'CN¥', fx: 7.3, level: 0.56, digits: 2, gdpPc: 26.3, minWage: 26 },
  JPY: { name: 'Japanese yen', symbol: '¥', fx: 157, level: 0.6, digits: 0, gdpPc: 52.0, minWage: 1055 },
  KRW: { name: 'South Korean won', symbol: '₩', fx: 1470, level: 0.62, digits: 0, gdpPc: 60.2, minWage: 10030 },
  AUD: { name: 'Australian dollar', symbol: 'A$', fx: 1.61, level: 0.92, digits: 2, gdpPc: 68.0, minWage: 24.1 },
};

/** Local currency (whole) per unit of value: exchange rate × price level × US dollars per unit. */
export const unitPrice = (code: string) => { const m = MONEY[code]; return m ? m.fx * m.level * UNIT_USD : 1; };
/** A currency's price level against the US (1 = US prices). */
export const priceLevel = (code: string) => MONEY[code]?.level ?? 1;
