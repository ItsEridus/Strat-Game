// Wires every subsystem's hooks into the simulation loop, once, in a fixed order.
// The order is part of determinism: do not reorder casually.
import { secessionDaily } from './secession';
import { civilWarDaily } from './civilWar';
import { technologyDaily } from './technology';
import { cyberDaily } from './cyber';
import { spaceDaily } from './space';
import { automationDaily } from './automation';
import { sovereignDaily } from './sovereign';
import { marketsDaily } from './markets';
import { climateDaily } from './climate';
import { softPowerDaily } from './softPower';
import { demographyDaily } from './demography';
import { almanacDaily } from './almanac';
import { mindDaily } from './mind';
import { mentalHealthDaily } from './mentalHealth';
import { habitsDaily } from './habits';
import { tiesDaily } from './ties';
import { uprisingsDaily } from './uprisings';
import { regimesDaily } from './regimes';
import { warCourseDaily } from './warCourse';
import { warHomeDaily } from './warHome';
import { counterIntelDaily } from './counterIntel';
import { collectionDaily } from './collection';
import { beliefsDaily } from './beliefs';
import { intelOrgDaily } from './intelOrg';
import { withScope } from './scope';
import { crisesDaily } from './crises';
import { balanceOfPowerDaily } from './balanceOfPower';
import { intlDaily } from './intlOrgs';
import { treatiesDaily } from './treaties';
import { diplomacyActionsDaily } from './diplomacyActions';
import { foodDaily } from './food';
import { energyDaily } from './energy';
import { naturalDaily } from './naturalHazards';
import { weatherDaily } from './weather';
import { forceStructureDaily } from './forceStructure';
import { arsenalDaily } from './arsenal';
import { prisonsDaily } from './prisons';
import { courtsDaily } from './courts';
import { whiteCollarDaily } from './whitecollar';
import { policingDaily } from './policing';
import { lod } from './tick';
import { powerMonthly } from './worldHistory';
import { budgetDaily } from './nationalBudget';
import { strategicDaily } from './strategic';
import { mergersMonthly } from './mergers';
import { companyLifeDaily } from './companyLife';
import { smallBusinessDaily } from './smallBusiness';
import { labourDaily } from './labour';
import { bankingDaily } from './banking';
import { statisticsDaily } from './statistics';
import { tradeDaily } from './trade';
import { publicFinanceDaily } from './publicFinance';
import { appointmentsHourly, meetForStory, placesDaily } from './places';
import { MEET_HOOK } from './story';
import { civilianControl, serviceRetirements } from './forces';
import { wellbeingDaily } from './wellbeing';
import { lifecycleTick } from './lifecycle';
import { routineHourly } from './routine';
import { populationDaily } from './population';
import { familyDaily } from './family';
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
import { crimeDaily, crimeHourly, playerRackets, policeRecruitment, replyArrest, replyExtortion, replySyndInvite } from './crime';
import { intelDaily, replySpyApproach, resolveOp } from './intel';
import { dynamicsDaily, replyStrike } from './dynamics';
import { npcDaily, replyBribe, replyDebate, replyInterview, replyLoan } from './npc';
import { forcesDaily, forcesTick } from './forces';
import { adoptMessage, onMessageAnswered, storyHourly } from './story';
import { registerAllStories } from '../data/stories';
import { MSG_HOOKS } from '../engine/events';
import { REPLY_LISTENERS } from './inbox';
import { lifeDaily } from './life';
import { goodsDaily } from './goods';
import { warChronicleDaily } from './warChronicle';
import { educationDaily } from './education';
import { servicesDaily } from './services';
import { housingDaily } from './housing';
import { lendingDaily } from './loans';
import { healthDaily } from './health';
import { pensionsDaily } from './pensions';
import { childhoodDaily } from './childhood';
import { lifeAIDaily } from './lifeai';
import { adoptionsDaily, petsDaily, pregnanciesHourly } from './kinship';

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
  hourlyHooks.push((w: World) => { if (!lod.coarse || hourOf(w.time) % 2 === 0) militaryHourly(w); peaceHousekeeping(w); });
  dailyHooks.push((w: World) => { regimesDaily(w); uprisingsDaily(w); secessionDaily(w); warCourseDaily(w); civilWarDaily(w); technologyDaily(w); cyberDaily(w); spaceDaily(w); automationDaily(w); sovereignDaily(w); marketsDaily(w); climateDaily(w); softPowerDaily(w); demographyDaily(w); almanacDaily(w); mindDaily(w); mentalHealthDaily(w); habitsDaily(w); tiesDaily(w); warHomeDaily(w); withScope(() => { beliefsDaily(w); treatiesDaily(w); diplomacyDaily(w); diplomacyActionsDaily(w); intlDaily(w); balanceOfPowerDaily(w); crisesDaily(w); }); defenseBudget(w); aiClaimReserves(w); updateExile(w); computeSupply(w); });

  // Stage 4: finance & progression
  HANDLERS.auctionEnd = (w, p) => onAuctionEnd(w, p.id);
  HANDLERS.mineEnd = (w, p) => onMineEnd(w, p.cit, p.end);
  hourlyHooks.push((w: World) => {
    const h = hourOf(w.time);
    // At a coarse level of detail (long advances), routine AI checks run every third hour.
    const routine = !lod.coarse || h % 3 === 0;
    if (routine) aiBidding(w);
    contractsHourly(w);
    if (routine) { academyHourly(w); aiMining(w); }
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

  // Stage 7: armed forces (formations fight each tick before battle scoring)
  tickHooks.unshift(forcesTick);
  dailyHooks.push(forcesDaily);

  // Stage 6: law & order, intelligence, a dynamic world and a responsive society
  HANDLERS.opResolve = (w, p) => resolveOp(w, p.id);
  hourlyHooks.push(crimeHourly);
  dailyHooks.push((w: World) => { dynamicsDaily(w); crimeDaily(w); policingDaily(w); whiteCollarDaily(w); courtsDaily(w); prisonsDaily(w); playerRackets(w); policeRecruitment(w); intelDaily(w); intelOrgDaily(w); collectionDaily(w); counterIntelDaily(w); npcDaily(w); });
  REPLY_HANDLERS.arrest = (w, m, o) => replyArrest(w, m.payload!.case, o);
  REPLY_HANDLERS.extortion = (w, m, o) => replyExtortion(w, m.payload!, o);
  REPLY_HANDLERS.syndInvite = (w, m, o) => replySyndInvite(w, m.payload!, o);
  REPLY_HANDLERS.spyApproach = (w, m, o) => replySpyApproach(w, m.payload!, o);
  REPLY_HANDLERS.strike = (w, m, o) => replyStrike(w, m.payload!, o);
  REPLY_HANDLERS.loanOffer = (w, m, o) => replyLoan(w, m.payload!, o);
  REPLY_HANDLERS.bribeOffer = (w, m, o) => replyBribe(w, m.payload!, o);
  REPLY_HANDLERS.interview = (w, m, o) => replyInterview(w, m.payload!, o);
  REPLY_HANDLERS.debate = (w, m, o) => replyDebate(w, m.payload!, o);

  // Stage 8: a lived-in world: encounters with choices
  registerAllStories();
  hourlyHooks.push(storyHourly);
  MSG_HOOKS.push(adoptMessage);
  REPLY_LISTENERS.push(onMessageAnswered);
  dailyHooks.push(lifeDaily);
  dailyHooks.push(goodsDaily);
  dailyHooks.push(warChronicleDaily);
  dailyHooks.push(petsDaily, adoptionsDaily, educationDaily, servicesDaily, housingDaily, lendingDaily, healthDaily, pensionsDaily, childhoodDaily, lifeAIDaily);
  hourlyHooks.push(pregnanciesHourly);
  dailyHooks.push(populationDaily);
  dailyHooks.push(weatherDaily, naturalDaily, energyDaily, foodDaily);
  dailyHooks.push(publicFinanceDaily, tradeDaily, statisticsDaily, bankingDaily, budgetDaily, strategicDaily, arsenalDaily, forceStructureDaily, powerMonthly, labourDaily, smallBusinessDaily, companyLifeDaily, mergersMonthly);
  dailyHooks.push(familyDaily);
  dailyHooks.push(wellbeingDaily);
  tickHooks.push(lifecycleTick);
  hourlyHooks.push(routineHourly);
  hourlyHooks.push(civilianControl);
  hourlyHooks.push(appointmentsHourly);
  MEET_HOOK.fn = meetForStory;
  dailyHooks.push(placesDaily);
  dailyHooks.push(serviceRetirements);

  REPLY_HANDLERS.ministerOffer = (w, m, o) => ministerOfferReply(w, m.payload!, o);
  REPLY_HANDLERS.citizenship = (w, m, o) => {
    const r = decideCitizenship(w, player(w).id, m.payload!.nation, m.payload!.cit, o === 'approve');
    return r.ok ? ok(r.msg) : fail(r.msg);
  };
}
