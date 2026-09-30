// Newspapers and articles. Readership and influence come from the chosen topic,
// stance and the current situation (not from parsing prose). NPC journalists
// report real events. Revenue comes from background readers (households).
import type { Article, Citizen, Id, Newspaper, World } from './types';
import { census, nationals, representation } from './census';
import { B } from '../data/balance';
import { PAPER_WORDS } from '../data/names';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { burn, pay } from '../engine/ledger';
import { GOLD, c as cur, g } from '../engine/money';
import { DAY } from '../engine/clock';
import { nid, notify, record } from '../engine/events';
import { chance, pick, rand, randInt } from '../engine/rng';
import { addXp } from './citizen';
import { citizensOf, cref, hhref, player } from './query';
import { partiesOf, partyOf } from './politics';
import { bump } from './progress';

export type Topic = Article['topic'];
export const STANCES: Record<Topic, { id: string; label: string }[]> = {
  politics: [{ id: 'support-gov', label: 'Support the government' }, { id: 'oppose-gov', label: 'Criticise the government' }, { id: 'promote-party', label: 'Promote my party' }, { id: 'endorse', label: 'Endorse a citizen' }],
  war: [{ id: 'rally', label: 'Rally behind the war effort' }, { id: 'pro-war', label: 'Call for military action' }, { id: 'anti-war', label: 'Call for peace' }],
  economy: [{ id: 'tax-cuts', label: 'Argue for lower taxes' }, { id: 'investment', label: 'Argue for public investment' }, { id: 'report', label: 'Market report' }],
  guide: [{ id: 'guide', label: 'Guide for newcomers' }],
  social: [{ id: 'community', label: 'Community & culture' }],
};

export const papersOwnedBy = (w: World, cid: Id) => Object.values(w.papers).filter((p) => p.owner.k === 'cit' && p.owner.id === cid);

export function foundPaperCheck(w: World, c: Citizen): string | null {
  if (papersOwnedBy(w, c.id).length) return 'You already own a newspaper.';
  if ((c.wallet[GOLD] ?? 0) < g(B.newspaper.cost)) return `Founding a newspaper costs ${B.newspaper.cost} gold.`;
  return null;
}

export function createPaper(w: World, owner: Citizen, name: string): Newspaper {
  const p: Newspaper = { id: nid(w), name, owner: cref(owner.id), nation: owner.nation, subs: [], bgSubs: 20, founded: w.time, revenue: 0, articles: 0 };
  w.papers[p.id] = p;
  return p;
}

export function foundPaper(w: World, c: Citizen, name: string): Result {
  const why = foundPaperCheck(w, c);
  if (why) return fail(why);
  if (!name.trim()) return fail('Name your newspaper.');
  burn(w, cref(c.id), GOLD, g(B.newspaper.cost), 'Newspaper founding');
  const p = createPaper(w, c, name.trim().slice(0, 40));
  record(w, 'press', `📰 ${c.name} founded the newspaper “${p.name}”.`, { cit: c.id, nation: c.nation, player: c.player });
  return ok(`“${p.name}” is ready for its first article.`);
}

/** How relevant a topic is right now in a nation (0.6..1.8). */
export function relevance(w: World, nation: Id, topic: Topic): number {
  const atWar = Object.values(w.wars).some((x) => x.status === 'active' && (x.att === nation || x.def === nation));
  const elections = Object.values(w.elections).some((e) => !e.done && e.nation === nation && e.kind !== 'party' && e.at - w.time < 3 * DAY);
  const n = w.nations[nation];
  switch (topic) {
    case 'war': return atWar ? 1.8 : 0.7;
    case 'politics': return elections ? 1.6 : 1;
    case 'economy': return n.unemployment > 0.2 || n.approval < 45 ? 1.4 : 1;
    case 'guide': return 0.9;
    default: return 0.8;
  }
}

