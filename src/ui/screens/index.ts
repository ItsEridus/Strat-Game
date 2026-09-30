import type { FunctionComponent } from 'preact';
import { Journal } from './Journal';
import { Life } from './Life';
import { pendingReview } from '../../sim/lifecycle';
import { Local } from './Local';
import { Admin } from './Admin';
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
import { Wars } from './Wars';
import { BattleScreen } from './Battle';
import { Units } from './Units';
import { Equipment } from './Equipment';
import { Holdings } from './Holdings';
import { Auctions } from './Auctions';
import { Contracts } from './Contracts';
import { Academy } from './Academy';
import { Mining } from './Mining';
import { Shop, BusinessMarket } from './Shop';
import { Press } from './Press';
import { Library } from './Library';
import { Stadium } from './Stadium';
import { Events } from './Events';
import { Crime } from './Crime';
import { Intel } from './Intel';
import { WorldState } from './WorldState';
import { People } from './People';
import { Forces } from './Forces';
import { Rankings } from './Rankings';

export interface ScreenDef { id: string; label: string; icon: string; group: string; comp: FunctionComponent<{ w: World }>; hidden?: boolean; badge?: (w: World) => number }

export const SCREENS: ScreenDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', group: 'Citizen', comp: Dashboard },
  { id: 'life', label: 'My Life', icon: '🌱', group: 'Citizen', comp: Life, badge: (w) => (pendingReview(w) ? 1 : 0) },
  { id: 'local', label: 'Neighbourhood', icon: '🏘️', group: 'Citizen', comp: Local, },
  { id: 'journal', label: 'Journal', icon: '📖', group: 'Citizen', comp: Journal, badge: (w) => Object.values(w.story.instances).filter((i) => i.status === 'offered' || i.status === 'active').length },
  { id: 'character', label: 'Character', icon: '🧍', group: 'Citizen', comp: Character },
  { id: 'inventory', label: 'Inventory & Bank', icon: '🎒', group: 'Citizen', comp: Inventory },
  { id: 'missions', label: 'Missions', icon: '🎯', group: 'Citizen', comp: Missions },
  { id: 'equipment', label: 'Equipment', icon: '🪖', group: 'Citizen', comp: Equipment },
  { id: 'academy', label: 'Academy', icon: '🎓', group: 'Citizen', comp: Academy },
  { id: 'mining', label: 'Gold Mining', icon: '⛏️', group: 'Citizen', comp: Mining },
  { id: 'jobs', label: 'Employment', icon: '💼', group: 'Economy', comp: Jobs },
  { id: 'companies', label: 'Companies', icon: '🏭', group: 'Economy', comp: Companies },
  { id: 'market', label: 'Goods Market', icon: '🛒', group: 'Economy', comp: Market },
  { id: 'fx', label: 'Currency Market', icon: '💱', group: 'Economy', comp: Currency },
  { id: 'business', label: 'Business Market', icon: '🏪', group: 'Economy', comp: BusinessMarket },
  { id: 'holdings', label: 'Holdings & Stocks', icon: '🏢', group: 'Economy', comp: Holdings },
  { id: 'auctions', label: 'Auctions', icon: '🔨', group: 'Economy', comp: Auctions },
  { id: 'contracts', label: 'Contracts', icon: '🤝', group: 'Economy', comp: Contracts, badge: (w) => Object.values(w.contracts).filter((c) => c.status === 'open' && c.to === w.playerId).length },
  { id: 'shop', label: 'Bazaar', icon: '🛍️', group: 'Economy', comp: Shop },
  { id: 'politics', label: 'Parties & Elections', icon: '🗳️', group: 'Politics', comp: Politics },
  { id: 'congress', label: 'Congress', icon: '📜', group: 'Politics', comp: Congress, badge: (w) => Object.values(w.proposals).filter((p) => p.status === 'open' && p.nation === w.citizens[w.playerId].nation && (w.nations[p.nation].deputies.includes(w.playerId) || w.nations[p.nation].president === w.playerId) && !p.votes[w.playerId]).length },
  { id: 'construction', label: 'Construction', icon: '🏗️', group: 'Politics', comp: Construction },
  { id: 'wars', label: 'Wars', icon: '🔥', group: 'Military', comp: Wars, badge: (w) => Object.values(w.wars).filter((x) => x.status === 'active' && (x.att === w.citizens[w.playerId].nation || x.def === w.citizens[w.playerId].nation)).length },
  { id: 'forces', label: 'Armed Forces', icon: '🎖️', group: 'Military', comp: Forces },
  { id: 'rankings', label: 'Rankings', icon: '🏆', group: 'Military', comp: Rankings },
  { id: 'battle', label: 'Battle', icon: '⚔️', group: 'Military', comp: BattleScreen },
  { id: 'units', label: 'Military Unit', icon: '🎖️', group: 'Military', comp: Units },
  { id: 'events', label: 'Events & Strategic', icon: '🏴‍☠️', group: 'Military', comp: Events, badge: (w) => Object.values(w.events).filter((e) => e.status === 'active').length },
  { id: 'stadium', label: 'Stadium', icon: '🏟️', group: 'Military', comp: Stadium },
  { id: 'people', label: 'People', icon: '👥', group: 'Society', comp: People },
  { id: 'crime', label: 'Law & Order', icon: '⚖️', group: 'Society', comp: Crime, badge: (w) => Object.values(w.cases).filter((k) => k.status === 'open' && k.suspect === w.playerId).length },
  { id: 'intel', label: 'Intelligence', icon: '🕵️', group: 'Society', comp: Intel },
  { id: 'world', label: 'World Situation', icon: '🌐', group: 'Society', comp: WorldState, badge: (w) => Object.values(w.crises).filter((c) => c.status === 'active' && c.nation === w.citizens[w.playerId].nation && c.kind !== 'strike').length },
  { id: 'map', label: 'World Map', icon: '🗺️', group: 'World', comp: MapScreen },
  { id: 'country', label: 'Country', icon: '🏛️', group: 'World', comp: Country },
  { id: 'press', label: 'Newspapers', icon: '🗞️', group: 'World', comp: Press },
  { id: 'library', label: 'Library', icon: '📚', group: 'World', comp: Library },
  { id: 'news', label: 'News & Alerts', icon: '📰', group: 'World', comp: News },
  { id: 'inbox', label: 'Inbox', icon: '✉️', group: 'World', comp: Inbox },
  { id: 'settings', label: 'Settings & Saves', icon: '⚙️', group: 'Game', comp: Settings },
  { id: 'citizen', label: 'Citizen', icon: '👤', group: 'World', comp: CitizenProfile, hidden: true },
  { id: 'admin', label: 'Admin', icon: '🛠️', group: 'Game', comp: Admin, hidden: true },
];
