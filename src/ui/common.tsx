// Shared UI building blocks.
import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Id, World } from '../sim/types';
import type { Result } from '../engine/result';
import { fmtAmt } from '../engine/money';
import { itemIcon, itemName } from '../data/items';
import { store } from './store';

/** Button that is disabled with a visible reason when `why` is a string. */
export function Btn(props: { onClick: () => void; why?: string | null | false; children: ComponentChildren; kind?: 'primary' | 'danger' | 'ghost'; small?: boolean; title?: string; showWhy?: boolean }) {
  const blocked = typeof props.why === 'string' && props.why.length > 0;
  return (
    <span class="btn-wrap">
      <button
        class={`btn ${props.kind ?? ''} ${props.small ? 'sm' : ''}`}
        disabled={blocked}
        title={blocked ? (props.why as string) : props.title}
        onClick={(e) => { e.stopPropagation(); props.onClick(); }}
      >
        {props.children}
      </button>
      {blocked && props.showWhy !== false && <span class="why">{props.why}</span>}
    </span>
  );
}

/** Button that runs a player action through the store. */
export function ActBtn(props: { run: (w: World) => Result | void; why?: string | null | false; children: ComponentChildren; kind?: 'primary' | 'danger' | 'ghost'; small?: boolean; confirm?: string; showWhy?: boolean; title?: string }) {
  return (
    <Btn why={props.why} kind={props.kind} small={props.small} showWhy={props.showWhy} title={props.title} onClick={() => {
      if (props.confirm && !window.confirm(props.confirm)) return;
      store.act(props.run);
    }}>{props.children}</Btn>
  );
}

export const Amt = ({ asset, v, sign }: { asset: string; v: number; sign?: boolean }) => (
  <span class={`amt ${sign ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : ''}`}>{fmtAmt(asset, v, { sign })}</span>
);

export const Item = ({ k, n }: { k: string; n?: number }) => (
  <span class="item">{itemIcon(k)} {n !== undefined ? <b>{n.toLocaleString()}</b> : null} {itemName(k)}</span>
);

export function Bar({ v, max, color, label }: { v: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;
  return (
    <div class="bar" title={label}>
      <i style={{ width: `${pct}%`, background: color }} />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Panel({ title, children, right, class: cls }: { title?: ComponentChildren; children: ComponentChildren; right?: ComponentChildren; class?: string }) {
  return (
    <section class={`panel ${cls ?? ''}`}>
      {(title || right) && <header><h3>{title}</h3><div class="right">{right}</div></header>}
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div class="tabs">
      {tabs.map(([k, label]) => <button class={k === value ? 'on' : ''} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
}

export function NationChip({ w, id }: { w: World; id: Id | null | undefined }) {
  if (id == null) return <span class="muted">—</span>;
  if (id < 0) return <span class="chip"><i class="dot" style={{ background: '#222' }} />Pirates</span>;
  const n = w.nations[id];
  return (
    <span class="chip link" onClick={() => store.go('country', { nation: id })}>
      <i class="dot" style={{ background: n.color }} />{n.name}{n.exile ? ' (exile)' : ''}
    </span>
  );
}

export function CitLink({ w, id }: { w: World; id: Id | null | undefined }) {
  if (id == null || !w.citizens[id]) return <span class="muted">—</span>;
  const c = w.citizens[id];
  return <span class={`link ${c.player ? 'me' : ''}`} onClick={() => store.go('citizen', { citizen: id })}>{c.name}{c.player ? ' (you)' : ''}</span>;
}

export function RegionLink({ w, id }: { w: World; id: Id | null | undefined }) {
  if (id == null || !w.regions[id]) return <span class="muted">—</span>;
  return <span class="link" onClick={() => store.go('map', { region: id })}>{w.regions[id].name}</span>;
}

export function Stat({ label, children, hint }: { label: string; children: ComponentChildren; hint?: string }) {
  return <div class="stat" title={hint}><small>{label}</small><b>{children}</b></div>;
}

export function Num(props: { value: number; onInput: (v: number) => void; min?: number; max?: number; step?: number; width?: number }) {
  return (
    <input type="number" value={props.value} min={props.min} max={props.max} step={props.step ?? 1} style={{ width: `${props.width ?? 80}px` }}
      onInput={(e) => props.onInput(Number((e.target as HTMLInputElement).value))} />
  );
}

export function useNum(init: number): [number, (v: number) => void] {
  const [v, set] = useState(init);
  return [v, set];
}

export function Select<T extends string | number>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; style?: JSX.CSSProperties }) {
  return (
    <select value={String(props.value)} style={props.style} onChange={(e) => {
      const raw = (e.target as HTMLSelectElement).value;
      const found = props.options.find(([k]) => String(k) === raw);
      if (found) props.onChange(found[0]);
    }}>
      {props.options.map(([k, label]) => <option value={String(k)}>{label}</option>)}
    </select>
  );
}

export const Empty = ({ children }: { children: ComponentChildren }) => <p class="empty">{children}</p>;

export function Sparkline({ values, width = 120, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span class="muted small">no history</span>;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  return <svg class="spark" width={width} height={height}><polyline points={pts} fill="none" stroke="currentColor" stroke-width="1.5" /></svg>;
}

export function Help({ children }: { children: ComponentChildren }) {
  return <p class="help">{children}</p>;
}
