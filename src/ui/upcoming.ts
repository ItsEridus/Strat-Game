// Upcoming scheduled moments for event-based time advancement.
import type { World } from '../sim/types';
import { DAY, HOUR } from '../engine/clock';
import { B } from '../data/balance';
import { maxEnergy, player } from '../sim/query';

export interface Upcoming { label: string; t: number; cat: string }

export function upcoming(w: World): Upcoming[] {
  const out: Upcoming[] = [];
  const p = player(w);
  out.push({ label: 'Next hour', t: Math.floor(w.time / HOUR) * HOUR + HOUR, cat: 'time' });
  out.push({ label: 'Tomorrow 00:00', t: Math.floor(w.time / DAY) * DAY + DAY, cat: 'time' });
  out.push({ label: 'Tomorrow 08:00', t: Math.floor(w.time / DAY) * DAY + DAY + 8 * HOUR, cat: 'time' });
  const missing = Math.max(0, maxEnergy(w, p) - p.energy);
  if (missing > 0) out.push({ label: 'Energy regenerated', t: w.time + Math.ceil(missing / B.energy.regenPerTick) * 10, cat: 'personal' });
  for (const e of Object.values(w.elections)) {
    if (e.done || e.nation !== p.nation) continue;
    if (e.kind === 'party' && e.party !== p.party) continue;
    const label = e.kind === 'president' ? 'Presidential election' : e.kind === 'congress' ? 'Congress election' : 'Party leader election';
    out.push({ label, t: e.at, cat: 'politics' });
    if (e.regClose > w.time) out.push({ label: `${label}: registration closes`, t: e.regClose, cat: 'politics' });
  }
  for (const pr of Object.values(w.proposals)) if (pr.status === 'open' && pr.nation === p.nation) out.push({ label: `Congress vote closes (${pr.type})`, t: pr.closes, cat: 'politics' });
  // Later stages append battle rounds, auctions, mining, tournaments here.
  return out.filter((u) => u.t > w.time).sort((a, b) => a.t - b.t);
}
