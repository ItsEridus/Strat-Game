# Roadmap after 1.4: a world that moves (1.5.0 → 2.5.0)

Version 1.4.0 completes the life simulation (see `LIFE_PROGRESS.md`). From there, the plan turns to the world
around the player. The main thread is the geopolitical simulation requested on 30 September 2026. Nations and
AI actors advance over time: militaries and intelligence services get better, companies expand or disband,
nations rise and fall, and wars happen, all realistically. The earlier after-1.4.0 requests are included where
they belong: careers and employment, policing and crime careers, prisons, weather and natural disasters.

Parts marked **GEO** are the geopolitical simulation. Every version ships as a series of playable patch
releases (every push is a release); the minor version marks its theme complete.

## At a glance

| Version | Theme | What the player sees |
| --- | --- | --- |
| 1.5.0 | **Work & enterprise** (GEO 1: companies expand or disband) | A real working life in any occupation; firms that are founded, grow into new regions and countries, merge, go public and go bust |
| 1.6.0 | **The strategic engine** (GEO 2: nations advance over time) | Economies grow or stall, budgets shift, capabilities improve or decay, and the power ranking moves for reasons you can read; years pass in minutes |
| 1.7.0 | **Law & order** | Police, crime, courts and prisons as full careers and institutions |
| 1.8.0 | **Arsenal** (GEO 3: militaries get better) | Defence budgets, R&D programmes, equipment generations, procurement from real defence firms, arms trade, doctrine that learns |
| 1.9.0 | **Sky & ground** | Real weather and climate zones, natural hazards by real geography, resources and energy |
| 2.0.0 | **The great game** (GEO 4: diplomacy and the international order) | Treaties, alliances, sanctions, a Security Council, blocs and summits; leaders whose character shapes policy |
| 2.1.0 | **Shadows** (GEO 5: intelligence gets better) | Services that grow and learn; governments act on estimates, so surprise and miscalculation happen |
| 2.2.0 | **War & peace** (GEO 6: realistic wars) | Wars with causes, escalation, fronts, mobilisation, exhaustion, negotiated endings and long aftermaths |
| 2.3.0 | **Rise & fall** (GEO 7: regimes, secession, new nations) | Coups, revolutions, democratisation and backsliding, secession, civil wars, new and vanished states |
| 2.4.0 | **Frontiers** (GEO 8: technology, cyber and space) | A near-future technology race that changes economies, armies and spying |
| 2.5.0 | **A world of consequences** (GEO 9: world economy, climate, soft power) | Debt crises, central banks, climate over decades, soft power; the decades-long campaign and the World Almanac |

**Why this order.** Each part builds on the ones before it:
- Companies and jobs come first because national wealth, the defence industry and technology are produced by them.
- The strategic engine turns that output into national trajectories.
- Law and order comes before intelligence, because both use internal security, the courts and prisons (for spies too).
- Weather and disasters come before climate and resources.
- Diplomacy (treaties, organisations) comes before intelligence beliefs and realistic war, which need it.
- Rise and fall needs war, coups and recognition by other states.
- Frontiers and the world economy close the loop.

## Principles for every part

1. **One world, one set of rules.** National figures come from the simulated people, companies, markets,
   formations and ledgers. Where a figure is an explicit stock, such as technology or institutions, it is
   paid for through the ledger. There are no free-floating scores, and the ledger audit stays green.
2. **Causes, not scripts.** No historical events are scheduled. Wars, coups, booms and collapses emerge from
   causes the game can show: power shifts, grievances, bad intelligence, debt, discontent.
3. **Nations act on beliefs** (from 2.1). Governments decide on what their intelligence tells them, with
   uncertainty. A weak-looking rival may not be weak.
4. **Explainable.** Every change keeps its reasons, as relations history and NPC memories already do. The
   interface shows them in charts, the chronicle, briefings and "why" tooltips.
5. **Parity.** Every lever an AI government, company or agency uses is open to the player in the matching role,
   with the same checks and costs, and the reverse.
