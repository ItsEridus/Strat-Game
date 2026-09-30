// Tutorial (onboarding ally), daily missions, three campaign branches and an
// earnable season track. Rewards are real ledger mints tracked by reason.
import type { Inventory, QuestState, World } from './types';
import { B } from '../data/balance';
import { ENVOY_NAME } from '../data/names';
import { fail, ok, type Result } from '../engine/result';
import { mint, produce } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { dayOf } from '../engine/clock';
import { notify, sendMsg } from '../engine/events';
import { shuffle } from '../engine/rng';
import { cref, player, studyActive } from './query';
import { addXp } from './citizen';
import { counter } from './progress';
import { itemName } from '../data/items';

/** Metric values: activity counters plus a few state-derived metrics. */
export function metric(w: World, m: string): number {
  const p = player(w);
  const n = w.nations[p.nation];
  switch (m) {
    case 'dmg': return p.dmgTotal;
    case 'build': return p.buildTotal;
    case 'level': return p.level;
    case 'isDeputy': return n.deputies.includes(p.id) ? 1 : 0;
    case 'isMinister': return Object.values(n.cabinet).includes(p.id) ? 1 : 0;
    case 'isPresident': return n.president === p.id ? 1 : 0;
    case 'inParty': return p.party != null ? 1 : 0;
    case 'inUnit': return p.unit != null ? 1 : 0;
    case 'hasJob': return p.job != null ? 1 : 0;
    case 'companies': return Object.values(w.companies).filter((c) => c.owner.k === 'cit' && c.owner.id === p.id).length;
    case 'employees': return Object.values(w.companies).filter((c) => c.owner.k === 'cit' && c.owner.id === p.id).reduce((s, c) => s + c.workers.length, 0);
    case 'shares': return Object.values(w.holdings).reduce((s, h) => s + (h.shares[p.id] ?? 0), 0);
    case 'attrSpent': return Object.values(p.attrs).reduce((a, b) => a + b, 0);
    case 'gearCount': return Object.values(w.gear).filter((x) => x.owner?.k === 'cit' && x.owner.id === p.id).length;
    case 'paper': return Object.values(w.papers).some((x) => x.owner.k === 'cit' && x.owner.id === p.id) ? 1 : 0;
    default: return counter(w, m);
  }
}

// ---------- tutorial ----------
export const TUTORIAL: { text: string; metric: string; target: number; hint: string; tab: string; gold: number }[] = [
  { text: 'Find a job', metric: 'hasJob', target: 1, hint: 'Open Employment and apply to an offer. Compare the net wage after work tax.', tab: 'jobs', gold: 0.5 },
  { text: 'Work your first shift', metric: 'work', target: 1, hint: 'Working costs 10 energy, pays a wage and grows economic skill.', tab: 'jobs', gold: 0.5 },
  { text: 'Train at the training grounds', metric: 'train', target: 1, hint: 'Your first training each day raises training power.', tab: 'character', gold: 0.5 },
  { text: 'Spend your attribute points', metric: 'attrSpent', target: 3, hint: 'Character → Attributes. Each point has a concrete effect.', tab: 'character', gold: 0.5 },
  { text: 'Buy food on the market', metric: 'buy', target: 1, hint: 'Goods Market → Food. Purchases require being in that country.', tab: 'market', gold: 0.5 },
  { text: 'Eat to restore energy', metric: 'eat', target: 1, hint: 'Eating uses one allowance; allowance regenerates every 45 minutes.', tab: 'inventory', gold: 0.5 },
  { text: 'Exchange currency for gold (or gold for currency)', metric: 'fx', target: 1, hint: 'Currency Market: asks sell gold, bids buy gold.', tab: 'fx', gold: 0.5 },
  { text: 'Join a political party', metric: 'inParty', target: 1, hint: 'Parties → Join. Members vote in party elections and can run for office.', tab: 'parties', gold: 0.5 },
  { text: 'Make a hit in any battle', metric: 'hit', target: 1, hint: 'Wars → choose a battle → Attack. Each hit uses a weapon if one is selected.', tab: 'wars', gold: 0.5 },
  { text: 'Found your first company', metric: 'found', target: 1, hint: 'Companies → Found. The tutorial reward covers a Q1 company.', tab: 'companies', gold: 2 },
];
export const TUTORIAL_COMPLETION_GOLD = 12; // SOLO: enough to found a first business

