// Original names for the fictional world ("the Meridian Reach"). No real countries.
export const NATION_DEFS = [
  { name: 'Aurelia', adj: 'Aurelian', color: '#d4a72c', cur: 'AUR' },
  { name: 'Valdoria', adj: 'Valdorian', color: '#c0392b', cur: 'VAL' },
  { name: 'Nordhavn', adj: 'Nordhavner', color: '#2e86c1', cur: 'NRD' },
  { name: 'Karvania', adj: 'Karvanian', color: '#8e44ad', cur: 'KRV' },
  { name: 'Solmera', adj: 'Solmeran', color: '#e67e22', cur: 'SOL' },
  { name: 'Tervia', adj: 'Tervian', color: '#27ae60', cur: 'TRV' },
  { name: 'Drakmoor', adj: 'Drakmoorian', color: '#7f8c8d', cur: 'DRK' },
  { name: 'Celestra', adj: 'Celestran', color: '#16a085', cur: 'CEL' },
];

export const REGION_PREFIX = ['Kar', 'Vel', 'Mor', 'Ast', 'Bel', 'Dun', 'Eld', 'Fal', 'Gor', 'Hal', 'Ist', 'Jor', 'Kel', 'Lun',
  'Mar', 'Nor', 'Ost', 'Pel', 'Quel', 'Ros', 'Sar', 'Tor', 'Ul', 'Var', 'Wen', 'Yar', 'Zel', 'Bran', 'Cor', 'Tal', 'Esk', 'Hol'];
export const REGION_SUFFIX = ['ia', 'burg', 'mark', 'heim', 'ora', 'dale', 'grad', 'vale', 'stead', 'wick', 'ford', 'land',
  'moor', 'crest', 'haven', 'reach', 'fell', 'port'];

export const FIRST = ['Alex', 'Mira', 'Victor', 'Elena', 'Ivan', 'Sofia', 'Marco', 'Lena', 'Oskar', 'Nadia', 'Tomas', 'Irina',
  'Felix', 'Clara', 'Dorian', 'Vera', 'Anton', 'Greta', 'Luka', 'Yara', 'Emil', 'Ines', 'Pavel', 'Rosa', 'Nikolai', 'Hana',
  'Bruno', 'Talia', 'Casimir', 'Ada', 'Jonas', 'Petra', 'Silas', 'Maren', 'Theo', 'Livia', 'Konrad', 'Zora', 'Ansel', 'Wren'];
export const LAST = ['Stone', 'Varga', 'Novak', 'Richter', 'Moreau', 'Kowal', 'Petrov', 'Lind', 'Adler', 'Costa', 'Horvat',
  'Berg', 'Falk', 'Rossi', 'Weber', 'Duval', 'Marek', 'Sorel', 'Brand', 'Castel', 'Draven', 'Ekholm', 'Faber', 'Grell',
  'Haldane', 'Iver', 'Jansen', 'Kade', 'Lorne', 'Mercer', 'Nyland', 'Orlov', 'Pryce', 'Quill', 'Rook', 'Strand', 'Tamsin', 'Voss'];

export const COMPANY_WORDS = ['Northern', 'Union', 'Crown', 'Harbor', 'Summit', 'Iron', 'Golden', 'Red', 'Blue', 'Evergreen',
  'Pioneer', 'Atlas', 'Beacon', 'Keystone', 'Meridian', 'Frontier', 'Heritage', 'Liberty', 'Unity', 'Citadel'];
export const COMPANY_SUFFIX = ['Works', 'Holdings', 'Co.', 'Industries', 'Group', '& Sons', 'Cooperative', 'Ltd.', 'Trust'];

export const PARTY_NAMES: Record<string, string[]> = {
  capitalism: ['Free Market League', 'Enterprise Party', 'Liberty & Commerce'],
  nationalism: ['Homeland Front', 'National Guard Party', 'Patriots’ Union'],
  centralism: ['Directorate Party', 'Order & Progress', 'Technocratic Alliance'],
  socialism: ['Social Democrats', 'People’s Cooperative', 'Workers’ Solidarity'],
  imperialism: ['Imperial League', 'Expansion Party', 'Grand Destiny'],
  communism: ['Vanguard Party', 'Red Commune', 'Collective Union'],
};

export const PAPER_WORDS = ['Herald', 'Tribune', 'Gazette', 'Courier', 'Sentinel', 'Chronicle', 'Observer', 'Dispatch', 'Ledger', 'Voice'];
export const UNIT_WORDS = ['Wolves', 'Iron Brigade', 'Lancers', 'Rangers', 'Vanguard', 'Hussars', 'Sentinels', 'Falcons', 'Legion', 'Grenadiers'];
export const ENVOY_NAME = 'Mara Voss';
