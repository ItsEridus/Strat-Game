// Wires every subsystem's hooks into the simulation loop, once, in a fixed order.
// The order is part of determinism: do not reorder casually.
import type { World } from './types';
import { dailyHooks, hourlyHooks, tickHooks, HANDLERS } from './hooks';
import { hourOf } from '../engine/clock';
import { REPLY_HANDLERS } from './inbox';
import { dailyOpinion, ministerOfferReply, onRegClose, partyRecruitment, payOfficials, runElection, scheduleElections } from './politics';
import { aiProposals, congressHourly } from './congress';
import { aiCitizenshipDecisions, decideCitizenship } from './travel';
import { developmentAI, laborAI } from '../ai/government';
import { expireBuffs } from './specials';
import { aiCompanyMarket } from './companyMarket';
import { player } from './query';
import { fail, ok } from '../engine/result';

let done = false;
export function registerSystems() {
  if (done) return;
  done = true;
  void tickHooks;

  // Stage 2: politics, construction, citizenship
  HANDLERS.election = (w, p) => runElection(w, p.id);
  HANDLERS.electionRegClose = (w, p) => onRegClose(w, p.id);
  hourlyHooks.push((w: World) => {
    const h = hourOf(w.time);
    congressHourly(w);
    aiCitizenshipDecisions(w);
    expireBuffs(w);
    if (h === 8) developmentAI(w);
    if (h === 9) laborAI(w);
    if (h === 10) aiProposals(w);
    if (h === 15) aiCompanyMarket(w);
  });
  dailyHooks.push((w: World) => {
    scheduleElections(w);
    dailyOpinion(w);
    partyRecruitment(w);
    payOfficials(w);
  });
  REPLY_HANDLERS.ministerOffer = (w, m, o) => ministerOfferReply(w, m.payload!, o);
  REPLY_HANDLERS.citizenship = (w, m, o) => {
    const r = decideCitizenship(w, player(w).id, m.payload!.nation, m.payload!.cit, o === 'approve');
    return r.ok ? ok(r.msg) : fail(r.msg);
  };
}
