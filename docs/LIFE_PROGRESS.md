# Life simulation: progress and continuation record

This file tracks the life-simulation work (the "BitLife integration template"),
together with the narrative stages, the military career review and the UI
overhaul that were folded into the same plan. It says what is implemented,
what remains, and the known limitations, so work can resume from here.

## Plan and order

| # | Stage | Status |
| --- | --- | --- |
| – | Population foundation: ageing, health, deaths with estates, families, migration, regions of 24–100 | Done |
| – | No levels: skills by practice, reputation, life gates | Done |
| L1 | Lifecycle: pace of life, stages, age gates, birthdays, annual review, long advances, routine, Life hub | Done (see below) |
| M1 | Military: civilian control (office holders go to the reserve), head of government as Commander-in-Chief | Next |
| UI1 | Premium design system and game shell | Planned |
| N3 | Narrative stage 3: districts, venues, familiarity, availability, appointments | Planned |
| L2 | Family graph with real children, pregnancy, adoption, guardians, siblings; hobbies, pets, gifts; story protagonists and memory subjects; budgets | Planned |
| L3 | Schools, universities, clinics and offices as funded institutions; education ladder; qualifications; service careers (teaching, clinical care, administration, technical); work history; promotions; military academy | Planned |
| L4 | Housing (rent/buy/sell); obligations (loans, mortgages, student loans); conditions and treatment; leave; retirement and funded pensions (incl. veterans); living-cost split | Planned |
| L5 | Birth start; childhood and parenting; player mortality; wills, trusts, estates, heirlooms | Planned |
| L6 | Succession to heirs; legacy archive; 8 life chains + 16 standalone encounters; narrative stage 4's five chains; NPC AI parity | Planned |
| UI2 | Every screen restyled; cinematic story, review and succession; map polish; optional UI sound; screenshots | Planned |
| L7 | Calibration, performance, docs, tests, e2e, release 1.4.0 (with narrative stage 5) | Planned |

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
- **Pace of life** (`Settings.lifeYearDays`): world days per year of age. New campaigns default to 36 (a lifetime is
  about two hours at top speed); saves from before keep 365; changing it rescales birth times so ages are kept.
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

## Tests
- `tests/life.test.ts` (6): death/estate/offices, special election, emigration, coming of age, the player's romance,
  population churn with the audit.
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
