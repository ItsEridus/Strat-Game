// All tunable numbers live here. Every entry is tagged with where its value came
// from (see PROVENANCE at the bottom and docs/DESIGN.md):
//   DOC  - documented by current official announcements
//   WIKI - older wiki baseline, used where nothing newer contradicts it
//   SOLO - a chosen default for this single-player adaptation (not an Eclesiar value)
// Saves may carry overrides (Settings → Balance) which are merged in at load time.

export const BALANCE = {
  energy: {
    regenPerTick: 5, // WIKI 1 energy / 2 min → 5 per 10-minute tick
    baseMax: 100, // SOLO
    hospitalPerLevel: 10, // SOLO
  },
  food: {
    energy: [10, 20, 30, 40, 50], // WIKI Q1..Q5
    allowanceEvery: 45, // WIKI minutes per allowance
    allowanceMax: 10, // SOLO
    allowanceStart: 5, // SOLO
  },
  cost: { work: 10, train: 10, hit: 10, build: 10, manager: 10, mineStart: 10, article: 10 }, // train/hit/build: DOC/WIKI; others SOLO
  xp: { work: 2, train: 2, trainDonate: 4, hit: 1, build: 2, manager: 2, article: 3, vote: 1, daily: 1 }, // train & donate DOC, daily DOC, rest SOLO
  levels: {
    base: 20, // SOLO: XP to reach level 2
    perLevel: 12, // SOLO: extra XP per level
    attrPerLevel: 3, // DOC
    attrMaxLevel: 50, // DOC
    goldPerLevel: 0.5, // SOLO
  },
  attrs: {
    str: 5, // DOC +5 starting hit damage per point (applied before training-power multiplier, DOC Sept 19)
    acc: 0.1, // DOC +0.1 percentage point hit chance
    luckCrit: 0.1, // DOC +0.1 pt crit chance
    luckCritDmg: 0.2, // DOC +0.2 pt crit damage
    end: 1, // DOC +1 max energy
    lead: 0.1, // DOC +0.1% employee production
    eco: 0.1, // DOC +0.1 effective economic skill
    cons: 0.1, // DOC +0.1% construction progress
  },
  training: {
    startPower: 10, // SOLO
    logBase: 10, // SOLO: wiki gives 1/log(power+2) without stating the base
  },
  damage: {
    base: 100, // SOLO starting hit damage before attributes
    powerDivisor: 100, // SOLO: multiplier = 1 + power / divisor
    hitChance: 70, // SOLO (old 80% base superseded; no cap per DOC)
    critChance: 5, // SOLO
    critDamage: 200, // WIKI base critical damage %
    unarmed: 1, // WIKI
    ground: [2.5, 3.1, 3.9, 4.9, 6.1], // WIKI
    air: [3.0, 3.8, 4.7, 5.9, 7.3], // WIKI
    foreignPenalty: 0.3, // DOC 30% penalty fighting outside own/allied flags
    supplyPenalty: 0.1, // DOC 10% when defender's route to capital is cut
    terrain: { plainsAtk: 0.2, mountainsDef: 0.2, forestAcc: 10, desertEnergyMult: 2 }, // WIKI
  },
  ranks: {
    // DOC/WIKI anchors: Private 300k/1.1x, Corporal 1M/1.2x, Sergeant 5.2M/1.3x; 21 ranks Rookie 1x .. Grand Warlord 3x.
    // Thresholds past Sergeant are SOLO extrapolations.
    names: ['Rookie', 'Private', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Master Sergeant', 'Warrant Officer', 'Lieutenant',
      'First Lieutenant', 'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier', 'Major General', 'Lieutenant General',
      'General', 'Marshal', 'Field Marshal', 'Warlord', 'Grand Warlord'],
    thresholds: [0, 300e3, 1e6, 5.2e6, 12e6, 25e6, 45e6, 75e6, 120e6, 180e6, 260e6, 360e6, 480e6, 640e6, 840e6, 1.1e9, 1.4e9, 1.8e9, 2.3e9, 2.9e9, 3.6e9],
    multStep: 0.1, // 1.0 .. 3.0
  },
  battle: {
    roundMinutes: 160, // WIKI
    segmentPtsPerMin: [10, 20, 30, 60], // WIKI → 4,800 points per round, 2,401 to win
    roundsToWin: 3, // SOLO (best of five)
    tickRule: 'leader', // SOLO: each 10-minute scoring tick goes to the side leading in round damage (ties → defender)
    pool: { base: 2, max: 64, thresholds: [40e3, 160e3, 640e3, 2.56e6, 10.24e6] }, // DOC 2..64 gold; thresholds SOLO
    directShare: 0.4, // DOC
    reserveCap: 30, // DOC gold
  },
  company: {
    foundCost: [10, 20, 60, 170, 370], // WIKI gold for Q1..Q5
    rawPerShift: 10, // SOLO base raw units per shift
    rawQualityMult: [1, 1.25, 1.5, 1.75, 2], // SOLO
    richness: [0.3, 1, 1.3, 1.6], // SOLO multiplier for resource richness 0..3 (0 = region lacks the resource)
    // SOLO recipes: finished units per shift, raw input per unit per quality level.
    recipes: {
      food: { perShift: 5, input: 'grain', perQ: 2 },
      wg: { perShift: 3, input: 'iron', perQ: 3 },
      wa: { perShift: 2, input: 'titanium', perQ: 4 },
      ticket: { perShift: 3, input: 'oil', perQ: 3 },
    },
    ecoFactor: 0.06, // SOLO output multiplier per point of effective economic skill
    maxWorkers: [4, 6, 8, 10, 12], // SOLO by quality
    managerCosts: [0, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2], // SOLO gold per extra manager shift in one day (first free), per citizen
    listedPenalty: 0.2, // WIKI says listed companies produce less; 20% is SOLO
    relocateFee: 5, // SOLO gold
    relocateCooldownDays: 7, // SOLO
    storage: 6000, // SOLO
    startFunds: 400, // SOLO currency for a newly founded company (paid by the founder)
  },
  eco: { gainBase: 0.5, startSkill: 1 }, // SOLO diminishing gain = base / (1 + skill/5)
  storage: { weights: { raw: 1, food: 3, wg: 2, wa: 4, ticket: 4, special: 1 }, citizen: 3000, holding: 3750, unit: 3750, nation: 15000 }, // WIKI
  pollution: {
    windowDays: 7, // SOLO rolling window
    weights: { raw: 1, finished: 2 }, // SOLO (wiki tables conflict)
    capacityPerPop: 0.02, // SOLO weight units per resident per window
    industrialMitigation: 0.25, // SOLO capacity bonus per Industrial Zone level
    formula: 0.9, // WIKI production multiplier = 1 - 0.9 × pollutionFraction
  },
  taxes: {
    ceilingBase: 25, // DOC
    communistPts: 0.5, // DOC
    capitalistImportPts: 0.4, // DOC
    capitalistVatWorkPts: 0.3, // DOC
    defaults: { work: 10, vat: 5, import: 10 }, // SOLO
    occupierShare: 0.8, // DOC work tax to occupier
    exileRelief: 0.5, // SOLO work-tax relief for exiles working in a host holding their cores
  },
  market: { maxListings: 12, minPriceFrac: 0.6 }, // SOLO
  fx: { startRate: 100, spread: 0.03, bankShare: 0.08, levels: 4, drift: 0.002, pressure: 0.01, reserveTarget: 400 }, // managed float: drift toward trades, adjust when gold reserves leave 50–150% of target // SOLO: 100 currency per gold at start; treasuries quote a 4-level ladder daily with 8% of reserves
  households: {
    spendRate: 0.5, // SOLO share of the background households' wallet spent on goods each day
    shares: { food: 0.75, ticket: 0.15, wg: 0.1 }, // SOLO spending mix
    startPerPop: 0.01, // SOLO starting household wallet per resident
  },
  living: { perDay: 4, discretionary: 0.05, comfort: 150 }, // SOLO daily living costs + 5%/day of cash above 150 spent on lifestyle; paid to the background economy (closes the money loop)
  wages: { start: 8, min: 5 }, // SOLO starting offer and minimum wage (currency)
  treasury: { householdTransfer: 0.03, publicWorksFrac: 0.6, startPerCitizen: 400 }, // SOLO daily transfer share, fallback wage share
  politics: {
    voteLevel: 3, // SOLO
    partyLevel: 3, // SOLO
    congressLevel: 5, // SOLO
    presidentLevel: 8, // SOLO
    partyFoundCost: 10, // WIKI gold
    congressMin: 3, // WIKI
    congressMax: 20, // WIKI
    citizensPerSeat: 4, // SOLO
    proposalsPerDeputy: 5, // WIKI
    voteHours: 24, // WIKI
    days: { president: 1, party: 10, congress: 25 }, // WIKI day-of-month
    regCloseHours: 24, // SOLO
    bgVoterWeight: 0.2, // SOLO votes per background resident (aggregated blocs)
  },
  construction: {
    ptsPerAction: 20, // WIKI 10 energy → 20 points
    needPtsPerLevel: 400, // SOLO × level × population factor
    popFactorPer: 5000, // SOLO
    mats: { // SOLO material needs per level
      hospital: { grain: 200, iron: 100 },
      fields: { grain: 150, oil: 100 },
      industrial: { iron: 250, oil: 100 },
      base: { iron: 300, titanium: 100 },
    } as Record<string, Record<string, number>>,
    builderRankStep: [0, 2000, 8000, 25000, 70000, 180000], // SOLO lifetime points
    builderRankBonus: 0.1, // SOLO per builder rank
    rewardPool: 2, // SOLO gold to top contributors on completion
  },
  buildings: {
    fieldsRaw: 0.1, // SOLO +10% raw output per level
    industrialFactory: 0.1, // SOLO
    baseDefense: 0.05, // SOLO +5% defender damage per level
    baseAccuracy: 1, // SOLO +1 pt accuracy per level
    baseSupplyLevel: 4, // DOC
    nukeLevel: 5, // DOC
  },
  war: {
    durations: [8, 14, 21, 30], // DOC days
    quota: [3, 3, 6], // DOC for 1 and 2 goals; 0-goal value SOLO
    pactDays: 7, // DOC
    buildingDamage: 1, // DOC
    smallNationCap: true, // DOC mentions small-enemy quotas; cap = enemy region count (SOLO)
  },
  units: { cost: 50, maxSquads: 10, squadSize: 5, orderBonus: 0.1, specBonus: 0.1, upgradeCost: 20 }, // cost/size WIKI, bonuses SOLO
  gear: {
    dropAttack: 0.004, // WIKI
    dropBuild: 0.0004, // WIKI
    dropMine: 0.01, // WIKI
    rarities: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'],
    rarityMult: [1, 1.8, 3, 4.6, 7], // SOLO stat scaling
    dismantleGold: [0.05, 0.15, 0.5, 1.5, 4], // SOLO (Scavenger study doubles)
  },
  holdings: { cost: 50, shares: 100, level: 10 }, // WIKI
  newspaper: { cost: 5, revenuePerReader: 0.02 }, // cost WIKI, revenue SOLO
  auctions: { level: 7, listFee: 0.1, sellerCut: 0.05, minHours: 1, maxHours: 48, snipeWindow: 10, snipeExtend: 10 }, // level/cut/durations WIKI; others SOLO
  contracts: { feeFlat: 0.05, feePct: 0.005, giftExemptLevel: 10, expiryDays: 3 }, // SOLO (fee existence DOC)
  missions: { count: 8, gold: 0.4, prestige: 10, aiGold: 0.2 }, // WIKI; aiGold SOLO (AI citizens earn per completed activity type)
  season: { days: 60, tiers: 30, prestigePerTier: 100 }, // SOLO
  mining: { yields: { 1: 0.5, 2: 0.8 } as Record<number, number>, globalMult: 1 }, // WIKI yields
  studies: { unlockAt: 75, decayPerHour: 1 }, // unlock DOC; decay SOLO (wiki: 4/h)
  travel: { energyPerHop: 5, ticketRange: [1, 2, 3, 4, 6] }, // SOLO
  citizenship: { cost: 2 }, // SOLO gold
  nuke: { gold: 750, oil: 12500, iron: 2500, titanium: 5000, prodHours: 48, flightHours: 8 }, // DOC
  spy: { recon: [0.7, 0.2, 0.1], defuse: [0.25, 0.25, 0.5], cooldownHours: 24, defuseGold: 5, defuseTickets: 5, defuseIntel: 10 }, // DOC outcomes; costs SOLO
  pirates: { ships: 6, defenders: 10, depotBonus: 0.1, depotDiscount: 0.02, cutlass: 0.2, everyDays: 45, lengthDays: 10 }, // DOC numbers; schedule SOLO
  tournaments: { level: 10, everyDays: 7, fee: 1, cap: 16 }, // level WIKI; rest SOLO
  ai: {
    fightShare: 0.65, // SOLO share of energy AI soldiers commit to battles
    priceStep: 0.04, // SOLO price adjustment per day
    markup: 1.25, // SOLO target price over unit cost
  },
};

