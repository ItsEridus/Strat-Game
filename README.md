# Strat Game

A single-player take on social strategy MMOs like *Eclesiar* / *eRepublik*: economy, politics and war on a hex
continent, where the other "players" are AI nations and citizens.

## Play

Open `index.html` in a browser. No build step, no server, no dependencies. Progress autosaves to the browser's
local storage; use **Settings → Export save** to back it up.

## Gameplay

- **Daily loop**: every day you get a full bar of energy. Spend it on work, training, battles, company work and
  newspaper articles, then press **End Day** (or the `N` key).
- **Economy**: take a job for a daily wage, which is taxed by your nation. Found farms, mines, food factories and
  weapons factories with gold, hire workers and set their wages, then sell what they produce on a market whose
  prices respond to supply, demand and wars. Gold can be bought and sold for credits.
- **Military**: training raises your strength. Damage per hit scales with strength, military rank and weapon
  quality. Battles are best-of-5 rounds, one round per day. AI citizens fight on both sides, and your damage can
  swing the result. Deal a large share of your side's damage to earn Battle Hero medals.
- **Politics**: join a party (level 3), run for congress (level 5) and vote on laws, then run for president
  (level 8). As president you propose wars, peace and taxes, order attacks on border regions, and fund battles from
  the treasury. Newspaper articles build the popularity that wins elections.
- **World**: 8 AI nations declare wars, conquer regions, sign peace and get wiped out. Occupied regions can
  rise up in resistance battles and bring fallen nations back. You can change citizenship at any time.

## Code layout

| File | Purpose |
| --- | --- |
| `js/util.js` | Seeded RNG, formatting, news log |
| `js/data.js` | Balance constants, items, company types, names |
| `js/world.js` | Hex map and nation generation, world queries |
| `js/economy.js` | Market, jobs, player companies |
| `js/player.js` | Progression, training, food, articles, achievements |
| `js/military.js` | Wars, battles, damage, conquest, resistance |
| `js/politics.js` | Parties, elections, congress laws, AI governments |
| `js/main.js` | New game, day cycle, save/load |
| `js/ui.js` | All rendering and input handling |

Headless balance and smoke test (runs the full simulation with a scripted player):

```sh
node tools/simulate.js 365 42   # days, seed
```
