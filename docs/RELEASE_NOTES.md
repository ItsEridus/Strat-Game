## Meridian Reach

A single-player society strategy game on a map of Earth: live as one citizen among thousands of simulated
people across sixteen real countries, with every US state and Canadian province self-governing.

### New in 2.8.1: money in skipped years

Fixes to the statistical skip ("Skip a year"), found while checking twenty-year runs. Over a few skipped years,
most people's savings ran down to nothing and governments emptied their treasuries.

- **Pensions and unemployment benefit** are now paid in skipped months. Before, retirees and the unemployed
  received nothing until day-to-day play resumed, and people now retire at the usual rate.
- **Governments borrow and pay interest** in skipped months, as they do day to day. Before, a government running a
  deficit simply spent its treasury down to almost nothing.
- **Firms pay their staff first**, then their suppliers. Afterwards households buy from firms with the month's
  wages and spending: what households can spend is shared among firms in proportion to their usual sales, and
  firms buy inputs to match what they sold. Before, a fixed cap on each firm's sales, taken before the month's
  money had come round, starved firms so that they could not pay wages.
- **Taxes** are collected from a realistic share of household spending.

Workers now come out slightly ahead each month in skipped years, and treasuries hold steady.

### New in 2.8.0: Life 2.0, the everyday

2.8 is complete: the texture of ordinary days. Its parts:

- a day planner, sleep and the commute (2.7.1);
- cars (2.7.2);
- the body (2.7.3);
- home life (2.7.4).

This release adds:

- **Stories of the everyday:**
  - **The car will not start:** repair it, sell it as it is, or take the bus for a while.
  - **Running on empty:** too little sleep catches up with you at work. Go to bed earlier, or drink more coffee.
  - **A word from the doctor** about your weight or fitness: start exercising every morning, start cooking at
    home, or change nothing.
  - **A builder with a gap in his diary** offers a new kitchen at a fifth off. Most builders are honest; not all.
- **Calibration across twenty years:**
  - car ownership holds steady;
  - obesity drifts up slowly;
  - the new costs of everyday life (bills, fares, cars, meals out) are paid through the books without breaking
    them;
  - average health is a little lower than before, now that short nights, weight and sitting still count.

### New in 2.7.4: home life

The fourth part of 2.8 Life 2.0: the everyday.

- **Furnishing.** Go from bare essentials to a comfortable or stylish home. A comfortable home is a happier one.
- **Improvements** (owners): a new kitchen or bathroom, insulation, solar panels or an extension. They cost a share
  of the home's value and raise what it sells for; insulation and solar panels cut the energy bill, and new rooms
  make home more comfortable.
- **Bills.** Electricity, heating, water and internet are paid every month by everyone with a home of their own
  (tenants included), by the size of the home and the country's energy price, which follows the world fuel
  markets.
- **Appliances.** A washing machine, a dishwasher or a robot vacuum each save hours of housework a week.
- **Housework.** It takes about ten hours a week for one person, more for a couple and for children:
  - couples share it as couples in their country usually do: women still do most of it almost everywhere (about
    60% in Britain and America, 80% or more in Japan, Korea and India);
  - or you can agree to share it equally, take most of it on, or leave most of it to your partner;
  - a partner who does far more than their share grows resentful;
  - a cleaner halves the work, for a monthly fee.
- **On screen:** a "Home life" panel in Life (Money), and the housework on your day planner.

### New in 2.7.3: the body

The third part of 2.8 Life 2.0: the everyday.

- **Weight.** Everyone's body-mass index follows their country, as in the WHO's 2022 adult obesity figures:
  - about two in five Americans are obese;
  - about a third in Mexico, Argentina, Saudi Arabia and Australia;
  - about a fifth in Germany;
  - under a tenth in China, Korea, Japan and India.
  People are heavier in middle age.
- **Diet.** You can cook at home (cheapest and healthiest, an hour a day), mix home cooking with meals out, eat out,
  or live on fast food (quick but fattening). Meals out cost what they do in each country, from about $3 in India
  to $20 in the United States, paid monthly by everyone who eats out.
- **Fitness.** Exercise, active hobbies (running, gardening, football), walking or cycling to work and a sporty
  nature build it; age and sitting still wear it down. You can exercise for an hour a day, or make it part of
  your routine at 07:00.
- **Health:**
  - obesity raises the risk of diabetes and heart disease, and lowers the health people drift towards;
  - fitness and a good diet raise it and ease stress;
  - the average person is unchanged, so the fit gain and the unfit lose.
- **On screen:** a "Body" panel in Life (Health), and cooking and exercise on your day planner.

### New in 2.7.2: cars

The second part of 2.8 Life 2.0: the everyday.

- **Buying a car.** Choose a used runabout, a new family car, a premium saloon or an electric car:
  - prices differ by country: import duties make cars dear in Brazil, Argentina and Turkey, while India and China
    make them cheaply;
  - cars lose about 15% of their value a year;
  - trade in your old car, or sell it.
- **Running costs**, every month:
  - fuel at the pump, from about 60 US cents a litre in Saudi Arabia and Russia to nearly $2 in Germany and
    Britain, rising and falling with the world oil price;
  - or charging, for an electric car, which is much cheaper per kilometre;
  - insurance and upkeep;
  - more if you drive far to work.
  Part of what drivers pay goes to the state in fuel duty.
- **Accidents:**
  - the risk follows the country's road safety (WHO road deaths per 100,000: about 3 in Britain, Germany and
    Japan, 13 in the United States, over 20 in South Africa) and the driver: young drivers, drink, short nights
    and a taste for risk all raise it;
  - most crashes cost money for repairs, some injure, and a few kill.
- **Everyone drives:** people own cars about as often as in their country (most Americans and Australians, few
  Indians), pay to run them, and have accidents.
- **On screen:** a "Your car" panel in Life (Money), with the yearly chance of a crash. With a car, you can drive
  to work.

### New in 2.7.1: a day planner, sleep and the commute

The first part of 2.8 Life 2.0: the everyday.

- **Your day, hour by hour.** A new planner lays out your day from your routine: sleep, the commute, the work
  shift, classes, training, meals, family time, a hobby and rest. What does not fit shows as a clash.
- **Sleep.** You choose your bedtime and how long you sleep. Adults need about seven to nine hours:
  - less raises stress and slowly wears your health down;
  - a good night's sleep eases stress;
  - everyone else keeps their own habits, and people with long commutes sleep less.
- **The commute.** How long it takes to get to work depends on:
  - where the work is: the same region, the next one, or further;
  - how you travel: on foot or by bike, by public transport, or by car;
  - the country: public transport is fast and dense in Japan, Korea and Germany, cities are built for cars in
    America, Saudi Arabia and Australia, and traffic is heaviest in India, Brazil and Turkey.
  A long commute is a daily strain on happiness and stress.
- **Fares.** Public transport costs a fare, from about 20 US cents a trip in India to $3 in Germany and
  Australia, paid monthly by everyone who uses it.
- **Cars.** Driving needs a car of your own; buying and running one comes in the next part.

### New in 2.7.0: Life 2.0, the social fabric

2.7 is complete: people live among others. Its parts:

- circles (2.6.1);
- gossip, rumours and feuds (2.6.2);
- relationships under each country's laws (2.6.3);
- families that change, and dating (2.6.4).

This release adds:

- **Stories of the social fabric:**
  - **People are talking:** a rumour about you goes round. Set the record straight, own up, have it out with
    whoever started it (it may clear the air, or start a feud), or laugh it off.
  - **A row at the holiday table:** relatives with a grudge clash. Make peace between them, take a side, or stay
    out of it.
  - **The visiting arrangements:** your ex wants to change them. Ask for more time with the children, be flexible,
    or get a lawyer.
  - **The club wants you as its chair** when you are well liked there.
- **Love in skipped years:** courtship, engagements, weddings and divorces now carry on through statistical skips,
  so the share of people in couples keeps rising towards real levels instead of stalling. About two adults in five
  are in a couple after twenty years.
- **Fix: everyday situations.** They come up as often as before. The director now looks further for a situation
  that fits the moment, since many only fit now and then.
- **Calibration across twenty years:**
  - friendships keep forming, to two or three close friends each;
  - memories, rumours and maintenance orders stay bounded;
  - saves grow slowly;
  - the books balance.

### New in 2.6.4: families that change, and dating

The fourth part of 2.7 Life 2.0: the social fabric.

- **Custody and child support.** When parents of young children split up:
  - the children live with one parent (mostly the mother);
  - the other parent has a weekly visiting day and pays child support every month until the children are grown
    (about a tenth of income for each child, up to three);
  - missing the children weighs on them.
  You can visit your children from the "Love and the law" panel.
- **Step-families.** A parent who marries again brings their children into a blended family, with a step-parent.
- **Gatherings:**
  - each country's great family holiday (Christmas, the Lunar New Year, Diwali, Eid, the New Year) brings
    families together. Mostly they grow closer, but old rows can flare as well as heal;
  - with no family near, you spend the holiday alone;
  - weddings bring both families together, and funerals bring families together too;
  - children passed over in a will may resent the heir.
- **Dating:**
  - besides neighbours and workmates, people now meet through dating apps, which match singles across the country
    by age, outlook, values and temperament, and through friends who set them up;
  - you can spend a week on an app, ask friends to set you up, and meet your matches; how a first date goes
    depends on how well you would get on.
- **Fixes:**
  - a person's sex is now read correctly for names from other countries, so couples who arrive from abroad follow
    attraction too;
  - bisexual people mostly partner the other sex, as surveys find, and same-sex couples are about 1% of couples,
    as in life;
  - orientation shares are now about 3% gay or lesbian and 5% bisexual.

### New in 2.6.3: relationships under each country's laws

The third part of 2.7 Life 2.0: the social fabric.

- **Whom people are drawn to.** Most people are straight; about 3% are gay or lesbian and 5% bisexual. Couples
  form only where the attraction is mutual, and you can ask out only people who are drawn to you. You choose your
  own orientation in Life.
- **Same-sex couples under the law (2025):**
  - they can marry in the United States, Canada, Mexico, Brazil, Argentina, Britain, Germany, South Africa and
    Australia;
  - they can register a partnership in Japan;
  - elsewhere they live as partners without recognition;
  - where they are persecuted (Saudi Arabia, Russia), they live under strain and some emigrate to live openly
    together;
  - they have children through adoption or surrogacy.
- **Divorce follows the law of the country:**
  - savings are evened out between the spouses, from an equal split in Britain, Canada and Australia to little
    under Saudi law;
  - the better-off spouse pays monthly maintenance, from none in Japan to years in Turkey and India;
  - each country has its own waiting periods, such as Korea's and China's cooling-off month and India's six months.
  This applies to your divorce, which used to cost a flat quarter of your savings, and to everyone else's.
- Couples arriving from abroad now follow the same rules.
- **On screen:** a "Love and the law" panel in Life, with your orientation, your country's law, and any maintenance
  you pay or receive.

### New in 2.6.2: gossip, rumours and feuds

The second part of 2.7 Life 2.0: the social fabric.

- **Rumours.** People talk about what they see: a drinker, a gambler in debt, someone in prison, a deserved
  promotion, a kindness to a neighbour. People who bear a grudge talk too, and not always truthfully.
- **How rumours spread:**
  - through the circles of the person they are about (workmates, neighbours, club, congregation, friends), a few
    more people each month;
  - everyone who hears one thinks a little better or worse of that person;
  - people believe those they like;
  - after half a year a rumour is old news.
- **Feuds.** Two people with grudges against each other feud: they talk each other down and their families take
  sides. Most make peace in time, sooner if they value community, and are grateful afterwards.
- **You:**
  - a friend tells you what is being said about you;
  - you can set the record straight on a false rumour (which works if people think well of you, and turns them
    against whoever started it) or own up to a true one, which takes the sting out;
  - you can tell what you know about a rival, or invent a story; an invention may be traced back to you, and then
    it costs you.
- **On screen:** a "What people are saying" panel in Life, with rumours about you, your rivals and feuds, and
  stories of your own.

### New in 2.6.1: circles

The first part of 2.7 Life 2.0: the social fabric.

- **Circles.** Everyone moves in several circles:
  - family;
  - friends;
  - workmates (at a firm, or in the same public service);
  - neighbours;
  - a club, from a pastime (running, chess, football, painting and more);
  - for believers, a congregation.
- **Standing in a circle** is what its members think of you, on average, from "disliked" to "much loved". Standing
  among workmates now counts towards promotion in public service.
- **Friendships form across the world.** People in a circle meet each month and mostly grow closer, more so when
  their values are alike; now and then two rub each other up the wrong way. This happens to everyone, not only
  around you.
- **A week with your circles.** Once a week you can spend time with each circle:
  - a family dinner;
  - have friends round;
  - drinks after work;
  - help out a neighbour;
  - a club night;
  - attend services.
  Everyone who comes thinks a little better of you.
- **On screen:** a "Your circles" panel in Life, with the members of each circle and your standing in it.
- Circles are worked out from who people are, and each person keeps track of at most the forty people who matter
  most to them, so saves stay small.

### New in 2.6.0: Life 2.0, the mind

2.6 is complete: the inner life of every person. Its parts:

- values, and personality that grows (2.5.1);
- mental health in depth (2.5.2);
- habits and addictions (2.5.3);
- memories between people (2.5.4).

This release adds:

- **Stories of the mind:**
  - **A low season:** depression or anxiety settles in. You can confide in someone, ask for therapy, see a doctor
    or push through alone.
  - **The anniversary of a loss:** visit the grave, gather the family, or keep busy.
  - **The craving:** weeks after quitting, the old habit calls. You can hold on, call a friend, or give in.
  - **An old flame gets in touch** when you are both free.
- **Calibration across decades** (twenty years simulated):
  - depression and anxiety hold at about one adult in twenty-five each;
  - the share of the struggling who are in care rises from about a third towards a half, as access grows and
    stigma fades;
  - smoking declines steadily, as it has since the 1970s, while tobacco duty rises gently;
  - alcohol dependence and problem gambling hold steady.
- **Tuning:** a past episode of depression now raises the risk of another by less, so prevalence no longer creeps
  upwards over the years.

### New in 2.5.4: memories between people

The fourth part of 2.6 Life 2.0: the mind. People now remember each other, not only you, so communities have
histories:

- **Grudges:**
  - against the boss who dismissed them;
  - against the owner who let them go after years of service (some never forgive it);
  - against the ex who left them badly.
- **Gratitude** to the employer who took them on after a long search for work.
- **Old flames.** Exes who parted on good terms still think of each other, and are drawn back together when both are
  free.
- **Rivals.** Those beaten in a presidential or party-leadership election remember who beat them.
- **Comrades.** Those who served in the same war remember each other.
- **What memories do:**
  - they pull feelings their way: a grudge keeps a relationship cold however often people meet;
  - they sway votes for or against a candidate;
  - they fade over the years: grudges fastest in people who value community, comradeship hardly at all;
  - grudges die with the person they were held against, while old flames and comrades are remembered.
- Each person keeps at most six memories, so saves stay small. Profiles show "People they remember".

### New in 2.5.3: habits and addictions

The third part of 2.6 Life 2.0: the mind.

- **Smoking, drinking, gambling and gaming**, for everyone, as in their country in 2025:
  - daily smoking runs from about one man in eight in Britain, Brazil and the United States to nearly half of men
    in China and Korea (WHO);
  - alcohol dependence runs from almost none in Saudi Arabia, where drink and gambling are illegal, to about one
    adult in eleven in Russia;
  - problem gambling is around 1% (more in Australia and Japan), and gaming disorder affects a few per cent of the
    young (more in Korea and China);
  - men smoke, drink and gamble more, faith keeps people from drink and gambling, and most habits are taken up
    before 25.
- **Habits grow and become addictions** (at strength 50). They drift towards each person's own pull, pushed up by
  stress, depression, grief and an appetite for risk.
- **What they cost:**
  - **Money every month:** a pack costs from about $2 in India to $35 in Australia, and much of what people spend
    goes to the state in duty.
  - **Health:** smoking multiplies the risk of cancer and heart disease; heavy drinking harms the liver and the
    heart.
  - **Jobs and families:** heavy drinkers lose jobs, gamblers lose their savings, and both strain their families.
  - **Mental health:** addiction and depression feed each other.
- **Quitting:**
  - smokers try about once every four years, and most relapse within months;
  - help from a doctor about doubles the chance that quitting lasts;
  - the first weeks bring cravings, and after a year without it the habit is behind you.
- **Tobacco duty** rises over the years, so fewer people start and more quit. As head of government you can raise
  it too.
- **On screen:**
  - a Habits panel in Life: a pack, a night out drinking, an evening of games, a bet at the bookmaker's, and
    quitting with or without help;
  - a habits panel on each country page.

### New in 2.5.2: mental health in depth

The second part of 2.6 Life 2.0: the mind.

- **Depression, anxiety and burnout** come and go for everyone:
  - **Who is at risk:** a person's own temperament and family history, earlier episodes, stress, loneliness,
    losing work, grief, poor health, prison and war at home. Women are more often depressed and anxious, the
    young more often anxious, and burnout comes from long strain at work (more for workaholics and those in
    office).
  - **How common:** about one adult in twenty-five is depressed and a similar share anxious at any time, as in the
    WHO's estimates. Some people begin the game already struggling.
  - **Episodes change month by month** (mild, moderate or severe). About half lift within six months. Medication,
    therapy and support speed recovery; untreated depression under heavy stress gets worse. Each episode makes the
    next more likely.
  - **Work:** moderate depression left untreated, severe depression and burnout mean sick leave.
- **Grief has a course.** When someone dies, the people who loved them grieve: their partner, parents, children
  and close friends. Grief is raw at first, eases over months and comes back on anniversaries. For about one
  bereaved person in ten (more after losing a child) it does not ease, until therapy helps.
