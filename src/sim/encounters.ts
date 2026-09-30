// Encounters: situations the player runs into while living their life — a lost
// wallet, a worker asking for a raise, a mugger, a donor with strings attached,
// a recruiter in wartime. Each shows its choices with their likely consequences
// before you decide, and every consequence goes through the normal systems
// (ledger, relationships, police cases, elections). About one a day, drawn from
// the player's own situation; time pauses while one waits for a decision.
import type { Citizen, Encounter, Id, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { mint, pay, produce } from '../engine/ledger';
import { GOLD, c as cur, fmtAmt, g } from '../engine/money';
import { DAY, HOUR } from '../engine/clock';
import { nid, notify, record, schedule } from '../engine/events';
import { chance, pick, rand, randInt, weighted } from '../engine/rng';
import { controller, coref, cref, hhref, jailed, maxEnergy, player, regref, today } from './query';
import { companiesIn, presentIn, residents } from './census';
import { adjustRel } from './social';
import { applyJob, setOffer } from './company';
import { companyValue, transferCompany } from './companyMarket';
import { enlist, enlistCheck } from './forces';
import { openCase } from './crime';
import { activeCrises, donate, joinProtest, joinProtestCheck, volunteer } from './dynamics';
import { activeWars } from './war';
import { ISSUE_INFO, localIssues, playerCandidacy } from './interact';
import { addXp } from './citizen';
import { HANDLERS } from './hooks';

type Opt = Encounter['options'][number];
interface Template {
  id: string;
  weight: number;
  /** Returns the encounter if it can happen to the player right now. */
  make: (w: World, p: Citizen) => Omit<Encounter, 'id' | 't' | 'kind'> | null;
  resolve: (w: World, p: Citizen, opt: string, d: Record<string, any>) => string;
}

const curOf = (w: World, rid: Id) => w.nations[controller(w.regions[rid])].cur;
const cash = (w: World, c: Citizen, rid = c.loc) => c.wallet[curOf(w, rid)] ?? 0;
const locals = (w: World, p: Citizen) => presentIn(w, p.loc).filter((c) => !c.player && !jailed(w, c));
const myCompanies = (w: World, p: Citizen) => Object.values(w.companies).filter((co) => co.owner.k === 'cit' && co.owner.id === p.id);
const money = (code: string, v: number) => fmtAmt(code, v);

const T: Template[] = [
  // ---------- everyday life ----------
  {
    id: 'wallet', weight: 3,
    make: (w, p) => {
      const owner = locals(w, p).filter((c) => cash(w, c) > cur(60))[0 + randInt(w, 0, 2)] ?? locals(w, p).find((c) => cash(w, c) > cur(60));
      if (!owner) return null;
      const code = curOf(w, p.loc);
      const amt = Math.min(Math.floor(cash(w, owner) * 0.3), cur(40));
      return {
        icon: '👛', title: 'A lost wallet',
        text: `On the pavement in ${w.regions[p.loc].name} you find a wallet with ${money(code, amt)} inside. The ID card says it belongs to ${owner.name}.`,
        options: [
          { id: 'return', label: `Track down ${owner.name.split(' ')[0]} and return it`, hint: `+relationship, a little fame, XP` },
          { id: 'keep', label: 'Pocket the cash', hint: `+${money(code, amt)}, police attention; they may find out` },
          { id: 'police', label: 'Hand it in at the police station', hint: '+XP, no fuss' },
        ],
        data: { owner: owner.id, amt, code },
      };
    },
    resolve: (w, p, o, d) => {
      const owner = w.citizens[d.owner];
      if (o === 'return') { adjustRel(owner, p.id, 20); p.sec.fame += 0.5; addXp(w, p, 5); for (const x of residents(w, owner.home).slice(0, 6)) if (x.id !== owner.id && !x.player) adjustRel(x, p.id, 2); return `${owner.name} can't thank you enough, and tells the neighbours about it.`; }
      if (o === 'keep') {
        pay(w, cref(owner.id), cref(p.id), d.code, Math.min(d.amt, owner.wallet[d.code] ?? 0), 'Lost wallet');
        p.sec.heat = Math.min(100, p.sec.heat + 8);
        if (chance(w, 0.3)) { adjustRel(owner, p.id, -30); openCase(w, p, 'pickpocket', p.loc, 25, d.amt); return `You kept the cash — but a camera caught you. ${owner.name} has reported you.`; }
        return 'You kept the cash. Nobody saw… probably.';
      }
      adjustRel(owner, p.id, 5); addXp(w, p, 3); return 'The desk sergeant logs it. The owner gets it back.';
    },
  },
  {
    id: 'neighbour', weight: 3,
    make: (w, p) => {
      const n = residents(w, p.loc).filter((c) => !c.player && cash(w, c, c.home) < cur(30) && !jailed(w, c))[0];
      if (!n) return null;
      const code = curOf(w, p.loc);
      const hasFood = [1, 2, 3, 4, 5].some((q) => (p.inv[`food:${q}`] ?? 0) >= 2);
      return {
        icon: '🍞', title: 'A neighbour in need',
        text: `${n.name}, who lives down the road, has fallen on hard times${n.job == null ? ' since losing their job' : ''}. They ask, embarrassed, whether you could help them get through the week.`,
        options: [
          { id: 'food', label: 'Give them two meals', hint: '+relationship (theirs and the neighbours’)', why: hasFood ? undefined : 'You have no food to spare.' },
          { id: 'money', label: `Give them ${money(code, cur(15))}`, hint: '+relationship', why: cash(w, p) >= cur(15) ? undefined : 'Not enough money.' },
          { id: 'job', label: 'Offer them a job at your company', hint: '+a worker, +relationship', why: myCompanies(w, p).some((co) => co.offer && co.workers.length < co.offer.slots && controller(w.regions[co.region]) === controller(w.regions[n.loc])) ? undefined : 'You have no vacancy nearby.' },
          { id: 'no', label: 'Apologise — you can’t help', hint: 'they will understand… mostly' },
        ],
        data: { n: n.id, code },
      };
    },
    resolve: (w, p, o, d) => {
      const n = w.citizens[d.n];
      if (o === 'food') { for (let q = 1, left = 2; q <= 5 && left > 0; q++) { const k = `food:${q}`; const t = Math.min(left, p.inv[k] ?? 0); if (t) { p.inv[k] -= t; n.inv[k] = (n.inv[k] ?? 0) + t; left -= t; } } adjustRel(n, p.id, 15); for (const x of residents(w, n.home).slice(0, 5)) if (!x.player && x.id !== n.id) adjustRel(x, p.id, 2); return `${n.name} is grateful. Word gets around that you look after your neighbours.`; }
      if (o === 'money') { pay(w, cref(p.id), cref(n.id), d.code, cur(15), 'Help for a neighbour'); adjustRel(n, p.id, 12); return `${n.name} promises to pay you back one day.`; }
      if (o === 'job') { const co = myCompanies(w, p).find((x) => x.offer && x.workers.length < x.offer.slots)!; if (n.job != null) { const old = w.companies[n.job]; if (old) old.workers = old.workers.filter((x) => x !== n.id); } co.workers.push(n.id); n.job = co.id; n.jobSince = w.time; adjustRel(n, p.id, 20); return `${n.name} starts at ${co.name} tomorrow. They won't forget this.`; }
      adjustRel(n, p.id, -3); return `${n.name} nods and walks away.`;
    },
  },
  {
    id: 'festival', weight: 2,
    make: (w, p) => {
      const code = curOf(w, p.loc);
      const names = ['street festival', 'food market', 'concert in the park', 'harvest fair', 'night market'];
      return {
        icon: '🎉', title: `A ${pick(w, names)} in ${w.regions[p.loc].name}`,
        text: 'Music, food stalls and half the neighbourhood out in the street. It would be a good chance to meet people — or to rest.',
        options: [
          { id: 'join', label: `Join in and buy a round (${money(code, cur(12))})`, hint: '+relationship with several locals, a little fame', why: cash(w, p) >= cur(12) ? undefined : 'Not enough money.' },
          { id: 'mingle', label: 'Just wander and chat', hint: '+relationship with a few locals, −10 energy', why: p.energy >= 10 ? undefined : 'Too tired.' },
          { id: 'skip', label: 'Stay home and rest', hint: '+10 energy' },
        ],
        data: { code },
      };
    },
    resolve: (w, p, o, d) => {
      const crowd = locals(w, p).slice(0, 30);
      if (o === 'join') { pay(w, cref(p.id), hhref(controller(w.regions[p.loc])), d.code, cur(12), 'Festival'); let k = 0; for (const c of crowd) if (chance(w, 0.4)) { adjustRel(c, p.id, 5); k++; } p.sec.fame += 0.4; return `A great night. ${k} locals will remember you fondly.`; }
      if (o === 'mingle') { p.energy -= 10; let k = 0; for (const c of crowd) if (chance(w, 0.2)) { adjustRel(c, p.id, 3); k++; } return `You met ${k} people.`; }
      p.energy = Math.min(maxEnergy(w, p), p.energy + 10); return 'A quiet evening in. You feel rested.';
    },
  },
  {
    id: 'friendLoan', weight: 2,
    make: (w, p) => {
      const f = Object.values(w.citizens).find((c) => !c.player && (c.rel[p.id] ?? 0) >= 30 && c.loc === p.loc && cash(w, c) < cur(50));
      if (!f) return null;
      const code = curOf(w, p.loc);
      const amt = cur(randInt(w, 4, 10) * 10);
      return {
        icon: '🤝', title: `${f.name} asks for a loan`,
        text: `Your friend ${f.name} needs ${money(code, amt)} to cover rent. They promise to pay you back with a little extra in a week.`,
        options: [
          { id: 'lend', label: `Lend ${money(code, amt)}`, hint: 'repaid with 10% interest in 7 days — if they can', why: cash(w, p) >= amt ? undefined : 'Not enough money.' },
          { id: 'gift', label: 'Give them half, no strings', hint: '+big relationship', why: cash(w, p) >= amt / 2 ? undefined : 'Not enough money.' },
          { id: 'no', label: 'Say no', hint: '−relationship' },
        ],
        data: { f: f.id, amt, code },
      };
    },
    resolve: (w, p, o, d) => {
      const f = w.citizens[d.f];
      if (o === 'lend') { pay(w, cref(p.id), cref(f.id), d.code, d.amt, 'Loan to a friend'); schedule(w, w.time + 7 * DAY, 'encounterRepay', { from: f.id, to: p.id, code: d.code, amt: Math.round(d.amt * 1.1) }); adjustRel(f, p.id, 8); return `${f.name} will pay you back on day ${today(w) + 7}.`; }
      if (o === 'gift') { pay(w, cref(p.id), cref(f.id), d.code, Math.floor(d.amt / 2), 'Gift to a friend'); adjustRel(f, p.id, 18); return `${f.name} is moved. That's what friends are for.`; }
      adjustRel(f, p.id, -8); return `${f.name} understands, but it stings.`;
    },
  },
  // ---------- work and business ----------
  {
    id: 'raise', weight: 3,
    make: (w, p) => {
      const co = myCompanies(w, p).find((x) => x.workers.length >= 2 && x.offer);
      if (!co) return null;
      const worker = w.citizens[co.workers[0]];
      if (!worker) return null;
      const code = curOf(w, co.region);
      const wage = co.offer!.wage;
      return {
        icon: '💼', title: `The staff at ${co.name} want a raise`,
        text: `${worker.name} speaks for the ${co.workers.length} workers at ${co.name}: prices are up and ${money(code, wage)} a shift doesn't go far. They ask for 15% more.`,
        options: [
          { id: 'full', label: `Raise wages 15% (${money(code, Math.round(wage * 1.15))})`, hint: '+loyalty from every worker, higher costs' },
          { id: 'half', label: `Meet them halfway (+7%)`, hint: 'mild approval' },
          { id: 'no', label: 'Refuse: the business can’t afford it', hint: '−relationship; some may quit' },
        ],
        data: { co: co.id },
      };
    },
    resolve: (w, p, o, d) => {
      const co = w.companies[d.co];
      if (!co?.offer) return 'The company no longer exists.';
      const staff = co.workers.map((id) => w.citizens[id]).filter(Boolean);
      if (o === 'full' || o === 'half') { const m = o === 'full' ? 1.15 : 1.07; setOffer(w, p.id, co.id, Math.round(co.offer.wage * m), co.offer.slots, co.offer.minEco); for (const s of staff) adjustRel(s, p.id, o === 'full' ? 12 : 5); return `New wage ${fmtAmt(curOf(w, co.region), co.offer.wage)}. The staff are ${o === 'full' ? 'delighted' : 'satisfied'}.`; }
      let quit = 0;
      for (const s of staff) { adjustRel(s, p.id, -10); if (chance(w, 0.2)) { co.workers = co.workers.filter((x) => x !== s.id); s.job = null; quit++; } }
      return quit ? `${quit} worker${quit > 1 ? 's' : ''} walked out.` : 'They grumble and go back to work.';
    },
  },
  {
    id: 'buyout', weight: 1.5,
    make: (w, p) => {
      const co = myCompanies(w, p)[0];
      if (!co) return null;
      const value = companyValue(w, co);
      const buyer = Object.values(w.citizens).find((c) => !c.player && (c.persona === 'industrialist' || c.persona === 'investor') && c.nation === controller(w.regions[co.region]) && (c.wallet[GOLD] ?? 0) > value * 1.3);
      if (!buyer) return null;
      const offer = Math.round(value * rand(w, 1.05, 1.35));
      return {
        icon: '🏢', title: `An offer for ${co.name}`,
        text: `${buyer.name}, a local ${buyer.persona}, wants to buy ${co.name} outright for ${fmtAmt(GOLD, offer)} (your accountant values it at ${fmtAmt(GOLD, value)}).`,
        options: [
          { id: 'sell', label: `Sell for ${fmtAmt(GOLD, offer)}`, hint: 'the company, its stock and staff pass to them' },
          { id: 'counter', label: `Hold out for ${fmtAmt(GOLD, Math.round(offer * 1.3))}`, hint: 'they may walk away' },
          { id: 'no', label: 'Not for sale', hint: 'no change' },
        ],
        data: { co: co.id, buyer: buyer.id, offer },
      };
    },
    resolve: (w, p, o, d) => {
      const co = w.companies[d.co];
      const b = w.citizens[d.buyer];
      if (!co || co.owner.id !== p.id) return 'The deal fell through.';
      const price = o === 'counter' ? Math.round(d.offer * 1.3) : d.offer;
      if (o === 'no') { adjustRel(b, p.id, -2); return `${b.name} shrugs: “If you change your mind…”`; }
      if (o === 'counter' && chance(w, 0.55 - b.traits.greed * 0.3)) { adjustRel(b, p.id, -5); return `${b.name} walked away from the table.`; }
      if ((b.wallet[GOLD] ?? 0) < price) return `${b.name} couldn't raise the money after all.`;
      pay(w, cref(b.id), cref(p.id), GOLD, price, `Purchase of ${co.name}`);
      transferCompany(w, co, cref(b.id), price);
      record(w, 'company', `🏢 ${p.name} sold ${co.name} to ${b.name} for ${fmtAmt(GOLD, price)}.`, { cit: p.id, region: co.region, player: true });
      return `Sold. ${fmtAmt(GOLD, price)} is in your account.`;
    },
  },
  {
    id: 'pitch', weight: 2,
    make: (w, p) => {
      const f = locals(w, p).find((c) => (c.persona === 'industrialist' || c.persona === 'merchant') && c.nation === p.nation);
      if (!f || (p.wallet[GOLD] ?? 0) < g(3)) return null;
      const stake = g(Math.min(20, Math.max(2, Math.round((p.wallet[GOLD] ?? 0) / 1000 / 4))));
      const idea = pick(w, ['a bakery chain', 'a trucking company', 'a new mine', 'an import business', 'a factory expansion', 'a chain of cafés']);
      return {
        icon: '📈', title: `${f.name} has a business idea`,
        text: `${f.name} wants partners for ${idea} in ${w.regions[f.home].name}. They're asking for ${fmtAmt(GOLD, stake)} and promise a share of the profits within a few weeks. They seem ${f.traits.ambition > 0.6 ? 'driven' : 'a little vague'}.`,
        options: [
          { id: 'invest', label: `Invest ${fmtAmt(GOLD, stake)}`, hint: 'returns between nothing and double, in 10–20 days' },
          { id: 'no', label: 'Politely decline', hint: 'no change' },
        ],
        data: { f: f.id, stake },
      };
    },
    resolve: (w, p, o, d) => {
      const f = w.citizens[d.f];
      if (o !== 'invest') return `${f.name} will find someone else.`;
      pay(w, cref(p.id), cref(f.id), GOLD, d.stake, 'Investment');
      const mult = Math.max(0, rand(w, -0.2, 1.4) + f.traits.ambition * 0.5 + p.attrs.luck * 0.01);
      schedule(w, w.time + randInt(w, 10, 20) * DAY, 'encounterRepay', { from: f.id, to: p.id, code: GOLD, amt: Math.round(d.stake * mult), invest: true });
      adjustRel(f, p.id, 10);
      return `You're a partner now. ${f.name} will report back in a couple of weeks.`;
    },
  },
  {
    id: 'poach', weight: 2,
    make: (w, p) => {
      if (p.job == null) return null;
      const cur_ = w.companies[p.job];
      const co = companiesIn(w, p.loc).filter((x) => x.id !== p.job && x.offer && x.workers.length < x.offer.slots && cur_?.offer && x.offer.wage > cur_.offer.wage * 1.1 && !(x.owner.k === 'cit' && x.owner.id === p.id))[0];
      if (!co || co.owner.k !== 'cit') return null;
      const boss = w.citizens[co.owner.id];
      return {
        icon: '🧑‍💼', title: 'A better job offer',
        text: `${boss?.name ?? 'The owner'} of ${co.name} has heard good things about you and offers ${money(curOf(w, co.region), co.offer!.wage)} a shift — more than you make now.`,
        options: [{ id: 'take', label: `Accept and move to ${co.name}`, hint: 'better pay; your old boss won’t be pleased' }, { id: 'no', label: 'Stay loyal', hint: '+relationship with your current boss' }],
        data: { co: co.id, old: p.job },
      };
    },
    resolve: (w, p, o, d) => {
      const old = w.companies[d.old];
      const oldBoss = old?.owner.k === 'cit' ? w.citizens[old.owner.id] : null;
      if (o === 'take') { const r = applyJob(w, p, d.co); if (oldBoss) adjustRel(oldBoss, p.id, -8); return r.msg; }
      if (oldBoss) adjustRel(oldBoss, p.id, 8);
      return 'Your boss hears about it and appreciates the loyalty.';
    },
  },
  {
    id: 'inspector', weight: 1.5,
    make: (w, p) => {
      const co = myCompanies(w, p).find((x) => w.regions[x.region].pollution > 0.5);
      if (!co) return null;
      const code = curOf(w, co.region);
      const fine = cur(randInt(w, 30, 80));
      return {
        icon: '🧑‍🔬', title: 'An environmental inspector calls',
        text: `An inspector from ${w.regions[co.region].name} says ${co.name} is breaking pollution limits (air quality ${Math.round((1 - w.regions[co.region].pollution) * 100)}%). The fine is ${money(code, fine)}.`,
        options: [
          { id: 'pay', label: `Pay the fine (${money(code, fine)})`, hint: 'goes to the state treasury', why: (co.wallet[code] ?? 0) + cash(w, p) >= fine ? undefined : 'Not enough money.' },
          { id: 'bribe', label: `Slip them ${money(code, Math.round(fine / 3))} to look away`, hint: 'cheaper; risk of a bribery case' },
          { id: 'contest', label: 'Contest it', hint: 'win or pay double' },
        ],
        data: { co: co.id, code, fine },
      };
    },
    resolve: (w, p, o, d) => {
      const co = w.companies[d.co];
      if (!co) return 'The company is gone.';
      const payFrom = (amt: number, why: string) => { const from = (co.wallet[d.code] ?? 0) >= amt ? coref(co.id) : cref(p.id); pay(w, from, w.govs[co.region] ? regref(co.region) : hhref(controller(w.regions[co.region])), d.code, amt, why); };
      if (o === 'pay') { payFrom(d.fine, 'Pollution fine'); return 'Fine paid. The inspector leaves satisfied.'; }
      if (o === 'bribe') { payFrom(Math.round(d.fine / 3), 'Inspection “fee”'); p.sec.heat = Math.min(100, p.sec.heat + 10); if (chance(w, 0.35)) { openCase(w, p, 'bribery', co.region, 30, 0); return 'The inspector took the money — and reported you. A bribery investigation is open.'; } return 'The inspector pockets it and forgets the visit.'; }
      if (chance(w, 0.4 + p.attrs.lead * 0.01)) return 'The tribunal threw the fine out. Victory.';
      payFrom(d.fine * 2, 'Pollution fine (doubled on appeal)'); return 'You lost the appeal and paid double.';
    },
  },
  // ---------- politics ----------
  {
    id: 'townhall', weight: 3,
    make: (w, p) => {
      if (p.level < B.politics.voteLevel || (p.influence < 8 && !playerCandidacy(w))) return null;
      const top = localIssues(w, p.loc)[0];
      const asker = locals(w, p).find((c) => c.nation === p.nation);
      if (!asker) return null;
      const info = ISSUE_INFO[top.issue];
      return {
        icon: '🎤', title: 'A question from the crowd',
        text: `At a public meeting in ${w.regions[p.loc].name}, ${asker.name} stands up: “What are you going to do about ${info.name.toLowerCase()}? (${top.why})” Every eye turns to you.`,
        options: [
          { id: 'bold', label: `“${info.pitch} — I promise.”`, hint: '+influence and pledges from those who care; people remember promises' },
          { id: 'honest', label: '“There’s no quick fix, but here is my plan…”', hint: 'steady +relationship with the thoughtful' },
          { id: 'deflect', label: 'Change the subject', hint: '−influence' },
        ],
        data: { asker: asker.id, issue: top.issue },
      };
    },
    resolve: (w, p, o, d) => {
      const crowd = locals(w, p).filter((c) => c.nation === p.nation).slice(0, 40);
      if (o === 'bold') { p.influence += 2.5; let k = 0; for (const c of crowd) if (chance(w, 0.35)) { adjustRel(c, p.id, 4); if (playerCandidacy(w) && chance(w, 0.25)) { c.flags.pledge = p.id; c.flags.pledgeDay = today(w); k++; } } p.flags.promise = 1; return `Applause. +2.5 influence${k ? `, ${k} promised you their vote` : ''}.`; }
      if (o === 'honest') { p.influence += 1; for (const c of crowd) if (chance(w, 0.25)) adjustRel(c, p.id, 3); adjustRel(w.citizens[d.asker], p.id, 6); return 'A thoughtful answer. The room respects it.'; }
      p.influence = Math.max(0, p.influence - 1.5); return 'Murmurs in the hall. It came across as evasive (−1.5 influence).';
    },
  },
  {
    id: 'donor', weight: 2,
    make: (w, p) => {
      const cand = playerCandidacy(w);
      if (!cand) return null;
      const d = Object.values(w.citizens).find((c) => !c.player && c.nation === p.nation && (c.persona === 'industrialist' || c.persona === 'investor') && (c.wallet[w.nations[p.nation].cur] ?? 0) > cur(400));
      if (!d) return null;
      const code = w.nations[p.nation].cur;
      const amt = cur(randInt(w, 10, 25) * 10);
      return {
        icon: '💰', title: 'A generous donor',
        text: `${d.name}, one of the wealthiest people around, offers ${money(code, amt)} for your campaign for ${cand.label}. “All I ask is that you remember your friends when you win.”`,
        options: [
          { id: 'take', label: `Accept ${money(code, amt)}`, hint: 'campaign money; journalists and police may take an interest' },
          { id: 'clean', label: 'Accept only a small, declared donation', hint: `${money(code, Math.round(amt / 5))}, no strings` },
          { id: 'no', label: 'Refuse — you can’t be bought', hint: '+fame; they won’t forget the snub' },
        ],
        data: { d: d.id, amt, code, region: cand.region },
      };
    },
    resolve: (w, p, o, d) => {
      const donor = w.citizens[d.d];
      const s = d.region != null ? w.govs[d.region] : null;
      const me = s?.candidates.find((x) => x.cit === p.id);
      if (o === 'take' || o === 'clean') {
        const amt = o === 'take' ? d.amt : Math.round(d.amt / 5);
        const ok_ = pay(w, cref(donor.id), cref(p.id), d.code, Math.min(amt, donor.wallet[d.code] ?? 0), 'Campaign donation');
        if (me) me.campaign += amt;
        adjustRel(donor, p.id, o === 'take' ? 15 : 3);
        if (o === 'take') { p.sec.heat = Math.min(100, p.sec.heat + 6); if (chance(w, 0.25)) { openCase(w, p, 'corruption', p.loc, 20, amt); return 'The money is welcome — but a reporter is asking questions, and the police have opened a file.'; } }
        return ok_ ? `${fmtAmt(d.code, amt)} for the campaign.` : 'The donor could not pay after all.';
      }
      p.sec.fame += 1; adjustRel(donor, p.id, -12); return 'Word of your refusal spreads. Some admire it; your would-be donor does not.';
    },
  },
  {
    id: 'petition', weight: 2,
    make: (w, p) => {
      const top = localIssues(w, p.loc).find((x) => x.issue === 'health' || x.issue === 'crime' || x.issue === 'pollution');
      if (!top || top.severity < 0.35) return null;
      const lead = locals(w, p).find((c) => c.nation === p.nation);
      if (!lead) return null;
      const want = top.issue === 'health' ? 'a new hospital' : top.issue === 'crime' ? 'more police on the streets' : 'limits on factory emissions';
      return {
        icon: '📝', title: 'A petition',
        text: `${lead.name} is collecting signatures in ${w.regions[p.loc].name} demanding ${want}. (${top.why})`,
        options: [
          { id: 'sign', label: 'Sign it', hint: '+relationship with those who care' },
          { id: 'lead', label: 'Put your name at the top and deliver it', hint: '−20 energy, +influence, pressure on the regional government', why: p.energy >= 20 ? undefined : 'Too tired.' },
          { id: 'no', label: 'Walk past', hint: 'no change' },
        ],
        data: { lead: lead.id, issue: top.issue },
      };
    },
    resolve: (w, p, o, d) => {
      const s = w.govs[p.loc];
      if (o === 'sign') { adjustRel(w.citizens[d.lead], p.id, 5); return 'Your signature joins hundreds of others.'; }
      if (o === 'lead') {
        p.energy -= 20; p.influence += 1.5;
        for (const c of locals(w, p).slice(0, 30)) if (chance(w, 0.3)) adjustRel(c, p.id, 3);
        if (s) { if (d.issue === 'crime') s.budget.police = Math.min(0.6, s.budget.police + 0.05); if (d.issue === 'health') s.budget.welfare = Math.min(0.6, s.budget.welfare + 0.05); s.approval = Math.max(0, s.approval - 2); }
        return `You delivered the petition to ${s ? `the ${s.head.name ? `office of ${s.head.name}` : 'regional government'}` : 'the authorities'}. They have shifted their budget a little. +1.5 influence.`;
      }
      return 'You walk on.';
    },
  },
  // ---------- crime ----------
  {
    id: 'mugging', weight: 2,
    make: (w, p) => {
      const r = w.regions[p.loc];
      if (r.crime < 30 || cash(w, p) < cur(20) || !chance(w, r.crime / 100)) return null;
      const code = curOf(w, p.loc);
      return {
        icon: '🔪', title: 'Mugged!',
        text: `Walking home through ${r.name} after dark, a figure steps out of an alley: “Wallet. Now.”`,
        options: [
          { id: 'fight', label: 'Fight back', hint: `win on strength (${p.attrs.str} STR, power ${p.power.toFixed(0)}) — or get hurt` },
          { id: 'give', label: 'Hand it over', hint: `lose up to ${money(code, Math.min(cash(w, p) * 0.25, cur(60)) | 0)}` },
          { id: 'shout', label: 'Shout for the police', hint: `police strength here: ${Math.round(r.police)}/100` },
        ],
        data: { code },
      };
    },
    resolve: (w, p, o, d) => {
      const r = w.regions[p.loc];
      const loss = Math.floor(Math.min(cash(w, p) * 0.25, cur(60)));
      const lose = (m: number) => pay(w, cref(p.id), hhref(controller(r)), d.code, Math.floor(m), 'Mugged');
      if (o === 'fight') {
        if (chance(w, Math.min(0.85, 0.3 + p.attrs.str * 0.03 + p.power / 400))) { p.sec.fame += 0.5; addXp(w, p, 5); return 'You sent them running. A few onlookers cheer.'; }
        lose(loss * 1.5); p.energy = Math.max(0, p.energy - 25); return 'You lost the fight — and more money than if you had just handed it over. −25 energy.';
      }
      if (o === 'shout') { if (chance(w, r.police / 110)) return 'Sirens! The mugger bolts before taking anything.'; lose(loss); return 'Nobody came. The mugger took your cash.'; }
      lose(loss); return `You handed over ${fmtAmt(d.code, loss)}. At least you're unharmed.`;
    },
  },
  {
    id: 'fence', weight: 1.5,
    make: (w, p) => {
      const crook = locals(w, p).find((c) => c.sec.syndicate != null && w.syndicates[c.sec.syndicate]);
      if (!crook) return null;
      const code = curOf(w, p.loc);
      const price = cur(randInt(w, 30, 60));
      return {
        icon: '📦', title: 'Something fell off a truck',
        text: `A man who says his name is ${crook.name.split(' ')[0]} opens a car boot: a crate of military-grade rifles (Q2), “no questions asked”, for ${money(code, price)}.`,
        options: [
          { id: 'buy', label: `Buy the crate (${money(code, price)})`, hint: '+8 Q2 weapons, police attention', why: cash(w, p) >= price ? undefined : 'Not enough money.' },
          { id: 'no', label: 'Walk away', hint: 'no change' },
          { id: 'report', label: 'Report him to the police', hint: 'helps the investigation; his friends won’t like it' },
        ],
        data: { crook: crook.id, price, code },
      };
    },
    resolve: (w, p, o, d) => {
      const crook = w.citizens[d.crook];
      if (o === 'buy') { pay(w, cref(p.id), cref(crook.id), d.code, d.price, 'Stolen goods'); produce(w, cref(p.id), 'wg:2', 8, 'stolen goods'); p.sec.heat = Math.min(100, p.sec.heat + 12); adjustRel(crook, p.id, 8); return 'You load the crate. Better not ask where it came from.'; }
      if (o === 'report') { openCase(w, crook, 'smuggling', p.loc, 45, 0); adjustRel(crook, p.id, -40); const s = w.syndicates[crook.sec.syndicate ?? -1]; if (s?.boss != null && w.citizens[s.boss]) adjustRel(w.citizens[s.boss], p.id, -20); p.sec.fame += 0.5; return `The police open a smuggling case against ${crook.name}. ${s ? `The ${s.name} will remember this.` : ''}`; }
      return 'You keep walking.';
    },
  },
  // ---------- war and crisis ----------
  {
    id: 'recruiter', weight: 2,
    make: (w, p) => {
      if (p.mil.branch || !activeWars(w).some((x) => x.att === p.nation || x.def === p.nation) || enlistCheck(w, p, 'army')) return null;
      return {
        icon: '🎖️', title: 'Your country needs you',
        text: `A recruiting sergeant has set up a table in ${w.regions[p.loc].name}. “We're at war. Every able body counts. Army, navy or air force — take your pick.”`,
        options: [
          { id: 'army', label: 'Join the army', hint: 'a rank, duties and service points; +relationship with patriots' },
          { id: 'air', label: 'Join the air force', hint: 'as above' },
          { id: 'no', label: 'Not today', hint: 'some patriots will think less of you' },
        ],
        data: {},
      };
    },
    resolve: (w, p, o) => {
      if (o === 'army' || o === 'air') { const r = enlist(w, p, o); for (const c of locals(w, p).filter((x) => x.ideo === 'nationalism' || x.ideo === 'imperialism').slice(0, 10)) adjustRel(c, p.id, 3); return r.msg; }
      for (const c of locals(w, p).filter((x) => x.ideo === 'nationalism' || x.ideo === 'imperialism').slice(0, 10)) adjustRel(c, p.id, -2);
      return 'You decline.';
    },
  },
  {
    id: 'crisis', weight: 3,
    make: (w, p) => {
      const cr = activeCrises(w).find((c) => c.regions.includes(p.loc) && c.kind !== 'strike' && c.kind !== 'boom' && c.kind !== 'shock' && c.kind !== 'protest' && c.kind !== 'riot');
      if (!cr) return null;
      const code = curOf(w, p.loc);
      return {
        icon: '🚨', title: `${cr.name} hits ${w.regions[p.loc].name}`,
        text: `The ${cr.name} has reached your area. Relief workers are overwhelmed and people are asking for help.`,
        options: [
          { id: 'volunteer', label: 'Volunteer with the relief effort', hint: 'energy for relief; +fame, +relationship' },
          { id: 'donate', label: `Donate ${money(code, cur(25))}`, hint: 'funds the relief', why: cash(w, p) >= cur(25) ? undefined : 'Not enough money.' },
          { id: 'no', label: 'Look after yourself', hint: 'no change' },
        ],
        data: { cr: cr.id },
      };
    },
    resolve: (w, p, o, d) => {
      if (o === 'volunteer') return volunteer(w, p, d.cr).msg;
      if (o === 'donate') return donate(w, p, d.cr, cur(25)).msg;
      return 'You stay indoors until it passes.';
    },
  },
  {
    id: 'protest', weight: 2,
    make: (w, p) => {
      if (w.regions[p.loc].unrest < 45 || joinProtestCheck(w, p)) return null;
      return {
        icon: '📢', title: 'Protest in the square',
        text: `Thousands are marching through ${w.regions[p.loc].name} against the government. The mood is tense; police line the streets.`,
        options: [
          { id: 'join', label: 'March with them', hint: '+relationship with the discontented, police attention' },
          { id: 'speak', label: 'Speak to the crowd and call for calm', hint: '+influence if it works; boos if it doesn’t' },
          { id: 'no', label: 'Stay away', hint: 'no change' },
        ],
        data: {},
      };
    },
    resolve: (w, p, o) => {
      if (o === 'join') return joinProtest(w, p).msg;
      if (o === 'speak') { if (chance(w, 0.35 + p.attrs.lead * 0.02 + p.influence / 300)) { p.influence += 2; w.regions[p.loc].unrest = Math.max(0, w.regions[p.loc].unrest - 3); return 'The crowd quiets and listens. Tensions ease a little (+2 influence).'; } p.influence = Math.max(0, p.influence - 1); return 'You were drowned out by boos (−1 influence).'; }
      return 'You watch from a distance.';
    },
  },
  {
    id: 'rival', weight: 2,
    make: (w, p) => {
      const r = p.sec.rivals.map((id) => w.citizens[id]).find((c) => c && !jailed(w, c));
      if (!r) return null;
      return {
        icon: '😠', title: `${r.name} attacks you in public`,
        text: `Your rival ${r.name} gave a speech calling you ${pick(w, ['a fraud', 'out of touch', 'dangerous', 'a crook', 'a nobody'])}. The papers are running it.`,
        options: [
          { id: 'debate', label: 'Challenge them to a public debate', hint: `leadership ${p.attrs.lead} vs theirs ${r.attrs.lead}: winner takes influence` },
          { id: 'highroad', label: 'Take the high road', hint: 'small influence loss, +fame' },
          { id: 'dirt', label: 'Leak something embarrassing about them', hint: 'hurts them; you may be traced' },
        ],
        data: { r: r.id },
      };
    },
    resolve: (w, p, o, d) => {
      const r = w.citizens[d.r];
      if (o === 'debate') { if (chance(w, 0.5 + (p.attrs.lead - r.attrs.lead) * 0.03 + (p.influence - r.influence) / 400)) { p.influence += 3; r.influence = Math.max(0, r.influence - 3); return `You won the debate. ${r.name} looked flustered (+3 influence).`; } p.influence = Math.max(0, p.influence - 2); r.influence += 2; return `${r.name} got the better of you (−2 influence).`; }
      if (o === 'highroad') { p.influence = Math.max(0, p.influence - 0.5); p.sec.fame += 1; return 'You refused to stoop. Some voters noticed.'; }
      r.influence = Math.max(0, r.influence - 4); r.sec.notoriety += 2;
      if (chance(w, 0.3)) { p.sec.notoriety += 3; adjustRel(r, p.id, -20); return `The story damaged ${r.name} — but the leak was traced back to you.`; }
      return `The story ran. ${r.name} is on the back foot (−4 influence for them).`;
    },
  },
  {
    id: 'windfall', weight: 0.6,
    make: (w, p) => ({
      icon: '📜', title: 'A letter from a lawyer',
      text: 'A distant relative you barely remember has died and named you in their will. The lawyer asks how you want the estate handled.',
      options: [
        { id: 'gold', label: 'Take it in gold', hint: 'a few gold coins' },
        { id: 'charity', label: 'Give it to a local charity', hint: '+fame, +relationship with neighbours' },
      ],
      data: { gold: g(rand(w, 1, 4) + p.attrs.luck * 0.1) },
    }),
    resolve: (w, p, o, d) => {
      if (o === 'gold') { mint(w, cref(p.id), GOLD, Math.round(d.gold), 'Inheritance'); return `${fmtAmt(GOLD, Math.round(d.gold))} is yours.`; }
      p.sec.fame += 1.5; for (const c of residents(w, p.loc).slice(0, 20)) if (!c.player) adjustRel(c, p.id, 2); return 'The charity names a room after your relative. Your neighbours are touched.';
    },
  },
];

// ---------- engine ----------

/** Hourly: maybe present an encounter (about one a day, never while one is waiting). */
export function encountersHourly(w: World) {
  const p = player(w);
  if (!p) return;
  const ps = w.player;
  if (ps.encounter) {
    // Unanswered for a day: the moment passes (first option that has no cost).
    if (w.time - ps.encounter.t > DAY) { logEncounter(w, ps.encounter.title, 'You let the moment pass.'); ps.encounter = null; }
    return;
  }
  if (jailed(w, p) || p.mining) return;
  if (ps.nextEncounter == null) { ps.nextEncounter = w.time + randInt(w, 6, 18) * HOUR; return; }
  if (w.time < ps.nextEncounter) return;
  const h = Math.floor((w.time % DAY) / HOUR);
  if (h < 8 || h > 22) return; // not in the middle of the night
  ps.nextEncounter = w.time + randInt(w, 14, 34) * HOUR;
  const recent = new Set((ps.encounterLog ?? []).slice(-4).map((e) => e.title));
  let pool = T.slice();
  for (let tries = 0; tries < 5 && pool.length; tries++) {
    const tpl = weighted(w, pool, (t) => t.weight)!;
    pool = pool.filter((t) => t !== tpl);
    const e = tpl.make(w, p);
    if (!e || recent.has(e.title)) continue;
    present(w, tpl.id, e);
    return;
  }
}

function present(w: World, kind: string, e: Omit<Encounter, 'id' | 't' | 'kind'>) {
  w.player.encounter = { ...e, id: nid(w), t: w.time, kind };
  notify(w, 'encounter', `${e.icon} ${e.title}`, { link: 'dashboard' });
}

/** Present a specific encounter now if it can happen (tests, admin). */
export function triggerEncounter(w: World, kind: string): Result {
  const tpl = T.find((t) => t.id === kind);
  if (!tpl) return fail('Unknown encounter.');
  const e = tpl.make(w, player(w));
  if (!e) return fail('That situation cannot happen right now.');
  present(w, kind, e);
  return ok(e.title);
}

function logEncounter(w: World, title: string, outcome: string) {
  const log = (w.player.encounterLog ??= []);
  log.push({ t: w.time, title, outcome });
  if (log.length > 40) log.splice(0, log.length - 40);
}

/** Choose an option in the waiting encounter. */
export function resolveEncounter(w: World, optId: string): Result {
  const p = player(w);
  const e = w.player.encounter;
  if (!e) return fail('Nothing is waiting for you.');
  const opt = e.options.find((o: Opt) => o.id === optId);
  if (!opt) return fail('Choose one of the options.');
  if (opt.why) return fail(opt.why);
  const tpl = T.find((t) => t.id === e.kind);
  w.player.encounter = null;
  const outcome = tpl ? tpl.resolve(w, p, optId, e.data) : 'Nothing happens.';
  logEncounter(w, e.title, `${opt.label} — ${outcome}`);
  addXp(w, p, 2);
  return ok(outcome);
}

/** Scheduled repayments of loans and investments made in encounters. */
HANDLERS.encounterRepay = (w, d) => {
  const from = w.citizens[d.from];
  const to = w.citizens[d.to];
  if (!from || !to) return;
  const have = from.wallet[d.code] ?? 0;
  const amt = Math.min(d.amt, have);
  if (amt > 0 && (from.traits.loyalty > 0.25 || chance(w, 0.5))) {
    pay(w, cref(from.id), cref(to.id), d.code, amt, d.invest ? 'Investment returns' : 'Loan repayment');
    if (to.player) notify(w, 'personal', `💸 ${from.name} ${d.invest ? `paid out your share: ${fmtAmt(d.code, amt)}` : `repaid ${fmtAmt(d.code, amt)}`}.`, { link: 'inventory' });
    adjustRel(from, to.id, 3);
  } else if (to.player) {
    notify(w, 'personal', `😞 ${from.name} ${d.invest ? 'says the venture failed — your stake is gone' : 'could not repay the loan'}.`, { link: 'people' });
    adjustRel(from, to.id, -5);
  }
};

export const ENCOUNTER_KINDS = T.map((t) => t.id);
