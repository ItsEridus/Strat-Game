## Meridian Reach

A single-player society strategy game on a map of Earth: live as one citizen among thousands of simulated
people across sixteen real countries, with every US state and Canadian province self-governing.

### New in 1.2: a lived-in world

- **A local society everywhere.** About 24 AI citizens live in every state, province and region (more in
  populous places): some 12,500 people in all, up from about 400. They have homes, local jobs, daily schedules,
  worries and opinions, and they move house to find work.
- **Neighbourhood screen.** See who is around, what they are doing this hour, what the place worries about and
  its local news, and the businesses that are hiring.
- **Talk to people.** Ask about their lives and learn what they care about, hear gossip drawn from the real world,
  argue politics and change minds, buy a coffee, recruit them to your party or company, or ask for their vote.
- **Campaign in person.** Canvass door to door and hold rallies on local issues. Residents stand for their
  region's electorate: the people you win over move real votes in state and national elections.
- **Situations with choices.** About once a day something happens to you (a lost wallet, a worker asking for a
  raise, a buyout offer, a mugger, a donor with strings attached, a town-hall question, a wartime recruiter, a
  disaster), and every choice shows its consequences first.
- **Faster, bigger saves.** The simulation was rebuilt for the larger population, and saves now go to the
  browser's database, compressed. Saves from 1.1 load and are upgraded.

### Fixed in 1.1.1

- The EXE no longer fails with "port 27183 is in use" (for example while the 1.0 launcher is still running in
  the background). The game window now loads the game straight from disk and doesn't use a network port.
- Opening the EXE again while the game is running brings the open window to the front.

### New in 1.1: a native game window

`MeridianReach.exe` now opens the game in its own window, with its own icon and taskbar entry, instead of a
browser tab. It uses the WebView2 component built into Windows 10 and 11, so there is still nothing to install.
Saves live in `%LOCALAPPDATA%\MeridianReach`, and closing the window autosaves and quits. Without WebView2
(e.g. Windows 7/8) the EXE opens the game in your default browser as before.

Saves from 1.0 stay in your browser and don't move over automatically: in the old version use
**Settings & Saves → Export save file**, then **Import save file** in the window.

### Download

- **Windows:** download **`MeridianReach.exe`** and double-click it. Windows SmartScreen may warn about an
  unsigned app: choose **More info → Run anyway**.
- **Any OS:** download the `-web.zip`, extract it and open `index.html` (or `Play.bat` on Windows).

### Highlights

- **Economy:** jobs, companies, supply chains, goods, currency and business markets, holdings and shares,
  auctions, contracts and a bazaar.
- **Politics:** parties, elections, congress, laws and budgets; state and provincial governments with governors.
- **Armed forces:** armies, navies and air forces with formations, commanders, equipment, readiness and morale;
  a 15-rank career ladder per branch; naval superiority, amphibious landings, blockades and contested sea lanes.
- **Wars:** invasions, battles, supply and fog of war; AI defence ministries that plan and respond.
- **Security:** policing, organised crime, courts, intelligence agencies, covert and military operations.
- **Rankings:** a world power index and citizen leaderboards.
- **A living world:** AI citizens, businesses, parties, soldiers, spies and journalists act whether or not you do.

Everything runs locally: no accounts, servers or payments.
