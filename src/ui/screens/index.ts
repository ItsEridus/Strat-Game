import type { FunctionComponent } from 'preact';
import type { World } from '../../sim/types';
import { Dashboard } from './Dashboard';
import { Character } from './Character';
import { Inventory } from './Inventory';
import { Jobs } from './Jobs';
import { Companies } from './Companies';
import { Market } from './Market';
import { Currency } from './Currency';
import { MapScreen } from './Map';
import { Missions } from './Missions';
import { News } from './News';
import { Inbox } from './Inbox';
import { Settings } from './Settings';
import { CitizenProfile } from './Citizen';
import { Country } from './Country';
import { Politics } from './Politics';
import { Congress } from './Congress';
import { Construction } from './Construction';

export interface ScreenDef { id: string; label: string; icon: string; group: string; comp: FunctionComponent<{ w: World }>; hidden?: boolean; badge?: (w: World) => number }

export const SCREENS: ScreenDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', group: 'Citizen', comp: Dashboard },
  { id: 'character', label: 'Character', icon: '🧍', group: 'Citizen', comp: Character, badge: (w) => w.citizens[w.playerId].attrPts },
  { id: 'inventory', label: 'Inventory & Bank', icon: '🎒', group: 'Citizen', comp: Inventory },
  { id: 'missions', label: 'Missions', icon: '🎯', group: 'Citizen', comp: Missions },
  { id: 'jobs', label: 'Employment', icon: '💼', group: 'Economy', comp: Jobs },
  { id: 'companies', label: 'Companies', icon: '🏭', group: 'Economy', comp: Companies },
  { id: 'market', label: 'Goods Market', icon: '🛒', group: 'Economy', comp: Market },
  { id: 'fx', label: 'Currency Market', icon: '💱', group: 'Economy', comp: Currency },
  { id: 'politics', label: 'Parties & Elections', icon: '🗳️', group: 'Politics', comp: Politics },
  { id: 'congress', label: 'Congress', icon: '📜', group: 'Politics', comp: Congress, badge: (w) => Object.values(w.proposals).filter((p) => p.status === 'open' && p.nation === w.citizens[w.playerId].nation && (w.nations[p.nation].deputies.includes(w.playerId) || w.nations[p.nation].president === w.playerId) && !p.votes[w.playerId]).length },
  { id: 'construction', label: 'Construction', icon: '🏗️', group: 'Politics', comp: Construction },
  { id: 'map', label: 'World Map', icon: '🗺️', group: 'World', comp: MapScreen },
  { id: 'country', label: 'Country', icon: '🏛️', group: 'World', comp: Country },
  { id: 'news', label: 'News & Alerts', icon: '📰', group: 'World', comp: News },
  { id: 'inbox', label: 'Inbox', icon: '✉️', group: 'World', comp: Inbox },
  { id: 'settings', label: 'Settings & Saves', icon: '⚙️', group: 'Game', comp: Settings },
  { id: 'citizen', label: 'Citizen', icon: '👤', group: 'World', comp: CitizenProfile, hidden: true },
];
