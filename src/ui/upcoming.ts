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
  for (const b of Object.values(w.battles)) {
    if (b.done || b.kind === 'tournament') continue;
    const mine = b.att === p.nation || b.def === p.nation || w.player.watch === b.id;
    if (!mine) continue;
    const where = w.regions[b.region]?.name ?? 'battle';
    const idx = Math.floor((w.time - b.roundStart) / 10);
    out.push({ label: `${where}: next scoring tick`, t: b.roundStart + (idx + 1) * 10, cat: 'war' });
    if (idx < 12) out.push({ label: `${where}: final segment (600 pts/tick)`, t: b.roundStart + 120, cat: 'war' });
    out.push({ label: `${where}: round ${b.round} ends`, t: b.roundStart + 160, cat: 'war' });
  }
  for (const war of Object.values(w.wars)) if (war.status === 'active' && (war.att === p.nation || war.def === p.nation)) out.push({ label: `War deadline (${w.nations[war.att].name} vs ${w.nations[war.def].name})`, t: war.deadline, cat: 'war' });
  // Later stages append auctions, mining, tournaments here.
  return out.filter((u) => u.t > w.time).sort((a, b) => a.t - b.t);
}