6. **Realistic, then playable.** Starting values and rates are anchored to real data: IMF and World Bank
   (economy), SIPRI (defence), V-Dem (institutions), UCDP and Correlates of War (conflict), EM-DAT (disasters),
   IEA (energy) and OECD (business demography). A *Pace of history* setting compresses them so change is
   visible within a campaign.
7. **Actors that learn.** AI organisations adapt:
   - companies copy what works for their competitors;
   - general staffs revise doctrine after a war;
   - intelligence services change their tradecraft after an exposure;
   - governments change strategy after a crisis.
8. **Deterministic and tested.** The simulation uses seeded dice, with living randomness stirred in during
   play. The test suite runs headless simulations lasting decades and checks the results against plausibility
   bands, and the browser play-test covers every new screen.
9. **Within a performance budget.** The strategic layer costs at most 5 ms per simulated day on a full world.
   From 1.6, simulating distant regions at a coarser level of detail lets a year pass in minutes.

## The strategic layer (built in 1.6, extended by every later part)

- **Time scales.**
  - Ten-minute ticks for people, hourly for operations, daily for markets and crises.
  - A **monthly strategic turn** for governments, company strategy, intelligence services and general staffs.
  - Quarterly reviews of budgets and programmes, and an annual **State of the World**.
- **Pace of history.** Three settings: Realistic (the calendar), Brisk (×3) and Epochal (×10). It scales
  growth compounding, R&D, programme lengths and regime dynamics. It is separate from the pace of life (ageing),
  so players can pair a calendar-paced life with brisk history, or any other combination.
- **New state in `w.geo`.**
  - National accounts with monthly series kept for decades, stored compactly.
  - Capability stocks: technology by domain, human capital, infrastructure and institutions.
  - Each nation's grand strategy.
  - Added by later parts: treaties, organisations, programmes, beliefs, claims and movements.
- **Level of detail.** The player's region, its neighbours and places with running stories simulate in full.
  Other regions advance their citizens statistically between check-ins and reconcile deterministically, so
  saves stay consistent and the census stays truthful.
- **The chronicle.** An append-only world history with importance levels. Each nation gets its own history,
  and from 2.5 the World Almanac.
- **Existing systems it replaces or extends.**
  - The power index (Rankings) and `militaryPower`.
  - Daily relations drift (`diplomacyDaily`).
  - The deadline-and-quota war model (`war.ts`).
  - The single world business cycle (`EconState`).
  - Agencies (`intel.ts`), formations (`forces.ts`), crises (`dynamics.ts`), companies (`company.ts`) and
    regional governments (`stategov.ts`).
- **Saves.** Every version migrates older saves, checked by the upgrade test in the release pipeline. New state
  starts from real-world baselines for the 16 nations (2030 projections).

---

## 1.5.0 — Work & enterprise (GEO 1: companies expand or disband)

*Includes the careers and employment overhaul requested earlier. It builds on the industries added in 1.3.3.*

**Goal.** Every adult has a working life that makes sense: a trade, a profession, a public-sector job, a small
business, or unemployment. Companies live and die: they are founded, grow into new regions and countries,
merge, go public and go bust.

- **Occupations.**
  - About 60 occupations in 12 families: trades, manufacturing, retail and hospitality, transport and
    logistics, office and administration, finance, IT, health, education, public administration, security and
    defence, arts and media, science and engineering, and agriculture.
  - Each has required skills and qualifications (from the education ladder in L3), pay bands by nation and
    region anchored to real wage ratios, and its own hours and conditions.
- **The labour market in every region.**
  - Getting a job: vacancies, applications, interviews (a short conversation scene), offers and pay negotiation.
  - On the job: probation, performance reviews, raises, promotions and transfers.
  - Leaving: notice periods, resignations, dismissals with stated reasons, redundancy pay, then unemployment
    benefits funded by the nation and a job search that takes realistic time.
  - Unions with members and collective agreements; the existing strike stories become union actions.
- **Self-employment and small firms.**
  - Sole traders such as plumbers, electricians, tutors and drivers.
  - The cafés, shops and restaurants of the neighbourhood (narrative stage 3), now owned by citizens with real
    accounts.
  - Professional practices such as clinics and law firms.
  - Family businesses, passed on by inheritance (L5).