export function tutorialStep(w: World) {
  return w.player.tutorialDone ? null : TUTORIAL[w.player.tutorial] ?? null;
}

// ---------- dailies ----------
const DAILY_POOL: { text: string; metric: string; target: number; lvl?: number }[] = [
  { text: 'Work a shift', metric: 'work', target: 1 },
  { text: 'Train', metric: 'train', target: 1 },
  { text: 'Eat 3 times', metric: 'eat', target: 3 },
  { text: 'Buy something on the market', metric: 'buy', target: 1 },
  { text: 'Make 5 hits in battle', metric: 'hit', target: 5 },
  { text: 'Contribute to construction', metric: 'buildAct', target: 1 },
  { text: 'Publish an article', metric: 'article', target: 1, lvl: 2 },
  { text: 'Vote (election or congress)', metric: 'vote', target: 1, lvl: 3 },
  { text: 'List goods for sale', metric: 'list', target: 1 },
  { text: 'Work as manager', metric: 'manage', target: 1 },
  { text: 'Trade on the currency market', metric: 'fx', target: 1 },
  { text: 'Travel to another region', metric: 'travel', target: 1 },
  { text: 'Contribute to academy studies', metric: 'study', target: 1 },
  { text: 'Complete a mining shift', metric: 'mine', target: 1 },
  { text: 'Read your inbox and reply', metric: 'reply', target: 1 },
];

function makeQuest(w: World, def: { text: string; metric: string; target: number }, reward: QuestState['reward']): QuestState {
  return { id: `${def.metric}-${w.seq++}`, text: def.text, metric: def.metric, target: def.target, base: metric(w, def.metric), done: false, claimed: false, reward };
}

export function rollDailies(w: World) {
  const p = player(w);
  const pool = shuffle(w, DAILY_POOL.filter((d) => !d.lvl || p.level >= d.lvl)).slice(0, B.missions.count);
  w.player.dailies = pool.map((d) => makeQuest(w, d, { gold: g(B.missions.gold), prestige: B.missions.prestige, xp: p.level >= 2 ? B.xp.daily : 0 }));
  w.player.dailyDay = dayOf(w.time);
}

