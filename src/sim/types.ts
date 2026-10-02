// Core data model. The whole game is one serialisable `World` object: every
// entity lives in it, keyed by numeric id, so saves are a JSON snapshot.

export type Id = number;
/** 'GOLD' or a national currency code. Amounts are integers in minor units (see engine/money). */
export type AssetId = string;
export type Wallet = Record<AssetId, number>;
/** e.g. 'grain', 'food:3', 'wg:2' (ground weapon), 'wa:1' (air weapon), 'ticket:4', 'sp:medic'. */
export type ItemKey = string;
export type Inventory = Record<ItemKey, number>;

export type RawRes = 'grain' | 'iron' | 'titanium' | 'oil' | 'timber' | 'cotton' | 'copper';
export type Product = 'food' | 'wg' | 'wa' | 'ticket' | 'materials' | 'clothing' | 'electronics' | 'medicine';
export type Industry = RawRes | Product;
export type Terrain = 'plains' | 'mountains' | 'forest' | 'desert';
export type Ideology = 'capitalism' | 'nationalism' | 'centralism' | 'socialism' | 'imperialism' | 'communism';
export type BuildingType = 'hospital' | 'fields' | 'industrial' | 'base';
export type Persona = 'worker' | 'merchant' | 'politician' | 'soldier' | 'industrialist' | 'builder' | 'journalist' | 'investor';
export type Attr = 'str' | 'acc' | 'luck' | 'end' | 'lead' | 'eco' | 'cons';
export type Ministry = 'vp' | 'development' | 'defense' | 'economy' | 'labor' | 'pr' | 'recruitment' | 'interior' | 'intelligence';
export type GearSlot = 'helmet' | 'vest' | 'elbows' | 'gloves' | 'pants' | 'boots';
export type GearFamily = 'combat' | 'construction' | 'mining' | 'plains' | 'mountains' | 'forest' | 'desert';

export type AccountKind = 'cit' | 'co' | 'nat' | 'hh' | 'hold' | 'unit' | 'paper' | 'party' | 'reg' | 'synd';
export interface AccountRef { k: AccountKind; id: Id }

export interface Buff { type: string; until: number; value: number; source?: string }

export interface StudyState { progress: number; activeUntil?: number; cooldownUntil?: number }

export interface Citizen {
  id: Id;
  name: string;
  player?: boolean;
  persona: Persona;
  nation: Id; // citizenship
  loc: Id; // current region
  home: Id; // region where they live (work, neighbours, local life); travel moves loc, moving house moves home
  wallet: Wallet;
  inv: Inventory;
  born: number;
  attrs: Record<Attr, number>; // skills, grown by practice (sim/growth.ts)
  health?: number; // 0..100 (sim/population.ts); undefined = 90
  life?: LifeProfile; // personal life: wellbeing, milestones, hobbies, goals (sim/lifecycle.ts, sim/wellbeing.ts)
  family?: Family; // partner, parents, children (sim/family.ts)
  look?: import('./looks').Look;
  mind?: import('./mind').Mind; // values, and how experience has shaped them (2.6)
  mh?: import('./mentalHealth').MentalHealth; // past episodes, losses being grieved, therapy (2.6)
  birthplace?: Id; memorial?: number; // where they were born; a memorial raised to them (3.0)
  origin?: Id; residence?: import('./migration').Residence; // the country someone migrated from; their residence abroad (2.9)
  langs?: Partial<Record<import('./languages').Lang, number>>; course?: import('./languages').Lang; // languages spoken, once learning starts; lessons under way (2.9)
  religion?: import('./faith').Religion; // their faith, once chosen or changed (2.9)
  orient?: import('./partnership').Orientation; alimony?: import('./partnership').Alimony; // whom they are drawn to (player's choice); maintenance they pay (2.7)
  matches?: import('./familyLife').Match[]; // dating matches to meet (2.7)
  body?: { bmi: number; fitness: number; diet: import('./body').Diet }; // weight, fitness and diet, once they change (2.8)
  household?: import('./homeLife').Household; // furnishing, appliances, a cleaner, how the housework is shared (2.8)
  commute?: import('./everyday').Mode; sleep?: import('./everyday').Sleep; car?: import('./everyday').Car | null; // how they get to work, their nights, their car (2.8)
  ties?: import('./ties').Tie[]; // lasting memories of other people: grudges, gratitude, old flames, rivals, comrades (2.6)
  habits?: Partial<Record<import('./habits').Habit, import('./habits').HabitState>>; // smoking, drinking, gambling, gaming (2.6)
  habitDay?: Partial<Record<import('./habits').Habit, number>>; betsToday?: { day: number; n: number }; // the player's daily limits
  nature?: import('./nature').Nature; // talent, weakness, quirks (designed for the player; otherwise from a hash)
  background?: import('./nature').Background; // the family a life started in // a designed or changed appearance (otherwise generated: sim/looks.ts)
  dwelling?: import('./housing').Home;
  credit?: number;
  pension?: import('./pensions').Pension; // contribution record, pot and pensions in payment (sim/pensions.ts)
  conditions?: import('./health').Condition[]; // illnesses and injuries (sim/health.ts)
  leave?: import('./health').Leave; // sick or parental leave // credit score 300..850 (sim/loans.ts) // where and how they live (sim/housing.ts)
  post?: import('./services').Post; // a public-service post (sim/services.ts)
  edu?: import('./education').Education; // qualifications and current course (sim/education.ts)
  retired?: boolean;
  veteran?: { branch: Branch; rank: number; title: string; days: number; until: number }; // past military service (pensions, standing)
  trip?: { until: number; why: string } | null; // travelling away from home (AI)
  gone?: { t: number; why: 'died' | 'emigrated'; note: string }; // no longer part of the world (kept for names in history)
  power: number; // training power
  eco: number; // economic skill
  dmgTotal: number;
  buildTotal: number;
  energy: number;
  allowance: number; // food eating allowance
  allowAcc: number; // minutes accumulated towards next allowance
  job: Id | null;
  jobSince: number;
  lastWorkDay: number;
  lastTrainDay: number;
  trainsToday: number;
  mgrShiftsDay: number;
  mgrShifts: number;
  party: Id | null;
  unit: Id | null;
  ideo: Ideology;
  ideoStr: number; // 0..1 how strongly they hold it
  traits: { ambition: number; risk: number; loyalty: number; greed: number; activity: number };
  workHour: number;
  trainHour: number;
  fightStyle: 'early' | 'steady' | 'late';
  influence: number; // public standing used in elections
  rel: Record<Id, number>; // relationship to other citizens (-100..100), sparse
  gear: Partial<Record<GearSlot, Id>>;
  loadouts: { name: string; gear: Partial<Record<GearSlot, Id>> }[];
  buffs: Buff[];
  studies: Record<string, StudyState>;
  reserve: number; // combat reward reserve (gold minor units), claimable
  mining: { region: Id; start: number; end: number } | null;
  mineSite: Id;
  medals: Record<string, number>;
  mood: number; // -1..1 satisfaction with government
  lastIncome: number; // yesterday's income in home currency minor units
  incomeToday: number;
  incomeAvg?: number;
  benefit?: { until: number; daily: number }; // unemployment benefit being claimed (1.4.12)
  business?: import('./smallBusiness').Business; // self-employed: their own small business (1.4.13) // income per day, smoothed over about a month (living-standards statistics)
  flags: Record<string, number>;
  sec: CitizenSec;
  mil: MilService;
}

