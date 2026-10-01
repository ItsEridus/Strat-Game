// Counter-intelligence, deception, oversight and sharing (2.1 Shadows).
// - Mole hunts: each month a service's counter-intelligence directorate looks for foreign
//   agents in sensitive places (government, the service itself, the officer corps). Those
//   it finds are arrested, or, sometimes, turned.
// - Double agents: a turned agent stays in place and feeds the handler what the home
//   service wants believed. The handler still trusts the source, so its picture of the
//   country gets worse while it thinks it is getting better: forces look stronger and
//   intentions softer than they are.
// - Oversight: in countries with a free press and a working legislature, covert action
//   leaks. Exposed operations abroad become scandals at home: approval falls, and the
//   legislature cuts the budget or the director goes. Whistle-blowers sometimes reveal
//   operations nobody abroad had caught.
// - Sharing: partners in an intelligence-sharing treaty (Five Eyes) pool their estimates:
//   each sees at least nearly as well as its best-placed partner.
// - Election interference is an operation (intel.ts); its effect on voters is read by the
//   election (politics.ts) through interferenceBonus().
import type { Id, Nation, World } from './types';
import { dateAt } from '../engine/calendar';
import { nid, notify, record } from '../engine/events';
import { chance } from '../engine/rng';
import { census } from './census';
import { player } from './query';
import { relation } from './congress';
import { capsOf, historyPace } from './strategic';
import { dirStrength, noteLesson } from './intelOrg';
import { placementOf } from './collection';
import { rawQuality, type Estimate } from './beliefs';
import { activeTreaties } from './treaties';
import { COVERT } from './intel';
import { DAY } from '../engine/clock';

// ---------- sharing ----------

/** What a partner in an intelligence-sharing treaty lets `n` see of `t` (read by beliefs.ts). */
export function partnerQuality(w: World, n: Nation, t: Nation): number {
  let best = 0;
  for (const tr of activeTreaties(w, n.id, 'intel')) for (const p of tr.parties) {
    if (p === n.id || p === t.id) continue;
    best = Math.max(best, rawQuality(w, w.nations[p], t) * 0.85);
  }
  return best;
}

// ---------- mole hunts and double agents ----------

function moleHunt(w: World) {
  const p = player(w);
  for (const home of w.nations) {
    if (home.exile) continue;
    const skill = dirStrength(home, 'counter') / 100;
    for (const c of census(w).all) {
      if (c.nation !== home.id || c.sec.asset == null || c.gone || c.sec.doubled != null) continue;
      const place = placementOf(w, c).weight;
      if (place < 0.04) continue; // nobody hunts for clerks
      if (!chance(w, skill * 0.08 * (c.player ? 0.5 : 1))) continue;
      const handler = w.nations[c.sec.asset];
      noteLesson(handler, 'humint', 1);
      if (!c.player && chance(w, 0.25 + skill * 0.25)) {
        // Turned: they stay in place, now working for us.
        c.sec.doubled = home.id;
        record(w, 'espionage', `🪞 The ${home.agency.name} quietly turned a ${handler.adj} agent inside ${home.name}.`, { nation: home.id, important: false });
        continue;
      }
      // Arrested.
      c.sec.asset = null;
      delete c.sec.motive;
      const k = { id: nid(w), suspect: c.id, kind: 'espionage' as const, region: c.loc, nation: home.id, evidence: 85, opened: w.time, status: 'open' as const, detective: null, loot: 0 };
      w.cases[k.id] = k;
      home.agency.caught++;
      handler.agency.network[home.id] = Math.max(0, (handler.agency.network[home.id] ?? 0) - 15);
      relation(w, home.id, handler.id, -8, 'a mole was uncovered');
      record(w, 'espionage', `🕵️ Mole hunt: ${c.name} (${placementOf(w, c).label}) was arrested as a spy for ${handler.name}.`, { nation: home.id, cit: c.id, important: true });
      if (c.player) notify(w, 'personal', `🕵️ Counter-intelligence has arrested you as a spy for ${handler.name}.`, { critical: true, link: 'crime' });
      else if (home.id === p.nation || handler.id === p.nation) notify(w, 'politics', `🕵️ ${home.name} uncovered a ${handler.adj} mole: ${c.name}.`, { link: 'intel' });
    }
  }
}

