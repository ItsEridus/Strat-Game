// The war chronicle: why each war started, what happened in it and why it
// ended, written as it happens and kept afterwards (the Wars screen and the war
// history page read it). The reasons are the ones the simulation used: the
// weights congress voted on (balance of power, relations, ideology, public
// mood, other wars), the prize and old grievances, and each side's appetite for
// peace when terms were offered.
import type { Battle, Id, Ideology, Nation, PeaceOffer, Proposal, War, WarBattleRecord, WarCause, WarChronicle, WarEnding, WarEvent, WarFactor, World } from './types';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { DAY, fmtDur } from '../engine/clock';
import { fmtDate } from '../engine/calendar';
import { controller, seatShare } from './query';
import { partyOf } from './politics';
import { engaged } from './forces';

export const chronicleOf = (war: War): WarChronicle => (war.chronicle ??= { events: [], battles: {}, home: {} });
const nm = (w: World, id: Id) => w.nations[id]?.name ?? 'an unknown nation';
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x))}`;
const num = (x: number) => Math.round(x).toLocaleString('en-US');
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function note(w: World, war: War, icon: string, text: string, extra: Partial<WarEvent> = {}) {
  const c = chronicleOf(war);
  c.events.push({ t: w.time, icon, text, ...extra });
  if (c.events.length > 400) c.events.splice(1, c.events.length - 400); // the declaration stays first
}

// ---------- why a war starts ----------

/** How hawkish a congress is: seat shares weighted by each ideology's appetite for war. */
function hawkishness(w: World, n: Nation): { avg: number; who: string } {
  const sh = seatShare(w, n);
  let avg = 0, total = 0;
  const who: string[] = [];
  for (const [k, v] of Object.entries(sh)) {
    const ideo = IDEOLOGIES[k as Ideology];
    if (!ideo || !v) continue;
    avg += v * ideo.hawk; total += v;
    if (ideo.hawk >= 0.55 && v >= 0.05) who.push(`${ideo.name.toLowerCase()} ${pct(v)}`);
  }
  return { avg: total ? avg / total : 0.5, who: list(who) };
}

/** The biggest recent causes of bad relations, by their total effect. */
function soured(n: Nation, other: Id): string[] {
  const by = new Map<string, number>();
  for (const h of n.relations[other]?.hist ?? []) by.set(h.why, (by.get(h.why) ?? 0) + h.delta);
  return [...by.entries()].filter(([, d]) => d < 0).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([why, d]) => `${why} (${signed(d)})`);
}

function prize(w: World, rid: Id, taker: Id): string {
  const r = w.regions[rid];
  const res = Object.entries(r.res).filter(([, v]) => v).map(([k, v]) => `${k}${(v ?? 0) >= 2 ? ' (rich)' : ''}`);
  const bld = Object.entries(r.bld).filter(([, v]) => v > 0).map(([k, v]) => `${k} level ${v}`);
  return `${r.name}: ${res.length ? `deposits of ${list(res)}` : 'no notable deposits'}, about ${num(r.pop)} people${bld.length ? `, ${list(bld)}` : ''}${r.core === taker ? ` — ${nm(w, taker)} regards it as rightfully its own` : ''}`;
}

function grievances(w: World, n: Nation, t: Nation): string[] {
  const out: string[] = [];
  const held = w.regions.filter((r) => r.core === n.id && r.owner === t.id).map((r) => r.name);
  if (held.length) out.push(`${t.name} holds ${list(held.slice(0, 4))}, which ${n.name} regards as rightfully its own`);
  for (const x of Object.values(w.wars)) {
    if (x.status !== 'ended' || !((x.att === n.id && x.def === t.id) || (x.att === t.id && x.def === n.id))) continue;
    out.push(`the war of ${fmtDate(x.declared, 'short')}, started by ${nm(w, x.att)}, ended by ${x.outcome}`);
  }
  return out.slice(0, 4);
}

/**
 * The reasons behind a declaration. The first five factors use exactly the
 * weights deputies vote with (see WAR_PROPOSAL.support), averaged over congress.
 */
export function explainDeclaration(w: World, n: Nation, t: Nation, goals: Id[], days: number, power: [number, number], p: Proposal | undefined, eligible: number): WarCause {
  const ratio = power[0] / Math.max(1, power[1]);
  const rel = n.relations[t.id]?.score ?? 0;
  const why = soured(n, t.id);
  const hawk = hawkishness(w, n);
  const busy = Object.values(w.wars).filter((x) => x.status === 'active' && (x.att === n.id || x.def === n.id) && !(x.att === n.id && x.def === t.id)).length;
  const border = w.regions.filter((r) => controller(r) === t.id && r.links.some((l) => controller(w.regions[l]) === n.id)).length;
  const old = grievances(w, n, t);
  const theirWars = Object.values(w.wars).filter((x) => x.status === 'active' && (x.att === t.id || x.def === t.id) && x.att !== n.id && x.def !== n.id).map((x) => nm(w, x.att === t.id ? x.def : x.att));
  const tAllies = t.alliances.map((a) => nm(w, a)), nAllies = n.alliances.map((a) => nm(w, a));
  const prizeValue = goals.reduce((s, g) => s + Object.values(w.regions[g].res).reduce((a: number, v) => a + (v ?? 0), 0) + w.regions[g].pop / 50000, 0);
  const f: (WarFactor & { short: string })[] = [
    { label: 'Balance of power', weight: Math.max(-0.4, Math.min(0.3, (ratio - 1) * 0.3)), short: ratio >= 1 ? `a ${ratio.toFixed(1)}× military edge` : `despite being outgunned (${ratio.toFixed(1)}×)`,
      detail: `${n.name}'s military strength was about ${ratio.toFixed(2)}× ${t.name}'s (formations, trained citizens and their weapons: ${num(power[0])} against ${num(power[1])}).` },
    { label: 'Relations', weight: -rel / 150, short: `relations at ${Math.round(rel)}`,
      detail: `Relations stood at ${Math.round(rel)} out of ±100${why.length ? `, soured by ${list(why)}` : ''}.` },
    { label: 'Ideology in congress', weight: (hawk.avg - 0.55) * 0.8, short: `a ${hawk.avg >= 0.55 ? 'hawkish' : 'divided'} congress (${pct(hawk.avg)} hawkish)`,
      detail: `Seat-weighted, congress was ${pct(hawk.avg)} hawkish${hawk.who ? ` (${hawk.who})` : ''}; deputies from hawkish parties are the most willing to vote for war.` },
    { label: 'Public mood', weight: n.warMood * 0.05, short: n.warMood > 0 ? 'war fever in the press' : 'a wary public',
      detail: n.warMood > 0.5 ? `The press had been beating the war drums (war mood ${n.warMood.toFixed(1)} on a −5 to +5 scale).` : n.warMood < -0.5 ? `The public was wary of war (war mood ${n.warMood.toFixed(1)}).` : `The public was neither for nor against war (war mood ${n.warMood.toFixed(1)}).` },
    { label: 'Other wars', weight: -busy * 0.2, short: busy ? `while already fighting ${busy} other war${busy > 1 ? 's' : ''}` : 'no other wars',
      detail: busy ? `${n.name} was already fighting ${busy} other war${busy > 1 ? 's' : ''}, which made deputies more cautious.` : `${n.name} was fighting no other war.` },
    goals.length
      ? { label: 'The prize', weight: Math.min(0.3, prizeValue / 12), short: `the prize of ${list(goals.map((g) => w.regions[g].name))}`, detail: goals.map((g) => prize(w, g, n.id)).join('. ') + '.' }
      : { label: 'The prize', weight: 0, short: 'no territorial aim', detail: 'No territory was claimed: a punitive war to weaken and humble the enemy.' },
    { label: 'Old grievances', weight: Math.min(0.3, old.length * 0.08), short: 'old grievances',
      detail: old.length ? `${list(old)}.` : 'None on record between them.' },
    { label: 'The border', weight: border ? Math.min(0.1, border * 0.02) : 0, short: 'a long shared border',
      detail: border ? `${t.name} holds ${border} region${border > 1 ? 's' : ''} bordering ${n.name}${hawk.avg > 0.5 ? ', with tension on both sides' : ''}.` : `They share no land border: any invasion needs sea control or airpower.` },
    { label: 'Opportunity', weight: (theirWars.length ? 0.1 : 0) + (t.approval < 35 ? 0.05 : 0) + (t.exile ? 0.1 : 0), short: theirWars.length ? `${t.name} was busy fighting ${list(theirWars)}` : `${t.name}'s weakness at home`,
      detail: [theirWars.length ? `${t.name} was already fighting ${list(theirWars)}.` : `${t.name} was not fighting anyone else.`, `Its government's approval was ${Math.round(t.approval)}%.`, t.exile ? `It was a nation in exile.` : ''].filter(Boolean).join(' ') },
    { label: 'Alliances', weight: -0.08 * tAllies.length + 0.04 * nAllies.length, short: 'friends abroad',
      detail: `${t.name}'s allies: ${list(tAllies) || 'none'}. ${n.name}'s allies: ${list(nAllies) || 'none'}.` },
  ];
  const tipped = f.filter((x) => x.weight > 0.02).sort((a, b) => b.weight - a.weight).slice(0, 3).map((x) => x.short);
  const held = f.filter((x) => x.weight < -0.02).sort((a, b) => a.weight - b.weight).slice(0, 2).map((x) => x.short);
  const aims = goals.length ? goals.map((g) => `Take ${w.regions[g].name}`) : ['Punish and weaken the enemy (no territorial goal)'];
  aims.push(`Win condition: hold ${quotaText(w, t.id, goals, n.id)} occupations at once within ${days} days`);
  const summary = `${n.name} went to war with ${t.name}${goals.length ? ` to take ${list(goals.map((g) => w.regions[g].name))}` : ' to punish it, claiming no territory'}. ` +
    (tipped.length ? `What tipped it: ${list(tipped)}.` : 'No single reason stood out; congress narrowly chose war.') + (held.length ? ` Against it: ${list(held)}.` : '');
  const tHawk = hawkishness(w, t);
  const provoked = Object.values(w.wars).filter((x) => x.att === t.id && x.def === n.id).length;
  const defender = [
    `${t.name}'s military strength was about ${(power[1] / Math.max(1, power[0])).toFixed(2)}× ${n.name}'s.`,
    goals.length ? `${list(goals.map((g) => w.regions[g].name))} ${goals.length > 1 ? 'were' : 'was'} under threat.` : 'It faced a punitive war with no territorial aim.',
    tAllies.length ? `It could hope for help from ${list(tAllies)}.` : 'It had no allies to call on.',
    `Its congress was ${pct(tHawk.avg)} hawkish; its government's approval was ${Math.round(t.approval)}%.`,
    provoked ? `${t.name} had itself attacked ${n.name} before (${provoked} time${provoked > 1 ? 's' : ''}).` : `It saw the attack as unprovoked.`,
  ];
  // Who proposed it and how congress voted.
  let by: WarCause['by'] = null, vote: WarCause['vote'] = null;
  if (p) {
    const a = w.citizens[p.author];
    const party = a ? partyOf(w, a) : null;
    if (a) by = { id: a.id, name: a.name, role: n.president === a.id ? n.leader : n.deputies.includes(a.id) ? 'deputy' : 'citizen', party: party?.name ?? null };
    const parties = new Map<string, { yes: number; no: number }>();
    for (const [id, v] of Object.entries(p.votes)) {
      const c = w.citizens[Number(id)];
      const pn = (c && partyOf(w, c)?.name) ?? 'Independents';
      const e = parties.get(pn) ?? { yes: 0, no: 0 };
      if (v === 'y') e.yes++; else e.no++;
      parties.set(pn, e);
    }
    const yes = Object.values(p.votes).filter((v) => v === 'y').length;
    vote = { yes, no: Object.values(p.votes).length - yes, eligible, parties: [...parties.entries()].map(([name, x]) => ({ name, ...x })).sort((a, b) => b.yes + b.no - (a.yes + a.no)) };
  }
  return {
    summary, by, vote, aims, defender,
    factors: f.map(({ short: _s, ...x }) => ({ ...x, weight: Math.round(x.weight * 1000) / 1000 || 0 })), // || 0: no negative zero (saves write it as 0)
    snapshot: {
      power: [Math.round(power[0]), Math.round(power[1])], relation: Math.round(rel), approval: [Math.round(n.approval), Math.round(t.approval)],
      mood: [Math.round(n.warMood * 10) / 10, Math.round(t.warMood * 10) / 10],
      regions: [w.regions.filter((r) => r.owner === n.id).length, w.regions.filter((r) => r.owner === t.id).length],
    },
  };
}