// ---------- campaigns ----------
export const CAMPAIGNS: Record<string, { name: string; steps: { text: string; metric: string; target: number; reward: QuestState['reward'] }[] }> = {
  political: {
    name: 'Political career',
    steps: [
      { text: 'Publish an article', metric: 'article', target: 1, reward: { xp: 5, gold: g(0.5) } },
      { text: 'Join a party', metric: 'inParty', target: 1, reward: { xp: 5, gold: g(0.5) } },
      { text: 'Vote in an election', metric: 'vote', target: 1, reward: { xp: 5, gold: g(1) } },
      { text: 'Register as a candidate', metric: 'candidate', target: 1, reward: { xp: 10, gold: g(1) } },
      { text: 'Win a congress seat', metric: 'isDeputy', target: 1, reward: { xp: 20, gold: g(3) } },
      { text: 'Author a law that passes', metric: 'lawPassed', target: 1, reward: { xp: 20, gold: g(3) } },
      { text: 'Serve as a minister', metric: 'isMinister', target: 1, reward: { xp: 25, gold: g(4) } },
      { text: 'Become president', metric: 'isPresident', target: 1, reward: { xp: 50, gold: g(10) } },
    ],
  },
  military: {
    name: 'Military service',
    steps: [
      { text: 'Make 10 hits', metric: 'hit', target: 10, reward: { xp: 5, items: { 'wg:1': 10 } } },
      { text: 'Train on 5 different days', metric: 'trainDays', target: 5, reward: { xp: 5, items: { 'food:2': 5 } } },
      { text: 'Buy weapons on the market', metric: 'buyWeapon', target: 1, reward: { xp: 5, gold: g(0.5) } },
      { text: 'Deal 50,000 lifetime damage', metric: 'dmg', target: 50000, reward: { xp: 10, gold: g(1), items: { 'sp:steroids': 1 } } },
      { text: 'Join a military unit', metric: 'inUnit', target: 1, reward: { xp: 10, gold: g(1) } },
      { text: 'Equip a piece of gear', metric: 'equip', target: 1, reward: { xp: 10, items: { 'sp:focus': 1 } } },
      { text: 'Earn a hero medal', metric: 'hero', target: 1, reward: { xp: 20, gold: g(3) } },
      { text: 'Enter a tournament', metric: 'tournament', target: 1, reward: { xp: 20, gold: g(3) } },
    ],
  },
  economic: {
    name: 'Economic empire',
    steps: [
      { text: 'Work 5 shifts', metric: 'work', target: 5, reward: { xp: 5, gold: g(0.5) } },
      { text: 'Found a company', metric: 'found', target: 1, reward: { xp: 10, gold: g(2) } },
      { text: 'Employ a worker', metric: 'employees', target: 1, reward: { xp: 10, gold: g(1) } },
      { text: 'Sell 100 goods on markets', metric: 'sell', target: 100, reward: { xp: 10, gold: g(2) } },
      { text: 'Upgrade a company', metric: 'upgrade', target: 1, reward: { xp: 10, gold: g(3) } },
      { text: 'Contribute to construction', metric: 'buildAct', target: 1, reward: { xp: 10, items: { 'sp:hammer': 1 } } },
      { text: 'Own shares in a holding', metric: 'shares', target: 1, reward: { xp: 15, gold: g(3) } },
      { text: 'Own three companies', metric: 'companies', target: 3, reward: { xp: 25, gold: g(8) } },
    ],
  },
};

export function campaignStep(w: World, branch: string) {
  const st = w.player.campaigns[branch];
  const def = CAMPAIGNS[branch];
  if (!st || st.idx >= def.steps.length) return null;
  return def.steps[st.idx];
}

// ---------- season ----------
export function seasonReward(tier: number): QuestState['reward'] {
  const rot = tier % 5;
  if (rot === 0) return { gold: g(1 + tier * 0.1) };
  if (rot === 1) return { items: { [`food:${Math.min(5, 1 + Math.floor(tier / 6))}`]: 10 } };
  if (rot === 2) return { items: { [`wg:${Math.min(5, 1 + Math.floor(tier / 6))}`]: 10 } };
  if (rot === 3) return { items: { [`sp:${['medic', 'adrenaline', 'steroids', 'focus', 'hammer', 'coffee', 'protein', 'manual'][Math.floor(tier / 5) % 8]}`]: 1 } };
  return { gold: g(0.5), xp: 10 };
}
export const seasonTier = (w: World) => Math.floor(w.player.prestige / B.season.prestigePerTier);

// ---------- rewards ----------
export function grant(w: World, reward: QuestState['reward'], why: string): string {
  const p = player(w);
  const parts: string[] = [];
  if (reward.gold) { mint(w, cref(p.id), GOLD, reward.gold, why); parts.push(`${(reward.gold / 1000).toFixed(2)} gold`); }
  if (reward.xp) { addXp(w, p, reward.xp); parts.push(`${reward.xp} XP`); }
  if (reward.prestige) { w.player.prestige += reward.prestige; parts.push(`${reward.prestige} prestige`); }
  for (const [k, n] of Object.entries(reward.items ?? {} as Inventory)) {
    if (produce(w, cref(p.id), k, n, why)) parts.push(`${n} ${itemName(k)}`);
  }
  return parts.join(', ');
}

