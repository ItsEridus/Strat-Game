# Life simulation: progress and continuation record

This file tracks the life-simulation work (the "BitLife integration template"),
together with the narrative stages, the military career review and the UI
overhaul that were folded into the same plan. It says what is implemented,
what remains, and the known limitations, so work can resume from here.

## Releases: every push is a release

Standing rule from the player (30 Sep 2026): every push to GitHub ships a working release they can play. Each push:

1. Bump the version: `npm version patch --no-git-tag-version` (1.3.2, 1.3.3, …; 1.4.0 when the life plan is done).
2. Add a `### New in X.Y.Z` section at the top of `docs/RELEASE_NOTES.md`. The release page shows this file, and the
   build embeds each section as the in-game "What's new" shown after the update, so write it for players.
3. Check locally: `npm run typecheck`, `npm test`, `npm run build`, then the browser play-test
   `PLAYWRIGHT_PATH=$(npm root -g)/playwright PREV_DIR=<previous release's web build> node tools/smoke.mjs`
   (unzip the latest release's `-web.zip`; the upgrade test loads a game saved by it). Launcher changes: `go test`
   in `launcher/` (needs `launcher/web`, made by `launcher/build.sh`).
4. Push to `claude/brave-mccarthy-h4uawp`, then follow the Release run to the end (tests, browser play-test,
   Windows smoke test, publish) and confirm the release has `MeridianReach.exe`, `MeridianReach.exe.sha256` and
   the `-web.zip`.

The workflow enforces the first two: a branch push whose version is already released, or whose version has no
release notes, fails instead of silently not releasing. Unfinished work is committed only once it plays; large
stages go out in slices.

## Plan and order

| # | Stage | Status |
| --- | --- | --- |
| – | Population foundation: ageing, health, deaths with estates, families, migration, regions of 24–100 | Done |
| – | No levels: skills by practice, reputation, life gates | Done |
| L1 | Lifecycle: pace of life, stages, age gates, birthdays, annual review, long advances, routine, Life hub | Done (see below) |
| M1 | Military: civilian control (office holders go to the reserve), head of government as Commander-in-Chief, service age limits, veterans | Done |
| UI1 | Premium design system and game shell | Done |
| CLK | Clock overhaul: real calendar, descriptive date and time, seasons, slower time | Done |
| N3 | Narrative stage 3: districts, venues, familiarity, availability, appointments | Done |
| L2 | Family graph with real children, pregnancy, adoption, guardians, siblings; hobbies, pets, gifts; story protagonists and memory subjects; budgets | In progress: groundwork 1.3.2; pregnancy, siblings, gifts, pets 1.3.6; hobbies 1.3.7; adoption, care, guardians, child costs 1.3.8 |
| L3 | Schools, universities, clinics and offices as funded institutions; education ladder; qualifications; service careers (teaching, clinical care, administration, technical); work history; promotions; military academy | Planned |
| L4 | Housing (rent/buy/sell); obligations (loans, mortgages, student loans); conditions and treatment; leave; retirement and funded pensions (incl. veterans); living-cost split | Planned |
| L5 | Birth start; childhood and parenting; player mortality; wills, trusts, estates, heirlooms | Planned |
| L6 | Succession to heirs; legacy archive; 8 life chains + 16 standalone encounters; narrative stage 4's five chains; NPC AI parity | Planned |
| UI2 | Every screen restyled; cinematic story, review and succession; map polish; optional UI sound; screenshots | Planned |
| L7 | Calibration, performance, docs, tests, e2e, release 1.4.0 (with narrative stage 5) | Planned |

After 1.4.0: the plan continues in `ROADMAP.md` (1.5.0 → 2.5.0). Its main thread is a realistic geopolitical
simulation, in which nations and AI actors advance over time, opening with a deep economic overhaul (realistic wages
and prices). The earlier requests have their places there: careers
and employment (1.5), policing, crime careers and prisons (1.7), and weather and natural disasters (1.9).

| Version | Theme |
| --- | --- |
| 1.5.0 | The real economy (deep economic overhaul: prices, wages, costs, taxes, banks) + work & enterprise (GEO 1) |
| 1.6.0 | The strategic engine (GEO 2: nations advance over time; level-of-detail simulation) |
| 1.7.0 | Law & order (policing, crime careers, courts, prisons) |
| 1.8.0 | Arsenal (GEO 3: militaries get better) |
| 1.9.0 | Sky & ground (weather, natural disasters, resources and energy) |
| 2.0.0 | The great game (GEO 4: diplomacy, treaties, international organisations) |
| 2.1.0 | Shadows (GEO 5: intelligence gets better; governments act on estimates) |
| 2.2.0 | War & peace (GEO 6: realistic wars and their endings) |
| 2.3.0 | Rise & fall (GEO 7: regimes, coups, secession, new nations) |
| 2.4.0 | Frontiers (GEO 8: technology, cyber and space) |
| 2.5.0 | A world of consequences (GEO 9: world economy, climate, soft power; decades campaign) |

## Implemented

### Population foundation
- `src/sim/population.ts`: health drifts with age, hospitals, pollution, epidemics and stress; retirement from 65;
  mortality per life year (Gompertz curve × ill health) evaluated once a day; one idempotent `die()` that releases
  roles (special election for a head of government, cabinet refilled, deputies refilled, party leadership passes,
  formation commands and chief of staff vacated, cases closed, open market/FX/share orders and contracts
  cancelled) and settles the estate (spouse, then eldest child, then parent, else the state). The dead and
  emigrated stay in `w.citizens` with `gone` set, excluded from the census and every living iteration.
- Regions have an attractiveness score (jobs, crime, unrest, infrastructure, approval, occupation, disasters,
  pollution) smoothed into `Region.draw`; each region heads for a target between 0.4× and 4.2× the per-region
  setting, within a world budget of 1.35× the starting population. People come of age in local families, arrive
  from abroad (couples sometimes together), move to better regions, emigrate to other modelled nations (and apply
  for citizenship) or leave for abroad (their savings leave with them).
- `src/sim/family.ts`: dating, engagement, marriage, divorce, babies for NPC couples; children still growing up are
  compact records in `Family.kids` (stable name and birth time) promoted to full citizens at 18 with parent links
  (the documented promotion path). Genesis creates couples, children at home and adult children; the player has
  parents. The player can ask out, date, propose, marry, divorce and try for a child; neglect can end a relationship.

### No levels
- `src/sim/growth.ts`: skills grow by practice with diminishing returns and a youth bonus; reputation tiers from
  influence and fame; gates use age, a clean record, fitness and years of service. Save version 8 migrates.

### L1: lifecycle
- **Pace of life** (`Settings.lifeYearDays`): world days per year of age. New campaigns now age with the calendar
  (365; see CLK below); faster paces are options; changing it rescales birth times so ages are kept.
  `ageOf`, `nextBirthday`, `lifeYear` in `growth.ts` derive everything from the single `Citizen.born`.
- **Stages** (`lifecycle.ts`): early childhood 0–4, childhood 5–12, adolescence 13–17, adulthood 18–64, later life 65+
  (thresholds in `B.life.stages`).
- **Age gates in validators** (`lifeGate`): about thirty action checks — work and public works from 16; fighting,
  enlisting, duty, command, police, crime, companies, holdings, contracts, parties, candidacy, newspapers,
  citizenship, units, mining from 18; volunteering from 13; training from 13. The AI's hourly routine skips people
  under 16. Enforced for direct calls and the AI, not only in the UI.
- **Wellbeing** (`wellbeing.ts`): happiness and stress for every living citizen, drifting daily toward what their
  life is like (partner, children, friends, work, money, health, grief, prison, war at home, hobbies, rest, family
  time); the main reasons are kept for the player. No dice are rolled. Stress feeds health; unhappiness makes people
  likelier to move away.
- **Birthdays and the annual review**: detected every tick for the player; one review per birthday (idempotent),
  with stage changes, coming of age, work, relationship, children, health, happiness, milestones, savings and the
  year's world events. Durable milestones live in `LifeProfile.milestones`, not only in the pruned journal.
- **Long advances** (`ui/store.ts`): "Advance to next birthday", +1 day, +1 week, +30 days and "to an event" run in
  short chunks of the normal ten-minute steps, yielding to the window. A personal matter stops the run where it is
  (the target is kept in `w.life.advance`, so it resumes, including after save/load); cancel stops at the time
  reached. During a long advance only personal categories stop the clock by default (`Settings.advanceStops`).
- **Routine** (`routine.ts`): work shift, look for work, training, family time, rest — each runs the same validated
  action as the button, so a routine can never pay a second shift. The Life hub shows the time budget and clashes.
- **Life hub** (`ui/screens/Life.tsx`): age, stage, residence, occupation, relationship, reputation; health,
  happiness, stress and energy with reasons; family and close friends with relationship actions; the month's money
  from actual transactions; routine; milestones; links.

### M1: military careers
- **Civilian control** (`forces.ts`): a public office (head of government, minister, member of the legislature,
  governor) and active duty do not mix. `civilianControl` (hourly, at genesis and on migration) moves office holders
  to the reserve: rank and record kept, formation command and the chief of staff post handed over, no duty, pay or
  promotion, and reserve time does not count as service. `enlistCheck`, `dutyCheck` and `commandCheck` refuse office
  holders; after leaving office people return to active duty (`returnToDuty`; the AI does so too).
- **Commander-in-Chief**: the head of government, while in office — shown atop the chain of command on the Forces
  screen, in rankings and on profiles; can order any formation and appoints the Chief of Staff from officers of
  command rank on active duty (`appointChief`); the appointment stands while the officer stays eligible, otherwise the
  most senior officer serves. AI heads of government keep the seniority rule.
- **Career limits**: recruits up to 44, retirement at 62 (flag officers 64) with a veteran record
  (`Citizen.veteran`: branch, rank, days served) that later stages use for pensions and standing. Seeded officers are
  of serving age and every nation has a Chief of Staff from day one.
- Still to come with later stages: officer training and a military academy (L3), service pensions and battle
  injuries (L4), the "Duty and family" story (L6), long-run officer supply checks (L7).

### UI1: design system and shell
- `assets/styles.css` rewritten as a design system (tokens, glass surfaces, gold accent, meridian motifs, refined
  buttons, tabs, inputs, tables, gauges, stats, chips, modals, toasts, conversations, map chrome), keeping every class
  the screens use, with transitions, focus rings, reduced-motion support and narrow-window layouts.
- Bundled fonts (Inter, Barlow Condensed, Cinzel; SIL OFL, `assets/fonts`) embedded into `dist/fonts.css` by
  `build.mjs` so they load from `file://` and offline.
- Line icons (Lucide) for navigation and the HUD (`src/ui/icons.tsx`), a brand emblem, screen headings, a cinematic
  title screen with a drifting Earth, and a "Charting the world" veil while a campaign is generated.
- The release workflow no longer republishes an existing version on branch pushes (tests still run).

### CLK: clock overhaul
- `src/engine/calendar.ts`: world day 1 is Wednesday 1 January 2025 (until 1.3.2 it was 1 January 2030); one world day is one calendar day (Gregorian,
  leap years). Descriptive dates ("Friday, 14 March 2025"), 12- or 24-hour times, parts of the day (dawn, morning,
  midday, afternoon, evening, late evening, night) and seasons by hemisphere (`latitudeOf` from the map's
  projection; wet and dry seasons in the tropics). Seasonal hazards follow calendar months.
- The top bar shows the time, the full date, the part of the day and the local season; the clock shows each minute
  between the ten-minute simulation steps. Dates replace "day N" across screens and messages; profiles show dates
  of birth.
- Slower time: 1× is a minute per second (a day lasts 24 real minutes), up to 3 hours a second at 4×.
- Ages follow the calendar by default (a year of age per calendar year, birthdays on the date of birth, 29 February
  birthdays on the 28th); faster paces (3, 5 or 10 years of age per calendar year) remain as options.
  `bornYearsAgo` sets exact birth dates. A long advance to the next birthday on a full-size world now takes minutes
  of real time (simulation speed bound), shown with progress and resumable.

### N3: places, availability, appointments
- `src/data/places.ts`, `src/sim/places.ts`: five districts (neighbourhood, civic quarter, downtown, industrial,
  transport) and venues laid out per region from a hash (no world dice; stable across saves): home, park, café,
  community centre, gym, library, lookout; city hall, party rooms, police, newsroom, clinic/hospital; market,
  restaurant, bank, back room; each real company as a workplace, union hall; station, harbour (coastal regions),
  barracks (bases and garrisons). Venues are views of real things and link to their screens.
- Local position under the authoritative region (`w.story.local`); arriving in another region puts you at its
  station (or home in your home region).
- Familiarity per region with diminishing returns from exploring (energy, hourly), visits, conversations, work and
  time spent; it opens extra places (community centre 5, gym and newsroom 10, better first impressions 20, lookout
  40, back room 60) and never hides essentials. The next discovery is always hinted.
- Where people are each hour, from their schedules and roles (workplace, gym, police desk, party rooms in the
  evening, city hall for a sitting governor, cafés and parks…); `availability` says whether someone can be met now,
  why not, and when next, with a "Wait" control on the clock. Sleeping people cannot be talked to.
- Appointments at a time that suits them (next free evening), reminders an hour before, keeping one starts a
  conversation (+memory), missing it is remembered; stories can book a meeting (`Outcome.meet`) and wait for it.
- Everyday acts at places: coffee at the café (paid), a walk in the park, an hour of volunteering.

## Tests
- `tests/life.test.ts` (6): death/estate/offices, special election, emigration, coming of age, the player's romance,
  population churn with the audit.
- `tests/forces.test.ts`: civilian control, reserve and return, Commander-in-Chief appointments.
- `tests/places.test.ts` (7): fixed layouts, discovery, travel reset, availability, appointments, story meetings, venue acts.
- `tests/lifecycle.test.ts` (7): birthdays before the epoch and across save/load, one review per birthday, coming of
  age at 18, age gates for direct calls and the AI, no double shift pay, chunked vs single advance identical, pace
  change keeps ages.

## Known limitations (to address in later stages)
- NPC children are compact records until 18; only the player's own family will get full child citizens (L2/L5).
- Player mortality is not enabled until succession exists (L5/L6).
- Institutions (schools, clinics), housing, obligations, wills and heirs are not built yet (L3–L6).
- Story protagonists and memory subjects are still implicit (L2).
- A daily-hook chunk can take one to two seconds on a full-size world, so a long advance is responsive between
  chunks rather than continuously; measured: a 36-day year in about 30 s at 8 people per region in the browser.