function quotaText(w: World, target: Id, goals: Id[], attacker: Id) {
  let q = B.war.quota[Math.min(goals.length, 2)];
  if (w.nations[attacker].exile && goals.length === 1 && goals[0] === w.nations[attacker].capital) q = 1;
  if (B.war.smallNationCap) q = Math.min(q, Math.max(1, w.regions.filter((r) => r.owner === target).length));
  return String(q);
}

export function warDeclared(w: World, war: War, cause: WarCause) {
  const c = chronicleOf(war);
  c.cause = cause;
  for (const id of [war.att, war.def]) c.home[id] = { approval: Math.round(w.nations[id].approval), mood: Math.round(w.nations[id].warMood * 10) / 10 };
  const v = cause.vote;
  note(w, war, '🔥', `${nm(w, war.att)} declared war on ${nm(w, war.def)}${cause.by ? `, proposed by ${cause.by.role} ${cause.by.name}${cause.by.party ? ` (${cause.by.party})` : ''}` : ''}${v ? `; congress voted ${v.yes}–${v.no}` : ''}. ${cause.aims.join('. ')}. Deadline ${fmtDate(war.deadline, 'medium')}.`, { side: 'att' });
}

// ---------- battles ----------

export function battleStarted(w: World, war: War, b: Battle, how: { airOnly: boolean; amphibious: boolean }) {
  const r = w.regions[b.region];
  chronicleOf(war).battles[b.id] = { region: b.region, att: b.att, def: b.def, started: w.time, airOnly: how.airOnly, amphibious: how.amphibious };
  const bases = r.bld.base ? `; a level-${r.bld.base} military base stands there` : '';
  note(w, war, '⚔️', `${nm(w, b.att)} attacked ${r.name}${how.amphibious ? ' with an amphibious landing' : how.airOnly ? ' from the air (no land border or sea control, so only air weapons count)' : ' over land'}. ${nm(w, b.def)} defends (${r.terrain}${bases}${r.supplied ? '' : '; the region is cut off from its capital'}).`, { battle: b.id, region: b.region, side: b.att === war.att ? 'att' : 'def' });
}

