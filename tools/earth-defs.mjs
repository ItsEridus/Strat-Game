// Source definitions for the Earth map. `npm run earth` (tools/build-earth.mjs)
// turns these plus Natural Earth data into src/data/earth.json.
//
// Regions are the real first-level subdivisions of each playable country
// (US states + DC, Canadian provinces and territories, German Länder, Russian
// federal subjects, Turkish provinces, Japanese prefectures, …), with real
// boundaries. The UK is split into its four countries. Shapes, label points,
// seats of government, population weights and terrain all come from the data;
// only names, government titles, notable resource deposits and sea lanes are
// written by hand here.

export const NATIONS = [
  { iso3: 'USA', code: 'USA', name: 'United States', adj: 'American', color: '#3f6fd8', cur: 'USD', leader: 'President', legislature: 'Congress', capital: 'District of Columbia' },
  { iso3: 'CAN', code: 'CAN', name: 'Canada', adj: 'Canadian', color: '#e06666', cur: 'CAD', leader: 'Prime Minister', legislature: 'Parliament', capital: 'Ontario' },
  { iso3: 'MEX', code: 'MEX', name: 'Mexico', adj: 'Mexican', color: '#3fa672', cur: 'MXN', leader: 'President', legislature: 'Congress of the Union', capital: 'Mexico City' },
  { iso3: 'BRA', code: 'BRA', name: 'Brazil', adj: 'Brazilian', color: '#d8c43a', cur: 'BRL', leader: 'President', legislature: 'National Congress', capital: 'Federal District' },
  { iso3: 'ARG', code: 'ARG', name: 'Argentina', adj: 'Argentine', color: '#74b9e8', cur: 'ARS', leader: 'President', legislature: 'National Congress', capital: 'Buenos Aires City' },
  { iso3: 'GBR', code: 'GBR', name: 'United Kingdom', adj: 'British', color: '#8a63d2', cur: 'GBP', leader: 'Prime Minister', legislature: 'Parliament', capital: 'England' },
  { iso3: 'DEU', code: 'DEU', name: 'Germany', adj: 'German', color: '#7e8a4a', cur: 'EUR', leader: 'Chancellor', legislature: 'Bundestag', capital: 'Berlin' },
  { iso3: 'RUS', code: 'RUS', name: 'Russia', adj: 'Russian', color: '#a0785a', cur: 'RUB', leader: 'President', legislature: 'Federal Assembly', capital: 'Moscow' },
  { iso3: 'TUR', code: 'TUR', name: 'Turkey', adj: 'Turkish', color: '#d9663a', cur: 'TRY', leader: 'President', legislature: 'Grand National Assembly', capital: 'Ankara' },
  { iso3: 'SAU', code: 'SAU', name: 'Saudi Arabia', adj: 'Saudi', color: '#1d6b50', cur: 'SAR', leader: 'Prime Minister', legislature: 'Consultative Assembly', capital: 'Riyadh' },
  { iso3: 'ZAF', code: 'ZAF', name: 'South Africa', adj: 'South African', color: '#3fb3a8', cur: 'ZAR', leader: 'President', legislature: 'Parliament', capital: 'Gauteng' },
  { iso3: 'IND', code: 'IND', name: 'India', adj: 'Indian', color: '#f0a040', cur: 'INR', leader: 'Prime Minister', legislature: 'Parliament', capital: 'Delhi' },
  { iso3: 'CHN', code: 'CHN', name: 'China', adj: 'Chinese', color: '#c9303c', cur: 'CNY', leader: 'President', legislature: 'National People’s Congress', capital: 'Beijing' },
  { iso3: 'JPN', code: 'JPN', name: 'Japan', adj: 'Japanese', color: '#e87fb0', cur: 'JPY', leader: 'Prime Minister', legislature: 'National Diet', capital: 'Tokyo' },
  { iso3: 'KOR', code: 'KOR', name: 'South Korea', adj: 'Korean', color: '#5b7fa8', cur: 'KRW', leader: 'President', legislature: 'National Assembly', capital: 'Seoul' },
  { iso3: 'AUS', code: 'AUS', name: 'Australia', adj: 'Australian', color: '#c28a2e', cur: 'AUD', leader: 'Prime Minister', legislature: 'Parliament', capital: 'Australian Capital Territory' },
];

