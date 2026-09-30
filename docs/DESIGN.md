# Meridian Reach: design notes

This is a single-player adaptation of the society-simulation systems described in the *Eclesiar feature
reference and single-player game brief*. It is **not** a copy of Eclesiar's code, data or assets. The world,
names and writing are original. Where the brief marks a rule as **documented** (current announcements), a
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
- **Modules:** `sim/` (rules), `ai/` (behaviour), `ui/` (screens), `data/` (tables). Later systems plug in
  through `sim/systems.ts` hooks, so depth can be added without touching the loop.

## The simulated society

- **Full AI citizens** (default 36 per nation) have identity, persona (worker, soldier, industrialist,
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
| Travel | Walk to a neighbour for 15 energy, or use a ticket (range 1/2/3/4/6 hops by quality, 5 energy per hop, −10% per quality). |
| Mining | Yields 0.5/0.8 gold (WIKI) × equipment × (1 + 0.02·eco skill) × studies × world multiplier. |
| Other values | Everything in `balance.ts` tagged `SOLO`: recipes, living costs, household spending, starting wages, AI pricing, tournament sponsorship, pirate strength and so on. |

## Acceptance checklist (brief §17)

All items are covered by automated tests (`npm test`, 35 passing) and the headless audit. The browser smoke
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

- **World scale:** eight fictional nations on a ~70-region hex map, with about 300 full citizens by default
  (24/36/48 per nation is selectable). There is no real-world geography.
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
