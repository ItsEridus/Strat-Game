# Meridian Reach

A single-player society strategy game inspired by the systems of browser strategy MMOs such as Eclesiar
(original names and writing). You live as **one citizen** among about 12,500 simulated people (a local society of ~24 in every state and
province) on an interactive map
of **Earth**, split between sixteen real countries: the United States, Canada, Mexico, Brazil, Argentina, the
United Kingdom, Germany, Russia, Turkey, Saudi Arabia, South Africa, India, China, Japan, South Korea and
Australia. Work, trade, found companies and holdings, publish a newspaper, win elections, legislate,
build, and fight in wars. AI citizens, businesses, parties, deputies, ministers, soldiers, investors and
journalists keep the world running whether or not you take part.

No accounts, payments, servers or AI services. Everything runs locally in your browser.

![World map](docs/screenshots/map-world.png)

## Screenshots

| | |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) **Dashboard:** your citizen, daily actions, news and alerts | ![US states and governors](docs/screenshots/map-states.png) **Every US state and Canadian province** has its own government |
| ![Military map](docs/screenshots/map-military.png) **Military map:** armies, fleets and air wings on land and at sea | ![Armed forces](docs/screenshots/armed-forces.png) **Armed forces:** service careers, ranks, defence ministry and order of battle |
| ![Rankings](docs/screenshots/rankings.png) **Rankings:** world power index and citizen leaderboards | ![Intelligence](docs/screenshots/intelligence.png) **Intelligence:** networks, dossiers and covert operations |
| ![Law & order](docs/screenshots/law-and-order.png) **Law & order:** policing, crime syndicates and courts | ![World situation](docs/screenshots/world-situation.png) **World situation:** wars, crises and diplomacy as they unfold |
| ![Country](docs/screenshots/country.png) **Country:** government, budget, laws and approval | ![Goods market](docs/screenshots/market.png) **Goods market:** a player-and-AI economy with real supply chains |
| ![Neighbourhood](docs/screenshots/neighbourhood.png) **Neighbourhood:** the people where you live, what they're doing and what worries them | ![Conversation](docs/screenshots/conversation.png) **Conversations:** talk to anyone, learn what they care about, win their vote |
| ![My Life](docs/screenshots/life.png) **My Life:** health, happiness, family, routine and milestones, in four tabs | ![Home and money](docs/screenshots/life-money.png) **Home & money:** renting or buying, a monthly budget, loans, credit and pensions |
| ![Succession](docs/screenshots/succession.png) **Succession:** when your character dies, your heir carries on | ![Encounter](docs/screenshots/encounter.png) **Situations:** decisions with visible consequences, about one a day |
| ![New campaign](docs/screenshots/start.png) **New campaign:** seeded, reproducible worlds; start as a newborn or a grown-up | |

Screenshots are regenerated with `node tools/screenshots.mjs` (needs Playwright).

## Download (Windows)