export type Branch = 'army' | 'navy' | 'air';
/** Service in the national armed forces. */
export interface MilService {
  branch: Branch | null;
  rank: number; // index into the branch's rank ladder
  commissioned?: boolean; // passed the military academy or officer training (needed for officer ranks)
  hinted?: boolean; // the player was told how to earn a commission
  sp: number; // service points (promotion)
  since: number; // enlistment time
  lastDuty: number;
  commands: number; // days in command of a formation (general/flag rank requirement)
  reserve?: boolean; // in the reserve: rank kept, no duty, pay, command or promotion (e.g. while holding public office)
  reserveSince?: number;
  calledUp?: Id; // called up from the reserve for this war (2.2)
  pow?: Id; // a prisoner of war, held by this nation (2.2)
}

export type FormationKind = 'infantry' | 'armored' | 'mountain' | 'marines' | 'fleet' | 'carrier' | 'submarine' | 'fighter' | 'bomber';
export interface FormationOrder { kind: 'garrison' | 'move' | 'support' | 'patrol' | 'strike' | 'superiority'; target: Id | string | null }
/** A standing military formation: an army division, a fleet or an air wing. */
export interface Formation {
  id: Id; nation: Id; branch: Branch; kind: FormationKind; name: string;
  loc: Id; // region (army/air); a fleet's home port
  zone: string | null; // sea zone a fleet is operating in
  strength: number; // 0..100 personnel/hulls/aircraft
  equipment: number; // 0..100
  readiness: number; // 0..100
  morale: number; // 0..100
  experience: number; // 0..100
  commander: Id | null;
  order: FormationOrder;
  path: (Id | string)[]; // remaining route (regions or sea zones)
  created: number;
  kills: number; // enemy strength destroyed
  gen?: number; // equipment generation fielded (1.8)
}

/** Law, underworld, intelligence and public-profile state of a citizen. */
/** A person's private life. Created for the player and the people close to them; other citizens get one when something happens to them. */
export interface LifeProfile {
  happiness: number; // 0..100, personal satisfaction (not the same as Citizen.mood, which is about the government)
  stress: number; // 0..100
  aptitude: number; // learning aptitude 0..100
  confidence: number; // social confidence 0..100
  goals: string[]; // aspiration keys (data/life.ts)
  milestones: Milestone[]; // durable record of a life (capped)
  hobbies: Record<string, number>; // hobby key -> skill 0..100
  lastAge?: number; // age at the last birthday processed
  lastRest?: number; lastFamily?: number; lastHobby?: number; // cooldowns (day numbers)
  treated?: number; // day of the last dose of medicine (better recovery for a few days)
  work?: import('./services').WorkEntry[];
  payslips?: import('./wages').Payslip[]; // the player's pay by month (latest last; three kept)
  parentalTaken?: number; // when parental leave was last taken
  will?: import('./legacy').Will; heirlooms?: import('./legacy').Heirloom[]; // what is passed on (sim/legacy.ts)
  grades?: number; lastSchool?: number; lastPlay?: number; schoolDone?: boolean; scholarship?: boolean; // childhood (sim/childhood.ts) // work history, newest last
  giftDay?: number; giftFrom?: Id; // the last gift received (one a day from the same person)
  goods?: { clothes?: { t: number; q: number }; gadget?: { t: number; q: number } }; // latest new clothes and gadget (time, grade)
  why?: { happiness: string[]; stress: string[] }; // the main reasons for the current values
  grief?: number; // recent loss, fades over time
}
export interface Milestone { t: number; age: number; kind: string; text: string }

/** One year of a life, reviewed on a birthday. */
export interface AnnualReview {
  id: Id; who: Id; age: number; from: number; to: number;
  lines: { kind: string; text: string }[]; // personal developments
  world: string[]; // notable world events of the year
  money: { start: number; end: number; cur: string };
  seen?: boolean;
}

/** Personal routine: what the player does automatically each day (through the same validated actions as manual play). */
export interface Routine { work: boolean; train: boolean; family: boolean; rest: boolean; hobby: string | null; school: boolean; jobHunt?: boolean; exercise?: boolean }

/** The life simulation's saved state (versioned with the world). */
export interface LifeState {
  reviews: AnnualReview[];
  advance: { target: number; from: number; label: string; start?: import('./periodReview').PeriodStart; skip?: boolean } | null; // skip: fast and without stopping (skip a year)
  period?: import('./periodReview').PeriodSummary; // what happened during the last long advance (shown once) // a long time advance in progress (resumable)
  pregnancies: { id: Id; parents: Id[]; due: number; home: Id; name?: string }[]; // scheduled births (each resolves once)
  adoptions: { id: Id; parents: Id[]; ready: number; fee: number; cur: string }[]; // applications in progress
  orphans: { name: string; born: number; parents: Id[]; region: Id }[]; // children in the care system, waiting for a family
  pets: Pet[];
  ended?: { t: number; name: string };
  succession?: { t: number; from: string; age: number; cause: string; to: string; toAge: number; heirlooms: number; seen?: boolean }; // shown once (ui) // the player's line ended with no heir (sim/legacy.ts)
  snap: { who: Id; t: number; age: number; cash: number; cur: string; job: string; status: string; kids: number; health: number; happiness: number } | null; // start of the current life year
}

/** Family ties. Children under 18 are not yet citizens: they live in `kids` until they come of age. */
/** A child growing up at home (a compact record until 18). `how` is set when they are not one's own by birth. */
export interface Kid { name: string; born: number; how?: 'adopted' | 'grandchild' | 'sibling' | 'stepchild' | 'fostered'; bond?: number; grades?: number; lastTime?: number; other?: Id; step?: Id } // other: the parent who lives apart; step: a step-parent (2.7)

export interface Family {
  partner: Id | null;
  status: 'single' | 'dating' | 'engaged' | 'married';
  since: number; // when the current relationship status began
  parents: Id[]; // biological parents (never rewritten by adoption or guardianship)
  children: Id[]; // children who are citizens (grown-up, or the player's family from birth)
  kids: Kid[]; // children still growing up in a background family (compact records)
  exes: Id[];
  adoptiveParents?: Id[]; // legal parents by adoption (ancestry stays in `parents` / `birthParents`)
  guardians?: Id[]; // who is responsible for a minor (may differ from parents)
  birthParents?: string[]; // names of birth parents who are not citizens (adoption records)
  lastDate?: number; // last time the couple spent time together
}