- **The company lifecycle.**
  - Founding: capital, licence, location, first hires.
  - Growth: capacity, branches in other regions, subsidiaries abroad under host-country law.
  - Financing: bank loans, bonds, and equity on the stock market (Holdings), including investors in young firms.
  - Strategy: a monthly decision to expand, hold, cut costs, invest in quality or enter a market.
  - Mergers and acquisitions, friendly or hostile, with valuations.
  - The end of a company:
    - insolvency: an administrator is appointed, creditors are paid in legal order, assets are auctioned and
      workers laid off;
    - voluntary closure;
    - nationalisation or privatisation, with state-owned firms under political control.
- **Competition policy.** Market concentration is measured per industry and nation (HHI). Regulators block
  mergers or order break-ups, and cartels are crimes (1.7).
- **Industries.** The sector map grows into primary, secondary and tertiary industries, linked by supply chains.
  It includes the strategic industries later parts need: steel, chemicals, electronics, semiconductors,
  shipbuilding, aerospace and defence, energy, telecoms, software, finance and construction.
- **AI.**
  - Entrepreneurs start firms where there is demand and the skills exist.
  - Boards follow their monthly strategy by simple, visible rules, and imitate profitable competitors.
  - Failing firms cut staff, sell assets or fold.
- **Careers:** any occupation's ladder, founder and CEO, investor, union representative, regulator, insolvency
  administrator.
- **Stories:** "The interview", "Payroll Friday" (a cash crunch), "The takeover bid", "Last day at the plant".
- **UI.**
  - A rebuilt Employment screen: job board, applications, your career.
  - Company pages: strategy, branches, financing, who owns it.
  - An industry overview showing rising and failing firms, and business news.
- **Realism.** About one firm in ten enters or exits each year (OECD business demography). Firm sizes are
  heavy-tailed, and wage structures by occupation follow national statistics.
- **Done when:**
  - five-year headless runs show plausible firm births, deaths and firm sizes;
  - insolvencies create or destroy no money (ledger audit);
  - employment tracks national rates.
- **Releases, in order:**
  1. occupations and the labour market;
  2. small businesses and owned venues;
  3. company lifecycle and finance;
  4. mergers, acquisitions and competition;
  5. screens and stories.

## 1.6.0 — The strategic engine (GEO 2: nations advance over time)

**Goal.** Nations visibly change over months and years. Economies grow or stagnate, budgets shift, capabilities
improve or decay, and the power ranking moves for reasons the player can read.

- **The monthly strategic turn**, and the **Pace of history** setting.
- **National accounts from the simulation.**
  - GDP (value added by companies, services and government) and its growth.
  - Inflation, from a price index over the real markets.
  - Unemployment and wages.
  - Revenue, spending, deficit and debt.
  - The trade balance and reserves.
- **Capability stocks.**
  - Technology in six domains: industrial, military, information, medical, energy and space.
  - Human capital, from the schools and universities of L3.
  - Infrastructure, with new building types: transport, power, ports, telecoms, research labs.
  - Institutions: rule of law, control of corruption, government effectiveness, press freedom.
  - Cohesion: approval, unrest and trust.
- **Growth.**
  - Output per worker rises with capital, human capital, infrastructure, technology and institutions.
  - R&D adds technology, with diminishing returns.
  - Technology spreads from the leading nations through trade and investment. Poorer nations can catch up
    (conditional convergence), while bad institutions and instability hold them back.
- **Budgets.**
  - Governments divide revenue across defence, intelligence, police, R&D, education, health, infrastructure,
    welfare and debt service.
  - Budget laws pass through congress.
  - Borrowing and money printing have real consequences: inflation, interest and credit.
- **Grand strategy.**
  - Each AI government chooses a strategy from its situation, ideology and its leader's traits: development
    first, military build-up, regional leadership, hedging, reform or retrenchment.
  - It changes strategy when circumstances change, and the chronicle records why.
- **Power index 2.0.**
  - Built from economic mass, military capability (quantity × quality × readiness), technology, intelligence,
    cohesion, and later soft power.
  - Nations fall into tiers: superpower, great, middle, regional and minor.
  - Power transitions are detected and feed later parts.