/**
 * Map a Natural Earth admin-1 feature to a region: returns { name, kind },
 * null to leave the land out (tiny disputed or remote territories), or
 * { merge: 'Region name' } to fold it into another region.
 * `kind` drives the regional government type below.
 */
export function classify(iso3, p) {
  const raw = p.name_en || p.name;
  switch (iso3) {
    case 'USA':
      if (p.type_en === 'Federal District') return { name: 'District of Columbia', kind: 'district' };
      return { name: raw, kind: 'state' };
    case 'CAN':
      return { name: p.name === 'Québec' ? 'Quebec' : raw, kind: p.type_en === 'Territory' ? 'territory' : 'province' };
    case 'MEX':
      if (!p.name) return null;
      if (p.type_en === 'Federal District') return { name: 'Mexico City', kind: 'capitalCity' };
      return { name: raw, kind: 'state' };
    case 'BRA':
      if (p.type_en === 'Federal District') return { name: 'Federal District', kind: 'district' };
      return { name: raw, kind: 'state' };
    case 'ARG':
      if (p.name === 'Ciudad de Buenos Aires') return { name: 'Buenos Aires City', kind: 'capitalCity' };
      if (p.name === 'Buenos Aires') return { name: 'Buenos Aires Province', kind: 'province' };
      return { name: raw, kind: 'province' };
    case 'GBR':
      return { merge: p.geonunit, kind: 'country' };
    case 'DEU': {
      const name = raw.replace('Free Hanseatic ', '');
      return { name, kind: name === 'Berlin' || name === 'Hamburg' || name === 'Bremen' ? 'cityState' : 'state' };
    }
    case 'RUS': {
      if (!p.name || /Crimea|Sevastopol/.test(raw)) return null; // internationally recognised as Ukraine
      const fix = { Moskovskaya: 'Moscow Oblast', Moskva: 'Moscow', Altay: 'Altai Krai', Yevrey: 'Jewish Autonomous Oblast', 'Maga Buryatdan': 'Magadan Oblast', Chita: 'Zabaykalsky Krai', Sakhalin: 'Sakhalin Oblast', Karelia: 'Republic of Karelia', Bashkortostan: 'Republic of Bashkortostan' };
      if (fix[p.name]) return { name: fix[p.name], kind: p.name === 'Moskva' ? 'federalCity' : /Republic/.test(fix[p.name]) ? 'republic' : 'oblast' };
      if (p.type_en === 'Federal City') return { name: raw, kind: 'federalCity' };
      if (p.type_en === 'Republic' || /Republic|Sakha/.test(raw)) return { name: raw, kind: 'republic' };
      const name = p.type_en === 'Region' && !/Krai|Okrug|Oblast/.test(raw) ? `${raw} Oblast` : raw;
      return { name, kind: 'oblast' };
    }
    case 'TUR':
      return { name: raw, kind: 'province' };
    case 'SAU': {
      const fix = { Eastern: 'Eastern Province', "'Asir": 'Asir' };
      return { name: fix[raw] ?? raw, kind: 'province' };
    }
    case 'ZAF':
      return { name: raw, kind: 'province' };
    case 'IND': {
      const ut = ['Ladakh', 'Jammu and Kashmir', 'Dadra and Nagar Haveli and Daman and Diu', 'Puducherry', 'Lakshadweep', 'Andaman and Nicobar Islands', 'Delhi', 'Chandigarh'];
      const withAssembly = ['Jammu and Kashmir', 'Puducherry', 'Delhi'];
      return { name: raw, kind: !ut.includes(raw) ? 'state' : withAssembly.includes(raw) ? 'utAssembly' : 'ut' };
    }
    case 'CHN':
      if (raw === 'Paracel Islands') return null;
      return { name: raw, kind: p.type_en === 'Municipality' ? 'municipality' : p.type_en === 'Autonomous Region' ? 'autonomous' : 'province' };
    case 'JPN':
      return { name: raw.replace(/ Prefecture$/, ''), kind: raw === 'Tokyo' ? 'metropolis' : 'prefecture' };
    case 'KOR': {
      const metro = ['Busan', 'Daegu', 'Incheon', 'Gwangju', 'Daejeon', 'Ulsan'];
      return { name: raw, kind: raw === 'Seoul' || raw === 'Sejong' ? 'special' : metro.includes(raw) ? 'metro' : 'province' };
    }
    case 'AUS':
      if (raw === 'Macquarie Island' || raw === 'Jervis Bay Territory') return null;
      if (raw === 'Lord Howe Island') return { merge: 'New South Wales', kind: 'state' };
      return { name: raw, kind: raw === 'Northern Territory' || raw === 'Australian Capital Territory' ? 'territory' : 'state' };
  }
  return null;
}

