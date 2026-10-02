// Small helpers for writing stories. Stage text and choices must be pure (no
// randomness, no changes): they are shown on screen and recomputed when a
// choice is made. Only bind() (in the director) and choice run() may roll dice
// or change the world.
import type { Citizen, Id, World } from '../../sim/types';
import type { Choice, Ctx, Outcome, StoryDef } from '../../sim/story';
import { DAY } from '../../engine/clock';
import { fmtAmt } from '../../engine/money';
import { controller, jailed } from '../../sim/query';
import { presentIn } from '../../sim/census';
import { respond } from '../../sim/inbox';

export const curOf = (w: World, rid: Id) => w.nations[controller(w.regions[rid])].cur;
export const cash = (w: World, c: Citizen, rid = c.loc) => c.wallet[curOf(w, rid)] ?? 0;
export const locals = (w: World, p: Citizen) => presentIn(w, p.loc).filter((c) => !c.player && !jailed(w, c));
export const myCompanies = (w: World, p: Citizen) => Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id);
export const money = (code: string, v: number) => fmtAmt(code, v);
export const first = (name: string) => name.split(' ')[0];
export const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A single-stage everyday situation: offered by the director, decided in one step. */
export function single(o: {
  id: string; icon: string; tags: string[]; weight: number; cooldownDays?: number;
  title: (c: Ctx) => string;
  bind: StoryDef['bind'];
  text: (c: Ctx) => string;
  choices: (c: Ctx) => Choice[];
  stale?: (c: Ctx) => string | null;
}): StoryDef {
  return {
    id: o.id, version: 1, icon: o.icon, kind: 'standalone', tags: o.tags, title: o.title,
    ambient: { weight: o.weight, cooldownDays: o.cooldownDays ?? 3 },
    bind: o.bind, start: 'main',
    stages: {
      main: {
        urgent: true, expires: DAY, text: o.text, choices: o.choices, stale: o.stale,
        onExpire: () => ({ text: 'The moment passed.', end: 'lapsed' }),
      },
    },
  };
}

export const done = (text: string, end = 'done'): Outcome => ({ text, end });
export const why = (cond: boolean, reason: string) => (cond ? null : reason);

/**
 * A choice that answers the linked inbox message through its normal handler
 * (the one canonical command). Answering in the inbox instead runs the same
 * follow-up without replying twice.
 */
export function reply(id: string, label: string, hint: string, follow: (c: Ctx, text: string) => Outcome, why_?: string | null): Choice {
  return {
    id: `reply:${id}`, label, hint, why: why_,
    run: (c) => {
      let text = '';
      if (c.inst.data.replied !== id) {
        c.inst.data.replying = 1;
        const r = respond(c.w, c.num('msg'), id);
        delete c.inst.data.replying;
        if (!r.ok) return { text: r.msg, fail: true };
        c.inst.data.replied = id;
        text = r.msg;
      }
      return follow(c, text);
    },
  };
}
/** The message a story presents (undefined once pruned from the inbox). */
export const linkedMsg = (c: Ctx) => c.w.inbox.find((m) => m.id === c.num('msg'));
