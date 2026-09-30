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
  // No levels: skills grow by practice (sim/growth.ts). Effort per activity ≈ one day's worth.
  practice: { work: 1, train: 1.2, trainDonate: 0.6, hit: 0.03, build: 1, manager: 1, article: 1, rally: 1.5, canvass: 0.8, talk: 0.1, volunteer: 0.6, crime: 0.5, patrol: 0.6, spy: 0.6 }, // SOLO
  growth: { rate: 0.6, soft: 20 }, // SOLO gain = effort × rate × youth / (1 + skill / soft)
  family: { dateCost: 12, weddingCost: 150 }, // SOLO currency
  places: { exploreEnergy: 5, exploreGain: 6, exploreStory: 0.3 }, // SOLO exploring a district: energy, familiarity (diminishing), chance of a situation
  life: { adultAge: 18, playerAge: 24, retireAge: 65, stages: { child: 5, teen: 13, adult: 18, senior: 65 } }, // SOLO; the pace of life is Settings.lifeYearDays
  standing: { rally: 0, talk: 0.05, daily: 0.2 }, // SOLO influence from daily goals (rallies/articles already give influence)
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
      materials: { perShift: 4, input: 'timber', perQ: 2 },
      clothing: { perShift: 4, input: 'cotton', perQ: 2 },
      electronics: { perShift: 2, input: 'copper', perQ: 3 },
      medicine: { perShift: 3, input: 'oil', perQ: 2 },
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
  goods: { // SOLO everyday uses of clothing, electronics and medicine (by grade, basic..top-grade)
    medicine: [4, 7, 10, 14, 18], // health restored at once (one dose a day)
    treatment: 6, treatmentDays: 3, // better recovery for a few days after a dose
    clothes: [1, 2, 3, 4, 6], clothesDays: 30, // happiness from new clothes, and for how long
    gadget: [2, 3, 4, 6, 8], gadgetDays: 90, // happiness from a new gadget, and for how long
  },
  eco: { gainBase: 0.5, startSkill: 1 }, // SOLO diminishing gain = base / (1 + skill/5)
  storage: { weights: { raw: 1, food: 3, wg: 2, wa: 4, ticket: 4, materials: 3, clothing: 1, electronics: 2, medicine: 1, special: 1 }, citizen: 3000, holding: 3750, unit: 3750, nation: 15000 }, // WIKI
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
    shares: { food: 0.7, ticket: 0.12, wg: 0.06, clothing: 0.05, electronics: 0.03, medicine: 0.02, materials: 0.02 }, // SOLO spending mix (materials: home repairs)
    startPerPop: 0.01, // SOLO starting household wallet per resident
    maxStockShare: 0.7, // SOLO households buy at most 70% of the listed stock per shopping round, leaving goods for citizens
  },
  social: {
    talkEnergy: 2, // SOLO energy per conversation
    treatCost: 3, // SOLO currency for a coffee
    rallyEnergy: 30, // SOLO
    canvassEnergy: 15, // SOLO
  },
  population: {
    maxFactor: 4.2, // SOLO a region can grow to 4.2× the per-region setting (about 100 at 24)
    worldCap: 1.35, // SOLO the whole world's AI population stays within 1.35× its starting size (performance)
    churn: 0.0015, // SOLO daily share of residents coming and going in a steady region
    companiesPerCitizen: 0.8, // SOLO starting companies relative to the old 24-citizen industry plan (1 = same ratio)
  },
  living: { perDay: 4, discretionary: 0.05, comfort: 150 }, // SOLO daily living costs + 5%/day of cash above 150 spent on lifestyle; paid to the background economy (closes the money loop)
  wages: { start: 8, min: 5 }, // SOLO starting offer and minimum wage (currency)
  treasury: { householdTransfer: 0.02, publicWorksFrac: 0.6, startPerCitizen: 400 }, // SOLO daily transfer share, fallback wage share
  politics: {
    foundRep: 15, // SOLO standing to found a party ("Known locally")
    congressRep: 15, // SOLO standing to stand for congress
    presidentRep: 35, // SOLO standing to run for head of government ("Respected")
    presidentAge: 30, // SOLO
    partyFoundCost: 10, // WIKI gold
    congressMin: 3, // WIKI
    congressMax: 20, // WIKI
    citizensPerSeat: 4, // SOLO
    proposalsPerDeputy: 5, // WIKI
    voteHours: 24, // WIKI
    days: { president: 1, party: 10, congress: 25 }, // WIKI day-of-month
    regCloseHours: 24, // SOLO
    bgVoterRatio: 1, // SOLO background voter blocs, as a multiple of the citizen electorate
    regOpenDays: 7, // SOLO registration opens a week before each election
    specialElectionDays: 3, // SOLO after impeachment / new-election law
    printGoldShare: 0.25, // SOLO printing N currency burns 25% of its value in treasury gold
    impeachApproval: 25, // SOLO opposition considers impeachment below this approval
  },
  construction: {
    ptsPerAction: 20, // WIKI 10 energy → 20 points
    needPtsPerLevel: 400, // SOLO × level × population factor
    popFactorPer: 5000, // SOLO
    mats: { // SOLO material needs per level
      hospital: { grain: 120, iron: 80, materials: 30 },
      fields: { grain: 100, oil: 50, materials: 20 },
      industrial: { iron: 150, oil: 60, materials: 40 },
      base: { iron: 200, titanium: 60, materials: 40 },
    } as Record<string, Record<string, number>>, // `materials`: building materials of any grade, counted by grade (a premium unit counts 4)
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
  holdings: { cost: 50, shares: 100, rep: 15 }, // cost/shares WIKI; standing SOLO
  newspaper: { cost: 5, revenuePerReader: 0.02 }, // cost WIKI, revenue SOLO
  auctions: { listFee: 0.1, sellerCut: 0.05, minHours: 1, maxHours: 48, snipeWindow: 10, snipeExtend: 10 }, // level/cut/durations WIKI; others SOLO
  contracts: { feeFlat: 0.05, feePct: 0.005, giftExemptRep: 15, expiryDays: 3 }, // SOLO (fee existence DOC)
  missions: { count: 8, gold: 0.4, prestige: 10, aiGold: 0.05 }, // WIKI; aiGold SOLO (AI citizens earn per completed activity type)
  season: { days: 60, tiers: 30, prestigePerTier: 100 }, // SOLO
  mining: { yields: { 1: 0.5, 2: 0.8 } as Record<number, number>, globalMult: 1 }, // WIKI yields
  studies: { unlockAt: 75, decayPerHour: 0.25 }, // unlock DOC; decay SOLO (wiki: 4/h; set 0 to disable upkeep)
  travel: { energyPer1000km: 5, ticketRangeKm: [800, 2000, 4000, 8000, 20100], walkEnergy: 15, qualityDiscount: 0.1 }, // SOLO: walk to a land neighbour; tickets fly by great-circle distance
  citizenship: { cost: 2 }, // SOLO gold
  nuke: { gold: 750, oil: 12500, iron: 2500, titanium: 5000, prodHours: 48, flightHours: 8 }, // DOC
  spy: { recon: [0.7, 0.2, 0.1], defuse: [0.25, 0.25, 0.5], cooldownHours: 24, defuseGold: 5, defuseTickets: 5, defuseIntel: 10 }, // DOC outcomes; costs SOLO
  crime: {
    base: 22, // SOLO crime floor (0..100 scale)
    unemployment: 60, // SOLO points per 100% national unemployment
    poverty: 12, // SOLO points when households cannot meet demand
    syndicate: 14, // SOLO points per controlling syndicate (scaled by strength)
    policeFactor: 0.5, // SOLO crime change per police point above/below 30
    urban: 14, // SOLO extra crime in big cities
    recession: 10, // SOLO extra crime at the bottom of the cycle
    drift: 0.12, // SOLO daily move toward target
    theftShare: 0.0015, // SOLO share of the region's household money lost to crime per 100 crime per day
    approvalHit: 0.05, // SOLO state approval lost per crime point above 40, per day
  },
  police: {
    base: 20, // SOLO baseline policing everywhere
    nationalPerShare: 300, // SOLO police points per unit share of revenue for the national police (3% → 9 points, capped 25)
    officer: 4, // SOLO police points per citizen officer serving in the region
    salary: 7, // SOLO officer daily salary (currency) paid from the police budget
    patrolEnergy: 20, // SOLO
    patrolCd: 20, // SOLO hours between patrols
    evidencePerDay: 4, // SOLO base evidence gathered per day on an open case (× police/50)
    arrestAt: 60, // SOLO evidence needed to arrest
    rankAt: [0, 5, 15, 35, 70], // SOLO collars needed for officer/sergeant/detective/captain/chief
    fitness: 3, // SOLO strength + endurance to pass the police fitness test
  },
  justice: {
    finePerLoot: 2, // SOLO fine = 2× what was taken (min 20 currency)
    jailDaysPerSeverity: 1.5, // SOLO days of prison per severity point
    lawyer: 40, // SOLO currency for a lawyer (−25% conviction chance)
    bribeBase: 60, // SOLO currency needed to attempt a bribe at arrest
    heatDecay: 3, // SOLO heat lost per day
    coldAfterDays: 20, // SOLO cases with little evidence close after this long
  },
  syndicate: {
    perNation: [1, 3], // SOLO syndicates at genesis
    joinChance: 0.03, // SOLO daily chance a disaffected AI citizen joins
    racketFee: 0.004, // SOLO share of a company's cash demanded per day in protection
    payoutShare: 0.25, // SOLO share of daily income paid to members
    expandChance: 0.08, // SOLO daily chance to push into a neighbouring region
    raidAt: 1.2, // SOLO police/strength ratio at which authorities raid
  },
  intel: {
    staffShare: 0.01, // SOLO AI citizens stop joining the intelligence service once it employs this share of the nation
    budget: 0.025, // SOLO default share of daily revenue for the intelligence service
    networkGain: 0.6, // SOLO network points per 100 currency invested per day
    networkDecay: 0.4, // SOLO daily network decay
    opHours: { intel: 8, sabotage: 18, theft: 24, unrest: 20, propaganda: 16, scandal: 30, recruit: 20, counter: 12, milintel: 12, milsabotage: 20 }, // SOLO
    opCost: { intel: 30, sabotage: 80, theft: 60, unrest: 60, propaganda: 50, scandal: 70, recruit: 40, counter: 30, milintel: 40, milsabotage: 90 }, // SOLO currency
    minNetwork: { intel: 0, sabotage: 25, theft: 35, unrest: 20, propaganda: 10, scandal: 30, recruit: 15, counter: 0, milintel: 20, milsabotage: 35 }, // SOLO
    rep: 5, age: 21, // SOLO standing and age to be vetted by an intelligence service
    energy: 25, // SOLO field agent energy per operation
    agentCd: 12, // SOLO hours between a citizen agent's operations
    salary: 8, // SOLO daily salary of a citizen in the intelligence service (currency)
    maxActive: 3, // SOLO concurrent operations per service
    rankAt: [0, 2, 6, 14, 30], // SOLO successful operations needed per rank
  },
  dynamics: {
    cycleVol: 0.06, // SOLO daily volatility of the world business cycle
    cycleRevert: 0.03, // SOLO mean reversion
    hhSpendSwing: 0.3, // SOLO household spending ±30% across the cycle
    disasterChance: 0.9, // SOLO scale on seasonal hazard odds
    epidemicEveryDays: 70, // SOLO average days between outbreaks
    strikeBelowAvg: 0.8, // SOLO companies paying below 80% of the national average wage risk strikes
    protestAt: 55, // SOLO unrest for protests
    riotAt: 78, // SOLO unrest for riots
    migration: 0.004, // SOLO share of population that can move per day between regions
    arrivalEveryDays: 3, // SOLO a new AI citizen arrives in some nation about this often
    maxCitizensFactor: 1.3, // SOLO cap on AI population growth
  },
  forces: {
    retireAge: 62, // SOLO serving personnel retire at this age
    retireAgeFlag: 64, // SOLO generals and admirals
    maxEnlistAge: 44, // SOLO oldest new recruit
    budget: 0.15, // SOLO default military budget: share of daily revenue (upkeep and duty pay draw on it)
    upkeepScale: 0.07, // SOLO converts a formation type's upkeep weight into currency per day
    careerShare: 0.03, // SOLO share of a nation's citizens seeded as career officers and NCOs
    serviceShare: 0.08, // SOLO AI citizens stop enlisting once this share of the nation serves
    dmgPerTick: 300, // SOLO battle damage per 10-minute tick of a full-strength formation with power 1
    attrition: 0.35, // SOLO strength lost per tick × enemy share of the tick's damage
    reinforce: 3, // SOLO strength regained per day when paid and supplied at home
    readinessDrift: 0.08, // SOLO daily move of readiness toward its target
    airSuperiority: 0.1, // SOLO damage bonus for the side that wins the air
    airRangeKm: 2500, // SOLO bomber/fighter reach from base
    blockade: 0.15, // SOLO production penalty on blockaded coasts
    naval: [0.08, 0.25], // SOLO strength lost by the loser of a naval engagement (min, max); winners lose a third
    salary: [1, 1, 1.2, 1.4, 1.6, 2, 2.3, 2.6, 3, 3.5, 4, 4.5, 5, 5.5, 6], // SOLO duty pay by rank index (currency per day of duty)
    dutyEnergy: 15, // SOLO
    dutySp: 3, // SOLO service points per day of duty
    dmgPerSp: 25000, // SOLO damage in war battles per service point
    victorySp: 5, // SOLO service points for fighting in a won battle
    heroSp: 10, // SOLO
    commandSp: 1, // SOLO per day in command
    rankBonus: 0.015, // SOLO war damage bonus per rank index for enlisted citizens
    chiefBonus: 0.05, // SOLO power bonus for all formations with a chief of staff
    alertUpkeep: 0.12, // SOLO extra upkeep per alert level above 1
    alertCounter: 6, // SOLO counter-intelligence target per alert level above 1
  },
  state: {
    termDays: 60, // SOLO state/provincial election cycle (staggered across regions)
    regDays: 5, // SOLO candidate registration window before an election
    candRep: 15, // SOLO standing to run for governor/premier
    maxTax: 12, // SOLO ceiling on a state wage tax (%)
    taxStep: 3, // SOLO largest change per decision
    taxCooldownDays: 7, // SOLO
    startPerPop: 0.004, // SOLO starting treasury per resident (currency)
    residentBase: 3, // SOLO baseline sales/property levy (%) every regional government collects from residents, on top of its wage tax
    residentShare: 0.2, // SOLO share of the levy rate applied daily to the residents' share of household money
    grantShare: 0.03, // SOLO share of yesterday's national revenue paid to regional governments as block grants (by population)
    salary: 6, // SOLO daily salary of a citizen head of government (currency)
    devCostPerPop: 0.004, // SOLO infrastructure spending per resident per level
    devBonus: 0.02, // SOLO production bonus per infrastructure level
    devMax: 5,
    turnout: 0.55, // SOLO background turnout
  },
  pirates: { ships: 6, defenders: 10, depotBonus: 0.1, depotDiscount: 0.02, cutlass: 0.2, everyDays: 45, lengthDays: 10 }, // DOC numbers; schedule SOLO
  tournaments: { power: 25, everyDays: 7, fee: 1, cap: 16 }, // SOLO minimum training power
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
  { key: 'households / living', src: 'SOLO', note: 'Aggregated background consumers funded by citizens’ living costs and treasury transfers (closed money loop); they leave 30% of listed stock for citizens each round' },
  { key: 'world map', src: 'SOLO', note: 'Sixteen real countries and their 492 real first-level subdivisions (Natural Earth). Seats, terrain and population weights derive from the data; notable deposits are hand-listed, other deposits, richness and background population are rolled per seed; sea lanes and corridors link nations with no land border' },
  { key: 'crime & justice', src: 'SOLO', note: 'Regional crime from unemployment, poverty, the cycle, city size, unrest and gangs vs policing; cases, evidence, arrests, trials, fines and prison; syndicates with turf, rackets, feuds and raids; police careers (balance: crime, police, justice, syndicate)' },
  { key: 'intelligence', src: 'SOLO', note: 'Real agency names; budgets build networks and counter-intelligence; eight operation types with network thresholds, costs, durations and exposure; agent careers and double agents (balance: intel)' },
  { key: 'dynamic world', src: 'SOLO', note: 'Business cycle, commodity shocks, seasonal disasters in real hazard zones, epidemics spreading along borders, strikes, protests/riots, migration, new arrivals (balance: dynamics; data/hazards.ts)' },
  { key: 'armed forces', src: 'SOLO', note: 'Army divisions, fleets and air wings with strength/equipment/readiness/morale/experience; per-tick battle damage and attrition; upkeep from a military budget; wear-and-repair from national stocks; sea zones from real coastlines, naval superiority, amphibious landings and blockades; rank ladders and service points (balance: forces; data/military.ts)' },
  { key: 'state governments', src: 'SOLO', note: 'Real titles and elected/appointed heads; wage tax 0–12% (0% in US no-wage-tax states), resident levy, block grants, welfare/infrastructure/business budgets and 60-day election cycles are chosen defaults (balance: state)' },
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
  { key: 'holdings', src: 'WIKI', note: '50 gold, 100 shares' },
  { key: 'auctions', src: 'WIKI', note: '1–48h, 5% seller charge; anti-snipe adapted to 10-minute ticks (SOLO)' },
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