// US legislature names that are not "State Legislature".
const US_GENERAL_ASSEMBLY = ['Arkansas', 'Colorado', 'Connecticut', 'Delaware', 'Georgia', 'Illinois', 'Indiana', 'Iowa', 'Kentucky', 'Maryland', 'Missouri', 'New Jersey', 'North Carolina', 'Ohio', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'Tennessee', 'Vermont', 'Virginia'];
const US_OTHER = { Massachusetts: 'General Court', 'New Hampshire': 'General Court', 'North Dakota': 'Legislative Assembly', Oregon: 'Legislative Assembly', Nebraska: 'Unicameral Legislature' };
/** US states with no tax on wages (AK, FL, NV, NH, SD, TN, TX, WA, WY). */
export const NO_WAGE_TAX = ['USA/Alaska', 'USA/Florida', 'USA/Nevada', 'USA/New Hampshire', 'USA/South Dakota', 'USA/Tennessee', 'USA/Texas', 'USA/Washington', 'USA/Wyoming'];

/**
 * Regional government by country and kind: head title, legislature name, and how
 * the head is chosen ('elected' by residents, 'appointed' by the national
 * government), or null where there is no regional government (England).
 */
export function government(iso3, name, kind) {
  const g = (title, legislature, mode = 'elected') => ({ title, legislature, mode });
  switch (iso3) {
    case 'USA':
      if (kind === 'district') return g('Mayor', 'Council of the District of Columbia');
      return g('Governor', US_GENERAL_ASSEMBLY.includes(name) ? 'General Assembly' : US_OTHER[name] ?? 'State Legislature');
    case 'CAN':
      return g('Premier', name === 'Quebec' ? 'National Assembly' : ['Nova Scotia', 'Newfoundland and Labrador'].includes(name) ? 'House of Assembly' : 'Legislative Assembly');
    case 'MEX': return kind === 'capitalCity' ? g('Head of Government', 'Congress of Mexico City') : g('Governor', 'State Congress');
    case 'BRA': return kind === 'district' ? g('Governor', 'Legislative Chamber') : g('Governor', 'Legislative Assembly');
    case 'ARG': return kind === 'capitalCity' ? g('Chief of Government', 'City Legislature') : g('Governor', 'Provincial Legislature');
    case 'GBR':
      if (name === 'England') return null; // governed directly by the UK Parliament
      return name === 'Scotland' ? g('First Minister', 'Scottish Parliament') : name === 'Wales' ? g('First Minister', 'Senedd') : g('First Minister', 'Northern Ireland Assembly');
    case 'DEU':
      if (name === 'Berlin') return g('Governing Mayor', 'House of Representatives');
      if (name === 'Hamburg') return g('First Mayor', 'Hamburg Parliament');
      if (name === 'Bremen') return g('President of the Senate', 'Bremen Parliament');
      return g('Minister-President', 'Landtag');
    case 'RUS':
      if (kind === 'republic') return g('Head of the Republic', 'State Council');
      if (name === 'Moscow') return g('Mayor', 'Moscow City Duma');
      if (kind === 'federalCity') return g('Governor', 'Legislative Assembly');
      return g('Governor', 'Regional Duma');
    case 'TUR': return g('Governor (Vali)', 'Provincial Council', 'appointed');
    case 'SAU': return g('Emir', 'Regional Council', 'appointed');
    case 'ZAF': return g('Premier', 'Provincial Legislature');
    case 'IND':
      if (kind === 'ut') return g('Administrator', 'none (run by the Union government)', 'appointed');
      return g('Chief Minister', 'Legislative Assembly');
    case 'CHN':
      if (kind === 'municipality') return g('Mayor', 'Municipal People’s Congress', 'appointed');
      if (kind === 'autonomous') return g('Chairman', 'Regional People’s Congress', 'appointed');
      return g('Governor', 'Provincial People’s Congress', 'appointed');
    case 'JPN': return kind === 'metropolis' ? g('Governor', 'Tokyo Metropolitan Assembly') : g('Governor', 'Prefectural Assembly');
    case 'KOR': return kind === 'province' ? g('Governor', 'Provincial Council') : g('Mayor', 'Metropolitan Council');
    case 'AUS': return kind === 'territory' ? g('Chief Minister', 'Legislative Assembly') : g('Premier', 'Parliament');
  }
  return null;
}

