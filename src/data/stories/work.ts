// Story chains about work and money: the wage dispute (from three sides), the
// price of a meal, and borrowed trust. Each binds real companies, strikes,
// market prices and people, and acts only through their existing rules.
import type { Citizen, Company, World } from '../../sim/types';
import type { Choice, Outcome, StoryDef } from '../../sim/story';
import { Ctx } from '../../sim/story';
import { moveItems, pay } from '../../engine/ledger';
import { c as cur } from '../../engine/money';
import { DAY, HOUR, dayOf } from '../../engine/clock';
import { record } from '../../engine/events';
import { controller, coref, cref, hhref, today } from '../../sim/query';
import { residents } from '../../sim/census';
import { adjustRel } from '../../sim/social';
import { setOffer } from '../../sim/company';
import { buyBest, listingsFor } from '../../sim/market';
import { activeCrises } from '../../sim/dynamics';
import { papersOwnedBy, publish } from '../../sim/press';
import { localNews } from '../../sim/life';
import { cash, curOf, done, first, locals, money, reply, why } from './kit';

// ---------- helpers ----------

const company = (c: Ctx): Company | undefined => c.w.companies[c.num('co')];
const staff = (c: Ctx) => (company(c)?.workers ?? []).map((id) => c.w.citizens[id]).filter((x): x is Citizen => !!x && !x.player);
const ownsIt = (c: Ctx) => { const co = company(c); return !!co && co.owner.k === 'cit' && co.owner.id === c.p.id; };
const strikeOn = (c: Ctx) => c.w.crises[c.num('crisis')]?.status === 'active';
const soldOff = (c: Ctx): string | null => (!company(c) ? 'The company no longer exists.' : !ownsIt(c) ? `${company(c)!.name} is no longer yours.` : null);
const soldEnding = (c: Ctx): Outcome => done(`${company(c)?.name ?? 'The company'} is no longer yours, and the dispute is its new owner's to settle.`, 'sold');
const nationalAvgWage = (w: World, nat: number) => {
  const offers = Object.values(w.companies).filter((co) => co.offer && controller(w.regions[co.region]) === nat);
  return offers.length ? offers.reduce((s, co) => s + co.offer!.wage, 0) / offers.length : 0;
};
const weekProfit = (co: Company) => co.hist.slice(-7).reduce((s, h) => s + h.profit, 0);
const everyone = (c: Ctx, d: number, text: string) => { for (const s of staff(c)) c.remember(s, d, text, 'witnessed'); };
const endStrike = (c: Ctx) => { const co = company(c)!; co.halt = undefined; const k = c.w.crises[c.num('crisis')]; if (k) k.end = c.w.time; };

// ---------- the wage dispute: owner ----------

const ownerSettle = (kind: 'meet' | 'split' | 'refuse', warm: number): Choice => reply(kind,
  kind === 'meet' ? 'Meet their demand in full' : kind === 'split' ? 'Split the difference' : 'Refuse',
  kind === 'meet' ? 'back to work tomorrow; every worker remembers it' : kind === 'split' ? 'one more day out, then back; mixed feelings' : 'the strike goes on',
  (c) => {
    if (kind === 'refuse') { everyone(c, 0, 'refused our strike demand'); return { text: 'The strike goes on. The picket line grows louder.', next: 'standoff', wait: { minutes: DAY, why: 'The strike continues. Check back tomorrow.' } }; }
    everyone(c, warm, kind === 'meet' ? 'met our strike demand in full' : 'agreed to split the difference in the strike');
    return { text: kind === 'meet' ? 'Deal: back to work tomorrow.' : 'A compromise: one more day out, then back to work.', next: 'aftermath', wait: { minutes: 2 * DAY, why: `The workers at ${company(c)?.name} are going back. See how it settles in two days.` } };
  });

