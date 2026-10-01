// The international order at the start of 2025 (2.0 GEO 4): blocs and alliances,
// languages, trade ties and standing grievances between the sixteen countries.
// Rounded and simplified from public sources (treaty memberships, UN Comtrade
// bilateral trade shares, long-running territorial and historical disputes).
export type BlocKind = 'defence' | 'trade' | 'political' | 'intel';
export interface Bloc { id: string; name: string; kind: BlocKind; members: string[]; desc: string }
export const BLOCS: Bloc[] = [
  { id: 'nato', name: 'North Atlantic alliance', kind: 'defence', members: ['USA', 'CAN', 'GBR', 'DEU', 'TUR'], desc: 'collective defence: an attack on one is an attack on all' },
  { id: 'usjp', name: 'US–Japan alliance', kind: 'defence', members: ['USA', 'JPN'], desc: 'mutual security treaty' },
  { id: 'uskr', name: 'US–Korea alliance', kind: 'defence', members: ['USA', 'KOR'], desc: 'mutual defence treaty' },
  { id: 'anzus', name: 'US–Australia alliance', kind: 'defence', members: ['USA', 'AUS'], desc: 'mutual security treaty' },
  { id: 'usmca', name: 'USMCA', kind: 'trade', members: ['USA', 'CAN', 'MEX'], desc: 'North American free trade' },
  { id: 'mercosur', name: 'Mercosur', kind: 'trade', members: ['BRA', 'ARG'], desc: 'South American customs union' },
  { id: 'brics', name: 'BRICS', kind: 'political', members: ['BRA', 'RUS', 'IND', 'CHN', 'ZAF'], desc: 'emerging economies coordinating outside Western institutions' },
  { id: 'fiveeyes', name: 'Five Eyes', kind: 'intel', members: ['USA', 'GBR', 'CAN', 'AUS'], desc: 'intelligence sharing' },
  { id: 'quad', name: 'The Quad', kind: 'political', members: ['USA', 'JPN', 'IND', 'AUS'], desc: 'Indo-Pacific security dialogue' },
];
export const LANGUAGE: Record<string, string> = { USA: 'en', CAN: 'en', GBR: 'en', AUS: 'en', MEX: 'es', ARG: 'es', BRA: 'pt', DEU: 'de', RUS: 'ru', TUR: 'tr', SAU: 'ar', ZAF: 'en', IND: 'en', CHN: 'zh', JPN: 'ja', KOR: 'ko' };

const pair = (a: string, b: string) => (a < b ? `${a}-${b}` : `${b}-${a}`);
/** Trade and investment ties (0–100): each other's major partners. */
const TIES: Record<string, number> = Object.fromEntries(Object.entries({
  'USA-CAN': 90, 'USA-MEX': 90, 'USA-CHN': 70, 'USA-JPN': 60, 'USA-DEU': 55, 'USA-GBR': 55, 'USA-KOR': 55, 'USA-IND': 40, 'USA-BRA': 30, 'USA-AUS': 35,
  'CHN-JPN': 65, 'CHN-KOR': 70, 'CHN-AUS': 70, 'CHN-DEU': 50, 'CHN-BRA': 55, 'CHN-RUS': 60, 'CHN-SAU': 45, 'CHN-IND': 35, 'CHN-ZAF': 40, 'CHN-ARG': 30,
  'DEU-GBR': 50, 'DEU-TUR': 40, 'DEU-RUS': 15, 'RUS-TUR': 45, 'RUS-IND': 40, 'BRA-ARG': 60, 'JPN-KOR': 40, 'JPN-AUS': 45, 'KOR-AUS': 35, 'IND-SAU': 40, 'SAU-JPN': 35, 'SAU-KOR': 35, 'GBR-CAN': 25,
}).map(([k, v]) => { const [a, b] = k.split('-'); return [pair(a, b), v]; }));
export const tiesOf = (a: string, b: string) => TIES[pair(a, b)] ?? 10;

/** Standing grievances (0–100): territorial disputes and historical wrongs. */
const GRIEVANCES: Record<string, number> = Object.fromEntries(Object.entries({
  'CHN-JPN': 45, 'CHN-IND': 45, 'CHN-USA': 30, 'RUS-USA': 40, 'RUS-GBR': 35, 'RUS-DEU': 25, 'KOR-JPN': 25, 'ARG-GBR': 40, 'JPN-RUS': 25, 'CHN-KOR': 10, 'CHN-AUS': 10, 'MEX-USA': 10, 'RUS-CAN': 15, 'RUS-TUR': 10,
}).map(([k, v]) => { const [a, b] = k.split('-'); return [pair(a, b), v]; }));
export const grievanceOf = (a: string, b: string) => GRIEVANCES[pair(a, b)] ?? 0;

