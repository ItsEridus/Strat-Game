// Icons and the brand emblem. Navigation and HUD use one consistent line-icon
// set (Lucide, ISC licence; only the icons imported here are bundled). Story
// text and news keep their emoji.
import {
  Anchor, ArrowLeftRight, Backpack, ChevronLeft, ChevronRight, Bell, BookOpen, Briefcase, Building, Earth, Eye, Factory, Flag, Flame, Gavel, GraduationCap,
  Handshake, HardHat, House, Inbox, Landmark, LibraryBig, Map as MapIcon, MapPinned, Medal, Menu, Newspaper, Pickaxe, Settings, ShieldHalf,
  ShoppingBag, ShoppingCart, Siren, Sprout, Store, Swords, Target, Trophy, UserCog, UserRound, Users, UsersRound, Utensils, Vote, Zap,
} from 'lucide-preact';
import type { LucideIcon } from 'lucide-preact';

type Lucide = LucideIcon;

export const SCREEN_ICONS: Record<string, Lucide> = {
  dashboard: House, life: Sprout, local: MapPinned, journal: BookOpen, character: UserRound, inventory: Backpack, missions: Target,
  equipment: ShieldHalf, academy: GraduationCap, mining: Pickaxe, jobs: Briefcase, companies: Factory, market: ShoppingCart,
  fx: ArrowLeftRight, business: Store, holdings: Building, auctions: Gavel, contracts: Handshake, shop: ShoppingBag, politics: Vote,
  congress: Landmark, construction: HardHat, wars: Flame, forces: Medal, rankings: Trophy, battle: Swords, units: UsersRound,
  events: Anchor, stadium: Trophy, people: Users, crime: Siren, intel: Eye, world: Earth, map: MapIcon, country: Flag, press: Newspaper,
  library: LibraryBig, news: Bell, inbox: Inbox, settings: Settings, citizen: UserRound, admin: UserCog,
};

export const HUD_ICONS = { menu: Menu, energy: Zap, meals: Utensils, back: ChevronLeft, forward: ChevronRight };

/** A screen's icon (line icon if there is one, else its emoji). */
export function ScreenIcon({ id, fallback, size = 17 }: { id: string; fallback?: string; size?: number }) {
  const I = SCREEN_ICONS[id];
  return I ? <I size={size} strokeWidth={1.75} class="ico" aria-hidden /> : <span class="ico">{fallback}</span>;
}

/** The Meridian Reach emblem: a globe crossed by meridians inside a gold ring. */
export function Emblem({ size = 28, class: cls }: { size?: number; class?: string }) {
  return (
    <svg class={`emblem ${cls ?? ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="em-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d98b" /><stop offset="1" stop-color="#b8862f" /></linearGradient>
        <radialGradient id="em-sea" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#2a5a8f" /><stop offset="1" stop-color="#0b1a2e" /></radialGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="none" stroke="url(#em-gold)" stroke-width="3" />
      <circle cx="32" cy="32" r="23" fill="url(#em-sea)" />
      <g fill="none" stroke="#f7d98b" stroke-opacity=".75" stroke-width="1.4">
        <ellipse cx="32" cy="32" rx="9" ry="23" />
        <ellipse cx="32" cy="32" rx="17" ry="23" />
        <line x1="32" y1="9" x2="32" y2="55" />
        <path d="M11 24 Q32 29 53 24 M9.5 32 H54.5 M11 40 Q32 35 53 40" stroke-opacity=".45" />
      </g>
      <path d="M32 2.5 L34 8 L32 7 L30 8 Z" fill="url(#em-gold)" />
    </svg>
  );
}
