// Core data model. The whole game is one serialisable `World` object: every
// entity lives in it, keyed by numeric id, so saves are a JSON snapshot.

export type Id = number;
/** 'GOLD' or a national currency code. Amounts are integers in minor units (see engine/money). */
export type AssetId = string;
export type Wallet = Record<AssetId, number>;
/** e.g. 'grain', 'food:3', 'wg:2' (ground weapon), 'wa:1' (air weapon), 'ticket:4', 'sp:medic'. */
export type ItemKey = string;
export type Inventory = Record<ItemKey, number>;

export type RawRes = 'grain' | 'iron' | 'titanium' | 'oil';
export type Product = 'food' | 'wg' | 'wa' | 'ticket';
export type Industry = RawRes | Product;
export type Terrain = 'plains' | 'mountains' | 'forest' | 'desert';
export type Ideology = 'capitalism' | 'nationalism' | 'centralism' | 'socialism' | 'imperialism' | 'communism';
export type BuildingType = 'hospital' | 'fields' | 'industrial' | 'base';
export type Persona = 'worker' | 'merchant' | 'politician' | 'soldier' | 'industrialist' | 'builder' | 'journalist' | 'investor';
export type Attr = 'str' | 'acc' | 'luck' | 'end' | 'lead' | 'eco' | 'cons';
export type Ministry = 'vp' | 'development' | 'defense' | 'economy' | 'labor' | 'pr' | 'recruitment';
export type GearSlot = 'helmet' | 'vest' | 'elbows' | 'gloves' | 'pants' | 'boots';
export type GearFamily = 'combat' | 'construction' | 'mining' | 'plains' | 'mountains' | 'forest' | 'desert';

export type AccountKind = 'cit' | 'co' | 'nat' | 'hh' | 'hold' | 'unit' | 'paper' | 'party';
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
  wallet: Wallet;
  inv: Inventory;
  born: number;
  xp: number;
  level: number;
  attrPts: number;
  attrs: Record<Attr, number>;
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
  flags: Record<string, number>;
}

export interface DayRecord {
  day: number;
  produced: number;
  consumed: number;
  sold: number;
  revenue: number;
  wages: number;
  inputCost: number;
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
  lifetime: { produced: number; revenue: number; wages: number; profit: number };
  ownerHist: { t: number; owner: AccountRef; price?: number }[];
  shortage: string | null; // reason production last failed
  auto: { sell: boolean; buyInputs: boolean; hire: boolean }; // owner automation (AI owners enable all)
  state?: boolean; // state-owned (socialism)
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
  x: number;
  y: number;
  col: number;
  row: number;
  links: Id[];
  core: Id; // original / rightful nation
  owner: Id; // legal owner
  occ: { nation: Id; war: Id } | null; // provisional occupier
  terrain: Terrain;
  res: Partial<Record<RawRes, number>>; // richness 1..3
  pop: number; // background population
  prodWindow: number[]; // pollution weight per day, rolling
  pollution: number; // 0..1
  bld: Record<BuildingType, number>;
  project: Id | null;
  depot?: number;
  supplied: boolean;
}

export interface Relation { score: number; hist: { t: number; delta: number; why: string }[] }

export interface Nation {
  id: Id;
  name: string;
  adj: string;
  color: string;
  cur: AssetId;
  capital: Id; // rightful capital region
  wallet: Wallet; // treasury
  inv: Inventory; // national storage
  taxes: { work: number; vat: number; import: number }; // percent
  minWage: number; // minor units
  president: Id | null;
  cabinet: Partial<Record<Ministry, Id>>;
  deputies: Id[];
  seats: Record<Id, number>; // partyId -> seats
  congressSize: number;
  relations: Record<Id, Relation>;
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
}

export interface Households { nation: Id; wallet: Wallet; inv: Inventory; pop: number; unmet: number }

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
}

export interface War {
  id: Id;
  att: Id;
  def: Id;
  declared: number;
  deadline: number;
  goals: Id[];
  quota: number;
  occupied: Id[]; // regions currently occupied by the attacker under this war
  counter: Id[]; // attacker regions occupied by the defender
  maxOcc: number;
  status: 'active' | 'ended';
  outcome?: string;
  battles: Id[];
  offers: PeaceOffer[];
}

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
export interface QuestState { id: string; text: string; metric: string; target: number; base: number; done: boolean; claimed: boolean; reward: { gold?: number; xp?: number; items?: Inventory; prestige?: number } }

export interface Tournament {
  id: Id;
  name: string;
  format: 'solo' | 'teams' | 'squad';
  regOpen: number;
  start: number;
  fee: number;
  cap: number;
  minLevel: number;
  terrain: Terrain;
  entrants: Id[];
  bracket: { round: number; a: Id[]; b: Id[]; dmgA: number; dmgB: number; winner: 'a' | 'b' | null }[];
  status: 'upcoming' | 'live' | 'finished';
  prize: number;
  podium: Id[];
  hostedBy?: Id;
}

export interface GameEvent { id: Id; kind: 'pirates'; start: number; end: number; ships: { id: Id; name: string; holder: Id | null; battle: Id | null; defenders: number; depot: number }[]; status: 'active' | 'ended' }

export interface Nuke { id: Id; from: Id; target: Id; launched: number; arrives: number; status: 'flying' | 'hit' }

export interface ScheduledEvent { at: number; seq: number; type: string; p: Record<string, any> }

export interface Settings {
  speed: number;
  paused: boolean;
  monthLen: number;
  difficulty: 'easy' | 'normal' | 'hard';
  pauseOn: Record<string, boolean>;
  autoTrain: boolean;
  advanced: { nuclear: boolean; pirates: boolean; terrainEvents: boolean; tournaments: boolean };
  citizensPerNation: number;
  balance: Record<string, any>;
  notifyFilter: Record<string, boolean>;
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
  regions: Region[];
  nations: Nation[];
  households: Households[];
  citizens: Record<Id, Citizen>;
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
  calendar: { nextDaily: number };
}
