// The day planner (2.8): the player's day hour by hour, sleep, and the commute.
import type { Citizen, World } from '../../sim/types';
import { Help, Select } from '../common';
import { store } from '../store';
import { fmtAmt } from '../../engine/money';
import { MODE_LABEL, commuteMinutes, dayPlan, hasCar, modeOf, monthlyFares, reachOf, setCommute, setSleep, sleepLabel, sleepOf, type Mode } from '../../sim/everyday';

const COLORS: Record<string, string> = { sleep: '#4b5d9a', commute: '#9a7b4b', work: '#3f8f6b', school: '#6b5fb0', train: '#b05f5f', meal: '#a0a0a0', cook: '#c06a4a', chores: '#8a8a5a', family: '#c0884a', hobby: '#4a9cc0', rest: '#7aa36b' };
const hh = (h: number) => { const x = ((h % 24) + 24) % 24; return `${String(Math.floor(x)).padStart(2, '0')}:${x % 1 ? String(Math.round((x % 1) * 60)).padStart(2, '0') : '00'}`; };

export function DayPlanner({ w, p }: { w: World; p: Citizen }) {
  const { blocks, clashes } = dayPlan(w, p);
  const s = sleepOf(w, p);
  const reach = reachOf(w, p);
  const mode = modeOf(w, p);
  const segs = blocks.flatMap((b) => { const f = ((b.from % 24) + 24) % 24, len = b.to - b.from; return f + len > 24 ? [{ ...b, from: f, to: 24 }, { ...b, from: 0, to: f + len - 24 }] : [{ ...b, from: f, to: f + len }]; });
  return (
    <div>
      <div style={{ position: 'relative', height: '26px', background: 'var(--panel2, #222)', borderRadius: '4px', overflow: 'hidden', margin: '4px 0' }}>
        {segs.map((b) => <div title={`${b.what}: ${hh(b.from)}–${hh(b.to)}`} style={{ position: 'absolute', left: `${(b.from / 24) * 100}%`, width: `${((b.to - b.from) / 24) * 100}%`, top: b.kind === 'meal' ? '18px' : 0, bottom: 0, background: COLORS[b.kind] ?? '#888', opacity: 0.85, fontSize: '11px', textAlign: 'center', overflow: 'hidden' }}>{b.to - b.from >= 1.5 ? b.icon : ''}</div>)}
      </div>
      <div class="row small muted" style={{ justifyContent: 'space-between' }}><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <ul class="small">{blocks.filter((b) => b.kind !== 'meal').map((b) => <li>{b.icon} {hh(b.from)}–{hh(b.to)} {b.what}</li>)}</ul>
      {clashes.map((c) => <p class="small bad">⚠ {c}</p>)}
      <div class="row small">Bed at <Select value={s.bed} options={[20, 21, 22, 23, 0, 1].map((h) => [h, hh(h)] as [number, string])} onChange={(b) => store.act((w) => setSleep(w, b, s.hours))} />
        for <Select value={s.hours} options={[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9].map((h) => [h, `${h} hours`] as [number, string])} onChange={(h) => store.act((w) => setSleep(w, s.bed, h))} />
        <span class="muted">({sleepLabel(s.hours)})</span></div>
      {reach !== 'none' && <div class="row small">To work <Select value={mode} options={(['walk', 'transit', 'car'] as Mode[]).filter((m) => m !== 'car' || hasCar(w, p)).map((m) => [m, `${MODE_LABEL[m]} (${commuteMinutes(w, p, m)} min)`] as [Mode, string])} onChange={(m) => store.act((w) => setCommute(w, m))} />
        {monthlyFares(w, p) > 0 && <span class="muted">fares about {fmtAmt(w.nations[p.nation].cur, monthlyFares(w, p))} a month</span>}{reach === 'far' && <span class="bad"> work is far from home: consider moving</span>}</div>}
      <Help>Your day, hour by hour, from your routine. Adults need about seven to nine hours of sleep; less raises stress and wears your health down. Your commute depends on where you work, how you travel and your country (fast public transport in Japan, Korea and Germany; cities built for cars in America, Saudi Arabia and Australia; heavy traffic in India, Brazil and Turkey). A long commute is a daily strain.</Help>
    </div>
  );
}
