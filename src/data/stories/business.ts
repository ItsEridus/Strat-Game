// Stories of working life and business (1.5 GEO 1): the interview, payroll Friday,
// the takeover bid and the last day at the plant. Each binds real companies and acts
// through the normal rules (hiring, loans, takeovers, the ledger).
import type { Company } from '../../sim/types';
import type { Ctx } from '../../sim/story';
import { pay } from '../../engine/ledger';
import { chance } from '../../engine/rng';
import { companyCurrency, coref, cref, today } from '../../sim/query';
import { applyCheck, applyJob, setOffer } from '../../sim/company';
import { bestOffer } from '../../ai/citizens';
import { businessLoan, businessLoanCheck } from '../../sim/banking';
import { takeOver, valuation, competitionCheck } from '../../sim/mergers';
import { addHeirloom } from '../../sim/legacy';
import { ageOf, practise } from '../../sim/growth';
import { lifeOf } from '../../sim/lifecycle';
import { done, money, single, why } from './kit';

const co = (c: Ctx): Company | undefined => c.w.companies[c.num('co')];
const mood = (c: Ctx, h: number, s: number) => { const l = lifeOf(c.p); l.happiness = Math.max(0, Math.min(100, l.happiness + h)); l.stress = Math.max(0, Math.min(100, l.stress + s)); };

