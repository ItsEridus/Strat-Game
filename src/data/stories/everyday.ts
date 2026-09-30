// Everyday situations: single decisions drawn from the player's surroundings.
// Each binds real people and entities when offered and re-checks them when the
// player decides.
import { census } from '../../sim/census';
import type { StoryDef } from '../../sim/story';
import { mint, moveItems, pay, produce } from '../../engine/ledger';
import { GOLD, c as cur, fmtAmt, g } from '../../engine/money';
import { DAY } from '../../engine/clock';
import { record, schedule } from '../../engine/events';
import { pick, rand, randInt } from '../../engine/rng';
import { controller, coref, cref, hhref, jailed, maxEnergy, regref, today } from '../../sim/query';
import { companiesIn, residents } from '../../sim/census';
import { adjustRel } from '../../sim/social';
import { applyJob, setOffer } from '../../sim/company';
import { companyValue, transferCompany } from '../../sim/companyMarket';
import { enlist, enlistCheck } from '../../sim/forces';
import { openCase } from '../../sim/crime';
import { activeCrises, donate, joinProtest, joinProtestCheck, reliefCheck, volunteer } from '../../sim/dynamics';
import { activeWars } from '../../sim/war';
import { ISSUE_INFO, localIssues, playerCandidacy, type Issue } from '../../sim/interact';
import { isAdult, practise } from '../../sim/growth';
import { Ctx } from '../../sim/story';
import { cash, curOf, done, first, locals, money, myCompanies, single, why } from './kit';

const foodQ = (inv: Record<string, number>) => [1, 2, 3, 4, 5].reduce((s, q) => s + (inv[`food:${q}`] ?? 0), 0);

