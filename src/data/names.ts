// Nations are real countries (see src/data/earth.ts); people, companies, parties
// and papers are invented. Citizen names are drawn from per-country pools.
import { EARTH } from './earth';

export const NATION_DEFS = EARTH.nations;

/** Given names and surnames per nation (by currency code, which is unique per nation). */
export const NAME_POOLS: Record<string, { first: string[]; last: string[] }> = {
  USD: { first: ['James', 'Mary', 'Michael', 'Jennifer', 'David', 'Linda', 'Robert', 'Emily', 'Chris', 'Ashley', 'Marcus', 'Keisha', 'Tyler', 'Megan', 'Jose', 'Hannah', 'Ethan', 'Olivia', 'Darnell', 'Grace'],
    last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Harris', 'Clark', 'Lewis', 'Walker'] },
  CAD: { first: ['Liam', 'Emma', 'Noah', 'Chloé', 'Lucas', 'Sophie', 'Owen', 'Maya', 'Jacob', 'Charlotte', 'Mathieu', 'Élodie', 'Ryan', 'Avery', 'Gabriel', 'Léa', 'Connor', 'Isla', 'Samuel', 'Jade'],
    last: ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'MacDonald', 'Campbell', 'Stewart', 'Wong', 'Singh', 'Martin', 'Leblanc', 'Fraser', 'Bélanger', 'Clarke', 'Pelletier'] },
  MXN: { first: ['José', 'María', 'Juan', 'Guadalupe', 'Luis', 'Fernanda', 'Carlos', 'Ximena', 'Miguel', 'Valeria', 'Alejandro', 'Sofía', 'Diego', 'Camila', 'Jorge', 'Daniela', 'Ricardo', 'Regina', 'Emiliano', 'Paola'],
    last: ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Ruiz'] },
  BRL: { first: ['João', 'Ana', 'Pedro', 'Beatriz', 'Lucas', 'Mariana', 'Gabriel', 'Larissa', 'Rafael', 'Juliana', 'Thiago', 'Camila', 'Felipe', 'Letícia', 'Bruno', 'Fernanda', 'Matheus', 'Isabela', 'Caio', 'Aline'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa'] },
  ARS: { first: ['Santiago', 'Valentina', 'Mateo', 'Martina', 'Joaquín', 'Lucía', 'Facundo', 'Camila', 'Tomás', 'Agustina', 'Nicolás', 'Florencia', 'Federico', 'Julieta', 'Gonzalo', 'Micaela', 'Ignacio', 'Rocío', 'Emiliano', 'Carolina'],
    last: ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Aguirre'] },
  GBP: { first: ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Jack', 'Emily', 'Charlie', 'Sophie', 'Thomas', 'Lily', 'Alfie', 'Poppy', 'Callum', 'Eilidh', 'Rhys', 'Seren', 'Arjun', 'Freya'],
    last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Davies', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'Hughes', 'Campbell', 'Murray', 'Patel', 'Morgan', 'Hall'] },
  EUR: { first: ['Lukas', 'Anna', 'Leon', 'Marie', 'Finn', 'Sophie', 'Jonas', 'Laura', 'Felix', 'Lena', 'Paul', 'Hannah', 'Maximilian', 'Julia', 'Tim', 'Lea', 'Niklas', 'Katharina', 'Emre', 'Mia'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Braun', 'Zimmermann', 'Hartmann', 'Krüger'] },
  RUB: { first: ['Alexander', 'Anastasia', 'Dmitry', 'Maria', 'Sergei', 'Elena', 'Ivan', 'Olga', 'Mikhail', 'Tatiana', 'Andrei', 'Natalia', 'Nikolai', 'Irina', 'Pavel', 'Yulia', 'Alexei', 'Ekaterina', 'Vladimir', 'Svetlana'],
    last: ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Vasiliev', 'Petrov', 'Sokolov', 'Mikhailov', 'Novikov', 'Fedorov', 'Morozov', 'Volkov', 'Alekseev', 'Lebedev', 'Semenov', 'Egorov', 'Pavlov', 'Kozlov', 'Stepanov', 'Orlov'] },
  TRY: { first: ['Mehmet', 'Ayşe', 'Mustafa', 'Fatma', 'Ahmet', 'Zeynep', 'Ali', 'Elif', 'Hüseyin', 'Emine', 'Emre', 'Merve', 'Burak', 'Esra', 'Murat', 'Selin', 'Can', 'Deniz', 'Kerem', 'Ebru'],
    last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Polat'] },
  SAR: { first: ['Mohammed', 'Fatimah', 'Abdullah', 'Noura', 'Faisal', 'Sara', 'Khalid', 'Reem', 'Saud', 'Lama', 'Turki', 'Hessa', 'Omar', 'Maha', 'Sultan', 'Aisha', 'Nasser', 'Dana', 'Fahad', 'Layla'],
    last: ['Al-Qahtani', 'Al-Ghamdi', 'Al-Harbi', 'Al-Otaibi', 'Al-Zahrani', 'Al-Dosari', 'Al-Shehri', 'Al-Mutairi', 'Al-Anazi', 'Al-Shammari', 'Al-Subaie', 'Al-Malki', 'Al-Juhani', 'Al-Rashid', 'Al-Amri', 'Al-Asmari', 'Al-Balawi', 'Al-Saeed', 'Al-Hazmi', 'Al-Sulami'] },
  ZAR: { first: ['Thabo', 'Nomvula', 'Sipho', 'Lerato', 'Johan', 'Anke', 'Bongani', 'Zanele', 'Pieter', 'Naledi', 'Mandla', 'Thandiwe', 'Ruan', 'Palesa', 'Kagiso', 'Busisiwe', 'Themba', 'Lindiwe', 'Riaan', 'Ayanda'],
    last: ['Nkosi', 'Dlamini', 'Ndlovu', 'Khumalo', 'Mokoena', 'Mahlangu', 'Botha', 'Van der Merwe', 'Naidoo', 'Mthembu', 'Zulu', 'Pretorius', 'Molefe', 'Sithole', 'Du Plessis', 'Ngcobo', 'Mabena', 'Jacobs', 'Masondo', 'Venter'] },
  INR: { first: ['Aarav', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Divya', 'Arjun', 'Kavya', 'Rohan', 'Sneha', 'Amit', 'Pooja', 'Karthik', 'Lakshmi', 'Sanjay', 'Meera', 'Imran', 'Neha', 'Harpreet', 'Aditi'],
    last: ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Iyer', 'Nair', 'Das', 'Mehta', 'Joshi', 'Chopra', 'Rao', 'Banerjee', 'Khan', 'Verma', 'Pillai', 'Desai', 'Bose', 'Menon'] },
  CNY: { first: ['Wei', 'Fang', 'Hao', 'Xin', 'Jun', 'Mei', 'Lei', 'Ying', 'Tao', 'Jing', 'Qiang', 'Li', 'Bo', 'Xiu', 'Chen', 'Lan', 'Yong', 'Hui', 'Ming', 'Yan'],
    last: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Gao', 'Luo'] },
  JPY: { first: ['Haruto', 'Yui', 'Sota', 'Hina', 'Ren', 'Aoi', 'Yuto', 'Sakura', 'Takumi', 'Mei', 'Kenji', 'Yuki', 'Hiroshi', 'Akiko', 'Daiki', 'Miyu', 'Kaito', 'Rin', 'Shota', 'Emi'],
    last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori'] },
  KRW: { first: ['Min-jun', 'Seo-yeon', 'Ji-ho', 'Ha-eun', 'Do-yun', 'Ji-woo', 'Joon-young', 'Su-bin', 'Hyun-woo', 'Ye-jin', 'Sung-min', 'Da-eun', 'Jae-hyun', 'Eun-ji', 'Tae-yang', 'Min-seo', 'Woo-jin', 'Yu-na', 'Dong-hyun', 'Soo-ah'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Yoo', 'Hong'] },
  AUD: { first: ['Jack', 'Charlotte', 'William', 'Olivia', 'Noah', 'Mia', 'Lachlan', 'Chloe', 'Cooper', 'Ruby', 'Riley', 'Matilda', 'Harrison', 'Zoe', 'Mitchell', 'Isabella', 'Liam', 'Ella', 'Jarrah', 'Kirra'],
    last: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Nguyen', 'Johnson', 'Martin', 'White', 'Anderson', 'Walker', 'Thompson', 'Kelly', 'Ryan', 'Murphy', 'Harris', 'Mitchell', 'Campbell', 'Chen'] },
};

export const COMPANY_WORDS = ['Northern', 'Union', 'Crown', 'Harbor', 'Summit', 'Iron', 'Golden', 'Red', 'Blue', 'Evergreen',
  'Pioneer', 'Atlas', 'Beacon', 'Keystone', 'Meridian', 'Frontier', 'Heritage', 'Liberty', 'Unity', 'Citadel',
  'Pacific', 'Continental', 'Eastern', 'Western', 'Delta', 'Horizon', 'Capital', 'Global'];
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

/** Real national intelligence services (by currency code). */
export const AGENCY_NAMES: Record<string, string> = {
  USD: 'Central Intelligence Agency', CAD: 'Canadian Security Intelligence Service', MXN: 'National Intelligence Centre (CNI)',
  BRL: 'Brazilian Intelligence Agency (ABIN)', ARS: 'Federal Intelligence Agency', GBP: 'Secret Intelligence Service (MI6)',
  EUR: 'Federal Intelligence Service (BND)', RUB: 'Foreign Intelligence Service (SVR)', TRY: 'National Intelligence Organization (MİT)',
  SAR: 'General Intelligence Presidency', ZAR: 'State Security Agency', INR: 'Research and Analysis Wing (R&AW)',
  CNY: 'Ministry of State Security', JPY: 'Cabinet Intelligence and Research Office', KRW: 'National Intelligence Service', AUD: 'Australian Secret Intelligence Service',
};

/** Real national police forces (by currency code). */
export const POLICE_NAMES: Record<string, string> = {
  USD: 'Federal Bureau of Investigation', CAD: 'Royal Canadian Mounted Police', MXN: 'National Guard', BRL: 'Federal Police',
  ARS: 'Argentine Federal Police', GBP: 'National Crime Agency', EUR: 'Federal Criminal Police Office (BKA)', RUB: 'Ministry of Internal Affairs (MVD)',
  TRY: 'General Directorate of Security', SAR: 'Public Security', ZAR: 'South African Police Service', INR: 'Central Bureau of Investigation',
  CNY: 'Ministry of Public Security', JPY: 'National Police Agency', KRW: 'Korean National Police Agency', AUD: 'Australian Federal Police',
};

/** Organised-crime naming styles per nation; {L} surname, {C} city, {N} number, {W} word. */
export const SYNDICATE_STYLES: Record<string, { patterns: string[]; words: string[]; kind: string }> = {
  USD: { patterns: ['the {L} Family', '{C} Outfit', 'the {L} Crew'], words: [], kind: 'mafia family' },
  CAD: { patterns: ['the {L} Family', '{C} Crew', '{W} Riders MC'], words: ['Hells', 'Iron', 'North'], kind: 'crime family' },
  MXN: { patterns: ['Cártel de {C}', 'Los {W}', 'Cártel del {W}'], words: ['Zetas', 'Golfo', 'Pacífico', 'Norte', 'Halcones'], kind: 'cartel' },
  BRL: { patterns: ['Comando {W}', 'Primeiro Comando de {C}', 'Família do {W}'], words: ['Vermelho', 'Norte', 'Capital', 'Sul'], kind: 'faction' },
  ARS: { patterns: ['Banda de {C}', 'Los {W}', 'Clan {L}'], words: ['Monos', 'Gordos', 'Porteños'], kind: 'gang' },
  GBP: { patterns: ['the {L} Firm', '{C} Firm', 'the {L} Brothers'], words: [], kind: 'firm' },
  EUR: { patterns: ['Clan {L}', '{C} Syndikat', '{W} MC'], words: ['Rhein', 'Nord', 'Stahl'], kind: 'clan' },
  RUB: { patterns: ['{C} Bratva', '{W} Brotherhood', 'the {L} Group'], words: ['Solntsevo', 'Tambov', 'Volga', 'Ural'], kind: 'bratva' },
  TRY: { patterns: ['{L} Clan', '{C} Gang', 'the {L} Family'], words: [], kind: 'clan' },
  SAR: { patterns: ['{C} Smuggling Ring', '{L} Network'], words: [], kind: 'ring' },
  ZAR: { patterns: ['the {N}s', '{C} {W}', 'the {L} Syndicate'], words: ['Americans', 'Hard Livings', 'Mongrels'], kind: 'gang' },
  INR: { patterns: ['{L} Company', '{C} Gang', 'the {L} Syndicate'], words: [], kind: 'company' },
  CNY: { patterns: ['{N}K Triad', '{W} Lotus Society', '{W} Dragon Society'], words: ['Red', 'Black', 'Golden', 'Jade', 'White'], kind: 'triad' },
  JPY: { patterns: ['{L}-gumi', '{L}-kai', '{C} Rengō'], words: [], kind: 'yakuza clan' },
  KRW: { patterns: ['{C}-pa', '{W}-pa', 'the {L} Faction'], words: ['Chilsung', 'Yangeun', 'Seobang'], kind: 'pa' },
  AUD: { patterns: ['{W} MC', 'the {L} Crew', '{C} Syndicate'], words: ['Rebels', 'Comancheros', 'Bandidos', 'Nomads'], kind: 'bikie gang' },
};