const WAGE_OWNER: StoryDef = {
  id: 'chain.wage.owner', version: 1, icon: '✊', kind: 'chain', tags: ['economy'], adopts: 'strike',
  title: (c) => `The wage dispute at ${company(c)?.name ?? 'your company'}`,
  adoptBind: (w, m) => {
    const co = w.companies[m.payload!.co];
    if (!co) return null;
    const ws = co.workers.map((id) => w.citizens[id]).filter((x) => x && !x.player);
    const spokes = ws[0], hard = ws.slice(1).sort((a, b) => b.traits.risk - a.traits.risk)[0] ?? ws[0];
    return spokes ? { spokes: spokes.id, hard: hard.id } as Record<string, number> : {};
  },
  start: 'walkout',
  stages: {
    walkout: {
      urgent: true, expires: 2 * DAY,
      lead: (c) => `${staff(c).length} workers walked out of ${company(c)?.name}. Settle it, meet them, or let it drag on.`,
      stale: soldOff, onStale: soldEnding,
      text: (c) => {
        const co = company(c)!, code = curOf(c.w, co.region);
        return `${staff(c).length} workers have walked out of ${co.name}. They are paid ${money(code, co.offer?.wage ?? 0)} a shift against a national average of ${money(code, Math.round(nationalAvgWage(c.w, controller(c.w.regions[co.region]))))}, and they want ${money(code, c.num('demand'))}. ${c.cit('spokes')?.name ?? 'A worker'} speaks for them; ${c.cit('hard')?.name ?? 'another'} is the loudest voice on the picket line. Production has stopped.`;
      },
      choices: (c) => [
        { id: 'committee', label: 'Meet the strike committee in person', hint: 'hear them out before you decide', run: () => ({ text: 'You agree to meet them this afternoon.', next: 'committee' }) },
        ownerSettle('meet', 10), ownerSettle('split', 3), ownerSettle('refuse', 0),
      ],
      onExpire: (c) => { everyone(c, -5, 'ignored our strike for two days'); return { text: 'You said nothing for two days. The strike hardens.', next: 'standoff' }; },
    },
    committee: {
      urgent: true, expires: DAY,
      stale: soldOff, onStale: soldEnding,
      text: (c) => {
        const co = company(c)!, code = curOf(c.w, co.region);
        const s = c.cit('spokes'), h = c.cit('hard');
        const bread = listingsFor(c.w, controller(c.w.regions[co.region]), 'food:1')[0]?.price;
        const profit = weekProfit(co);
        return `In the canteen, ${s?.name ?? 'the spokesperson'} does the talking: “I've worked here since day ${dayOf(s?.jobSince ?? co.founded)}. We're not asking to get rich.${bread ? ` Bread is ${money(code, bread)} now.` : ''}” ${h && h !== s ? `${h.name} cuts in: ` : ''}“${profit > 0 ? `This place made ${money(code, profit)} last week. We saw none of it.` : 'Times are hard for everyone — so share it fairly.'}”`;
      },
      choices: (c) => {
        const avgRel = staff(c).reduce((t, x) => t + (x.rel[c.p.id] ?? 0), 0) / Math.max(1, staff(c).length);
        const odds = Ctx.odds(0.35 + c.p.attrs.lead * 0.03 + avgRel / 200);
        return [
          { id: 'books', label: 'Open the books and explain the numbers', hint: 'if they believe you, they accept a compromise and respect you for it', chance: odds, run: (c) => {
            if (!c.roll(odds)) { c.remember(c.cit('hard'), -8, 'lectured us about the books instead of paying', 'witnessed'); return { text: `${c.cit('hard')?.name ?? 'The hardliner'} is not impressed: “Numbers can say anything.” The room goes cold.`, next: 'lastword' }; }
            const r = ownerSettle('split', 8).run(c);
            if (r.fail) return r;
            everyone(c, 4, 'opened the company books to us during the strike');
            return { ...r, text: `They read the figures in silence, then shake your hand on a compromise. ${r.text}` };
          } },
          ownerSettle('meet', 14), ownerSettle('split', 5), ownerSettle('refuse', 0),
        ];
      },
      onExpire: () => ({ text: 'The meeting broke up without an answer.', next: 'standoff' }),
    },
    lastword: {
      urgent: true, expires: DAY, stale: soldOff, onStale: soldEnding,
      text: () => 'The committee waits for your answer.',
      choices: () => [ownerSettle('meet', 8), ownerSettle('split', 2), ownerSettle('refuse', 0)],
      onExpire: () => ({ text: 'No answer came.', next: 'standoff' }),
    },
    standoff: {
      expires: 2 * DAY, stale: soldOff, onStale: soldEnding,
      lead: (c) => `The strike at ${company(c)?.name} drags on. Give in, or wait them out.`,
      text: (c) => `The picket line outside ${company(c)!.name} is a fixture now. ${c.cit('hard')?.name ?? 'The organisers'} hand leaflets to passers-by, and the local paper has started asking questions. Every idle day costs you production.`,
      choices: (c) => {
        const co = company(c)!;
        return [
          { id: 'givein', label: `Give in: pay ${money(curOf(c.w, co.region), c.num('demand'))} a shift`, hint: 'the strike ends today; workers respect it, grudgingly', run: (c) => {
            const co = company(c)!;
            const r = setOffer(c.w, c.p.id, co.id, Math.max(c.num('demand'), co.offer?.wage ?? 0), co.offer?.slots ?? co.workers.length, co.offer?.minEco ?? 0);
            if (!r.ok) return { text: r.msg, fail: true };
            endStrike(c);
            everyone(c, 5, 'gave in to our strike in the end');
            c.set('replied', 'meet');
            return { text: 'You sign. The picket packs up.', next: 'aftermath', wait: { minutes: DAY, why: 'The workers are coming back. See how it settles.' } };
          } },
          { id: 'wait', label: 'Wait them out', hint: 'some will give up and quit; the rest will never forget', run: (c) => {
            const co = company(c)!;
            let quit = 0;
            for (const s of staff(c)) if ((s.rel[c.p.id] ?? 0) < -5 && c.roll(0.5)) { co.workers = co.workers.filter((x) => x !== s.id); s.job = null; quit++; c.remember(s, -15, `starved out the strike at ${co.name}`, 'public'); }
            everyone(c, -5, `broke the strike at ${co.name}`);
            localNews(c.w, co.region, `✊ The strike at ${co.name} collapsed; ${quit} workers walked away for good.`);
            record(c.w, 'labour', `✊ The strike at ${co.name} collapsed after ${c.p.name} refused to negotiate.`, { region: co.region, cit: c.p.id, player: true });
            return done(`The strike collapses. ${quit} workers quit for good; the rest come back bitter.`, 'broken');
          } },
        ];
      },
      onExpire: (c) => done(`The strike at ${company(c)?.name} fizzled out on its own. Nobody won.`, 'fizzled'),
    },
    aftermath: {
      stale: soldOff, onStale: soldEnding,
      lead: (c) => `Work has resumed at ${company(c)?.name}. Decide how to close the chapter.`,
      text: (c) => {
        const s = c.cit('spokes');
        return c.str('replied') === 'meet'
          ? `The machines are running again at ${company(c)!.name}. ${s?.name ?? 'The spokesperson'} stops by your office: “People won't forget this. Thank you.”`
          : `Work has resumed at ${company(c)!.name}, but not everyone is happy. ${c.cit('hard')?.name ?? 'Someone'} was heard saying: “We'll see if this lasts.”`;
      },
      choices: (c) => {
        const co = company(c)!, code = curOf(c.w, co.region), lunch = Math.round((co.offer?.wage ?? cur(8)) * 0.5) * staff(c).length;
        const out: Choice[] = [
          { id: 'lunch', label: `Buy the whole staff lunch (${money(code, lunch)})`, hint: 'a gesture: +relationship with everyone', why: why((c.p.wallet[code] ?? 0) >= lunch, 'Not enough money.'), run: (c) => { pay(c.w, cref(c.p.id), hhref(controller(c.w.regions[co.region])), code, lunch, 'Staff lunch'); everyone(c, 6, 'bought the whole staff lunch after the strike'); return done('A long, loud lunch. The mood at work is the best it has been.', 'reconciled'); } },
        ];
        if (c.str('replied') === 'split') out.push({ id: 'promise', label: 'Promise to review pay in three weeks', hint: 'goodwill now; they will hold you to it', run: (c) => { everyone(c, 3, 'promised to review our pay in three weeks'); c.note(`You promised the workers at ${co.name} a pay review by day ${today(c.w) + 21}.`, 'promise'); return { text: 'They take you at your word.', next: 'review', wait: { minutes: 21 * DAY, why: `Pay review promised at ${co.name} (day ${today(c.w) + 21}).` } }; } });
        out.push({ id: 'move', label: 'Get back to business', hint: 'no change', run: () => done('The dispute is behind you.', c.str('replied') === 'meet' ? 'settled' : 'compromise') });
        return out;
      },
    },
    review: {
      urgent: true, expires: 3 * DAY, stale: soldOff, onStale: soldEnding,
      text: (c) => { const co = company(c)!, code = curOf(c.w, co.region); return `Three weeks ago you promised a pay review. ${c.cit('spokes')?.name ?? 'The staff'} is at your door. Wages at ${co.name} are ${money(code, co.offer?.wage ?? 0)}; the national average is now ${money(code, Math.round(nationalAvgWage(c.w, controller(c.w.regions[co.region]))))}.`; },
      choices: (c) => [
        { id: 'honor', label: 'Keep your word: +5% for everyone', hint: 'loyalty that lasts', run: (c) => { const co = company(c)!; const r = setOffer(c.w, c.p.id, co.id, Math.round((co.offer?.wage ?? 0) * 1.05), co.offer?.slots ?? 1, co.offer?.minEco ?? 0); if (!r.ok) return { text: r.msg, fail: true }; everyone(c, 10, 'kept their promise and raised our pay'); return done('A promise kept. Your workers will stand by you.', 'kept'); } },
        { id: 'break', label: 'Tell them the business can’t afford it', hint: 'they remember broken promises', run: (c) => { everyone(c, -12, 'broke their promise of a pay review'); return done('They leave without a word. Trust will be hard to rebuild.', 'broken-promise'); } },
      ],
      onExpire: (c) => { everyone(c, -12, 'forgot the pay review they promised'); return done('You let the date pass. They noticed.', 'forgotten'); },
    },
  },
};