- **Help:**
  - **Talk to someone you trust** (once a day): it eases stress and brings you closer.
  - **Therapy:** twelve weekly sessions, either on the public waiting list (free or cheap where it exists, from
    about four weeks in Australia and Argentina to twenty in Germany and half a year in Canada) or privately (from
    about $20 a session in India to $160 in Australia; the United States has private therapy only).
  - **A doctor** prescribes medication.
- **Stigma and access by country:**
  - **Access:** about half of those in need get care in rich countries, and under one in ten in India (World Mental
    Health surveys).
  - **Stigma** is high in Korea, Japan, China, India, Russia and Saudi Arabia. It keeps people from seeking help
    (men most of all), and some people you confide in will not want to hear it.
  - **Over time:** access grows and stigma fades over the decades. A national mental-health programme (about 0.4%
    of revenue, launched by governments or by you as head of government) halves waiting lists and speeds both.
- **On screen:**
  - a "Mind and mood" panel in Life, with your conditions, the losses you are grieving, therapy, and the people
    you can talk to;
  - a mental-health panel on each country page (depression, anxiety, burnout, share in care, access, stigma).

### New in 2.5.1: values, and personality that grows

The first part of 2.6 Life 2.0: the mind.

- **Values.** Everyone values five things to different degrees: family, career, faith, community and freedom. They
  come from:
  - their country: faith matters to about a fifth of people in Japan and China and to most in Saudi Arabia and
    India (Pew and the World Values Survey);
  - their age: older people put family, faith and community higher, younger ones career and freedom;
  - their politics, and their own nature.
- **Values shape lives:**
  - people who value family get engaged and have children sooner;
  - shared values draw people together, and clashing values strain a couple;
  - voters lean towards parties whose outlook fits what they value.
- **Personality that grows.** The five traits (ambition, appetite for risk, loyalty, love of money and energy)
  now change with experience, and each change is recorded with its cause:
  - a war makes veterans more cautious and more loyal;
  - losing a job to a machine dents ambition, and redundancy makes people hold on to money;
  - a promotion or public office breeds ambition;
  - prison breeds distrust;
  - grief saps energy;
  - going bust teaches caution;
  - marriage and parenthood turn people towards family.
- **Profiles** (yours and everyone's) show what a person values, their traits, and how life has shaped them.
- Values are computed from a person's circumstances and stored only once experience has changed someone, so saves
  stay small.

### New in 2.5.0: A world of consequences

2.5 is complete:
- central banks, credit ratings and defaults (2.4.1);
- markets, currencies and commodity cycles (2.4.2);
- climate over decades (2.4.3);
- soft power and prestige events (2.4.4);
- demography and long-run growth (2.4.5);
- the decades campaign and the World Almanac (2.4.6).

This release calibrates the long run.

- **Statistical skips now model more of the world**, so long campaigns stay realistic:
  - natural disasters strike at the same rates as in normal play;
  - firms are born and die: about 5% of private firms close each year, more if they are short of cash, and local
    entrepreneurs (or locals with savings) start replacements;
  - working-age adults find jobs (since 2.4.6).
- **Technology's growth bonus is halved,** because potential growth already includes ordinary technical progress.
- **40-year headless runs, against history** (four seeds, statistical skips):
  - median growth of output per worker is 2.1–2.4% a year;
  - 0–2 wars between the sixteen countries (they have fought almost none directly since 1985);
  - 0–4 coup attempts (the real record: Turkey 2016) and 1–12 regime changes (about ten in 1985–2025);
  - firm births and deaths of about 5% a year each;
  - about 48 notable natural disasters a year across the sixteen countries;
  - about 2°C of warming by the 2060s.
- **Fix:** the Windows smoke test in the release pipeline waits briefly for the handed-over process to exit before
  counting game processes; it could fail at random before.

### New in 2.4.6: the decades campaign and the World Almanac

The sixth part of 2.5 A world of consequences.

- **Starting worlds.** A new game can start from three worlds:
  - **the present day:** the world as it is in 2025;
  - **a new cold war:** the United States and its allies against China and Russia, with deep distrust, sanctions
    and decoupled trade between the blocs, a Sino-Russian alliance, a Western technology partnership, and an arms
    race;
  - **a multipolar world:** American weight is smaller; China, India and the middle powers are larger; the dollar
    holds less of the world's reserves; and America's alliances are strained.
- **The World Almanac** is a new screen (Society → World Almanac) with the record of the campaign:
  - every country's statistics each 1 January (economy, population, output per worker, technology, soft power and
    credit rating), with the world's temperature;
  - every head of government, with their party and time in office;
  - every war and its outcome, and every treaty;
  - the largest companies, and the most famous people (living and dead).
- **Fix: long skips keep people in work.** Statistical skips now run a simple job market: working-age adults out of
  work join firms in their country, and firms take on more people while there are job seekers. Before, new adults
  never found work during skips, and income inequality drifted to implausible levels over the decades (an income
  Gini of about 0.8 after 50 years). It now holds at about 0.2–0.3.

### New in 2.4.5: demography, migration and long-run growth

The fifth part of 2.5 A world of consequences.

- **National populations.** Behind the simulated people, each country has a population starting from 2025 (UN
  World Population Prospects 2024): fertility (Korea 0.72 children per woman, India 2.0, Saudi Arabia 2.3), an age
  structure (Japan has half a pensioner per person of working age, India a tenth), and net migration (Canada and
  Australia take the most).
- **Change over the decades.** Fertility drifts towards about 1.5. Low fertility and longer lives age a society;
  immigrants, mostly young, slow it. Population changes with births, the age structure and migration. In 50-year
  test runs Japan shrinks by about 30%, China and Korea by about a fifth, and India grows by about an eighth.
- **What it changes:**
  - a country's economic weight grows and shrinks with its population;
  - an ageing workforce and pension costs slow growth.
- **Immigration policy** follows the government: nationalist leaders close the doors, liberal ones open them.
  Wars with occupied land and civil wars send refugees to neighbours that take them, and a nationalist public
  resents a large intake.
- **Long-run growth, fixed:**
  - fast-growing economies now slow as they catch up: once productivity has quadrupled since 2025, potential
    growth is down to about 1.5%;
  - slow-growing rich countries no longer lose "catching up" growth they never had.
  In 50-year runs India's output per worker now grows about fivefold rather than fifteen to nineteen, and China's
  about 3.5-fold rather than eight.
- **The Country screen** has a Population panel: population against 2025, fertility, the old-age ratio and its
  cost, net migration (with refugees), immigration policy and climate migration.

### New in 2.4.4: soft power and prestige events

The fourth part of 2.5 A world of consequences.

- **Soft power** starts from the Brand Finance Global Soft Power Index 2025 (the United States 79, China 73,
  Britain and Japan 67, Germany 66...). It drifts with:
  - freedom (repression and coups repel, democracies attract);
  - aggression (starting a war costs it);
  - prestige: world-first breakthroughs, space missions, hosting the Olympics or a World Expo;
  - the strength of a country's universities and economy.
  It changes slowly: at most 15 points above where a country started.
- **What it does:** other countries warm to an attractive country a little every month, foreign students and
  researchers add to its research workforce, and it gains diplomatic capital.
- **The Summer Olympics** every four years (Los Angeles 2028 and Brisbane 2032 are set) and a **World Expo** every
  five (Riyadh 2030). Later hosts are chosen seven years ahead, weighted by soft power and economy. Hosting costs
  the treasury and lifts approval and standing abroad. The Olympic medal table rewards big, rich and healthy
  countries (and the host), and the top three gain soft power.
- **The State of the World** has a Soft power and prestige panel: the ranking, and the Games and Expos past and
  planned.

### New in 2.4.3: climate over decades

The third part of 2.5 A world of consequences.

- **Emissions.** Each country's CO₂ emissions start from 2025 (Global Carbon Project: China 12 billion tonnes, the
  United States 4.9, India 3.1...). They follow its economy, the fossil share of its energy and a steady fall in
  energy intensity. The rest of the world adds about ten billion tonnes, falling slowly.
- **Temperature** follows cumulative emissions (the IPCC's 0.45°C per thousand billion tonnes), from 1.3°C above
  pre-industrial levels in 2025; the sea rises with it. In 50-year test runs the world passes 1.5°C in the early
  2030s and reaches about 2.1°C by the 2070s, with the sea up about 30 cm. The world is told when it crosses
  1.5, 2, 2.5 and 3°C.
- **Effects:**
  - weather is warmer everywhere, more so near the poles;
  - hurricanes, floods, droughts and wildfires come more often (about 30% more per degree);
  - harvests fall in tropical and arid regions and improve a little in cold ones;
  - low-lying coasts flood once the sea has risen enough;
  - people move from the hottest regions to cooler ones.
- **The energy transition.** Coal goes first, then oil, then gas, replaced by wind, solar, nuclear and a little
  hydro and bio. It is faster for committed members of the climate agreement and with batteries, geothermal, small
  reactors and (especially) fusion. Committed members gain a little growth from green industry.
- **The Paris Agreement** starts with every country but the United States (which left in 2025) and suffers from
  free-riding. Nationalist governments, and fuel exporters most of all, may leave; members whose leaders are
  nationalist stay in name only; others join as the world warms.
- **The State of the World** has a Climate panel: temperature and its history, sea level, last year's emissions,
  the largest emitters with their fossil shares, and who is in the agreement.

### New in 2.4.2: markets, currencies and commodity cycles

The second part of 2.5 A world of consequences.

- **Stock markets.** Every country has a stock index (2025 = 1). It rises with growth, the business cycle and an
  equity premium. In long booms with cheap money a bubble builds, and the bigger the bubble, the likelier the
  crash. A crash in a large market spreads: other markets fall, fear grips investors, and the world economy turns
  down. In 40-year test runs there are about three global crashes, close to the real record.
- **Capital flows.** When the world is calm and dollar interest rates are low, money flows into emerging markets
  (countries rated below A-) and their currencies firm; when fear returns, it flows out and they weaken.
- **Currency crises.** An emerging market with thin reserves and a poor rating can suffer a sudden stop: its
  currency collapses by a fifth to two fifths.
- **Pegs.** Saudi Arabia keeps the riyal pegged to the dollar, as it has since 1986. Defending the peg in hard
  times (low oil prices, frightened markets) spends reserves; if they run too low the peg breaks with a
  devaluation.
- **Reserve currencies.** Shares of world reserves start from the IMF's 2024 figures (dollar 58%, euro 20%, yen
  6%, pound 5%) and drift slowly with economic weight, credit ratings, capital controls and the use of sanctions.
  In test runs the dollar's share eases to about half by the 2060s and the yuan's rises to about a tenth.
  Issuers of reserve currencies borrow more cheaply.
- **Commodity super-cycles.** Beyond daily volatility, the long-run price of each raw material swings by about a
  third either way over 20 to 30 years.
- **On screen.** The State of the World shows risk appetite, the leading stock markets, the super-cycles and world
  reserves. The Credit panel shows the country's stock index, its currency regime and its reserve share.

### New in 2.4.1: central banks, credit ratings and defaults

The first part of 2.5 A world of consequences.

- **Central bank independence.** Each central bank has an independence score from 2025: high for the Bundesbank
  (via the ECB), the Bank of Canada and the Bank of England; low for Turkey's and China's. An independent bank
  follows its rule. A dependent one is leaned on to cut rates before elections and when the government is
  unpopular, which feeds inflation. Independence erodes under autocracy and recovers in democracies.
- **Credit ratings,** from AAA to D, start from the 2025 ratings (Germany, Canada and Australia AAA; the United
  States AA+; Argentina CCC). They move a notch at a time (at most once a quarter, monthly in a crisis) with:
  - the debt the government runs up;
  - growth and inflation;
  - its institutions;
  - war, a failed state, and past defaults.
  An outlook shows which way a rating is heading.
- **The rating sets the bond rate:** the policy rate plus a premium that grows as the rating falls (none for AAA,
  about 1.7 points at BBB, 6 points at CCC). An IMF programme halves it. This replaces the earlier premium on
  debt alone.
- **Sovereign default.** A government that has borrowed to its limit, cannot pay its bills and has no IMF rescue
  defaults:
  - bondholders take a 30–50% loss in the restructuring;
  - the rating falls to D and recovers slowly;
  - capital flees and the currency weakens;
  - growth suffers for two years, and voters punish the government.
- **The Country screen** has a Credit rating panel: outlook, public debt, bond rate, the central bank's policy rate
  and independence, and any defaults.
- Statistical skips keep public finances roughly steady (the bond market runs in normal play), so over skipped
  years ratings move with growth, institutions, wars and defaults.

### New in 2.4.0: Frontiers

2.4 is complete. The near future arrives:
- the technology tree (2.3.1);
- the innovation system (2.3.2);
- cyber commands (2.3.3);
- space (2.3.4);
- automation and society (2.3.5).

This release adds:

- **The astronaut corps,** a new public service with a career from astronaut candidate to chief of the astronaut
  office, in countries that launch their own crews. Astronauts fly the crewed prestige missions, and the crew
  becomes famous.
- **Three stories:**
  - *The breakthrough* (for researchers): publish openly, patent it and take a grant, or give it to the defence
    ministry.
  - *The machines are coming* (for workers in routine jobs once automation arrives): retrain, organise with your
    colleagues, or keep your head down.
  - *Launch window* (for astronauts): go, call a hold, or give your seat to a colleague.
- **The technology race** on the State of the World screen: every country's technology level, research effort,
  frontier technologies, world firsts, cyber offence and space capability, with the latest breakthroughs.
- **Research pays.** Research spending above a country's usual effort now adds to growth directly. Before, a
  country that pulled ahead through its own research lost "catching up" growth and gained nothing for it. In a
  30-year test, Japan tripling its research spending overtakes the United States in technology, makes eight of
  the world's breakthroughs, and ends with 24% more output per worker.

### New in 2.3.5: automation and society

The fifth part of 2.4 Frontiers.

- **Machines take over routine work** as robotics, AI agents, humanoid robots and (one day) human-level AI arrive.
  Each month some firms replace a worker in a routine job with a machine. The firm pays for it (or its owner
  does) and keeps its output with fewer people: wages fall, profits rise.
