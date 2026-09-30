# Meridian Reach: design notes

This is a single-player adaptation of the society-simulation systems described in the *Eclesiar feature
reference and single-player game brief*. It is **not** a copy of Eclesiar's code, data or assets. The setting
is present-day Earth with sixteen real countries; citizens, companies, parties, papers and all writing are
invented. Where the brief marks a rule as **documented** (current announcements), a
**wiki baseline**, **unverified**, or a **solo design** proposal, this game follows that distinction:

- **DOC:** implemented as documented. Newer corrections win (e.g. Strength applies before the
  training-power multiplier, there is no accuracy cap, wars use goals/occupations instead of instant
  annexation, Peace Terms replace Cease War, revolutions are retired, the minimum war is 8 days, nuclear
  flight is 8 hours).
- **WIKI:** used where nothing newer contradicts it (energy regeneration, food values, company founding
  costs, 160-minute rounds and segment scoring, storage weights, auction rules, missions).
- **SOLO:** a chosen default for single play. These are in `src/data/balance.ts`, are listed in-game under
  **Settings → Balance & sources**, and can be overridden per save.

## Stack and architecture

- **TypeScript + Preact**, bundled by **esbuild** into one classic script (`dist/game.js`), so `index.html`
  runs from `file://` with no server. Saves use `localStorage`, compressed with lz-string, and can be exported
  and imported as JSON.
- One serialisable `World` object holds all state (`src/sim/types.ts`): clock, RNG state, event queue,
  entities, escrows, pending votes and logs.
- **Time** (`src/sim/tick.ts`) advances in 10-minute ticks. Scheduled events (elections, war deadlines,
  auctions, mining, tournaments, nuclear flight) fire from a sorted queue. Per-tick, hourly and daily rules
  run in a fixed order. Advancing N days in one call is identical to N one-day calls (this is tested).
- **Ledger** (`src/engine/ledger.ts`): every money or item movement goes through `pay`/`mint`/`burn`/
  `produce`/`consume`/escrow helpers. Money is integer fixed-point (gold ×1000, currencies ×100).
  `audit()` checks that every wallet, escrow (listings, FX orders, bids, contracts, construction sites,
  tournament pools) and share ledger adds up to the tracked supply. The headless sim and tests run it daily.
- **Actions** validate first and return a reason (level, location, authority, money, energy, material). The
  UI shows these reasons on disabled buttons. AI citizens call the **same functions** with the same permission
  checks (`src/sim/authority.ts`). Only background households use a system actor.
- **Earth map:** `tools/build-earth.mjs` builds `src/data/earth.json` (committed, ~1.8 MB) from Natural Earth
  1:10m data (downloaded to `tools/ne/` on first run, not committed) and `tools/earth-defs.mjs`. Regions are the
  real admin-1 units of each playable country (the UK's are merged into its four countries). All units go into
  one TopoJSON topology, so neighbouring regions share identical border arcs; the topology is simplified
  (keeping ~12% of points) and projected with Natural Earth. **Links** come from shared arcs, plus a
  near-coincident-vertex check for borders digitised separately; islands and exclaves get strait links; the
  defs add sea lanes and corridors, and the build fails unless the graph is connected. **Derived from data:**
  label points, seats of government and largest cities (populated places), a population weight (sum of
  populated places), terrain (sampled points against Natural Earth deserts and mountain ranges, then broad
  climate zones; dense urban regions count as plains), national capitals and populations. **Hand-written:**
  names, government titles and selection methods, notable resource deposits and farm belts, and sea lanes.
  Shapes stay out of saves; region ids index the static data. Older saves (versions 1–4) are rejected with a
  message.
- **Procedural per seed** (where it adds replay value without contradicting geography): deposit richness and
  extra deposits (weighted by terrain), background population (each nation's total follows its real population,
  compressed; regions share it by real urban population), full citizens per nation (0.75×–1.35× the setting by
  population), each region's electorate leaning (the nation's citizen mix, tilted by how urban it is), election
  cycles, generated officials and candidates, starting state taxes and budgets from the ruling ideology.