// ---------- the wage dispute: a striking worker ----------

const WAGE_WORKER: StoryDef = {
  id: 'chain.wage.worker', version: 1, icon: '✊', kind: 'chain', tags: ['economy'],
  title: (c) => `Strike at ${company(c)?.name ?? 'work'}`,
  trigger: (w, p) => {
    if (p.job == null) return null;
    const co = w.companies[p.job];
    const k = co && activeCrises(w).find((x) => x.kind === 'strike' && x.company === co.id);
    if (!co || !k || (co.owner.k === 'cit' && co.owner.id === p.id)) return null;
    const mates = co.workers.map((id) => w.citizens[id]).filter((x) => x && !x.player);
    return mates.length ? { bind: { co: co.id, crisis: k.id, spokes: mates[0].id, owner: co.owner.k === 'cit' ? co.owner.id : -1 }, key: `strike:${k.id}`, data: { wage0: co.offer?.wage ?? 0 } } : null;
  },
  start: 'picket',
  stages: {
    picket: {
      urgent: true, expires: DAY,
      stale: (c) => (c.p.job !== c.num('co') ? 'You no longer work there.' : null),
      onStale: () => done('You have moved on from that job.', 'moved-on'),
      text: (c) => `Your coworkers at ${company(c)!.name} have walked out over pay. ${c.cit('spokes')?.name ?? 'A colleague'} catches you at the gate: “We need everyone. Are you with us?”`,
      choices: (c) => {
        const owner = c.cit('owner');
        const odds = Ctx.odds(0.25 + c.p.attrs.lead * 0.03 + c.p.influence / 200 + (owner ? (owner.rel[c.p.id] ?? 0) / 200 : 0));
        return [
          { id: 'join', label: 'Join the picket line', hint: 'solidarity; the owner will know', run: (c) => { everyone(c, 5, 'stood with us on the picket line'); c.remember(owner, -6, 'joined the strike against me'); return { text: 'You take a placard. The line cheers.', next: 'back', wait: { minutes: 12 * HOUR, why: 'On the picket line. See how it ends.' } }; } },
          { id: 'mediate', label: owner ? `Go to ${owner.name} and try to broker a deal` : 'Try to broker a deal', hint: 'if it works the strike ends in a compromise', chance: odds, why: why(!!owner && !owner.player, 'There is no owner to talk to.'), run: (c) => {
            const co = company(c)!;
            if (!c.roll(odds)) { c.remember(owner, -3, 'meddled in the strike'); return { text: `${owner!.name} hears you out, then shows you the door.`, next: 'back', wait: { minutes: 12 * HOUR, why: 'The strike goes on.' } }; }
            const demand = Math.ceil(nationalAvgWage(c.w, controller(c.w.regions[co.region])) * 0.95);
            setOffer(c.w, owner!.id, co.id, Math.round(((co.offer?.wage ?? 0) + demand) / 2), co.offer?.slots ?? co.workers.length, co.offer?.minEco ?? 0);
            endStrike(c);
            everyone(c, 10, 'brokered the deal that ended our strike');
            c.remember(owner, 6, 'found a way to end the strike');
            localNews(c.w, co.region, `🤝 ${c.p.name} brokered an end to the strike at ${co.name}.`);
            c.p.influence += 1.5;
            return { text: `After an hour of back and forth, ${owner!.name} agrees to a compromise. The strike is over.`, next: 'back', wait: { minutes: 2 * HOUR, why: 'Back to work soon.' } };
          } },
          { id: 'home', label: 'Stay home until it blows over', hint: 'no side taken', run: () => ({ text: 'You keep your head down.', next: 'back', wait: { minutes: DAY, why: 'Waiting for the strike to end.' } }) },
        ];
      },
      onExpire: () => ({ text: 'You never answered.', next: 'back', wait: { minutes: DAY, why: 'Waiting for the strike to end.' } }),
    },
    back: {
      text: (c) => {
        const co = company(c);
        if (!co) return 'The company has closed.';
        const code = curOf(c.w, co.region), now = co.offer?.wage ?? 0, before = c.num('wage0');
        return strikeOn(c) ? `The strike at ${co.name} is still on.` : now > before ? `It's over: wages at ${co.name} went from ${money(code, before)} to ${money(code, now)} a shift.` : `It's over, and nothing changed: still ${money(code, now)} a shift.`;
      },
      lead: (c) => (strikeOn(c) ? `The strike at ${company(c)?.name} continues.` : `The strike at ${company(c)?.name} has ended.`),
      choices: (c) => (strikeOn(c)
        ? [{ id: 'wait', label: 'Keep waiting', hint: '', run: () => ({ text: 'The strike continues.', next: 'back', wait: { minutes: DAY, why: 'The strike continues.' } }) }]
        : [{ id: 'ok', label: 'Back to work', hint: '', run: (c) => done((company(c)?.offer?.wage ?? 0) > c.num('wage0') ? 'A better wage, won together.' : 'Back to the old routine.', 'over') }]),
    },
  },
};

