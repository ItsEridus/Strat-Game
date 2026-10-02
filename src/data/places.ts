// Districts and venues: the places inside a region where life happens. Each is a
// view of something real (the market is the national order book, a workplace is
// a real company, city hall is the regional government); nothing here produces
// goods or holds money of its own.
export type DistrictId = 'residential' | 'civic' | 'commercial' | 'industrial' | 'transport';

export const DISTRICTS: Record<DistrictId, { name: string; icon: string; desc: string }> = {
  residential: { name: 'Neighbourhood', icon: '🏘️', desc: 'Homes, parks and cafés: where people live, meet friends and unwind.' },
  civic: { name: 'Civic quarter', icon: '🏛️', desc: 'Government offices, party rooms, the police desk and the newsroom.' },
  commercial: { name: 'Downtown', icon: '🏙️', desc: 'Shops, the market, banks and restaurants.' },
  industrial: { name: 'Industrial district', icon: '🏭', desc: 'Workplaces, warehouses and the union hall.' },
  transport: { name: 'Transport hub', icon: '🚉', desc: 'The station, the harbour and the military base: comings and goings.' },
};

export type VenueKind =
  | 'home' | 'park' | 'cafe' | 'community' | 'gym' | 'library' | 'lookout' | 'worship'
  | 'cityhall' | 'parties' | 'police' | 'newsroom' | 'clinic'
  | 'market' | 'restaurant' | 'bank' | 'backroom'
  | 'unionhall' | 'company'
  | 'station' | 'harbour' | 'barracks';

export interface VenueKindInfo {
  district: DistrictId;
  icon: string;
  desc: string;
  /** Always known (essential services are never hidden behind exploration). */
  essential?: boolean;
  /** Familiarity needed to find it (for places that are not essential). */
  minFamiliarity?: number;
  /** Screen with the matching tools, if any. */
  screen?: string;
  names: string[];
}

