// Narrative engine. Stories are authored definitions (src/data/stories) bound to
// real entities: a strike at a real company, a loan from a real friend, a real
// crisis. Each running story is a saved instance with its bindings, current
// stage, deadline, decisions and ending. Choices are validated when made (never
// from what was on screen), run once, and act through the normal systems
// (ledger, relationships, police cases, elections). The journal and each
// person's memories keep what happened after inbox messages and logs are pruned.
//
// Selection happens in the hourly hook (or an explicit action), never while
// rendering: opening a screen does not consume randomness or change offers.
import { hasQuirk } from './nature';
import type { Citizen, Id, JournalEntry, Memory, Msg, StoryInstance, World } from './types';
import { fail, ok, type Result } from '../engine/result';
import { DAY, HOUR } from '../engine/clock';
import { nid, notify } from '../engine/events';
import { chance, randInt, weighted } from '../engine/rng';
import { player } from './query';
import { adjustRel } from './social';

// ---------- definitions ----------

export interface Outcome {
  text: string;
  next?: string; // next stage (same story)
  wait?: { minutes: number; why: string }; // next stage begins later
  end?: string; // ending name: the story is complete
  decline?: boolean; // the player turned it down
  fail?: boolean; // the action could not be carried out: nothing is recorded and the stage stays
  /** Arrange a meeting with a bound person (at a venue kind); the next stage waits for it (data.met = 1 if kept, 0 if missed). */
  meet?: { role: string; venue: string; what: string };
}

/** Set by sim/places.ts: books a story meeting; returns its time, or null if it cannot be arranged. */
export const MEET_HOOK: { fn?: (w: World, inst: StoryInstance, meet: { role: string; venue: string; what: string }) => number | null } = {};
export interface Choice {
  id: string;
  label: string;
  hint: string;
  why?: string | null; // disabled reason, recomputed when the choice is made
  chance?: number; // shown success probability for checks (0..1)
  run: (c: Ctx) => Outcome;
}
export interface Stage {
  text: (c: Ctx) => string;
  choices: (c: Ctx) => Choice[];
  /** Short line for the journal: what you know and what to do next. */
  lead?: (c: Ctx) => string;
  /** Returns a reason when the premise no longer holds (company sold, crisis over…). */
  stale?: (c: Ctx) => string | null;
  /** Alternative route when stale; without it the story ends as invalidated with the reason. */
  onStale?: (c: Ctx, why: string) => Outcome;
  expires?: number; // minutes after the stage begins
  onExpire?: (c: Ctx) => Outcome;
  urgent?: boolean; // pops up and pauses; otherwise it waits in the journal as a lead
  /** Where the player must be to act (region); the journal offers to travel there. */
  region?: (c: Ctx) => Id | null;
}
export interface StoryDef {
  id: string;
  version: number;
  title: (c: Ctx) => string;
  icon: string;
  kind: 'standalone' | 'chain';
  tags: string[]; // economy, politics, crime, war, social, crisis, press, intel
  /** Everyday situations: offered by the ambient director (weight) when bind() finds a fit. */
  ambient?: { weight: number; cooldownDays: number };
  /** World-driven stories: checked by the director each hour; returns bindings and a source key. */
  trigger?: (w: World, p: Citizen) => Binding | null;
  /** Bindings for an ambient offer (may use randomness: runs only in the director). */
  bind?: (w: World, p: Citizen) => Binding | null;
  start: string;
  stages: Record<string, Stage>;
  /** Legacy inbox decisions this story presents (message handler name). */
  adopts?: string;
  /** Extra bindings for an adopted message (for example the people involved). */
  adoptBind?: (w: World, m: Msg) => Record<string, number | string> | null;
}
export interface Binding { bind: Record<string, number | string>; key: string; data?: Record<string, number | string> }

export const STORIES: Record<string, StoryDef> = {};
export function registerStory(...defs: StoryDef[]) {
  for (const d of defs) {
    if (STORIES[d.id]) throw new Error(`Duplicate story definition ${d.id}`);
    if (!d.stages[d.start]) throw new Error(`Story ${d.id}: missing start stage ${d.start}`);
    STORIES[d.id] = d;
  }
}