export function battleEnded(w: World, war: War, b: Battle, winner: 'a' | 'd' | null, result: string) {
  const c = chronicleOf(war);
  const rec: WarBattleRecord = c.battles[b.id] ?? (c.battles[b.id] = { region: b.region, att: b.att, def: b.def, started: b.started, airOnly: b.airOnly, amphibious: false });
  const fighters: [number, number] = [0, 0];
  const damage: [number, number] = [0, 0]; // over the whole battle (b.dmg only holds the round in progress)
  const best: Record<'a' | 'd', { id: Id; dmg: number } | null> = { a: null, d: null };
  for (const [id, v] of Object.entries(b.total)) {
    for (const s of ['a', 'd'] as const) {
      if (v[s] <= 0) continue;
      fighters[s === 'a' ? 0 : 1]++;
      damage[s === 'a' ? 0 : 1] += v[s];
      if (!best[s] || v[s] > best[s]!.dmg) best[s] = { id: Number(id), dmg: v[s] };
    }
  }
  rec.ended = w.time;
  rec.winner = winner ? (winner === 'a' ? b.att : b.def) : null;
  rec.rounds = [b.wins.a, b.wins.d];
  rec.damage = [Math.round(damage[0]), Math.round(damage[1])];
  rec.fighters = fighters;
  rec.heroes = (['a', 'd'] as const).flatMap((s) => (best[s] ? [{ id: best[s]!.id, name: w.citizens[best[s]!.id]?.name ?? '?', nation: s === 'a' ? b.att : b.def, dmg: Math.round(best[s]!.dmg) }] : []));
  rec.formations = [engaged(w, b, 'a').map((f) => f.name), engaged(w, b, 'd').map((f) => f.name)];
  rec.result = result;
  const r = w.regions[b.region];
  const lasted = fmtDur(w.time - b.started);
  const heroes = rec.heroes.map((h) => `${h.name} for ${nm(w, h.nation)} (${num(h.dmg)} damage)`);
  const units = rec.formations[0].length + rec.formations[1].length ? ` Formations: ${list(rec.formations[0]) || 'none'} against ${list(rec.formations[1]) || 'none'}.` : '';
  const text = winner
    ? `${nm(w, rec.winner!)} won the battle for ${r.name}, ${b.wins.a}–${b.wins.d} in rounds, after ${lasted}. Damage: ${num(damage[0])} by ${nm(w, b.att)} against ${num(damage[1])} by ${nm(w, b.def)}; ${fighters[0]} fighters against ${fighters[1]}.${units}${heroes.length ? ` Heroes: ${list(heroes)}.` : ''} ${result}`
    : `The battle for ${r.name} (${b.wins.a}–${b.wins.d} in rounds after ${lasted}) was ${result}.`;
  note(w, war, winner ? (rec.winner === war.att ? '🏴' : '🛡️') : '⏹️', text.trim(), { battle: b.id, region: b.region, side: rec.winner === war.att ? 'att' : rec.winner === war.def ? 'def' : undefined });
}

