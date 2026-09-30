# Meridian Reach

A single-player society strategy game inspired by the systems of browser strategy MMOs such as Eclesiar
(original world, names and writing). You live as **one citizen** among ~300 simulated people in eight
fictional nations. Work, trade, found companies and holdings, publish a newspaper, win elections, legislate,
build, and fight in wars. AI citizens, businesses, parties, deputies, ministers, soldiers, investors and
journalists keep the world running whether or not you take part.

No accounts, payments, servers or AI services. Everything runs locally in your browser.

## Launch

**Windows:** double-click `Play.bat`, or run this from the game folder:

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
npm test           # 35 simulation & acceptance tests
npm run sim -- 90  # 90-day headless world run with an asset audit
```

## Short play guide

**Time.** The clock only moves when you let it. The top bar has pause, four speeds (10 simulated minutes up to
one day per real second) and **⏭ Advance**, which jumps to the next hour, tomorrow, an election, a battle tick
or round end, an auction ending, a mining shift, a tournament and so on. Advancing stops early for alerts you
chose to pause on (Settings → Alerts). Closing the game pauses the world.

**Your first days.** Follow Mara Voss, your civic guide (dashboard card and inbox):

1. **Employment:** take a job (compare net wages after tax), then **work** one shift a day.
2. **Character:** **train** once a day for training power, and spend attribute points. Every point has a
   concrete, previewed effect.
3. **Goods Market:** buy food, then **eat** (inventory or dashboard) to restore energy. Eating uses an
   allowance that refills every 45 minutes.
4. **Currency Market:** exchange currency and gold. Gold pays for companies, studies and shop items.
5. Finishing the tutorial grants enough gold to **found your first company**.

Energy regenerates 1 per 2 simulated minutes. Everyone, you included, pays a small daily living cost, so keep
some income. **Public works** (dashboard) is a low-paid fallback job funded by the treasury.

**Careers.** None are locked, so mix them freely.

- **Entrepreneur:** found farms/mines/rigs and factories, post wages, buy inputs, sell output (or automate
  it), upgrade, relocate, sell on the Business Market, or build a **holding** and issue shares.
- **Politician:** join or found a party (level 3), register for the congress list (level 5), seek the
  presidential nomination (level 8), draft and vote on laws, accept or appoint ministers. Newspaper articles
  and endorsements build the influence voters care about.
- **Soldier:** join a military unit, follow its orders, stock weapons and food, fight in battles (surge in
  the final segment), earn hero medals and rank, and claim your combat reserve.
- **Builder:** work on national construction sites, deliver materials, and climb the builder ranks.
- **Also available:** gold mining, the Academy (studies), auctions, contracts, the Stadium, pirate
  invasions, espionage, and more.

**Wars** are declared by congress with goals and a deadline. Battles occupy regions, but ownership only changes
at settlement. The **Wars** and **Battle** screens explain the scoring ticks, supply and win conditions.

**Saves.** The game autosaves each simulated day, when the tab is hidden, and on close. Settings → Saves has
three manual slots plus export and import of save files. The world is seeded and deterministic: the same seed
and actions give the same history.

**Where numbers come from.** Settings → *Balance & sources* marks every value as documented (**DOC**), older wiki
baseline (**WIKI**) or a chosen single-player default (**SOLO**). You can override values for your save.
Settings → *Money supply* explains every unit of money created or destroyed and runs a full asset audit.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the architecture, the rules chosen where sources were silent, the
acceptance checklist and known limitations.
