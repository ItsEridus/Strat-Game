// Stadium tournaments on the simulated calendar. Entrants (AI and player) fight
// bracket bouts with organiser-issued Q2 weapons (not consumed) and a fixed
// hit budget, so supplies are equal and builds decide. Fees fund the prize pool.
import type { Battle, Citizen, Id, Terrain, Tournament, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { burn, escrowIn, escrowOut, mint } from '../engine/ledger';
import { GOLD, fmtAmt, g } from '../engine/money';
import { DAY, HOUR } from '../engine/clock';
import { nid, notify, record, schedule } from '../engine/events';
import { chance, pick, shuffle } from '../engine/rng';
import { hitPreview } from './combatMath';
import { cref, player } from './query';
import { bump } from './progress';

const HITS_PER_BOUT = 10; // SOLO
const SPONSOR = 5; // SOLO gold added by the league to each official tournament

export function scheduleTournament(w: World, opts: Partial<Tournament> = {}, host?: Citizen) {
  const start = opts.start ?? Math.floor(w.time / DAY + 3) * DAY + 18 * HOUR;
  const t: Tournament = {
    id: nid(w), name: opts.name ?? `${pick(w, ['Grand', 'Open', 'Iron', 'Crown', 'Frontier'])} ${pick(w, ['Cup', 'Classic', 'Invitational', 'Games'])}`,
    format: opts.format ?? pick(w, ['solo', 'solo', 'teams'] as const), regOpen: w.time, start, fee: opts.fee ?? g(B.tournaments.fee), cap: opts.cap ?? B.tournaments.cap,
    minLevel: opts.minLevel ?? B.tournaments.level, terrain: opts.terrain ?? pick(w, ['plains', 'mountains', 'forest', 'desert'] as Terrain[]),
    entrants: [], bracket: [], status: 'upcoming', prize: 0, podium: [], hostedBy: host?.id, escrow: 0,
  };
  w.tournaments[t.id] = t;
  schedule(w, t.start, 'tournamentStart', { id: t.id });
  return t;
}

export function enterCheck(w: World, c: Citizen, t: Tournament | undefined): string | null {
  if (!t || t.status !== 'upcoming') return 'Registration is closed.';
  if (w.time >= t.start) return 'Registration is closed.';
  if (c.level < t.minLevel) return `Level ${t.minLevel}+ only.`;
  if (t.entrants.includes(c.id)) return 'Already registered.';
  if (t.entrants.length >= t.cap) return 'The tournament is full.';
  if ((c.wallet[GOLD] ?? 0) < t.fee) return `Entry fee ${fmtAmt(GOLD, t.fee)}.`;
  return null;
}

export function enter(w: World, c: Citizen, id: Id): Result {
  const t = w.tournaments[id];
  const why = enterCheck(w, c, t);
  if (why) return fail(why);
  if (t.fee) escrowIn(w, cref(c.id), GOLD, t.fee, `Entry: ${t.name}`);
  t.prize += t.fee;
  t.escrow += t.fee;
  t.entrants.push(c.id);
  if (c.player) bump(w, 'tournament');
  return ok(`Registered for ${t.name}. First bout at the start time.`);
}

export function hostCheck(w: World, c: Citizen, prize: number): string | null {
  if (c.level < B.tournaments.level) return `Hosting requires level ${B.tournaments.level}.`;
  if ((c.wallet[GOLD] ?? 0) < prize) return `You must fund the ${fmtAmt(GOLD, prize)} prize.`;
  return null;
}
export function host(w: World, c: Citizen, name: string, terrain: Terrain, fee: number, prize: number, minLevel: number): Result {
  const why = hostCheck(w, c, prize);
  if (why) return fail(why);
  const t = scheduleTournament(w, { name: name.trim().slice(0, 40) || `${c.name}'s Cup`, terrain, fee, minLevel: Math.max(1, minLevel), format: 'solo' }, c);
  if (prize) { escrowIn(w, cref(c.id), GOLD, prize, `Prize fund: ${t.name}`); t.prize += prize; t.escrow += prize; }
  return ok(`Hosting ${t.name} on day ${Math.floor(t.start / DAY)}.`);
}

/** Bout damage for one fighter with standard weapons on the tournament terrain. */
function boutDamage(w: World, c: Citizen, t: Tournament): number {
  const arena = { id: -1, kind: 'tournament', war: null, region: w.regions.find((r) => r.terrain === t.terrain)?.id ?? 0, att: -2, def: -3, airOnly: false } as unknown as Battle;
  const pv = hitPreview(w, c, arena, 'a', { kind: 'wg', q: 2 });
  let dmg = 0;
  for (let i = 0; i < HITS_PER_BOUT; i++) if (chance(w, pv.hit / 100)) dmg += pv.dmg * (chance(w, pv.crit / 100) ? pv.critDmg / 100 : 1);
  return Math.round(dmg);
}

export function onTournamentStart(w: World, id: Id) {
  const t = w.tournaments[id];
  if (!t || t.status !== 'upcoming') return;
  // AI entrants fill the field.
  const pool = shuffle(w, Object.values(w.citizens).filter((c) => !c.player && c.level >= t.minLevel && !t.entrants.includes(c.id) && (c.persona === 'soldier' || chance(w, 0.1)) && (c.wallet[GOLD] ?? 0) >= t.fee));
  for (const c of pool) { if (t.entrants.length >= t.cap) break; enter(w, c, t.id); }
  if (!t.hostedBy) { t.prize += g(SPONSOR); t.sponsored = true; }
  if (t.entrants.length < 2) {
    for (const id2 of t.entrants) escrowOut(w, cref(id2), GOLD, t.fee, `Refund: ${t.name}`);
    t.escrow -= t.fee * t.entrants.length;
    if (t.hostedBy != null && t.escrow > 0) { escrowOut(w, cref(t.hostedBy), GOLD, t.escrow, `Refund: ${t.name}`); t.escrow = 0; }
    t.prize = 0;
    t.status = 'finished';
    return;
  }
  t.status = 'live';
  runRound(w, t, t.entrants.slice());
}

function runRound(w: World, t: Tournament, alive: Id[]) {
  const round = (t.bracket[t.bracket.length - 1]?.round ?? 0) + 1;
  const next: Id[] = [];
  const losers: Id[] = [];
  shuffle(w, alive);
  if (t.format === 'teams' && round === 1 && alive.length >= 4) {
    // Random teams of up to four: team damage decides; winners advance individually.
    const teams: Id[][] = [];
    for (let i = 0; i < alive.length; i += 4) teams.push(alive.slice(i, i + 4));
    for (let i = 0; i < teams.length; i += 2) {
      const A = teams[i], Bt = teams[i + 1];
      if (!Bt) { next.push(...A); continue; }
      const dA = A.reduce((s, id) => s + boutDamage(w, w.citizens[id], t), 0), dB = Bt.reduce((s, id) => s + boutDamage(w, w.citizens[id], t), 0);
      t.bracket.push({ round, a: A, b: Bt, dmgA: dA, dmgB: dB, winner: dA >= dB ? 'a' : 'b' });
      next.push(...(dA >= dB ? A : Bt)); losers.push(...(dA >= dB ? Bt : A));
    }
  } else {
    for (let i = 0; i < alive.length; i += 2) {
      const a = alive[i], b = alive[i + 1];
      if (b == null) { next.push(a); continue; }
      const dA = boutDamage(w, w.citizens[a], t), dB = boutDamage(w, w.citizens[b], t);
      t.bracket.push({ round, a: [a], b: [b], dmgA: dA, dmgB: dB, winner: dA >= dB ? 'a' : 'b' });
      next.push(dA >= dB ? a : b); losers.push(dA >= dB ? b : a);
      const pl = player(w);
      if (a === pl.id || b === pl.id) notify(w, 'progress', `🏟️ ${t.name} round ${round}: you ${((a === pl.id) === (dA >= dB)) ? 'won' : 'lost'} (${(a === pl.id ? dA : dB).toLocaleString()} vs ${(a === pl.id ? dB : dA).toLocaleString()} damage).`, { link: 'stadium' });
    }
  }
  if (next.length <= 1) return finish(w, t, next[0], losers);
  schedule(w, w.time + HOUR, 'tournamentRound', { id: t.id, alive: next });
}

export function onTournamentRound(w: World, id: Id, alive: Id[]) {
  const t = w.tournaments[id];
  if (t && t.status === 'live') runRound(w, t, alive);
}

function finish(w: World, t: Tournament, winner: Id, lastLosers: Id[]) {
  const second = lastLosers[0];
  const third = (t.bracket.filter((b) => b.round === Math.max(1, t.bracket[t.bracket.length - 1].round - 1)).map((b) => (b.winner === 'a' ? b.b[0] : b.a[0])).find((x) => x !== second)) ?? null;
  t.podium = [winner, second, third].filter((x): x is number => x != null);
  // Escrowed fees/host funds pay out; the league sponsorship is minted.
  const shares = [0.6, 0.25, 0.15];
  const escrowed = t.escrow;
  let paidFromEscrow = 0;
  t.podium.forEach((id, i) => {
    const amt = Math.floor(t.prize * shares[i]);
    const fromEscrow = Math.min(amt, escrowed - paidFromEscrow);
    if (fromEscrow > 0) { escrowOut(w, cref(id), GOLD, fromEscrow, `Prize: ${t.name}`); paidFromEscrow += fromEscrow; }
    if (amt - fromEscrow > 0) mint(w, cref(id), GOLD, amt - fromEscrow, 'Tournament sponsorship');
    const c = w.citizens[id];
    if (i === 0) { c.medals.champion = (c.medals.champion ?? 0) + 1; c.influence += 2; }
  });
  // Any rounding remainder of escrow is burned as organiser fee.
  const rest = escrowed - paidFromEscrow;
  if (rest > 0) { escrowOut(w, cref(winner), GOLD, rest, 'Prize remainder'); burn(w, cref(winner), GOLD, rest, 'Tournament organiser fee'); }
  t.escrow = 0;
  t.status = 'finished';
  record(w, 'tournament', `🏟️ ${w.citizens[winner].name} won ${t.name} (${fmtAmt(GOLD, t.prize)} prize pool).`, { cit: winner, player: t.podium.includes(player(w).id), important: t.podium.includes(player(w).id) });
  if (winner === player(w).id) { bump(w, 'tournamentWin'); notify(w, 'progress', `🏆 You won ${t.name}!`, { critical: true }); }
}

/** Daily: keep one official tournament on the calendar (optional system). */
export function tournamentsDaily(w: World) {
  if (!w.settings.advanced.tournaments) return;
  const upcoming = Object.values(w.tournaments).filter((t) => t.status !== 'finished' && !t.hostedBy);
  const last = Object.values(w.tournaments).filter((t) => !t.hostedBy).sort((a, b) => b.start - a.start)[0];
  if (!upcoming.length && (!last || w.time - last.start >= (B.tournaments.everyDays - 3) * DAY)) scheduleTournament(w);
}