// ---------- the wage dispute: an outsider (journalist or politician) ----------

const WAGE_OBSERVER: StoryDef = {
  id: 'chain.wage.observer', version: 1, icon: '📰', kind: 'chain', tags: ['economy', 'press', 'politics'],
  title: (c) => `The strike at ${company(c)?.name ?? 'a local company'}`,
  trigger: (w, p) => {
    const k = activeCrises(w).find((x) => x.kind === 'strike' && x.company != null && x.regions.includes(p.loc));
    const co = k && w.companies[k.company!];
    if (!k || !co || co.workers.length < 4 || p.job === co.id || (co.owner.k === 'cit' && co.owner.id === p.id)) return null;
    if (!papersOwnedBy(w, p.id).length && p.influence < 15) return null;
    return { bind: { co: co.id, crisis: k.id, spokes: co.workers[0], owner: co.owner.k === 'cit' ? co.owner.id : -1 }, key: `strikeobs:${k.id}` };
  },
  start: 'picket',
  stages: {
    picket: {
      stale: (c) => (strikeOn(c) ? null : 'The strike is over.'), onStale: () => done('By the time you looked into it, the strike was over.', 'missed'),
      lead: (c) => `Workers at ${company(c)?.name} are on strike in ${c.w.regions[company(c)?.region ?? c.p.loc].name}.`,
      text: (c) => `Outside ${company(c)!.name} a picket line of ${company(c)!.workers.length} workers stamps their feet against the cold. It's a story — and a cause, depending on who you are.`,
      choices: (c) => [
        { id: 'interview', label: 'Talk to the strikers (−10⚡)', hint: 'hear their side; material for a story', why: why(c.p.energy >= 10, 'Too tired.'), run: (c) => { c.p.energy -= 10; everyone(c, 3, 'listened to us on the picket line'); c.set('heard', 1); return { text: `${c.cit('spokes')?.name ?? 'A striker'} gives you chapter and verse.`, next: 'write' }; } },
        { id: 'speak', label: 'Speak in support at the picket', hint: '+influence, +strikers; the owner will not like it', why: why(c.p.influence >= 10, 'Nobody knows you well enough yet (influence 10+).'), run: (c) => { c.p.influence += 1.5; everyone(c, 6, 'spoke up for us at the picket line'); c.remember(c.cit('owner'), -8, 'took the strikers’ side in public', 'public'); return done('The strikers cheer. You made friends and an enemy.', 'spoke'); } },
        { id: 'leave', label: 'Not your fight', hint: '', run: () => ({ text: 'You walk on.', decline: true }) },
      ],
    },
    write: {
      lead: (c) => `You have the strikers' story from ${company(c)?.name}.`,
      text: (c) => `You have notes, names and numbers from the strike at ${company(c)?.name ?? 'the company'}.`,
      choices: (c) => {
        const paper = papersOwnedBy(c.w, c.p.id)[0];
        return [
          { id: 'publish', label: paper ? `Publish it in ${paper.name}` : 'Publish it', hint: 'a market report with real readers; it shapes opinion', why: why(!!paper, 'You need your own newspaper (Newspapers screen).'), run: (c) => { const r = publish(c.w, c.p, paper!.id, 'economy', 'report', `Inside the strike at ${company(c)?.name ?? 'the factory'}`, `The workers say they are paid below the national average.`); if (!r.ok) return { text: r.msg, fail: true }; c.remember(c.cit('spokes'), 6, 'told our story in the paper', 'public'); return done(r.msg, 'published'); } },
          { id: 'drop', label: 'Let it go', hint: '', run: () => done('The notes stay in your drawer.', 'dropped') },
        ];
      },
    },
  },
};