/** Everything a stage needs to describe itself and act. */
export class Ctx {
  constructor(readonly w: World, readonly inst: StoryInstance) {}
  /** The story's protagonist: whoever it is about (the player at the time it began, or their heir after succession). */
  get p() { return protagonist(this.w, this.inst); }
  get def() { return STORIES[this.inst.def]; }
  cit(role: string): Citizen | undefined { const id = this.inst.bind[role]; return typeof id === 'number' ? this.w.citizens[id] : undefined; }
  num(key: string): number { return Number(this.inst.data[key] ?? this.inst.bind[key] ?? 0); }
  str(key: string): string { return String(this.inst.data[key] ?? this.inst.bind[key] ?? ''); }
  set(key: string, v: number | string) { this.inst.data[key] = v; }
  /** Record how a person feels about what the player did (relationship change + memory). */
  remember(npc: Citizen | undefined, delta: number, text: string, visibility: Memory['visibility'] = 'private') {
    if (npc && !npc.player) remember(this.w, npc, delta, text, visibility, this.inst.id);
  }
  note(text: string, kind: JournalEntry['kind'] = 'fact', npc?: Id) { journal(this.w, { story: this.inst.id, title: storyTitle(this.w, this.inst), text, kind, npc }); }
  /** Chance of success shown to the player: clamps to 5–95%. */
  static odds(x: number) { return Math.max(0.05, Math.min(0.95, x)); }
  roll(p: number) { return chance(this.w, p); }
}

export const storyTitle = (w: World, inst: StoryInstance) => { const d = STORIES[inst.def]; try { return d ? d.title(new Ctx(w, inst)) : 'A story'; } catch { return d?.id ?? 'A story'; } };
export const storyIcon = (inst: StoryInstance) => STORIES[inst.def]?.icon ?? '📜';

// ---------- state ----------

export function newNarrative(): World['story'] {
  return {
    instances: {}, claims: {}, cooldowns: {}, journal: [], memories: {}, nextAmbient: 0,
    settings: { frequency: 'normal' },
    local: { familiarity: {}, discovered: {}, district: null, venue: null, region: null },
    appointments: [],
  };
}

export function journal(w: World, e: Omit<JournalEntry, 'id' | 't'>) {
  const j = w.story.journal;
  j.push({ ...e, id: nid(w), t: w.time });
  // Keep the record bounded; entries of stories still running are always kept.
  if (j.length > 400) {
    const running = new Set(Object.values(w.story.instances).filter((i) => isOpen(i)).map((i) => i.id));
    w.story.journal = j.filter((x, i) => i >= j.length - 300 || (x.story != null && running.has(x.story)) || x.kind === 'promise');
  }
}

/** Relationship change with a reason the person remembers. */
export function remember(w: World, npc: Citizen, delta: number, text: string, visibility: Memory['visibility'] = 'private', story?: Id, about: Id = w.playerId) {
  if (delta > 0 && w.citizens[about] && hasQuirk(w.citizens[about], 'charming')) delta = Math.round(delta * 1.25);
  if (delta) adjustRel(npc, about, delta);
  const list = (w.story.memories[npc.id] ??= []);
  list.push({ t: w.time, text, delta, visibility, story, about });
  // Up to ten memories per subject (the player now, their heir later).
  const mine = list.filter((m) => m.about === about);
  if (mine.length > 10) list.splice(list.indexOf(mine[0]), 1);
  if (list.length > 30) list.splice(0, list.length - 30);
  // Bounded overall: forget the people with the oldest memories first.
  const ids = Object.keys(w.story.memories);
  if (ids.length > 600) {
    const byAge = ids.map((id) => ({ id, t: w.story.memories[+id].at(-1)?.t ?? 0 })).sort((a, b) => a.t - b.t);
    for (const x of byAge.slice(0, ids.length - 500)) delete w.story.memories[+x.id];
  }
}
/** What someone remembers about a person (the player by default). */
export const memoriesOf = (w: World, id: Id, about: Id = w.playerId): Memory[] => (w.story.memories[id] ?? []).filter((m) => (m.about ?? w.playerId) === about);
/** Whom a story is about: its protagonist while alive, else the current player. */
export function protagonist(w: World, inst: StoryInstance): Citizen {
  const c = inst.who != null ? w.citizens[inst.who] : undefined;
  return c && !c.gone ? c : player(w);
}
/**
 * Reputation by association: what someone remembers about one's close family
 * (partner, parents, children), counted at a quarter. Heirs start with it.
 */
export function familyRegard(w: World, npcId: Id, c: Citizen): number {
  const f = c.family;
  if (!f) return 0;
  const kin = new Set<Id>([...(f.partner != null ? [f.partner] : []), ...f.parents, ...f.children]);
  return Math.round((w.story.memories[npcId] ?? []).filter((m) => m.about != null && kin.has(m.about)).reduce((t, m) => t + m.delta, 0) / 4);
}

export const isOpen = (i: StoryInstance) => i.status === 'offered' || i.status === 'active' || i.status === 'waiting';