/** Deception through double agents: the handler's picture of the country is pushed where the country wants it. */
export function deceive(w: World, handler: Nation, t: Nation, e: Estimate) {
  let doubled = 0;
  for (const c of census(w).all) if (c.sec.asset === handler.id && c.sec.doubled === t.id && c.nation === t.id) doubled++;
  if (!doubled) return;
  const k = Math.min(3, doubled);
  e.bias.mil += 0.08 * k; // look stronger than we are (deterrence)
  e.bias.hostile -= 6 * k; // and less hostile
}

// ---------- oversight ----------

/** How exposed a government is to leaks and scrutiny (0..1): a free press and a working legislature. */
export const scrutiny = (w: World, n: Nation) => capsOf(w, n).inst.press * 0.7 + capsOf(w, n).inst.law * 0.3;

/** An operation abroad has come out: the government pays at home too. */
export function domesticFallout(w: World, n: Nation, what: string) {
  const s = scrutiny(w, n);
  if (!chance(w, 0.01 + s * 0.06)) return;
  n.approval = Math.max(5, n.approval - (2 + s * 4));
  let consequence = '';
  if (chance(w, s * 0.3)) {
    n.agency.budget = Math.max(0.005, Math.round(n.agency.budget * 0.85 * 1000) / 1000);
    consequence = ' The intelligence committee cut the service\'s budget.';
  } else if (chance(w, s * 0.25) && n.cabinet.intelligence != null) {
    const d = w.citizens[n.cabinet.intelligence];
    delete n.cabinet.intelligence;
    consequence = ` The Director of Intelligence${d ? `, ${d.name},` : ''} resigned.`;
  }
  const text = `📰 Scandal at home: the press revealed ${n.name}'s ${what}.${consequence}`;
  record(w, 'politics', text, { nation: n.id, important: true });
  (n.chronicle ??= []).push({ t: w.time, text });
  if (player(w).nation === n.id) notify(w, 'politics', text, { link: 'intel' });
}

function whistleblowers(w: World) {
  for (const n of w.nations) {
    if (n.exile) continue;
    const covert = Object.values(w.ops).filter((o) => o.nation === n.id && o.status === 'success' && COVERT.includes(o.kind) && w.time - o.ends < 60 * DAY);
    if (!covert.length) continue;
    if (!chance(w, scrutiny(w, n) * 0.02 * Math.min(3, covert.length))) continue;
    const op = covert[covert.length - 1];
    relation(w, n.id, op.target, -8, 'a covert operation came to light');
    domesticFallout(w, n, `covert operation against ${w.nations[op.target].name} (revealed by a whistle-blower)`);
  }
}

// ---------- election interference ----------

/** The extra pull a foreign service's campaign gives a party or its candidate (read by the election). */
export function interferenceBonus(w: World, n: Nation, party: Id | null | undefined): number {
  const i = n.interference;
  return i && party != null && i.party === party && w.time < i.until ? 6 : 0;
}

/** The party a foreign service would back: the one closest to its own government. */
export function favouredParty(w: World, sponsor: Nation, t: Nation): Id | null {
  const presParty = sponsor.president != null ? w.citizens[sponsor.president]?.party : null;
  const ideo = presParty != null ? w.parties[presParty]?.ideo : null;
  const parties = Object.values(w.parties).filter((p) => p.nation === t.id);
  const same = parties.filter((p) => p.ideo === ideo).sort((a, b) => b.support - a.support)[0];
  if (same) return same.id;
  // Otherwise the strongest opposition to an unfriendly government.
  const gov = t.president != null ? w.citizens[t.president]?.party : null;
  return parties.filter((p) => p.id !== gov).sort((a, b) => b.support - a.support)[0]?.id ?? null;
}

export function counterIntelDaily(w: World) {
  if (dateAt(w.time).day === 1) for (let k = 0; k < historyPace(w); k++) { moleHunt(w); whistleblowers(w); }
}