export function articleCheck(w: World, c: Citizen, paperId: Id): string | null {
  const p = w.papers[paperId];
  if (!p) return 'Newspaper not found.';
  if (!(p.owner.k === 'cit' && p.owner.id === c.id)) return 'You can only publish in your own newspaper.';
  if (c.energy < B.cost.article) return `Needs ${B.cost.article} energy.`;
  if (c.flags.articleDay === Math.floor(w.time / DAY)) return 'One article per day.';
  return null;
}

/** Publish: readership, influence, party/approval effects, reader reactions — all from topic & stance. */
export function publish(w: World, c: Citizen, paperId: Id, topic: Topic, stance: string, title: string, text: string, target?: Id): Result {
  const why = articleCheck(w, c, paperId);
  if (why) return fail(why);
  if (!STANCES[topic].some((s) => s.id === stance)) return fail('Pick a stance for this topic.');
  const p = w.papers[paperId];
  const n = w.nations[p.nation];
  c.energy -= B.cost.article;
  c.flags.articleDay = Math.floor(w.time / DAY);
  const quality = 1 + Math.min(1, c.level / 40) + c.influence / 200;
  const readers = Math.round((p.subs.length * 3 + p.bgSubs) * relevance(w, p.nation, topic) * quality * rand(w, 0.8, 1.2)) + 5;
  const effects: string[] = [];
  let votes = 0;
  const comments: { by: Id; text: string }[] = [];
  const presParty = n.president != null ? w.citizens[n.president]?.party : null;
  // Individual NPC readers react by their views: a sample of the country (subscribers first).
  const rep = representation(w, p.nation);
  const all = nationals(w, p.nation);
  const subs = new Set(p.subs);
  const sample: Citizen[] = [];
  for (const id of p.subs) { const x = w.citizens[id]; if (x && !x.player && x.nation === p.nation && sample.length < 50) sample.push(x); }
  for (let i = 0; i < 30 && all.length; i++) { const x = all[randInt(w, 0, all.length - 1)]; if (!x.player && !subs.has(x.id)) sample.push(x); }
  const cits = sample;
  for (const r of cits) {
    if (!chance(w, Math.min(0.9, (readers * rep) / 400 + (subs.has(r.id) ? 0.6 : 0.1)))) continue;
    const agree = agrees(w, r, stance, c, presParty, target);
    r.rel[c.id] = (r.rel[c.id] ?? 0) + (agree > 0 ? 1.5 : agree < 0 ? -0.8 : 0.3);
    if (agree > 0 && chance(w, 0.5)) votes++;
    if (agree > 0 && !subs.has(r.id) && chance(w, 0.15)) p.subs.push(r.id);
    if (comments.length < 3 && chance(w, 0.12)) comments.push({ by: r.id, text: comment(w, agree, topic) });
  }
  const influence = Math.round((readers / 60 + votes / 3) * 10) / 10;
  c.influence += influence;
  effects.push(`+${influence} influence`);
  p.bgSubs += Math.round(readers / 40 + (topic === 'guide' ? 2 : 0));
  // Political effects scale with readership.
  // Political weight of readership (SOLO), relative to the size of the society reading it.
  const k = Math.min(c.player ? 1.5 : 0.4, readers / 2500) * Math.max(rep, 0.25); // AI editorials: at most ~1 approval point
  if (stance === 'support-gov') { n.approval = Math.min(100, n.approval + 2 * k); effects.push(`approval +${(2 * k).toFixed(1)}`); }
  if (stance === 'oppose-gov') { n.approval = Math.max(0, n.approval - 2 * k); for (const pt of partiesOf(w, n.id)) if (pt.id !== presParty) pt.support += 1.5 * k; effects.push(`approval −${(2 * k).toFixed(1)}`); }
  if (stance === 'promote-party') { const pt = partyOf(w, c); if (pt) { pt.support += 3 * k; effects.push(`${pt.name} support +${(3 * k).toFixed(1)}`); } }
  if (stance === 'endorse' && target != null && w.citizens[target]) { w.citizens[target].influence += 3 * k + 1; w.citizens[target].rel[c.id] = (w.citizens[target].rel[c.id] ?? 0) + 8; effects.push(`${w.citizens[target].name} influence +${(3 * k + 1).toFixed(1)}`); }
  if (stance === 'rally') { n.warScore = Math.min(100, n.warScore + 2 * k); effects.push('war morale up'); }
  if (stance === 'pro-war' || stance === 'anti-war') { n.warMood = Math.max(-5, Math.min(5, n.warMood + (stance === 'pro-war' ? 1 : -1) * k)); effects.push(stance === 'pro-war' ? 'hawkish mood up' : 'peace mood up'); }
  const art: Article = { id: nid(w), paper: paperId, author: c.id, t: w.time, topic, stance, title: title.trim().slice(0, 90) || defaultTitle(w, topic, stance, n.name), text: text.slice(0, 2000), readers, votes, comments, effect: effects.join(', ') };
  w.articles[art.id] = art;
  p.articles++;
  pruneArticles(w);
  addXp(w, c, B.xp.article);
  if (c.player) { bump(w, 'article'); record(w, 'press', `📰 ${c.name} published “${art.title}” in ${p.name} (${readers} readers).`, { cit: c.id, nation: p.nation, player: true }); }
  return ok(`Published “${art.title}”: ${readers} readers, ${votes} endorsements. ${effects.join('; ')}.`);
}