// ---------- lifecycle ----------

/** Start a story for a source (once per source key). */
export function startStory(w: World, defId: string, b: Binding, opts: { msg?: Id; status?: 'offered' | 'active' } = {}): StoryInstance | null {
  const def = STORIES[defId];
  if (!def) return null;
  const claimKey = `${defId}|${b.key}`;
  if (w.story.claims[claimKey] != null) return null;
  w.story.claims[claimKey] = w.time;
  const inst: StoryInstance = {
    id: nid(w), def: defId, ver: def.version, bind: { ...b.bind }, data: { ...(b.data ?? {}) }, key: b.key,
    status: opts.status ?? 'offered', stage: def.start, stageAt: w.time, created: w.time, updated: w.time, decisions: [], msg: opts.msg, who: w.playerId,
  };
  w.story.instances[inst.id] = inst;
  enterStage(w, inst, def.start, true);
  return inst;
}

function enterStage(w: World, inst: StoryInstance, stageId: string, first = false) {
  const def = STORIES[inst.def];
  const st = def.stages[stageId];
  if (!st) { finish(w, inst, 'invalidated', `This part of the story is no longer available (${stageId}).`); return; }
  inst.stage = stageId;
  inst.stageAt = w.time;
  inst.updated = w.time;
  inst.deadline = st.expires ? w.time + st.expires : undefined;
  if (inst.status === 'waiting') inst.status = 'active';
  if (!first && inst.status === 'offered') inst.status = 'active';
  const c = new Ctx(w, inst);
  const lead = st.lead?.(c);
  if (lead) journal(w, { story: inst.id, title: storyTitle(w, inst), text: lead, kind: 'lead' });
  if (st.urgent) notify(w, 'encounter', `${def.icon} ${storyTitle(w, inst)}`, { link: 'journal' });
  else if (!first) notify(w, 'personal', `${def.icon} ${storyTitle(w, inst)}: ${lead ?? 'something new has happened.'}`, { link: 'journal' });
}

function finish(w: World, inst: StoryInstance, status: StoryInstance['status'], why: string, ending?: string) {
  inst.status = status;
  inst.ending = ending ?? why;
  inst.updated = w.time;
  inst.deadline = undefined;
  inst.waitUntil = undefined;
  // A choice already wrote "choice — outcome"; don't repeat the outcome on its own.
  const last = w.story.journal[w.story.journal.length - 1];
  if (!(last && last.story === inst.id && last.t === w.time && last.text.endsWith(why))) journal(w, { story: inst.id, title: storyTitle(w, inst), text: why, kind: 'outcome' });
}

function apply(w: World, inst: StoryInstance, o: Outcome) {
  if (o.decline) return finish(w, inst, 'declined', o.text);
  if (o.end) return finish(w, inst, 'completed', o.text, o.end);
  if (o.meet && o.next && MEET_HOOK.fn) {
    const at = MEET_HOOK.fn(w, inst, o.meet);
    if (at != null) {
      const who = w.citizens[inst.bind[o.meet.role] as number]?.name ?? 'them';
      inst.status = 'waiting';
      inst.stage = o.next;
      inst.waitUntil = at + 3 * HOUR; // goes on without you if you miss it
      inst.waitWhy = `Meeting ${who}: ${o.meet.what}`;
      inst.deadline = undefined;
      inst.updated = w.time;
      journal(w, { story: inst.id, title: storyTitle(w, inst), text: `You arranged to ${o.meet.what} with ${who}.`, kind: 'lead' });
      return;
    }
  }
  if (o.wait && o.next) {
    inst.status = 'waiting';
    inst.stage = o.next;
    inst.waitUntil = w.time + Math.max(10, Math.round(o.wait.minutes / 10) * 10);
    inst.waitWhy = o.wait.why;
    inst.deadline = undefined;
    inst.updated = w.time;
    journal(w, { story: inst.id, title: storyTitle(w, inst), text: `${o.wait.why}`, kind: 'lead' });
    return;
  }
  if (o.next) return enterStage(w, inst, o.next);
  finish(w, inst, 'completed', o.text, 'done');
}

/** The choices of a stage as the player sees them now (pure: no randomness, no changes). */
export function viewStage(w: World, inst: StoryInstance): { text: string; choices: Choice[]; stale: string | null } {
  const def = STORIES[inst.def];
  const st = def?.stages[inst.stage];
  if (!def || !st) return { text: 'This story can no longer continue.', choices: [], stale: 'Missing content.' };
  const c = new Ctx(w, inst);
  const stale = st.stale?.(c) ?? null;
  return { text: st.text(c), choices: st.choices(c), stale };
}

