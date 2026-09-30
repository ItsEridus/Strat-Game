// Sortable tables: click a column header to sort by it, click again to reverse.
// Each table remembers its choice on this computer. Text sorts A→Z first,
// numbers largest first (a column can choose otherwise); ties keep their order.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

export type SortDir = 'asc' | 'desc';
export interface SortBy { key: string; dir: SortDir }
/** A column's sort value, and the direction its first click sorts in. */
export type SortCol<T> = ((r: T) => string | number | null | undefined) | { get: (r: T) => string | number | null | undefined; first?: SortDir };

const KEY = (id: string) => `meridian-sort:${id}`;
function load(id: string): SortBy | null { try { return JSON.parse(localStorage.getItem(KEY(id)) ?? 'null'); } catch { return null; } }
function save(id: string, s: SortBy) { try { localStorage.setItem(KEY(id), JSON.stringify(s)); } catch { /* not remembered */ } }

const getter = <T,>(c: SortCol<T>) => (typeof c === 'function' ? c : c.get);
function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1; // blanks last
  if (b == null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sort rows by the chosen column. `th(key, label)` renders a clickable header.
 * `id` names the table so the choice is remembered (e.g. "jobs").
 */
export function useSort<T>(id: string, rows: T[], cols: Record<string, SortCol<T>>, initial: SortBy) {
  const [by, set] = useState<SortBy>(() => { const s = load(id); return s && cols[s.key] ? s : initial; });
  const col = cols[by.key] ?? cols[initial.key];
  const get = getter(col);
  const sign = by.dir === 'asc' ? 1 : -1;
  const sorted = rows.map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const blankA = a.v == null || a.v === '', blankB = b.v == null || b.v === '';
      if (blankA !== blankB) return blankA ? 1 : -1; // blanks always last, whichever the direction
      return sign * compare(a.v, b.v) || a.i - b.i;
    })
    .map((x) => x.r);
  const choose = (key: string) => {
    const c = cols[key];
    const first: SortDir = typeof c === 'object' && c.first ? c.first : typeof getter(c)(rows[0] as T) === 'number' ? 'desc' : 'asc';
    const next: SortBy = by.key === key ? { key, dir: by.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: first };
    set(next);
    save(id, next);
  };
  const th = (key: string, label: ComponentChildren, cls = '') => (
    <th class={`sortable ${cls} ${by.key === key ? 'sorted' : ''}`} aria-sort={by.key === key ? (by.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => choose(key)} title={`Sort by ${typeof label === 'string' ? label.toLowerCase() : 'this column'}`}>
        {label}<span class="arrow" aria-hidden>{by.key === key ? (by.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
  return { rows: sorted, th, by };
}