- **How exposed a job is** depends on its kind (after Frey & Osborne and the OECD's estimates): office, transport,
  factory and retail work most; care, trades, teaching and science least. Adoption follows the technology over
  years. In a test, a country with robotics, AI agents and humanoid robots replaced about a tenth of its jobs in
  three years.
- **Displaced workers** get redundancy pay and unemployment benefit, and they are unhappier and more stressed. Firms
  in electronics and medicine take on more people as automation spreads.
- **The public reacts.** When many lose their jobs, approval suffers. A government under pressure may tax
  automation, which doubles the cost of machines (half goes to the treasury) and slows adoption; it may repeal
  the tax years later.
- **Your own firms** automate only when you choose: the Companies screen has an Automate a position button. It
  needs the technology and a worker in a routine job, and a machine needs people to run it (at most two per
  worker).
- The Technology panel shows how much routine work machines do, how many workers have been replaced, the public
  mood and any robot tax.

### New in 2.3.4: space

The fourth part of 2.4 Frontiers.

- **Space agencies** for every country (NASA, the China National Space Administration, Roscosmos, ISRO, JAXA and
  the others). Each has three constellations of satellites, for communications, reconnaissance and navigation,
  starting from 2025: Starlink, GPS, BeiDou, GLONASS, OneWeb, NavIC and QZSS.
- **Launches.** Six countries can launch on their own rockets in 2025 (the United States, China, Russia, India,
  Japan and South Korea); others buy launches abroad, more slowly. Constellations grow towards what a country's
  space technology and economy can sustain, faster with reusable rockets and mega-constellations. A country with
  the know-how develops its own launcher.
- **What satellites do.** Reconnaissance satellites sharpen intelligence collection; navigation and
  communications satellites make armed forces more effective.
- **Anti-satellite weapons and debris.** In a general war, a country with anti-satellite weapons may shoot down
  the enemy's satellites. Hawkish governments occasionally test them in peacetime (at most once a decade), and
  the world disapproves. Every strike and test leaves debris that wears down everyone's satellites; too much of
  it sets off a cascade of collisions.
- **Prestige missions:** a national space station, an asteroid sample return, astronauts on the Moon (the first
  since Apollo), and a probe to the outer planets. They lift approval at home and standing abroad; some fail.
  Missions flown before 2025 count, and none can fly before it realistically could: in test runs, China and the
  United States land astronauts on the Moon around 2030.
- **Fix: new states' economic weight.** A new state's economic weight is now its share of the old country's
  people, and the old country keeps the rest. Before, it inherited the whole economy of the country it left.
  This affects its research effort, power index and space programme.
- **The Country screen** has a Space panel: the agency, its constellations and their effects, missions, and the
  debris in orbit.

### New in 2.3.3: cyber commands

The third part of 2.4 Frontiers.

- **Every country has a cyber command** with an offence and a defence. They are built from:
  - information technology and the agency's budget;
  - AI-driven cyber tools, quantum computers and post-quantum codes;
  - a working state and a sound grid;
  - the 2025 investment of the leading cyber powers (Russia, China, the United States and Britain).
- **Three kinds of attack:**
  - on a power grid: blackouts across a region for several days;
  - ransomware: firms in a region locked out of their systems;
  - hack and leak: stolen material released before an election helps the attacker's favoured party.
- **Attribution is uncertain.** The victim investigates. A strong defender with a good network inside the
  attacker's country usually finds the culprit; otherwise the attack stays unexplained, or is blamed on the
  victim's worst rival, who takes the diplomatic blame. A traced attack costs relations and leaves a grievance,
  but it is not an act of war.
- **AI commands** strike rivals now and then, and enemies often in wartime: about ten notable attacks a year
  worldwide.
- **The Intelligence screen** has a Cyber command panel: offence and defence, attacks on your country as your
  investigators understand them, and (for the president, vice president or intelligence minister) your own
  attacks and the order to launch one.

### New in 2.3.2: the innovation system

The second part of 2.4 Frontiers.

- **Government research** is a new public service: national laboratories with a career ladder from research
  assistant to laboratory director, open to graduates in science, engineering and medicine.
- **The research workforce.** A country's research effort now counts how well its laboratories are staffed and
  how many scientists and engineers its firms employ (from half to 1.6 times the normal effort).
- **Patents.** A breakthrough is patented by a firm at home in the matching industry, and the lead researcher
  becomes known for it (fame and influence; you, if you lead the team). Every country that later adopts the
  technology pays the patent holder royalties.
- **Technology partnerships** are a new treaty. Partners adopt each other's technologies faster and never keep
  them from each other. AI governments offer them to friends.
- **Stolen designs.** A successful cyber intrusion can steal the designs of a technology the target has, if the
  thief's own level is close enough to use them.
- The Technology panel shows the research workforce and the country's patents with their royalties.

### New in 2.3.1: the technology tree

The first part of 2.4 Frontiers.

- **26 frontier technologies for 2025–2075**, in the six technology domains, grounded in current research:
  - AI agents, sub-2-nanometre chips, post-quantum cryptography, AI-driven cyber operations, fault-tolerant quantum
    computers and human-level AI;
  - advanced robotics, industrial 3D printing and humanoid robots;
  - drone swarms, hypersonic missiles, laser air defence and autonomous combat systems;
  - personalised mRNA therapies, AI diagnosis, gene therapy and slowing ageing;
  - solid-state batteries, enhanced geothermal, small modular reactors and fusion power;
  - reusable rockets, satellite mega-constellations, anti-satellite weapons, a lunar base and a Mars landing.
- **Breakthroughs.** Each technology becomes possible once a country's level in its domain reaches a threshold,
  measured from the 2025 world leader. The first country there may make the breakthrough, more likely with a
  larger research effort (R&D spending times the size of the economy). Human-level AI, slowing ageing, fusion and
  Mars are uncertain: even when possible, they are unlikely in any given year. In 50-year test runs, AI agents
  and mRNA therapies arrive in the late 2020s, quantum computers in the 2050s and fusion in the 2060s; human-level
  AI comes late or never.
- **Diffusion and export controls.** Others adopt a technology once they are close, faster with effective
  institutions. If every country that has it dislikes them (or embargoes them), adoption is much slower.
- **Effects:**
  - faster growth for ten years after adoption, a lasting gain in output per worker;
  - stronger formations;
  - sharper intelligence (a quantum computer reads traffic not protected by post-quantum codes);
  - lower mortality, and cheaper energy;
  - prestige missions improve the world's view of the country that achieves them.
- **The Country screen** has a Technology panel: what the country holds, its world firsts, and what is next
  within reach.

### New in 2.3.0: Rise & fall

2.3 is complete. Countries now rise and fall:
- regimes with their own rules (2.2.1);
- coups and revolutions (2.2.2);
- secession and new states (2.2.3);
- civil wars, mergers, failed states and restoration (2.2.4);
- puppets, proxy wars, peacekeeping and insurgency (2.2.5).

This release adds:

- **Three stories:**
  - *The night of the coup*: stay home, stand in the square against the soldiers, or offer your services to the
    new rulers (or inform on the plotters if the coup fails).
  - *The referendum*: campaign for independence, campaign to stay together, or keep your opinion to yourself.
    Your campaigning moves support a little.
  - *A new flag*: when your home becomes a new state, apply for its citizenship, celebrate, or worry about what
    comes next.
- **The Rise & Fall timeline** on the State of the World screen lists every regime change, coup, revolution, new
  state, civil war, merger, puppet and failed state, newest first, with a count of the countries alive today.
- **Calibration.** Sixty simulated years bring a handful of coup attempts, the occasional successful one, and in
  some runs a successful independence referendum. Civil wars and new borders are rare but possible. Secession comes
  from region data and play, never from a script, and the game takes no side.

### New in 2.2.5: puppets, proxy wars and peacekeeping

The fifth part of 2.3 Rise & fall. It also completes what 2.2 War & peace carried forward: support to insurgents,
peacekeeping, and insurgency.

- **Arming the rebels (a proxy war).** A new diplomatic action sends weapons and money (3% of the treasury's gold)
  to rebels, or to a breakaway state fighting its government. Their forces gain equipment and morale (or raise
  volunteers), and the government they are fighting becomes your enemy. AI governments arm rebels fighting their
  rivals.
- **UN peacekeepers.** The Security Council can send peacekeepers to a civil war or a war of secession. If the
  resolution passes, the fighting stops along the line for two years, the two sides are pushed towards
  reconciliation, and a reunion becomes possible at lower trust. A government fighting rebels is no longer
  condemned as an aggressor.
- **Puppet states.** A puppet is bound to its overlord by a defence treaty, pays 2% of its gold a month in
  tribute, and cannot attack its overlord. A state becomes one in two ways:
  - a breakaway state kept alive by a foreign sponsor's arms answers to that sponsor once the war ends in
    partition;
  - a much stronger victor may make a small or breakaway state its puppet after a war.
- **Breaking free.** Puppets can break free when the overlord is losing a war or a nationalist government
  takes over.
- **Insurgency.** Annexed land, frustrated independence movements and failed states feed armed resistance. Once
  an insurgency is strong enough, it wears down the troops stationed in restive regions, raises unrest and
  costs the government approval. Effective institutions suppress it.
- **The Country screen** shows puppets, overlords and insurgencies; the Diplomacy screen has the new action and
  resolution.

### New in 2.2.4: civil wars and dynamic nations

The fourth part of 2.3 Rise & fall.

- **Civil war.** It can break out in two ways:
  - an uprising is met with force in a country whose regime has lost its legitimacy;
  - a failed coup splits the army.
- **The rebel government.** The rebels form a government (a faction) in the most restless third of the country,
  never the capital. Forces based there go over to them, with part of the rest of the army if it has split;
  rebels without troops raise a militia. The government's rivals recognise them; most countries do not.
- **The government fights back** campaign by campaign with the ordinary war machinery, for as long as it has
  fight left in it. A civil war ends in one of three ways:
  - **crushed:** the government retakes everything and the faction dissolves back into the country;
  - **rebel victory:** the rebels take the capital or the government surrenders, and their leader rules the whole
    country under a new regime;
  - **partition:** an armistice, or a front that freezes, leaves two governments.
- **Mergers.** A state can be absorbed by another: a breakaway state wholly retaken, a crushed rebellion, or a
  voluntary union when a seceded or partitioned state and its old country are on good terms. Land, citizens,
  firms and the treasury move across, and balances convert to the new money at the market rate. The absorbed
  state ceases to exist, and its wars and alliances end with it.
- **Failed states.** When legitimacy, order and the treasury all collapse, the state fails. Institutions decay,
  unrest spreads and a coup becomes twice as likely, until legitimacy and order return.
- **Restoration.** A government in exile returns home when the people of an occupied home region rise against the
  occupier.
- **The Country screen** shows when a state is a rebel government, a failed state or no longer exists.
- Wars now have two more kinds: a civil war and a war of secession.

### New in 2.2.3: secession and new states

The third part of 2.3 Rise & fall.

- **Regional identity.** Every region has an identity of its own: how distinct its language, history or
  nationhood is (for example Quebec, Scotland, Tibet, Chechnya and Kurdish south-east Turkey). This measures
  distinctness only; whether a region ever seeks independence comes from play.
- **Support for independence** starts from recent polls where they exist (Scotland about 47%, Quebec about 35%)
  and otherwise from identity. It rises when the region is alienated (unrest, an unpopular or illegitimate
  government, an autocracy, a war going badly) and fades when things go well. Above 30% a movement forms.
- **Referendums.** A democracy may agree to a referendum when support passes 45%. The region can win or lose it,
  and a lost vote takes the steam out of the movement for years.
- **Unilateral declarations.** Where no referendum is allowed and support passes 60%, a region may declare
  independence. Its old country calls it rebellion and may go to war to take it back.
- **New states are full countries.** Each has its own name, colours, currency (issued at independence and
  traded on the currency market), treasury, share of the gold reserves, parties, president, cabinet and
  congress. Residents become its citizens, local firms switch to the new money, and the new government sets up
  state enterprises for food and grain if nobody makes them yet. Saves keep new states.
- **Recognition.** After an agreed referendum nearly every country recognises the new state; after a unilateral
  declaration, mostly its old country's rivals do. Those who refuse cool towards it.
- **The regime panel** shows the regions where support for independence is significant and, for a new state,
  when it became independent and who recognises it.

### New in 2.2.2: coups and revolutions

The second part of 2.3 Rise & fall.

- **Coups.** Disloyal officers (real citizens of command rank) plot against the government. The chance of an
  attempt follows the regime, in line with Powell & Thyne's coup data:
  - rare in full democracies, more common in personalist regimes and juntas;
  - higher in weak states, when legitimacy collapses, when the regions are in turmoil, or when a war is going badly;
  - lower with coup-proofing, which cautious autocrats build up.
- **How a coup ends.** If it succeeds, the senior plotter takes power at the head of a military junta, and
  democracies condemn it. If it fails, the plotters are arrested for treason (a new charge), the army is purged,
  and coup-proofing tightens. In 30-year test runs the sixteen countries see two or three attempts, close to the
  real record.
- **Protest movements** grow with low legitimacy, regional unrest and unemployment. Governments answer with:
  - concessions, which democracies and dovish leaders prefer, and which restore some legitimacy;
  - repression, which costs legitimacy and can backfire when the security forces fire on the crowd.
- **Revolutions.** A movement that grows large enough brings down an autocracy if the security forces refuse to
  fire. The regime opens up and elections are called. If they do fire, the uprising is crushed and the world
  condemns it. In a democracy, mass protest brings the government down through an early election instead.
- **The regime panel** shows the strength of the protest movement and the yearly risk of a coup.

### New in 2.2.1: regimes

The first part of 2.3 Rise & fall.

- **Every country has a regime,** starting from its real one in 2025 (rounded from the EIU Democracy Index and
  V-Dem):
  - full democracies: Canada, Germany, Britain, Japan, South Korea and Australia;
  - flawed democracies: the US, Brazil, Argentina, South Africa and India;
  - hybrid regimes: Mexico and Turkey;
  - Russia is a personalist autocracy, China a one-party state, and Saudi Arabia an absolute monarchy.
- **The regime sets the rules:**
  - Elections are free and fair in democracies. Elsewhere they are managed: a hybrid regime tilts them, a
    personalist one stages them for its leader, a one-party state confirms the party's choice, and a monarch faces
    no contest.
  - Democracies limit a head of government to two terms; the party then nominates someone else.
  - The press drifts towards what the regime allows.
  - Power passes by election, by the ruling party, to a royal heir, or to a council of officers.
- **Legitimacy (0–100)** follows the economy, the government's popularity, unemployment, social cohesion, whether
  elections are free, and the cost of repression.
- **Regimes change.**
  - A democracy can backslide when a nationalist leader governs, legitimacy is low and the public is unhappy. Strong
    courts make that much less likely.
  - An autocracy can open up when its legitimacy collapses and society is freer than the regime would like.
  - In 30-year test runs, one or two of the sixteen countries change regime, as in the real world.
- **On the Country screen,** a regime panel shows the type, legitimacy, the rules and the history of regime
  changes.

### New in 2.2.0: War & peace

2.2 is complete. Over 2.1.1 to 2.1.3, war was rebuilt:
- governments go to war only when their own calculation (made with what their intelligence believes) favours it;
- a country at war mobilises, loses real citizens killed, wounded and captured, makes refugees, and pays with
  war bonds and borrowing;
- wars escalate, wear both sides down, and end by negotiation, by freezing along the front line, or by petering
  out, with treaties, reparations and demilitarised borders.

This release adds the aftermath, the record and four stories.

- **The aftermath.** Each side raises a memorial to its fallen. After a war that reached the bombing of cities, the
  victor puts the losers' commanders on trial, and the losers remember it as victors' justice. Those called up come
  home as veterans.
- **The war chronicle** now records surprise attacks, mobilisation, every escalation and step back down, each
  deadline passed with both sides still fighting, a front freezing, reparations, memorials and tribunals.
- **Four stories:**
  - **The call-up:** recalled from the reserve, you report for duty, ask for a deferment (granted if your work or
    family needs you), or do not report and live with the consequences.
  - **Letters from the front:** a partner, child or parent at war writes home. You write back about ordinary
    things, send a parcel, or beg them to come home.
  - **Ceasefire:** as head of government, or a senior diplomat, when the war has dragged on: offer an armistice,
    ask a neutral country to mediate, or hold out for better terms.
  - **Coming home:** back from the war, you pick up your old life, join a veterans' association, or tell your
    story to the press.
- **Calibration.** In ten-year test runs, wars between the sixteen countries are rare (none to a few a decade),
  each records why it started, and none drags on for ever. That matches the real base rate for major powers.
- The roadmap and README now cover 2.2, including what it left for later (insurgency, proxy wars and
  peacekeeping, which move to 2.3 alongside civil wars) and where each item is now planned.

### New in 2.1.3: how wars run and end

The third part of 2.2 War & peace. The old rule (a war simply ended at its deadline, with every occupation
returned unless the quota was met) is gone.

- **Kinds of war.** An invasion claims several regions, a limited war one, and a punitive war none, fought only
  to hurt the enemy.
- **Exhaustion.** Each side's war exhaustion (0–100) rises with losses, cost, lost territory and time, and falls
  with victories. It wears down the government's approval and makes it want peace. An enemy's exhaustion is worth
  waiting for. Nobody sues for peace in the first fortnight.
- **Escalation.** Wars climb a ladder: border fighting, a limited war, a general war (both sides strike cities and
  industry), and nuclear threats. The side with more at stake and more resolve climbs. Exhausted sides step back
  down. Each rung kills more. Only a country whose own land is occupied, or which is losing badly, makes nuclear
  threats, and an AI government uses nuclear weapons first only after reaching that rung (and then only as its
  doctrine allows).
- **The deadline is a review.**
  - If both sides still have fight in them, the war drags on for another two weeks (twice at most).
  - If the attacker holds ground it cannot win and the defender cannot retake, the front freezes: a frozen
    conflict, with the land still occupied and no peace treaty. Years later, once relations allow, a frozen
    conflict may be settled and the land returned.
  - Otherwise the offensive peters out and the occupied land goes back.
- **Peace terms.**
  - A negotiated peace brings a non-aggression treaty for three years, not a week.
  - Land that changes hands becomes a demilitarised zone for two years: no forces can be raised there.
  - The side that gave ground pays reparations over a year, from a tenth of its gold reserves; prisoners go home.
- **The Wars screen** shows each war's kind, its rung on the ladder, how often it has dragged on, and each side's
  exhaustion. Frozen conflicts are listed with past wars.

### New in 2.1.2: the home front

The second part of 2.2 War & peace.

- **Mobilisation.** A country at war calls up its reservists, including you and your family if you are in the
  reserve; office holders stay exempt. When its last war ends, they are stood down.
- **Casualties among real citizens.** Soldiers on duty are killed and wounded, more while their country's forces
  are in battle and more on the losing side. Their families mourn them, and you are told if one of your own falls.
- **Prisoners of war.** A lost battle leaves some of the losing side's soldiers in enemy hands. They cannot serve
  and come home when the war ends.
- **Occupation and resistance.** Occupied regions seethe, and partisans wear down the occupier's divisions there.
- **Refugees.** People flee regions that are being fought over or have just been occupied: to safer parts of
  their own country or, failing that, across the border to a neighbour at peace, which pays for their keep.
- **The war economy.** Fighting costs the treasury about a fifth of a day's revenue every day on top of the
  normal budget; deficit borrowing then covers the gap. Patriotic savers buy war bonds (more when war fever runs
  high), and arms industries are told to produce more.
- **The toll.** Every war keeps a toll for each side (killed, wounded, captured, refugees and money spent), shown
  on the Wars screen with each side's mobilisation. A surprise attack is marked as one.

### New in 2.1.1: why wars start

The first part of 2.2 War & peace.

- **A war calculation.** Governments no longer drift into wars because a hawkish deputy spots a weaker neighbour.
  Each weighs a war against each neighbour using what its intelligence believes. The chance of winning is its
  forces against the target's and its allies', as estimated.
- **What it hopes to gain** (weighted by that chance):
  - territorial claims and the prize itself;
  - nationalism;
  - a distraction from trouble at home;
  - striking a rising rival before it is too late;
  - the target's weakness (busy with another war, or divided at home);
  - fear of the target.
- **What it fears it will cost:**
  - the fighting;
  - lost trade;
  - the world's reaction;
  - war-weariness after a recent war, and other wars under way;
  - a war of choice with no quarrel behind it;
  - public opinion in a free country (the democratic peace);
  - above all, nuclear deterrence: attacking a nuclear power, or a nuclear power's ally, is almost never worth it.

  The leader's appetite for risk scales the whole.
- **Wars are rare, as between real states.** Only a war the calculation favours is put to congress, and deputies
  vote on the government's case as well as their own hawkishness and the public mood. In test runs, real-time play
  now sees a war every few years at most rather than several a year, and ten-year runs see between none and a
  couple.
- **Wars start during a statistical skip too.** A government that finds a war worth it asks congress, which votes
  on the merits.
- Mediators wait until a war is a week old: neither side talks in the first days of fighting.
- **The war chronicle** now includes the government's own calculation: its estimated chance of winning, what it
  hoped to gain and what it feared it would cost.

### New in 2.1.0: Shadows

2.1 is complete. Over 2.0.1 to 2.0.4, intelligence became something governments live by:
- services are organisations of eight directorates that grow and learn;
- every government acts on estimates with ranges rather than on the truth, so surprise attacks and miscalculation
  happen;
- agents have motives and placements, and officials defect;
- moles are hunted and turned into double agents who deceive their handlers;
- covert action exposed abroad becomes a scandal at home, and Five Eyes partners share what they see;
- elections can be interfered with.

This release adds three stories for intelligence officers, and calibration.

- **The walk-in.** An official of a rival country appears at your station with a folder. You can run them as an
  agent in place (if they are a plant, the material will be almost too good), bring them over as a defector, or
  turn them away.
- **Burned.** Your name is in the other side's files. You can lie low for a month, ask to be brought home, or
  carry on and hope.
- **The estimate.** The Director wants the service's judgement on a rival. You can write what the evidence says
  (the estimate sharpens), write what the government wants to hear (it drifts towards their fears or their
  hopes), or hedge every sentence.
- **Calibration.** In three-year test runs, the best-placed services make the smallest errors. The US and British
  services misjudge rivals' military power by about 10%, the smallest services by 20–30%. Governments that
  misjudge a rival make the mistakes that follow: wars against neighbours believed weaker than they were, and
  attacks that come as a surprise.
- The roadmap and README now cover 2.1. What 2.1 left for later (support to insurgents, assassination and regime
  change, built satellites and signals stations, a network map) is listed in the roadmap with where it now
  belongs.

### New in 2.0.4: mole hunts, double agents, oversight and sharing

The fourth part of 2.1 Shadows.

- **Mole hunts.** Every month each counter-intelligence directorate looks for foreign agents in sensitive places:
  government, congress, the service itself and the officer corps. Those it finds are arrested, which costs the
  handler its network and relations.
- **Double agents.** Some of the moles caught are turned instead of arrested. A turned agent stays in place and
  feeds the handler what the other side wants believed: its forces look stronger and its intentions softer than
  they are. The handler still trusts the source, so its estimate gets worse while it thinks it is getting better.
- **Oversight.** In countries with a free press and the rule of law, covert action leaks:
  - An exposed sabotage, smear, propaganda or unrest campaign abroad can become a scandal at home: approval falls,
    and the intelligence committee cuts the budget or the director resigns.
  - Whistle-blowers sometimes reveal operations nobody abroad had caught.
  - Closed governments pay little at home.
- **Sharing.** Partners in an intelligence-sharing treaty (Five Eyes) pool what they see: Canada, Australia and
  Britain see the world nearly as clearly as their best-placed partner.
- **Election interference,** a new covert operation: in the 60 days before a country's election, back the party
  closest to your own government with disinformation, leaks and money. If it is exposed, the backlash hurts the
  party it was meant to help. AI services use it against hostile countries.
- The Sources panel shows the turned agents your service runs against their handlers.

### New in 2.0.3: where intelligence comes from

The third part of 2.1 Shadows.

- **Agents have motives.** A recruited foreign citizen works for the service for one of four reasons, and each ends
  its own way:
  - money: mercenaries walk away when the payments stop;
  - conviction: ideological agents are steady;
  - coercion: coerced agents may walk into their own counter-intelligence and confess;
  - vanity: vain ones drift off.
- **Placement matters.** What an agent sees depends on where they sit. A head of government or a minister is worth
  far more than an intelligence officer, a member of congress, a military officer or a diplomat, and any of those
  far more than an ordinary citizen. Agents in place see past the other side's counter-intelligence and sharpen
  the service's estimates directly. AI services now go after officials first.
- **Defectors.** Intelligence officers, and more rarely ministers, of failing governments sometimes cross over to
  a rival, carrying what they know. The rival's picture of their country sharpens at once and its network there
  grows; their old service learns a hard lesson. Defections are rare from open societies.
- **Diplomatic cover.** Embassies shelter intelligence stations: networks grow faster where the embassy is open,
  and slowly where diplomats were expelled in the last year, or in wartime.
- **Cyber intrusion,** a new operation: break into a country's ministries and companies from afar. The estimate
  sharpens, and technology is copied if the target is ahead. It runs on the cyber directorate and needs only a
  small network. AI services use it too.
- A new **Sources** panel on the Intelligence screen (for the director and senior officers) lists the agents in
  place, their placement and motive, where your stations have no cover, and recent defections.

### New in 2.0.2: governments act on what they believe

The second part of 2.1 Shadows.

- **Estimates, not the truth.** Every government now holds an estimate of each other country's military power,
  economy, technology and hostility, each with a range.
- **How clearly it sees** depends on its collection:
  - its spy network in the country;
  - its signals, imagery, cyber, open-source and analysis directorates;
  - how open the country is (a free press gives a lot away);
  - how good the country's counter-intelligence is.

  In test runs the US and British services misjudge military power by about 10%, smaller services by 20–30%.
- **Misperceptions linger.** They correct themselves only over months, and hawkish leaders read more menace into
  what they cannot see clearly. Estimates are refreshed every week. A dossier or a reconnaissance operation
  sharpens them at once.
- **Decisions use beliefs.** Whether to go to war, how a crisis is played, whether to bow to an ultimatum,
  whether to join an alliance and how threatening a neighbour looks all rest on estimates now, including
  estimates of the other side's allies. Miscalculations happen: in one test run a country attacked a neighbour
  it believed half as strong as it really was.
- **Surprise attacks.** If the defender's intelligence had not judged the attacker hostile, the attack comes as
  a surprise and its forces are caught unready. Every war records what the attacker believed about the
  defender's strength, and the truth.
- **"What we believe."** A new panel on the Intelligence screen shows each country's estimated strength (yours
  = 1) with its range, its hostility, how well you can see it, and last January's estimate checked against the
  truth. It is visible to officers of the service and to the government.

### New in 2.0.1: intelligence services as organisations

The first part of 2.1 Shadows.

- **Eight directorates.** Every intelligence service is now an organisation with eight directorates: human
  intelligence, signals, imagery, open sources, cyber, analysis, covert action and counter-intelligence.
- **Real starting strengths.** Each starts from the real service in 2025 (rounded judgements from public sources).
  For example:
  - the US leads in signals and satellites;
  - Russia is strong in human intelligence and covert action;
  - China in cyber and counter-intelligence;
  - Britain in human and signals intelligence.
- **Services change slowly.** Month by month, each directorate moves towards what the country now gives it:
  - money: the budget, and how the director divides it;
  - technology: signals, open sources and cyber follow information technology, and imagery follows space;
  - people: the officers who serve in it.

  A service that is starved declines over years, not overnight.
- **Failure teaches.** A failed or exposed operation teaches lessons, and the directorate improves faster for a
  while afterwards. A service that catches foreign agents sharpens its counter-intelligence.
- **Operations depend on the directorate that runs them:**
  - reconnaissance on imagery;
  - sabotage, scandals and propaganda on covert action;
  - theft on cyber;
  - recruitment on human intelligence;
  - dossiers on analysis.

  Human intelligence builds networks abroad, and counter-intelligence protects the country at home.
- **Careers.** Officers serve in a directorate and can transfer. Operations run by an officer's own directorate go
  a little better.
- **On the Intelligence screen,** a Directorates panel shows each directorate's strength, trend, budget share and
  staff. The Director of Intelligence can shift money between directorates.
- **The roadmap** (docs/ROADMAP.md) now records the progress of every part from 1.6 to 2.0. It lists what 2.0 did
  not build, and where each of those items is now planned.

### New in 2.0.0: The great game

2.0 is complete. Over 1.9.3 to 1.9.7 the world's countries gained real foreign policies:
- relations built from trust, affinity, threat, trade and grievances;
- treaties with terms, end dates and records of whether they were kept;
- diplomatic actions with costs;
- the UN, the G20, the WTO and the IMF;
- crises, arms races and the balance of power;
- diplomatic careers and stories.

This release calibrates the whole over decades. In ten-year test runs from 2025:
- two or three international crises break out a year; most end in talks or fade, and about one in a decade
  becomes a war;
- arms races appear between the real rivals: the US and Russia, China and Japan, China and India;
- New START lapses in February 2026 as it really did, and new alliances form among countries that fear the same
  power;
- sanctions cost the target up to about a point of growth a year.

### Changed in 2.0.0

- **Rivalries no longer melt away.** Trust between two countries now returns to its historical level, which itself
  changes only over decades; before, it faded to neutral within about a year. Standing disputes (the Falklands, the
  Kurils, the China–India border) no longer fade by themselves, though a border agreement halves them. The US and
  Russia remain rivals, and the US and Britain remain close.
- **Structural suspicion.** Long-standing rivals watch each other's power whatever the mood of the moment, so the
  threat between the US and China or Russia and Germany stays real.
- **Deterrence in crises.** A country thinks hard before taking a crisis over the brink against a nuclear power or
  its ally. A pair that fought each other in the last two years is in no hurry to fight again.
- A government renounces a multilateral treaty (such as RCEP) only when most of its members have become hostile,
  not because of one of them.
- **Speed.** Skipping a year is faster: the diplomatic AI now works out each country's military power and standing
  once a day instead of thousands of times.
- The README describes diplomacy.

### New in 1.9.7: careers and stories in diplomacy

The fifth part of 2.0 The great game.

- **Three new public careers** (on the Jobs screen, in the larger places):
  - **The foreign service:** attaché, third secretary, first secretary, counsellor, ambassador. A country with a
    well-staffed foreign ministry builds up diplomatic capital faster.
  - **Trade negotiators:** from trade officer to chief trade negotiator, for graduates in business or law. Good
    negotiators make trade agreements easier to win and WTO cases likelier to go your way.
  - **The international civil service:** from junior professional officer to under-secretary-general. A country well
    represented in the UN system lobbies better for its resolutions.
- **Lobbyist (government affairs)** is a new occupation in oil, electronics, medicine and arms firms.
- **Three new stories:**
  - **The summit:** as head of government, or as a diplomat on the delegation, you push for a breakthrough, stick to
    the agreed text, or brief the press that you stood firm.
  - **A note from the embassy:** in a crisis, a diplomat can open a quiet back channel (which may calm things),
    advise a firm reply, or wait for instructions.
  - **The vote in the Council:** as head of government you decide your country's vote. As a senior diplomat or
    international civil servant you recommend it, and the capital usually follows your advice. The sponsor and
    the target remember.

### New in 1.9.6: crises, arms races and the balance of power

The fourth part of 2.0 The great game.

- **Crises short of war.** Between hostile neighbours and rivals, incidents happen: border clashes, naval standoffs,
  airspace violations, detained citizens and missile tests. A crisis climbs a ladder: an incident, protests and
  warnings, forces on alert, an ultimatum, the brink of war.
- **How a crisis ends.** Every three days each side escalates, holds firm, offers talks or backs down. Its resolve
  depends on:
  - the leader's character;
  - the balance of power, allies included;
  - what is at stake;
  - for an unpopular government, the pull of a rally round the flag.

  Talks on both sides settle a crisis. Backing down hands the other side a victory, in approval and in face. Only
  past the brink does a crisis become war, and between nuclear powers (or against a nuclear power's ally) fear
  almost always stops the last step. As head of government you choose your country's moves on the Diplomacy screen.
- **Arms races.** Two rivals who fear each other, with cold relations and no alliance, race. Both governments switch
  to a military build-up, and without an arms-control treaty two nuclear powers' arsenals grow. The race winds
  down when the fear or the hostility fades.
- **Balancing and bandwagoning.** A country facing a far stronger, hostile power looks for partners: it becomes
  keener on alliances with others who fear the same power. If it is weak, exposed, unallied and led by a dove, it
  makes its peace with the threat instead.
- **Polarity.** The world's shares of power are recorded monthly, and the world is called unipolar, bipolar or
  multipolar.
- **Sanctions cost growth.** They cost both sides, the target more, in proportion to the trade between them; a
  country under sanctions from a major partner loses up to a point of growth a year. New trade agreements add a
  little growth. Both appear in each country's growth breakdown.

### New in 1.9.5: the United Nations, the G20, the WTO and the IMF

The third part of 2.0 The great game.

- **The UN Security Council.**
  - The US, China, Russia and Britain sit permanently, each with a veto.
  - Four seats are elected for two years: South Korea holds one at the start. Each January the General Assembly
    fills the seats that fall vacant, choosing by standing and goodwill; no country is re-elected at once.
- **Resolutions on wars of aggression.** Within days of an attack, a Council member tables a resolution. There are
  three kinds:
  - a condemnation, which costs the aggressor trust with every country that voted for it;
  - a demand for a ceasefire, which may bring an armistice (or the aggressor is seen to defy it);
  - binding sanctions, which oblige every member to cut trade for a year. The aggressor's friends may defy them.
- **How countries vote.** Each votes on its interests: its relations with the aggressor and the sponsor, its
  alliances, and whether it wages wars itself. Most countries oppose aggression on principle; the aggressor's
  friends and allies stand with it.
- **Vetoes and the General Assembly.** A permanent member vetoes resolutions against itself or its friends. Blocked
  in the Council, the matter goes to the General Assembly ("Uniting for Peace"), where everyone votes.
- **Your vote.** As head of government you cast your country's vote on the Diplomacy screen, and you can table
  resolutions of your own.
- **The G20** meets every November, hosted in turn (South Africa in 2025). Leaders on speaking terms come away
  trusting each other a little more, and an aggressor at war is shunned.
- **The WTO.** A country hit by sanctions the UN never authorised may complain. Panels rule after a year, and
  national security is a defence when the threat is real. A country that ignores a ruling against it faces
  authorised retaliation.
- **The IMF.** A country whose gold reserves run out, or whose borrowing hits its limit, gets an emergency loan
  in gold from the largest economies, repaid over two years. Austerity costs the government approval, but its
  bonds pay a smaller risk premium while the programme lasts.
- A new "International organisations" panel on the Diplomacy screen shows the Council, the votes before the UN,
  recent results, the latest G20, your trade disputes and any IMF programme.

### New in 1.9.4: treaties and diplomacy

The second part of 2.0 The great game.

- **Treaties are real agreements.** Each has parties, terms, a start, an end date (or none) and a record of whether
  it was kept. There are eight kinds:
  - defence alliances and one-sided security guarantees;
  - non-aggression pacts and border agreements;
  - trade agreements: no import tariffs between the parties, and trade ties grow;
  - basing rights, intelligence sharing and arms control between nuclear powers.
- **The world of 2025.** The game starts with the treaties actually in force:
  - NATO, the US alliances with Japan, Korea and Australia, and the Five Eyes;
  - USMCA, Mercosur, CPTPP, RCEP, KORUS, the EU's agreements and about twenty other trade deals;
  - US bases abroad, New START (due to expire in February 2026), and the Sino-Russian border and friendship treaties.
- **Alliances mean something.**
  - Allies cannot be attacked, and they deter aggressors: a would-be attacker reckons with its target's allies.
  - When a member is attacked, its partners decide whether to stand by it. Those who do sanction the aggressor.
    Those who don't lose their ally's trust, and the alliance's credibility suffers.
  - Renouncing a treaty costs trust. Attacking a country within a year of tearing up a treaty with it is
    remembered by everyone as a betrayal.
- **Treaties run out.** At the end date they are renewed only if every party still wants them.
- **Diplomatic actions.** A government spends diplomatic capital, which builds up faster for countries with
  standing. The actions are:
  - praise and condemnation, and summits (treaties come easier for two months afterwards);
  - aid grants and loans between treasuries, repaid monthly (a default leaves a grievance);
  - sanctions and their lifting, and expelling diplomats (which hurts the other side's spy networks);
  - treaty offers and renunciations;
  - ultimatums (if refused, they give a cause for war for 90 days);
  - mediation of other countries' wars.
- **Other governments decide on the merits.** Alliances need a common threat, close relations and trust.
  Non-aligned countries such as India, Brazil and South Africa guard their independence. Nobody allies with a
  friend's rival, or with a country too far away to defend. AI governments use the same actions on the same terms.
- **Diplomacy screen.** It has a treaty browser and, for heads of government, a panel for conducting foreign
  policy. The panel shows how keen the other side is on each kind of treaty.
- Congress's alliance votes now create and end real treaties. Skipping a year statistically now runs diplomacy
  as well.

### New in 1.9.3: relations 2.0

The first part of 2.0 The great game.

- **What a relationship is made of.** How one country sees another is now built from:
  - trust: what each has done to the other, remembered and slowly fading;
  - affinity: similar governments, a shared language and shared blocs;
  - threat: the other side's military power, how close it is, and its intentions;
  - trade and investment ties;
  - grievances: territorial disputes and historical wrongs.

  The relation score moves towards that blend day by day.
- **The real world at the start.** The US and Britain, Canada and Australia are close, and China and Russia are
  friends. The US is cold towards Russia and wary of China. The Falklands, the Kurils, the China–India border and
  Japan's history with China and Korea are remembered as grievances.
- **Nations remember.** Embargoes, wars and broken deals cut trust on both sides. Conquered land leaves a grievance
  that takes decades to fade.
- **Blocs.** The North Atlantic alliance, the US alliances with Japan, Korea and Australia, USMCA, Mercosur, BRICS,
  Five Eyes and the Quad. Shared blocs bring countries closer, and allies keep a store of trust.
- **Leaders matter.** The head of government's character, from hawk to dove, risk-taker, ideologue or pragmatist,
  and nationalist, colours how threatening the world looks.
- **A new Diplomacy view** on the Country screen shows every relation broken into its parts, the country's blocs,
  its standing in the world and its leader's outlook.

### New in 1.9.2: skip a year in seconds

- **Skip a year is now statistical, and takes seconds:** about 4 seconds for the default world, against 20 minutes
  before. The world moves a month at a time:
  - **Countries:** they take their monthly turn for growth, budgets and grand strategy, the arsenal and defence
    industry, energy, food and the power ranking.
  - **Money:** companies trade at their own recent averages, paying wages to their staff and costs back to the
    economy. Governments collect and spend at their recent rates, and people pay their living costs. All of it goes
    through the ledger.
  - **People:** they age, die at the usual rates, and are replaced by arrivals and young people coming of age.
  - **Elections and wars:** elections and other scheduled events happen on their dates, and battles under way are
    settled by the strength of the two sides.
  - **Your year:** it comes as the summary at the end.

  Individual shifts, markets and conversations pick up again when the skip is over. "+1 year" still lives the year
  in full.

### Fixed in 1.9.2

- **1×, 2× and 3× speeds did not move the clock** after 1.9.0. The guard that keeps 4× from falling behind also
  stopped the slower speeds from ever building up a ten-minute step. The browser test now checks every speed.

### New in 1.9.1: skip a year

- **Skip a year.** The ⏭ Advance menu has a new ⏩ Skip a year option. It runs straight to a year from now:
  - it does not stop for notifications;
  - everyone outside your own region is simulated at the coarser level used for long advances;
  - it ends with the summary of your year;
  - you can stop or cancel it at any time.

  The existing "+1 year" still lives the year in full and stops for important events.
- **Time left.** While time is advancing, the banner estimates how long it will take in real time.
- **Faster bookkeeping.** At coarse detail, the simulation now visits only the people who act in each hour,
  instead of everyone, and no longer re-sorts the population every hour.

### New in 1.9.0: Sky & ground

1.9.0 completes Sky & ground: weather, hazards, energy and food. Releases 1.8.1 to 1.8.4 built it:
- weather and climate;
- natural hazards;
- energy and resources;
- food security, careers and stories.

This release calibrates them over a simulated year (`tests/naturecal.ts`):

- **Disasters at real rates.** About 90 natural disasters a year strike the 16 countries, near EM-DAT's count for
  them (it was about 20). Most are minor. Deaths are about three times higher per event than before, a few
  thousand a year in all.
- **Harvests are centred on normal.** The growing season no longer leans towards good years, and dry spells count
  against it.
- **Food imports.** Rich importers such as Japan and Korea now buy all the food they need, whatever the price, while
  poorer countries are priced out when grain is dear. Each grain exporter's embargo cuts imports by 8% (it was 12%).
- **Blackouts** for the previous year are kept for reporting.

### Changed in 1.9.0

- **The fastest speed (4×) now runs a day each second** (it was 3 hours a second).
  - At that speed, distant parts of the world are simulated in the same cheaper way as long time skips.
  - If your computer cannot keep up, the game runs as fast as it can rather than freezing to catch up.
  - Only the people in your own region are simulated hour by hour; elsewhere people act at their usual times and
    recover energy in daily steps.
  - Citizens' fighting is booked every other tick, with twice the hits.
  - Small worlds (about 2,000 people) reach a day a second. The default large world (about 12,700 people) currently manages
    about a third of that on a typical computer; a performance pass is next.

### New in 1.8.4: food security, emergency careers and disaster stories

- **Food security.**
  - Each country grows a real share of the food it eats: Argentina 2.5 times its needs, Canada 1.8, Japan under
    two-fifths, Saudi Arabia a fifth.
  - The harvest follows the growing season across its farm regions, and shortfalls are bought abroad.
  - Rich countries pay what it takes. Poor countries facing dear grain may come up short: approval falls, unrest
    rises and, at worst, famine strikes.
  - Embargoes by grain exporters bite.
  - The big exporters' harvests (the US, Canada, Brazil, Argentina, Russia and Australia) set the world grain price.
- **New careers.**
  - Emergency services: firefighter, crew commander, station officer, emergency coordinator, chief fire officer.
    Well-staffed emergency services raise a country's disaster preparedness.
  - The weather service: weather observer, forecaster, meteorologist, senior meteorologist, chief
    meteorologist. Well-staffed weather services make warnings save more lives.
  - Geologists and energy traders now work in the mining and oil industries.
- **Two new stories.**
  - "After the quake": dig with the rescue teams, give to the appeal, or check on your family and neighbours.
  - "The dry year": irrigate your farm, stock up, or wait for the rain.
- **Food on the Country screen:** the Country screen's energy panel now also shows harvest, self-sufficiency,
  imports and food supply.

### New in 1.8.3: energy and resources

- **Energy mixes.** Each country generates electricity from its real 2023 mix (IEA): coal, gas, oil, nuclear,
  hydro, wind, solar and bioenergy. For example, South Africa is over 80% coal, Canada over 60% hydro, Korea 30%
  nuclear and Germany over a quarter wind.
- **Energy prices.** World fuel prices pass through to each country's energy price, more so the more fuel it
  imports. Low-carbon power does not move with them. When oil doubles, Japan, which imports everything and burns
  much of it, is hit far harder than Canada. Companies' energy bills follow the energy price and the weather.
- **Grids and blackouts.** Weak grids fail more often under heat and cold stress: South Africa's load shedding,
  India's outages. A blackout cuts a region's output for the day.
- **Deposits.**
  - Reserves of oil, gas, coal, uranium, lithium, rare earths, copper and iron are kept in years of production,
    with each country's share of world output (China mines most rare earths and Australia most lithium).
  - Extraction depletes them and exploration finds more.
  - As reserves run low, output falls and imports rise.
- **OPEC+.** Saudi Arabia, Russia and Mexico meet monthly. They cut output when oil is cheap and raise it when oil
  is dear, which moves the world oil price and their own oil companies' output.
- **Critical minerals.** A country with little rare earth or lithium of its own loses some electronics and
  aerospace output if the main producer embargoes it.
- **Energy & resources panel** on the Country screen.

### New in 1.8.2: natural hazards

- **Heavy-tailed disasters.** Most events are minor, about one in ten is major, and a few in a hundred are
  catastrophic. Deaths, damage and recovery time grow steeply with size. Even the worst events kill no more than a
  few per cent of a region.
- **New hazards.**
  - Volcanic eruptions where real volcanoes are: Japan, Hawaii, the Cascades, Alaska, Popocatépetl and Kamchatka.
  - Tsunamis after great coastal earthquakes.
  - Heatwaves when the weather passes 38°C.
- **Preparedness.** Building standards, warning systems and emergency services start from each country's record:
  Japan is the best prepared and India the least. Investing in infrastructure raises preparedness. The same
  earthquake kills far more where buildings are weaker.
- **Early warning.** Storms, floods, eruptions and blizzards are forecast a day ahead, and evacuation saves lives.
  In "The storm warning" story, you choose whether to evacuate, board up and shelter, or carry on.
- **The response.** The army deploys at home, saving lives. After a major disaster, allies and friendly countries
  send aid, and relations improve.
- **Insurance.** Insurers (State Farm, Tokio Marine, Allianz, PICC and others) pay companies for disaster losses, in
  proportion to how much of each economy is insured: about half in the United States, a twentieth in India.
- **Reconstruction.** AI governments start rebuilding destroyed buildings through the construction system. A player
  government is told what was lost.
- **Warnings** for where you are appear on the Neighbourhood screen.

### New in 1.8.1: weather and climate

The first part of 1.9 Sky & ground.

- **Climate zones.** Every region has a climate: tropical, arid, temperate, continental, subarctic or alpine. It comes
  from latitude, terrain and coast. Western Europe and the southern hemisphere are mild and maritime. Moscow,
  Ottawa, Beijing and Seoul have hard winters and hot summers. Seasons are reversed south of the equator, and South
  and East Asia have a summer monsoon. Average temperatures in most capitals are within about 5°C of the real ones
  (high-altitude cities such as Mexico City run warm, because the map has no elevations).
- **Daily weather:** temperature, rain or snow, wind and storms. Warm and cold spells last for days.
- **Forecasts.** Tomorrow's forecast is uncertain, and more accurate where meteorology is better.
- **Weather matters.**
  - Farms follow the growing season: drought, frost and heat cut harvests, and good rains raise them.
  - Storms stop work outdoors.
  - Snow and heavy rain slow construction.
  - Cold and heat raise companies' energy bills.
  - Storms ground flights, and snow makes overland travel harder.
  - Military operations suffer in mud (armour), bitter winter, heavy seas and bad flying weather.
  - Your mood lifts on fine days and sags in storms and heatwaves.
- **Where to see it.** Weather for where you are is in the top bar. The Neighbourhood screen has today's weather,
  tomorrow's forecast, the climate zone and the growing season.

### New in 1.8.0: Arsenal

1.8.0 completes the Arsenal: militaries now get better or worse over time. Releases 1.7.1 to 1.7.4 built it:
- real defence budgets and equipment generations;
- R&D programmes and the arms trade;
- force structure, doctrine and strategic forces;
- defence careers and stories.

This release calibrates them over 30 strategic years at real budgets (`tests/arsenalcal.ts`):

- **Programmes take realistic times.** New fighters take 12–20 years, and the leading powers reach generation 5.5
  within about two decades. Leaders now work on the next generation of their big systems rather than picking
  classes at random.
- **Fleets age realistically.** With normal spending, average equipment age settles at 22–26 years, near the US Air
  Force's real average of about 29. Equipment now loses its edge only past 85% of its service life (it was 70%).
  When the contractor lacks the goods to build with, renewal slows by 30% (it was 50%).
- **Neglect shows.** A country that stops funding its forces sees its equipment age from 44 to 74 years. It no
  longer starts R&D programmes it cannot pay for, or orders weapons abroad without procurement money.

### New in 1.7.4: defence careers and stories

- **Defence procurement** is a new public career: procurement officer, programme manager, director of programmes,
  chief of defence procurement. Experienced programme managers cut the technical setbacks of the country's R&D
  programmes by up to a third.
- **New occupations at defence companies:** defence engineer and test pilot.
- **Arms trafficking.** Soldiers of an organisation and above can move weapons to buyers who cannot get an export
  licence. It pays well, and the police treat it as one of the most serious crimes.
- **Three new stories:**
  - "Over budget and behind schedule": as minister, decide what to do with a programme running far over budget.
    You can press on, rescope it, cancel it or blame the contractor.
  - "The export licence": a friendly country asks to buy equipment from your defence industry.
  - "Exercise season": for those in uniform when their branch exercises.

### Fixed in 1.7.4

- Jury service ("Twelve good people") was often withdrawn before you could serve, because the case went to an
  ordinary trial in the meantime. A case before your jury now waits for your verdict.

### New in 1.7.3: force structure, doctrine and strategic forces

- **Recruitment.** Countries with a draft (Russia, Turkey, Korea, Brazil, Mexico and China) keep twice the share of
  their people under arms. Conscripts cost less, but their armies fight a little less well. Volunteer forces are
  smaller and better trained, and volunteers leave when they go unpaid. Leaders can introduce or end conscription;
  introducing it costs popularity.
- **Doctrine** now changes the combat maths. Each country starts with its own:
  - manoeuvre warfare (Germany, Turkey) favours armour;
  - defence in depth (Russia, India, Korea) favours infantry;
  - air power (the United States, Saudi Arabia) favours air wings;
  - sea control (Britain, Japan, Australia) favours fleets and carriers;
  - sea denial (China) favours submarines;
  - asymmetric warfare (Mexico, South Africa) favours light forces at lower cost.

  Changing doctrine costs readiness while units retrain.
- **After-action reviews.** After every war, the losing side reviews its doctrine and often adopts the winner's,
  and both sides gain experience.
- **Exercises** raise readiness and experience for money and fuel. AI defence ministries exercise each branch
  about once a quarter.
- **Strategic forces.** The United States, Russia, China, the United Kingdom and India start as nuclear powers, with
  their real warhead counts and legs of the triad (Britain's deterrent is sea-based only).
  - Nuclear doctrine governs AI use: China and India have a no-first-use policy, Russia escalates to de-escalate,
    and the US and Britain use nuclear weapons only as a last resort.
  - Missile defence can intercept an incoming missile, most often over the United States.
  - All of this matters only when nuclear weapons are enabled in the advanced settings.
- **The politics of defence.** Lawmakers are more willing to raise the defence budget where defence contractors
  employ many people.
- **Force structure panel** on the Forces screen. Ministers can change doctrine and recruitment and order exercises.

### New in 1.7.2: R&D programmes and the arms trade

- **R&D programmes.**
  - Each country runs named programmes for the next generation of a class of equipment.
  - Each programme has a budget, a schedule and technical risk:
    - a new combat aircraft takes 10–20 years and a frigate design 5–10;
    - setbacks bring delays and overruns;
    - badly overrun or starved programmes are cancelled.
  - The defence industry can carry about six major programmes at a time in the United States and one in Mexico.
  - A finished programme raises the best generation the country can build. Renewal then brings the forces up to it,
    and the programme spins off civilian technology.
- **Real inputs.** Deliveries from the domestic defence contractor use its own output, aircraft or ground weapons.
  Without the goods, renewal runs at half speed.
- **The arms trade.**
  - Countries that cannot build a class well buy it abroad, from the best seller that will grant an export
    licence.
  - Licences go only to allies and friendly countries, never across an embargo or a war, never to someone at war
    with the seller's allies, and never between rival great powers.
  - Payments go to the seller's contractor over two to four years, and deliveries modernise the buyer's forces as
    they arrive.
  - A licence can be withdrawn, halting deliveries. Equipment bought from a supplier that turns hostile gets no
    spare parts and wears twice as fast.
- **Your country's programmes and orders** are on the Forces screen. As Minister of Defence or leader you can start
  and cancel programmes and buy abroad.

### New in 1.7.1: the arsenal

The first part of 1.8 Arsenal: militaries now have budgets, equipment generations and ageing.

- **Real defence budgets.** Each country's defence spending starts at its real share of GDP (SIPRI, 2024):
  - 3.4% for the United States;
  - over 7% for Russia and Saudi Arabia;
  - around 2% for most US allies;
  - under 1% for Mexico, Argentina and South Africa.

  Budgets are still set as a share of revenue, and grand strategies now scale each country's own normal level. The
  budget splits into personnel, operations and maintenance, procurement and R&D, as in national defence reports.
- **Equipment generations.** Fourteen classes of equipment, from small arms and armour to submarines, carriers,
  missiles, command and surveillance, and electronic warfare. Each has a generation (1–6) and an average age,
  starting from each country's real inventory. Only the US, China, Russia, Britain, India and Japan field
  carriers, and only the US, Russia and China field bombers.
- **Quality counts.** Formations field a mix of generations. Each generation is worth about 15% in combat.
- **Ageing and wear.** Procurement contracts renew equipment over its service life. Without them it ages, wears
  out faster and, past about 70% of its life, fights below its generation.
- **Defence contracts.** Procurement and R&D money is paid to the country's own defence contractor, the largest
  aerospace or ground-weapons company. Spares and supplies for formations are bought first.
- **Arsenal panel.** The Forces screen shows spending as a share of GDP, the budget split, and the generation, age
  and condition of every class of equipment. The order of battle shows each formation's generation.

### Fixed in 1.7.1

- Going back to a long screen now keeps trying to restore your scroll position for up to 5 seconds while the page
  lays out (it was 2.5 seconds).
- Once a screen has reached its scroll position, it no longer pulls the page back there. Scrolling with the keyboard
  or the scrollbar in the first moments after opening a screen could jump back to the top.

### New in 1.7.0: Law & order

1.7.0 completes Law & order: police, crime, courts and prisons are now careers and institutions. Releases 1.6.1 to
1.6.4 built it:
- prisons with real incarceration rates, life inside, parole and re-entry;
- courts with prosecutors, defenders and judges, bail, plea deals, appeals and wrongful convictions;
- white-collar crime, laundering and informants;
- policing with trust, clearance, corruption, internal affairs and national investigations.

This release calibrates them against real statistics. In a 90-day test of the default world:

- **Prison populations** stay within about 20% of each country's real rate. They are now measured against the crime
  level each country started with.
- **Pleas and convictions** follow national practice:
  - about 99% of US convictions come from guilty pleas, and 6% of Japanese ones;
  - Japanese and Korean prosecutors charge only strong cases, so about 95% of their trials end in conviction;
  - elsewhere, 75–90% of trials end in conviction.
- **Clearance** counts crimes reported with no suspect, so 47–67% of reported crimes reach court.
- **Trust in the police** settles near survey levels: about 60 in the US and western Europe, 15–20 in Russia and
  Mexico. Use-of-force incidents are rarer, and scandals cost less trust each.
- **Speed.** Court officials are looked up once per game hour, so the new systems add about 5% to simulation time.

### New in 1.6.4: policing as an institution

- **Trust in the police.** Each country starts from its real institutions: high in Germany, Britain and Japan, low
  in Mexico and Russia. Trust rises when cases are solved and falls with corruption scandals and violent arrests.
  Where people trust the police, witnesses come forward and cases build faster.
- **Clearance.** The Law & Order screen shows the share of reported crimes brought to court each month.
- **Corruption and internal affairs.**
  - Bribes now go into a real officer's pocket.
  - As an officer you can take an envelope from the organisation on your patch: dirty money, and thinner files on
    them.
  - Internal affairs reviews officers every month, more effectively where the rule of law is strong.
- **Use of force.** A few arrests turn violent, more often where institutions are weak. Videos and protests cost
  the police trust.
- **National investigations.** The Minister of the Interior or the leader can open a 30-day investigation:
  - into an organisation: more evidence and new cases against its members;
  - a sweep for police corruption;
  - a counter-espionage drive.

  AI governments go after their strongest organisations, and order corruption sweeps when trust collapses.
- **Prison officers.** A new public career runs from prison officer to governor (warden). How well prisons are
  staffed affects conditions inside.
- **Prison visits.** In prison, send a visiting order once a week. Someone close to you comes, which helps your
  mood, your stress and your conduct record.

### New in 1.6.3: white-collar crime, laundering and informants

- **Dirty money.** Money from crime is dirty until you launder it.
  - Through the tills of a business you own: it shows up as sales, and 30% stays in the business to pay the tax on
    them.
  - Through your organisation's fronts: they take a quarter.
  - Banks report large dirty balances, which can open a money-laundering case.
- **Tax evasion.** A business owner can hide 20% or 50% of profit from the tax office. The hidden tax builds up in
  the books. Monthly audits find it, more often the more is hidden and the stronger the country's institutions.
  An audit means back taxes, then a tax-evasion case. Greedy NPC owners cook their books too.
- **Embezzlement.** Pad expenses claims at your employer. The books catch up: the bigger the hole, the sooner.
- **Online fraud.** With technical training or economic skill you can phish households in another country. It is
  hard to trace, and only that country's police can pursue it.
- **Insider trading.** Insiders who buy shares in the week before they pay a dividend are flagged by the securities
  regulator.
- **Informants.**
  - Detectives can turn members of an organisation. Informants feed evidence on every case against the
    organisation until they are found out.
  - In "The informant" story, the police make you the offer: your charges dropped, a weekly payment, and the risk
    every day.
- **Jury service.** In "Twelve good people", you may be called to a jury in countries that use juries or lay judges.
  Your verdict decides the case.

### New in 1.6.2: the courts

- **Court careers.** Prosecutors, public defenders and judges are now public careers, listed with the other public
  posts on the Jobs screen. You need a law degree, and judges must be 30 or older. Courts sit in the larger
  places.
- **Who sits on a case matters.** Every trial is heard by a judge and argued by a prosecutor and, if the accused can
  afford one, a defence lawyer. The skill of the prosecutor and the defence moves the verdict. Lawyers' fees now go
  to a real defence lawyer. If you hold one of these posts, you hear about the cases you sat on.
- **Bail.** When you are arrested you can post bail. The court holds the money and your trial moves four days
  later, which gives you time to hire a lawyer and prepare a defence. You get the bail back at trial. If you have
  left the country, the bail is forfeit and a warrant waits for you.
- **Plea deals.** Pleading guilty is a certain conviction, with a lighter sentence and a smaller fine. How often
  defendants take the deal follows each country's practice: about 95% of convictions in the United States, about
  70% in Britain, about 20% in Germany and very few in Japan.
- **Appeals.** You can appeal a conviction within 14 days, unless you pleaded guilty. Weak convictions are
  overturned more often, and NPCs appeal too. A quashed conviction comes off your record, sets you free and returns
  your fine.
- **Wrongful convictions.** Where crime is high and the rule of law is weak, a case about to go cold is sometimes
  pinned on someone with a record. Some of the wrongly convicted are exonerated later and paid compensation;
  exonerations come sooner where the press is free.
- **Court statistics.** The Law & Order screen shows trials, the conviction rate, the share of convictions from
  guilty pleas, appeals and exonerations for your country.

### Fixed in 1.6.2

- The arrest message showed lawyer and bribe costs as bare numbers; it now shows them in your currency.

### New in 1.6.1: prisons

Prisons are now institutions, the first part of 1.7 Law & Order.

- **Real incarceration rates.** Each country starts with its real prison population: about 33 people per 100,000
  in Japan, 67 in Germany, 140 in Britain and over 500 in the United States. The prison population then moves with
  crime.
- **Places, conditions and riots.** The police budget builds prison places when it is above its usual level and
  loses them when it is cut. Conditions follow funding, how well the state runs and overcrowding. Crowded,
  run-down prisons riot; riots make the national chronicle, damage the prisons and let some inmates escape.
- **Sentences differ by country.** American, Russian and Turkish courts give longer sentences; German courts give
  shorter ones.
- **Life inside.** In prison you can work a shift in the workshop for a small state wage, take classes, and apply
  for parole once you have served part of your sentence (the share depends on the country). Gangs prey on
  newcomers in crowded prisons; members of an organisation are protected. You can try to escape, but if you are
  caught you get extra time.
- **Two new stories:** "The first night inside" and "The parole board".
- **Re-entry.** A conviction shows on background checks until it is spent: 3 years in Germany, 7 in the United
  States. Until then, state companies and the medicine, aerospace and electronics industries will not hire you.
  NPCs leaving prison are more likely to offend again, in line with each country's reoffending rate.
- **Prisons panel.** The Law & Order screen shows your country's prison system: prisoners, places, conditions,
  funding, how long sentences are, the reoffending rate, and riots and escapes.

### New in 1.6.0: the strategic engine

1.6.0 completes the strategic engine: nations visibly change over months and years. Releases 1.5.1 to 1.5.4 built
it:
- capabilities that start from real 2025 data;
- a monthly strategic turn with productivity growth;
- national budgets and grand strategy;
- a power ranking with history;
- the yearly State of the World.

This release adds:

- **Growth that stays realistic for decades.** Each country grows at its real potential rate, moved only by what
  changes after 2025: better or worse skills, infrastructure and institutions, how fast it is catching up,
  unrest, war and the world economy. In a 30-year test, average growth per year is:

  | Country | Growth |
  |---|---|
  | India | 5.8% |
  | China | 3.5% |
  | United States | 2.2% |
  | Britain | 1.2% |
  | Germany | 0.6% |
  | Japan | 0.2% |

  Technology gaps narrow as the leaders' know-how spreads.
- **Faster long advances.** Advancing a week or more at once runs other countries at a coarser level of detail:
  - their people recover energy in one daily step;
  - they are only visited in the hours when they act;
  - routine AI checks (auction bids, mining, studies, military planning) run every few hours.

  Your own country is always simulated in full. Together with faster age lookups, a default-size world (about
  12,500 people) runs about 40% faster: a simulated year now takes roughly 13 minutes.

### Fixed in 1.6.0

- **Welfare.** Transfers to households are now a share of revenue (35% by default, set by the budget). They used
  to be a share of the treasury, so money a government borrowed flowed straight back out as transfers and debt
  piled up.
- **Borrowing and repayment.** Governments no longer borrow in their first week, before they have a record of
  spending. They repay debt sooner when money is plentiful.

### New in 1.5.4: the record of the world

- **Power over time.** The power index is taken on the first of every month and kept for ten years. The Rankings
  screen shows each country's trend over the last two years.
- **Rise and fall.** When a country moves up or down a tier (minor, regional, middle, great, superpower), or the
  world's three leading powers change, it makes the news and goes into the country's chronicle.
- **The State of the World.** Every New Year, a report sums up the year for every country:
  - its rank and power;
  - growth, unemployment, inflation and debt;
  - its strategy;
  - the headlines: the leading power, the fastest and slowest growers, the highest unemployment, and any country
    reduced to governing in exile.

  The reports are kept on the World Situation screen, year by year.
- **Two new stories:**
  - **Budget night.** If you hold national office when the government sets a new course, back its budget, fight
    for more on schools and hospitals, or vote against it.
  - **A year in review.** Each New Year, look back on how your country did and make a resolution.

### Fixed in 1.5.3

- **Going back keeps your place, everywhere.** Some browsers skip drawing frames for pages they are not showing
  (a background tab, an automated test). There, going back to a long screen could still land at the top. The game
  now retries on a timer instead.

### New in 1.5.2: national budgets and grand strategy

- **A national budget.** Each government divides its revenue between eight lines: defence, intelligence, police,
  education, health, research, infrastructure and welfare.
  - Defence, intelligence, police and education fund their services as before.
  - Health, research and infrastructure are paid out every day and build up the country over the years:
    - research speeds up technology;
    - infrastructure and health raise its infrastructure and human capital.
  - Welfare sets the transfers to households.
- **Budget laws.** Congress can pass a whole budget ("Pass a budget"), line by line. Lawmakers back budgets that fit
  the country's situation.
- **Grand strategy.** Every AI government follows a strategy chosen from its situation:
  - development first;
  - a military build-up when at war;
  - regional leadership for the great powers;
  - reform when the state works poorly;
  - retrenchment when debt runs high.

  It reviews the strategy each January and changes course when circumstances change, with a budget to match.
- **A chronicle for each country.** The new Budget and strategy panel shows the strategy and why it was adopted,
  the budget by line and per day, and a chronicle of the country's turning points.

### New in 1.5.1: nations develop over time

The first step of the strategic engine (1.6.0).

- **Capabilities.** Every country starts from real 2025 data:
  - technology in six domains (industrial, military, information, medical, energy and space);
  - human capital, measured from its people's education;
  - infrastructure, from its buildings and state development;
  - institutions: rule of law, control of corruption, government effectiveness and press freedom;
  - cohesion, from approval and unrest.
- **A monthly strategic turn.** On the first of each month:
  - R&D adds technology, with diminishing returns, and the leaders' know-how spreads to others;
  - productivity grows at the country's real potential rate (6% a year for India, under 1% for Japan and Germany);
  - the rate is adjusted for skills, infrastructure, institutions, catching up, unrest, war and the world economy.
- **Growth you can see.** Productivity raises what every company in the country produces, and a company's
  production preview shows it.
- **National development.** Each country's page has a panel showing:
  - productivity since 2025;
  - the growth rate and what moved it this month;
  - technology by domain, human capital, infrastructure, cohesion and institutions;
  - charts of all of these.
- **Pace of history.** A new setting lets nations develop at real speed (the default), three times faster, or a
  decade in under a year.

### New in 1.5.0: the real economy, and work and enterprise

1.5.0 completes the economic overhaul. Releases 1.4.4 to 1.4.18 delivered it step by step:

- **Real money and pay.** Every currency starts at its real exchange rate. Pay and minimum wages follow each
  country's real 2025 levels, and gold is worth the same everywhere at market rates. Your payslip shows gross pay,
  income tax, pension and net pay.
- **Households.** Budgets are split the way real households spend. Each country's page shows inequality and
  poverty.
- **Companies.** They pay rent, energy and corporate tax at real rates, and keep accounts. They take business loans,
  export surplus stock, and buy struggling rivals if the competition authority allows it. They go bust and settle
  with their staff first.
- **Work.** There are 67 occupations, with industry pay levels and redundancy pay. Unemployment benefit and
  collective bargaining follow each country's real rules. You can also work for yourself in eight kinds of small
  business.
- **The state.** Taxes start at real 2025 rates and income tax is progressive. Governments borrow, pay interest and
  repay debt. Central banks set rates by a rule.
- **Statistics.** Each country publishes GDP, prices, inflation, unemployment, pay, trade and public finances
  every month. World commodity prices move with real volatility.

**How it holds up.** In a one-year test run (16 countries, about 2,200 people), the economy stayed stable:

| | Day 90 | Day 180 | Day 270 | Day 365 |
|---|---|---|---|---|
| Labour force in work | 97% | 94% | 94% | 91% |
| Price index range (January = 100) | 88–132 | 77–172 | 85–168 | 74–198 |
| Companies | 836 | 832 | 935 | 895 |

- Every treasury but one stays solvent, and the ledger audit is clean throughout.
- The remaining outliers come from wars. Countries reduced to a few regions lose most of their revenue and jobs.
  War balance is planned for 2.2.
- Goods markets in small societies are thin, so prices there can swing by a third or more within a few months.
- Inflation figures appear once a year of data exists, and central banks hold their rates until then.

### Fixed in 1.4.18

- **Long games stay fast.** After about a year of play, the simulation had slowed several times over. Three
  causes are fixed:
  - AI citizens looking for spare gear to auction scanned every piece of gear in the world, one person at a time;
  - the list of active battles was rebuilt from every battle ever fought, many times a minute;
  - every bidder valued every open auction.

  A year-old world now runs about three times faster.
- **No more empty firms.** Small countries were filling up with companies that had no one to work in them. New
  private firms now stop at about one for every two people of working age.
- **Governments in trouble can still borrow.** A government whose revenue collapsed could not borrow, and so could
  not pay its staff or restart its economy. Its borrowing limit is now at least six months of spending, and the state
  can borrow to open an essential enterprise.

### Fixed in 1.4.17

- **Going back keeps your place.** On a slow computer, going back to a long screen sometimes jumped to the top.
  The game now waits for the screen to finish laying out (up to 2.5 seconds) before restoring where you were.
- **Runaway wages.** Companies with a vacancy were raising pay every day without limit, which pushed prices up
  year after year. Now they raise it at most once a week, and only while the wage is near the national going rate
  and the job earns what it pays.
- **Runaway minimum wages.** AI legislators kept raising the minimum wage until it was several times typical pay,
  and businesses could not afford staff. The minimum wage now moves in 5% steps: up only while it is under half the
  average wage on offer, and down when it climbs above 70% of it.
- **Empty economies.** In small countries every company could close, with no one left to found new ones. When no
  private founder steps in, the state now opens a state enterprise to make food or raw materials.
- **Steadier company closures.** An idle company is wound up only once it is at least three months old, and
  owners decide in their own time, so closures no longer come in waves.

### New in 1.4.16: power index 2.0

- **A truer world ranking.** The power index now combines:
  - economic mass: each country's real 2025 share of world GDP;
  - military capability: the size of its forces × the quality of its military technology × readiness;
  - technology in six domains (industrial, military, information, medical, energy and space), at real 2025
    levels;
  - stability, intelligence and population.
- **Tiers.** Every country is ranked as a superpower, great power, middle power, regional power or minor power.
  The United States and China start as superpowers.
- **The README** describes the new economy.

### New in 1.4.15: takeovers, competition policy and stories of working life

- **Takeovers.** Once a month, a successful owner may buy a struggling rival in the same industry and country. The
  price is based on the plant, six months of profit, cash and stock. The deal appears in the news, and the company's
  ownership history records the price.
- **Competition authority.** It blocks deals that would leave one owner with more than 40% of an industry's sales,
  or that push a market into high concentration (an HHI over 2,500 that rises by more than 200, the rule used in
  the US and EU).
- **New stories from working life:**
  - **The interview.** When you are out of work, a company calls you in. Prepare properly, wing it, or ask for a
    signing bonus.
  - **Payroll Friday.** Your company cannot cover the week's wages. Pay from your own pocket, ask the bank for a
    business loan, let someone go, or pay late and live with it.
  - **The takeover bid.** Someone offers to buy your profitable company for a third more than it is worth on
    paper. Accept, hold out for more, or say no.
  - **Last day at the plant.** Your workplace has closed. Have a last drink with your workmates, keep a memento,
    or start looking straight away.

### New in 1.4.14: companies close, and an industry overview

- **Companies can fail.** A company closes when:
  - it is insolvent: it has staff it cannot pay for a fortnight and an owner who cannot help;
  - or it is wound up: it has stood idle with no staff, made nothing and lost money for a month.

  At most two companies close a day in each country, so a shake-out is gradual.
- **The books are settled in the legal order.** Staff come first, with redundancy pay as far as the money goes and
  then unemployment benefit. The owner gets what remains, including any stock. Listings and currency orders are
  withdrawn. The closure appears in the news.
- **Your own companies are never closed without you.** Neither are state-owned firms, which the treasury keeps
  going.
- **Industry overview.** The Companies screen shows every industry in your country: firms, staff, a month's sales
  and profit, and market concentration (the Herfindahl–Hirschman index competition authorities use). It also
  shows how many companies opened and closed in recent months.

### New in 1.4.13: working for yourself

- **Self-employment.** You can now start your own business from the Life screen's money tab. There are eight kinds:
  a trades business, private tutoring, a taxi, a café, a restaurant, a shop, a doctor's practice or a law firm.
  - Each needs a qualification and money to set up.
  - Takings come from local customers and depend on your skills, local prices and the state of the economy.
    Some days are slow.
  - Supplies and rent are paid daily. Profit is taxed as income.
  - The panel shows a month's takings, costs and profit. You can close the business at any time.
- **People work for themselves.** Self-employment rises towards each country's real share of workers: about 7%
  in the United States, 14% in Britain, a quarter in Mexico, Brazil and Turkey, and more in India. The unemployed
  set up first. A business that loses money for a month with little cash left closes.
- **Local cafés and restaurants have owners.** When a resident runs one, the neighbourhood café or restaurant
  carries its name and says who runs it.

### Fixed in 1.4.13

- Unemployment now counts only the labour force: working-age adults who are not studying or retired.
  Previously, public servants, soldiers, students, retirees and children were counted as unemployed.

### New in 1.4.12: occupations and the labour market

- **Sixty-seven occupations.** They span fourteen families: agriculture, mining and energy, manufacturing, skilled
  trades, retail and hospitality, transport, office work, finance, IT, health, education, public administration,
  security and defence, arts and media, and science and engineering.
  - Each occupation needs a level of education (some a field of study) and has a pay level based on real ratios. A
    cleaner earns about 0.65 of a typical wage, an electrician 1.3, a software developer 2.6 and a surgeon 6.
  - Everyone in work has a job title from their workplace and qualifications, such as a farm labourer or an
    agronomist on a farm, or an assembler or an aerospace engineer at an aircraft maker. Profiles and the Life
    screen show it.
- **Industries pay differently.** New companies start wages from their industry's pay level: an oil rig pays more
  than a clothing workshop.
- **Redundancy pay.** When a company cuts jobs, the people let go get a week's wages for each year of service (at
  least one week, at most twenty). Their work history records that they were made redundant.
- **Unemployment benefit.** People who lose their job through no fault of their own claim benefit at their
  country's real rate and for its real duration: 60% of the last wage for a year in Germany, 45% for 26 weeks in
  the United States, nothing in India or Mexico. The state pays it while the treasury can. Your payslip panel
  shows your claim.
- **Collective agreements.** In each country, a real share of firms is covered by collective bargaining: half in
  Germany, Brazil and Australia, about one in eight in the United States. Covered firms never cut pay, and each
  January they raise it by the central bank's inflation target.
- **Labour market at a glance.** Each country's Living standards panel shows unemployment, the minimum wage,
  benefit rules and bargaining coverage.

### New in 1.4.11: central banks, interest and business loans

- **Central banks.** Each country's central bank starts at its real policy rate for January 2025: 4.5% in the
  United States, 0.25% in Japan, 47.5% in Turkey. Once a year of statistics exists, it sets the rate on the 1st of
  each month by a rule like the ones real central banks follow. The rate rises when inflation runs above the
  bank's real target (2% in most countries, 4% in India, 5% in Turkey) or unemployment is unusually low, and
  falls in the opposite case. It moves by at most half a point a month.
- **Rates follow the bank.** Mortgages, student loans, personal loans and government bonds are priced from the
  current policy rate.
- **Interest on savings.** Money in the bank earns interest at the policy rate less the banks' margin, paid
  monthly. It appears in your budget under Investments.
- **Business loans.** When a profitable company runs short of cash and its owner cannot cover the gap, the bank
  lends a few weeks of wages, up to a month of sales, repaid over three years.
- The Economy panel shows the central bank's rate and the rate on savings.

### Fixed in 1.4.11

- Inflation is reported against the same month a year earlier. Until a year of data exists, the change in prices
  since January is shown, rather than an unreliable annualised figure.

### New in 1.4.10: economic statistics

- **An Economy panel for every country.** It shows the official statistics, computed from what actually happens in
  the simulation, with a chart for each:
  - GDP: the value companies add (sales less materials) plus government spending;
  - a consumer price index;
  - inflation;
  - unemployment;
  - average pay on offer;
  - the trade balance.

  A table lists the last six months.
- **A real consumer basket.** Prices are measured on each country's own markets, as a month's average of
  everything sold, with these weights:
  - food 40%;
  - rent 27%;
  - transport 10%;
  - clothes 10%;
  - electronics 8%;
  - medicine 5%.

  The index is 100 in January 2025. Inflation is reported once there are three months of data, over a full year
  when there is one.
- **Monthly publication.** Each month's figures are published on the 1st.

### Fixed in 1.4.10

- AI companies no longer price goods at more than three times their cost.

### New in 1.4.9: world markets and trade

- **World commodity prices.** Oil, grain, iron, copper, titanium, timber and cotton have world prices. They move
  every day with each commodity's real volatility (oil swings most) and drift back to their long-run level. A
  supply shock lifts the price. The Market screen shows each price, what it means in your currency, its import
  parity, the change over 30 days, and a 60-day chart.
- **Import competition.** No one pays more for a raw material than its import parity: the world price plus
  freight and the import tariff. High-cost producers in rich countries feel the pressure.
- **Exports.** AI companies with surplus stock export it where it sells for more after exchange rates, freight
  (8% of the value) and the importer's tariff and VAT. They price just under the local sellers and convert their
  earnings home through the currency market. Exporting does not need a presence in the other country, and flows
  stay modest next to home markets.
- **Trade statistics.** Each country's Public finances panel shows its exports and imports over the last 30 days.

### New in 1.4.8: taxes and public finance

- **Real taxes.** New games start with each country's real 2025 taxes:
  - income tax on a typical wage: 15% in the United States, 19% in Germany, 5% in India, none in Saudi Arabia;
  - VAT or sales tax: 20% in Britain, 18% GST in India, 10% in Japan;
  - average tariffs: 10% in the United States after its 2025 increases, 4% in the EU, 15% in India.
- **Progressive income tax.** The rate on a typical wage is the headline rate. Low pay is tax-free up to an
  allowance, and the rate rises with pay. Your payslip shows the tax on your wage.
- **Prices include sales tax.** AI companies price to cover VAT, which comes out of every sale.
- **Public debt.** When a treasury runs short, the government sells bonds instead of letting salaries go unpaid:
  - it borrows up to three years of revenue;
  - it pays interest to bondholders at the central bank's rate plus a premium that grows with the debt;
  - it repays when money is plentiful.

  Each country's page has a **Public finances** panel: revenue, spending, the deficit or surplus, the debt, the
  interest rate on bonds and the interest paid so far.
- **People get used to their taxes.** Opinion reacts to changes from the taxes a country started with, not to how
  high they are, so high-tax countries are not permanently unhappy.

### Fixed in 1.4.8

- Treasuries no longer run down over time. They now hold steady or grow in long test runs.

### New in 1.4.7: what it costs to run a company

- **Overheads.** Besides wages and materials, companies now pay:
  - rent for their premises, more for a bigger plant and where property is dear;
  - energy for everything they produce.

  A plant with no staff keeps a smaller lease. The money goes to the local economy.
- **Corporate tax.** On the first of each month, a company pays tax on the previous month's profit at its country's
  real 2025 rate: 25% in the United States, Britain and India, 30% in Germany, Japan and Australia, 34% in
  Brazil. AI owners keep a reserve for it.
- **Prices cover costs.** AI companies now price in their overheads as well as wages and materials.
- **Accounts.** Every company page has a profit-and-loss statement for the last 30 days:
  - sales;
  - wages;
  - materials;
  - premises and energy;
  - depreciation;
  - operating profit;
  - corporate tax;
  - net profit.

  A balance sheet shows cash, stock, and plant and equipment.

### New in 1.4.6: households and the cost of living

- **Where your money goes.** Your everyday costs now appear in your monthly budget as real household spending:
  - groceries;
  - utilities and energy;
  - transport;
  - phone, clothes and everyday items.

  Each is split the way households in your country spend, from national surveys. In India, groceries take about
  60%; in the United States, transport takes the largest share.
- **Living standards.** Each country's page has a new panel, measured from its people:
  - median income;
  - income and wealth inequality (Gini);
  - the share in relative poverty;
  - the share who are well off;
  - median wealth;
  - the cost of living, including what a flat in the capital rents for.
- **Confidence.** Background households spend less when jobs are scarce, so a rise in unemployment slows the
  whole economy.

### New in 1.4.5: real pay, and payslips

- **Pay as it really is.** Pay in every country follows its real 2025 median wage. A typical day's starting pay is
  about:
  - $200 in the United States;
  - £116 in Britain;
  - ₹780 in India;
  - ¥12,300 in Japan.

  Prices follow what people earn, so a coffee costs about $5 in Ohio and ₹20 in Mumbai.
- **What pay is worth abroad.** Gold is worth about $2,500 at real exchange rates in every currency. A month's pay
  in India buys far less gold than one in the United States, just as a rupee buys fewer dollars.
- **Cheaper businesses in poorer countries.** Founding or upgrading a company costs less gold where local pay is
  worth less abroad.
- **Real minimum wages.** Each country starts with its real 2025 minimum wage: $7.25 an hour federally in the
  United States, £12.21 in Britain, €12.82 in Germany. Public-sector pay no longer follows the minimum wage.
- **Sticky wages.** Employers raise pay faster when few people are out of work. Pay cuts are rare: at most once a
  month, and only after a fortnight of losses.
- **Payslips.** The Life screen's money tab shows your pay for the month. It covers wages, public-service salaries
  and military pay:
  - gross pay;
  - income tax;
  - pension contributions;
  - net pay, and the same per shift.
- **Money around the world** now also compares a day's pay and real pay against the United States.

### Fixed in 1.4.5

- Everyday prices fit the new money: a coffee, an evening out, flowers, pets, hobbies and haircuts cost what they
  do in real life.

### New in 1.4.4: real money

The first step of the economic overhaul (1.5.0).

- **Real currencies at real prices.** Every amount now shows in its country's own currency, as people there would
  write it: $5.00 for a coffee in Ohio, about ₹99 in Mumbai, ¥470 in Tokyo.
  - Exchange rates start at their real early-2025 levels (1 US dollar ≈ 86 rupees, 157 yen, 1,470 won).
  - Each country's price level follows real World Bank data, so the same basket costs much less in India,
    Russia or Turkey than in the United States or Australia, and gold buys more where prices are lower.
  - Yen, won, rupees, roubles and Argentine pesos show without small change, as in real life.
- **Money around the world.** A new table on the Currency screen compares every country:
  - its currency;
  - the exchange rate against the dollar;
  - what a coffee and a day's essentials cost;
  - its price level.
- **Type real amounts.** Wages, prices, donations, deposits, exchange rates and laws (minimum wage, printing money)
  are all entered in real local currency.
- **Everyday prices fixed.** A coffee, an evening out, flowers, pet food and a haircut now cost what they do in real
  life.
- **Existing games** keep everyone's money at its real value. Each treasury's gold rate moves once to its country's
  real price level.

### New in 1.4.3: quick starts, and a new look

- **Ready-made lives.** Start in one click as one of eight people:
  - a factory worker in Detroit;
  - a student in Seoul;
  - a farmer's child in Brazil;
  - an heir in London;
  - a nurse in Mumbai;
  - an engineer in Munich;
  - a rancher in Alberta;
  - a coder in Shenzhen.
- **A random life.** One button picks everything at random: country, birthplace, age, background, nature and looks.
- **Character codes.** Copy a short code for the character you designed and share it. Paste a code to play the same
  person.
- **Change your look as you go.** A new "Your look" panel on the Life screen offers:
  - a haircut;
  - a new hair colour;
  - glasses or contact lenses;
  - a tattoo or piercing (or having one removed);
  - growing a beard or shaving it.
  Paid changes cost about what they would in your country.
- **New clothes show.** New clothes from the market change the shirt you wear in your portrait.
- **Take your spouse's surname.** After you marry, you can take your spouse's surname at no cost.

### New in 1.4.2: where you come from, and who you are

- **Family background.** Choose the family you grow up in, or let chance decide with your country's real mix:
  struggling, working class, middle class, comfortable or wealthy. It changes:
  - your starting money, from a lean start to a trust fund;
  - your parents' savings and home;
  - your own first home;
  - your schooling: university is likelier from a comfortable home, and children start school with better or
    worse grades.
- **Talents and a weakness.** A head for numbers, a natural leader, good with hands, athletic or sharp-eyed: the
  matching skills grow a third faster as you practise. Your weakness grows a quarter slower.
- **Quirks** (up to two), each with a real effect:
  - charming: people warm to you faster;
  - frugal: essentials cost less;
  - bookworm: study and school go faster;
  - sporty: a little healthier;
  - worrier: more stress, but a better credit score;
  - workaholic: you learn more at work, and carry more stress.
- **Personality.** Set your ambition (it speeds promotions), appetite for risk, loyalty, love of money and energy.
- **Everyone has them.** Every person now has a background, a talent and maybe a quirk, by the same rules. Profiles
  show how someone grew up and their nature.

### New in 1.4.1: faces, and designing who you are

- **A face for everyone.** New portraits are drawn for every person, with:
  - face shape, skin tone, hair style and colour, eyes, brows, nose, beard, glasses, freckles and marks;
  - age showing (grey hair, lines, thinning);
  - a smile or frown with their mood.
- **Realistic variety.** Looks follow each country's population, presentation follows the first name, and nobody
  looks quite like anyone else. Children who come of age blend their parents' looks.
- **Bigger portraits** on profiles and on the Life screen.
- **Design your character** when you start a campaign:
  - woman or man and your pronouns (she, he or they);
  - every feature of your face, with a live portrait and a Randomise button;
  - where you were born (any region of your country, or anywhere);
  - your politics.
  Your choices are where your life really starts.

### New in 1.4.0: a whole life

1.4.0 completes the life simulation. From 1.3.6 to here, a life in Meridian Reach gained:

- **Family:** pregnancy and birth, brothers and sisters, gifts, pets, adoption and children in care, guardians,
  raising children (closeness and grades that shape who they become), and starting your own life as a newborn.
- **Learning and work:** schools and universities funded by governments, an education ladder from school to
  doctorate with fees and student loans, public-service careers with promotions, the military academy, and a work
  history.
- **Home and money:** renting, buying and selling homes priced by region, mortgages and loans at each country's real
  rates, credit scores, a monthly budget, and pensions by country.
- **Health:** illnesses and injuries, clinic visits priced by each health system, sick leave and parental leave.
- **Legacy:** wills, inheritance tax, trusts, heirlooms, death, and carrying on as your heir.
- **Stories:** eight life chains, sixteen everyday encounters and five stories from the wider world.
- **Time:** advance by a whole year, with a summary of what happened.
- **Fairness:** everyone else lives by the same rules.

New in this release:

- **Calibration** over long simulated runs:
  - Public services employ about one person in eight, as in OECD countries. Governments no longer hire staff they
    can't pay for.
  - Clinic visits cost what the game's current money scale can bear; 1.5.0 re-anchors all prices.
  - Home ownership stays near each country's real rate.
- **Moving home as an owner** is now a swap: you settle only the price difference, from savings or with a mortgage.
  You can downsize if needed, and a cheaper place leaves you money over.
- **A faster world:** less work per simulated day for calendar dates, war planning and naval power. Long runs are
  about a quarter quicker.
- **The README** describes the life simulation, and no longer mentions the levels removed in 1.3.

### Fixed in 1.4.0

- When a homeowner dies, the home now passes to their heir (if the heir lives there and has no home of their own)
  or is sold for the estate. Before, its value was lost.
- An owner who moved for work could lose their home's value if nobody could buy it at once.

### New in 1.3.23: a calmer Life screen, big moments on the big screen

- **The Life screen in four tabs:** Overview (how you are, family, routine, milestones), Home & money (home, budget,
  loans, retirement), Health & learning (health, education, hobbies, pets) and Legacy (will, heirlooms, family
  history). It remembers the tab you were on.
- **Cinematic moments.** Birthdays, long advances and your character's death now open with letterbox bars and a
  slow reveal, and your heir's first moments get a screen of their own. They stay still if your system asks for
  reduced motion.
- **Optional sound.** Soft synthesised cues for actions, money, milestones, birthdays and a bell for a death. Off by
  default; switch it on in Settings.
- **Tidier tables.** Buttons you can't use yet explain why when you hover over them, instead of filling the Home
  table with text.
- **New screenshots** in the README: the Life screen, home and money, and succession.

### Fixed in 1.3.23

- The map's region panel now shows icons for timber, cotton and copper (it said "undefined").
- "Money out" no longer shows −0.00 in a month with no spending.

### New in 1.3.22: a year at a time, and everyone lives a full life

- **Advance a whole year.** The Advance menu has a new "+1 year" option. It takes you to the same date next year,
  with the whole world simulated in full: every shift, birth, election, battle and price. It runs in the background
  with a progress bar. You can stop and resume it at any time, and it pauses for anything important in your life.
- **What happened while you were away.** After any advance of a week or more, a summary shows your life (birthdays,
  milestones, how your savings changed, or who carried on if you died) and the world (the most important events,
  and how many wars, elections, crises, business and political events there were).
- **The same rules for everyone.** The people around you now use the life systems the way you do:
  - they take up a favourite hobby and spend evenings at it (paying for supplies);
  - about one adult in three adopts a dog or a cat over a lifetime, and looks after it;
  - young adults out of work (and ambitious ones) go back to college or university, with a student loan if they
    need one;
  - new parents take parental leave where their country pays it;
  - parents spend time with their children, so at 18 those children are as close to them as the care they got.
- **The plan grows.** Character creation and customisation now follows 1.4.0 (portraits, family background,
  personality and talents, changing your look). A deeper Life simulation follows 2.5.0, covering the mind, the
  social fabric, everyday life, culture and generations. See the roadmap.

### New in 1.3.21: five stories from the wider world

- **A protection racket.** A gang whose turf covers your business demands a daily fee. Pay, go to the police (a
  real case against the enforcer), or refuse, and see whether they come back at night.
- **The call-up.** When your country goes to war, the recruiting posters go up: enlist, serve on the home front, or
  speak out against the war.
- **The scoop.** Newspaper owners get tips about public figures under police investigation. Dig for the truth, then
  run it on the front page or call them for a comment first (they may make you an offer).
- **Election season.** Party members are asked to help: stand as a candidate, knock on doors or donate, then rally
  on the campaign trail.
- **A double life.** If you work for a foreign intelligence service, your handler wants deliveries. When
  counter-intelligence starts asking questions, get out, confess, or hold your nerve.

### New in 1.3.20: sixteen everyday moments

New situations from ordinary days, each with real people and real consequences:

- a friend's **wedding** invitation;
- **jury duty**;
- a **stray** cat or dog on the doorstep, which you can adopt;
- a **blood drive** at the clinic;
- a neighbour's loud **party**;
- a **phone scam** from "your bank";
- a **lottery ticket**;
- a friend's **surprise birthday**;
- a broken **boiler**, which owners fix themselves and tenants chase the landlord about;
- a **lost child** in the square;
- an **old friend** across the street;
- a **charity run**;
- a neighbour who needs a **babysitter**;
- a **school reunion**;
- a **parking fine**, to pay, appeal or ignore;
- a job **offer from abroad**.

### Fixed in 1.3.20

- A war event with no side (a battle called off by peace) now saves and loads exactly as it was.

### New in 1.3.19: the stories of a life

Eight new story chains follow the big moments of a life. Each starts from your real situation, plays out over days
or weeks, and acts through the game's systems:

- **A baby on the way:** get the nursery ready, go to antenatal classes, or save money; then, once the baby comes,
  take parental leave or call in the grandparents.
- **Time to move out?** A grown-up still living with family is asked about a place of their own: a room, a flat, or
  a few more months of saving.
- **The diagnosis:** cancer, heart disease or diabetes. Start treatment or get a second opinion, then decide whom to
  tell.
- **An empty nest:** your last child sets out on their own.
- **Turning 40, 50 or 60:** a trip, a party, or a promise to learn something new.
- **A parent needs care:** weekly visits, a paid carer, or a trip to the clinic.
- **Graduation day:** the last push before your final exams, and a celebration afterwards.
- **Dividing the inheritance:** share a parent's estate with your brothers and sisters, keep it, or fund a memorial
  bench.

### New in 1.3.18: wills, heirlooms and succession

- **Your character can die.** In new campaigns, illness and old age can end your life. When that happens, you carry
  on as your heir: your spouse, else your eldest grown child, a brother or sister, or a parent. Your will can choose
  among them. You can switch this off in Settings, and it starts off for campaigns saved before this version.
- **Wills.** The new Will and legacy panel on the Life screen lets you leave shares of your money to family and
  close friends, and a share in trust for children still at home. The rest, with your home, companies, shares and
  heirlooms, goes to your next of kin.
- **Inheritance tax.** Countries that have it take their share of large estates first: the United States and Britain
  at 40% above a tax-free amount, Japan and Korea 30%, Germany 15%.
- **Trusts.** Money left to a child is held until they turn 18, then paid to them.
- **Heirlooms.** A wedding ring, a degree certificate, an officer's sword, the keys to a first home and a retirement
  gold watch are kept, and passed down the generations.
- **Family history.** Each life you've lived is remembered: dates, cause of death, milestones, what it left and who
  carried on. If a line ends with nobody grown-up to continue, you can begin a new life in the same place.

### New in 1.3.17: growing up, and raising children

- **Choose when your life starts.** New campaigns can begin at 24 (as before), at 18 just out of school, at 16 still
  at school, or as a newborn growing up in a family.
- **Childhood.** As a child you live at home on your parents' budget and get pocket money. From 5 you go to school
  (by hand, or in your routine at 08:00): school days raise your grades, and skipping school lowers them. Play with
  friends for a happier childhood. You can work part-time from 16.
- **Leaving school at 18.** Grades of 35 or more earn a secondary diploma. Grades of 85 or more earn a scholarship
  that pays the fees for your first degree.
- **Raising children.** Spend time with each of your children (once a day each): reading and play when they're
  small, homework when they're at school, long talks when they're teenagers. Closeness fades if you're never there.
  Their grades follow their school and your attention.
- **Who they become.** At 18, a child's grades decide their diploma, and good students go on to college or
  university. How close they are to you depends on the time you spent together.

### New in 1.3.16: retirement and pensions

- **Pensions by country.** Each country has its own pension age (60 in India, Turkey and South Africa; 67 in the
  United States, Germany and Australia) and its own state pension, from about 10% of an average wage in India to
  60% in Brazil and Turkey after a full career.
- **Earn it by working.** Every paid shift adds to your working record, and the state pension is full after 35
  years. Where your country has funded pensions, a share of each wage goes into your own pension pot: 11.5% in
  Australia, 12% in India, 5% in the United States and Britain.
- **Retire when you choose,** from five years before pension age (with a smaller state pension, 6% less for each
  year early). The new Retirement panel on the Life screen shows your record, your pot and what you'd get. Your pot
  is paid out over about 20 years.
- **Veterans.** Twenty years in uniform earn a military pension on top, larger for higher ranks.
- **The same for everyone.** People retire around their country's pension age and draw their pensions from the
  treasury and the pension funds. People who had already retired get a pension from their past working life.

### New in 1.3.15: illness, treatment and leave

- **Health conditions.** People catch the flu (more often during an epidemic), hurt their backs, get injured at
  work (more often in manual jobs) or wounded in battle. With age come diabetes, heart disease and cancer, and long
  stress can turn into depression. Each one weighs on your health until it passes or is treated.
- **See a doctor.** The new Health panel on the Life screen lists your conditions. A clinic visit treats them all:
  short illnesses heal faster, and long-term ones are kept in check for 30 days at a time. Good clinics do better.
  Cost depends on your country's health system: free at the point of use in Britain, Canada and Brazil, a small
  fee in Germany or Japan, much more in the United States.
- **Sick leave.** If you're too ill to work, you're on sick leave: no shifts until you're treated or better, with
  sick pay (60% of your wage) for up to four weeks, from your employer or the state.
- **Parental leave.** Parents of a baby can take leave on their country's terms: 52 weeks in Germany, Canada,
  Japan and Korea; 39 in Britain; 12 unpaid weeks in the United States. Your job is kept for you.
- **The same for everyone.** Everyone else falls ill, sees doctors and takes sick leave by the same rules.

### New in 1.3.14: loans, mortgages and credit

- **Borrowing.** Take out a mortgage, a student loan or a personal loan. The new Loans and credit panel on the Life
  screen shows what you owe, your rates and your daily payments.
- **Real rates.** Rates follow each country's central-bank rate at the start of 2025, plus a margin: a mortgage
  costs about 3% in Japan and 6% in the United States, but about 49% in Turkey. Weak credit costs more.
- **Mortgages.** Buy a home with a 10% deposit and borrow the rest over 25 years, using the new Mortgage button in
  the Home panel.
- **Student loans.** Tick "with a student loan" when you enrol, and each year's fees are borrowed. Payments start
  a year later.
- **Affordability.** Lenders count your wages, and repayments may take at most 40% of your income. Personal loans go
  up to about three months of income.
- **Credit score** (300–850). Paying on time builds it. Missed payments hurt it and add stress. A mortgage 60 days in
  arrears ends in repossession: the home is sold, the debt cleared, and anything left over is yours. You can pay any
  loan off early.
- **Like real banks.** A loan creates the money it lends, and repaying it retires that money. Interest is the
  lenders' income. People across the world buy homes with mortgages too.

### New in 1.3.13: a place to live

- **Everyone has a home.** People rent, own, or (when young) live with family. Ownership rates follow each country:
  nine in ten households in China, under half in Germany.
- **Rents and prices by region.** A room, a flat or a house costs more where people want to live (jobs, safety,
  good schools and clinics) and less where they're leaving or there's war. Prices drift slowly. A home costs about
  twenty years of its rent.
- **Rent, buy, sell.** The new Home panel on the Life screen lists what's available where you are. Renting needs a
  deposit and the first month. Buying costs the price plus fees, and your old home is sold first. Renting or buying
  in another region moves you there, and your spouse comes too.
- **Living costs, split.** Daily costs are now essentials plus your housing: rent for tenants, upkeep and property
  tax for owners (cheaper day to day), nothing extra while living with family. Your budget shows Housing
  separately.
- **Home comforts.** A house or a home of your own lifts happiness, and a shared room lowers it. Still living with
  family at 28 or older weighs on you. Young adults move out once they work or marry.

### New in 1.3.12: the military academy

- **Officers need a commission.** Service alone now takes a soldier, sailor or airman as far as the senior enlisted
  ranks (staff sergeant, chief petty officer, master sergeant). Officer ranks need a commission. The game tells you
  when you reach that point.
- **Two ways to earn one,** from Education on the Life screen, at your country's military academy in the capital:
  - **Military academy:** four years for cadets aged 24 or under. You graduate with a bachelor's degree in your
    chosen field and a commission. No fees.
  - **Officer training:** about three months for anyone with a bachelor's degree.
- **Enlisted when you pass?** You're commissioned straight away as a second lieutenant (or ensign).
- **The same for everyone.** Soldiers across the world go to officer training or the academy when they reach the
  officer ranks, so new officers keep coming as the old ones retire. Officers already serving keep their ranks.

### New in 1.3.11: careers in public service

- **Five public-service careers.** Teacher, nurse, doctor, civil servant and public engineer, each with a ladder of
  five grades (for example, teaching assistant → teacher → senior teacher → head of department → head teacher).
- **Qualifications matter.** Each grade needs the right qualification: a bachelor's to teach, a medical master's to
  practise as a doctor, a doctorate to become a consultant. Graduates start on the second rung.
- **Paid by the state.** Salaries come from the national treasury, with work tax like any wage. Apply from the new
  Public service panel on the Jobs screen. Shifts join your daily routine.
- **Promotions.** After enough shifts at a grade, good work (your skills and drive) earns promotion, as far as your
  qualifications allow. Each promotion is a milestone.
- **Staffing matters.** Local people fill vacancies. Well-staffed schools teach better, and a well-staffed clinic
  keeps the region healthier.
- **Work history.** Profiles now list every job someone has held, where, when and why it ended.

### New in 1.3.10: schools and universities

- **Education for everyone.** Every person now has a qualification: secondary school, a vocational diploma, or a
  bachelor's, master's or doctorate in one of eight fields. The shares follow each real country, from about one
  adult in eight with a tertiary qualification in India to three in five in Canada. Profiles show it.
- **Go back to school.** From the Life screen, enrol at a college (vocational courses, everywhere) or a university
  (in capitals and larger cities). Each course needs the one below it.
- **Fees.** A year's fees are paid to the state at the start of each academic year, at real-country levels: high in
  the United States and United Kingdom, low in Germany, free in Brazil, Argentina and Saudi Arabia.
- **Studying.** A course takes about 180 study days per year of the course. Go to classes each day (or put them in
  your daily routine at 09:00). Your field's skills grow as you study, and graduating is a milestone.
- **Funded institutions.** Governments spend a share of daily revenue on schools and universities. That money pays
  teachers, through the households. The quality of schools follows funding over the years. The head of government
  or economy minister can change the funding.
- **Students.** Some young people are at college or university and graduate over time. People studying show as
  students.

### Fixed in 1.3.10

- Going back to a screen now restores where it was scrolled even when the page is still laying out.

### New in 1.3.9: your monthly budget

- **A real budget.** The Life screen's money panel now covers whole calendar months: money in and out by category
  (wages, investments, living costs, children, pets, hobbies, gifts, taxes, trade, business and more), the net
  result, and arrows to look back up to a year. Before, it only read your last 300 transactions.
- **Fixed costs.** It shows what you pay every day for living, children and pets, and how many days your cash
  would cover them.
- **People remember your family.** A person's profile now says when they think well of your family, or hold
  something against it. What someone remembers about your partner, parents or children counts for a little.
- **Dates in memories.** "What they remember about you" shows real dates instead of day numbers.

### New in 1.3.8: adoption, guardians and the cost of children

- **Adopt a child.** Apply from the Life screen, on your own or as a married couple. The fees go to the state. A
  social worker assesses you for about a month, then a child in care comes home, taking your family name.
- **Children in care.** Children left with no parent or relative now go into care instead of vanishing. Families
  nearby adopt some of them. The rest leave care at 18 with a small grant from the state.
- **Guardians.** When a child's parents are gone, grandparents or a grown-up brother or sister raise them. If that's
  you, you're told, and the Life screen shows whose child they are.
- **Children cost money.** Each child at home costs a little every day, for food, clothes and school things. It
  shows as "Raising children" in your monthly budget. Everyone else's children cost them the same.

### Fixed in 1.3.8

- A child who comes of age now gets their start in life from their family's savings. Before, their money appeared
  from nowhere.

### New in 1.3.7: hobbies

- **Eight hobbies** on the Life screen: running, reading, chess, music, painting, cooking, gardening and football.
- **You get better by doing them**, quickly at first and slower later, from beginner to keen, skilled and
  accomplished. Each new level is a milestone.
- **What they give you.** One hobby evening a day costs 6 energy, plus a little for supplies. It eases stress and
  lifts your mood. Running, gardening and football keep you fit. Chess and football are a chance to get to know
  people.
- **Keep them up.** A hobby comforts you only while you've done one in the last week. Choose a hobby in your daily
  routine and it happens every evening at 20:00.

### New in 1.3.6: family life

- **Pregnancy.** Trying for a child no longer makes a baby appear the same day. A baby is due about nine months
  later (on the pace of life), and the Life screen shows the due date. You're told when the baby is born.
- **Brothers and sisters.** Your family panel now lists your siblings: grown-up ones with their age, work and how
  close you are, and younger ones still at home with your parents.
- **Gifts.** Give flowers, or something of your own (clothing, gadgets, food or medicine), from anyone's profile.
  Better gifts mean more. One gift a day to the same person; they remember it.
- **Pets.** Adopt a dog or a cat from the Life screen. Walk or play with them every day or two. A pet you're close
  to lifts your happiness and eases stress. They cost a little each day and grow old. If you neglect them for
  weeks, a shelter rehomes them.

### New in 1.3.5: sort any list

- **Click a column heading to sort.** Click again to reverse. Each table remembers how you left it.
- **The job market** sorts by employer, industry, grade, place, owner, pay, required skill or openings. It shows
  each industry by name, and an industry filter narrows it to the jobs you want.
- **Also sortable:**
  - your companies and your staff;
  - offers on the goods market;
  - the business market, holdings and the stock market, and auctions;
  - the world power ranking (by army, navy, air force, economy, stability or intelligence);
  - notable figures and the people around you;
  - local businesses;
  - past wars and the war archive.

### New in 1.3.4: why wars start, and how they end

- **Every war explains itself.** When a country declares war, the game records why:
  - who proposed it, and how each party voted;
  - what the government weighed: the balance of power, relations and what soured them, how hawkish congress is,
    the public mood, other wars, the prize at stake, old grievances, the border, opportunity and alliances;
  - the war aims, and how the other side saw it.
- **A full war history.** Open any war from the Wars screen for a dated timeline:
  - every battle, with rounds, damage, fighters, formations, heroes and what it changed;
  - peace offers, the reasons behind them, and the votes that accepted or rejected them;
  - shifts in approval and war mood at home.
- **Why it ended.** The deciding reason (conquest, deadline, armistice, surrender, demands or a trade), the exact
  terms, and the aftermath: territory, relations before and after, war scores and approval.
- **War archive.** Every war since the campaign began, with why it started and how it ended. Wars fought before
  this version keep only their outcome.

### New in 1.3.3: seven new industries, plain-language grades, and the present day

- **Seven new industries.** Logging camps, cotton farms and copper mines supply four new kinds of factory:
  building supplies, clothing, electronics and pharmaceuticals. The raw materials come from where real producers
  are. Timber: the Pacific Northwest, British Columbia, Quebec, Siberia and the Black Forest. Cotton: Texas,
  Gujarat, Xinjiang and Mato Grosso. Copper: Arizona, Sonora, the Urals and South Australia. Every country has
  some. These industries start small and grow as people buy, and in existing games entrepreneurs start the first
  companies over the next days.
- **The new goods matter.**
  - Construction also needs building materials, counted by grade: a premium unit does the work of four basic ones.
  - Medicine restores health and speeds recovery.
  - New clothes and gadgets lift your spirits for a while.
  - Households spend on all of them, and AI citizens use them just as you can. Take, wear or use them from your
    inventory.
- **Grades instead of Q1–Q5.** Goods and companies are Basic, Standard, Good, Premium or Top-grade, shown with
  stars: "premium food", "a good-grade company", "a top-grade ticket".
- **The present day.** The calendar starts on Wednesday 1 January 2025 instead of 2030. Existing games keep their
  timeline and only the dates change.
- **What's new.** This window: after every update the game shows what changed. Open it again from the title
  screen or Settings → Updates.

### New in 1.3.2: back and forward, and sturdier releases

Updates now come more often, in smaller steps, each one tested before it is released.

- **Back and forward.** Two buttons at the top left take you back to the screens and profiles you came from, and
  forward again, returning to where you were on the page. Hover to see where they lead. Alt+← / Alt+→ and the
  back and forward buttons on a mouse work too.
- **Sturdier.** If one screen or window runs into a problem, the rest of the game keeps running and tells you,
  instead of going blank. Your saves are safe, and "Try again" redraws the screen.
- **Every update is play-tested.** Before a release is published it is played in a real browser (a new campaign,
  time running, every screen opened, a conversation, save and reload) and a game saved by the previous version
  is loaded and played in the new one. The Windows game is launched and updated on Windows as before.

### New in 1.3.1: a preview of 1.4 — a whole life

A preview on the way to 1.4 (the life simulation). More is coming, and the Windows game updates itself.

- **A real calendar and a slower clock.** Dates like "Tuesday, 14 March 2030", the time of day, and seasons by
  hemisphere (summer in Sydney while Chicago has winter; wet and dry seasons in the tropics). Time runs slower: at 1×
  a minute passes each second.
- **Growing older.** Everyone has an age and a birthday on a real date, and stages of life from childhood to old age.
  Each birthday brings a review of your year. "Advance to next birthday" (and +1 day, +1 week, +30 days) fast-forwards
  while the window stays responsive, and stops for things that need you.
- **No more levels.** You get better at what you do: training builds strength and endurance, shifts build economic
  aptitude, managing and speaking build leadership. Your reputation (from newcomer to famous) opens the doors levels
  used to: founding a party, standing for office, joining the police or the intelligence service.
- **A population that lives.** People are born, come of age, move, emigrate, arrive from abroad, fall ill, retire
  and die; regions grow and shrink (roughly 24 to 100 people) with how good a place they are to live. Estates pass to
  family, and empty offices are filled (a head of government who dies in office triggers a special election).
- **Love and family.** People date, marry, divorce and have children. You have parents, and you can ask someone
  out, go on dates, propose, marry and start a family — but a neglected partner may leave.
- **My Life.** A new hub: health, happiness and stress (with the reasons), family and friends, your money from real
  transactions, a daily routine (work, look for work, training, family time, rest) and milestones.
- **Places.** Every region has districts and places — cafés, parks, city hall, the police, the market, workplaces,
  the station, the harbour. Explore to get to know a place, see who is where and when they are free, arrange to
  meet people, have a coffee, walk in the park or volunteer.
- **Civilian control of the military.** Public office and active duty don't mix: office holders pass to the
  reserve and keep their rank. The head of government is Commander-in-Chief and appoints the Chief of Staff. Service
  ends at 62 (64 for generals) with veteran status.
- **A new look.** A redesigned interface: title screen, typography, icons, panels and animation.
- **An unscripted future.** No two playthroughs — or reloads — unfold the same way, and you are born in a random
  region of your nation (a fixed seed is still available for sharing a world).

Saves from 1.3 load and are upgraded (levels become skills; everyone gets an age). On a full-size world a long
advance runs at the speed of the simulation, about a few seconds per in-game day.

### New in 1.3: stories, a journal, and automatic updates

- **Automatic updates (Windows).** From this version on, `MeridianReach.exe` checks for new releases when it
  starts, downloads them in the background (verified against a published checksum) and installs them when you
  restart — the game saves first. A banner tells you when an update is ready; Settings → Updates has an on/off
  switch and "Check now". (You need to download 1.3 by hand once; after that it updates itself.)
- **Stories.** Situations are now stories that remember the people involved and continue over days: they have
  stages, deadlines, several routes and real endings, and every choice acts through the normal game systems.
- **The wage dispute.** A strike at your company becomes a story: meet the strike committee, open the books,
  settle, or wait them out — and keep (or break) the promise you make afterwards. As an employee you can join
  the picket or broker a deal; as a journalist or politician you can report on it or speak at the picket.
- **The price of a meal.** When food prices jump, a neighbour feels it first. Buy them groceries on the real
  market, find out the real reasons (shut factories, grain prices, disasters), help at the community kitchen or
  give from your own company's stock, then see whether prices eased.
- **Borrowed trust.** A friend's loan is now a story: ask whether they can spare it, repay early, ask for more
  time, or face the consequences of defaulting — and make it right later.
- **Journal.** Every open story with its next step, deadlines, what it's waiting for, your promises, and a
  history of what happened. "Everyday situations" frequency can be set to off, rare, normal or frequent.
- **Memories.** People remember why they feel the way they do about you ("repaid my loan early", "broke their
  promise of a pay review"); see it on their profile and when you talk to them.
- **One place to decide.** Strikes, loans, bribes, arrests, interviews and debates show up as stories as well
  as in the inbox; answering in either place settles it once.

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