// ---------- peace ----------

/** Why a side wants peace (or not): the position the AI weighs in peaceAppetite. */
export function peaceReasons(w: World, n: Nation, war: War): string[] {
  const attacker = n.id === war.att;
  const timeLeft = Math.max(0, (war.deadline - w.time) / Math.max(1, war.deadline - war.declared));
  const out = [
    attacker ? `it held ${war.occupied.length} of the ${war.quota} occupations it needed` : `it had lost ${war.occupied.length} region${war.occupied.length === 1 ? '' : 's'} to occupation (${war.quota} would lose the war)`,
    `${pct(timeLeft)} of the war's time was left`,
    `its recent battle record was ${n.warScore >= 20 ? 'strong' : n.warScore <= -20 ? 'poor' : 'mixed'} (war score ${signed(n.warScore)})`,
  ];
  if ((n.wallet[n.cur] ?? 0) < 2000 * 100) out.push('its treasury was running low');
  const h = hawkishness(w, n);
  out.push(`its congress was ${pct(h.avg)} hawkish`);
  return out;
}

const OFFER_TEXT: Record<string, string> = {
  armistice: 'an armistice (every occupation returned)',
  surrender: 'to surrender',
  demand: 'terms demanding the regions it holds',
  trade: 'a territorial trade',
};

