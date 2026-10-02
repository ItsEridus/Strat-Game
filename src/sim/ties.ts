// Memories between people (2.6 Life 2.0): not only about the player. Everyone can carry a few
// lasting memories of others, so communities have histories:
// - grudges: against the boss who let them go, the ex who left them badly;
// - gratitude: to the employer who took them on after a long time out of work, to the friend
//   who stood by them in grief;
// - old flames: exes who parted on good terms still think of each other, and may find their
//   way back when both are free;
// - rivals: the candidate who beat them at the polls;
// - comrades: those who served in the same war.
// A memory pulls how one feels about the other (a grudge keeps a relationship cold however
// often they meet), steers votes and new romances, and fades over the years: grudges fastest
// in people who value community, comradeship hardly at all. Each person keeps at most six.
import type { Citizen, Id, World } from './types';
import { DAY } from '../engine/clock';
import { dateAt } from '../engine/calendar';
import { census } from './census';
import { valueOf } from './mind';

export type TieKind = 'grudge' | 'gratitude' | 'flame' | 'rival' | 'comrade';
export interface Tie { who: Id; kind: TieKind; t: number; s: number; why: string } // s: strength 0–100
export const TIE_INFO: Record<TieKind, { icon: string; label: string; pull: number; fade: number }> = {
  grudge: { icon: '😠', label: 'holds a grudge against', pull: -45, fade: 0.025 },
  gratitude: { icon: '🙏', label: 'is grateful to', pull: 40, fade: 0.015 },
  flame: { icon: '💭', label: 'still thinks of', pull: 25, fade: 0.012 },
  rival: { icon: '⚔️', label: 'sees a rival in', pull: -25, fade: 0.02 },
  comrade: { icon: '🎖️', label: 'served alongside', pull: 50, fade: 0.004 },
};
const MAX = 6;

export const tiesOf = (c: Citizen): Tie[] => c.ties ?? [];
export const tieWith = (c: Citizen, who: Id, kind?: TieKind) => c.ties?.find((x) => x.who === who && (!kind || x.kind === kind));

/** Remember someone (a stronger memory of the same kind replaces a weaker one). */
export function note(w: World, a: Citizen | undefined, b: Citizen | undefined, kind: TieKind, s: number, why: string) {
  if (!a || !b || a.id === b.id || a.gone || b.gone) return;
  const list = (a.ties ??= []);
  const old = list.find((x) => x.who === b.id && x.kind === kind);
  if (old) { old.s = Math.min(100, Math.max(old.s, s) + 5); old.t = w.time; old.why = why; return; }
  // A new memory of a different kind about the same person replaces the old ones (a grudge ends gratitude).
  for (let i = list.length - 1; i >= 0; i--) if (list[i].who === b.id && Math.sign(TIE_INFO[list[i].kind].pull) !== Math.sign(TIE_INFO[kind].pull)) list.splice(i, 1);
  list.push({ who: b.id, kind, t: w.time, s: Math.round(s), why });
  if (list.length > MAX) list.splice(list.indexOf(list.reduce((m, x) => (x.s < m.s ? x : m))), 1);
}

/** What memories add to a voter's view of a candidate (sim/politics.ts). */
export function tieBias(a: Citizen, b: Id): number {
  let x = 0;
  for (const t of a.ties ?? []) if (t.who === b) x += (TIE_INFO[t.kind].pull * t.s) / 300;
  return x;
}
/** Old flames, both free again, are drawn back together (sim/family.ts). */
export const flameBonus = (a: Citizen, b: Citizen) => ((tieWith(a, b.id, 'flame')?.s ?? 0) + (tieWith(b, a.id, 'flame')?.s ?? 0)) / 250;

// ---------- the events people remember ----------

/** A couple parts: on good terms they remember each other fondly; badly, with a grudge (the one left most). */
export function partedWays(w: World, a: Citizen, b: Citizen, married: boolean) {
  const ra = a.rel[b.id] ?? 0, rb = b.rel[a.id] ?? 0;
  for (const [x, y, r] of [[a, b, ra], [b, a, rb]] as [Citizen, Citizen, number][]) {
    if (r >= 15) note(w, x, y, 'flame', 30 + r / 3, married ? 'their marriage, before it ended' : 'the time they were together');
    else note(w, x, y, 'grudge', 25 + (married ? 20 : 0) + Math.max(0, -r) / 3, married ? 'the divorce' : 'how it ended');
  }
}
/** Let go from a firm: a grudge against its owner (if a person owns it). */
export function letGo(w: World, c: Citizen, ownerId: Id | null | undefined, firm: string, dismissed: boolean) {
  if (ownerId == null) return;
  note(w, c, w.citizens[ownerId], 'grudge', dismissed ? 50 : 30, dismissed ? `being dismissed from ${firm}` : `being made redundant at ${firm}`);
}
/** Taken on after a long time out of work: gratitude to the owner. */
export function takenOn(w: World, c: Citizen, ownerId: Id | null | undefined, firm: string, idleDays: number) {
  if (ownerId == null || idleDays < 60) return;
  note(w, c, w.citizens[ownerId], 'gratitude', Math.min(60, 20 + idleDays / 10), `a job at ${firm} after a long search`);
}
/** Beaten at the polls: the runner-up remembers the winner. */
export function lostTo(w: World, loser: Citizen | undefined, winner: Citizen | undefined, what: string) {
  note(w, loser, winner, 'rival', 45, `losing the ${what} election`);
}

// ---------- the monthly course ----------

/** A month: memories pull feelings their way and fade; veterans find their comrades; friends stand by the grieving. */
export function tiesMonth(w: World) {
  const veterans = new Map<string, Citizen[]>();
  for (const c of census(w).all) {
    if (c.gone) continue;
    if (c.flags.veteranOf != null) { const k = `${c.flags.veteranOf}:${c.nation}`; (veterans.get(k) ?? veterans.set(k, []).get(k)!).push(c); }
    if (!c.ties?.length) continue;
    const forgiving = 1 + valueOf(w, c, 'community');
    c.ties = c.ties.filter((t) => {
      const b = w.citizens[t.who];
      if (!b || b.gone) return t.kind === 'flame' || t.kind === 'comrade' ? w.time - t.t < 20 * 365 * DAY : false; // the dead are remembered, but grudges die with them
      const target = (TIE_INFO[t.kind].pull * t.s) / 100;
      const cur = c.rel[t.who] ?? 0;
      if ((target < 0 && cur > target) || (target > 0 && cur < target)) c.rel[t.who] = Math.round((cur + (target - cur) * 0.08) * 10) / 10;
      t.s = Math.round(t.s * (1 - TIE_INFO[t.kind].fade * (t.kind === 'grudge' ? forgiving : 1)) * 10) / 10;
      return t.s >= 5;
    });
    if (!c.ties.length) delete c.ties;
  }
  // Those who served in the same war find two or three comrades among them.
  for (const group of veterans.values()) {
    if (group.length < 2) continue;
    for (const [i, c] of group.entries()) {
      if (tiesOf(c).some((t) => t.kind === 'comrade')) continue;
      for (let k = 1; k <= 2 && k < group.length; k++) {
        const o = group[(i + k * 7) % group.length];
        if (o.id !== c.id) { note(w, c, o, 'comrade', 60, 'serving in the same war'); note(w, o, c, 'comrade', 60, 'serving in the same war'); }
      }
    }
  }
}

export function tiesDaily(w: World) {
  if (dateAt(w.time).day === 1) tiesMonth(w);
}