- **Time and history.** The level-of-detail engine makes "advance a month / a year" practical. It still stops for
  events that need the player.
- **The chronicle**, a history page for each nation, and the annual **State of the World** report with charts.
- **Careers.**
  - As president or a minister, the player sets budgets and strategy.
  - As a legislator, the player votes on budgets.
  - As a citizen, the player lives with the effects: wages, services, taxes.
- **Stories:** "Budget night", "A year in review".
- **UI.**
  - The Country screen rebuilt as a national dashboard with trajectories and the budget.
  - Rankings with history.
  - The State of the World at each New Year.
- **Realism.**
  - 2030 baselines for all 16 nations: shares of world GDP, growth potential, debt ratios, R&D intensity and
    education, from IMF and World Bank projections.
  - Yearly growth stays within historical ranges, and long-run growth between 1% and 6% a year.
- **Done when:**
  - 30-year headless runs keep growth within bands;
  - no nation runs away without cause;
  - catch-up growth is visible;
  - crises happen and are recovered from;
  - coarse and full detail give statistically similar national results;
  - a year of a full world passes in at most 3 minutes.

## 1.7.0 — Law & order

*Includes the prison system and the policing and crime careers overhaul requested earlier.*

- **Policing.**
  - Forces for each region and nation, funded by their governments, with ranks and units.
  - Patrol and investigation, evidence, warrants, arrests and use of force.
  - Internal affairs, public trust and corruption.
- **Crime.**
  - Street crime through to organised crime; syndicates grow, split and go to war.
  - White-collar crime: fraud, embezzlement, insider trading on the stock market, and tax evasion traced
    through the ledger.
  - Cybercrime, smuggling across borders and embargoes, money laundering, and informants.
- **Justice.**
  - Prosecutors, defence lawyers and judges.
  - Bail, plea bargains, trials on the evidence, sentencing rules for each nation.
  - Appeals, and wrongful convictions.
- **Prisons as institutions.**
  - Capacity, staffing, conditions and costs.
  - Life inside, for the player and AI: routine, work, education, gangs, visits, parole hearings, riots and
    escapes.
  - Release and re-entry, with jobs, stigma and re-offending.
- **Internal security.** National investigations, plus counter-terrorism and counter-espionage units that 2.1
  builds on.
- **Careers:**
  - police officer to chief, and detective;
  - prosecutor, defence lawyer, judge;
  - prison guard to warden;
  - criminal ranks, and the reformed ex-offender.
- **Stories:** "The informant", "Twelve good people", "Parole board", "Inside".
- **Realism.** Incarceration rates per nation, from about 40 per 100,000 in Japan to over 500 in the United
  States. Clearance and re-offending rates come from national statistics.
- **Done when:** crime, arrest and prison populations settle near national rates, and a prisoner's life can be
  played from sentencing to release.

## 1.8.0 — Arsenal (GEO 3: militaries get better)

- **Defence economics.**
  - Budgets as a share of GDP, starting near real levels: about 3% for the United States, more for Russia and
    Saudi Arabia, around 2% for most US allies, and under 1% for Mexico, Argentina and South Africa.
  - Each budget splits into personnel, operations and maintenance, procurement and R&D.
- **Equipment with generations.**
  - Classes: small arms, armour, artillery, air defence, fighters, bombers, drones, helicopters, surface
    combatants, submarines, carriers, missiles (cruise, ballistic, hypersonic), command-and-control and
    surveillance, and electronic warfare.
  - Formations hold a mix of generations, and quality counts in combat.
  - Equipment ages and wears out.
- **R&D programmes.**
  - Named programmes with a budget, a schedule and technical risk: delays, overruns and cancellations, as in
    reality.
  - They produce new generations, with spin-offs to civilian technology.
- **Procurement.**
  - Orders go to real defence companies (1.5), which must build with real inputs.
  - Deliveries modernise formations over months and years.
  - Nations also buy abroad (the arms trade), subject to export licences and embargoes, and become dependent on
    the seller for spare parts.