function agrees(w: World, r: Citizen, stance: string, author: Citizen, presParty: Id | null | undefined, target?: Id): number {
  const hawk = IDEOLOGIES[r.ideo].hawk;
  switch (stance) {
    case 'support-gov': return r.party === presParty ? 1 : r.mood > 0 ? 0.5 : -1;
    case 'oppose-gov': return r.party === presParty ? -1 : r.mood < 0 ? 1 : 0;
    case 'promote-party': return r.party === author.party ? 1 : r.ideo === w.parties[author.party ?? -1]?.ideo ? 0.5 : -0.3;
    case 'endorse': return target != null ? (r.rel[target] ?? 0) >= 0 ? 0.5 : -0.5 : 0;
    case 'rally': case 'pro-war': return hawk - 0.5;
    case 'anti-war': return 0.5 - hawk;
    case 'tax-cuts': return -IDEOLOGIES[r.ideo].taxPref;
    case 'investment': return IDEOLOGIES[r.ideo].taxPref;
    default: return 0.4;
  }
}

function comment(w: World, agree: number, topic: Topic) {
  const pos = ['Well argued.', 'Finally someone says it.', 'Voted up — more of this.', 'Sharing this with my party.', 'Clear and useful, thanks.'];
  const neg = ['I disagree completely.', 'This ignores the facts on the ground.', 'Propaganda.', 'Who pays for this?', 'Not convinced.'];
  const neu = ['Interesting read.', `Good to see ${topic} covered.`, 'Following for updates.'];
  return pick(w, agree > 0 ? pos : agree < 0 ? neg : neu);
}

function defaultTitle(w: World, topic: Topic, stance: string, nation: string) {
  const t: Record<string, string[]> = {
    'support-gov': [`Why ${nation}’s government deserves our trust`, 'Steady hands at the helm'],
    'oppose-gov': ['Time for a change in government', `${nation} deserves better leadership`],
    'promote-party': ['Our party’s plan for the future', 'Join us: a program for everyone'],
    endorse: ['A citizen worth backing', 'Leadership we can believe in'],
    rally: ['Stand with our soldiers', 'Every hit counts'],
    'pro-war': ['Strength is the path to security', 'Our borders will not defend themselves'],
    'anti-war': ['Peace before ruin', 'Bring the soldiers home'],
    'tax-cuts': ['Let workers keep their wages', 'Lower taxes, stronger markets'],
    investment: ['Build hospitals, build the future', 'Public works pay for themselves'],
    report: ['Market report: prices and shortages', 'Where the money is moving'],
    guide: ['A newcomer’s guide to working, training and eating', 'First steps in the Reach'],
    community: ['Voices from our towns', 'A day in the capital'],
  };
  return pick(w, t[stance] ?? [`On ${topic}`]);
}