// ---------- the price of a meal ----------

function foodTrend(w: World, nat: number) {
  const hist = w.trades[`${nat}|food:1`] ?? [];
  const recent = hist.slice(-10, -1);
  const avg = recent.length ? recent.reduce((s, x) => s + x.value / Math.max(1, x.qty), 0) / recent.length : 0;
  const now = listingsFor(w, nat, 'food:1')[0]?.price ?? w.lastPrice[`${nat}|food:1`] ?? 0;
  return { avg, now };
}

function causes(w: World, nat: number): string[] {
  const out: string[] = [];
  const food = Object.values(w.companies).filter((co) => co.industry === 'food' && controller(w.regions[co.region]) === nat);
  const halted = food.filter((co) => co.halt && co.halt.until > w.time);
  if (halted.length) out.push(`${halted.length} of ${food.length} food producers are shut (${halted.slice(0, 2).map((co) => `${co.name}: ${co.halt!.why.toLowerCase()}`).join('; ')})`);
  const noGrain = food.filter((co) => (co.inv.grain ?? 0) < 4).length;
  if (noGrain > food.length / 3) out.push(`${noGrain} bakeries and food plants are short of grain`);
  const g = foodGrain(w, nat);
  if (g.now > g.avg * 1.2 && g.avg) out.push(`grain costs ${Math.round((g.now / g.avg - 1) * 100)}% more than last week`);
  const cr = activeCrises(w).filter((k) => k.nation === nat && ['drought', 'flood', 'hurricane', 'blizzard', 'wildfire', 'epidemic'].includes(k.kind));
  if (cr.length) out.push(`the ${cr[0].name} is disrupting farms and deliveries`);
  if (w.econ.phase === 'boom') out.push('a booming economy has everyone buying more');
  return out.length ? out : ['demand simply outran what the farms and bakeries produced this week'];
}
const foodGrain = (w: World, nat: number) => { const h = w.trades[`${nat}|grain`] ?? []; const r = h.slice(-10, -1); return { avg: r.length ? r.reduce((s, x) => s + x.value / Math.max(1, x.qty), 0) / r.length : 0, now: w.lastPrice[`${nat}|grain`] ?? 0 }; };