- **Force structure.**
  - Recruitment and conscription policy, reserves and retention.
  - Exercises raise readiness and experience, and cost money and fuel.
  - **Doctrine** changes the combat maths: manoeuvre, defence in depth, air power, sea control, sea denial or
    asymmetric warfare.
  - After-action reviews adapt doctrine after every war.
- **Strategic forces.** Nuclear doctrine, development of the triad, and missile defence. Arms control follows in
  2.0. The nuclear powers at the start are the United States, Russia, China, the United Kingdom and India.
- **Politics of defence.** Contractors lobby, factories keep regions employed, and exports earn revenue.
- **Careers:** procurement officer, test pilot, defence engineer, programme manager, arms dealer (legal or not).
- **Stories:** "Over budget and behind schedule", "The export licence", "Exercise season".
- **Realism.** A new combat aircraft takes 10–20 years from programme start to service, and a frigate 3–6 years
  to build. Procurement shares and wear rates follow published defence data.
- **Done when:**
  - a nation that invests in R&D and procurement fields better equipment within the expected years;
  - neglect shows as ageing, unready forces;
  - contracts pass the ledger audit.

## 1.9.0 — Sky & ground

*Includes the weather overhaul and the natural disasters overhaul requested earlier.*

- **Weather and climate zones.**
  - Zones follow latitude, terrain, altitude and coasts.
  - Daily weather: temperature, rain or snow, wind and storms, following the seasons of the calendar. Forecasts
    are uncertain.
  - Weather affects routines and mood, farming, construction, energy demand and travel.
  - It also affects military operations: mud, winter, sea state and flying weather.
- **Natural hazards by real geography.**
  - Earthquakes on real fault zones such as Japan, California, Mexico and Turkey.
  - Tropical cyclones by ocean basin and season; floods, wildfires, droughts, heatwaves, blizzards, volcanic
    eruptions and tsunamis.
  - Severity is heavy-tailed: most events are small, a few are catastrophic.
  - Early warning and preparedness (building standards, levees) reduce the damage.
  - The response involves emergency services, the army and international aid.
  - Insurance comes from real companies; recovery and reconstruction use the construction system.
- **Resources and energy.**
  - Deposits with reserves: oil, gas, coal, uranium, lithium, rare earths, copper, iron. Exploration finds new
    ones, and extraction depletes them.
  - An energy mix for each nation: fossil, nuclear, hydro, wind and solar.
  - Power grids and blackouts, energy prices, and dependence on imports.
  - An OPEC+-style producers' group (Saudi Arabia, Russia, Mexico) manages output.
- **Food security.** Harvests depend on the weather; famine risk and food imports follow.
- **Careers:** meteorologist, emergency coordinator, firefighter, geologist, energy trader, farmer.
- **Stories:** "The storm warning", "After the quake", "The dry year".
- **Realism.** Hazard frequencies follow EM-DAT base rates, energy mixes follow the IEA, and crop sensitivity
  follows agronomy data.

## 2.0.0 — The great game (GEO 4: diplomacy and the international order)

- **Relations 2.0.** Relations are made of:
  - trust;
  - affinity (ideology, culture, language);
  - threat perception (capability × proximity × intentions);
  - interdependence (trade and investment);
  - grievances (territorial claims, historical wrongs);
  - prestige.
  Nations remember what was done to them.
- **Diplomacy as actions with costs.**
  - Embassies and ambassadors, statements, summits and state visits.
  - Recognition, aid and loans, arms deals.
  - Sanctions, expulsions, guarantees and ultimatums.
  - Mediation and arbitration.
- **Treaties as real objects,** with terms, a duration, compliance tracking and penalties for breach:
  - defensive and offensive alliances, and non-aggression pacts;
  - trade agreements and customs unions;
  - basing rights, military access and intelligence sharing;
  - arms control with verification, and border agreements.
- **International organisations.**
  - A UN-style General Assembly and Security Council. The permanent members with a veto are the four in the
    game: the United States, China, Russia and the United Kingdom.
  - Resolutions: condemnation, sanctions, peacekeeping, authorising force.
  - A G20-style forum (all 16 nations are G20 members).
  - A trade organisation that rules on disputes, and an IMF/World Bank analogue that lends with conditions.
  - Membership, votes, budgets and elected officials in each.