export const BUSINESS_STORIES = [
  single({
    id: 'biz.interview', icon: '🤝', tags: ['economy'], weight: 3, cooldownDays: 14,
    title: (c) => `An interview at ${co(c)?.name ?? 'a company'}`,
    bind: (w, p) => {
      if (p.job != null || p.post || p.business || p.retired || ageOf(w, p) < 18) return null;
      const best = bestOffer(w, p);
      return best ? { bind: { co: best.id }, key: `interview:${best.id}:${Math.floor(today(w) / 14)}`, data: {} } : null;
    },
    stale: (c) => (!co(c) ? 'The company has closed.' : c.p.job != null ? 'You found work.' : null),
    text: (c) => `${co(c)!.name} has a vacancy, and they want to see you tomorrow morning. The manager is said to be fair but sharp.`,
    choices: (c) => [
      { id: 'prepare', label: 'Prepare properly the night before', hint: '−10⚡; a strong interview', why: why(c.p.energy >= 10, 'Too tired.') ?? applyCheck(c.w, c.p, co(c)), run: (c) => { c.p.energy -= 10; practise(c.w, c.p, 'eco', 0.5); const r = applyJob(c.w, c.p, co(c)!.id); mood(c, 3, -2); return r.ok ? done(`They offer you the job on the spot. ${r.msg}`) : { text: r.msg, fail: true }; } },
      { id: 'wing', label: 'Wing it', hint: 'a coin toss', why: applyCheck(c.w, c.p, co(c)), run: (c) => { if (!chance(c.w, 0.5)) { mood(c, -3, 3); return done('It goes badly: you blank on a simple question. They thank you for your time.'); } const r = applyJob(c.w, c.p, co(c)!.id); return r.ok ? done(`It goes well enough. ${r.msg}`) : { text: r.msg, fail: true }; } },
      { id: 'negotiate', label: 'Ask for a signing bonus', hint: 'a week of pay, or no offer at all', why: applyCheck(c.w, c.p, co(c)), run: (c) => {
        const k = co(c)!;
        if (!chance(c.w, 0.4 + Math.min(0.4, c.p.eco / 50))) { mood(c, -2, 2); return done('The manager stiffens. “We will be in touch.” They are not.'); }
        const r = applyJob(c.w, c.p, k.id);
        if (!r.ok) return { text: r.msg, fail: true };
        const code = companyCurrency(c.w, k);
        const bonus = Math.min((k.offer?.wage ?? 0) * 5, k.wallet[code] ?? 0);
        if (bonus > 0) pay(c.w, coref(k.id), cref(c.p.id), code, bonus, `Signing bonus from ${k.name}`);
        mood(c, 4, -1);
        return done(`They agree. ${r.msg}${bonus ? ` A signing bonus of ${money(code, bonus)} lands in your account.` : ''}`);
      } },
      { id: 'decline', label: 'Turn it down', hint: '', run: () => done('You keep looking.') },
    ],
  }),
  single({
    id: 'biz.payroll', icon: '💸', tags: ['economy'], weight: 3, cooldownDays: 21,
    title: (c) => `Payroll Friday at ${co(c)?.name ?? 'your company'}`,
    bind: (w, p) => {
      const k = Object.values(w.companies).find((x) => x.owner.k === 'cit' && x.owner.id === p.id && x.workers.length > 0 && x.offer && (x.wallet[companyCurrency(w, x)] ?? 0) < x.offer.wage * x.workers.length * 2);
      return k ? { bind: { co: k.id }, key: `payroll:${k.id}:${Math.floor(today(w) / 21)}`, data: { code: companyCurrency(w, k), need: k.offer!.wage * k.workers.length * 5 } } : null;
    },
    stale: (c) => (!co(c) || !(co(c)!.owner.k === 'cit' && co(c)!.owner.id === c.p.id) ? 'The company is no longer yours.' : null),
    text: (c) => `The accountant looks up from the books: ${co(c)!.name} cannot cover this week's wages. ${co(c)!.workers.length} people are waiting to be paid.`,
    choices: (c) => [
      { id: 'pocket', label: `Pay from your own pocket (${money(c.str('code'), c.num('need'))})`, hint: 'the staff never know how close it was', why: why((c.p.wallet[c.str('code')] ?? 0) >= c.num('need'), 'You do not have that much.'), run: (c) => { pay(c.w, cref(c.p.id), coref(co(c)!.id), c.str('code'), c.num('need'), `Funding ${co(c)!.name}`); mood(c, -1, 3); return done('Wages go out on time. Your savings take the hit.'); } },
      { id: 'loan', label: 'Ask the bank for a business loan', hint: 'three years to repay', why: businessLoanCheck(c.w, c.p, co(c)!, c.num('need')), run: (c) => (businessLoan(c.w, c.p, co(c)!, c.num('need')) ? done('The bank agrees. The money is in the company account by noon.') : { text: 'The bank says no.', fail: true }) },
      { id: 'cut', label: 'Let one person go', hint: 'redundancy pay; the rest are paid', why: why(co(c)!.workers.length > 0, 'No one to let go.'), run: (c) => { const k = co(c)!; const r = setOffer(c.w, c.p.id, k.id, k.offer!.wage, Math.max(0, k.workers.length - 1), k.offer!.minEco); mood(c, -3, 4); return r.ok ? done('You break the news to the newest hire. The others are paid, and quiet.') : { text: r.msg, fail: true }; } },
      { id: 'late', label: 'Pay late and hope sales pick up', hint: 'your staff will remember', run: (c) => { for (const id of co(c)!.workers) { const x = c.w.citizens[id]; if (x) c.remember(x, -6, 'paid us late'); } mood(c, -1, 5); return done('Wages go out four days late. Nobody says anything to your face.'); } },
    ],
  }),
  single({
    id: 'biz.takeover', icon: '📈', tags: ['economy'], weight: 2, cooldownDays: 45,
    title: (c) => `A takeover bid for ${co(c)?.name ?? 'your company'}`,
    bind: (w, p) => {
      const k = Object.values(w.companies).find((x) => x.owner.k === 'cit' && x.owner.id === p.id && !x.locked && x.hist.slice(-30).reduce((t, h) => t + h.profit, 0) > 0);
      if (!k) return null;
      const code = companyCurrency(w, k);
      const price = Math.round(valuation(w, k) * 1.3);
      const buyer = Object.values(w.citizens).find((x) => !x.player && !x.gone && x.nation === p.nation && (x.wallet[code] ?? 0) > price * 1.2 && !competitionCheck(w, cref(x.id), k));
      return buyer ? { bind: { co: k.id, b: buyer.id }, key: `takeover:${k.id}:${Math.floor(today(w) / 45)}`, data: { code, price } } : null;
    },
    stale: (c) => (!co(c) || !(co(c)!.owner.k === 'cit' && co(c)!.owner.id === c.p.id) ? 'The company is no longer yours.' : null),
    text: (c) => `${c.cit('b')!.name} wants to buy ${co(c)!.name}, staff and all, and offers ${money(c.str('code'), c.num('price'))}: about a third more than it is worth on paper.`,
    choices: (c) => [
      { id: 'accept', label: 'Accept', hint: 'the money is yours; the company is theirs', run: (c) => { const err = takeOver(c.w, c.cit('b')!, co(c)!, c.num('price')); if (err) return { text: err, fail: true }; mood(c, 4, -3); return done(`Hands are shaken. ${money(c.str('code'), c.num('price'))} arrives the same afternoon.`); } },
      { id: 'counter', label: 'Hold out for 10% more', hint: 'they may walk away', run: (c) => { if (!chance(c.w, 0.5)) return done(`${c.cit('b')!.name} walks away. Perhaps another time.`); const err = takeOver(c.w, c.cit('b')!, co(c)!, Math.round(c.num('price') * 1.1)); if (err) return { text: err, fail: true }; mood(c, 6, -3); return done('After a tense week, they agree to your price.'); } },
      { id: 'decline', label: 'Not for sale', hint: '', run: (c) => { c.remember(c.cit('b')!, -1, 'turned down my offer for their company'); return done('You tell them the company is not for sale.'); } },
    ],
  }),
  single({
    id: 'biz.lastday', icon: '🏚️', tags: ['economy', 'social'], weight: 4, cooldownDays: 5,
    title: () => 'Last day at the plant',
    bind: (w, p) => {
      const last = p.life?.work?.slice().reverse().find((x) => x.to != null && /went bust|closed/.test(x.why ?? ''));
      return last && w.time - last.to! < 3 * 1440 ? { bind: {}, key: `lastday:${last.from}`, data: { where: last.what.replace(/^Worker at /, '') } } : null;
    },
    text: (c) => `The gates of ${c.str('where')} close for the last time. Your workmates stand around in the car park, not quite ready to go home.`,
    choices: () => [
      { id: 'drinks', label: 'Suggest one last drink together', hint: '+closeness with old colleagues', why: null, run: (c) => { mood(c, 3, -3); return done('Stories, laughter and a few tears. You promise to keep in touch.'); } },
      { id: 'keepsake', label: 'Take a keepsake', hint: 'an heirloom for your family', run: (c) => { addHeirloom(c.w, c.p, `A keepsake from ${c.str('where')}`, 'from the day it closed'); mood(c, 1, -1); return done('You take the old sign from the canteen wall. Nobody stops you.'); } },
      { id: 'search', label: 'Go straight home and start looking for work', hint: '−5⚡', run: (c) => { c.p.energy = Math.max(0, c.p.energy - 5); practise(c.w, c.p, 'eco', 0.3); return done('Three applications sent before dinner.'); } },
    ],
  }),
];