- **State governments** (`src/sim/stategov.ts`): one per region with a real government (`null` for England).
  Treasury account `reg`, included in the audit. Revenue: state wage tax on shifts worked in the region,
  a resident levy on the region's share of household money ((wage tax + 3%) × 0.2 per day), and block grants
  (3% of the nation's previous-day revenue, by population). Spending (a share of the treasury per day): welfare
  and infrastructure to households, business support to local companies per worker; infrastructure points buy
  levels (+2% production each, max 5). Elected heads: 60-day staggered cycles, 5-day registration, background
  vote by leaning × incumbent approval × candidate influence × campaign spending, plus citizens' ballots; the
  legislature is apportioned half by vote, half by leaning. Appointed heads are named by the national leader
  (AI: a loyal official of their ideology; the player chooses). Tax changes need legislature support (seats
  whose ideology favours that direction, neutral ideologies counting half), at most 3 points per 7 days.
  Occupation suspends a government; annexation replaces it with an appointed administrator.
- **Law & order** (`src/sim/crime.ts`): region `crime`, `police` and `unrest` (0–100) move daily toward targets.
  Crime target = base + unemployment + poverty (unmet household demand) + city size + recession + unrest +
  syndicate presence − 0.5 × (police − 30) − welfare/infrastructure. Police = base + state police spending per
  resident relative to the national average + national police funding + citizen officers (halved under
  occupation). Crimes (AI and player share the same functions) raise heat and may be seen, opening a `Case`;
  evidence grows with policing and heat; at 60% the suspect is arrested where that nation's police reach, then
  tried (conviction chance = evidence, ×0.75 with a lawyer; bribes succeed more where policing is weak).
  Convictions: fine (to the state or national treasury), prison (blocks work, travel, training, fighting,
  mining, construction, proposals, candidacy), dismissal from the police, a voter penalty. Syndicates are
  accounts (`synd`, audited): they skim households on their turf, collect protection from companies (the
  player's via the inbox), pay their members, recruit disaffected citizens, expand into weakly policed
  neighbours, feud over shared turf, get raided (assets seized to the treasury) and collapse or emerge.
- **Intelligence** (`src/sim/intel.ts`): `Nation.agency` holds budget, networks per foreign nation, counter-
  intelligence, dossiers and focus. The budget is spent daily (to households) and builds networks in focus
  countries with diminishing returns against the target's counter-intelligence; networks decay. Operations are
  scheduled events (`opResolve`): success = 0.35 + network/150 + agent tradecraft/100 − counter/200; exposure
  costs relations, network and possibly the agent. AI directors pick operations by war, relations and exposure.
  Citizens can serve (analyst → deputy director, paid) or be turned into foreign assets (paid daily by the
  foreign treasury; caught by counter-intelligence sweeps).
- **Dynamic world** (`src/sim/dynamics.ts`, `src/data/hazards.ts`): a mean-reverting business cycle drives
  household spending (±30%), crime and unrest; commodity events scale raw output worldwide; hazards fire by
  season in real zones with severity 1–3 (disruption, deaths, building damage, looting, halted companies) and
  draw automatic state and national relief; epidemics spread along links, recover after ~12 days, and are
  stopped by lockdowns (AI by ideology, the player as governor); companies paying under 80% of the national
  average wage strike (the player decides in the inbox); unrest becomes protests and riots with AI concessions
  or crackdowns; background population migrates toward safer, better-governed regions; new AI citizens arrive
  (capped at 1.3× the starting population).
- **Responsive AI** (`src/sim/npc.ts`): every AI citizen has an agenda that steers behaviour (e.g. would-be
  governors stand and campaign) and is announced when achieved. Rivals (opponents in your races, competitors in
  your industries, feuding gangs, people you've wronged) and allies (relationship ≥ 40) act on the player; NPCs
  send bribe offers to office-holders, loans, interview requests and debate challenges; journalists investigate
  notorious citizens; NPCs clash, mentor and invest among themselves; and a daily snapshot comparison makes the
  world react to the player's new companies, offices and convictions. Secret affiliations (syndicate, agency)
  are hidden from the player unless they'd plausibly know.
- **Armed forces** (`src/sim/forces.ts`, `src/data/military.ts`): formations are world entities with strength,
  equipment, readiness, morale and experience; power = type base × strength × equipment × readiness × morale ×
  experience × commander rank × chief-of-staff bonus. Every 10-minute tick, formations engaged in a war battle
  (defending divisions in the region; divisions ordered to support from the region or a neighbour; air wings on
  strike/superiority within 2,500 km; fleets supporting from a sea touching the coast) add damage by terrain,
  landing and defence modifiers, and lose strength in proportion to the enemy's share of the previous tick's
  damage; winning air power adds +10%. The builder derives sea zones from real coastlines (arcs used by one region
  and no neutral country, assigned to the nearest of 29 named seas). Naval superiority (1.2× the enemy's naval
  power in a sea) is required for amphibious landings, blocks enemy sea lanes in supply, blockades enemy coasts
  (−15% production) and allows armies to cross sea lanes; hostile fleets in the same sea fight daily naval
  engagements. Upkeep and procurement are capped by a military budget share of revenue plus 1% of the treasury;
  equipment wears 0.3/day and is repaired from national stocks. AI defence ministries assign commanders, send
  divisions to battles and toward enemy borders, sail fleets into enemy seas, fly air wings over battles, rebuild
  lost divisions and set the security alert (1–5: readiness, counter-intelligence, upkeep, approval). Citizens
  enlist, earn service points from duty, war damage, victories, hero medals and command, and climb 15-rank
  ladders (command from index 10, flag ranks after 10 days in command). Fog of war hides foreign formations
  unless near your territory or seas, revealed by networks ≥ 50 or military reconnaissance.
- **Modules:** `sim/` (rules), `ai/` (behaviour), `ui/` (screens), `data/` (tables). Later systems plug in
  through `sim/systems.ts` hooks, so depth can be added without touching the loop.

## The simulated society

- **Full AI citizens** (default 24 per nation scaled by population, 16/24/36 selectable) have identity, persona (worker, soldier, industrialist,
  merchant, politician, builder, journalist, investor), ideology, traits, relationships, skills, inventory,
  jobs, parties and units. They work, train, shop, eat, fight, vote, run for office, legislate, found and
  manage companies, invest, bid, study, mine, build and write.
- **Background households** (aggregated residents) buy and consume food, tickets and weapons. They are funded
  by citizens' daily living costs, newspaper subscriptions and treasury social transfers, which **closes the
  money loop** without hidden minting (SOLO).
- **Prices emerge from listings.** AI firms reprice from sales and unit cost, hire through wage competition,
  buy inputs, and signal shortages. Governments post procurement demand for construction materials.
  Entrepreneurs found companies where supply lags.
- **Money creation** (Settings → Money supply) comes only from genesis endowments, missions, mining, combat
  reward pools, level-ups, tournament sponsorship and congress-approved money printing. **Money destruction**
  comes from founding costs, upgrades, fees, shop purchases, printing backing and seller charges.

## Rules chosen where sources were silent or inconsistent (SOLO)

| Area | Rule used |
| --- | --- |
| Damage | `(100 + 5·Strength) × (1 + power/100) × weapon × rank × (1+gear%) × buffs × terrain × base × ideology × supply × flag`. Hit chance is 70% + 0.1·Accuracy + gear/Focus/base − forest, clamped 0–100 with no cap. Crits are 5% + 0.1·Luck at 200% + 0.2·Luck. |
| Training | First session per day adds `1/log10(power+2)` power; extra sessions give XP only (DOC); donation training gives 4 XP. |
| Battle ticks | Each 10-minute tick awards its 100/200/300/600 points to the side leading in round damage at the tick's end (ties go to the defender). Most points wins the round; first to 3 rounds wins the battle. |
| Location to fight | Fight from territory your side controls or owns (occupied homelands can resist), an ally's territory, or the battlefield. Non-border invasions are air assaults where only air weapons count. |
| Manager shifts | The first manager shift per citizen per day is free; later ones cost 0.1, 0.2, 0.4… gold (the wiki examples conflict). |
| Pollution | 7-day rolling production weight (raw 1, finished 2) against capacity 0.02 × population × (1 + 0.25 × industrial level). The first half of capacity is free; production × (1 − 0.9 × pollution) (WIKI formula). |
| Taxes | Ceilings from the congress seat mix: `25 + 0.5·communist% − 0.4·capitalist%` (import) and `− 0.3·capitalist%` (VAT/work), each clamped 0–100 and applied separately. |
| Occupation | Work tax is split 80/20 occupier/owner (DOC). Exile citizens get 50% work-tax relief from hosts holding their cores; exile goods pay no import tax there. |
| Wars | Quota 3 for 0–1 goals and 6 for 2 goals (DOC), capped at the enemy's region count. At the deadline, held goals transfer only if the quota is met; otherwise everything returns. A 7-day pact follows. |
| Peace terms | Armistice, demand and trade need both congresses (the other side gets an automatic "accept" vote). Surrender is unilateral. |
| Supply | Connected to the seat of government through controlled regions, or a level-4+ base. Defenders out of supply deal −10% (DOC). |
| Combat rewards | Round-side pools from 2 to 64 gold at damage thresholds of 40k×4ⁿ, shared by damage: 40% paid now, 60% to a claimable reserve capped at 30 gold (replacing the gem-gated bank). Hero medal goes to the top damage per side per battle. |
| Elections | Individual citizen voters weigh ideology, influence, party support, relationships, incumbent approval, war score and their own income. Background blocs add votes equal to the citizen electorate, split by party support. Seats use D'Hondt. |
| Studies | Energy +6% or an item bundle +15%; unlock at 75% (DOC); decay 0.25%/h (0 disables it). |
| Geography | Sixteen real countries, 492 real first-level subdivisions with real borders. Other countries are neutral scenery. |
| Regional government | Real titles and selection methods; state wage tax 0–12% (0% where US states have no wage tax); see Architecture. |
| Travel | Overland to a land-bordering region for 15 energy, or a ticket by great-circle distance (800/2,000/4,000/8,000 km/anywhere by quality; 5 energy per 1,000 km, −10% per quality). |
| Mining | Yields 0.5/0.8 gold (WIKI) × equipment × (1 + 0.02·eco skill) × studies × world multiplier. |
| Other values | Everything in `balance.ts` tagged `SOLO`: recipes, living costs, household spending, starting wages, AI pricing, tournament sponsorship, pirate strength and so on. |

## Acceptance checklist (brief §17)

All items are covered by automated tests (`npm test`, 51 passing) and the headless audit. The browser smoke
tests `tests/e2e.mjs` and `tests/e2e-play.mjs` check every screen and the tutorial flow for console errors.

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | New campaign with working economy and tutorial | ✅ | acceptance #1 |
| 2 | Earn wages, buy food, progress without fighting | ✅ | acceptance #2 |
| 3 | Production chains consume and create correct goods | ✅ | acceptance #3, core test |
| 4 | Businesses stop on missing funds, labour, inputs or capacity | ✅ | acceptance #4, core test |
| 5 | Market purchases transfer exactly once | ✅ | core tests |
| 6 | NPCs keep markets, elections, government and military going | ✅ | acceptance #6, 120-day run |
| 7 | Attribute allocation changes displayed and executed outcomes | ✅ | acceptance #7 |
| 8 | Equipment, weapons and buffs are separate | ✅ | acceptance #8 |
| 9 | Elections assign real offices and seats | ✅ | politics test |
| 10 | Enacted laws alter later behaviour | ✅ | politics test (net wages) |
| 11 | Government actions need authority and spend state resources | ✅ | acceptance #11, construction test |
| 12 | Construction consumes contributions and completes once | ✅ | politics test |
| 13 | Battles separate damage, points, rounds and outcome | ✅ | military test |
| 14 | War goals and occupation are distinct from ownership | ✅ | military test |
| 15 | Peace and deadlines settle land, buildings and treaties | ✅ | military tests (deadline, conquest, bilateral peace) |
| 16 | Supply follows connections and territory | ✅ | military test |
| 17 | Losing territory leaves a recovery path | ✅ | exile test (capital-reclaim war) |
| 18 | Holdings, auctions and contracts cannot duplicate assets | ✅ | finance tests + audit |
| 19 | Timers use simulation time; pausing pauses | ✅ | acceptance #19; UI loop only advances when unpaused |
| 20 | Save/load keeps operations, no repeated rewards | ✅ | save/load determinism, mining save test |
| 21 | Long advances are stable and explainable | ✅ | acceptance #21 (120 days) |
| 22 | News and histories reflect real events | ✅ | acceptance #22 |
| 23 | Meaningful play as entrepreneur, politician, soldier, builder | ✅ | acceptance #23 (scripted careers) |
| 24 | Launches locally with documented commands, no paid services | ✅ | `Play.bat`, README |

## Known limitations and simplifications

These are deliberate simplifications or gaps against the brief's full wish list:

- **World scale:** sixteen playable countries on a 492-region Earth map, with about 400 full citizens by
  default. Most regions therefore have few or no full citizens; their economies and electorates are the
  aggregated background population. Other countries are unplayable neutral land, so some borders (e.g.
  Germany–Turkey) are modelled as corridors. Crimea and Sevastopol are left out of Russia and the Paracel
  Islands out of China; a few tiny remote territories (Jervis Bay, Macquarie Island) are omitted.
- **Governments:** real titles and selection methods, but not real politicians or parties. National politics
  uses the same election/congress rules everywhere. Regional legislatures are modelled by their composition only
  (they vote on tax changes); regional elections are single-round; terrain is a coarse four-way classification.
- **Crime & intelligence:** no assassinations or violent attacks on individuals (deliberately left out); crimes
  are abstracted into a handful of kinds with severity. Courts are a single trial with no appeals or plea deals.
  Foreign assets are paid in the foreign currency. AI governments do not negotiate prisoner exchanges.
- **Living world:** disasters and epidemics are regional abstractions (population, production, buildings,
  unrest); there is no health-care system beyond hospitals reducing epidemic deaths. Migration moves the
  background population only; AI citizens arrive but never die or retire.
- **Holdings:** role assignment in the UI is basic ("assign to top shareholder"). There is no UI for holding
  storage transfers or holding-level currency exchange. Public/private disclosure is simplified.
- **Contracts and negotiation:** NPCs accept or reject with a stated reason. They make no counter-offers.
  Foreign purchases require travel; contracts cannot act as remote purchase orders.
- **Tournaments:** solo and random-team formats are implemented. The squad format is defined but not
  scheduled.
- **Military units:** there are no unit storage upgrades. Squad bonuses cover order, terrain and weapon
  specialisations only.
- **Storage upgrades** (gold-funded capacity increases) and **bound items** are not implemented.
- **Cabinet:** the Public Relations and Recruitment ministries have permissions. PR has no dedicated action
  beyond publishing, and recruitment covers citizenship decisions and invitations. There are no monthly
  national recruitment objectives or leaderboards.
- **Nuclear:** optional and on by default. Defusal targets stockpiles only; interception of missiles in
  flight is not modelled, since the sources don't establish it. AI nations rarely afford the documented
  resource costs.
- **Terrain events** are optional and off by default.
- **Currency:** there is one gold order book per currency, and currency-to-currency conversion routes through
  gold (as the brief allows).
- **Communication:** the NPC inbox replaces chat. There is no free-text conversation with NPCs, by design,
  since no language model is used.
- **Seasons:** one earnable season track, with no automatic season reset yet.
- **Settings:** there are no audio, localisation or accessibility options beyond browser defaults. Offline
  progression is disabled, as the brief specifies for a first release.
- **Balance** is a first pass tuned with the headless simulator. Expect SOLO values to need adjustment with
  play; they are all overridable per save.

## Developer notes

- `npm run sim -- <days> <seed>` prints economy, politics and war indicators every 10 days and fails if the
  asset audit ever fails.
- `node tests/run.mjs --script tests/diag/<file>.ts` runs ad-hoc diagnostics (wars, weapons, gold,
  construction, flavour).
- `PLAYWRIGHT_PATH=… node tests/e2e.mjs` runs the browser smoke test. The page exposes `window.meridian` (the
  UI store) for automation.