// Notable real deposits and farm belts ("ISO3/Region": resources). Every other
// region gets resources rolled from its terrain.
export const HOTSPOTS = {
  'USA/Texas': ['oil', 'grain'], 'USA/North Dakota': ['oil', 'grain'], 'USA/Alaska': ['oil'], 'USA/Oklahoma': ['oil'], 'USA/New Mexico': ['oil'], 'USA/Louisiana': ['oil'],
  'USA/Minnesota': ['iron', 'grain'], 'USA/Michigan': ['iron'], 'USA/Iowa': ['grain'], 'USA/Illinois': ['grain'], 'USA/Kansas': ['grain'], 'USA/Nebraska': ['grain'], 'USA/Florida': ['titanium'], 'USA/Utah': ['titanium'],
  'CAN/Alberta': ['oil'], 'CAN/Saskatchewan': ['grain', 'oil'], 'CAN/Manitoba': ['grain'], 'CAN/Quebec': ['iron', 'titanium'], 'CAN/Newfoundland and Labrador': ['iron', 'oil'],
  'MEX/Campeche': ['oil'], 'MEX/Tabasco': ['oil'], 'MEX/Coahuila': ['iron'], 'MEX/Sinaloa': ['grain'], 'MEX/Jalisco': ['grain'],
  'BRA/Minas Gerais': ['iron'], 'BRA/Pará': ['iron'], 'BRA/Rio de Janeiro': ['oil'], 'BRA/Mato Grosso': ['grain'], 'BRA/Paraná': ['grain'], 'BRA/Goiás': ['grain', 'titanium'],
  'ARG/Buenos Aires Province': ['grain'], 'ARG/Córdoba': ['grain'], 'ARG/Santa Fe': ['grain'], 'ARG/Neuquén': ['oil'], 'ARG/Chubut': ['oil'],
  'GBR/Scotland': ['oil'], 'GBR/England': ['grain', 'iron'], 'GBR/Wales': ['iron'],
  'DEU/North Rhine-Westphalia': ['iron'], 'DEU/Lower Saxony': ['grain', 'oil'], 'DEU/Bavaria': ['grain'], 'DEU/Saxony': ['titanium'],
  'RUS/Khanty-Mansi Autonomous Okrug': ['oil'], 'RUS/Yamalo-Nenets Autonomous Okrug': ['oil'], 'RUS/Republic of Tatarstan': ['oil'], 'RUS/Kursk Oblast': ['iron'], 'RUS/Belgorod Oblast': ['iron', 'grain'],
  'RUS/Krasnodar Krai': ['grain'], 'RUS/Rostov Oblast': ['grain'], 'RUS/Stavropol Krai': ['grain'], 'RUS/Sverdlovsk Oblast': ['titanium', 'iron'], 'RUS/Sakha Republic': ['titanium'], 'RUS/Sakhalin Oblast': ['oil'],
  'TUR/Konya': ['grain'], 'TUR/Batman': ['oil'], 'TUR/Sivas': ['iron'], 'TUR/Şanlıurfa': ['grain'],
  'SAU/Eastern Province': ['oil'], 'SAU/Riyadh': ['oil'], 'SAU/Tabuk': ['titanium'], 'SAU/Al-Qassim': ['grain'],
  'ZAF/Northern Cape': ['iron'], 'ZAF/KwaZulu-Natal': ['titanium'], 'ZAF/Free State': ['grain'], 'ZAF/Mpumalanga': ['iron'],
  'IND/Punjab': ['grain'], 'IND/Haryana': ['grain'], 'IND/Uttar Pradesh': ['grain'], 'IND/Odisha': ['iron'], 'IND/Jharkhand': ['iron'], 'IND/Chhattisgarh': ['iron'], 'IND/Kerala': ['titanium'], 'IND/Assam': ['oil'], 'IND/Gujarat': ['oil'],
  'CHN/Heilongjiang': ['oil', 'grain'], 'CHN/Xinjiang': ['oil'], 'CHN/Hebei': ['iron'], 'CHN/Liaoning': ['iron'], 'CHN/Sichuan': ['titanium'], 'CHN/Henan': ['grain'], 'CHN/Shandong': ['grain', 'oil'], 'CHN/Inner Mongolia': ['iron'],
  'JPN/Hokkaidō': ['grain'], 'JPN/Niigata': ['grain', 'oil'], 'JPN/Fukuoka': ['iron'],
  'KOR/North Gyeongsang': ['iron'], 'KOR/South Jeolla': ['grain'], 'KOR/Ulsan': ['oil'],
  'AUS/Western Australia': ['iron', 'titanium'], 'AUS/Queensland': ['oil'], 'AUS/New South Wales': ['grain'], 'AUS/Victoria': ['grain'], 'AUS/South Australia': ['titanium'],
};