export interface CitizenSec {
  heat: number; // police attention 0..100
  jailUntil: number; // in prison until this time (0 = free)
  record: { crimes: number; arrests: number; convictions: number; fines: number };
  syndicate: Id | null;
  srank: number; // 0 associate, 1 soldier, 2 capo, 3 underboss, 4 boss
  police: Id | null; // region whose police force they serve in
  prank: number; // 0 officer, 1 sergeant, 2 detective, 3 captain, 4 chief
  collars: number; // arrests made
  agency: Id | null; // nation whose intelligence service employs them
  dir?: import('../data/intelServices').Directorate; // the directorate they serve in (2.1)
  arank: number; // 0 analyst, 1 case officer, 2 field agent, 3 station chief, 4 deputy director
  tradecraft: number;
  asset: Id | null; // foreign service secretly paying them (double agent)
  motive?: import('./collection').Motive; // why they work for it (2.1)
  doubled?: Id; // turned by their own country's counter-intelligence: now feeding the handler what it wants believed
  fame: number; // public profile
  notoriety: number; // criminal reputation
  goal: { kind: string; target?: Id; since: number } | null; // the NPC's current ambition
  rivals: Id[];
  last: Record<string, number>; // cooldowns: time of last crime, patrol, op, …
  inside?: import('./prisons').Inside; // life in prison (1.7)
  releasedAt?: number; // when they last left prison (a record follows them until it is spent)
  dirty?: Record<string, number>; // proceeds of crime not yet laundered, by currency (1.7)
  informs?: Id; // a police informant inside this organisation
  handler?: Id; // the officer running them
}

export type CrimeKind = 'pickpocket' | 'burglary' | 'fraud' | 'smuggling' | 'extortion' | 'bribery' | 'assault' | 'corruption' | 'espionage' | 'votebuying' | 'heist' | 'taxevasion' | 'escape' | 'armstrafficking' | 'embezzlement' | 'cybercrime' | 'laundering' | 'insidertrading' | 'treason';
export interface Case {
  id: Id; suspect: Id; kind: CrimeKind; region: Id; nation: Id; evidence: number; opened: number;
  status: 'open' | 'closed'; detective: Id | null; loot: number; outcome?: string; syndicate?: Id | null;
  innocent?: boolean; plea?: boolean; appealed?: boolean; fine?: number; closedAt?: number; judge?: Id | null; // courts (1.7)
}
export interface Syndicate {
  id: Id; name: string; nation: Id; style: string; boss: Id | null; members: Id[]; turf: Id[]; home: Id;
  wallet: Wallet; inv: Inventory; strength: number; heat: number; founded: number;
  rackets: Record<Id, number>; // company id -> daily protection fee (minor units)
  feuds: Id[]; // rival syndicates at war
  income: number[]; // daily income history
}
export interface Agency {
  name: string; budget: number; // share of daily revenue funding the service
  network: Record<Id, number>; // penetration of each foreign nation 0..100
  counter: number; // counter-intelligence 0..100
  dossiers: Record<Id, { t: number; lines: string[] }>;
  milIntel: Record<Id, number>; // foreign order of battle known until this time
  focus: Id[]; // nations the service prioritises
  opsRun: number; caught: number; exposed: number;
  org?: import('./intelOrg').ServiceOrg; // directorates, budget split and lessons (2.1)
}
export type OpKind = 'intel' | 'sabotage' | 'theft' | 'unrest' | 'propaganda' | 'scandal' | 'recruit' | 'counter' | 'milintel' | 'milsabotage' | 'cyber' | 'election';
export interface SpyOp {
  id: Id; nation: Id; target: Id; region: Id | null; kind: OpKind; agent: Id | null; subject?: Id | null;
  start: number; ends: number; status: 'active' | 'success' | 'failed' | 'exposed'; result?: string;
  formation?: Id | null; // target of military sabotage
}
export type CrisisKind = 'hurricane' | 'earthquake' | 'flood' | 'wildfire' | 'blizzard' | 'drought' | 'heatwave' | 'eruption' | 'tsunami' | 'epidemic' | 'strike' | 'protest' | 'riot' | 'boom' | 'shock';
export interface Crisis {
  id: Id; kind: CrisisKind; name: string; regions: Id[]; nation: Id | null; start: number; end: number; severity: number;
  status: 'active' | 'over'; relief: number; // money spent on relief
  company?: Id; item?: string; mult?: number; lockdown?: Id[]; deaths?: number;
  infectedAt?: Record<Id, number>; recovered?: Id[]; // epidemics
}
export interface EconState {
  cycle: number; // -1 (deep recession) .. 1 (boom)
  trend: number;
  phase: 'boom' | 'expansion' | 'slowdown' | 'recession';
  hist: number[];
  commodity: Record<string, number>; // world supply multipliers for raw goods
  harvest?: number; // the big grain exporters' harvest against normal (1.9)
  world?: Record<string, { p: number; hist: number[] }>; // world commodity prices (gold per unit) and their last 60 days
  superCycle?: Record<string, { phase: number; period: number }>; // commodity super-cycles (2.5)
  fear?: number; // panic after a crash, 0..1 (2.5)
}

export interface DayRecord {
  day: number;
  produced: number;
  consumed: number;
  sold: number;
  revenue: number;
  wages: number;
  inputCost: number;
  overheads?: number; // rent for premises and energy (1.4.7)
  tax?: number; // corporate tax paid (on the first of the month)
  profit: number;
  note?: string;
}

export interface JobOffer { wage: number; slots: number; minEco: number }

export interface Company {
  id: Id;
  name: string;
  industry: Industry;
  q: number;
  region: Id;
  owner: AccountRef;
  wallet: Wallet;
  inv: Inventory;
  workers: Id[];
  offer: JobOffer | null;
  prices: Record<ItemKey, number>; // owner's asking price per output key (minor units of market currency)
  frac: number; // fractional production carried over
  founded: number;
  moveCooldown: number;
  forSale: number | null; // asking price in gold minor units on the company market
  hist: DayRecord[];
  today: DayRecord;
  evade?: number; // share of corporate tax the owner hides (1.7)
  evaded?: number; // tax hidden and not yet found
  lifetime: { produced: number; revenue: number; wages: number; profit: number };
  ownerHist: { t: number; owner: AccountRef; price?: number }[];
  family?: { name: string; gen: number; since: number }; // a family firm handed down (3.0)
  shortage: string | null; // reason production last failed
  auto: { sell: boolean; buyInputs: boolean; hire: boolean }; // owner automation (AI owners enable all)
  state?: boolean; // state-owned (socialism)
  halt?: { until: number; why: string }; // production stopped (strike, vandalism, sabotage)
  machines?: number; // machines doing workers' share of the output (automation, 2.4)
  locked?: Id; // held in escrow by an open contract
}