const MEAL: StoryDef = {
  id: 'chain.meal', version: 1, icon: '🍞', kind: 'chain', tags: ['economy', 'social'],
  title: () => 'The price of a meal',
  trigger: (w, p) => {
    if (w.story.settings.frequency === 'off') return null;
    const nat = controller(w.regions[p.loc]);
    const t = foodTrend(w, nat);
    if (!t.avg || t.now < t.avg * 1.35) return null;
    // The least well-off person around feels it first.
    const contact = locals(w, p).filter((c) => c.nation === nat).sort((a, b) => cash(w, a) - cash(w, b) || a.id - b.id)[0];
    return contact ? { bind: { contact: contact.id, nat }, key: `meal:${nat}:${Math.floor(today(w) / 14)}`, data: { was: Math.round(t.avg), now: t.now } } : null;
  },
  start: 'shelf',
  stages: {
    shelf: {
      expires: 3 * DAY,
      stale: (c) => (c.cit('contact') ? null : 'They have gone.'),
      lead: (c) => `${c.cit('contact')?.name} is struggling with food prices (bread ${money(c.w.nations[c.num('nat')].cur, c.num('now'))}, was ${money(c.w.nations[c.num('nat')].cur, c.num('was'))}).`,
      text: (c) => { const code = c.w.nations[c.num('nat')].cur; return `At the market, ${c.cit('contact')!.name} puts a loaf back on the shelf. “${money(code, c.num('now'))}! It was ${money(code, c.num('was'))} last week. I have ${money(code, cash(c.w, c.cit('contact')!))} to last me until payday.”`; },
      choices: (c) => {
        const nat = c.num('nat'), code = c.w.nations[nat].cur, contact = c.cit('contact')!;
        const ls = listingsFor(c.w, nat, 'food:1');
        const stock = ls.reduce((s, l) => s + l.qty, 0);
        const quote = ls.slice(0, 3).reduce((s, l) => s + l.price * Math.min(3, l.qty), 0);
        const est = ls[0] ? ls[0].price * 3 : 0;
        return [
          { id: 'buy', label: `Buy them three days of food (about ${money(code, est)})`, hint: 'bought on the real market and given to them', why: controller(c.w.regions[c.p.loc]) !== nat ? 'You need to be in the country to shop there.' : stock < 3 ? 'There is not enough food on sale.' : why((c.p.wallet[code] ?? 0) >= Math.max(est, quote / 3), 'Not enough money.'), run: (c) => {
            const before = c.p.inv['food:1'] ?? 0;
            const r = buyBest(c.w, c.p.id, cref(c.p.id), nat, 'food:1', 3, Math.round((ls[0]?.price ?? 0) * 1.5));
            const got = (c.p.inv['food:1'] ?? 0) - before;
            if (!r.ok || got <= 0) return { text: r.msg || 'You could not buy any food.', fail: true };
            moveItems(c.w, cref(c.p.id), cref(contact.id), 'food:1', got);
            c.remember(contact, 12, 'bought me groceries when bread got too dear', 'witnessed');
            return { text: `You buy ${got} meals and hand them over. ${first(contact.name)} is speechless.`, next: 'why' };
          } },
          { id: 'ask', label: 'Find out why prices are up', hint: 'the real reasons, from the market data and the news', run: () => ({ text: 'You start asking around.', next: 'why' }) },
          { id: 'no', label: '“Tough times for everyone.”', hint: '', run: (c) => { c.remember(contact, -2, 'shrugged when I could not afford bread'); return { text: 'You move on.', decline: true }; } },
        ];
      },
      onExpire: () => done('You never got round to it.', 'lapsed'),
    },
    why: {
      lead: (c) => `Why food is dear: ${causes(c.w, c.num('nat'))[0]}.`,
      text: (c) => `Traders, bakers and a few phone calls later, the picture is clear: ${causes(c.w, c.num('nat')).join('; ')}.`,
      choices: (c) => {
        const food = Object.values(c.w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === c.p.id && co.industry === 'food' && Object.keys(co.inv).some((k) => k.startsWith('food:') && co.inv[k] >= 10));
        return [
          { id: 'kitchen', label: 'Volunteer at the community kitchen (−20⚡)', hint: '+relationship with locals', why: why(c.p.energy >= 20, 'Too tired.'), run: (c) => { c.p.energy -= 20; for (const x of locals(c.w, c.p).slice(0, 12)) adjustRel(x, c.p.id, 2); c.remember(c.cit('contact'), 5, 'served meals at the community kitchen'); localNews(c.w, c.p.loc, `🥣 ${c.p.name} volunteered at the community kitchen.`); return { text: 'You serve two hundred bowls of soup. It helps, a little.', next: 'week', wait: { minutes: 5 * DAY, why: 'See whether prices come down this week.' } }; } },
          { id: 'donate', label: food.length ? `Give 10 meals from ${food[0].name}'s stock to local families` : 'Donate from your company’s stock', hint: 'real food from your warehouse', why: why(food.length > 0, 'You own no food business with stock to spare.'), run: (c) => {
            const co = food[0];
            const key = Object.keys(co.inv).find((k) => k.startsWith('food:') && co.inv[k] >= 10)!;
            const fams = residents(c.w, c.p.loc).filter((x) => !x.player).slice(0, 5);
            if (!fams.length) return { text: 'There is nobody here to give it to.', fail: true };
            let given = 0;
            fams.forEach((x, i) => { const n = i < 10 % fams.length ? Math.ceil(10 / fams.length) : Math.floor(10 / fams.length); if (n && moveItems(c.w, coref(co.id), cref(x.id), key, n)) { given += n; c.remember(x, 6, `gave my family food from ${co.name}`, 'public'); } });
            localNews(c.w, c.p.loc, `🍞 ${co.name} gave ${given} meals to local families.`);
            return { text: `${given} meals go out to ${fams.length} families.`, next: 'week', wait: { minutes: 5 * DAY, why: 'See whether prices come down this week.' } };
          } },
          { id: 'watch', label: 'Keep an eye on it', hint: '', run: () => ({ text: 'You make a note to check prices again.', next: 'week', wait: { minutes: 5 * DAY, why: 'Checking food prices again in five days.' } }) },
        ];
      },
    },
    week: {
      lead: () => 'Time to see whether food prices eased.',
      text: (c) => { const code = c.w.nations[c.num('nat')].cur; const now = foodTrend(c.w, c.num('nat')).now; return now && now < c.num('now') * 0.9 ? `Bread is back down to ${money(code, now)}. ${c.cit('contact')?.name ?? 'Your neighbour'} is relieved.` : `Bread still costs ${money(code, now || c.num('now'))}. ${c.cit('contact')?.name ?? 'Your neighbour'} is getting by, just.`; },
      choices: () => [{ id: 'ok', label: 'Good to know', hint: '', run: (c) => done(foodTrend(c.w, c.num('nat')).now < c.num('now') * 0.9 ? 'Prices eased.' : 'Prices stayed high.', 'checked') }],
    },
  },
};