function pruneArticles(w: World) {
  const ids = Object.keys(w.articles).map(Number).sort((a, b) => a - b);
  for (const id of ids.slice(0, Math.max(0, ids.length - 400))) delete w.articles[id];
}

export function subscribe(w: World, c: Citizen, paperId: Id): Result {
  const p = w.papers[paperId];
  if (!p) return fail('Not found.');
  if (p.subs.includes(c.id)) { p.subs = p.subs.filter((x) => x !== c.id); return ok('Unsubscribed.'); }
  p.subs.push(c.id);
  return ok(`Subscribed to ${p.name}.`);
}

/** Daily: background readers pay the owner (closed loop from households). */
export function pressDaily(w: World) {
  for (const p of Object.values(w.papers)) {
    if (p.owner.k !== 'cit' || !w.citizens[p.owner.id]) continue;
    const n = w.nations[p.nation];
    const due = Math.floor(cur(B.newspaper.revenuePerReader) * p.bgSubs);
    const hh = w.households[p.nation];
    const amt = Math.min(due, Math.floor((hh.wallet[n.cur] ?? 0) * 0.01));
    if (amt > 0 && pay(w, hhref(p.nation), p.owner, n.cur, amt, `Subscriptions for ${p.name}`)) p.revenue += amt;
    p.bgSubs = Math.max(10, Math.round(p.bgSubs * 0.99));
  }
}

/** NPC journalists report real events from the last day. */
export function npcJournalism(w: World) {
  const since = w.time - DAY;
  const events = w.log.filter((e) => e.t >= since && e.important);
  // At most two AI editorials per country per day, however many papers there are.
  const written: Record<Id, number> = {};
  for (const p of Object.values(w.papers).sort((a, b) => a.id - b.id)) {
    const owner = p.owner.k === 'cit' ? w.citizens[p.owner.id] : null;
    if (!owner || owner.player) continue;
    if ((written[p.nation] ?? 0) >= 2) continue;
    written[p.nation] = (written[p.nation] ?? 0) + 1;
    const local = events.filter((e) => e.nation === p.nation || e.nation == null);
    const n = w.nations[p.nation];
    let topic: Topic = 'economy', stance = 'report', title = '';
    const ev = local[local.length - 1];
    if (ev) {
      topic = ev.type === 'war' ? 'war' : ev.type === 'election' || ev.type === 'law' ? 'politics' : 'economy';
      stance = topic === 'war' ? (IDEOLOGIES[owner.ideo].hawk > 0.5 ? 'rally' : 'anti-war') : topic === 'politics' ? (owner.party === w.citizens[n.president ?? -1]?.party ? 'support-gov' : 'oppose-gov') : 'report';
      title = ev.text.replace(/^[^\w]+\s*/, '').slice(0, 80);
    } else if (w.households[p.nation].unmet > 2000 * 100) {
      topic = 'economy'; stance = 'report'; title = `Shortages: shoppers in ${n.name} find empty shelves`;
    } else if (chance(w, 0.5)) continue;
    owner.energy = Math.max(owner.energy, B.cost.article);
    owner.flags.articleDay = -1;
    publish(w, owner, p.id, topic, stance, title, '');
  }
}

export function seedPapers(w: World) {
  for (const n of w.nations) {
    const j = census(w).all.filter((c) => c.nation === n.id && c.persona === 'journalist' && !c.player).sort((a, b) => b.influence - a.influence)[0];
    if (!j) continue;
    const p = createPaper(w, j, `The ${n.adj} ${pick(w, PAPER_WORDS)}`);
    p.bgSubs = 60;
    p.subs = citizensOf(w, n.id).filter((c) => !c.player && chance(w, 0.25)).map((c) => c.id);
  }
}

export function pressNotifyPlayer(w: World) {
  const pl = player(w);
  const mine = papersOwnedBy(w, pl.id);
  if (!mine.length) return;
  const t = mine.reduce((s, p) => s + p.revenue, 0);
  if (t > 0 && Math.floor(w.time / DAY) % 7 === 0) notify(w, 'progress', `📰 Your newspapers have earned ${t / 100} in subscriptions so far.`, { link: 'press' });
}
