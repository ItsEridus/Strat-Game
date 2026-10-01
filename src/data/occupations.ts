// Occupations (1.5 GEO 1): sixty jobs in fourteen families, each with the
// qualification it needs and its pay relative to a typical wage. Pay ratios follow
// US BLS occupational medians against the all-occupation median (2024, rounded);
// other countries use the same ratios at their own pay level.
import type { Industry } from '../sim/types';
import type { EduLevel, Field } from './education';

export type Family = 'agriculture' | 'extraction' | 'manufacturing' | 'trades' | 'retail' | 'transport' | 'office' | 'finance' | 'it' | 'health' | 'education' | 'public' | 'security' | 'arts' | 'science';
export interface Occupation { label: string; family: Family; pay: number; edu: EduLevel; field?: Field[]; industries?: Industry[] }

export const FAMILY_LABEL: Record<Family, string> = {
  agriculture: 'Agriculture', extraction: 'Mining and energy', manufacturing: 'Manufacturing', trades: 'Skilled trades', retail: 'Retail and hospitality',
  transport: 'Transport and logistics', office: 'Office and administration', finance: 'Finance', it: 'IT', health: 'Health', education: 'Education',
  public: 'Public administration', security: 'Security and defence', arts: 'Arts and media', science: 'Science and engineering',
};