// ---------- borrowed trust ----------

const lender = (c: Ctx) => c.cit('from');
const owed = (c: Ctx) => c.p.flags[`loan_${c.num('from')}`] ?? 0;
const dueAt = (c: Ctx) => c.p.flags[`loanDue_${c.num('from')}`] ?? 0;
const loanCode = (c: Ctx) => c.w.nations[c.p.nation].cur;

const LOAN: StoryDef = {
  id: 'chain.loan', version: 1, icon: '🤝', kind: 'chain', tags: ['social', 'economy'], adopts: 'loanOffer',
  title: (c) => `A loan from ${lender(c)?.name ?? 'a friend'}`,
  start: 'offer',
  stages: {
    offer: {
      urgent: true, expires: 2 * DAY,
      stale: (c) => (lender(c) ? null : 'They are gone.'),
      text: (c) => { const f = lender(c)!, code = loanCode(c), a = c.num('amount'); return `${f.name} has noticed things are tight for you and offers ${money(code, a)}, to be repaid as ${money(code, Math.round(a * 1.1))} within ten days.${c.num('asked') ? ` (You know they have ${money(code, cash(c.w, f))} of their own${cash(c.w, f) < a * 3 ? ' — this would stretch them' : ''}.)` : ''}`; },
      choices: (c) => [
        ...(c.num('asked') ? [] : [{ id: 'ask', label: '“Can you really spare it?”', hint: 'find out what it costs them', run: (c: Ctx) => { c.set('asked', 1); c.remember(lender(c), 2, 'asked whether I could really afford the loan'); return { text: `${first(lender(c)!.name)} tells you honestly.`, next: 'offer' }; } }]),
        reply('accept', 'Accept the loan', 'money now; repay in ten days (automatic on the due date)', (c) => { const due = dueAt(c) || c.w.time + 10 * DAY; return { text: `The money is yours. It's due on day ${dayOf(due)}.`, next: 'due', wait: { minutes: Math.max(10, due - 2 * DAY - c.w.time), why: `${money(loanCode(c), owed(c))} due to ${lender(c)?.name} on day ${dayOf(due)}.` } }; }),
        reply('decline', 'Thank them, but decline', 'no debt', (c) => { c.remember(lender(c), 1, 'turned down my loan politely'); return done('They respect it.', 'declined'); }),
      ],
      onExpire: () => done('The offer lapsed.', 'lapsed'),
    },
    due: {
      stale: (c) => (!lender(c) ? 'Your lender is gone.' : null),
      lead: (c) => `${money(loanCode(c), owed(c))} is due to ${lender(c)?.name} on day ${dayOf(dueAt(c))}.`,
      text: (c) => `${lender(c)!.name} mentions, lightly, that the loan is due on day ${dayOf(dueAt(c))}: ${money(loanCode(c), owed(c))}. You have ${money(loanCode(c), c.p.wallet[loanCode(c)] ?? 0)}.`,
      choices: (c) => {
        const f = lender(c)!, amt = owed(c), code = loanCode(c);
        const odds = Ctx.odds(0.3 + (f.rel[c.p.id] ?? 0) / 150);
        const out: Choice[] = [];
        if (!amt) out.push({ id: 'settled', label: 'It is already settled', hint: '', run: () => ({ text: 'Nothing owed.', next: 'settle' }) });
        else {
          out.push({ id: 'early', label: `Repay now (${money(code, amt)})`, hint: 'early, in full: trust grows', why: why((c.p.wallet[code] ?? 0) >= amt, 'Not enough money yet.'), run: (c) => {
            if (!pay(c.w, cref(c.p.id), cref(f.id), code, amt, `Loan repaid to ${f.name}`)) return { text: 'The payment failed.', fail: true };
            delete c.p.flags[`loan_${f.id}`]; delete c.p.flags[`loanDue_${f.id}`]; c.p.flags[`loanResult_${f.id}`] = 1;
            c.remember(f, 8, 'repaid my loan early, in full');
            return done(`${f.name} is impressed: “Any time you need it.”`, 'honoured-early');
          } });
          if (!c.num('extended')) out.push({ id: 'extend', label: 'Ask for five more days', hint: 'they may agree; it costs a little trust either way', chance: odds, run: (c) => {
            c.set('extended', 1);
            if (!c.roll(odds)) { c.remember(f, -4, 'asked for more time on the loan'); return { text: `${first(f.name)} winces: “I need it on time.”`, next: 'due' }; }
            c.p.flags[`loanDue_${f.id}`] = dueAt(c) + 5 * DAY;
            c.remember(f, -2, 'needed five more days to repay');
            return { text: `“Fine. Five more days.” New due date: day ${dayOf(dueAt(c))}.`, next: 'due', wait: { minutes: Math.max(10, dueAt(c) - DAY - c.w.time), why: `Loan now due on day ${dayOf(dueAt(c))}.` } };
          } });
          out.push({ id: 'fine', label: 'It will be paid on the day', hint: 'repaid automatically if you have the money', run: (c) => ({ text: 'You make a note.', next: 'settle', wait: { minutes: Math.max(10, dueAt(c) + HOUR * 2 - c.w.time), why: `Repayment due on day ${dayOf(dueAt(c))}.` } }) });
        }
        return out;
      },
    },
    settle: {
      stale: (c) => (!lender(c) ? 'Your lender is gone.' : null),
      text: (c) => { const r = c.p.flags[`loanResult_${c.num('from')}`] ?? 0; return r > 0 ? `The loan is repaid. ${lender(c)!.name} says you are welcome to ask again.` : r < 0 ? `The repayment bounced: you didn't have ${money(loanCode(c), -r)}. ${lender(c)!.name} is hurt and angry.` : 'The loan is still outstanding.'; },
      lead: (c) => ((c.p.flags[`loanResult_${c.num('from')}`] ?? 0) < 0 ? `You defaulted on ${lender(c)?.name}'s loan. You can still make it right.` : `${lender(c)?.name}'s loan.`),
      choices: (c) => {
        const r = c.p.flags[`loanResult_${c.num('from')}`] ?? 0, f = lender(c)!, code = loanCode(c);
        if (r > 0) return [{ id: 'ok', label: 'Good', hint: '', run: () => done('Debt honoured.', 'honoured') }];
        if (r === 0) return [{ id: 'wait', label: 'Wait for the due date', hint: '', run: (c) => ({ text: 'Still waiting.', next: 'settle', wait: { minutes: Math.max(60, dueAt(c) + 2 * HOUR - c.w.time), why: 'Repayment pending.' } }) }];
        return [
          { id: 'makegood', label: `Pay it now, with an apology (${money(code, -r)})`, hint: 'repairs some of the damage', why: why((c.p.wallet[code] ?? 0) >= -r, 'You still do not have the money.'), run: (c) => { if (!pay(c.w, cref(c.p.id), cref(f.id), code, -r, `Late loan repayment to ${f.name}`)) return { text: 'The payment failed.', fail: true }; c.p.flags[`loanResult_${f.id}`] = 1; c.remember(f, 25, 'paid back the loan late, with an apology'); return done('Late, but paid. It helps.', 'made-good'); } },
          { id: 'avoid', label: 'Avoid them', hint: 'the debt and the grudge remain', run: () => done('You cross the street when you see them.', 'defaulted') },
        ];
      },
    },
  },
};

export const WORK_CHAINS: StoryDef[] = [WAGE_OWNER, WAGE_WORKER, WAGE_OBSERVER, MEAL, LOAN];
