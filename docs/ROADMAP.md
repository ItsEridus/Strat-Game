# Roadmap after 1.4: a world that moves (1.4.x → 3.0.0)

Version 1.4.0 completes the life simulation (see `LIFE_PROGRESS.md`). From there, the plan turns to the world
around the player. The main thread is the geopolitical simulation requested on 30 September 2026. Nations and
AI actors advance over time: militaries and intelligence services get better, companies expand or disband,
nations rise and fall, and wars happen, all realistically. The earlier after-1.4.0 requests are included where
they belong: careers and employment, policing and crime careers, prisons, weather and natural disasters.
It opens with a deep economic overhaul (requested the same day), because wages and prices must be realistic before
anything is built on them. The calendar now starts on 1 January 2025 (from 1.3.3), so the economy can be anchored to
real present-day data.

Two threads were added on 1 October 2026: **character creation and customisation** (1.4.x, straight after 1.4.0) and
a **deeper life simulation** after the geopolitical thread (2.6.0 → 3.0.0, "Life 2.0").

Parts marked **GEO** are the geopolitical simulation. Every version ships as a series of playable patch
releases (every push is a release); the minor version marks its theme complete. The parts of a theme ship as patches of the
version before it (2.0's parts were 1.9.3 to 1.9.7, and 2.0.0 marked it complete), so 2.1's parts were 2.0.1 to 2.0.4, 2.2's were 2.1.1 to 2.1.3, 2.3's were 2.2.1 to 2.2.5, 2.4's were 2.3.1 to 2.3.5, and 2.5's are 2.4.x.

## At a glance

| Version | Theme | What the player sees | Status |
| --- | --- | --- | --- |
| 1.4.x | **Character creation & customisation** | Design who you are before you are born: looks, background, family, personality and talents; change your look over a life | ✅ done |
| 1.5.0 | **The real economy** (ECON: a deep economic overhaul) + **Work & enterprise** (GEO 1: companies expand or disband) | Prices, wages, rents, taxes and interest that match each real country; payslips and household budgets; a working life in any occupation; firms that are founded, grow, merge, go public and go bust | ✅ done |
| 1.6.0 | **The strategic engine** (GEO 2: nations advance over time) | Economies grow or stall, budgets shift, capabilities improve or decay, and the power ranking moves for reasons you can read; years pass in minutes | ✅ done |
| 1.7.0 | **Law & order** | Police, crime, courts and prisons as full careers and institutions | ✅ done |
| 1.8.0 | **Arsenal** (GEO 3: militaries get better) | Defence budgets, R&D programmes, equipment generations, procurement from real defence firms, arms trade, doctrine that learns | ✅ done |
| 1.9.0 | **Sky & ground** | Real weather and climate zones, natural hazards by real geography, resources and energy | ✅ done |
| 2.0.0 | **The great game** (GEO 4: diplomacy and the international order) | Treaties, alliances, sanctions, a Security Council, blocs and summits; leaders whose character shapes policy | ✅ done |
| 2.1.0 | **Shadows** (GEO 5: intelligence gets better) | Services that grow and learn; governments act on estimates, so surprise and miscalculation happen | ✅ done |
| 2.2.0 | **War & peace** (GEO 6: realistic wars) | Wars with causes, escalation, fronts, mobilisation, exhaustion, negotiated endings and long aftermaths | ✅ done |
| 2.3.0 | **Rise & fall** (GEO 7: regimes, secession, new nations) | Coups, revolutions, democratisation and backsliding, secession, civil wars, new and vanished states | ✅ done |
| 2.4.0 | **Frontiers** (GEO 8: technology, cyber and space) | A near-future technology race that changes economies, armies and spying | ✅ done |
| 2.5.0 | **A world of consequences** (GEO 9: world economy, climate, soft power) | Debt crises, central banks, climate over decades, soft power; the decades-long campaign and the World Almanac | ▶ in progress: central banks, ratings and defaults (2.4.1), markets, currencies and commodity cycles (2.4.2), climate (2.4.3), soft power and prestige events (2.4.4) |
| 2.6.0 | **Life 2.0: the mind** | Personality that grows from experience, values, mental health in depth, habits and addictions, therapy | planned |
| 2.7.0 | **Life 2.0: the social fabric** | Friend circles, rivals, communities, relationships under each country's laws, custody and blended families, family gatherings | planned |
| 2.8.0 | **Life 2.0: the everyday** | A day planner, commuting and cars, cooking, sleep, fitness and the body, shopping, chores | planned |
| 2.9.0 | **Life 2.0: culture and belonging** | Faith, festivals, languages, migration and integration, identity | planned |
| 3.0.0 | **Life 2.0: generations** | Dynasties over centuries: family trees, inherited looks and traits, the family name, ancestral homes and businesses, a family chronicle | planned |

**Why this order.** Each part builds on the ones before it:
- A realistic economy comes first: money, prices, wages and costs underpin every later part.
- Companies and jobs come next, because national wealth, the defence industry and technology are produced by them.
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
  starts from real-world baselines for the 16 nations (real 2024–2025 data; the calendar starts on 1 January 2025).

---

## 1.4.x — Character creation & customisation (requested 1 October 2026)

**Goal.** Before a campaign starts, players design who they are, not just a name and a country. Every choice is a
real starting condition in the simulation, not a cosmetic flag, and the look can change over a life.

- **Who you are.**
  - Name, sex and pronouns (used everywhere the game writes about you).
  - Date of birth (with the start age: newborn, 16, 18 or 24), birthplace by region (or "anywhere in the country",
    weighted by population as today).
  - Ideology and how strongly it is held, and a faith or none (faith is used fully from 2.9).
- **Appearance and portrait.**
  - A layered portrait generator (face shape, skin tone, eyes, eyebrows, nose, mouth, hair style and colour,
    facial hair, glasses, scars, tattoos), drawn as SVG with no external assets.
  - It ages with you: grey hair, lines, posture; children get a blend of both parents' features.
  - Shown on the profile, the top bar, the Life screen, conversations and the family tree. Every NPC gets a generated
    portrait from a stable hash, so nobody looks alike.
- **Family background.** One of five starting households (struggling, working, middle, comfortable or wealthy),
  chosen or rolled with each country's real income distribution. It sets the parents' jobs and savings, the family
  home (housing from 1.3.13), the school quality and any inheritance. Siblings and grandparents can be chosen to
  exist.
- **Personality.** The five existing traits (ambition, risk, loyalty, greed, activity) set with a point budget or
  from a short questionnaire, plus two to three quirks (night owl, frugal, charming, hot-headed, worrier...), each
  with a small, documented effect in the simulation.
- **Talents.** Aptitudes that speed learning-by-doing for a group of skills (a head for numbers, a natural leader,
  good with hands, athletic, artistic), and one weakness. They work through the existing practice formula, so no
  new stats.
- **Presets and randomise.** "Random life" rolls everything from real distributions; presets for quick starts
  (a factory worker in Detroit, a student in Seoul, a farmer's child in Brazil...); save and share a character code.
- **Customisation during play.**
  - Haircuts, clothes and accessories bought with real money (clothing goods from the market show on the
    portrait).
  - A name change on marriage (by country custom); glasses, tattoos and piercings.
  - Fitness and age change the body.
- **NPC parity.** NPCs are generated with the same building blocks (background, personality, quirks, talents, look),
  so the people around you are as varied as you.
- **UI.** A step-by-step creation screen (Identity → Looks → Family → Personality → Talents → Summary) with a live
  portrait and a plain-language summary of what each choice changes; a "Change your look" panel later.
- **Saves.** Older saves get portraits and backgrounds from a stable hash; nothing changes for existing characters'
  stats.
- **Done when:** a campaign can be started from a fully designed character in under two minutes or from one click,
  every choice shows in the first hour of play, and portraits are distinct across 10,000 people.
- **Progress:** portraits for everyone and the creation screen (identity, looks, birthplace, politics) shipped in
  1.4.1; family background, talents, quirks and personality in 1.4.2; presets, random life, character codes and
  changing your look during play in 1.4.3. **1.4.x is complete.**
- **Releases, in order:** portraits for everyone → creation screen (identity, looks) → family background →
  personality, quirks, talents → presets, random life, character codes → customisation during play.

## 1.5.0 — The real economy (ECON) and work & enterprise (GEO 1)

### Part A: the real economy (a deep economic overhaul)

*Requested on 30 September 2026: wages, prices and the rest of the economy should be realistic.*

**What is unrealistic today.**
- Every currency starts at 100 per gold, so a dollar, a rupee and a yen are worth the same.
- Starting wages are 8 per shift in every currency, and living costs are 4 a day everywhere.
- Prices are a fixed markup on the cost of a few raw inputs. There are no rents, energy or capital costs, and
  productivity does not set pay.
- Money is created at the start in round amounts, so price levels drift with nothing to anchor them.

**Goal.** Prices, wages and costs a player recognises:
- a coffee costs roughly what it costs in that country;
- a nurse earns a nurse's wage, and rent takes a realistic share of a low income;
- differences between nations follow real price levels and incomes.

- **Money and price levels anchored to reality.**
  - Each currency starts at its real exchange rate (early 2025), with real minor units (cents, paise; the yen and
    won have none).
  - Each nation's price level comes from real purchasing-power data (World Bank ICP), so the same basket costs
    very different amounts in the United States, India and Argentina.
  - A national consumer price index follows a real basket (food, housing, energy, transport, clothing,
    electronics, health, services), tracked monthly.
  - Inflation comes from money growth, demand and costs, not from a drift.
- **Wages from productivity and the labour market.**
  - Pay by occupation, skill and region, anchored to national statistics (ILO, OECD): minimum wages at their real
    levels, realistic medians, and a realistic gap between a cleaner and a surgeon.
  - Wages move with productivity, unemployment (tight markets push pay up), inflation (indexation, contracts),
    unions and minimum-wage laws. Nominal wages are sticky, with annual raises.
  - Hourly and salaried work, overtime, and payslips showing gross pay, income tax, social contributions and net
    pay.
- **Households and the cost of living.**
  - Every household has a real budget: rent or mortgage (with housing from L4), food, utilities and energy,
    transport, clothing, health, education, leisure and savings. The shares follow national household-budget
    surveys.
  - Background households become real consumers. Their income comes from wages, pensions and benefits, and their
    spending responds to prices and confidence.
  - Poverty, comfort and wealth are defined by each nation's income distribution, and inequality (Gini) is
    measured.
- **Companies' economics.**
  - A full cost structure: wages and payroll taxes, inputs, energy, rent for premises, equipment and
    depreciation, interest and taxes.
  - Prices are set from costs, demand and competition. Firms in concentrated industries have market power, and
    prices are sticky, with sales and promotions.
  - Productivity comes from capital, technology, management and scale, up to capacity limits.
  - Profits go to dividends, retained earnings and investment decisions based on expected returns.
  - Services become industries too: retail, hospitality, transport, finance, health, education, housing
    (landlords) and utilities.
- **Markets and trade.**
  - Regional prices with transport costs.
  - National markets linked by trade: imports and exports by companies, tariffs and quotas, exchange rates that
    change competitiveness, and supply chains across borders.
  - World commodity prices (oil, grain, metals) with realistic volatility.
- **Taxes and public finance.**
  - Income tax brackets, social contributions, VAT/GST or sales tax, corporate tax, property tax, excise and
    tariffs, at each nation's real 2025 rates (OECD, IMF), simplified to a few brackets.
  - Public spending on the wages of teachers, nurses, police and soldiers, on pensions, benefits, infrastructure
    and defence.
  - Budgets, deficits, and public debt with interest.
- **Banks, credit and interest.**
  - Commercial banks, as companies, take deposits and lend to households and firms.
  - Interest rates follow the central bank's policy rate plus risk.
  - Mortgages and business loans; defaults, bank failures and deposit insurance.
  - A first version of central banks: a policy rate that responds to inflation and unemployment. 2.5 extends
    them.
- **Economic statistics.**
  - Each nation reports monthly GDP (by spending and by income), prices, unemployment, wages, productivity, the
    trade balance and interest rates, with charts.
  - All of them are computed from the simulated transactions in the ledger, not invented.
- **Start year.**
  - The calendar begins on 1 January 2025 (from 1.3.3), so starting values come from real 2024–2025 data.
  - Later, selectable start years with period-accurate prices and wages: 2000, 2008, 2020 or the present (see
    2.5).
- **Upgrading saves.** Each currency is re-denominated once, like a currency reform. Balances, prices and wages
  are scaled to real levels, keeping everyone's relative position.
- **AI.** Firms, households, banks and governments respond to prices, wages and interest rates by visible rules.
  The player sees the same information: price histories, wage offers and rates.
- **UI.**
  - Payslips and a household budget.
  - Prices in local currency, and a cost-of-living comparison between nations.
  - Company profit-and-loss and balance sheet.
  - A national economy dashboard.
- **Realism.** Calibrated to the IMF World Economic Outlook, World Bank ICP, ILO and OECD wage data, national
  household-budget surveys, the OECD tax database, and central bank rates (2024–2025).
- **Done when:**
  - in five-year headless runs, each nation's price level, wages, inflation and unemployment stay within their
    real ranges;
  - household budgets balance;
  - the ledger audit shows no money created or lost outside the recorded sources.
- **Releases, in order:**
  1. money and price levels;
  2. wages and payslips;
  3. households and the cost of living;
  4. company costs and pricing;
  5. taxes and public finance;
  6. banks and interest;
  7. statistics and dashboards.
- **Progress:**
  - 1.4.4: money and price levels.
  - 1.4.5: wages and payslips. Amounts are kept in units of local pay. One unit is the same share of a typical
    day's pay everywhere: about US$25 in the US, ₹98 in India. Each currency shows real money at real 2025 pay,
    and gold is worth $2,500 at market exchange rates in every currency.
  - 1.4.6: households and the cost of living. Budgets are split by national surveys, inequality and poverty are
    measured, and household spending responds to confidence.
  - 1.4.7: company costs and pricing. Companies pay rent for premises, energy and corporate tax at real
    rates, keep accounts, and price in their overheads.
  - 1.4.8: taxes and public finance. Taxes start at real 2025 rates, income tax is progressive, and governments
    borrow, pay interest and repay public debt.
  - 1.4.9: world commodity prices, import parity, AI exports and trade statistics.
  - 1.4.10: monthly statistics (GDP, CPI, inflation, unemployment, pay, trade) and an Economy panel.
  - 1.4.11: central banks (a Taylor rule), rates that follow them, interest on savings and business loans.
  - 1.4.17–1.4.18: calibration fixes (runaway wages and minimum wages, empty economies, firm churn, speed).
  - 1.5.0: Part A complete. A one-year test run stays within 91–97% employment, and every treasury but one stays
    solvent. Longer runs and growth calibration continue in 1.6.

### Part B: work & enterprise (GEO 1: companies expand or disband)

*Includes the careers and employment overhaul requested earlier. It builds on Part A and on the industries added
in 1.3.3.*

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
- **Progress:** 1.4.12 brought occupations (67 in 14 families), industry pay levels, redundancy pay, unemployment
  benefit by country and collective bargaining; 1.4.13 self-employment and owned cafés and restaurants; 1.4.14 company closures
  (insolvency and winding up, settled in legal order), business demography and an industry overview with HHI;
  1.4.15 takeovers, the competition authority and four stories of working life. **Part B is complete in 1.5.0.**

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
  - 2025 baselines for all 16 nations: shares of world GDP, growth potential, debt ratios, R&D intensity and
    education, from IMF and World Bank projections.
  - Yearly growth stays within historical ranges, and long-run growth between 1% and 6% a year.
- **Done when:**
  - 30-year headless runs keep growth within bands;
  - no nation runs away without cause;
  - catch-up growth is visible;
  - crises happen and are recovered from;
  - coarse and full detail give statistically similar national results;
  - a year of a full world passes in at most 3 minutes.

- **Progress:**
  - 1.5.1: capabilities and the monthly strategic turn.
  - 1.5.2: budgets and grand strategy.
  - 1.5.3: a scroll fix.
  - 1.5.4: power history, tiers and the State of the World.
  - 1.6.0: level-of-detail time, growth calibrated for 30 years, and fiscal fixes.
  - Not yet met: the target of a full default world simulating a year in at most 3 minutes. It takes about 13
    minutes today, and smaller worlds are proportionally faster.

- **Progress:** shipped as 1.6.0: the monthly strategic turn and the pace of history, capability stocks and
  growth, national budgets and grand strategy, the power index and level-of-detail time, calibrated over 30 years.
  **Complete in 1.6.0.**

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
- **Progress:**
  - 1.6.1: prisons.
  - 1.6.2: courts.
  - 1.6.3: white-collar crime, laundering and informants.
  - 1.6.4: policing as an institution.
  - 1.7.0: calibration.
  - In a 90-day test of the default world:
    - incarceration stays within about 20% of each country's real rate;
    - US convictions are 99% guilty pleas and Japanese ones 6%;
    - conviction rates are about 95% in Japan and Korea and 75–90% elsewhere.
    - clearance is 47–67% of reported crimes;
    - trust in the police runs from about 15–20 in Russia and Mexico to about 60 in the US and western Europe.
  - Still to do: counter-terrorism waits for 2.1.

- **Progress:** 1.6.1 prisons; 1.6.2 the courts; 1.6.3 white-collar crime, laundering and informants; 1.6.4
  policing as an institution; 1.7.0 calibration (prison populations, pleas, convictions, clearance, police trust).
  **Complete in 1.7.0.**

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
- **Progress:**
  - 1.7.1: budgets and generations.
  - 1.7.2: R&D programmes and the arms trade.
  - 1.7.3: force structure, doctrine and strategic forces.
  - 1.7.4: careers and stories.
  - 1.8.0: calibration (`tests/arsenalcal.ts`). Over 30 strategic years at real budgets:
    - fighter programmes take 12–20 years;
    - the leading powers reach generation 5.5;
    - average fleet ages settle at 22–26 years, near the US Air Force's real average of about 29;
    - a country that stops funding its forces ages from 44 to 74 years and cancels its programmes;
    - the ledger audit passes.

- **Progress:** 1.7.1 the arsenal (equipment by class, generation and age); 1.7.2 R&D programmes and the arms
  trade; 1.7.3 force structure, doctrine and strategic forces; 1.7.4 defence careers and stories; 1.8.0
  calibration over 30 strategic years. **Complete in 1.8.0.**

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

- **Progress:**
  - 1.8.1: weather and climate.
  - 1.8.2: natural hazards.
  - 1.8.3: energy and resources.
  - 1.8.4: food security, careers and stories.
  - 1.9.0: calibration (`tests/naturecal.ts`). In a simulated year:
    - about 90 natural disasters strike the 16 countries, most of them minor, with a few thousand deaths;
    - blackouts are frequent where grids are weak (India, Russia, Turkey, South Africa) and rare in Germany and
      Britain;
    - OPEC+ trims output when oil is cheap;
    - the audit passes.
  - Still to do: national harvests vary by only a few per cent a year (real yields vary more), and terrain has no
    elevation, so highland cities run warm.

- **Progress:** 1.8.1 weather and climate; 1.8.2 natural hazards; 1.8.3 energy and resources; 1.8.4 food security,
  emergency careers and disaster stories; 1.9.0 calibration (disasters at real rates, harvests, food imports).
  Also requested along the way: top speed of a day per second (1.9.0), skipping a year (1.9.1), and skipping a year
  statistically in seconds (1.9.2). **Complete in 1.9.0.**

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

- **Progress:** 1.9.3 relations 2.0 (trust, affinity, threat, trade ties, grievances, prestige, leaders' outlook);
  1.9.4 treaties as objects (the 2025 order seeded from real treaties) and diplomatic actions with capital and
  costs; 1.9.5 the UN Security Council and General Assembly, the G20, WTO disputes and IMF programmes; 1.9.6 crises
  with an escalation ladder, arms races, balancing and bandwagoning, polarity, and the growth cost of sanctions;
  1.9.7 diplomatic careers and the three stories; 2.0.0 calibration over decades (rivalries persist, deterrence in
  crises). **Complete in 2.0.0.**
- **Not yet built, carried forward:** offensive alliances and military access; recognition; customs unions;
  per-partner tariffs and quotas, sectoral and secondary sanctions and smuggling to evade them (→ 2.5); UN
  peacekeeping and resolutions authorising force (→ 2.2); a Secretary-General and organisation budgets; spheres of
  influence and hedging; a relations map and briefings before decisions; a foreign minister in the cabinet.

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

- **Progress:** 2.0.1 services as organisations (eight directorates from the real services, moved by money,
  technology, people and lessons from failure); 2.0.2 beliefs (estimates with ranges that every war, crisis and
  alliance decision uses, surprise attacks); 2.0.3 collection (agents with motives and placements, defectors,
  diplomatic cover, cyber intrusions); 2.0.4 mole hunts, double agents and deception, oversight and scandals at
  home, Five Eyes sharing, election interference; 2.1.0 the three stories and calibration (the best-placed services
  make the smallest errors). **Complete in 2.1.0.**
- **Not yet built, carried forward:** support to insurgents (→ 2.2), assassination and regime change (→ 2.3),
  satellites and signals stations as built assets (→ 2.4), a network map.

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
- **The war chronicle.** Requested on 30 September 2026; a first version ships in 1.3.4 for the current war
  model. Every war keeps an extremely detailed record that can be read during and after it:
  - **Why it started.** The decision in full:
    - who proposed it, and how congress voted;
    - each factor the government weighed: balance of power, relations and their history, grievances and
      claims, ideology, border tension, resources at stake, public mood, alliances, what intelligence believed;
    - what the war aims were;
    - how the other side saw it.
  - **How it went.** A dated timeline:
    - mobilisation and every battle (rounds, damage, losses, commanders, heroes);
    - occupations and counter-occupations;
    - supply lines cut and blockades;
    - offers of peace, and who accepted or refused them and why;
    - allies joining or staying out;
    - the home front: approval, war mood, prices, protests;
    - casualties among real citizens, and the cost in money and equipment.
  - **Why it ended.** What decided it (a war aim achieved, exhaustion, collapse at home, mediation, a deadline,
    exile), the exact terms, and who gained and lost what.
  - **Aftermath.** Territory and buildings, reparations, pacts, veterans and memorials, how relations changed,
    and grievances that may start the next war.
  - **Browsing.** Every past war is kept in a searchable archive with statistics, and linked from the chronicle,
    each nation's history and the Almanac.
- **Careers:** front-line soldier (in the existing battles), officer commanding formations, war correspondent,
  medic, negotiator, resistance member, refugee.
- **Stories:** "The call-up", "Letters from the front", "Ceasefire", "Coming home".
- **UI:** a war room with the fronts on the map, war aims, public support, casualties and the negotiating
  table.
- **Realism.** War between states is rare. Onset, duration and lethality are calibrated to UCDP and Correlates
  of War base rates, and most crises end without war.
- **Done when:** decades-long runs produce few interstate wars, each with a traceable cause, and wars end in
  ways that match their course.

- **Progress:** 2.1.1 why wars start (a war calculation from beliefs: gains weighted by the chance of winning
  against costs, deterrence and the democratic peace; wars during statistical skips); 2.1.2 the home front
  (mobilisation, casualties among real citizens, prisoners, occupation and partisans, refugees, the war economy,
  each war's toll); 2.1.3 how wars run and end (kinds of war, exhaustion, an escalation ladder up to nuclear
  threats, the deadline as a review that lets wars drag on, freeze or peter out, peace treaties with reparations
  and demilitarised zones); 2.2.0 the aftermath (memorials, tribunals, veterans), the new events in the war
  chronicle, the four stories, and calibration (a decade brings few wars, each with a recorded cause).
  **Complete in 2.2.0.**
- **Not yet built, carried forward:** proxy wars, insurgency and counter-insurgency, grey-zone pressure beyond
  crises, terrorism by non-state groups and peacekeeping (→ 2.3, with civil wars; proxy wars, insurgency and
  peacekeeping were built in 2.2.5); blockades and air campaigns as
  kinds of war of their own (the naval and air layers exist); a separate war room screen (the Wars screen and the
  war history cover it); war correspondent, medic and resistance member as careers.

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
- **Progress:** 2.2.1 regimes as rule sets (elections, term limits, press, repression, succession; legitimacy;
  backsliding and opening up); 2.2.2 coups and revolutions (officer plotters, coup-proofing, purges and treason
  trials; protest movements, concessions and repression; revolutions and early elections); 2.2.3 secession and new
  states (regional identity, support for independence from 2025 polls, referendums and unilateral declarations;
  new states with their own currency, government, citizens and recognition); 2.2.4 civil wars (rebel governments
  with troops; crushed, rebel victory or partition), mergers and voluntary unions, failed states and restoration
  from exile; 2.2.5 puppet states, arming rebels, UN peacekeepers and insurgency; 2.3.0 the three stories, the
  Rise & Fall timeline on the State of the World screen, and calibration (sixty simulated years bring a handful of
  coup attempts and, in some runs, a successful referendum; civil wars and new borders are rare but possible).
  **Complete in 2.3.0.**
- **Not yet built, carried forward:** federations and currency unions (→ 2.5, with the world economy); decline
  through hyperinflation, default and brain drain as named paths (→ 2.5); flags drawn for new states (they get
  their own colours and names); revolutionary, plotter and secessionist-leader careers beyond what stories and
  office already allow; recognition by international organisations beyond the UN vote.

## 2.4.0 — Frontiers (GEO 8: technology, cyber and space)

- **A near-future technology tree for 2025–2075,** grounded in current research:
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
- **Progress:**
  - 2.3.1: the technology tree (26 technologies, breakthroughs, diffusion and export controls, effects on growth,
    forces, intelligence, health and energy).
  - 2.3.2: the innovation system (government research as a career, the research workforce, patents and
    royalties, technology partnerships, stolen designs).
  - 2.3.3: cyber commands (grids, ransomware, hack and leak, uncertain attribution).
  - 2.3.4: space (agencies, constellations and their effects, launchers, anti-satellite weapons and debris,
    prestige missions).
  - 2.3.5: automation and society (machines replace routine jobs, displaced workers, backlash and robot taxes).
  - 2.4.0: the astronaut corps and crews, the stories, the technology race table, and calibration. A country
    that triples its research spending overtakes the leaders within thirty years, makes most of the world's
    breakthroughs, and grows faster.
  - **Complete in 2.4.0.**
- **Not yet built, carried forward:**
  - a "Zero-day" story (replaced by "The machines are coming"); hackers remain intelligence officers in the
    cyber directorate;
  - tech founders beyond founding firms in electronics and medicine;
  - semiconductor chokepoints as a supply chain of their own (→ 2.5, with the world economy).

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
  - Start in 2025 (or an earlier year) and play to 2070 and beyond; generations (L6 succession) meet national
    histories.
  - Starting points: the present day (2025), earlier start years with period-accurate economies (2000, 2008,
    2020), a new cold war, a multipolar world, or custom.
  - The **World Almanac**: every nation, leader, war, treaty, company and notable person, with statistics.
- **Done when:** 40-year headless runs match historical base rates for growth, wars, coups, regime changes, firm
  turnover and disasters, and the results are tuned where they don't.

---

## 2.6.0 → 3.0.0 — Life 2.0: a deeper life simulation (requested 1 October 2026)

After the world can move, the life lived inside it gets deeper. Each part builds on the life systems of 1.3–1.4
(families, wellbeing, education, housing, health, pensions, legacy) and keeps the rules: the same for every person,
paid through the ledger, explainable, saved and tested.

### 2.6.0 — The mind
- **Personality that grows.** The traits from 1.4.x drift with experience: a war veteran's caution, a bankrupt's
  frugality, success breeding ambition. Each change is recorded with its cause.
- **Values and beliefs** (family, career, faith, community, freedom) shape choices, conflicts in relationships and
  how people vote.
- **Mental health in depth.** Anxiety, depression and burnout, plus grief that changes over time. Therapy, medication
  and support from family and friends (clinics from 1.3.15). Stigma and access vary by country.
- **Habits and addictions.** Smoking, drinking, gambling and gaming, with their costs, health effects, and paths to
  quitting (with relapse).
- **Memories between NPCs.** Not only about the player: grudges, gratitude and old flames between everyone, so
  communities have histories.

### 2.7.0 — The social fabric
- **Circles.** Friend groups, workmates, neighbours, clubs (from hobbies), congregations; reputation within each
  circle.
- **Relationships under each country's laws.** Same-sex partnerships and marriage where legal, civil unions,
  cohabitation; divorce law and alimony by country.
- **Families that change.** Custody arrangements and visiting rights, step-parents and blended families, family
  feuds and reconciliations, gatherings (weddings, funerals, holidays) that bring the family together.
- **Rivals and enemies** with long-running feuds, gossip and rumours that spread through circles.
- **Dating** through friends, work, hobbies and apps, with compatibility from values and personality.

### 2.8.0 — The everyday
- **A day planner.** Hour-by-hour schedules, where the existing routine becomes a calendar: work, commute, study,
  family, hobbies, sleep.
- **Getting around.** Commuting times from home to work, public transport, buying and running a car (fuel and energy
  prices from 1.9), accidents.
- **Body and health habits.** Sleep, diet, cooking versus eating out, fitness and weight, all feeding health from
  1.3.15.
- **Home life.** Furniture and home improvements (raising home value), chores and how a household shares them,
  household appliances and bills.

### 2.9.0 — Culture and belonging
- **Faith and festivals.** The major religions by country (real shares), places of worship as venues, religious
  holidays and national festivals on the calendar, and faith communities as circles.
- **Languages.** Each country's languages, learning one (as a course or by living there), and how language affects
  jobs and friendships abroad.
- **Migration and integration.** Moving abroad as a life choice: visas, citizenship tests, culture shock, diaspora
  communities, sending money home.
- **Identity.** Regional and national identity, pride and division, all feeding politics from GEO 7.

### 3.0.0 — Generations
- **Dynasties.** Play a family across a century or more. The legacy archive (1.3.18) becomes a full family chronicle
  and an interactive family tree.
- **Inheritance of looks and traits.** Portraits (1.4.x) blend across generations; talents and temperaments run in
  families, with regression to the mean.
- **The family name.** Reputation that carries across generations (built on familyRegard from 1.3.9); old money and
  new money; family businesses handed down (from 1.5); political dynasties (from 2.3).
- **Ancestral places.** The family home kept or sold, graves and memorials, returning to a birthplace.
- **Done when:** a hundred-year family campaign stays fast and coherent, every generation's life is in the
  chronicle, and descendants visibly resemble their ancestors in looks, temperament and fortune.

## In every version

- **AI parity and actors that learn.** Anything new is usable by both player and AI, and AI organisations adapt
  from outcomes.
- **Stories.** Four to eight new story chains and encounters on the version's theme, using the story engine,
  memories and appointments.
- **Interface.** New screens use the design system, join the back/forward history, and are covered by the
  browser play-test.
- **Performance.** Every system has a time budget, measured in the headless simulations.
- **Saves.** Migrations for older saves, checked by the upgrade test on every release.
- **What's new.** From 1.3.3, the game shows each update's release notes the first time it starts after an
  update: every release notes section is also the in-game "What's new".
- **Docs.** Release notes for every patch, and this roadmap is updated as parts land.

## Links to the life plan (1.4)

- **L3** (schools and universities) supplies human capital, qualifications and researchers.
- **L4** (obligations and pensions) supplies national debt service, veterans' pensions and the burden of ageing.
- **L5 and L6** (estates, succession and legacy) supply family businesses, dynasties in politics and business,
  and the generational campaign of 2.5.
- **L6** (NPC AI parity) is the foundation for "AI can do anything the player can do" in every part above.
