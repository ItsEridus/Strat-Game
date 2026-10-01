// Real money (1.5 ECON). The simulation keeps amounts in units of value: one unit is
// the same share of a typical day's pay in every country (about $25 in the United
// States). Each currency shows it in real money at real 2025 pay, so a coffee reads
// $5.00 in Ohio and ₹20 in Maharashtra, and gold (worth $2,500 at market exchange
// rates) is a fortune where pay is low.
//
// Sources: exchange rates are early-January 2025 market rates; price levels are
// the World Bank ICP "price level ratio of PPP conversion factor to market
// exchange rate" (2023–2024, rounded); GDP per head is IMF WEO 2024 at PPP;
// minimum wages are the national (or typical regional) 2025 rate per hour; median pay is a full-time
// worker's gross pay per working day (national statistics offices, OECD, ILO; 2024, rounded). GDP per head is in
// thousands of dollars.
export interface Money { name: string; symbol: string; fx: number; level: number; digits: 0 | 2; gdpPc: number; minWage: number; median: number }

/** Real US dollars in one unit of value. */
export const UNIT_USD = 25;

export const MONEY: Record<string, Money> = {
  USD: { name: 'US dollar', symbol: '$', fx: 1, level: 1, digits: 2, gdpPc: 85.8, minWage: 7.25, median: 230 },
  CAD: { name: 'Canadian dollar', symbol: 'C$', fx: 1.44, level: 0.84, digits: 2, gdpPc: 62.7, minWage: 17.3, median: 230 },
  MXN: { name: 'Mexican peso', symbol: 'MX$', fx: 20.5, level: 0.56, digits: 2, gdpPc: 25.4, minWage: 34.9, median: 410 },
  BRL: { name: 'Brazilian real', symbol: 'R$', fx: 6.15, level: 0.47, digits: 2, gdpPc: 22.3, minWage: 6.9, median: 136 },
  ARS: { name: 'Argentine peso', symbol: 'AR$', fx: 1035, level: 0.55, digits: 0, gdpPc: 29.4, minWage: 1500, median: 41000 },
  GBP: { name: 'Pound sterling', symbol: '£', fx: 0.8, level: 0.9, digits: 2, gdpPc: 58.9, minWage: 12.21, median: 133 },
  EUR: { name: 'Euro', symbol: '€', fx: 0.97, level: 0.82, digits: 2, gdpPc: 69.3, minWage: 12.82, median: 175 },
  RUB: { name: 'Russian rouble', symbol: '₽', fx: 101, level: 0.34, digits: 0, gdpPc: 45.8, minWage: 135, median: 3650 },
  TRY: { name: 'Turkish lira', symbol: '₺', fx: 35.4, level: 0.36, digits: 2, gdpPc: 44.6, minWage: 132, median: 1600 },
  SAR: { name: 'Saudi riyal', symbol: 'SR', fx: 3.75, level: 0.5, digits: 2, gdpPc: 70.3, minWage: 21.9, median: 320 },
  ZAR: { name: 'South African rand', symbol: 'R', fx: 18.8, level: 0.4, digits: 2, gdpPc: 16.3, minWage: 28.8, median: 760 },
  INR: { name: 'Indian rupee', symbol: '₹', fx: 85.7, level: 0.23, digits: 0, gdpPc: 10.9, minWage: 55, median: 900 },
  CNY: { name: 'Chinese yuan', symbol: 'CN¥', fx: 7.3, level: 0.56, digits: 2, gdpPc: 26.3, minWage: 26, median: 365 },
  JPY: { name: 'Japanese yen', symbol: '¥', fx: 157, level: 0.6, digits: 0, gdpPc: 52.0, minWage: 1055, median: 14100 },
  KRW: { name: 'South Korean won', symbol: '₩', fx: 1470, level: 0.62, digits: 0, gdpPc: 60.2, minWage: 10030, median: 155000 },
  AUD: { name: 'Australian dollar', symbol: 'A$', fx: 1.61, level: 0.92, digits: 2, gdpPc: 68.0, minWage: 24.1, median: 320 },
};

/** A US median day's pay in units of value (about 9.2 at $25 a unit). */
const US_DAY = MONEY.USD.median / UNIT_USD;
/**
 * Local currency (whole) per unit of value. A unit is the same share of a typical day's pay everywhere
 * (about $25 in the US, ₹98 in India), so prices, wages and costs in the simulation keep their meaning
 * in every country; what differs between countries is what that pay buys abroad (the gold rate below).
 */
export const unitPrice = (code: string) => { const m = MONEY[code]; return m ? m.median / US_DAY : 1; };
/** A currency's price level against the US (1 = US prices). */
export const priceLevel = (code: string) => MONEY[code]?.level ?? 1;
/** How well paid people are compared with the US, in real terms (median pay at local prices; US = 1). */
export const wageLevel = (code: string) => { const m = MONEY[code]; return m ? m.median / (m.fx * m.level) / MONEY.USD.median : 1; };
/** Units of value per gold at the start: gold is worth $2,500 at market exchange rates everywhere. */
export const goldRate = (code: string) => { const m = MONEY[code]; return m ? (UNIT_USD * 100 * m.fx) / unitPrice(code) : 100; };
/** Gold costs scaled to a country (1 in the US; far less where pay is low at market exchange rates). */
export const goldScale = (code: string) => 100 / goldRate(code);
/** The minimum wage for a day's shift (8 hours), in internal minor units. */
export const minWageShift = (code: string) => { const m = MONEY[code]; return m ? Math.round(((m.minWage * 8) / unitPrice(code)) * 100) : 500; };