- **The starting blocs, from the real world:**
  - a North Atlantic alliance: the United States, Canada, the United Kingdom, Germany and Turkey;
  - USMCA and Mercosur (Brazil, Argentina);
  - BRICS: Brazil, Russia, India, China, South Africa;
  - the US alliances with Japan, South Korea and Australia;
  - Five Eyes: the United States, the United Kingdom, Canada and Australia;
  - the Quad: the United States, Japan, India and Australia.
- **Balance of power.** Governments balance against threats with alliances and arms build-ups, or bandwagon with
  strong neighbours. They hedge between powers and compete for spheres of influence. Security dilemmas produce
  arms races.
- **Leaders matter.**
  - The head of government is a citizen with traits: hawk or dove, appetite for risk, ideology or pragmatism,
    nationalism.
  - Those traits shape foreign policy within domestic limits: public opinion, congress and elections.
  - A change of leader can change a nation's course.
- **Crisis diplomacy.** Escalation ladders, signalling (mobilisation, exercises, embargoes), brinkmanship,
  face-saving exits, and mediators.
- **Trade policy and sanctions.**
  - Tariffs, quotas, targeted and sectoral sanctions, and secondary sanctions.
  - Evasion through smuggling (1.7).
  - Measurable costs in the national accounts.
- **Careers:** diplomat (attaché, ambassador, foreign minister), trade negotiator, international civil servant up
  to Secretary-General, lobbyist.
- **Stories:** "The summit", "A note from the embassy", "The vote in the Council".
- **UI:**
  - a Diplomacy screen: relations map, treaty browser, organisations and their votes;
  - briefings before decisions.
- **Done when:**
  - alliances form under threat and loosen without it;
  - sanctions cost their targets plausible shares of GDP;
  - long peaceful stretches happen, and so do betrayals when interests shift.

## 2.1.0 — Shadows (GEO 5: intelligence gets better)

- **Intelligence services as organisations.**
  - Directorates for human intelligence, signals, imagery, open sources, cyber, analysis, covert action and
    counter-intelligence.
  - Staff are citizens with careers.
  - Budgets and technology come from the strategic engine.
  - Tradecraft improves with experience and after failures.
- **Beliefs.**
  - Every government holds estimates of other nations' forces, technology, economy and intentions.
  - Each estimate has a confidence range that depends on how much has been collected.
  - AI decisions use these beliefs, so surprise attacks, intelligence failures and miscalculation can happen.
  - After the fact, an estimate can be compared with the truth.
- **Collection.**
  - Agent networks recruited among real foreign citizens, whose motives are money, ideology, coercion or ego.
  - Defectors and diplomatic cover.
  - Satellites (from 2.4) and signals stations.
  - Cyber intrusions into companies and ministries.
  - Open sources from the press.
- **Counter-intelligence.** Vetting, mole hunts, double agents and deception.
- **Covert action.**
  - Sabotage, influence campaigns and disinformation through the press.
  - Election interference, and support to insurgents (2.2).
  - Rarely, and with severe consequences: assassination and regime change (2.3).
- **Oversight.** Intelligence committees, leaks, whistle-blowers and journalists, and scandals.
- **Sharing.** Alliances like Five Eyes pool their estimates.
- **Careers:** case officer, analyst, station chief, director, asset for a foreign service, defector.
- **Stories:** "The walk-in", "Burned", "The estimate".
- **UI:**
  - estimates with their confidence;
  - a network map;
  - an operations board;
  - after-action reviews that show what was really true.
- **Done when:** better-funded services produce measurably more accurate estimates, and governments that
  misjudge rivals make the mistakes that follow from it.

## 2.2.0 — War & peace (GEO 6: realistic wars)

- **Why wars start.**
  - Expected costs and gains under uncertainty (from beliefs).
  - Power transitions, territorial claims and grievances.
  - Alliance commitments.
  - Domestic politics: diversion and nationalism.
  - Resource needs, and opportunity, such as a neighbour's civil war.
  - Deterrence (conventional and nuclear) and war-weariness from past wars hold wars back.
  - Congress still declares war where the constitution requires it.
