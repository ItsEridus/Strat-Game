// All authored stories. Importing this module registers them with the engine.
import { registerStory, remember } from '../../sim/story';
import { HANDLERS } from '../../sim/hooks';
import { pay } from '../../engine/ledger';
import { fmtAmt } from '../../engine/money';
import { notify } from '../../engine/events';
import { chance } from '../../engine/rng';
import { cref } from '../../sim/query';
import { EVERYDAY } from './everyday';
import { ADOPTED } from './adopted';
import { WORK_CHAINS } from './work';
import { LIFE_CHAINS } from './life';

let done = false;
export function registerAllStories() {
  if (done) return;
  done = true;
  registerStory(...EVERYDAY, ...ADOPTED, ...WORK_CHAINS, ...LIFE_CHAINS);
}

/** Scheduled repayments of loans and investments made in stories. */
HANDLERS.encounterRepay = (w, d) => {
  const from = w.citizens[d.from];
  const to = w.citizens[d.to];
  if (!from || !to) return;
  const amt = Math.min(d.amt, from.wallet[d.code] ?? 0);
  if (amt > 0 && (from.traits.loyalty > 0.25 || chance(w, 0.5))) {
    pay(w, cref(from.id), cref(to.id), d.code, amt, d.invest ? 'Investment returns' : 'Loan repayment');
    if (to.player) { notify(w, 'personal', `💸 ${from.name} ${d.invest ? `paid out your share: ${fmtAmt(d.code, amt)}` : `repaid ${fmtAmt(d.code, amt)}`}.`, { link: 'inventory' }); remember(w, from, 3, d.invest ? 'paid you your share of the venture' : 'paid you back as promised'); }
  } else if (to.player) {
    notify(w, 'personal', `😞 ${from.name} ${d.invest ? 'says the venture failed — your stake is gone' : 'could not repay the loan'}.`, { link: 'people' });
    remember(w, from, -5, d.invest ? 'lost your investment' : 'could not pay you back');
  }
};
