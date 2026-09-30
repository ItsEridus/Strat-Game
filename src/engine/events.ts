// World event log (append-only history), player notifications and the
// scheduled-event queue.
import type { Id, Msg, ScheduledEvent, World, WorldEvent } from '../sim/types';

export const nid = (w: World) => w.nextId++;

/** Append to the permanent world history (used by the news feed and the Library). */
export function record(w: World, type: string, text: string, refs: Partial<WorldEvent> = {}) {
  const ev: WorldEvent = { t: w.time, type, text, ...refs };
  w.log.push(ev);
  if (w.log.length > 6000) w.log.splice(0, w.log.length - 6000);
  return ev;
}

/** Notification categories — the player can filter these and choose which pause time. */
export const NOTICE_CATS: Record<string, { label: string; pauseDefault: boolean }> = {
  economy: { label: 'Economy & jobs', pauseDefault: false },
  company: { label: 'My companies', pauseDefault: false },
  politics: { label: 'Politics & elections', pauseDefault: false },
  office: { label: 'My offices & votes', pauseDefault: true },
  war: { label: 'War & battles', pauseDefault: false },
  warHome: { label: 'Attacks on my nation', pauseDefault: true },
  personal: { label: 'Personal', pauseDefault: false },
  market: { label: 'Trades & auctions', pauseDefault: false },
  inbox: { label: 'Messages needing a reply', pauseDefault: true },
  encounter: { label: 'Situations needing a decision', pauseDefault: true },
  progress: { label: 'Rewards & progression', pauseDefault: false },
};

/** Tell the player something. If the category is set to pause, the clock stops. */
export function notify(w: World, cat: string, text: string, opts: { link?: string; critical?: boolean } = {}) {
  const critical = opts.critical ?? false;
  w.notices.unshift({ id: nid(w), t: w.time, text, cat, critical, link: opts.link });
  if (w.notices.length > 250) w.notices.length = 250;
  if (w.settings.pauseOn[cat] || critical) pauseRequest.flag = true;
}

/** Set by notify(); the time loop checks and clears it to stop advancement. */
export const pauseRequest = { flag: false };

/** Listeners for new inbox messages (the story engine adopts decisions it presents). */
export const MSG_HOOKS: ((w: World, m: Msg) => void)[] = [];

export function sendMsg(w: World, m: Omit<Msg, 'id' | 't'>) {
  const msg: Msg = { ...m, id: nid(w), t: w.time };
  w.inbox.unshift(msg);
  if (w.inbox.length > 200) w.inbox.length = 200;
  if (m.options?.length) notify(w, 'inbox', `✉️ ${m.subject}`, { link: 'inbox' });
  for (const h of MSG_HOOKS) h(w, msg);
  return msg;
}

// ---------- scheduled events ----------
export function schedule(w: World, at: number, type: string, p: Record<string, any> = {}) {
  const ev: ScheduledEvent = { at, seq: w.seq++, type, p };
  // keep sorted by (at, seq): binary insertion
  let lo = 0, hi = w.queue.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const q = w.queue[mid];
    if (q.at < at || (q.at === at && q.seq < ev.seq)) lo = mid + 1;
    else hi = mid;
  }
  w.queue.splice(lo, 0, ev);
  return ev;
}

export function unschedule(w: World, pred: (e: ScheduledEvent) => boolean) {
  w.queue = w.queue.filter((e) => !pred(e));
}

export const nextScheduled = (w: World, type?: string, pred?: (e: ScheduledEvent) => boolean) =>
  w.queue.find((e) => (!type || e.type === type) && (!pred || pred(e)));

export const cname = (w: World, id: Id | null | undefined) => (id != null && w.citizens[id] ? w.citizens[id].name : '—');
export const nname = (w: World, id: Id | null | undefined) => (id != null && w.nations[id] ? w.nations[id].name : id != null && id < 0 ? 'Pirates' : '—');