function voteText(p: Proposal | undefined) {
  if (!p) return '';
  const yes = Object.values(p.votes).filter((v) => v === 'y').length;
  return ` (congress vote ${yes}–${Object.values(p.votes).length - yes})`;
}

export function offerMade(w: World, war: War, n: Nation, offer: PeaceOffer, p: Proposal | undefined) {
  const what = offer.kind === 'trade' ? `a territorial trade: keep ${w.regions[offer.take!]?.name ?? '?'} and give back ${w.regions[offer.give!]?.name ?? '?'}` : OFFER_TEXT[offer.kind] ?? offer.kind;
  note(w, war, '🕊️', `${n.name} offered ${what}${voteText(p)}. Why: ${list(peaceReasons(w, n, war))}.`, { side: n.id === war.att ? 'att' : 'def' });
}

export function offerAnswered(w: World, war: War, offer: PeaceOffer, accepted: boolean, p: Proposal | undefined) {
  const answering = w.nations[offer.from === war.att ? war.def : war.att];
  note(w, war, accepted ? '🤝' : '✋', `${answering.name}'s congress ${accepted ? 'accepted' : 'rejected'} ${nm(w, offer.from)}'s ${offer.kind}${voteText(p)}. Its position: ${list(peaceReasons(w, answering, war))}.`, { side: answering.id === war.att ? 'att' : 'def' });
}

// ---------- the end ----------