Grab **`MeridianReach.exe`** from the [latest release](https://github.com/ItsEridus/Strat-Game/releases/latest)
and double-click it. The game opens in its own window. It's a single self-contained file with nothing to install:
it uses the WebView2 component built into Windows 10 and 11, and your saves are kept in
`%LOCALAPPDATA%\MeridianReach`. Closing the window autosaves and quits. Windows SmartScreen may warn about an
unsigned app: choose **More info → Run anyway**.

The EXE keeps itself up to date: it checks for new releases when it starts, downloads them in the background
and installs them when you restart (Settings → Updates can switch this off). On a PC without WebView2 (e.g.
Windows 7/8), the EXE opens the game in your default browser instead.

The release also has a `.zip` of the plain browser build for any OS. Saves don't move between the browser
build and the EXE automatically: use **Settings & Saves → Export save file** in one and **Import save file** in the other.

## Launch

**Windows:** run `MeridianReach.exe` (see above), double-click `Play.bat`, or run this from the game folder:

```bat
start "" "%CD%\index.html"
```

**macOS / Linux:** open `index.html` in a modern browser (`open index.html` / `xdg-open index.html`).

The prebuilt game is in `dist/game.js`, so no install is needed to play. Chrome, Edge and Firefox are supported.

### Building from source (optional)

Requires Node.js 18+.

```sh
npm install
npm run build      # rebuild dist/game.js
npm test           # simulation, story & acceptance tests
npm run sim -- 90  # 90-day headless world run with an asset audit
npm run earth      # regenerate src/data/earth.json (downloads Natural Earth data to tools/ne/ on first run)
```

## Short play guide

**Time.** The clock only moves when you let it. The top bar has pause, four speeds (10 simulated minutes up to
one day per real second) and **⏭ Advance**, which jumps to the next hour, tomorrow, an election, a battle tick
or round end, an auction ending, a mining shift, a tournament and so on. Advancing stops early for alerts you
chose to pause on (Settings → Alerts). Closing the game pauses the world.

**Your first days.** Follow Mara Voss, your civic guide (dashboard card and inbox):

1. **Employment:** take a job (compare net wages after tax), then **work** one shift a day.
2. **Character:** **train** once a day for training power. Skills grow by practice (working, training, studying,
   fighting...), quickly at first and slower later; there are no levels.
3. **Goods Market:** buy food, then **eat** (inventory or dashboard) to restore energy. Eating uses an
   allowance that refills every 45 minutes.
4. **Currency Market:** exchange currency and gold. Gold pays for companies, studies and shop items.
5. Finishing the tutorial grants enough gold to **found your first company**.

Energy regenerates 1 per 2 simulated minutes. Everyone, you included, pays a small daily living cost, so keep
some income. **Public works** (dashboard) is a low-paid fallback job funded by the treasury.

**Your life.** You age with the calendar (or faster, if you choose) and can start as a newborn, at 16, 18 or 24.
The **My Life** screen, in four tabs, covers it all:

- **Family:** date, marry, have or adopt children (pregnancy, parental leave, raising them), brothers and sisters,
  gifts, pets.
- **Home and money:** rent, buy (with a mortgage) or sell, a monthly budget by category, loans and credit, and
  pensions.
- **Health and learning:** illnesses and clinic visits priced by your country's health system, school and
  university, hobbies.
- **Careers:** company jobs, public service (teacher, nurse, doctor, civil servant, engineer, with promotions),
  the military academy.
- **Legacy:** a will, heirlooms and the family history. When your character dies, you carry on as your heir.

Advance by a day, a week, a month, to your next birthday or by a whole year, with the world simulated in full. A
summary afterwards shows what happened. Everyone else lives by the same rules.

**Careers.** None are locked, so mix them freely.

- **Entrepreneur:** found farms/mines/rigs and factories, post wages, buy inputs, sell output (or automate
  it), upgrade, relocate, sell on the Business Market, or build a **holding** and issue shares.
- **Politician:** join or found a party, register for the congress list, seek the presidential nomination
  (with age, reputation and a clean record), draft and vote on laws, accept or appoint ministers. Newspaper
  articles and endorsements build the influence voters care about.
- **Soldier:** join a military unit, follow its orders, stock weapons and food, fight in battles (surge in
  the final segment), earn hero medals and rank, and claim your combat reserve.
- **Builder:** work on national construction sites, deliver materials, and climb the builder ranks.
- **Also available:** gold mining, the Academy (studies), auctions, contracts, the Stadium, pirate
  invasions, espionage, and more.

**The map.** World Map shows Earth with every playable country divided into its **real first-level
subdivisions** with real borders: all 50 US states and DC, all 10 Canadian provinces and 3 territories, the
32 Mexican states, 27 Brazilian states, 24 Argentine provinces, England/Scotland/Wales/Northern Ireland, the 16
German Länder, Russia's 83 federal subjects, Turkey's 81 provinces, Saudi Arabia's 13 regions, South Africa's
9 provinces, India's states and union territories, China's 31 provinces, Japan's 47 prefectures, South Korea's
17 provinces and cities, and Australia's 8 states and territories (492 regions). Scroll or use ＋/－ to zoom,
drag to pan, and click a region for its seat of government, resources, buildings, companies, connections and
government. Regions connect by their real land borders (Texas borders four Mexican states, Washington borders
British Columbia, …), by straits to islands (Hawaii, Tasmania, Hokkaidō) and by dashed **sea lanes and
corridors** (North Atlantic, Bering Strait, Korea Strait, …) between nations with no shared border. Supply and
ground invasions follow these connections; anything else is an air assault. You can go overland to a bordering
region; tickets fly by real great-circle distance. Each country keeps its real currency and its own titles for
its leader and legislature, although every country plays by the same national rules.

**State and provincial governments.** Every state, province and region with a real government has one: a
Governor and State Legislature (General Assembly, General Court… by state), a Premier and Legislative or
National Assembly in Canada, a Minister-President and Landtag in Germany, a First Minister in Scotland, Wales and
Northern Ireland (England has none), Chief Ministers in India, Governors in Japan, Mexico, Brazil and Russia, and
so on. Heads are **elected** by residents or **appointed** by the national leader where that is the real system
(Chinese provinces, Turkish provinces, Saudi emirs, Indian union territories). Each government taxes wages worked
there (0% in the nine US states with no wage tax) and its residents, receives block grants, and spends on
welfare, infrastructure (+2% production per level) and business support. Live in a state and build a reputation to
run for its governorship: register, campaign, vote, then set the tax (the legislature must agree) and the
budget. As national leader you appoint heads where they are appointed. Country → *States, provinces & regions*
lists every government; the map's *Governments* view colours regions by the ideology in power.

**Law & order.** Every region has a crime rate driven by unemployment, poverty, the economy, city size, unrest and
organised crime, held down by policing (state police budgets, national police funding and citizen officers).
Syndicates — named in each country's style: mafia families, cartels, bratvas, triads, yakuza clans, bikie gangs —
hold turf, extort businesses (including yours, through the inbox), recruit the jobless, feud and get raided.
You can commit street crimes, join an organisation and rise to boss, or join the police and rise to chief.
White-collar crime is there too: embezzlement, tax evasion caught by audits, insider trading and online fraud
abroad. Crime money is dirty until it is laundered through a business or an organisation.
Detected crimes open cases, and evidence builds faster where people trust the police. Arrests lead to bail, plea
deals and trials. Real prosecutors, defence lawyers and judges sit on each case; these are careers you can follow.
Convictions can be appealed, and the wrongly convicted are sometimes exonerated.
Prisons hold each country's real share of its people, from about 33 per 100,000 in Japan to over 500 in the
United States. Crowded, underfunded prisons riot. Inside, you can work, study, receive visits, apply for parole or
try to escape. A record follows you to job interviews until it is spent.
Ministers of the Interior fund the police, order raids and open national investigations; internal affairs
pursues corrupt officers. (Law & Order screen.)

**Intelligence.** Each nation runs its real service (CIA, MI6, BND, SVR, MSS, R&AW…). Budgets build spy networks
abroad and counter-intelligence at home. Operations gather dossiers, sabotage industry, steal from treasuries,
incite unrest, spread propaganda, plant scandals, recruit assets or sweep for spies; exposed ones cause
diplomatic incidents and arrests. Join as an analyst and climb to deputy director, direct the service as
Director of Intelligence — or accept a foreign service's offer and become a double agent. (Intelligence screen.)

**Diplomacy.** Countries see each other through trust, shared values and language, fear, trade ties and old
grievances. The game starts from the real world of 2025:
- NATO and the US alliances in Asia;
- USMCA, Mercosur, CPTPP, RCEP and about twenty other trade agreements;
- New START, and the US bases abroad.

Treaties have terms and end dates; allies deter attackers and decide whether to stand by a partner that is
attacked. Rivals fall into arms races and crises (border clashes, naval standoffs, detained citizens) that climb
towards the brink and usually stop short of it. The UN Security Council (with vetoes) votes on aggression, the
G20 meets each November, the WTO hears trade disputes and the IMF lends to countries in trouble.

As head of government you spend diplomatic capital on summits, aid, loans, sanctions, treaties, ultimatums and
mediation; you cast your country's UN votes and choose its moves in a crisis. Diplomat, trade negotiator and
international civil servant are careers. (Country screen → Diplomacy.)

**The economy.** Money is real:
- Every country uses its own currency at real early-2025 exchange rates. Pay follows each country's real median
  wage and minimum wage, so a typical day's pay is about $200 in the United States and ₹780 in India, and prices
  follow what people earn.
- Taxes start at real 2025 rates: progressive income tax, VAT or sales tax, tariffs and corporate tax. Governments
  borrow when their treasuries run short and pay interest on the debt. Central banks set interest rates by a rule
  like the ones real central banks follow. Savings earn interest.
- Companies pay rent, energy and tax, keep accounts, take business loans, export surplus stock, buy struggling
  rivals (if the competition authority allows it) and go bust. People who lose their jobs get redundancy pay and,
  where the country has it, unemployment benefit.
- You can work for an employer, in public service or for yourself: a trades business, tutoring, a taxi, a café,
  a restaurant, a shop, a practice or a law firm.
- Each country publishes monthly statistics: GDP, prices and inflation, unemployment, pay, trade, inequality and
  poverty, and public finances. World commodity prices move with real volatility.

**A living world.** The world economy moves through booms and recessions; commodity shocks change output;
hurricanes, typhoons, earthquakes, floods, wildfires, blizzards and droughts strike their real hazard zones in
season; epidemics spread along borders until lockdowns stop them; underpaid workers strike; unrest turns into
protests and riots that governments answer with concessions or crackdowns; people migrate and new citizens
arrive. You can volunteer, donate, march, or (as governor) order lockdowns. (World Situation screen.)

**Your neighbourhood.** Every state and province has its own society of AI citizens (about 24 by default,
more in populous places) with homes, jobs, schedules, worries and opinions. The Neighbourhood screen shows who is
around, what they're doing this hour (at work, training, out, asleep, at the front), what the place worries about
(crime, jobs, prices, pollution, healthcare, taxes, war) and its local news. Walk up and **talk** to anyone: ask
about their life and learn what they care about, hear local gossip drawn from the real world (who's hiring, who
runs the rackets, when the election is), ask about their ambitions, argue politics and change their mind, buy them
a coffee, recruit them to your party or your company, or ask for their vote. **Canvass** door to door and **hold
rallies** on the issue that matters locally. Residents stand for their region's electorate, so the people you win
over move real votes: half of every state election follows what the residents themselves decide, and national
voters weigh relationships and promises. People move house to find work, and it makes the local paper.

**Situations.** About once a day something happens to you and you decide: a lost wallet, a neighbour who can't
afford food, your staff asking for a raise, a buyout offer, a friend's business pitch, a mugger, a crate of
stolen rifles, a generous donor with strings attached, a question at a town hall, a protest, a recruiting
sergeant in wartime, a disaster in your town. Every choice shows its likely consequences first, and every
consequence is real (money, relationships, police cases, votes).

**Stories and your journal.** Situations are stories that remember who is involved and carry on over days: a
strike at your company (meet the committee, open the books, keep the promise you made), a neighbour who can't
afford bread when prices jump (and the real reasons why), a friend's loan (repay early, ask for time, or default
and make it right). Urgent decisions pause the game; others wait in the **Journal** with their next step and
deadline. People remember what you did and why they feel the way they do (see their profile).