export interface Listing { id: Id; market: Id; item: ItemKey; qty: number; price: number; seller: AccountRef; created: number }

export interface FxOrder {
  id: Id;
  cur: AssetId;
  /** 'sellCur': maker offers currency and wants gold. 'sellGold': maker offers gold and wants currency. */
  side: 'sellCur' | 'sellGold';
  amount: number; // remaining escrowed amount of the offered asset
  rate: number; // currency minor units per 1 whole gold
  maker: AccountRef;
  created: number;
}

export interface TradeStat { day: number; qty: number; value: number; lo: number; hi: number }

export interface Region {
  id: Id;
  name: string;
  x: number; // label point on the Earth map (projected map units)
  y: number;
  links: Id[];
  core: Id; // original / rightful nation
  owner: Id; // legal owner
  dmzUntil?: number; // demilitarised after changing hands (2.2)
  identity?: number; // how distinct the region is, 0..100 (2.3)
  indep?: number; // support for independence, % (2.3)
  indepMovement?: number; // when an independence movement formed (2.3)
  lastReferendum?: number;
  occ: { nation: Id; war: Id; since?: number } | null; // provisional occupier (since when: 2.2)
  terrain: Terrain;
  res: Partial<Record<RawRes, number>>; // richness 1..3
  pop: number; // background population
  prodWindow: number[]; // pollution weight per day, rolling
  pollution: number; // 0..1
  bld: Record<BuildingType, number>;
  project: Id | null;
  depot?: number;
  supplied: boolean;
  crime: number; // 0..100 crime rate
  police: number; // 0..100 effective policing
  unrest: number; // 0..100 public unrest
  news?: { t: number; text: string }[]; // local happenings, newest last (kept short)
  disrupted: number; // production disrupted until this time (disasters, riots, sabotage)
  blackout?: number; // the day of the last power cut (1.9)
  cyberDown?: number; // a hacked grid stays down until then (2.4)
  pop0?: number; // background population at genesis
  draw?: number; // how attractive the region is to live in, -1..1, smoothed (sim/population.ts)
  blockade: Id | null; // nation whose navy blockades this coast
  staff?: { school: number; clinic: number; offices: number; courts?: number; prison?: number; emergency?: number; meteorology?: number; diplomacy?: number; trade?: number; intl?: number; research?: number };
  housePx?: number; // housing price index, 0.5..2.5, drifts slowly (sim/housing.ts) // public-service staffing 0..1 (sim/services.ts)
}

export interface Relation { score: number; hist: { t: number; delta: number; why: string }[] }