- **Kinds of conflict.**
  - Invasion, limited war and punitive strikes.
  - Blockades and naval confrontation, and air campaigns.
  - Proxy wars, insurgency and counter-insurgency.
  - Grey-zone pressure: militias, coast guards, cyber and sabotage.
  - Terrorism by non-state groups, and peacekeeping.
- **Operations.**
  - General staffs plan campaigns.
  - Mobilisation calls up reservists, including the player and their family.
  - Logistics and supply, attrition, casualties among real citizens, and prisoners.
  - Occupation administration and resistance.
  - Refugees fleeing to neighbouring countries, through the population system.
  - War economies: factory conversion, rationing, war bonds, inflation.
- **Escalation.** An explicit ladder with thresholds. Nuclear use is extremely rare, governed by deterrence
  logic, and catastrophic.
- **Ending wars.**
  - War exhaustion from losses, costs and public opinion.
  - Negotiations and mediators, ceasefires and armistice lines.
  - Peace treaties: territory, reparations, demilitarised zones, guarantees, prisoner exchanges.
  - Frozen conflicts, surrender and imposed regimes.
- **Aftermath.** Reconstruction, veterans and their pensions (L4), memorials and tribunals, and revanchism that
  can feed the next war.
- **The old model is replaced.** The deadline-and-quota war model gives way to this one; the battle system stays
  as the tactical layer.
- **Careers:** front-line soldier (in the existing battles), officer commanding formations, war correspondent,
  medic, negotiator, resistance member, refugee.
- **Stories:** "The call-up", "Letters from the front", "Ceasefire", "Coming home".
- **UI:** a war room with the fronts on the map, war aims, public support, casualties and the negotiating
  table.
- **Realism.** War between states is rare. Onset, duration and lethality are calibrated to UCDP and Correlates
  of War base rates, and most crises end without war.
- **Done when:** decades-long runs produce few interstate wars, each with a traceable cause, and wars end in
  ways that match their course.

## 2.3.0 — Rise & fall (GEO 7: regimes, secession, new nations)

- **Regimes as sets of rules.** Full and flawed democracies, hybrid regimes, one-party states, personalist
  autocracies, military juntas and constitutional monarchies. Each has its own term limits, succession rules
  and emergency powers.
- **Transitions,** driven by performance, elites and the street:
  - democratisation and backsliding;
  - coups: officer networks of real citizens, loyalty, coup-proofing and purges, success or failure, and
    counter-coups, with base rates by regime type and income from the Powell & Thyne coup data;
  - revolutions: protest movements that grow or fade depending on repression and concessions.
- **Secession.**
  - Regional identity for each region: language, history, distinctiveness and grievances.
  - Independence parties and legal referendums, or unilateral declarations.
  - Secessionist conflict, and recognition by other states and organisations.
- **Civil war.** Factions holding territory, rebel formations, foreign intervention, power-sharing deals and
  partition.
- **Dynamic nations.**
  - New states arrive with generated names, flags, capitals, currencies and governments. The new currency joins
    the currency market.
  - Citizens' nationality follows the new border.
  - Unions, federations and currency unions.
  - Annexation, puppet states and failed states.
  - Governments in exile, and restorations.
- **Decline and rise.**
  - Nations decline through fiscal crisis, hyperinflation (money printing already exists), default (2.5), brain
    drain, demographic decline and loss of legitimacy.
  - They rise through reform, strong institutions, investment, alliances and technology.
- **Careers:** revolutionary, loyal or plotting officer, secessionist leader, founder who drafts a new
  constitution, mediator.
- **Stories:** "The night of the coup", "The referendum", "A new flag".
- **UI:**
  - the map redraws borders and adds or removes nations;
  - a Rise & Fall timeline;
  - regime type and legitimacy on the Country screen.
- **Neutrality.** Secession comes from region data and play, never from scripted real-world outcomes. The game
  takes no side.