/** Make a choice. Validated now; runs once; the stage moves on so a repeat click fails. */
export function chooseStory(w: World, instId: Id, choiceId: string, stageId?: string): Result {
  const inst = w.story.instances[instId];
  if (!inst) return fail('That story is gone.');
  if (inst.status !== 'offered' && inst.status !== 'active') return fail(inst.status === 'waiting' ? `Not yet: ${inst.waitWhy ?? 'wait for the next development'}.` : 'This story is already settled.');
  if (stageId && stageId !== inst.stage) return fail('That decision has already been made.');
  const def = STORIES[inst.def];
  const st = def?.stages[inst.stage];
  if (!def || !st) { finish(w, inst, 'invalidated', 'The story could not continue.'); return fail('The story could not continue.'); }
  const c = new Ctx(w, inst);
  const stale = st.stale?.(c);
  if (stale) { settleStale(w, inst, stale); return fail(stale); }
  const region = st.region?.(c);
  if (region != null && player(w).loc !== region) return fail(`You need to be in ${w.regions[region].name} for this.`);
  const choice = st.choices(c).find((x) => x.id === choiceId);
  if (!choice) return fail('Choose one of the options.');
  if (choice.why) return fail(choice.why);
  const stage = inst.stage;
  const o = choice.run(c);
  if (o.fail) return fail(o.text);
  inst.decisions.push({ t: w.time, stage, choice: choice.id, label: choice.label, outcome: o.text });
  journal(w, { story: inst.id, title: storyTitle(w, inst), text: `${choice.label} — ${o.text}`, kind: 'outcome' });
  apply(w, inst, o);
  return ok(o.text);
}

function settleStale(w: World, inst: StoryInstance, why: string) {
  const st = STORIES[inst.def]?.stages[inst.stage];
  if (st?.onStale) apply(w, inst, st.onStale(new Ctx(w, inst), why));
  else finish(w, inst, 'invalidated', why);
}

// ---------- director ----------

const FREQ = { off: 0, rare: 0.45, normal: 1, frequent: 1.8 };

/** Hourly: deadlines, waiting stages, stale premises, world-driven stories and everyday situations. */
export function storyHourly(w: World) {
  const p = player(w);
  if (!p) return;
  for (const inst of Object.values(w.story.instances)) {
    if (!isOpen(inst)) continue;
    const def = STORIES[inst.def];
    if (!def) { finish(w, inst, 'invalidated', 'This story is no longer part of the game.'); continue; }
    const c = new Ctx(w, inst);
    if (inst.status === 'waiting') {
      if (w.time >= (inst.waitUntil ?? 0)) { inst.waitUntil = undefined; inst.waitWhy = undefined; enterStage(w, inst, inst.stage); }
      continue;
    }
    const st = def.stages[inst.stage];
    const stale = st?.stale?.(c);
    if (stale) { settleStale(w, inst, stale); continue; }
    if (inst.deadline != null && w.time >= inst.deadline) {
      if (st?.onExpire) { const o = st.onExpire(c); inst.decisions.push({ t: w.time, stage: inst.stage, choice: 'expired', label: 'You did not decide in time', outcome: o.text }); journal(w, { story: inst.id, title: storyTitle(w, inst), text: `You let it pass — ${o.text}`, kind: 'outcome' }); apply(w, inst, o); }
      else finish(w, inst, 'expired', 'The moment passed before you decided.');
    }
  }
  pruneInstances(w);
  // World-driven stories (bound to real events in the player's life).
  for (const def of Object.values(STORIES)) {
    if (!def.trigger) continue;
    if (w.story.settings.frequency === 'off' && def.kind === 'standalone') continue;
    const b = def.trigger(w, p);
    if (b) startStory(w, def.id, b, { status: 'active' });
  }
  ambient(w, p);
}

function ambient(w: World, p: Citizen) {
  const f = FREQ[w.story.settings.frequency];
  if (!f || p.sec.jailUntil > w.time || p.mining) return;
  if (!w.story.nextAmbient) { w.story.nextAmbient = w.time + randInt(w, 6, 18) * HOUR; return; }
  if (w.time < w.story.nextAmbient) return;
  const h = Math.floor((w.time % DAY) / HOUR);
  if (h < 8 || h > 22) return;
  // One everyday situation at a time.
  if (Object.values(w.story.instances).some((i) => i.status === 'offered' && STORIES[i.def]?.ambient)) return;
  w.story.nextAmbient = w.time + Math.round(randInt(w, 14, 34) / f) * HOUR;
  offerAmbient(w, p);
}