// Sea lanes and overland corridors through neutral countries.
export const ROUTES = [
  ['GBR/England', 'DEU/Lower Saxony', 'North Sea'],
  ['GBR/Scotland', 'CAN/Newfoundland and Labrador', 'North Atlantic'],
  ['GBR/England', 'USA/New York', 'North Atlantic'],
  ['DEU/Mecklenburg-Western Pomerania', 'RUS/Kaliningrad Oblast', 'Baltic Sea'],
  ['DEU/Bavaria', 'TUR/Istanbul', 'Danube corridor'],
  ['RUS/Krasnodar Krai', 'TUR/Samsun', 'Black Sea'],
  ['TUR/Hatay', 'SAU/Al-Jowf', 'Levant corridor'],
  ['SAU/Eastern Province', 'IND/Gujarat', 'Arabian Sea'],
  ['SAU/Jazan', 'ZAF/KwaZulu-Natal', 'East African coast'],
  ['ZAF/Western Cape', 'BRA/Rio de Janeiro', 'South Atlantic'],
  ['ZAF/KwaZulu-Natal', 'AUS/Western Australia', 'Indian Ocean'],
  ['IND/Tamil Nadu', 'AUS/Western Australia', 'Indian Ocean'],
  ['MEX/Chiapas', 'BRA/Amazonas', 'Central American corridor'],
  ['USA/Florida', 'BRA/Pará', 'Caribbean'],
  ['USA/California', 'USA/Hawaii', 'Pacific'],
  ['USA/Hawaii', 'JPN/Kanagawa', 'Pacific'],
  ['USA/Alaska', 'RUS/Chukotka Autonomous Okrug', 'Bering Strait'],
  ['RUS/Sakhalin Oblast', 'JPN/Hokkaidō', 'La Pérouse Strait'],
  ['RUS/Primorsky Krai', 'KOR/Gangwon', 'Sea of Japan'],
  ['CHN/Shandong', 'KOR/Incheon', 'Yellow Sea'],
  ['KOR/Busan', 'JPN/Fukuoka', 'Korea Strait'],
  ['CHN/Shanghai', 'JPN/Nagasaki', 'East China Sea'],
  ['AUS/Northern Territory', 'CHN/Guangdong', 'South China Sea'],
  ['AUS/Queensland', 'JPN/Okinawa', 'Western Pacific'],
];

// Coarse climate zones [west, south, east, north] used for sample points that
// are not in a mapped mountain range or desert.
export const FOREST_ZONES = [
  [-87, 29, -60, 48], [-97, 44, -84, 49], [-125, 40, -116, 60], [-135, 54, -52, 62], [-95, 46, -52, 54], [-125, 49, -115, 54], // eastern US, north woods, Pacific NW, boreal & eastern Canada, BC
  [-80, -18, -44, 8], [-55, -30, -38, -15], // Amazon, Atlantic forest
  [28, 55, 180, 66], [-180, 55, -140, 66], // taiga
  [98, 20, 125, 32], [124, 40, 135, 50], [126, 30, 146, 46], // southern China, Manchuria, Korea & Japan
  [72, 8, 78, 16], [88, 20, 98, 29], // Western Ghats, northeast India
  [145, -40, 154, -15], [144, -44, 149, -40], // eastern Australia, Tasmania
  [6, 47, 15, 52], // German uplands
];
export const DRY_ZONES = [
  [-119.5, 31, -108, 42], [-116, 24, -102, 32], // Great Basin & Southwest, northern Mexico
  [-72, -52, -65, -38], // Patagonian steppe
  [114, -33, 142, -18], // Australian interior
  [34, 16, 56, 32], [69, 24, 75, 29.5], [75, 36, 112, 46], // Arabia, Thar, Tarim & Gobi
  [44, 44, 50, 48], [17, -32, 24, -26], // Caspian lowland, Karoo
];