- **Done when:** long runs show regime changes and border changes at plausible rates, and new states run and
  trade like any other.

## 2.4.0 — Frontiers (GEO 8: technology, cyber and space)

- **A near-future technology tree for 2030–2070,** grounded in current research:
  - AI and automation, robotics, drones and swarms;
  - hypersonics and directed energy;
  - quantum computing and cryptography;
  - biotechnology and medicine, which lengthen lives in the population model;
  - energy storage and advanced nuclear, with fusion only as a late, uncertain breakthrough;
  - materials, and semiconductors with supply-chain chokepoints;
  - space launch and satellites.
- **The innovation system.**
  - Universities (L3), company R&D (1.5) and government labs.
  - Researchers are citizens with careers, and discoveries are patented.
  - Technology spreads through trade, investment and espionage.
  - Export controls and technology alliances restrict it.
- **Cyber.** National cyber commands attack and defend power grids (1.9), companies and elections. Attribution is
  uncertain.
- **Space.**
  - Space agencies and launches.
  - Constellations for communications, reconnaissance and navigation, which feed intelligence and military
    capability.
  - Anti-satellite weapons and debris.
  - Prestige missions.
- **Society.** Automation removes some jobs and creates others (1.5), and inequality and politics respond.
- **Careers:** scientist, engineer, tech founder, hacker (white or black hat), astronaut.
- **Stories:** "The breakthrough", "Zero-day", "Launch window".
- **Done when:** technology leadership shifts with investment over decades, and a technology lead shows in the
  economy, armed forces and intelligence.

## 2.5.0 — A world of consequences (GEO 9: world economy, climate, soft power; the decades campaign)

- **The world economy.**
  - Central banks set interest rates and inflation targets, with more or less independence.
  - Government bond markets and credit ratings; defaults and restructurings; IMF-style bailouts with conditions.
  - Currency crises and pegs, reserve-currency status, and capital flows.
  - Stock-market booms and crashes (Holdings), contagion and global recessions.
  - Commodity super-cycles.
- **Climate over decades.**
  - Each nation's energy mix produces emissions, which set the path of global temperature.
  - Temperature shifts weather and hazard frequencies (1.9), puts pressure on coasts through sea level, moves
    farming zones and drives climate migration.
  - Climate treaties suffer from free-riding.
  - Green industries grow through the transition.
- **Soft power and information.**
  - Culture industries, universities and foreign students, tourism, and national image.
  - Propaganda and disinformation (2.1).
  - Prestige events: tournaments already exist; an Olympics-style games and a World Expo are added.
- **Demography at national scale.** Ageing and the cost of pensions (L4), immigration policy, refugee crises and
  diasporas.
- **The decades campaign.**
  - Start in 2030 and play to 2070 and beyond; generations (L6 succession) meet national histories.
  - Starting scenarios: the 2030 baseline, a new cold war, a multipolar world, or custom.
  - The **World Almanac**: every nation, leader, war, treaty, company and notable person, with statistics.
- **Done when:** 40-year headless runs match historical base rates for growth, wars, coups, regime changes, firm
  turnover and disasters, and the results are tuned where they don't.

---

## In every version

- **AI parity and actors that learn.** Anything new is usable by both player and AI, and AI organisations adapt
  from outcomes.
- **Stories.** Four to eight new story chains and encounters on the version's theme, using the story engine,
  memories and appointments.
- **Interface.** New screens use the design system, join the back/forward history, and are covered by the
  browser play-test.
- **Performance.** Every system has a time budget, measured in the headless simulations.
- **Saves.** Migrations for older saves, checked by the upgrade test on every release.
- **Docs.** Release notes for every patch, and this roadmap is updated as parts land.

## Links to the life plan (1.4)

- **L3** (schools and universities) supplies human capital, qualifications and researchers.
- **L4** (obligations and pensions) supplies national debt service, veterans' pensions and the burden of ageing.
- **L5 and L6** (estates, succession and legacy) supply family businesses, dynasties in politics and business,
  and the generational campaign of 2.5.
- **L6** (NPC AI parity) is the foundation for "AI can do anything the player can do" in every part above.