export interface Nation {
  id: Id;
  name: string;
  adj: string;
  color: string;
  cur: AssetId;
  iso: string; // ISO 3166 numeric code of the real country
  leader: string; // display title of the head of government
  legislature: string; // display name of congress
  capital: Id; // rightful capital region
  wallet: Wallet; // treasury
  inv: Inventory; // national storage
  taxes: { work: number; vat: number; import: number }; // percent (work: income tax on a typical wage; progressive)
  taxNorm?: number; // income tax + VAT people are used to (opinion reacts to changes from it)
  debt?: number; // public debt (minor units of the national currency)
  debtIssued?: number; // bonds issued in total (statistics)
  interestPaid?: number; // interest paid on the debt in total
  trade?: { exp: number; imp: number; hist: { exp: number; imp: number }[] }; // exports and imports today and the last 30 days (gold minor)
  stats2?: import('./statistics').NationalStats; // official statistics (1.4.10)
  policyRate?: number; // the central bank's policy rate (%)
  caps?: import('./strategic').Capabilities; // capability stocks and growth (1.6)
  budgetExtra?: { health: number; research: number; infrastructure: number }; // budget lines beyond the existing services (1.6)
  welfare?: number; // welfare share of revenue (scales transfers to households)
  infraBonus?: number; healthBonus?: number; // built up by public investment (strategic engine)
  strategy?: { kind: import('./nationalBudget').Strategy; since: number; why: string };
  powerHist?: import('./worldHistory').PowerPoint[]; // power index each month
  policing?: import('./policing').Policing; // trust, clearance, investigations (1.7)
  courts?: import('./courts').CourtStats; // trials, pleas, appeals and exonerations (1.7)
  prison?: import('./prisons').PrisonSystem; // the national prison system (1.7)
  chronicle?: { t: number; text: string }[]; // the nation's history (strategy changes and other turning points)
  minWage: number; // minor units
  president: Id | null;
  cabinet: Partial<Record<Ministry, Id>>;
  deputies: Id[];
  seats: Record<Id, number>; // partyId -> seats
  congressSize: number;
  relations: Record<Id, Relation>;
  ties?: Record<Id, import('./relations').Ties>; // what the relation is made of (2.0)
  relInit?: boolean;
  renounced?: Record<Id, number>; // when this country last renounced a treaty with another (2.0)
  dip?: import('./diplomacyActions').DipState; // diplomatic capital, recent actions, causes for war (2.0)
  summits?: Record<Id, number>;
  imfRelief?: boolean;
  parent?: Id; // the country it left (2.3)
  faction?: boolean; // a rebel government fighting a civil war (2.3)
  dissolved?: number; // when it ceased to exist (absorbed by another country) (2.3)
  mergedInto?: Id; // the country that absorbed it (2.3)
  failedSince?: number; // a failed state since then (2.3)
  techs?: Record<string, number>; // technologies it has, and when it got them (2.4)
  cyberLast?: number; // when its cyber command last attacked (2.4)
  space?: import('./space').SpaceState; // its space agency and satellites (2.4)
  automated?: number; // the share of routine work machines do so far (2.4)
  displaced?: number; // workers replaced by machines, in total (2.4)
  backlash?: number; // public anger at job losses to automation, 0..100 (2.4)
  robotTax?: number; // since when automation is taxed (2.4)
  credit?: import('./sovereign').Credit; // its credit rating and defaults (2.5)
  cbIndependence?: number; // how independent its central bank is, 0..1 (2.5)
  defaultedAt?: number; // its last sovereign default (2.5)
  stocks?: import('./markets').Stocks; // its stock market (2.5)
  peg?: { to: number; ratio: number } | null; // a currency peg (null: none, or broken) (2.5)
  fxCrisis?: number; // its last currency crisis (2.5)
  reserveShare?: number; // share of world reserves held in its currency (2.5)
  fossil0?: number; // the fossil share of its energy mix at the start (2.5)
  climateMigrants?: number; // people who left its hottest regions for cooler ones (2.5)
  soft?: number; // soft power, 0..100 (2.5)
  pride?: number; division?: number; // national pride and how divided the country is, 0..100 (2.9)
  demo?: import('./demography').Demography; // fertility, ageing, migration and population (2.5)
  mh?: import('./mentalHealth').NationMH; // mental health care: access, stigma, a national programme (2.6)
  tobacco?: number; // tobacco duty against 2025 (2.6)
  hosted?: number; // Olympics and World Expos hosted (2.5)
  lastCoup?: { t: number; ok: boolean; leader: Id }; // the latest coup attempt (2.3)
  armedBy?: Record<Id, number>; // foreign sponsors that sent it arms, and how often (2.3)
  overlord?: Id; // the power it answers to, if it is a puppet state (2.3)
  insurgency?: number; // armed resistance against the government, 0..100 (2.3)
  founded?: number; // when it became independent (2.3)
  recognisedBy?: Id[]; // the countries that recognise it (2.3)
  regime?: import('./regimes').Regime;
  coupProof?: number; // purges and loyal guards against a coup, 0..1 (2.3)
  protest?: number; // the strength of the protest movement, 0..100 (2.3) // the rules of its politics, and their legitimacy (2.3)
  mobilised?: number; // when it mobilised for its current war (2.2)
  warBonds?: number; // war bonds sold to its people (2.2)
  interference?: { by: Id; party: Id; until: number }; // a foreign campaign backing a party in the coming election (2.1)
  beliefs?: Record<Id, import('./beliefs').Estimate>; // what the government believes about each other country (2.1)
  alignment?: { towards: Id; choice: 'balance' | 'bandwagon'; since: number }; // facing a far stronger threat (2.0) // under an IMF programme (2.0) // when its leader last met the other's (2.0)
  alliances: Id[];
  embargoes: Id[];
  pacts: Record<Id, number>; // nationId -> non-aggression until time
  exile: boolean;
  approval: number; // 0..100 government approval
  printed: number;
  warheads: { region: Id; count: number }[];
  nukeProd: { region: Id; done: number } | null;
  intel: number;
  priorities: { battle: Id | null; side: 'a' | 'd' | null; project: Id | null };
  termStart: number;
  stats: { revenue: number; spending: number; revToday: number; spendToday: number; revHist: number[]; spendHist: number[] };
  aiPlan: { lastWarCheck: number; lastBuild: number };
  recruitGoal: number;
  fxAnchor: number; // central-bank reference rate (currency minor per gold)
  requests: { cit: Id; t: number }[]; // pending citizenship applications
  propCount: Record<Id, number>; // proposals authored this mandate, per deputy
  warScore: number; // recent military performance (-100..100), feeds voters
  unemployment: number; // share of citizens without a job (0..1)
  procure: Record<ItemKey, number>; // government demand not met by the market (signals producers)
  warMood: number; // public appetite for war shaped by the press (-5..5)
  agency: Agency; // intelligence service
  policeFunding: number;
  eduFunding?: number; // share of daily revenue for schools and universities (sim/education.ts)
  eduQ?: number; // quality of public education, 0..100, follows funding slowly
  defense: { budget: number; chief: Id | null; unpaid: number; appointed?: boolean; split?: import('./arsenal').DefenceSplit; upkeepK?: number; month?: { procurement: number; rd: number; days: number }; doctrine?: import('./forceStructure').Doctrine; conscription?: boolean; exercised?: Partial<Record<Branch, number>> };
  strategic?: import('./forceStructure').Strategic; // nuclear forces, doctrine and missile defence (1.8)
  programmes?: import('./defenceIndustry').Programme[]; // defence R&D programmes (1.8)
  armsOrders?: import('./defenceIndustry').ArmsOrder[]; // equipment bought abroad (1.8)
  arsenal?: import('./arsenal').Arsenal;
  energy?: import('./energy').EnergyState;
  food?: import('./food').FoodState; // harvest, imports and hunger (1.9) // energy mix, fuel self-sufficiency, reserves (1.9) // equipment by class: generation and age (1.8) // appointed: chosen by the Commander-in-Chief // military budget (share of revenue), chief of staff, days unpaid
  alert: number; // national security alert 1 (normal) .. 5 (maximum) // share of daily revenue for national police (regions without their own government, federal crimes)
}

export interface Households { nation: Id; wallet: Wallet; inv: Inventory; pop: number; unmet: number; unmetBy?: Record<string, number> }

export interface Party {
  id: Id;
  nation: Id;
  name: string;
  ideo: Ideology;
  color: string;
  leader: Id;
  members: Id[];
  list: Id[]; // congress priority list
  nominee: Id | null;
  founded: number;
  support: number; // rolling public support 0..100
  coalition: Id | null; // party it backs for president when not nominating
}

export interface Ballot { cand: Id; votes: number; party?: Id }
export interface Election {
  id: Id;
  nation: Id;
  kind: 'president' | 'congress' | 'party';
  party?: Id;
  at: number;
  regClose: number;
  candidates: Id[];
  done: boolean;
  playerVote?: Id; // candidate (president/party) or party id (congress)
  result?: {
    turnout: number;
    electorate: number;
    tallies: Ballot[];
    seats?: Record<Id, number>;
    winners: Id[];
    explain: string[];
  };
}

export type ProposalType =
  | 'workTax' | 'vat' | 'importTax' | 'minWage' | 'print' | 'war' | 'peace' | 'embargo' | 'liftEmbargo'
  | 'alliance' | 'breakAlliance' | 'impeach' | 'newElection' | 'citizenship' | 'nuke' | 'budget';

export interface Proposal {
  id: Id;
  nation: Id;
  type: ProposalType;
  params: Record<string, any>;
  author: Id;
  created: number;
  closes: number;
  votes: Record<Id, 'y' | 'n'>;
  status: 'open' | 'passed' | 'failed';
  effect: string;
  cost: number;
  fullTerm: boolean;
  enactedAt?: number;
}

export interface Project { id: Id; region: Id; nation: Id; type: BuildingType; level: number; points: number; needPts: number; mats: Inventory; needMats: Inventory; contrib: Record<Id, number>; started: number; done?: number; cancelled?: boolean }

export interface RoundResult { a: number; d: number; ptsA: number; ptsD: number; winner: 'a' | 'd'; hero: Id | null }
export interface Battle {
  id: Id;
  kind: 'war' | 'event' | 'tournament' | 'training';
  war: Id | null;
  region: Id;
  att: Id; // nation id or faction id (negative for event factions)
  def: Id;
  airOnly: boolean;
  started: number;
  roundStart: number;
  round: number;
  pts: { a: number; d: number };
  dmg: { a: number; d: number };
  wins: { a: number; d: number };
  rounds: RoundResult[];
  cur: Record<Id, { a: number; d: number }>; // current round contributions
  total: Record<Id, { a: number; d: number }>;
  hits: { a: number; d: number };
  ticks: ('a' | 'd')[]; // scoring-tick winners in the current round
  weaponsUsed: { a: number; d: number };
  done: boolean;
  winner: 'a' | 'd' | null;
  ended?: number;
  eventRef?: Id;
  forceDmg?: { a: number; d: number }; // damage dealt by standing formations
  prevDmg?: { a: number; d: number }; // damage totals at the previous tick (for attrition)
}

