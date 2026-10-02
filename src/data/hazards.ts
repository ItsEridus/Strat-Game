// Real-world natural hazard zones and seasons (calendar month 1–12;
// see engine/calendar.ts). Regions are "ISO3/Region" keys from the Earth map.
// Which disaster strikes, where and how hard is rolled per seed from these.
import type { CrisisKind } from '../sim/types';

export interface Hazard { kind: CrisisKind; months: number[]; weight: number; regions: string[]; spread: boolean; label: string }

const r = (iso: string, names: string) => names.split(',').map((n) => `${iso}/${n.trim()}`);

export const HAZARDS: Hazard[] = [
  { kind: 'hurricane', label: 'Hurricane', months: [7, 8, 9, 10], weight: 3, spread: true, regions: [...r('USA', 'Florida, Louisiana, Texas, Mississippi, Alabama, Georgia, South Carolina, North Carolina'), ...r('MEX', 'Quintana Roo, Yucatán, Tamaulipas, Veracruz, Baja California Sur, Sinaloa, Guerrero, Oaxaca')] },
  { kind: 'hurricane', label: 'Typhoon', months: [7, 8, 9, 10], weight: 3, spread: true, regions: [...r('JPN', 'Okinawa, Kagoshima, Miyazaki, Kōchi, Wakayama, Shizuoka, Chiba, Tokyo'), ...r('KOR', 'Jeju, South Jeolla, Busan, South Gyeongsang'), ...r('CHN', 'Guangdong, Hainan, Fujian, Zhejiang, Guangxi, Shanghai')] },
  { kind: 'hurricane', label: 'Cyclone', months: [5, 10, 11, 12, 1, 2, 3], weight: 2, spread: true, regions: [...r('IND', 'Odisha, Andhra Pradesh, West Bengal, Tamil Nadu, Gujarat'), ...r('AUS', 'Queensland, Northern Territory, Western Australia')] },
  { kind: 'earthquake', label: 'Earthquake', months: [], weight: 2.5, spread: false, regions: [
    ...r('USA', 'California, Alaska, Washington, Oregon, Nevada, Utah, Hawaii'),
    ...r('JPN', 'Tokyo, Kanagawa, Chiba, Shizuoka, Miyagi, Iwate, Fukushima, Hokkaidō, Hyōgo, Ōsaka, Kumamoto, Niigata, Ishikawa'),
    ...r('TUR', 'Istanbul, İzmir, Kahramanmaraş, Hatay, Gaziantep, Malatya, Adıyaman, Erzincan, Van, Düzce, Kocaeli, Sakarya, Bingöl, Elazığ'),
    ...r('MEX', 'Mexico City, Guerrero, Oaxaca, Michoacán, Chiapas, Puebla, Jalisco'),
    ...r('CHN', 'Sichuan, Yunnan, Qinghai, Xinjiang, Gansu, Tibet'),
    ...r('IND', 'Jammu and Kashmir, Uttarakhand, Himachal Pradesh, Assam, Gujarat, Sikkim, Manipur'),
    ...r('RUS', 'Kamchatka Krai, Sakhalin Oblast'), ...r('ARG', 'San Juan, Mendoza'), ...r('CAN', 'British Columbia'),
  ] },
  { kind: 'flood', label: 'Monsoon floods', months: [6, 7, 8, 9], weight: 3, spread: true, regions: [...r('CHN', 'Hubei, Hunan, Jiangxi, Anhui, Henan, Guangdong, Guangxi, Chongqing, Sichuan'), ...r('IND', 'Bihar, Assam, West Bengal, Kerala, Uttar Pradesh, Maharashtra'), ...r('KOR', 'Seoul, Gyeonggi'), ...r('JPN', 'Fukuoka, Kumamoto, Hiroshima')] },
  { kind: 'flood', label: 'Floods', months: [3, 4, 5, 6, 7], weight: 1.5, spread: true, regions: [...r('DEU', 'Rhineland-Palatinate, North Rhine-Westphalia, Bavaria, Saxony'), ...r('USA', 'Louisiana, Missouri, Iowa, Mississippi, Arkansas'), ...r('ARG', 'Buenos Aires Province, Santa Fe')] },
  { kind: 'flood', label: 'Floods', months: [11, 12, 1, 2, 3], weight: 1.5, spread: true, regions: [...r('BRA', 'Rio Grande do Sul, Rio de Janeiro, Minas Gerais, São Paulo, Amazonas'), ...r('GBR', 'England, Wales, Scotland'), ...r('ZAF', 'KwaZulu-Natal, Eastern Cape')] },
  { kind: 'wildfire', label: 'Wildfires', months: [6, 7, 8, 9, 10], weight: 2.5, spread: true, regions: [...r('USA', 'California, Oregon, Washington, Colorado, Arizona, Montana, Idaho'), ...r('CAN', 'British Columbia, Alberta, Quebec, Northwest Territories'), ...r('RUS', 'Sakha Republic, Krasnoyarsk Krai, Irkutsk Oblast, Zabaykalsky Krai, Republic of Buryatia'), ...r('TUR', 'Muğla, Antalya, İzmir'), ...r('BRA', 'Amazonas, Pará, Mato Grosso')] },
  { kind: 'wildfire', label: 'Bushfires', months: [11, 12, 1, 2], weight: 2, spread: true, regions: r('AUS', 'New South Wales, Victoria, South Australia, Western Australia, Tasmania') },
  { kind: 'blizzard', label: 'Blizzard', months: [12, 1, 2], weight: 2, spread: true, regions: [...r('USA', 'Minnesota, North Dakota, Michigan, New York, Massachusetts, Montana, Wisconsin'), ...r('CAN', 'Ontario, Quebec, Manitoba, Saskatchewan, Newfoundland and Labrador'), ...r('RUS', 'Moscow, Moscow Oblast, Novosibirsk Oblast, Omsk Oblast, Sverdlovsk Oblast, Saint Petersburg'), ...r('JPN', 'Hokkaidō, Niigata, Aomori, Akita'), ...r('CHN', 'Heilongjiang, Jilin, Inner Mongolia'), ...r('KOR', 'Gangwon')] },
  { kind: 'drought', label: 'Drought', months: [6, 7, 8, 9], weight: 1.5, spread: true, regions: [...r('USA', 'Texas, Oklahoma, Kansas, Nebraska, California'), ...r('IND', 'Rajasthan, Maharashtra, Karnataka, Telangana'), ...r('CHN', 'Henan, Shandong, Hebei'), ...r('MEX', 'Sonora, Chihuahua, Coahuila'), ...r('TUR', 'Konya')] },
  { kind: 'eruption', label: 'Volcanic eruption', months: [], weight: 0.3, spread: true, regions: [...r('JPN', 'Kagoshima, Kumamoto, Nagano, Hokkaidō, Shizuoka'), ...r('USA', 'Hawaii, Washington, Alaska'), ...r('MEX', 'Puebla, Colima'), ...r('RUS', 'Kamchatka Krai'), ...r('ARG', 'Neuquén'), ...r('IND', 'Andaman and Nicobar Islands')] },
  { kind: 'drought', label: 'Drought', months: [12, 1, 2, 3], weight: 1.5, spread: true, regions: [...r('AUS', 'New South Wales, Queensland, South Australia, Victoria'), ...r('ZAF', 'Western Cape, Northern Cape, Free State'), ...r('BRA', 'Ceará, Piauí, Bahia, Pernambuco'), ...r('ARG', 'Buenos Aires Province, Córdoba')] },
];

export const EPIDEMIC_NAMES = { first: ['Crimson', 'Grey', 'Northern', 'Harbour', 'Delta', 'Coastal', 'Highland', 'River', 'Winter', 'Swamp'], second: ['Fever', 'Flu', 'Cough', 'Pox', 'Virus', 'Plague'] };

export const COMMODITY_EVENTS: { item: string; up: string; down: string }[] = [
  { item: 'oil', up: 'Oil glut: new fields flood the market', down: 'Oil supply shock: producers cut output' },
  { item: 'grain', up: 'Bumper harvests worldwide', down: 'Global harvest failure' },
  { item: 'iron', up: 'Iron ore boom', down: 'Iron ore mine disasters disrupt supply' },
  { item: 'titanium', up: 'New titanium deposits come online', down: 'Titanium export bans' },
];