export function claimDaily(w: World, id: string): Result {
  const q = w.player.dailies.find((x) => x.id === id);
  if (!q) return fail('Mission not found.');
  if (q.claimed) return fail('Already claimed.');
  if (metric(w, q.metric) - q.base < q.target) return fail('Not complete yet.');
  q.claimed = q.done = true;
  const reward = { ...q.reward };
  if (reward.gold && studyActive(w, player(w), 'biggerincome')) reward.gold = Math.round(reward.gold * 1.25);
  return ok(`Mission reward: ${grant(w, reward, 'Daily mission reward')}.`);
}

export function claimSeason(w: World, tier: number): Result {
  if (tier >= B.season.tiers) return fail('Invalid tier.');
  if (seasonTier(w) <= tier) return fail('Not enough prestige yet.');
  if (w.player.seasonClaimed.includes(tier)) return fail('Already claimed.');
  w.player.seasonClaimed.push(tier);
  return ok(`Season tier ${tier + 1}: ${grant(w, seasonReward(tier), 'Season track reward')}.`);
}

/** Checks tutorial & campaign progress; called after player actions and hourly. */
export function checkProgress(w: World) {
  const ps = w.player;
  // tutorial
  let guard = 0;
  while (!ps.tutorialDone && guard++ < 20) {
    const step = TUTORIAL[ps.tutorial];
    if (!step) break;
    if (metric(w, step.metric) < step.target) break;
    const reward = grant(w, { gold: g(step.gold), xp: 2 }, 'Tutorial reward');
    notify(w, 'progress', `✅ Tutorial: ${step.text} (+${reward})`);
    ps.tutorial++;
    const nxt = TUTORIAL[ps.tutorial];
    if (nxt) sendMsg(w, { from: null, subject: `${ENVOY_NAME}: next, ${nxt.text.toLowerCase()}`, body: nxt.hint, kind: 'system' });
    else {
      ps.tutorialDone = true;
      const r = grant(w, { gold: g(TUTORIAL_COMPLETION_GOLD) }, 'Tutorial completion');
      sendMsg(w, { from: null, subject: `${ENVOY_NAME}: you’re ready`, body: `You know the basics. Here is ${r} to invest — a first company, gear or studies. Careers are never locked: mix business, politics, military service, construction and publishing as you like.`, kind: 'system' });
      notify(w, 'progress', `🎓 Tutorial complete! +${r}.`, { critical: false });
    }
  }
  // campaigns (auto-advance and grant)
  for (const branch of Object.keys(CAMPAIGNS)) {
    const st = ps.campaigns[branch];
    let step = campaignStep(w, branch);
    while (step && metric(w, step.metric) >= step.target) {
      const r = grant(w, step.reward, 'Campaign reward');
      notify(w, 'progress', `🏁 ${CAMPAIGNS[branch].name}: ${step.text} (+${r})`);
      st.idx++;
      step = campaignStep(w, branch);
    }
  }
  // dailies: mark done (claim is manual)
  for (const q of ps.dailies) if (!q.done && metric(w, q.metric) - q.base >= q.target) {
    q.done = true;
    notify(w, 'progress', `🎯 Mission complete: ${q.text} — claim your reward.`, { link: 'missions' });
  }
}

export function initPlayerProgress(w: World) {
  w.player = {
    tutorial: 0, tutorialDone: false, dailies: [], dailyDay: -1, campaigns: { political: { idx: 0, base: 0 }, military: { idx: 0, base: 0 }, economic: { idx: 0, base: 0 } },
    prestige: 0, seasonClaimed: [], season: 1, counters: {}, achievements: {}, watch: null, following: [],
  };
  rollDailies(w);
  sendMsg(w, {
    from: null, subject: `Welcome from ${ENVOY_NAME}, your civic guide`, kind: 'system',
    body: `Welcome, citizen. I’ll help you find your feet. Start by finding a job (Employment) — ${TUTORIAL[0].hint} Time only moves when you let it: use the clock controls at the top to play, pause, or jump ahead.`,
  });
}