export interface War {
  id: Id;
  toll?: import('./warHome').WarToll; // killed, wounded, captured, refugees, money spent (2.2)
  surprise?: boolean; // the defender's intelligence did not see it coming (2.1)
  intelGap?: { believed: number; truth: number }; // the attacker's estimate of the defender's strength, and the truth
  att: Id;
  def: Id;
  declared: number;
  deadline: number;
  goals: Id[];
  quota: number;
  occupied: Id[]; // regions currently occupied by the attacker under this war
  counter: Id[]; // attacker regions occupied by the defender
  maxOcc: number;
  status: 'active' | 'ended' | 'frozen';
  outcome?: string;
  kind?: import('./warCourse').WarKind; // invasion, limited or punitive (2.2)
  exhaust?: Record<Id, number>; // each side's war exhaustion, 0..100 (2.2)
  level?: number; // escalation: 1 border fighting .. 4 nuclear threats (2.2)
  extensions?: number; // times the deadline passed with both sides still fighting (2.2)
  frozen?: number; // when it froze along the front line (2.2)
  peacekeepers?: { until: number; by: Id[] }; // a UN force holding the line (2.3)
  joined?: Id; // a war joined under an offensive alliance: the partner's war it joined (3.0.1)
  civilDone?: boolean; // a civil war whose outcome (crushed, rebel victory, partition) has been settled (2.3)
  log?: { t: number; text: string }[]; // escalations and reviews (2.2)
  reparations?: { from: Id; to: Id; amount: number }; // (2.2)
  battles: Id[];
  offers: PeaceOffer[];
  chronicle?: WarChronicle; // why it started, what happened, why it ended (wars from before 1.3.4 have none)
}

/** The war chronicle (sim/warChronicle.ts): written as the war happens and kept afterwards. */
export interface WarChronicle {
  cause?: WarCause;
  events: WarEvent[];
  battles: Record<Id, WarBattleRecord>;
  home: Record<Id, { approval: number; mood: number }>; // last home-front readings noted, per side
  ending?: WarEnding;
}
/** One consideration behind the decision: weight > 0 pushed toward war, < 0 held it back. */
export interface WarFactor { label: string; detail: string; weight: number }
export interface WarCause {
  summary: string;
  by: { id: Id; name: string; role: string; party: string | null } | null; // who proposed it
  vote: { yes: number; no: number; eligible: number; parties: { name: string; yes: number; no: number }[] } | null;
  factors: WarFactor[];
  aims: string[];
  defender: string[]; // how the other side saw it
  snapshot: { power: [number, number]; relation: number; approval: [number, number]; mood: [number, number]; regions: [number, number] };
}
export interface WarEvent { t: number; icon: string; text: string; side?: 'att' | 'def'; region?: Id; battle?: Id }
export interface WarBattleRecord {
  region: Id; att: Id; def: Id; started: number; airOnly: boolean; amphibious: boolean;
  ended?: number; winner?: Id | null; rounds?: [number, number]; damage?: [number, number]; fighters?: [number, number];
  heroes?: { id: Id; name: string; nation: Id; dmg: number }[]; formations?: [string[], string[]]; result?: string;
}
export interface WarEnding { t: number; kind: string; headline: string; why: string[]; terms: string[]; aftermath: string[]; winner: Id | null }

export interface PeaceOffer { id: Id; from: Id; kind: 'armistice' | 'surrender' | 'demand' | 'trade'; give?: Id; take?: Id; t: number; status: 'open' | 'accepted' | 'rejected' }

export interface Squad { spec: string; members: Id[]; level: number }
export interface Unit {
  id: Id;
  nation: Id;
  name: string;
  commander: Id;
  officers: Id[];
  squads: Squad[];
  doctrine: 'conserve' | 'steady' | 'surge';
  order: { battle: Id; side: 'a' | 'd' } | null;
  wallet: Wallet;
  inv: Inventory;
  founded: number;
  battlesFought: number;
}

export interface Gear { id: Id; slot: GearSlot; rarity: number; family: GearFamily; stats: Record<string, number>; owner: AccountRef | null; name: string }

export interface Holding {
  id: Id;
  name: string;
  nation: Id;
  founder: Id;
  ceo: Id;
  roles: { vice?: Id; accountant?: Id; manager?: Id; salesman?: Id };
  shares: Record<Id, number>;
  total: number;
  wallet: Wallet;
  inv: Inventory;
  issuePrice: number;
  public: boolean;
  founded: number;
  votes: { id: Id; kind: 'ceo'; target: Id; votes: Record<Id, 'y' | 'n'>; closes: number; done?: boolean }[];
  divHist: { t: number; total: number }[];
  insiderBuys?: { cit: Id; t: number; qty: number }[]; // purchases by insiders, reviewed when they move the price (1.7)
  valuation: number;
}

export interface ShareOrder { id: Id; holding: Id; seller: AccountRef; qty: number; price: number; created: number }
export interface ShareTrade { t: number; holding: Id; qty: number; price: number }

export interface Consideration { money: Wallet; items: Inventory; companies: Id[]; papers: Id[]; gear: Id[]; shares: { holding: Id; qty: number }[] }
export interface Contract { id: Id; from: Id; to: Id; give: Consideration; want: Consideration; fee: number; status: 'open' | 'accepted' | 'rejected' | 'cancelled' | 'expired'; created: number; expires: number; note: string; resolved?: number }

export interface Auction { id: Id; seller: Id; gear: Id | null; item: { key: ItemKey; qty: number } | null; start: number; end: number; minBid: number; bid: { by: Id; amount: number } | null; status: 'open' | 'sold' | 'unsold'; fee: number; bids: number }

export interface Newspaper { id: Id; name: string; owner: AccountRef; nation: Id; subs: Id[]; bgSubs: number; founded: number; revenue: number; articles: number; locked?: Id }
export interface Article {
  id: Id;
  paper: Id;
  author: Id;
  t: number;
  topic: 'politics' | 'war' | 'economy' | 'guide' | 'social';
  stance: string;
  title: string;
  text: string;
  readers: number;
  votes: number;
  comments: { by: Id; text: string }[];
  effect: string;
}

export interface Msg {
  id: Id;
  t: number;
  from: Id | null;
  subject: string;
  body: string;
  kind: 'system' | 'npc' | 'gov' | 'party' | 'unit' | 'diplomacy' | 'contract' | 'job';
  options?: { id: string; label: string }[];
  resolved?: string;
  payload?: Record<string, any>;
  read?: boolean;
}