export const VENUE_KINDS: Record<VenueKind, VenueKindInfo> = {
  home: { district: 'residential', icon: '🏠', desc: 'Where you live. Family time and rest happen here.', essential: true, names: ['Home'] },
  park: { district: 'residential', icon: '🌳', desc: 'Joggers, dog walkers, families and long talks on benches.', essential: true, names: ['Riverside Park', 'Liberty Park', 'Memorial Park', 'Central Park', 'Oak Hill Park', 'Lakeside Gardens', 'Victoria Gardens', 'Founders Park'] },
  cafe: { district: 'residential', icon: '☕', desc: 'The neighbourhood café: gossip, first dates and people you half know.', essential: true, names: ['The Copper Kettle', 'Blue Door Café', 'Corner Grind', 'Daily Bread', 'The Lantern', 'Half Moon Coffee', 'Morning Star', 'The Old Mill Café'] },
  worship: { district: 'residential', icon: '🛐', desc: 'The local place of worship: services, festivals, weddings and funerals. Its congregation is one of your circles if you are devout (Life).', essential: true, screen: 'life', names: ['St Mary\'s', 'Grace Church', 'Central Mosque', 'Sri Ganesha Temple', 'Beth Shalom', 'Lotus Temple'] },
  community: { district: 'residential', icon: '🤝', desc: 'Community centre: volunteers, clubs, meetings and the noticeboard.', minFamiliarity: 5, names: ['Community Centre', 'Neighbourhood Hall', 'Civic Club', 'Commons Hall'] },
  gym: { district: 'residential', icon: '🏋️', desc: 'Weights, a running track and the people who train here every day.', minFamiliarity: 10, screen: 'character', names: ['Ironworks Gym', 'Northside Athletic', 'The Forge', 'Peak Fitness', 'Victory Gym'] },
  library: { district: 'residential', icon: '📚', desc: 'Quiet rooms, study desks and a very helpful librarian.', minFamiliarity: 15, screen: 'library', names: ['Public Library', 'Carnegie Library', 'Municipal Library', 'Reading Rooms'] },
  lookout: { district: 'residential', icon: '🌄', desc: 'A hill above the town that locals keep to themselves. A good place to think.', minFamiliarity: 40, names: ['Signal Hill', 'The Lookout', 'Watchman\'s Rise', 'Sunset Point'] },
  cityhall: { district: 'civic', icon: '🏛️', desc: 'The regional government: officials, petitions and the council chamber.', essential: true, names: ['City Hall', 'Government House', 'The Capitol', 'Civic Centre'] },
  parties: { district: 'civic', icon: '🗳️', desc: 'Party offices and campaign rooms. Evenings are for meetings.', essential: true, screen: 'politics', names: ['Party Row', 'Campaign Offices', 'Assembly Rooms'] },
  police: { district: 'civic', icon: '🚓', desc: 'The police desk: reports, arrests and recruitment.', essential: true, screen: 'crime', names: ['Police Headquarters', 'Central Precinct', 'Police Station'] },
  newsroom: { district: 'civic', icon: '📰', desc: 'Where journalists file stories and chase leads.', minFamiliarity: 10, screen: 'press', names: ['The Newsroom', 'Press House', 'Gazette Building'] },
  clinic: { district: 'civic', icon: '🏥', desc: 'Doctors and nurses; the hospital if the region has one.', essential: true, names: ['General Hospital', 'Community Clinic', 'Health Centre', 'St. Luke\'s Hospital'] },
  market: { district: 'commercial', icon: '🛒', desc: 'Stalls and shops selling from the national market.', essential: true, screen: 'market', names: ['Central Market', 'Market Square', 'The Arcade', 'Old Town Market'] },
  restaurant: { district: 'commercial', icon: '🍽️', desc: 'Dinner, celebrations and business lunches.', essential: true, names: ['Harbour Grill', 'La Piazza', 'The Golden Fork', 'Silver Spoon', 'The Brass Rail', 'Olive & Vine'] },
  bank: { district: 'commercial', icon: '🏦', desc: 'Currency exchange, savings and investments.', essential: true, screen: 'fx', names: ['National Bank', 'Merchants Bank', 'Trust & Savings'] },
  backroom: { district: 'commercial', icon: '🚪', desc: 'A back room behind a pawn shop. People here do not use their real names.', minFamiliarity: 60, screen: 'crime', names: ['The Back Room', 'Pawn & Loan', 'The Cellar'] },
  unionhall: { district: 'industrial', icon: '✊', desc: 'Workers meet here after shifts: pay, conditions and who is hiring.', minFamiliarity: 8, names: ['Union Hall', 'Workers\' Club', 'Trades Hall'] },
  company: { district: 'industrial', icon: '🏭', desc: 'A workplace.', essential: true, screen: 'companies', names: [] },
  station: { district: 'transport', icon: '🚉', desc: 'Trains and buses to the rest of the country; the airport shuttle.', essential: true, screen: 'map', names: ['Central Station', 'Union Station', 'Grand Terminal'] },
  harbour: { district: 'transport', icon: '⚓', desc: 'Docks, ferries and the naval yard.', essential: true, names: ['The Harbour', 'Port Authority Docks', 'Old Quay'] },
  barracks: { district: 'transport', icon: '🎖️', desc: 'The military base and recruiting office.', essential: true, screen: 'forces', names: ['Fort Liberty', 'Camp Meridian', 'Garrison Barracks', 'Naval & Army Base'] },
};

/** How familiarity grows, and what it opens. */
export const FAMILIARITY_UNLOCKS: { at: number; text: string }[] = [
  { at: 5, text: 'the community centre' },
  { at: 10, text: 'the gym and the newsroom' },
  { at: 20, text: 'locals greet you by name (better first impressions)' },
  { at: 40, text: 'a lookout only locals know' },
  { at: 60, text: 'a back room where people do not use their real names' },
  { at: 80, text: 'being a local fixture (a little more standing)' },
];