/**
 * Offer one everyday situation now (the director's pick, or an explorer's find).
 * Returns the new instance, or null if nothing fits or one is already waiting.
 */
export function offerAmbient(w: World, p: Citizen): StoryInstance | null {
  if (!FREQ[w.story.settings.frequency]) return null;
  if (Object.values(w.story.instances).some((i) => i.status === 'offered' && STORIES[i.def]?.ambient)) return null;
  let pool = Object.values(STORIES).filter((d) => d.ambient && d.bind && (w.story.cooldowns[d.id] ?? 0) <= w.time);
  for (let tries = 0; tries < 5 && pool.length; tries++) {
    const d = weighted(w, pool, (x) => x.ambient!.weight)!;
    pool = pool.filter((x) => x !== d);
    const b = d.bind!(w, p);
    if (!b) continue;
    const inst = startStory(w, d.id, b);
    if (inst) { w.story.cooldowns[d.id] = w.time + d.ambient!.cooldownDays * DAY; return inst; }
  }
  return null;
}

/** Keep finished stories for a while (the journal keeps their history). */
function pruneInstances(w: World) {
  const all = Object.values(w.story.instances);
  if (all.length < 250) return;
  const done = all.filter((i) => !isOpen(i)).sort((a, b) => a.updated - b.updated);
  for (const i of done.slice(0, all.length - 200)) delete w.story.instances[i.id];
}

/** Situations waiting for a decision right now (shown as a dialog), oldest first. */
export function urgentStories(w: World): StoryInstance[] {
  return Object.values(w.story.instances)
    .filter((i) => (i.status === 'offered' || i.status === 'active') && STORIES[i.def]?.stages[i.stage]?.urgent)
    .sort((a, b) => a.stageAt - b.stageAt || a.id - b.id);
}
export const openStories = (w: World) => Object.values(w.story.instances).filter(isOpen).sort((a, b) => b.updated - a.updated);

/** Present a specific story now, if it fits (tests and admin). */
export function triggerStory(w: World, defId: string): Result {
  const d = STORIES[defId];
  if (!d) return fail('Unknown story.');
  const b = (d.bind ?? d.trigger)?.(w, player(w));
  if (!b) return fail('That cannot happen right now.');
  const inst = startStory(w, defId, { ...b, key: `${b.key}|t${w.time}` });
  return inst ? ok(storyTitle(w, inst), { id: inst.id }) : fail('Already happened.');
}

export function setStoryFrequency(w: World, f: World['story']['settings']['frequency']): Result {
  if (!(f in FREQ)) return fail('Unknown setting.');
  w.story.settings.frequency = f;
  return ok(f === 'off' ? 'Everyday situations are off. Running stories and messages continue.' : `Everyday situations: ${f}.`);
}

// ---------- legacy inbox decisions ----------

/** Called when an inbox message is sent: stories that present that kind of decision adopt it. */
export function adoptMessage(w: World, m: Msg) {
  const kind = m.payload?.handler;
  if (!kind || !m.options?.length) return;
  for (const d of Object.values(STORIES)) {
    if (d.adopts !== kind) continue;
    const extra = d.adoptBind ? d.adoptBind(w, m) : {};
    if (extra === null) continue; // this story does not fit this message; try another
    startStory(w, d.id, { bind: { msg: m.id, ...numericPayload(m.payload!), ...extra }, key: `msg:${m.id}` }, { msg: m.id, status: 'active' });
    return;
  }
}
const numericPayload = (p: Record<string, any>) => Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'number')) as Record<string, number>;

/** Called after an inbox reply succeeded (from either screen): the story records it and moves on. */
export function onMessageAnswered(w: World, m: Msg, option: string, text: string) {
  const inst = Object.values(w.story.instances).find((i) => i.msg === m.id && isOpen(i));
  if (!inst) return;
  const def = STORIES[inst.def];
  const st = def.stages[inst.stage];
  const choice = st?.choices(new Ctx(w, inst)).find((c) => c.id === `reply:${option}`);
  // Answered in the inbox: run the same follow-up the story attaches to that reply (without replying twice).
  if (inst.data.replying) return; // answered from the story itself: chooseStory records it
  inst.data.replied = option;
  if (choice) {
    const o = choice.run(new Ctx(w, inst));
    if (o.fail) return;
    inst.decisions.push({ t: w.time, stage: inst.stage, choice: choice.id, label: choice.label, outcome: o.text });
    journal(w, { story: inst.id, title: storyTitle(w, inst), text: `${choice.label} — ${o.text}`, kind: 'outcome' });
    apply(w, inst, o);
  } else finish(w, inst, 'completed', text);
}