export type Balance = typeof BALANCE;
export const B: Balance = JSON.parse(JSON.stringify(BALANCE));

/** Merge save-specific overrides into the live balance table (deep, by path). */
export function applyBalance(overrides: Record<string, any>) {
  const fresh: any = JSON.parse(JSON.stringify(BALANCE));
  for (const [path, value] of Object.entries(overrides || {})) {
    const parts = path.split('.');
    let o = fresh;
    for (let i = 0; i < parts.length - 1; i++) o = o?.[parts[i]];
    if (o && parts[parts.length - 1] in o) o[parts[parts.length - 1]] = value;
  }
  Object.assign(B, fresh);
}

export type Source = 'DOC' | 'WIKI' | 'SOLO';
/** Human-readable provenance shown on the Settings → Balance & Sources screen. */
export const PROVENANCE: { key: string; src: Source; note: string }[] = [
  { key: 'energy.regenPerTick', src: 'WIKI', note: '1 energy per 2 minutes of (simulated) time' },
  { key: 'energy.baseMax', src: 'SOLO', note: 'Base maximum energy before Endurance and hospitals' },
  { key: 'food.energy', src: 'WIKI', note: 'Q1–Q5 food restore 10–50 energy' },
  { key: 'food.allowanceEvery', src: 'WIKI', note: 'One eating allowance per 45 minutes' },
  { key: 'food.allowanceMax', src: 'SOLO', note: 'Allowance cap not established by sources' },
  { key: 'xp.train', src: 'DOC', note: 'Training gives 2 XP; donation variant 4 XP' },
  { key: 'levels.attrPerLevel', src: 'DOC', note: '3 attribute points per level through level 50' },
  { key: 'attrs', src: 'DOC', note: 'Per-point attribute effects from the September attributes update' },
  { key: 'training.logBase', src: 'SOLO', note: 'Wiki: power gain 1/log(power+2); log base unstated, base 10 chosen' },
  { key: 'damage.base / powerDivisor', src: 'SOLO', note: 'Full current damage formula unverified; see docs/DESIGN.md' },
  { key: 'damage.hitChance', src: 'SOLO', note: 'Old 80% base superseded; accuracy has no cap (DOC)' },
  { key: 'damage.ground / air', src: 'WIKI', note: 'Weapon multipliers per quality' },
  { key: 'damage.foreignPenalty', src: 'DOC', note: '30% penalty outside own/allied flags' },
  { key: 'damage.supplyPenalty', src: 'DOC', note: '10% penalty when supply route to capital is cut' },
  { key: 'damage.terrain', src: 'WIKI', note: 'Plains +20% atk, mountains +20% def, forest −10 acc, desert 2× energy' },
  { key: 'ranks.thresholds', src: 'SOLO', note: 'First three anchors WIKI; later thresholds extrapolated' },
  { key: 'battle.roundMinutes / segmentPtsPerMin', src: 'WIKI', note: '160-minute rounds, 4,800 points, 2,401 to win' },
  { key: 'battle.tickRule', src: 'SOLO', note: 'Exact dominance rule unverified; leader in round damage takes each tick' },
  { key: 'battle.roundsToWin', src: 'SOLO', note: 'First side to three rounds wins' },
  { key: 'battle.pool', src: 'DOC', note: 'Per round-side gold pool 2→64, 40% direct / 60% reserve (cap 30); thresholds SOLO' },
  { key: 'company.foundCost', src: 'WIKI', note: '10/20/60/170/370 gold for Q1–Q5' },
  { key: 'company.recipes / rawPerShift', src: 'SOLO', note: 'Recipe quantities not established by sources' },
  { key: 'company.managerCosts', src: 'SOLO', note: 'Wiki examples conflict; first manager shift per day free, then doubling gold per citizen' },
  { key: 'storage', src: 'WIKI', note: 'Item weights and warehouse capacities' },
  { key: 'pollution.formula', src: 'WIKI', note: 'Production × (1 − 0.9 × pollution); weights/window SOLO' },
  { key: 'taxes.ceiling*', src: 'DOC', note: 'Ceiling = 25 + 0.5×communist% − 0.4/0.3×capitalist% (interpretation)' },
  { key: 'taxes.occupierShare', src: 'DOC', note: 'Occupied regions: 80% work tax to occupier, 20% to owner' },
  { key: 'households / living', src: 'SOLO', note: 'Aggregated background consumers funded by citizens’ living costs and treasury transfers (closed money loop)' },
  { key: 'politics.days', src: 'WIKI', note: 'President ~1st, party ~10th, congress ~25th of month' },
  { key: 'politics.congressMin/Max', src: 'WIKI', note: '3–20 deputies by population' },
  { key: 'politics.proposalsPerDeputy', src: 'WIKI', note: 'Five proposals per mandate' },
  { key: 'construction.ptsPerAction', src: 'WIKI', note: '10 energy gives 20 base construction points' },
  { key: 'construction.mats / needPts', src: 'SOLO', note: 'Requirements not established; scale with population' },
  { key: 'war.durations', src: 'DOC', note: '8, 14, 21 or 30 days' },
  { key: 'war.quota', src: 'DOC', note: 'One goal → 3 occupations, two goals → 6; zero-goal SOLO' },
  { key: 'war.pactDays', src: 'DOC', note: 'Seven-day non-aggression pact after settlement' },
  { key: 'buildings.baseSupplyLevel', src: 'DOC', note: 'Level-4 military base protects its region’s supply' },
  { key: 'units.cost / squads', src: 'WIKI', note: '50 gold, up to 10 squads of 5' },
  { key: 'gear.drop*', src: 'WIKI', note: '0.4% per attack, 0.04% per construction, 1% per mining' },
  { key: 'holdings', src: 'WIKI', note: '50 gold, 100 shares, level 10' },
  { key: 'auctions', src: 'WIKI', note: 'Level 7, 1–48h, 5% seller charge; anti-snipe adapted to 10-minute ticks (SOLO)' },
  { key: 'missions', src: 'WIKI', note: '8 daily missions, 0.4 gold + 10 prestige each' },
  { key: 'mining.yields', src: 'WIKI', note: '0.5 gold / 1h, 0.8 gold / 2h shifts' },
  { key: 'studies.unlockAt', src: 'DOC', note: 'Studies unlock at 75%' },
  { key: 'studies.decayPerHour', src: 'SOLO', note: 'Gentler than wiki 4/hour for solo play' },
  { key: 'nuke', src: 'DOC', note: '750 gold, 12,500 oil, 2,500 iron, 5,000 titanium, 48h build, 8h flight' },
  { key: 'spy', src: 'DOC', note: 'Recon 70/20/10, defusal 25/25/50 outcomes; costs SOLO' },
  { key: 'pirates', src: 'DOC', note: '6 ships × 10 defenders, depot +10%/level & 2% discount; schedule SOLO' },
  { key: 'travel', src: 'SOLO', note: 'Travel formula unverified' },
  { key: 'contracts', src: 'SOLO', note: 'Fee exists (DOC); amounts chosen' },
];