export const EVERYDAY: StoryDef[] = [
  single({
    id: 'life.wallet', icon: '👛', tags: ['social'], weight: 3,
    title: () => 'A lost wallet',
    bind: (w, p) => {
      const pool = locals(w, p).filter((c) => cash(w, c) > cur(60));
      if (!pool.length) return null;
      const owner = pool[randInt(w, 0, Math.min(2, pool.length - 1))];
      return { bind: { owner: owner.id }, key: `wallet:${owner.id}:${today(w)}`, data: { amt: Math.min(Math.floor(cash(w, owner) * 0.3), cur(40)), code: curOf(w, p.loc) } };
    },
    stale: (c) => (c.cit('owner') ? null : 'The owner is gone.'),
    text: (c) => `On the pavement in ${c.w.regions[c.p.loc].name} you find a wallet with ${money(c.str('code'), c.num('amt'))} inside. The ID card says it belongs to ${c.cit('owner')!.name}.`,
    choices: (c) => [
      { id: 'return', label: `Track down ${first(c.cit('owner')!.name)} and return it`, hint: '+relationship, a little fame', run: (c) => {
        const o = c.cit('owner')!;
        c.remember(o, 20, 'returned my lost wallet with every coin in it', 'witnessed');
        c.p.sec.fame += 0.5; practise(c.w, c.p, 'str', 1);
        for (const x of residents(c.w, o.home).slice(0, 6)) if (x.id !== o.id && !x.player) adjustRel(x, c.p.id, 2);
        return done(`${o.name} can't thank you enough, and tells the neighbours about it.`);
      } },
      { id: 'keep', label: 'Pocket the cash', hint: `+${money(c.str('code'), c.num('amt'))}, police attention; they may find out`, run: (c) => {
        const o = c.cit('owner')!;
        const amt = Math.min(c.num('amt'), o.wallet[c.str('code')] ?? 0);
        pay(c.w, cref(o.id), cref(c.p.id), c.str('code'), amt, 'Lost wallet');
        c.p.sec.heat = Math.min(100, c.p.sec.heat + 8);
        if (c.roll(0.3)) { c.remember(o, -30, 'kept the money from my lost wallet', 'witnessed'); openCase(c.w, c.p, 'pickpocket', c.p.loc, 25, amt); return done(`You kept the cash — but a camera caught you. ${o.name} has reported you.`, 'caught'); }
        return done('You kept the cash. Nobody saw… probably.', 'kept');
      } },
      { id: 'police', label: 'Hand it in at the police station', hint: 'a good name, no fuss', run: (c) => { c.remember(c.cit('owner'), 5, 'handed my wallet in to the police'); c.p.influence += 0.3; return done('The desk sergeant logs it. The owner gets it back.'); } },
    ],
  }),
  single({
    id: 'life.neighbour', icon: '🍞', tags: ['social'], weight: 3,
    title: () => 'A neighbour in need',
    bind: (w, p) => {
      const n = residents(w, p.loc).filter((c) => !c.player && cash(w, c, c.home) < cur(30) && !jailed(w, c) && c.loc === p.loc)[0];
      return n ? { bind: { n: n.id }, key: `neighbour:${n.id}:${Math.floor(today(w) / 7)}`, data: { code: curOf(w, p.loc) } } : null;
    },
    stale: (c) => (c.cit('n') && c.cit('n')!.loc === c.p.loc ? null : 'They have left.'),
    text: (c) => `${c.cit('n')!.name}, who lives down the road, has fallen on hard times${c.cit('n')!.job == null ? ' since losing their job' : ''}. They ask, embarrassed, whether you could help them get through the week.`,
    choices: (c) => {
      const n = c.cit('n')!;
      const vacancy = myCompanies(c.w, c.p).find((co) => co.offer && co.workers.length < co.offer.slots && controller(c.w.regions[co.region]) === controller(c.w.regions[n.loc]));
      return [
        { id: 'food', label: 'Give them two meals', hint: '+relationship (theirs and the neighbours’)', why: why(foodQ(c.p.inv) >= 2, 'You have no food to spare.'), run: (c) => {
          for (let q = 1, left = 2; q <= 5 && left > 0; q++) { const k = `food:${q}`; const t = Math.min(left, c.p.inv[k] ?? 0); if (t && moveItems(c.w, cref(c.p.id), cref(n.id), k, t)) left -= t; }
          c.remember(n, 15, 'brought me food when I had nothing', 'witnessed');
          for (const x of residents(c.w, n.home).slice(0, 5)) if (!x.player && x.id !== n.id) adjustRel(x, c.p.id, 2);
          return done(`${n.name} is grateful. Word gets around that you look after your neighbours.`);
        } },
        { id: 'money', label: `Give them ${money(c.str('code'), cur(15))}`, hint: '+relationship', why: why(cash(c.w, c.p) >= cur(15), 'Not enough money.'), run: (c) => {
          pay(c.w, cref(c.p.id), cref(n.id), c.str('code'), cur(15), 'Help for a neighbour');
          c.remember(n, 12, 'helped me with money when I was short');
          return done(`${n.name} promises to pay you back one day.`);
        } },
        { id: 'job', label: 'Offer them a job at your company', hint: '+a worker, +relationship', why: why(!!vacancy, 'You have no vacancy nearby.'), run: (c) => {
          const co = vacancy!;
          if (n.job != null) { const old = c.w.companies[n.job]; if (old) old.workers = old.workers.filter((x) => x !== n.id); }
          co.workers.push(n.id); n.job = co.id; n.jobSince = c.w.time;
          c.remember(n, 20, `gave me a job at ${co.name} when I needed it`, 'witnessed');
          return done(`${n.name} starts at ${co.name} tomorrow. They won't forget this.`);
        } },
        { id: 'no', label: 'Apologise — you can’t help', hint: 'they will understand… mostly', run: (c) => { c.remember(n, -3, 'turned me away when I asked for help'); return done(`${n.name} nods and walks away.`, 'refused'); } },
      ];
    },
  }),
  single({
    id: 'life.festival', icon: '🎉', tags: ['social'], weight: 2,
    title: (c) => `A ${c.str('kind')} in ${c.w.regions[c.num('region')].name}`,
    bind: (w, p) => ({ bind: { region: p.loc }, key: `festival:${p.loc}:${today(w)}`, data: { kind: pick(w, ['street festival', 'food market', 'concert in the park', 'harvest fair', 'night market']), code: curOf(w, p.loc) } }),
    stale: (c) => (c.p.loc === c.num('region') ? null : 'You are no longer there.'),
    text: () => 'Music, food stalls and half the neighbourhood out in the street. It would be a good chance to meet people — or to rest.',
    choices: (c) => [
      { id: 'join', label: `Join in and buy a round (${money(c.str('code'), cur(12))})`, hint: '+relationship with several locals, a little fame', why: why(cash(c.w, c.p) >= cur(12), 'Not enough money.'), run: (c) => {
        pay(c.w, cref(c.p.id), hhref(controller(c.w.regions[c.p.loc])), c.str('code'), cur(12), 'Festival');
        let k = 0; for (const x of locals(c.w, c.p).slice(0, 30)) if (c.roll(0.4)) { adjustRel(x, c.p.id, 5); k++; }
        c.p.sec.fame += 0.4; return done(`A great night. ${k} locals will remember you fondly.`);
      } },
      { id: 'mingle', label: 'Just wander and chat', hint: '+relationship with a few locals, −10 energy', why: why(c.p.energy >= 10, 'Too tired.'), run: (c) => {
        c.p.energy -= 10; let k = 0; for (const x of locals(c.w, c.p).slice(0, 30)) if (c.roll(0.2)) { adjustRel(x, c.p.id, 3); k++; }
        return done(`You met ${k} people.`);
      } },
      { id: 'rest', label: 'Stay home and rest', hint: '+10 energy', run: (c) => { c.p.energy = Math.min(maxEnergy(c.w, c.p), c.p.energy + 10); return done('A quiet evening in. You feel rested.'); } },
    ],
  }),
  single({
    id: 'life.friendloan', icon: '🤝', tags: ['social', 'economy'], weight: 2, cooldownDays: 6,
    title: (c) => `${c.cit('f')!.name} asks for a loan`,
    bind: (w, p) => {
      const f = locals(w, p).find((c) => (c.rel[p.id] ?? 0) >= 30 && cash(w, c) < cur(50));
      return f ? { bind: { f: f.id }, key: `friendloan:${f.id}:${Math.floor(today(w) / 10)}`, data: { amt: cur(randInt(w, 4, 10) * 10), code: curOf(w, p.loc) } } : null;
    },
    stale: (c) => (c.cit('f') ? null : 'They are gone.'),
    text: (c) => `Your friend ${c.cit('f')!.name} needs ${money(c.str('code'), c.num('amt'))} to cover rent. They promise to pay you back with a little extra in a week.`,
    choices: (c) => {
      const f = c.cit('f')!, amt = c.num('amt'), code = c.str('code');
      return [
        { id: 'lend', label: `Lend ${money(code, amt)}`, hint: 'repaid with 10% interest in 7 days — if they can', why: why(cash(c.w, c.p) >= amt, 'Not enough money.'), run: (c) => {
          pay(c.w, cref(c.p.id), cref(f.id), code, amt, 'Loan to a friend');
          schedule(c.w, c.w.time + 7 * DAY, 'encounterRepay', { from: f.id, to: c.p.id, code, amt: Math.round(amt * 1.1) });
          c.remember(f, 8, `lent me ${money(code, amt)} for the rent`);
          return done(`${f.name} will pay you back on day ${today(c.w) + 7}.`, 'lent');
        } },
        { id: 'gift', label: 'Give them half, no strings', hint: '+big relationship', why: why(cash(c.w, c.p) >= Math.floor(amt / 2), 'Not enough money.'), run: (c) => {
          pay(c.w, cref(c.p.id), cref(f.id), code, Math.floor(amt / 2), 'Gift to a friend');
          c.remember(f, 18, 'helped with my rent and asked nothing back');
          return done(`${f.name} is moved. That's what friends are for.`, 'gift');
        } },
        { id: 'no', label: 'Say no', hint: '−relationship', run: (c) => { c.remember(f, -8, 'refused to help with my rent'); return done(`${f.name} understands, but it stings.`, 'refused'); } },
      ];
    },
  }),
  single({
    id: 'work.raise', icon: '💼', tags: ['economy'], weight: 3, cooldownDays: 7,
    title: (c) => `The staff at ${c.w.companies[c.num('co')]?.name ?? 'your company'} want a raise`,
    bind: (w, p) => {
      const co = myCompanies(w, p).find((x) => x.workers.length >= 2 && x.offer && w.citizens[x.workers[0]]);
      return co ? { bind: { co: co.id, spokes: co.workers[0] }, key: `raise:${co.id}:${Math.floor(today(w) / 14)}` } : null;
    },
    stale: (c) => { const co = c.w.companies[c.num('co')]; return !co || !(co.owner.k === 'cit' && co.owner.id === c.p.id) || !co.offer ? 'The company is no longer yours.' : null; },
    text: (c) => { const co = c.w.companies[c.num('co')]!; return `${c.cit('spokes')?.name ?? 'A worker'} speaks for the ${co.workers.length} workers at ${co.name}: prices are up and ${money(curOf(c.w, co.region), co.offer!.wage)} a shift doesn't go far. They ask for 15% more.`; },
    choices: (c) => {
      const co = c.w.companies[c.num('co')]!;
      const staff = () => co.workers.map((id) => c.w.citizens[id]).filter(Boolean);
      const raise = (m: number, d: number, what: string) => (c: Ctx) => {
        setOffer(c.w, c.p.id, co.id, Math.round(co.offer!.wage * m), co.offer!.slots, co.offer!.minEco);
        for (const s of staff()) c.remember(s, d, what);
        return done(`New wage ${fmtAmt(curOf(c.w, co.region), co.offer!.wage)}. The staff are ${m > 1.1 ? 'delighted' : 'satisfied'}.`, m > 1.1 ? 'raised' : 'compromise');
      };
      return [
        { id: 'full', label: `Raise wages 15% (${money(curOf(c.w, co.region), Math.round(co.offer!.wage * 1.15))})`, hint: '+loyalty from every worker, higher costs', run: raise(1.15, 12, 'gave us the 15% raise we asked for') },
        { id: 'half', label: 'Meet them halfway (+7%)', hint: 'mild approval', run: raise(1.07, 5, 'met us halfway on pay') },
        { id: 'no', label: 'Refuse: the business can’t afford it', hint: '−relationship; some may quit', run: (c) => {
          let quit = 0;
          for (const s of staff()) { c.remember(s, -10, 'refused our request for a raise'); if (c.roll(0.2)) { co.workers = co.workers.filter((x) => x !== s.id); s.job = null; quit++; } }
          return done(quit ? `${quit} worker${quit > 1 ? 's' : ''} walked out.` : 'They grumble and go back to work.', 'refused');
        } },
      ];
    },
  }),
  single({
    id: 'work.buyout', icon: '🏢', tags: ['economy'], weight: 1.5, cooldownDays: 10,
    title: (c) => `An offer for ${c.w.companies[c.num('co')]?.name ?? 'your company'}`,
    bind: (w, p) => {
      const co = myCompanies(w, p)[0];
      if (!co) return null;
      const value = companyValue(w, co);
      const buyer = census(w).all.find((c) => !c.player && (c.persona === 'industrialist' || c.persona === 'investor') && c.nation === controller(w.regions[co.region]) && (c.wallet[GOLD] ?? 0) > value * 1.3);
      return buyer ? { bind: { co: co.id, buyer: buyer.id }, key: `buyout:${co.id}:${Math.floor(today(w) / 20)}`, data: { offer: Math.round(value * rand(w, 1.05, 1.35)), value } } : null;
    },
    stale: (c) => { const co = c.w.companies[c.num('co')]; return !co || !(co.owner.k === 'cit' && co.owner.id === c.p.id) ? 'The company is no longer yours.' : !c.cit('buyer') ? 'The buyer is gone.' : null; },
    text: (c) => `${c.cit('buyer')!.name}, a local ${c.cit('buyer')!.persona}, wants to buy ${c.w.companies[c.num('co')]!.name} outright for ${fmtAmt(GOLD, c.num('offer'))} (your accountant values it at ${fmtAmt(GOLD, c.num('value'))}).`,
    choices: (c) => {
      const b = c.cit('buyer')!, co = c.w.companies[c.num('co')]!;
      const sell = (price: number) => (c: Ctx) => {
        if ((b.wallet[GOLD] ?? 0) < price) return done(`${b.name} couldn't raise the money after all.`, 'fell-through');
        pay(c.w, cref(b.id), cref(c.p.id), GOLD, price, `Purchase of ${co.name}`);
        transferCompany(c.w, co, cref(b.id), price);
        c.remember(b, 6, `sold me ${co.name}`);
        record(c.w, 'company', `🏢 ${c.p.name} sold ${co.name} to ${b.name} for ${fmtAmt(GOLD, price)}.`, { cit: c.p.id, region: co.region, player: true });
        return done(`Sold. ${fmtAmt(GOLD, price)} is in your account.`, 'sold');
      };
      return [
        { id: 'sell', label: `Sell for ${fmtAmt(GOLD, c.num('offer'))}`, hint: 'the company, its stock and staff pass to them', run: sell(c.num('offer')) },
        { id: 'counter', label: `Hold out for ${fmtAmt(GOLD, Math.round(c.num('offer') * 1.3))}`, hint: 'they may walk away', chance: Ctx.odds(0.45 + b.traits.greed * 0.3), run: (c) => (c.roll(Ctx.odds(0.45 + b.traits.greed * 0.3)) ? sell(Math.round(c.num('offer') * 1.3))(c) : (c.remember(b, -5, 'played hardball over a company sale'), done(`${b.name} walked away from the table.`, 'walked'))) },
        { id: 'no', label: 'Not for sale', hint: 'no change', run: (c) => { c.remember(b, -2, 'refused to sell to me'); return done(`${b.name} shrugs: “If you change your mind…”`, 'kept'); } },
      ];
    },
  }),
  single({
    id: 'work.pitch', icon: '📈', tags: ['economy'], weight: 2, cooldownDays: 8,
    title: (c) => `${c.cit('f')!.name} has a business idea`,
    bind: (w, p) => {
      const f = locals(w, p).find((c) => (c.persona === 'industrialist' || c.persona === 'merchant') && c.nation === p.nation);
      if (!f || (p.wallet[GOLD] ?? 0) < g(3)) return null;
      return { bind: { f: f.id }, key: `pitch:${f.id}:${Math.floor(today(w) / 20)}`, data: { stake: g(Math.min(20, Math.max(2, Math.round((p.wallet[GOLD] ?? 0) / 1000 / 4)))), idea: pick(w, ['a bakery chain', 'a trucking company', 'a new mine', 'an import business', 'a factory expansion', 'a chain of cafés']) } };
    },
    stale: (c) => (c.cit('f') ? null : 'They are gone.'),
    text: (c) => { const f = c.cit('f')!; return `${f.name} wants partners for ${c.str('idea')} in ${c.w.regions[f.home].name}. They're asking for ${fmtAmt(GOLD, c.num('stake'))} and promise a share of the profits within a few weeks. They seem ${f.traits.ambition > 0.6 ? 'driven' : 'a little vague'}.`; },
    choices: (c) => [
      { id: 'invest', label: `Invest ${fmtAmt(GOLD, c.num('stake'))}`, hint: 'returns between nothing and double, in 10–20 days', why: why((c.p.wallet[GOLD] ?? 0) >= c.num('stake'), 'Not enough gold.'), run: (c) => {
        const f = c.cit('f')!;
        pay(c.w, cref(c.p.id), cref(f.id), GOLD, c.num('stake'), 'Investment');
        const mult = Math.max(0, rand(c.w, -0.2, 1.4) + f.traits.ambition * 0.5 + c.p.attrs.luck * 0.01);
        schedule(c.w, c.w.time + randInt(c.w, 10, 20) * DAY, 'encounterRepay', { from: f.id, to: c.p.id, code: GOLD, amt: Math.round(c.num('stake') * mult), invest: true });
        c.remember(f, 10, `invested in ${c.str('idea')} with me`);
        return done(`You're a partner now. ${f.name} will report back in a couple of weeks.`, 'invested');
      } },
      { id: 'no', label: 'Politely decline', hint: 'no change', run: (c) => done(`${c.cit('f')!.name} will find someone else.`, 'declined') },
    ],
  }),
  single({
    id: 'work.poach', icon: '🧑‍💼', tags: ['economy'], weight: 2, cooldownDays: 10,
    title: () => 'A better job offer',
    bind: (w, p) => {
      if (p.job == null) return null;
      const mine = w.companies[p.job];
      const co = companiesIn(w, p.loc).find((x) => x.id !== p.job && x.offer && x.workers.length < x.offer.slots && mine?.offer && x.offer.wage > mine.offer.wage * 1.1 && x.owner.k === 'cit' && x.owner.id !== p.id);
      return co ? { bind: { co: co.id, old: p.job, boss: co.owner.id }, key: `poach:${co.id}:${Math.floor(today(w) / 10)}` } : null;
    },
    stale: (c) => { const co = c.w.companies[c.num('co')]; return !co || !co.offer || co.workers.length >= co.offer.slots ? 'The position has been filled.' : c.p.job !== c.num('old') ? 'You have changed jobs since.' : null; },
    text: (c) => { const co = c.w.companies[c.num('co')]!; return `${c.cit('boss')?.name ?? 'The owner'} of ${co.name} has heard good things about you and offers ${money(curOf(c.w, co.region), co.offer!.wage)} a shift — more than you make now.`; },
    choices: (c) => {
      const old = c.w.companies[c.num('old')];
      const oldBoss = old?.owner.k === 'cit' ? c.w.citizens[old.owner.id] : undefined;
      return [
        { id: 'take', label: `Accept and move to ${c.w.companies[c.num('co')]!.name}`, hint: 'better pay; your old boss won’t be pleased', run: (c) => { const r = applyJob(c.w, c.p, c.num('co')); if (r.ok) c.remember(oldBoss, -8, 'left my company for a better offer'); return done(r.msg, r.ok ? 'moved' : 'failed'); } },
        { id: 'no', label: 'Stay loyal', hint: '+relationship with your current boss', run: (c) => { c.remember(oldBoss, 8, 'turned down a better offer to stay with us'); return done('Your boss hears about it and appreciates the loyalty.', 'stayed'); } },
      ];
    },
  }),
  single({
    id: 'work.inspector', icon: '🧑‍🔬', tags: ['economy'], weight: 1.5, cooldownDays: 10,
    title: () => 'An environmental inspector calls',
    bind: (w, p) => {
      const co = myCompanies(w, p).find((x) => w.regions[x.region].pollution > 0.5);
      return co ? { bind: { co: co.id }, key: `inspect:${co.id}:${Math.floor(today(w) / 15)}`, data: { fine: cur(randInt(w, 30, 80)) } } : null;
    },
    stale: (c) => { const co = c.w.companies[c.num('co')]; return !co || !(co.owner.k === 'cit' && co.owner.id === c.p.id) ? 'The company is no longer yours.' : null; },
    text: (c) => { const co = c.w.companies[c.num('co')]!; return `An inspector from ${c.w.regions[co.region].name} says ${co.name} is breaking pollution limits (air quality ${Math.round((1 - c.w.regions[co.region].pollution) * 100)}%). The fine is ${money(curOf(c.w, co.region), c.num('fine'))}.`; },
    choices: (c) => {
      const co = c.w.companies[c.num('co')]!, code = curOf(c.w, co.region), fine = c.num('fine');
      const funds = (co.wallet[code] ?? 0) + (c.p.wallet[code] ?? 0);
      const payFrom = (c: Ctx, amt: number, what: string) => { const from = (co.wallet[code] ?? 0) >= amt ? coref(co.id) : cref(c.p.id); return pay(c.w, from, c.w.govs[co.region] ? regref(co.region) : hhref(controller(c.w.regions[co.region])), code, amt, what); };
      const winOdds = Ctx.odds(0.4 + c.p.attrs.lead * 0.01);
      return [
        { id: 'pay', label: `Pay the fine (${money(code, fine)})`, hint: 'goes to the regional treasury', why: why(funds >= fine && Math.max(co.wallet[code] ?? 0, c.p.wallet[code] ?? 0) >= fine, 'Not enough money in the company or your wallet.'), run: (c) => (payFrom(c, fine, 'Pollution fine') ? done('Fine paid. The inspector leaves satisfied.', 'paid') : done('The payment failed.', 'failed')) },
        { id: 'bribe', label: `Slip them ${money(code, Math.round(fine / 3))} to look away`, hint: 'cheaper; 35% chance of a bribery case', why: why(Math.max(co.wallet[code] ?? 0, c.p.wallet[code] ?? 0) >= Math.round(fine / 3), 'Not enough money.'), run: (c) => {
          payFrom(c, Math.round(fine / 3), 'Inspection “fee”');
          c.p.sec.heat = Math.min(100, c.p.sec.heat + 10);
          if (c.roll(0.35)) { openCase(c.w, c.p, 'bribery', co.region, 30, 0); return done('The inspector took the money — and reported you. A bribery investigation is open.', 'reported'); }
          return done('The inspector pockets it and forgets the visit.', 'bribed');
        } },
        { id: 'contest', label: 'Contest it', hint: 'win, or pay double', chance: winOdds, why: why(Math.max(co.wallet[code] ?? 0, c.p.wallet[code] ?? 0) >= fine * 2, 'You could not cover a doubled fine if you lost.'), run: (c) => (c.roll(winOdds) ? done('The tribunal threw the fine out. Victory.', 'won') : (payFrom(c, fine * 2, 'Pollution fine (doubled on appeal)'), done('You lost the appeal and paid double.', 'lost'))) },
      ];
    },
  }),
  single({
    id: 'civic.townhall', icon: '🎤', tags: ['politics'], weight: 3,
    title: () => 'A question from the crowd',
    bind: (w, p) => {
      if (!isAdult(w, p) || (p.influence < 8 && !playerCandidacy(w))) return null;
      const asker = locals(w, p).find((c) => c.nation === p.nation);
      return asker ? { bind: { asker: asker.id, region: p.loc }, key: `townhall:${p.loc}:${today(w)}`, data: { issue: localIssues(w, p.loc)[0].issue } } : null;
    },
    stale: (c) => (c.p.loc === c.num('region') ? null : 'The meeting is over.'),
    text: (c) => { const info = ISSUE_INFO[c.str('issue') as Issue]; const top = localIssues(c.w, c.num('region')).find((x) => x.issue === c.str('issue')); return `At a public meeting in ${c.w.regions[c.num('region')].name}, ${c.cit('asker')?.name ?? 'a resident'} stands up: “What are you going to do about ${info.name.toLowerCase()}?${top ? ` (${top.why})` : ''}” Every eye turns to you.`; },
    choices: (c) => {
      const info = ISSUE_INFO[c.str('issue') as Issue];
      const crowd = () => locals(c.w, c.p).filter((x) => x.nation === c.p.nation).slice(0, 40);
      return [
        { id: 'bold', label: `“${info.pitch} — I promise.”`, hint: '+influence and pledges from those who care; people remember promises', run: (c) => {
          c.p.influence += 2.5; let k = 0;
          for (const x of crowd()) if (c.roll(0.35)) { adjustRel(x, c.p.id, 4); if (playerCandidacy(c.w) && c.roll(0.25)) { x.flags.pledge = c.p.id; x.flags.pledgeDay = today(c.w); k++; } }
          c.note(`You publicly promised: “${info.pitch}.”`, 'promise');
          return done(`Applause. +2.5 influence${k ? `, ${k} promised you their vote` : ''}.`, 'promised');
        } },
        { id: 'honest', label: '“There’s no quick fix, but here is my plan…”', hint: 'steady +relationship with the thoughtful', run: (c) => { c.p.influence += 1; for (const x of crowd()) if (c.roll(0.25)) adjustRel(x, c.p.id, 3); c.remember(c.cit('asker'), 6, 'gave me a straight answer at the town meeting', 'public'); return done('A thoughtful answer. The room respects it.', 'honest'); } },
        { id: 'deflect', label: 'Change the subject', hint: '−influence', run: (c) => { c.p.influence = Math.max(0, c.p.influence - 1.5); c.remember(c.cit('asker'), -4, 'dodged my question at the town meeting', 'public'); return done('Murmurs in the hall. It came across as evasive (−1.5 influence).', 'dodged'); } },
      ];
    },
  }),
  single({
    id: 'civic.donor', icon: '💰', tags: ['politics'], weight: 2, cooldownDays: 8,
    title: () => 'A generous donor',
    bind: (w, p) => {
      const cand = playerCandidacy(w);
      if (!cand) return null;
      const code = w.nations[p.nation].cur;
      const d = census(w).all.find((c) => !c.player && c.nation === p.nation && (c.persona === 'industrialist' || c.persona === 'investor') && (c.wallet[code] ?? 0) > cur(400));
      return d ? { bind: { d: d.id }, key: `donor:${d.id}:${Math.floor(today(w) / 15)}`, data: { amt: cur(randInt(w, 10, 25) * 10), code, region: cand.region ?? -1, label: cand.label } } : null;
    },
    stale: (c) => (!playerCandidacy(c.w) ? 'You are no longer running.' : !c.cit('d') ? 'The donor is gone.' : null),
    text: (c) => `${c.cit('d')!.name}, one of the wealthiest people around, offers ${money(c.str('code'), c.num('amt'))} for your campaign for ${c.str('label')}. “All I ask is that you remember your friends when you win.”`,
    choices: (c) => {
      const donor = c.cit('d')!, code = c.str('code');
      const take = (amt: number, strings: boolean) => (c: Ctx) => {
        const paid = Math.min(amt, donor.wallet[code] ?? 0);
        if (!paid || !pay(c.w, cref(donor.id), cref(c.p.id), code, paid, 'Campaign donation')) return done('The donor could not pay after all.', 'fell-through');
        const s = c.num('region') >= 0 ? c.w.govs[c.num('region')] : null;
        const me = s?.candidates.find((x) => x.cit === c.p.id);
        if (me) me.campaign += paid;
        c.remember(donor, strings ? 15 : 3, strings ? 'took my money for the campaign — they owe me' : 'accepted a small declared donation');
        if (strings) {
          c.note(`${donor.name} expects favours for their ${fmtAmt(code, paid)} donation.`, 'promise', donor.id);
          c.p.sec.heat = Math.min(100, c.p.sec.heat + 6);
          if (c.roll(0.25)) { openCase(c.w, c.p, 'corruption', c.p.loc, 20, paid); return done('The money is welcome — but a reporter is asking questions, and the police have opened a file.', 'investigated'); }
        }
        return done(`${fmtAmt(code, paid)} for the campaign.`, strings ? 'took' : 'clean');
      };
      return [
        { id: 'take', label: `Accept ${money(code, c.num('amt'))}`, hint: 'campaign money; 25% chance journalists and police take an interest', run: take(c.num('amt'), true) },
        { id: 'clean', label: 'Accept only a small, declared donation', hint: `${money(code, Math.round(c.num('amt') / 5))}, no strings`, run: take(Math.round(c.num('amt') / 5), false) },
        { id: 'no', label: 'Refuse — you can’t be bought', hint: '+fame; they won’t forget the snub', run: (c) => { c.p.sec.fame += 1; c.remember(donor, -12, 'refused my campaign money'); return done('Word of your refusal spreads. Some admire it; your would-be donor does not.', 'refused'); } },
      ];
    },
  }),
  single({
    id: 'civic.petition', icon: '📝', tags: ['politics'], weight: 2,
    title: () => 'A petition',
    bind: (w, p) => {
      const top = localIssues(w, p.loc).find((x) => x.issue === 'health' || x.issue === 'crime' || x.issue === 'pollution');
      const lead = locals(w, p).find((c) => c.nation === p.nation);
      return top && top.severity >= 0.35 && lead ? { bind: { lead: lead.id, region: p.loc }, key: `petition:${p.loc}:${top.issue}:${Math.floor(today(w) / 10)}`, data: { issue: top.issue } } : null;
    },
    stale: (c) => (c.p.loc === c.num('region') ? null : 'You are no longer there.'),
    text: (c) => `${c.cit('lead')?.name ?? 'A resident'} is collecting signatures in ${c.w.regions[c.num('region')].name} demanding ${c.str('issue') === 'health' ? 'a new hospital' : c.str('issue') === 'crime' ? 'more police on the streets' : 'limits on factory emissions'}.`,
    choices: (c) => [
      { id: 'sign', label: 'Sign it', hint: '+relationship with those who care', run: (c) => { c.remember(c.cit('lead'), 5, 'signed our petition'); return done('Your signature joins hundreds of others.'); } },
      { id: 'lead', label: 'Put your name at the top and deliver it', hint: '−20 energy, +influence, pressure on the regional government', why: why(c.p.energy >= 20, 'Too tired.'), run: (c) => {
        const s = c.w.govs[c.num('region')];
        c.p.energy -= 20; c.p.influence += 1.5;
        for (const x of locals(c.w, c.p).slice(0, 30)) if (c.roll(0.3)) adjustRel(x, c.p.id, 3);
        c.remember(c.cit('lead'), 10, 'led our petition to the government', 'public');
        if (s) { if (c.str('issue') === 'crime') s.budget.police = Math.min(0.6, s.budget.police + 0.05); if (c.str('issue') === 'health') s.budget.welfare = Math.min(0.6, s.budget.welfare + 0.05); s.approval = Math.max(0, s.approval - 2); }
        return done(`You delivered the petition to ${s?.head.name ? `the office of ${s.head.name}` : 'the authorities'}. They have shifted their budget a little. +1.5 influence.`, 'led');
      } },
      { id: 'no', label: 'Walk past', hint: 'no change', run: () => done('You walk on.', 'ignored') },
    ],
  }),
  single({
    id: 'crime.mugging', icon: '🔪', tags: ['crime'], weight: 2,
    title: () => 'Mugged!',
    bind: (w, p) => {
      const r = w.regions[p.loc];
      if (r.crime < 30 || cash(w, p) < cur(20) || rand(w, 0, 100) > r.crime) return null;
      return { bind: { region: p.loc }, key: `mug:${p.loc}:${today(w)}`, data: { code: curOf(w, p.loc) } };
    },
    stale: (c) => (c.p.loc === c.num('region') ? null : 'You got away.'),
    text: (c) => `Walking home through ${c.w.regions[c.num('region')].name} after dark, a figure steps out of an alley: “Wallet. Now.”`,
    choices: (c) => {
      const r = c.w.regions[c.num('region')], code = c.str('code');
      const loss = () => Math.floor(Math.min((c.p.wallet[code] ?? 0) * 0.25, cur(60)));
      const lose = (c: Ctx, m: number) => pay(c.w, cref(c.p.id), hhref(controller(r)), code, Math.min(c.p.wallet[code] ?? 0, Math.floor(m)), 'Mugged');
      const fight = Ctx.odds(0.3 + c.p.attrs.str * 0.03 + c.p.power / 400);
      const police = Ctx.odds(r.police / 110);
      return [
        { id: 'fight', label: 'Fight back', hint: 'send them running — or get hurt and lose more', chance: fight, run: (c) => { if (c.roll(fight)) { c.p.sec.fame += 0.5; practise(c.w, c.p, 'str', 1); return done('You sent them running. A few onlookers cheer.', 'won'); } lose(c, loss() * 1.5); c.p.energy = Math.max(0, c.p.energy - 25); return done('You lost the fight — and more money than if you had just handed it over. −25 energy.', 'lost'); } },
        { id: 'give', label: 'Hand it over', hint: `lose ${money(code, loss())}`, run: (c) => { const l = loss(); lose(c, l); return done(`You handed over ${fmtAmt(code, l)}. At least you're unharmed.`, 'robbed'); } },
        { id: 'shout', label: 'Shout for the police', hint: `police strength here ${Math.round(r.police)}/100`, chance: police, run: (c) => { if (c.roll(police)) return done('Sirens! The mugger bolts before taking anything.', 'saved'); lose(c, loss()); return done('Nobody came. The mugger took your cash.', 'robbed'); } },
      ];
    },
  }),
  single({
    id: 'crime.fence', icon: '📦', tags: ['crime'], weight: 1.5, cooldownDays: 6,
    title: () => 'Something fell off a truck',
    bind: (w, p) => {
      const crook = locals(w, p).find((c) => c.sec.syndicate != null && w.syndicates[c.sec.syndicate]);
      return crook ? { bind: { crook: crook.id }, key: `fence:${crook.id}:${Math.floor(today(w) / 10)}`, data: { price: cur(randInt(w, 30, 60)), code: curOf(w, p.loc) } } : null;
    },
    stale: (c) => (c.cit('crook') && !jailed(c.w, c.cit('crook')!) && c.cit('crook')!.loc === c.p.loc ? null : 'The seller has gone.'),
    text: (c) => `A man who says his name is ${first(c.cit('crook')!.name)} opens a car boot: a crate of military-grade rifles (Q2), “no questions asked”, for ${money(c.str('code'), c.num('price'))}.`,
    choices: (c) => {
      const crook = c.cit('crook')!, code = c.str('code'), price = c.num('price');
      return [
        { id: 'buy', label: `Buy the crate (${money(code, price)})`, hint: '+8 Q2 ground weapons, police attention', why: why(cash(c.w, c.p) >= price, 'Not enough money.'), run: (c) => {
          pay(c.w, cref(c.p.id), cref(crook.id), code, price, 'Stolen goods');
          produce(c.w, cref(c.p.id), 'wg:2', 8, 'stolen goods');
          c.p.sec.heat = Math.min(100, c.p.sec.heat + 12);
          c.remember(crook, 8, 'bought a crate off me, no questions asked');
          return done('You load the crate. Better not ask where it came from.', 'bought');
        } },
        { id: 'no', label: 'Walk away', hint: 'no change', run: () => done('You keep walking.', 'ignored') },
        { id: 'report', label: 'Report him to the police', hint: 'helps the investigation; his friends won’t like it', run: (c) => {
          openCase(c.w, crook, 'smuggling', c.p.loc, 45, 0);
          c.remember(crook, -40, 'went to the police about me');
          const s = c.w.syndicates[crook.sec.syndicate ?? -1];
          if (s?.boss != null && c.w.citizens[s.boss]) c.remember(c.w.citizens[s.boss], -20, `informed on one of the ${s.name}'s people`);
          c.p.sec.fame += 0.5;
          return done(`The police open a smuggling case against ${crook.name}.${s ? ` The ${s.name} will remember this.` : ''}`, 'reported');
        } },
      ];
    },
  }),
  single({
    id: 'war.recruiter', icon: '🎖️', tags: ['war'], weight: 2, cooldownDays: 6,
    title: () => 'Your country needs you',
    bind: (w, p) => (!p.mil.branch && activeWars(w).some((x) => x.att === p.nation || x.def === p.nation) && !enlistCheck(w, p, 'army') ? { bind: { region: p.loc }, key: `recruit:${Math.floor(today(w) / 6)}` } : null),
    stale: (c) => (c.p.mil.branch ? 'You have already enlisted.' : !activeWars(c.w).some((x) => x.att === c.p.nation || x.def === c.p.nation) ? 'The war is over.' : null),
    text: (c) => `A recruiting sergeant has set up a table in ${c.w.regions[c.p.loc].name}. “We're at war. Every able body counts. Army, navy or air force — take your pick.”`,
    choices: (c) => {
      const patriots = () => locals(c.w, c.p).filter((x) => x.ideo === 'nationalism' || x.ideo === 'imperialism').slice(0, 10);
      const join = (b: 'army' | 'air') => (c: Ctx) => { const r = enlist(c.w, c.p, b); if (r.ok) for (const x of patriots()) adjustRel(x, c.p.id, 3); return done(r.msg, r.ok ? 'enlisted' : 'failed'); };
      return [
        { id: 'army', label: 'Join the army', hint: 'a rank, duties and service points; +relationship with patriots', why: enlistCheck(c.w, c.p, 'army'), run: join('army') },
        { id: 'air', label: 'Join the air force', hint: 'as above', why: enlistCheck(c.w, c.p, 'air'), run: join('air') },
        { id: 'no', label: 'Not today', hint: 'some patriots will think less of you', run: (c) => { for (const x of patriots()) adjustRel(x, c.p.id, -2); return done('You decline.', 'declined'); } },
      ];
    },
  }),
  single({
    id: 'crisis.local', icon: '🚨', tags: ['crisis'], weight: 3, cooldownDays: 4,
    title: (c) => `${c.w.crises[c.num('cr')]?.name ?? 'A disaster'} hits ${c.w.regions[c.num('region')].name}`,
    bind: (w, p) => {
      const cr = activeCrises(w).find((x) => x.regions.includes(p.loc) && !['strike', 'boom', 'shock', 'protest', 'riot'].includes(x.kind));
      return cr ? { bind: { cr: cr.id, region: p.loc }, key: `crisis:${cr.id}` } : null;
    },
    stale: (c) => (c.w.crises[c.num('cr')]?.status === 'active' ? null : 'The crisis is over.'),
    text: (c) => `The ${c.w.crises[c.num('cr')]!.name} has reached your area. Relief workers are overwhelmed and people are asking for help.`,
    choices: (c) => [
      { id: 'volunteer', label: 'Volunteer with the relief effort', hint: 'energy for relief; +fame, +relationship', why: reliefCheck(c.w, c.p, c.num('cr')), run: (c) => { const r = volunteer(c.w, c.p, c.num('cr')); return done(r.msg, r.ok ? 'volunteered' : 'failed'); } },
      { id: 'donate', label: `Donate ${money(curOf(c.w, c.p.loc), cur(25))}`, hint: 'funds the relief', why: why(cash(c.w, c.p) >= cur(25), 'Not enough money.'), run: (c) => { const r = donate(c.w, c.p, c.num('cr'), cur(25)); return done(r.msg, r.ok ? 'donated' : 'failed'); } },
      { id: 'no', label: 'Look after yourself', hint: 'no change', run: () => done('You stay indoors until it passes.', 'stayed') },
    ],
  }),
  single({
    id: 'civic.protest', icon: '📢', tags: ['politics'], weight: 2,
    title: () => 'Protest in the square',
    bind: (w, p) => (w.regions[p.loc].unrest >= 45 && !joinProtestCheck(w, p) ? { bind: { region: p.loc }, key: `protest:${p.loc}:${today(w)}` } : null),
    stale: (c) => (c.p.loc === c.num('region') ? null : 'You are no longer there.'),
    text: (c) => `Thousands are marching through ${c.w.regions[c.num('region')].name} against the government. The mood is tense; police line the streets.`,
    choices: (c) => {
      const calm = Ctx.odds(0.35 + c.p.attrs.lead * 0.02 + c.p.influence / 300);
      return [
        { id: 'join', label: 'March with them', hint: '+relationship with the discontented, police attention', why: joinProtestCheck(c.w, c.p), run: (c) => { const r = joinProtest(c.w, c.p); return done(r.msg, r.ok ? 'marched' : 'failed'); } },
        { id: 'speak', label: 'Speak to the crowd and call for calm', hint: '+influence if it works; boos if it doesn’t', chance: calm, run: (c) => { if (c.roll(calm)) { c.p.influence += 2; c.w.regions[c.p.loc].unrest = Math.max(0, c.w.regions[c.p.loc].unrest - 3); return done('The crowd quiets and listens. Tensions ease a little (+2 influence).', 'calmed'); } c.p.influence = Math.max(0, c.p.influence - 1); return done('You were drowned out by boos (−1 influence).', 'booed'); } },
        { id: 'no', label: 'Stay away', hint: 'no change', run: () => done('You watch from a distance.', 'stayed') },
      ];
    },
  }),
  single({
    id: 'social.rival', icon: '😠', tags: ['politics', 'social'], weight: 2, cooldownDays: 5,
    title: (c) => `${c.cit('r')!.name} attacks you in public`,
    bind: (w, p) => {
      const r = p.sec.rivals.map((id) => w.citizens[id]).find((c) => c && !jailed(w, c));
      return r ? { bind: { r: r.id }, key: `rival:${r.id}:${Math.floor(today(w) / 7)}`, data: { insult: pick(w, ['a fraud', 'out of touch', 'dangerous', 'a crook', 'a nobody']) } } : null;
    },
    stale: (c) => (c.cit('r') ? null : 'Your rival is gone.'),
    text: (c) => `Your rival ${c.cit('r')!.name} gave a speech calling you ${c.str('insult')}. The papers are running it.`,
    choices: (c) => {
      const r = c.cit('r')!;
      const win = Ctx.odds(0.5 + (c.p.attrs.lead - r.attrs.lead) * 0.03 + (c.p.influence - r.influence) / 400);
      return [
        { id: 'debate', label: 'Challenge them to a public debate', hint: 'the winner takes influence', chance: win, run: (c) => { if (c.roll(win)) { c.p.influence += 3; r.influence = Math.max(0, r.influence - 3); c.remember(r, -5, 'humiliated me in a public debate', 'public'); return done(`You won the debate. ${r.name} looked flustered (+3 influence).`, 'won'); } c.p.influence = Math.max(0, c.p.influence - 2); r.influence += 2; return done(`${r.name} got the better of you (−2 influence).`, 'lost'); } },
        { id: 'highroad', label: 'Take the high road', hint: 'small influence loss, +fame', run: (c) => { c.p.influence = Math.max(0, c.p.influence - 0.5); c.p.sec.fame += 1; return done('You refused to stoop. Some voters noticed.', 'highroad'); } },
        { id: 'dirt', label: 'Leak something embarrassing about them', hint: 'hurts them; 30% chance it is traced to you', run: (c) => {
          r.influence = Math.max(0, r.influence - 4); r.sec.notoriety += 2;
          if (c.roll(0.3)) { c.p.sec.notoriety += 3; c.remember(r, -20, 'leaked dirt about me to the press', 'public'); return done(`The story damaged ${r.name} — but the leak was traced back to you.`, 'traced'); }
          return done(`The story ran. ${r.name} is on the back foot (−4 influence for them).`, 'leaked');
        } },
      ];
    },
  }),
  single({
    id: 'life.windfall', icon: '📜', tags: ['social'], weight: 0.6, cooldownDays: 60,
    title: () => 'A letter from a lawyer',
    bind: (w, p) => ({ bind: {}, key: `windfall:${Math.floor(today(w) / 60)}`, data: { gold: Math.round(g(rand(w, 1, 4) + p.attrs.luck * 0.1)) } }),
    text: () => 'A distant relative you barely remember has died and named you in their will. The lawyer asks how you want the estate handled.',
    choices: (c) => [
      { id: 'gold', label: 'Take it in gold', hint: `${fmtAmt(GOLD, c.num('gold'))}`, run: (c) => { mint(c.w, cref(c.p.id), GOLD, c.num('gold'), 'Inheritance'); return done(`${fmtAmt(GOLD, c.num('gold'))} is yours.`, 'kept'); } },
      { id: 'charity', label: 'Give it to a local charity', hint: '+fame, +relationship with neighbours', run: (c) => { c.p.sec.fame += 1.5; for (const x of residents(c.w, c.p.loc).slice(0, 20)) if (!x.player) adjustRel(x, c.p.id, 2); return done('The charity names a room after your relative. Your neighbours are touched.', 'gave'); } },
    ],
  }),
];