export interface WorldEvent { t: number; type: string; text: string; nation?: Id; region?: Id; cit?: Id; important?: boolean; player?: boolean }

export interface Notice { id: Id; t: number; text: string; cat: string; critical: boolean; read?: boolean; link?: string }

export interface QuestDef { id: string; branch?: string; text: string; target: number; metric: string }
export interface QuestState { id: string; text: string; metric: string; target: number; base: number; done: boolean; claimed: boolean; reward: { gold?: number; rep?: number; items?: Inventory; prestige?: number } }

export interface Tournament {
  id: Id;
  name: string;
  format: 'solo' | 'teams' | 'squad';
  regOpen: number;
  start: number;
  fee: number;
  cap: number;
  minPower: number; // minimum training power to enter
  terrain: Terrain;
  entrants: Id[];
  bracket: { round: number; a: Id[]; b: Id[]; dmgA: number; dmgB: number; winner: 'a' | 'b' | null }[];
  status: 'upcoming' | 'live' | 'finished';
  prize: number;
  podium: Id[];
  hostedBy?: Id;
  escrow: number; // gold held from entry fees and host funding
  sponsored?: boolean;
}

export interface GameEvent { id: Id; kind: 'pirates'; start: number; end: number; ships: { id: Id; name: string; holder: Id | null; battle: Id | null; defenders: number; depot: number }[]; status: 'active' | 'ended' }

export interface Nuke { id: Id; from: Id; target: Id; launched: number; arrives: number; status: 'flying' | 'hit' | 'intercepted' }

export interface ScheduledEvent { at: number; seq: number; type: string; p: Record<string, any> }

export interface Settings {
  speed: number;
  paused: boolean;
  monthLen: number;
  difficulty: 'easy' | 'normal' | 'hard';
  pauseOn: Record<string, boolean>;
  autoTrain: boolean;
  advanced: { nuclear: boolean; pirates: boolean; terrainEvents: boolean; tournaments: boolean };
  citizensPerRegion: number; // AI citizens living in an average region (populous regions get up to twice as many)
  balance: Record<string, any>;
  notifyFilter: Record<string, boolean>;
  adminUsed?: boolean; // the admin panel changed this campaign
  clock24?: boolean; // show times on a 24-hour clock
  advanceStops?: 'personal' | 'all'; // what interrupts a long advance (default: personal matters only)
  uiSound?: boolean; uiVolume?: number; // optional interface sound (ui/sound.ts)
  playerMortality?: boolean; // the player can die (and play continues as their heir); off for saves from before 1.3.18
  startAge?: number;
  character?: { look: import('./looks').Look; birthplace: Id | null; ideology: Ideology | null; nature?: import('./nature').Nature; background?: import('./nature').Background; traits?: Citizen['traits'] }; // designed at the start (ui/CharacterDesigner.tsx) // the player's age at the start (0 = born into the world; default 24)
  historyPace?: number; // strategic months per calendar month (1 = real time; 1.6)
  lifeYearDays?: number; // pace of life: world days per year of age (undefined = 365, for older saves)
  scenario?: import('./almanac').Scenario; // the starting world (2.5)
  fixedFate?: boolean; // reproducible: never mix outside randomness into the world's dice (see ui/store.ts)
}

export interface Stats {
  supply: Record<AssetId, number>; // minted - burned per asset
  minted: Record<string, number>; // by reason, per asset: `${asset}|${reason}`
  burned: Record<string, number>;
  items: Record<ItemKey, number>; // produced - consumed
  itemFlows: Record<string, number>;
}

export interface PlayerState {
  tutorial: number;
  tutorialDone: boolean;
  dailies: QuestState[];
  dailyDay: number;
  campaigns: Record<string, { idx: number; base: number }>;
  prestige: number;
  seasonClaimed: number[];
  season: number;
  counters: Record<string, number>;
  achievements: Record<string, number>;
  watch: Id | null; // battle being watched
  following: Id[];
  convo?: Convo | null; // conversation in progress
  talked?: Record<Id, number>; // day the player last talked with each person
  lastRally?: number; // day of the player's last rally
  lastCanvass?: number; // day of the player's last canvassing round
  routine?: Routine;
}

/** A conversation with an NPC: what has been said and what the player can say next. */
export interface Convo {
  npc: Id;
  lines: { who: 'npc' | 'you' | 'note'; text: string }[];
  choices: { id: string; label: string; why?: string }[];
  used: string[]; // topics already raised
}


/** Head of a state/provincial government: a full citizen (cit) or a generated official. */
export interface StateHead { name: string; ideo: Ideology; cit: Id | null; since: number }
export interface StateCandidate { name: string; ideo: Ideology; cit: Id | null; campaign: number; votes?: number }

/** A region's own government (US state, Canadian province, German Land, Russian oblast, …). */
export interface StateGov {
  region: Id;
  wallet: Wallet; // treasury, in the owning nation's currency
  inv: Inventory;
  cur: AssetId;
  head: StateHead;
  seats: Partial<Record<Ideology, number>>; // legislature composition
  size: number; // legislature seats
  lean: Record<Ideology, number>; // electorate's ideological leaning (sums to 1)
  tax: number; // state wage tax, % on shifts worked in the region
  budget: { welfare: number; infra: number; business: number; police: number }; // shares of daily spending
  spendRate: number; // share of the treasury spent each day
  policeSpend: number; // yesterday's police spending (drives police strength)
  dev: number; // infrastructure level 0–5 (production bonus)
  devPts: number;
  approval: number;
  nextElection: number; // election (elected) or term review (appointed)
  candidates: StateCandidate[];
  voted: Id[]; // full citizens who voted this cycle
  last?: { at: number; turnout: number; results: { name: string; ideo: Ideology; votes: number }[] };
  lastTaxChange: number;
  stats: { revToday: number; spendToday: number; revHist: number[]; spendHist: number[] };
}