/** Trust at the start (−100..100): allies trust each other; rivals do not. */
const TRUST: Record<string, number> = Object.fromEntries(Object.entries({
  'USA-GBR': 70, 'USA-CAN': 65, 'USA-AUS': 65, 'USA-JPN': 55, 'USA-KOR': 50, 'USA-DEU': 45, 'GBR-CAN': 60, 'GBR-AUS': 60, 'CAN-AUS': 55, 'GBR-DEU': 40, 'USA-TUR': 10, 'DEU-TUR': 10,
  'USA-MEX': 25, 'USA-IND': 30, 'JPN-AUS': 45, 'JPN-IND': 35, 'IND-AUS': 30, 'BRA-ARG': 35, 'CHN-RUS': 40, 'RUS-IND': 35, 'CHN-ZAF': 20, 'BRA-CHN': 20, 'SAU-USA': 20,
  'RUS-USA': -50, 'CHN-USA': -30, 'RUS-GBR': -45, 'RUS-DEU': -35, 'CHN-JPN': -25, 'CHN-IND': -25, 'JPN-KOR': 10, 'RUS-CAN': -35, 'RUS-AUS': -30, 'RUS-JPN': -30, 'CHN-AUS': -15, 'CHN-GBR': -15, 'CHN-CAN': -15, 'ARG-GBR': -20,
}).map(([k, v]) => { const [a, b] = k.split('-'); return [pair(a, b), v]; }));
export const startTrust = (a: string, b: string) => TRUST[pair(a, b)] ?? 0;

/** Trade agreements in force at the start of 2025 (beyond the blocs above). */
export const TRADE_AGREEMENTS: { name: string; members: string[]; year: number }[] = [
  { name: 'CPTPP', members: ['JPN', 'CAN', 'MEX', 'AUS', 'GBR'], year: 2018 },
  { name: 'RCEP', members: ['CHN', 'JPN', 'KOR', 'AUS'], year: 2022 },
  { name: 'KORUS', members: ['USA', 'KOR'], year: 2012 },
  { name: 'US–Australia FTA', members: ['USA', 'AUS'], year: 2005 },
  { name: 'China–Korea FTA', members: ['CHN', 'KOR'], year: 2015 },
  { name: 'China–Australia FTA', members: ['CHN', 'AUS'], year: 2015 },
  { name: 'Korea–Australia FTA', members: ['KOR', 'AUS'], year: 2014 },
  { name: 'Canada–Korea FTA', members: ['CAN', 'KOR'], year: 2015 },
  { name: 'EU–Japan EPA', members: ['DEU', 'JPN'], year: 2019 },
  { name: 'EU–Korea FTA', members: ['DEU', 'KOR'], year: 2011 },
  { name: 'EU–Canada CETA', members: ['DEU', 'CAN'], year: 2017 },
  { name: 'EU–Mexico agreement', members: ['DEU', 'MEX'], year: 2000 },
  { name: 'EU–South Africa partnership', members: ['DEU', 'ZAF'], year: 2016 },
  { name: 'EU–Turkey customs union', members: ['DEU', 'TUR'], year: 1995 },
  { name: 'UK–Japan CEPA', members: ['GBR', 'JPN'], year: 2021 },
  { name: 'UK–Korea FTA', members: ['GBR', 'KOR'], year: 2021 },
  { name: 'UK–Turkey FTA', members: ['GBR', 'TUR'], year: 2021 },
  { name: 'India–Australia ECTA', members: ['IND', 'AUS'], year: 2022 },
  { name: 'India–Japan CEPA', members: ['IND', 'JPN'], year: 2011 },
  { name: 'India–Korea CEPA', members: ['IND', 'KOR'], year: 2010 },
  { name: 'Japan–Mexico EPA', members: ['JPN', 'MEX'], year: 2005 },
  { name: 'Turkey–Korea FTA', members: ['TUR', 'KOR'], year: 2013 },
];

/** Broad regions, for who can credibly defend whom. Global powers project force anywhere. */
export const WORLD_REGION: Record<string, string[]> = {
  USA: ['americas', 'pacific'], CAN: ['americas'], MEX: ['americas'], BRA: ['americas'], ARG: ['americas'],
  GBR: ['europe'], DEU: ['europe'], TUR: ['europe', 'mideast'], RUS: ['europe', 'asia'], SAU: ['mideast'], ZAF: ['africa'],
  IND: ['asia'], CHN: ['asia', 'pacific'], JPN: ['asia', 'pacific'], KOR: ['asia', 'pacific'], AUS: ['pacific', 'asia'],
};
export const GLOBAL_POWERS = ['USA', 'GBR'];
