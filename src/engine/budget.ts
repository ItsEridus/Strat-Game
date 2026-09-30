// The player's budget: every money movement of theirs, summed by category and
// calendar month (the transaction list keeps only the latest 300; this keeps
// whole months). Pure bookkeeping: it never moves money.
import type { AssetId, World } from '../sim/types';
import { dateAt } from './calendar';

export interface BudgetMonth { key: string; asset: Record<AssetId, Record<string, number>> } // category -> net amount (minor units)

/** Category of a transaction, from its description. */
const RULES: [RegExp, string][] = [
  [/wage|salary|shift pay|public works/i, 'Wages'],
  [/dividend|profit|share sale|sold .*shares|interest/i, 'Investments'],
  [/living costs/i, 'Living costs'],
  [/raising children|start in life|leaving-care/i, 'Children'],
  [/adoption/i, 'Children'],
  [/food and care for|adopting a/i, 'Pets'],
  [/supplies|hobby/i, 'Hobbies'],
  [/flowers|gift/i, 'Gifts'],
  [/tax/i, 'Taxes'],
  [/rent|mortgage|deposit on|house|home purchase/i, 'Housing'],
  [/loan|repayment|debt/i, 'Loans'],
  [/tuition|school|course|university/i, 'Education'],
  [/clinic|treatment|medicine|hospital|doctor/i, 'Health'],
  [/wedding|date|evening out|coffee|restaurant|meal/i, 'Going out'],
  [/market|shop purchase|bought|buy|sell|sold|auction|bid/i, 'Trade'],
  [/company|founding|upgrade|relocation|manager|contract/i, 'Business'],
  [/fine|court|lawyer|bail/i, 'Legal'],
  [/pension|benefit|transfer|grant|aid|missions/i, 'Benefits'],
];
export function budgetCategory(text: string): string {
  for (const [re, cat] of RULES) if (re.test(text)) return cat;
  return 'Other';
}

export const monthKey = (t: number) => { const d = dateAt(t); return `${d.year}-${String(d.month + 1).padStart(2, '0')}`; };

/** Record one of the player's money movements (called by the ledger). Keeps 13 months. */
export function budgetRecord(w: World, text: string, amount: number, asset: AssetId) {
  if (!amount) return;
  const months = (w.budget ??= []);
  const key = monthKey(w.time);
  let m = months.at(-1);
  if (!m || m.key !== key) { m = { key, asset: {} }; months.push(m); if (months.length > 13) months.shift(); }
  const cats = (m.asset[asset] ??= {});
  const cat = budgetCategory(text);
  cats[cat] = (cats[cat] ?? 0) + amount;
}
