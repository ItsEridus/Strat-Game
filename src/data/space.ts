// Space in 2025 (2.4 Frontiers): each country's space agency, whether it can launch on its
// own, and the strength of its satellite constellations (0–100; the strongest in the world
// in 2025 is 100). Rounded from the UCS Satellite Database and agency reports:
// - communications (Starlink makes the US the leader; OneWeb gives Britain a large fleet);
// - reconnaissance (imaging and signals satellites);
// - navigation (GPS, GLONASS, BeiDou, and the regional NavIC and QZSS systems).
export interface SpaceStart { agency: string; launcher: boolean; comms: number; recon: number; nav: number; done?: string[] }
export const SPACE_2025: Record<string, SpaceStart> = {
  USA: { agency: 'NASA', launcher: true, comms: 100, recon: 100, nav: 100, done: ['station', 'sample', 'outer'] },
  CHN: { agency: 'China National Space Administration', launcher: true, comms: 45, recon: 70, nav: 95, done: ['station'] },
  RUS: { agency: 'Roscosmos', launcher: true, comms: 30, recon: 40, nav: 75, done: ['station'] },
  IND: { agency: 'Indian Space Research Organisation', launcher: true, comms: 20, recon: 30, nav: 35 },
  JPN: { agency: 'Japan Aerospace Exploration Agency', launcher: true, comms: 20, recon: 30, nav: 35, done: ['sample'] },
  KOR: { agency: 'Korea AeroSpace Administration', launcher: true, comms: 10, recon: 20, nav: 0 },
  GBR: { agency: 'UK Space Agency', launcher: false, comms: 50, recon: 15, nav: 0 },
  DEU: { agency: 'German Aerospace Center', launcher: false, comms: 15, recon: 25, nav: 30 }, // Galileo, shared with Europe
  CAN: { agency: 'Canadian Space Agency', launcher: false, comms: 15, recon: 15, nav: 0 },
  AUS: { agency: 'Australian Space Agency', launcher: false, comms: 8, recon: 5, nav: 0 },
  BRA: { agency: 'Brazilian Space Agency', launcher: false, comms: 8, recon: 6, nav: 0 },
  ARG: { agency: 'CONAE', launcher: false, comms: 6, recon: 8, nav: 0 },
  MEX: { agency: 'Mexican Space Agency', launcher: false, comms: 6, recon: 2, nav: 0 },
  SAU: { agency: 'Saudi Space Agency', launcher: false, comms: 8, recon: 6, nav: 0 },
  TUR: { agency: 'Turkish Space Agency', launcher: false, comms: 8, recon: 8, nav: 0 },
  ZAF: { agency: 'South African National Space Agency', launcher: false, comms: 3, recon: 3, nav: 0 },
};

/** Prestige missions: crewed and robotic milestones beyond the technology tree's lunar base and Mars landing.
 * `level` is the space capability needed (technology relative to the 2025 leader, weighted by the size of the
 * economy; the United States in 2025 is 100), and `notBefore` the earliest year it can fly (missions take years
 * to prepare: NASA's Artemis landing is planned for about 2027, China's for 2030). Missions already flown by 2025
 * are listed in SPACE_2025. */
export interface Mission { id: string; name: string; icon: string; level: number; crewed: boolean; desc: string; notBefore: number }
export const MISSIONS: Mission[] = [
  { id: 'station', name: 'A national space station', icon: '🛰️', level: 75, crewed: true, notBefore: 2027, desc: 'A crewed station of its own in orbit.' },
  { id: 'sample', name: 'An asteroid sample return', icon: '☄️', level: 58, crewed: false, notBefore: 2027, desc: 'Pieces of an asteroid brought back to Earth.' },
  { id: 'moon', name: 'Astronauts on the Moon', icon: '👩‍🚀', level: 78, crewed: true, notBefore: 2028, desc: 'Its own astronauts walking on the Moon (the first since Apollo).' },
  { id: 'outer', name: 'A probe to the outer planets', icon: '🪐', level: 68, crewed: false, notBefore: 2030, desc: 'A spacecraft orbiting Jupiter or Saturn.' },
];