export const OCCUPATIONS: Record<string, Occupation> = {
  // Agriculture
  farmhand: { label: 'Farm labourer', family: 'agriculture', pay: 0.7, edu: 'school', industries: ['grain', 'cotton'] },
  farmer: { label: 'Farmer', family: 'agriculture', pay: 0.95, edu: 'vocational', industries: ['grain', 'cotton'] },
  agronomist: { label: 'Agronomist', family: 'agriculture', pay: 1.4, edu: 'bachelor', field: ['science', 'engineering'], industries: ['grain', 'cotton'] },
  forester: { label: 'Forestry worker', family: 'agriculture', pay: 0.85, edu: 'school', industries: ['timber'] },
  sawyer: { label: 'Sawmill operator', family: 'agriculture', pay: 0.9, edu: 'vocational', industries: ['timber'] },
  // Mining and energy
  miner: { label: 'Miner', family: 'extraction', pay: 1.1, edu: 'school', industries: ['iron', 'copper', 'titanium'] },
  plantop: { label: 'Plant operator', family: 'extraction', pay: 1.2, edu: 'vocational', industries: ['iron', 'copper', 'titanium', 'oil'] },
  miningeng: { label: 'Mining engineer', family: 'extraction', pay: 2.0, edu: 'bachelor', field: ['engineering'], industries: ['iron', 'copper', 'titanium'] },
  roughneck: { label: 'Oil rig worker', family: 'extraction', pay: 1.3, edu: 'school', industries: ['oil'] },
  petroleng: { label: 'Petroleum engineer', family: 'extraction', pay: 2.8, edu: 'bachelor', field: ['engineering'], industries: ['oil'] },
  // Manufacturing
  foodworker: { label: 'Food processing worker', family: 'manufacturing', pay: 0.78, edu: 'school', industries: ['food'] },
  baker: { label: 'Baker', family: 'manufacturing', pay: 0.8, edu: 'vocational', industries: ['food'] },
  foodtech: { label: 'Food technologist', family: 'manufacturing', pay: 1.3, edu: 'bachelor', field: ['science'], industries: ['food'] },
  assembler: { label: 'Assembler', family: 'manufacturing', pay: 0.9, edu: 'school', industries: ['wg', 'wa', 'electronics'] },
  machinist: { label: 'Machinist', family: 'manufacturing', pay: 1.1, edu: 'vocational', field: ['trades', 'engineering'], industries: ['wg', 'wa', 'materials'] },
  sewer: { label: 'Sewing machinist', family: 'manufacturing', pay: 0.68, edu: 'school', industries: ['clothing'] },
  tailor: { label: 'Tailor', family: 'manufacturing', pay: 0.8, edu: 'vocational', industries: ['clothing'] },
  designer: { label: 'Fashion designer', family: 'arts', pay: 1.5, edu: 'bachelor', field: ['arts'], industries: ['clothing'] },
  pharmtech: { label: 'Pharmaceutical technician', family: 'manufacturing', pay: 0.9, edu: 'vocational', industries: ['medicine'] },
  chemist: { label: 'Chemist', family: 'science', pay: 1.7, edu: 'bachelor', field: ['science', 'medicine'], industries: ['medicine', 'oil'] },
  pharmacist: { label: 'Pharmacist', family: 'health', pay: 2.7, edu: 'master', field: ['medicine'], industries: ['medicine'] },
  electrical: { label: 'Electronics engineer', family: 'science', pay: 2.2, edu: 'bachelor', field: ['engineering'], industries: ['electronics', 'wa'] },
  aeroeng: { label: 'Aerospace engineer', family: 'science', pay: 2.6, edu: 'bachelor', field: ['engineering'], industries: ['wa'] },
  // Skilled trades
  labourer: { label: 'Construction labourer', family: 'trades', pay: 0.9, edu: 'school', industries: ['materials'] },
  bricklayer: { label: 'Bricklayer', family: 'trades', pay: 1.1, edu: 'vocational', industries: ['materials'] },
  electrician: { label: 'Electrician', family: 'trades', pay: 1.3, edu: 'vocational', field: ['trades', 'engineering'], industries: ['electronics', 'materials'] },
  plumber: { label: 'Plumber', family: 'trades', pay: 1.3, edu: 'vocational', field: ['trades'] },
  carpenter: { label: 'Carpenter', family: 'trades', pay: 1.1, edu: 'vocational', field: ['trades'], industries: ['timber', 'materials'] },
  mechanic: { label: 'Mechanic', family: 'trades', pay: 1.0, edu: 'vocational', field: ['trades', 'engineering'], industries: ['ticket', 'wg'] },
  sitemanager: { label: 'Site manager', family: 'trades', pay: 2.1, edu: 'bachelor', field: ['engineering', 'business'], industries: ['materials'] },
  // Retail and hospitality
  cashier: { label: 'Cashier', family: 'retail', pay: 0.62, edu: 'school' },
  shopasst: { label: 'Shop assistant', family: 'retail', pay: 0.66, edu: 'school' },
  waiter: { label: 'Waiter', family: 'retail', pay: 0.6, edu: 'school' },
  chef: { label: 'Chef', family: 'retail', pay: 0.85, edu: 'vocational' },
  cleaner: { label: 'Cleaner', family: 'retail', pay: 0.65, edu: 'school' },
  // Transport and logistics
  busdriver: { label: 'Bus driver', family: 'transport', pay: 0.95, edu: 'school', industries: ['ticket'] },
  traindriver: { label: 'Train driver', family: 'transport', pay: 1.5, edu: 'vocational', industries: ['ticket'] },
  trucker: { label: 'Truck driver', family: 'transport', pay: 1.0, edu: 'school', industries: ['ticket', 'grain', 'timber'] },
  warehouse: { label: 'Warehouse worker', family: 'transport', pay: 0.8, edu: 'school', industries: ['food', 'clothing', 'electronics', 'medicine', 'materials'] },
  pilot: { label: 'Airline pilot', family: 'transport', pay: 4.0, edu: 'bachelor', field: ['engineering'], industries: ['ticket'] },
  logistics: { label: 'Logistics manager', family: 'transport', pay: 1.8, edu: 'bachelor', field: ['business'], industries: ['ticket', 'food', 'electronics'] },
  // Office and administration
  receptionist: { label: 'Receptionist', family: 'office', pay: 0.75, edu: 'school' },
  admin: { label: 'Administrative assistant', family: 'office', pay: 0.95, edu: 'school', industries: ['oil', 'electronics', 'medicine', 'wa'] },
  officemgr: { label: 'Office manager', family: 'office', pay: 1.4, edu: 'bachelor', field: ['business', 'law'] },
  // Finance
  bankclerk: { label: 'Bank clerk', family: 'finance', pay: 0.85, edu: 'school' },
  accountant: { label: 'Accountant', family: 'finance', pay: 1.65, edu: 'bachelor', field: ['business'], industries: ['oil', 'electronics', 'medicine', 'food'] },
  analyst: { label: 'Financial analyst', family: 'finance', pay: 2.2, edu: 'master', field: ['business'] },
  // IT
  itsupport: { label: 'IT support technician', family: 'it', pay: 1.2, edu: 'vocational', field: ['engineering', 'science'], industries: ['electronics'] },
  developer: { label: 'Software developer', family: 'it', pay: 2.6, edu: 'bachelor', field: ['engineering', 'science'], industries: ['electronics', 'wa'] },
  // Health
  careworker: { label: 'Care worker', family: 'health', pay: 0.7, edu: 'school' },
  nurse: { label: 'Nurse', family: 'health', pay: 1.6, edu: 'vocational', field: ['medicine'] },
  paramedic: { label: 'Paramedic', family: 'health', pay: 1.0, edu: 'vocational', field: ['medicine'] },
  doctor: { label: 'Doctor', family: 'health', pay: 4.5, edu: 'master', field: ['medicine'] },
  surgeon: { label: 'Surgeon', family: 'health', pay: 6.0, edu: 'doctorate', field: ['medicine'] },
  // Education
  assistant: { label: 'Teaching assistant', family: 'education', pay: 0.7, edu: 'school' },
  teacher: { label: 'Teacher', family: 'education', pay: 1.3, edu: 'bachelor' },
  lecturer: { label: 'University lecturer', family: 'education', pay: 1.7, edu: 'doctorate' },
  // Public administration
  civilservant: { label: 'Civil servant', family: 'public', pay: 1.2, edu: 'school' },
  lawyer: { label: 'Lawyer', family: 'public', pay: 3.0, edu: 'master', field: ['law'] },
  // Security and defence
  guard: { label: 'Security guard', family: 'security', pay: 0.75, edu: 'school', industries: ['wg', 'wa', 'oil'] },
  police: { label: 'Police officer', family: 'security', pay: 1.5, edu: 'school' },
  soldier: { label: 'Soldier', family: 'security', pay: 1.0, edu: 'school' },
  officer: { label: 'Military officer', family: 'security', pay: 1.9, edu: 'bachelor' },
  // Arts and media
  journalist: { label: 'Journalist', family: 'arts', pay: 1.2, edu: 'bachelor', field: ['arts', 'law'] },
  musician: { label: 'Musician', family: 'arts', pay: 0.85, edu: 'school' },
  // Science and engineering
  scientist: { label: 'Research scientist', family: 'science', pay: 2.0, edu: 'doctorate', field: ['science', 'medicine', 'engineering'], industries: ['medicine', 'electronics', 'wa'] },
  civileng: { label: 'Civil engineer', family: 'science', pay: 1.95, edu: 'bachelor', field: ['engineering'], industries: ['materials'] },
};
export const OCCUPATION_KEYS = Object.keys(OCCUPATIONS);
