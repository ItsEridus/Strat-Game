// Stories of diplomacy completed (3.1): a firm hit by a partner's tariffs, a smuggler's offer on a
// sanctioned border, a great power courting a hedging government, and the call to stand for
// Secretary-General. They act through the normal rules (tariffs, syndicates, spheres, the UN).
import type { Ctx } from '../../sim/story';
import { dayOf } from '../../engine/clock';
import { pay } from '../../engine/ledger';
import { c as cur, fmtAmt } from '../../engine/money';
import { chance } from '../../engine/rng';
import { controller, cref, jailed, syndref } from '../../sim/query';
import { lifeOf } from '../../sim/lifecycle';
import { relation } from '../../sim/congress';
import { setTariff, tariffOn } from '../../sim/tradePolicy';
import { conductsDiplomacy } from '../../sim/diplomacyActions';
import { hedging } from '../../sim/spheres';
import { offerTreaty } from '../../sim/treaties';
import { secGen, standCheck, standForSg } from '../../sim/unSystem';
import { done, single } from './kit';

const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };

export const DIPLOMACY2_STORIES = [
  single({
    id: 'dip2.tariffs', icon: '🧾', tags: ['work', 'economy'], weight: 5, cooldownDays: 180,
    title: (c) => `${c.str('country')}'s tariffs reach the shop floor`,
    bind: (w, p) => {
      if (p.job == null || jailed(w, p)) return null;
      const co = w.companies[p.job];
      if (!co) return null;
      const home = controller(w.regions[co.region]);
      const o = w.nations.find((x) => x.id !== home && !x.exile && tariffOn(w, x.id, home) >= 25);
      return o ? { bind: { o: o.id }, key: `tariffs:${o.id}:${Math.floor(dayOf(w.time) / 180)}`, data: { country: o.name, rate: tariffOn(w, o.id, home), firm: co.name } } : null;
    },
    text: (c) => `At ${c.str('firm')}, the orders from ${c.str('country')} have dried up since its ${c.num('rate')}% tariff. There is talk of short hours.`,
    choices: (c) => [
      { id: 'lobby', label: 'Write to your representative', hint: 'a voice in the trade debate', run: (c) => { c.p.influence += 1; mood(c, 1, -1); return done('A careful letter, with figures. A form reply comes back, and then, weeks later, a real one.'); } },
      ...(conductsDiplomacy(c.w.nations[c.p.nation], c.p.id) ? [{ id: 'retaliate', label: 'Answer in kind', hint: 'a matching tariff; a trade war', run: (c: Ctx) => { setTariff(c.w, c.w.nations[c.p.nation], c.w.nations[c.num('o')], c.num('rate')); return done('A matching tariff, announced at a factory gate. The workers cheer; the economists wince.'); } }] : []),
      { id: 'shrug', label: 'Keep your head down', hint: 'and hope', run: (c) => { mood(c, -1, 3); return done('You take the extra shifts while there are any.'); } },
    ],
  }),
  single({
    id: 'dip2.smuggler', icon: '📦', tags: ['crime'], weight: 4, cooldownDays: 120,
    title: () => 'A van, a border, no questions',
    bind: (w, p) => {
      if (jailed(w, p) || p.sec.notoriety < 0) return null;
      const here = controller(w.regions[p.loc]);
      const n = w.nations[here];
      const sanctioner = w.nations.find((x) => !x.exile && (x.embargoes.includes(here) || (x.tp?.sectoral[here] ?? []).length) && w.regions[p.loc].links.some((l) => controller(w.regions[l]) === x.id));
      const s = Object.values(w.syndicates).find((x) => x.nation === here && (x.home === p.loc || x.turf.includes(p.loc)) && (x.wallet[n.cur] ?? 0) > cur(200));
      return sanctioner && s ? { bind: { s: s.id, from: sanctioner.id }, key: `smug:${Math.floor(dayOf(w.time) / 120)}`, data: { synd: s.name, from: sanctioner.name } } : null;
    },
    text: (c) => `A man from ${c.str('synd')} buys you a coffee. Goods from ${c.str('from')} are banned here, and he needs a driver with a clean licence for one run across the border. The pay is good.`,
    choices: () => [
      { id: 'drive', label: 'Drive', hint: 'good money; it is a crime', run: (c) => {
        const n = c.w.nations[controller(c.w.regions[c.p.loc])];
        const s = c.w.syndicates[c.num('s')];
        c.p.sec.record.crimes++;
        if (chance(c.w, 0.7)) {
          const fee = Math.min(s.wallet[n.cur] ?? 0, cur(120));
          if (fee > 0) pay(c.w, syndref(s.id), cref(c.p.id), n.cur, fee, `${s.name}: a smuggling run`);
          c.p.sec.heat = Math.min(100, c.p.sec.heat + 12); c.p.sec.notoriety += 2;
          return done(`Two hours of back roads and a nod at a quiet crossing. ${fmtAmt(n.cur, fee)}, in cash, in an envelope.`);
        }
        c.p.sec.heat = Math.min(100, c.p.sec.heat + 30); mood(c, -3, 10);
        return done('A customs patrol waves you down. You talk your way out of it, just, but they took your number.');
      } },
      { id: 'no', label: 'Finish your coffee and leave', hint: 'nothing ventured', run: () => done('"Pity," he says, and pays for the coffee anyway.') },
    ],
  }),
  single({
    id: 'dip2.courted', icon: '⚖️', tags: ['politics'], weight: 5, cooldownDays: 365,
    title: (c) => `${c.str('power')} comes courting`,
    bind: (w, p) => {
      const n = w.nations[p.nation];
      if (!conductsDiplomacy(n, p.id)) return null;
      const h = hedging(w, n.id);
      if (!h) return null;
      const power = w.nations[h[Math.floor(dayOf(w.time) / 365) % 2]], other = w.nations[h[0] === power.id ? h[1] : h[0]];
      return { bind: { pw: power.id, ot: other.id }, key: `courted:${power.id}:${Math.floor(dayOf(w.time) / 365)}`, data: { power: power.name, other: other.name } };
    },
    text: (c) => `${c.str('power')}'s ambassador comes with an offer: a defence alliance, investment, a seat at the table. All you need do is stop sitting on the fence between ${c.str('power')} and ${c.str('other')}.`,
    choices: () => [
      { id: 'join', label: `Take the offer`, hint: 'an ally, and a rival made', run: (c) => {
        const n = c.w.nations[c.p.nation], pw = c.w.nations[c.num('pw')];
        relation(c.w, n.id, pw.id, 10, 'joined our side');
        relation(c.w, n.id, c.num('ot'), -12, 'chose the other side');
        const r = offerTreaty(c.w, n, pw, 'defence');
        return done(r.ok ? `The treaty is signed in a week. ${c.str('other')} recalls its ambassador for consultations.` : `Your government agrees in principle, but ${pw.name}'s parliament stalls the treaty (${r.msg}).`);
      } },
      { id: 'hedge', label: 'Thank them, and stay on the fence', hint: 'friends with both, allied to neither', run: (c) => { relation(c.w, c.p.nation, c.num('pw'), -2, 'kept us at arm\'s length'); relation(c.w, c.p.nation, c.num('ot'), 3, 'stayed neutral'); return done('"We value our friendship with everyone." The ambassador smiles; they expected nothing else.'); } },
    ],
  }),
  single({
    id: 'dip2.sgcall', icon: '🇺🇳', tags: ['politics'], weight: 4, cooldownDays: 365,
    title: () => 'A call from New York',
    bind: (w, p) => (standCheck(w, p) == null ? { bind: {}, key: `sgcall:${secGen(w).until}`, data: { sg: secGen(w).name } } : null),
    text: (c) => `An old friend on ${c.str('sg')}'s staff rings late at night. The race for the next Secretary-General is open, and your name keeps coming up. "Will you stand?"`,
    choices: () => [
      { id: 'stand', label: 'Stand', hint: 'a long campaign; a great office', run: (c) => { const r = standForSg(c.w, c.p); mood(c, 3, 4); return done(r.ok ? 'You say yes before you can talk yourself out of it. The straw polls are in the autumn.' : r.msg); } },
      { id: 'not', label: 'Not this time', hint: 'there will be other races', run: (c) => done('"Not this time." Your friend sighs, and says they will keep your number.') },
    ],
  }),
];
