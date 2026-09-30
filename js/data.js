// Static game data and balance constants.
(function () {
  const G = globalThis.G;

  G.data = {
    NATIONS: [
      { name: 'Aurelia', adj: 'Aurelian', color: '#d4a72c' },
      { name: 'Valdoria', adj: 'Valdorian', color: '#c0392b' },
      { name: 'Nordheim', adj: 'Nordheimer', color: '#2e86c1' },
      { name: 'Karvania', adj: 'Karvanian', color: '#8e44ad' },
      { name: 'Solmera', adj: 'Solmeran', color: '#e67e22' },
      { name: 'Tervia', adj: 'Tervian', color: '#27ae60' },
      { name: 'Drakmoor', adj: 'Drakmoorian', color: '#5d6d7e' },
      { name: 'Celestra', adj: 'Celestran', color: '#16a085' },
    ],

    // hawk: 0 = pacifist, 1 = warmonger. Drives congress votes.
    PARTIES: [
      { name: "People's Party", hawk: 0.45 },
      { name: 'Liberal Union', hawk: 0.3 },
      { name: 'National Front', hawk: 0.85 },
      { name: 'Green Alliance', hawk: 0.15 },
      { name: "Workers' Movement", hawk: 0.5 },
      { name: 'Imperial League', hawk: 0.95 },
    ],

    REGION_PREFIX: ['Kar', 'Vel', 'Mor', 'Ast', 'Bel', 'Dun', 'Eld', 'Fal', 'Gor', 'Hal', 'Ist', 'Jor', 'Kel', 'Lun',
      'Mar', 'Nor', 'Ost', 'Pel', 'Quel', 'Ros', 'Sar', 'Tor', 'Ul', 'Var', 'Wen', 'Yar', 'Zel', 'Bran', 'Cor', 'Tal'],
    REGION_SUFFIX: ['ia', 'burg', 'mark', 'heim', 'ora', 'dale', 'grad', 'vale', 'stead', 'wick', 'ford', 'land',
      'moor', 'crest', 'haven', 'reach', 'fell'],

    FIRST_NAMES: ['Alex', 'Mira', 'Victor', 'Elena', 'Ivan', 'Sofia', 'Marco', 'Lena', 'Oskar', 'Nadia', 'Tomas',
      'Irina', 'Felix', 'Clara', 'Dorian', 'Vera', 'Anton', 'Greta', 'Luka', 'Yara'],
    LAST_NAMES: ['Stone', 'Varga', 'Novak', 'Richter', 'Moreau', 'Kowal', 'Petrov', 'Lind', 'Adler', 'Costa',
      'Horvat', 'Berg', 'Falk', 'Rossi', 'Weber', 'Duval', 'Marek', 'Sorel'],
    EMPLOYER_WORDS: ['Steel', 'Agro', 'Foods', 'Arms', 'Industries', 'Mining', 'Textiles', 'Logistics', 'Energy',
      'Construction', 'Motors', 'Chemicals'],

    RANKS: [
      { name: 'Recruit', pts: 0 },
      { name: 'Private', pts: 1000 },
      { name: 'Corporal', pts: 5000 },
      { name: 'Sergeant', pts: 15000 },
      { name: 'Lieutenant', pts: 40000 },
      { name: 'Captain', pts: 100000 },
      { name: 'Major', pts: 250000 },
      { name: 'Colonel', pts: 600000 },
      { name: 'General', pts: 1500000 },
      { name: 'Field Marshal', pts: 4000000 },
    ],

    COMPANY_TYPES: {
      farm: { name: 'Grain Farm', output: 'grain', raw: true, resource: 'grain', perWorker: 20, cost: 10, icon: '🌾' },
      mine: { name: 'Iron Mine', output: 'iron', raw: true, resource: 'iron', perWorker: 20, cost: 10, icon: '⛏️' },
      food: { name: 'Food Factory', output: 'food', input: 'grain', inputPerQ: 1, perWorker: 10, cost: 15, icon: '🍞' },
      arms: { name: 'Weapons Factory', output: 'weapon', input: 'iron', inputPerQ: 3, perWorker: 5, cost: 20, icon: '🔫' },
    },

    // Energy costs / rewards
    E: { work: 10, train: 10, hit: 10, manage: 10, article: 20, foodCap: 100 },
    XP: { work: 3, train: 3, hit: 1, manage: 2, article: 3 },
    MAX_LEVEL_ENERGY: 250,
    GOLD_BASE_PRICE: 60,
    CONGRESS_SEATS: 20,
    ELECTION_CYCLE: 30, // presidential on day%30==0, congress on day%30==15
    TRAIN_UPGRADE_COST: [0, 10, 25, 50, 90], // gold to reach training level index+1
  };

  // Tradeable items. Base prices roughly track input cost + labour.
  const items = {
    grain: { name: 'Grain', base: 2, impact: 0.0015, kind: 'raw', icon: '🌾' },
    iron: { name: 'Iron', base: 2.4, impact: 0.0015, kind: 'raw', icon: '🪨' },
  };
  for (let q = 1; q <= 5; q++) {
    items['food' + q] = { name: `Food Q${q}`, base: 2 * q + 4, impact: 0.002, kind: 'food', q, icon: '🍞', energy: q * 4 };
    items['weapon' + q] = { name: `Weapon Q${q}`, base: Math.round(7.2 * q + 8), impact: 0.003, kind: 'weapon', q, icon: '🔫', mult: 1 + 0.2 * q };
  }
  G.data.ITEMS = items;
})();
