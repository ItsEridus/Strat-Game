// Replies to NPC correspondence. Each message kind registers a handler that
// turns the chosen response into real state changes (relationships, offices,
// contracts, unit orders…).
import type { Msg, World } from './types';
import { fail, ok, type Result } from '../engine/result';
import { bump } from './progress';

export const REPLY_HANDLERS: Record<string, (w: World, m: Msg, option: string) => Result> = {};
/** Called after a reply succeeded, whichever screen it came from (the story engine follows up). */
export const REPLY_LISTENERS: ((w: World, m: Msg, option: string, text: string) => void)[] = [];

export function respond(w: World, msgId: number, option: string): Result {
  const m = w.inbox.find((x) => x.id === msgId);
  if (!m) return fail('Message not found.');
  if (m.resolved) return fail('Already answered.');
  if (!m.options?.some((o) => o.id === option)) return fail('Invalid response.');
  const kind = m.payload?.handler as string | undefined;
  const h = kind ? REPLY_HANDLERS[kind] : undefined;
  const r = h ? h(w, m, option) : ok('Noted.');
  if (r.ok) { m.resolved = option; bump(w, 'reply'); for (const l of REPLY_LISTENERS) l(w, m, option, r.msg); }
  return r;
}