export interface World {
  version: number;
  seed: number;
  rng: number;
  time: number; // minutes since start of day 0
  nextId: number;
  seq: number;
  settings: Settings;
  playerId: Id;
  player: PlayerState;
  treaties?: Record<Id, import('./treaties').Treaty>;
  intl?: import('./intlOrgs').IntlState;
  newStates?: import('./secession').NewState[]; // states born in play (2.3)
  orbit?: { debris: number; cascades: number }; // debris in low orbit, 0..100 (2.4)
  almanac?: import('./almanac').Almanac; // the record of the campaign: leaders and yearly statistics (2.5)
  scenarioApplied?: boolean; // the start scenario has been applied (2.5)
  dynasty?: import('./dynasty').Dynasty; // the family the player's lives belong to: generations and chronicle (3.0)
  mhSeeded?: boolean; // mental health as it stands at the start has been set (2.6)
  rumours?: import('./gossip').Rumour[]; nextRumour?: number; // what people are saying about each other (2.7)
  habitsSeeded?: number; // citizens below this id have been given the habits of people like them (2.6)
  games?: import('./softPower').GamesEvent[]; // Olympics and World Expos, held and planned (2.5)
  climate?: import('./climate').ClimateState; // global temperature, emissions and sea level (2.5)
  cyber?: import('./cyber').CyberIncident[]; // recent cyber attacks, as their victims understand them (2.4)
  patents?: import('./technology').Patent[]; // breakthroughs, who holds them and what they earned (2.4)
  techFirsts?: Record<string, import('./technology').TechFirst>; // who achieved each technology first, and when (2.4)
  standoffs?: import('./crises').Crisis[]; // international crises short of war (2.0)
  armsRaces?: import('./balanceOfPower').ArmsRace[]; // rival pairs building up against each other (2.0)
  bop?: import('./balanceOfPower').BopPoint[]; // shares of world power, monthly (2.0) // the UN, G20, WTO and IMF (2.0)
  intlLoans?: import('./diplomacyActions').IntlLoan[];
  defections?: { id: Id; t: number; cit: Id; from: Id; to: Id; what: string }[]; // officials who crossed over (2.1) // loans between governments (2.0) // alliances, pacts, trade and other agreements (2.0)
  opec?: { quota: number; hist: number[] }; // OPEC+ output against normal (1.9)
  warnings?: import('./naturalHazards').Warning[]; // hazards forecast to strike within a day (1.9)
  weather?: import('./weather').WeatherState; // today's and tomorrow's weather by region (1.9)
  story: NarrativeState; // stories, journal, relationship memories, places (see sim/story.ts)
  life: LifeState; // life simulation: reviews, long advances (see sim/lifecycle.ts)
  regions: Region[];
  govs: (StateGov | null)[]; // indexed by region id; null where there is no regional government
  syndicates: Record<Id, Syndicate>;
  cases: Record<Id, Case>;
  ops: Record<Id, SpyOp>;
  crises: Record<Id, Crisis>;
  econ: EconState;
  forces: Record<Id, Formation>;
  navalLog: { t: number; zone: string; text: string }[];
  nations: Nation[];
  households: Households[];
  citizens: Record<Id, Citizen>;
  yearReports?: import('./worldHistory').YearReport[]; // the State of the World, one a year
  companies: Record<Id, Company>;
  listings: Record<Id, Listing>;
  fx: Record<Id, FxOrder>;
  fxTrades: Record<AssetId, { t: number; rate: number; gold: number }[]>;
  trades: Record<string, TradeStat[]>; // `${market}|${item}` daily stats
  lastPrice: Record<string, number>;
  parties: Record<Id, Party>;
  elections: Record<Id, Election>;
  proposals: Record<Id, Proposal>;
  projects: Record<Id, Project>;
  wars: Record<Id, War>;
  battles: Record<Id, Battle>;
  units: Record<Id, Unit>;
  gear: Record<Id, Gear>;
  holdings: Record<Id, Holding>;
  shareOrders: Record<Id, ShareOrder>;
  shareTrades: ShareTrade[];
  contracts: Record<Id, Contract>;
  auctions: Record<Id, Auction>;
  papers: Record<Id, Newspaper>;
  articles: Record<Id, Article>;
  tournaments: Record<Id, Tournament>;
  events: Record<Id, GameEvent>;
  nukes: Record<Id, Nuke>;
  inbox: Msg[];
  log: WorldEvent[];
  chapters: { title: string; from: number; to: number; text: string[] }[];
  notices: Notice[];
  queue: ScheduledEvent[];
  stats: Stats;
  ledger: { t: number; text: string; amount: number; asset: AssetId; ref: string }[]; // player's transaction history
  budget?: import('../engine/budget').BudgetMonth[];
  loans?: Record<Id, import('./loans').Loan>;
  trusts?: import('./legacy').Trust[]; // money held for children until they come of age
  legacy?: import('./legacy').LegacyEntry[]; // the player's past lives // mortgages, student and personal loans (sim/loans.ts) // the player's money by category and month (engine/budget.ts)
  calendar: { nextDaily: number; terrainDone?: Id[]; baseCitizens?: number; basePop?: number };
}

// ---------- narrative (sim/story.ts, data/stories) ----------

export type StoryStatus = 'offered' | 'active' | 'waiting' | 'completed' | 'declined' | 'expired' | 'invalidated';
/** A running story: which definition, who and what it is about, where it stands and what was decided. */
export interface StoryInstance {
  id: Id;
  def: string; // stable definition id, e.g. 'chain.wage.dispute'
  ver: number; // content version the instance started with
  bind: Record<string, number | string>; // role -> entity id (citizens, companies, crises, cases…) or a string key
  data: Record<string, number | string>; // small story-local values fixed when bound or decided
  key: string; // source identity; the same source never starts the same story twice
  status: StoryStatus;
  stage: string;
  stageAt: number; // when the current stage began
  created: number;
  updated: number;
  deadline?: number; // current stage expires at
  waitUntil?: number; // waiting stages resume at
  waitWhy?: string;
  msg?: Id; // linked inbox message (legacy decision)
  who?: Id; // the protagonist (the player when it began); only they can act in it
  decisions: { t: number; stage: string; choice: string; label: string; outcome: string }[];
  ending?: string;
}
export interface JournalEntry { id: Id; t: number; story?: Id; title: string; text: string; kind: 'lead' | 'outcome' | 'note' | 'promise' | 'fact'; npc?: Id }
/** Why someone feels the way they do about you. */
export interface Memory { t: number; text: string; delta: number; visibility: 'private' | 'witnessed' | 'public'; story?: Id; about?: Id } // about: whom the memory concerns (the player at the time)
/** A pet: a real companion with an owner, upkeep and a life of its own. */
export interface Pet { id: Id; name: string; kind: string; born: number; owner: Id; health: number; bond: number; lastCare: number; gone?: { t: number; why: 'died' | 'rehomed' } }

export interface NarrativeState {
  instances: Record<Id, StoryInstance>;
  claims: Record<string, number>; // source keys already used (time claimed)
  cooldowns: Record<string, number>; // definition id -> earliest next offer
  journal: JournalEntry[];
  memories: Record<Id, Memory[]>; // NPC id -> what they remember about the player
  nextAmbient: number; // earliest time for the next everyday situation
  settings: { frequency: 'off' | 'rare' | 'normal' | 'frequent' };
  local: { familiarity: Record<Id, number>; discovered: Record<string, number>; district: string | null; venue: string | null; region: Id | null; lastExplore?: number; done?: Record<string, number> }; // done: daily venue activities (key -> day)
  appointments: { id: Id; npc: Id; at: number; venue: string; region: Id; story?: Id; what: string; reminded?: boolean }[];
}
