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
import { aiShop, expireBuffs } from './specials';
import { aiCompanyMarket } from './companyMarket';
import { player } from './query';
import { fail, ok } from '../engine/result';
import { EXTRA_PROPOSALS } from './congressExtra';
import { PEACE_PROPOSAL, WAR_PROPOSAL, onWarBattleWon, onWarDeadline, peaceHousekeeping, updateExile, computeSupply } from './war';
import { battleWonHandlers } from './warHooks';
import { aiBidding, aiListings, onAuctionEnd } from './auctions';
import { holdingsDaily } from './holdings';
import { acceptContract, closeContract, contractsHourly, npcOffers } from './contracts';
import { academyHourly, aiStudies } from './academy';
import { aiMining, onMineEnd } from './mining';
import { npcJournalism, pressDaily } from './press';
import { checkPromises, npcCorrespondence, recruitmentDaily, replyDiplo, replyEndorse, replyHelp, replyOrder, replyWhip } from './social';
import { libraryDaily } from './library';
import { onTournamentRound, onTournamentStart, tournamentsDaily } from './tournaments';
import { onEventBattleWon, onEventEnd, pirateTick, piratesAI, piratesDaily } from './pirates';
import { NUKE_PROPOSAL, nuclearAI, onNukeArrive, onNukeBuilt } from './nuclear';
import { terrainDaily } from './terrainEvents';
import { propose } from './congress';
import { aiClaimReserves, defenseBudget, diplomacyDaily, militaryHourly, soldiersTick } from '../ai/military';
import { stateDaily } from './stategov';

let done = false;
export function registerSystems() {
  if (done) return;
  done = true;

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
    stateDaily(w);
  });
  // Stage 3: military
  EXTRA_PROPOSALS.war = WAR_PROPOSAL;
  EXTRA_PROPOSALS.peace = PEACE_PROPOSAL;
  battleWonHandlers.war = onWarBattleWon;
  HANDLERS.warDeadline = (w, p) => onWarDeadline(w, p.war);
  tickHooks.push(soldiersTick);
  hourlyHooks.push((w: World) => { militaryHourly(w); peaceHousekeeping(w); });
  dailyHooks.push((w: World) => { diplomacyDaily(w); defenseBudget(w); aiClaimReserves(w); updateExile(w); computeSupply(w); });

  // Stage 4: finance & progression
  HANDLERS.auctionEnd = (w, p) => onAuctionEnd(w, p.id);
  HANDLERS.mineEnd = (w, p) => onMineEnd(w, p.cit, p.end);
  hourlyHooks.push((w: World) => {
    const h = hourOf(w.time);
    aiBidding(w);
    contractsHourly(w);
    academyHourly(w);
    aiMining(w);
    if (h === 7) aiStudies(w);
    if (h === 16) { aiListings(w); holdingsDaily(w); }
    if (h === 11) npcOffers(w);
    if (h === 13) aiShop(w);
  });
  REPLY_HANDLERS.contract = (w, m, o) => (o === 'accept' ? acceptContract(w, player(w).id, m.payload!.id) : closeContract(w, player(w).id, m.payload!.id, 'rejected'));

  // Stage 5: world flavour
  EXTRA_PROPOSALS.nuke = NUKE_PROPOSAL;
  battleWonHandlers.event = (w, b, winner) => onEventBattleWon(w, b, winner);
  HANDLERS.tournamentStart = (w, p) => onTournamentStart(w, p.id);
  HANDLERS.tournamentRound = (w, p) => onTournamentRound(w, p.id, p.alive);
  HANDLERS.eventEnd = (w, p) => onEventEnd(w, p.id);
  HANDLERS.nukeBuilt = (w, p) => onNukeBuilt(w, p.nation);
  HANDLERS.nukeArrive = (w, p) => onNukeArrive(w, p.id);
  tickHooks.push(pirateTick);
  hourlyHooks.push((w: World) => {
    const h = hourOf(w.time);
    checkPromises(w);
    piratesAI(w);
    if (h === 9) npcCorrespondence(w);
    if (h === 20) npcJournalism(w);
  });
  dailyHooks.push((w: World) => { pressDaily(w); libraryDaily(w); tournamentsDaily(w); piratesDaily(w); recruitmentDaily(w); nuclearAI(w); terrainDaily(w); });
  REPLY_HANDLERS.whip = replyWhip;
  REPLY_HANDLERS.endorseReq = replyEndorse;
  REPLY_HANDLERS.helpReq = replyHelp;
  REPLY_HANDLERS.order = replyOrder;
  REPLY_HANDLERS.diplo = (w, m, o) => replyDiplo(w, m, o, (type, params) => propose(w, player(w), type as any, params));

  REPLY_HANDLERS.ministerOffer = (w, m, o) => ministerOfferReply(w, m.payload!, o);
  REPLY_HANDLERS.citizenship = (w, m, o) => {
    const r = decideCitizenship(w, player(w).id, m.payload!.nation, m.payload!.cit, o === 'approve');
    return r.ok ? ok(r.msg) : fail(r.msg);
  };
}