export function warEnded(w: World, war: War, kind: string, offer: PeaceOffer | undefined, transferred: string[], keepAtt: Id[], relBefore: number) {
  const c = chronicleOf(war);
  const att = w.nations[war.att], def = w.nations[war.def];
  const lasted = fmtDur(w.time - war.declared);
  const heldGoals = war.goals.filter((g) => war.occupied.includes(g)).map((g) => w.regions[g].name);
  const occ = war.occupied.map((r) => w.regions[r].name), counter = war.counter.map((r) => w.regions[r].name);
  const recs = Object.values(c.battles);
  const won = (id: Id) => recs.filter((b) => b.winner === id).length;
  const record = `${recs.length} battle${recs.length === 1 ? '' : 's'}: ${att.name} won ${won(att.id)}, ${def.name} won ${won(def.id)}`;
  let headline = '', winner: Id | null = null;
  const why: string[] = [];
  switch (kind) {
    case 'conquest':
      winner = att.id;
      headline = `${att.name} won: it held ${war.occupied.length} of the ${war.quota} occupations it needed at once.`;
      why.push(`${att.name} occupied ${list(occ)}${heldGoals.length ? `, including the war goal${heldGoals.length > 1 ? 's' : ''} ${list(heldGoals)}` : ''}.`, `${record}.`);
      break;
    case 'deadline':
      winner = keepAtt.length ? att.id : null;
      headline = `The ${Math.round((war.deadline - war.declared) / DAY)}-day deadline ran out with ${war.occupied.length} of the ${war.quota} required occupations held.`;
      why.push(`${att.name} could not hold enough regions at once in the time it gave itself.`, `${record}.`, counter.length ? `${def.name} had counter-occupied ${list(counter)}.` : `${def.name} held no ${att.name} territory.`);
      break;
    case 'armistice':
      headline = `Armistice: ${nm(w, offer?.from ?? war.att)} offered to stop the war and ${nm(w, offer?.from === war.att ? war.def : war.att)} accepted.`;
      why.push(`${record}.`, `Occupations at the time: ${list(occ) || 'none'}${counter.length ? `; counter-occupied: ${list(counter)}` : ''}.`);
      break;
    case 'surrender':
      winner = offer?.from === war.def ? att.id : def.id;
      headline = offer?.from === war.def ? `${def.name} surrendered.` : `${att.name} withdrew from the war it started.`;
      why.push(`${nm(w, offer?.from ?? war.def)} gave up: ${list(peaceReasons(w, w.nations[offer?.from ?? war.def], war))}.`, `${record}.`);
      break;
    case 'demand':
      winner = offer?.from ?? null;
      headline = `${nm(w, offer?.from ?? war.att)}'s demands were accepted.`;
      why.push(`${record}.`);
      break;
    case 'trade':
      headline = 'A negotiated territorial trade ended the war.';
      why.push(`${record}.`);
      break;
    default:
      headline = `The war ended (${kind}).`;
  }
  const terms = [
    transferred.length ? `Territory changed hands: ${list(transferred)}.` : 'No territory changed hands.',
    ...(transferred.length ? [`Each transferred region lost ${B.war.buildingDamage} building level${B.war.buildingDamage === 1 ? '' : 's'}.`] : []),
    occ.length + counter.length > transferred.length ? 'Every other occupied region returned to its owner.' : '',
    `A ${B.war.pactDays}-day non-aggression pact, until ${fmtDate(w.time + B.war.pactDays * DAY, 'medium')}.`,
  ].filter(Boolean);
  const relAfter = Math.round(att.relations[def.id]?.score ?? 0);
  const aftermath = [
    `The war lasted ${lasted}.`,
    `Relations: ${Math.round(relBefore)} before the peace, ${relAfter} after.`,
    `War score: ${att.name} ${signed(att.warScore)}, ${def.name} ${signed(def.warScore)}.`,
    `Government approval: ${att.name} ${Math.round(att.approval)}%, ${def.name} ${Math.round(def.approval)}%.`,
    ...(winner != null ? [] : ['Neither side achieved its aims.']),
  ];
  const ending: WarEnding = { t: w.time, kind, headline, why, terms, aftermath, winner };
  c.ending = ending;
  note(w, war, '🕊️', `${headline} ${terms[0]}`);
}

/** Daily: notable changes on each side's home front while the war lasts. */
export function warChronicleDaily(w: World) {
  for (const war of Object.values(w.wars)) {
    if (war.status !== 'active') continue;
    const c = chronicleOf(war);
    for (const id of [war.att, war.def]) {
      const n = w.nations[id];
      const now = { approval: Math.round(n.approval), mood: Math.round(n.warMood * 10) / 10 };
      const last = c.home[id];
      if (!last) { c.home[id] = now; continue; }
      const parts: string[] = [];
      if (Math.abs(now.approval - last.approval) >= 8) parts.push(`government approval ${now.approval > last.approval ? 'rose' : 'fell'} to ${now.approval}% (${signed(now.approval - last.approval)})`);
      if (now.mood >= 1 && last.mood < 1) parts.push(`the press turned in favour of the war (war mood ${now.mood})`);
      if (now.mood <= -1 && last.mood > -1) parts.push(`the public turned against the war (war mood ${now.mood})`);
      if (!parts.length) continue;
      note(w, war, '🏠', `At home in ${n.name}: ${list(parts)}.`, { side: id === war.att ? 'att' : 'def' });
      c.home[id] = now;
    }
  }
}

/** A nation lost its last territory: every war it is in records it. */
export function exiled(w: World, n: Nation) {
  for (const war of Object.values(w.wars)) {
    if (war.status === 'active' && (war.att === n.id || war.def === n.id)) note(w, war, '🏳️', `${n.name} lost its last territory and fights on as a nation in exile.`, { side: war.att === n.id ? 'att' : 'def' });
  }
}