**People who notice you.** AI citizens pursue ambitions (a governorship, the presidency, a business empire, the
boss's chair…). Competitors become rivals who attack you in speeches, undercut your prices, poach workers and tip
off the police; friends vouch for you, warn you and lend money. NPCs offer bribes when you hold office, ask for
interviews when you're famous, challenge you to debates, and journalists investigate the notorious. (People
screen; the dashboard shows what's happening around you.)

**Armed forces.** Every nation fields standing army divisions (infantry, armored, mountain, marines), navy
formations (surface fleets, carrier strike groups, submarine flotillas) and air wings (fighters, bombers), sized to
its real posture. They fight in battles alongside citizens — divisions in or next to the battle region, air wings
within range, fleets in a sea that touches the coast — and take losses. Real coastlines are divided into 29 named
seas: naval superiority allows amphibious landings, blockades enemy coasts (production and sea-lane supply) and
lets armies cross the sea; fleets clash in naval battles. Formations cost upkeep from a military budget, wear
their equipment and are repaired from national stocks. Enlist in the Army, Navy or Air Force, report for duty,
fight, and climb a real rank ladder (Private to General, Seaman Recruit to Admiral, Airman Basic to Air Chief
Marshal); from Colonel/Captain you command a formation and give it orders; the most senior officer becomes Chief
of Staff. The defence ministry sets the budget and the national security alert level, raises and disbands
formations, and — like the intelligence service — fights through fog of war: foreign forces are only visible near
your borders and seas, through deep networks, or after military reconnaissance (which, with military sabotage,
joins the intelligence operations).

Defence budgets start at each country's real share of GDP. They split into personnel, operations, procurement and
R&D. Fourteen classes of equipment, from small arms to carriers, each have a generation and an average age, and
quality counts in combat. Named R&D programmes take years: a fighter takes 10–20, and programmes slip, overrun or
are cancelled. Procurement contracts and real goods from defence contractors renew equipment, and neglected forces
age and wear out. Countries buy abroad under export licences, and a supplier that turns hostile stops sending
spare parts. Each country has a doctrine and a recruitment system; the loser of a war reviews its doctrine
afterwards. Exercises raise readiness. Five nuclear powers start with their real arsenals and nuclear doctrines.
(Armed Forces screen; Military map view; Rankings screen for the world power index and citizen leaderboards.)

**Wars** are declared by congress with goals and a deadline. Battles occupy regions, but ownership only changes
at settlement. The **Wars** and **Battle** screens explain the scoring ticks, supply and win conditions.

**Saves.** The game autosaves every few minutes of play, when the window is hidden, and on close. Saves are
stored compressed in the browser's database (a full world is tens of MB). Settings → Saves has three manual slots
plus export and import of save files. The world is seeded and deterministic: the same seed
and actions give the same history.

**Where numbers come from.** Settings → *Balance & sources* marks every value as documented (**DOC**), older wiki
baseline (**WIKI**) or a chosen single-player default (**SOLO**). You can override values for your save.
Settings → *Money supply* explains every unit of money created or destroyed and runs a full asset audit.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the architecture, the rules chosen where sources were silent, the
acceptance checklist and known limitations.

Map data: [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin-0/admin-1 boundaries, populated places, geography regions and lakes (public domain).
