// The near-future technology tree, 2025–2075 (2.4 Frontiers). Each technology belongs to
// one of the six technology domains of the strategic layer and becomes possible when a
// country's level in that domain reaches its threshold (100 is the world leader in
// 2025; leaders gain about a third of a point a year at today's R&D spending, more
// with more). Thresholds follow current research roadmaps: what labs already
// demonstrate sits near 100, what needs decades of progress sits higher, and
// breakthroughs that may never come (fusion power, human-level AI, slowing ageing)
// are both high and uncertain (a small chance each month even once possible).
// Effects:
// - productivity: extra growth (% a year) for ten years after adoption, a lasting gain
//   in output per worker;
// - military: a multiplier on the combat power of formations;
// - intel: added collection quality for the intelligence service;
// - lifespan: lower mortality (a share);
// - energy: a lower national energy price (a share);
// - automation: the share of routine jobs that machines can take (used from 2.3.5).
import type { TechDomain } from './nationBaselines';

export interface TechEffects { productivity?: number; military?: number; intel?: number; lifespan?: number; energy?: number; automation?: number; prestige?: number }
export interface TechDef { id: string; name: string; domain: TechDomain; level: number; uncertain?: boolean; icon: string; desc: string; fx: TechEffects }

export const TECHS: TechDef[] = [
  // Industry and automation
  { id: 'robotics', name: 'Advanced industrial robotics', domain: 'industrial', level: 100, icon: '🦾', desc: 'Flexible robots that learn tasks from demonstration.', fx: { productivity: 0.3, automation: 0.03 } },
  { id: 'additive', name: 'Industrial 3D printing', domain: 'industrial', level: 103, icon: '🖨️', desc: 'Metal parts printed to order: shorter supply chains.', fx: { productivity: 0.2 } },
  { id: 'humanoids', name: 'General-purpose humanoid robots', domain: 'industrial', level: 110, icon: '🤖', desc: 'Robots that work in spaces built for people: warehouses, care homes, building sites.', fx: { productivity: 0.6, automation: 0.08 } },
  // Information
  { id: 'aiagents', name: 'AI agents at work', domain: 'information', level: 101, icon: '🧠', desc: 'Software that carries out office work from start to finish.', fx: { productivity: 0.5, automation: 0.05, intel: 0.02 } },
  { id: 'chips2nm', name: 'Sub-2-nanometre chips', domain: 'information', level: 104, icon: '💽', desc: 'The most advanced semiconductors, made in very few places.', fx: { productivity: 0.2, military: 0.03 } },
  { id: 'pqc', name: 'Post-quantum cryptography', domain: 'information', level: 103, icon: '🔐', desc: 'Codes that quantum computers cannot break.', fx: { intel: 0.02 } },
  { id: 'cyberai', name: 'AI-driven cyber operations', domain: 'information', level: 106, icon: '🕸️', desc: 'Machines that find and exploit software flaws faster than people can patch them.', fx: { intel: 0.05 } },
  { id: 'quantum', name: 'Fault-tolerant quantum computers', domain: 'information', level: 112, icon: '⚛️', desc: 'Breaks today\'s codes (not post-quantum ones); speeds up chemistry and materials science.', fx: { intel: 0.06, productivity: 0.2 } },
  { id: 'agi', name: 'Human-level AI', domain: 'information', level: 118, uncertain: true, icon: '✨', desc: 'Machines that can do most intellectual work. It may never come; if it does, it changes everything.', fx: { productivity: 1.2, automation: 0.12, intel: 0.08, military: 0.08 } },
  // Military
  { id: 'swarms', name: 'Drone swarms', domain: 'military', level: 101, icon: '🐝', desc: 'Hundreds of cheap drones acting together.', fx: { military: 0.08 } },
  { id: 'hypersonic', name: 'Hypersonic missiles', domain: 'military', level: 104, icon: '🚀', desc: 'Manoeuvring missiles too fast for most defences.', fx: { military: 0.06 } },
  { id: 'laser', name: 'Directed-energy air defence', domain: 'military', level: 108, icon: '🔦', desc: 'Lasers that shoot down drones and missiles for the cost of the electricity.', fx: { military: 0.05 } },
  { id: 'autonomy', name: 'Autonomous combat systems', domain: 'military', level: 112, icon: '🛰️', desc: 'Vehicles, ships and aircraft that fight without crews.', fx: { military: 0.1 } },
  // Medicine
  { id: 'mrna', name: 'Personalised mRNA therapies', domain: 'medical', level: 101, icon: '💉', desc: 'Vaccines against cancers, designed for each patient.', fx: { lifespan: 0.05 } },
  { id: 'aidiagnosis', name: 'AI diagnosis', domain: 'medical', level: 103, icon: '🩺', desc: 'Earlier, cheaper diagnosis everywhere.', fx: { lifespan: 0.03, productivity: 0.1 } },
  { id: 'genetherapy', name: 'Gene therapy at scale', domain: 'medical', level: 106, icon: '🧬', desc: 'Inherited diseases cured with a single treatment.', fx: { lifespan: 0.05 } },
  { id: 'longevity', name: 'Slowing ageing', domain: 'medical', level: 116, uncertain: true, icon: '⏳', desc: 'Treatments that slow ageing itself. Uncertain.', fx: { lifespan: 0.12 } },
  // Energy
  { id: 'batteries', name: 'Solid-state batteries', domain: 'energy', level: 101, icon: '🔋', desc: 'Cheaper, safer storage for cars and grids.', fx: { energy: 0.04 } },
  { id: 'geothermal', name: 'Enhanced geothermal power', domain: 'energy', level: 103, icon: '🌋', desc: 'Heat from deep rock, almost anywhere.', fx: { energy: 0.04 } },
  { id: 'smr', name: 'Small modular reactors', domain: 'energy', level: 104, icon: '⚛️', desc: 'Factory-built nuclear plants.', fx: { energy: 0.07 } },
  { id: 'fusion', name: 'Commercial fusion power', domain: 'energy', level: 120, uncertain: true, icon: '☀️', desc: 'Power from fusion on the grid. A late and uncertain breakthrough.', fx: { energy: 0.3, productivity: 0.4 } },
  // Space
  { id: 'reusable', name: 'Fully reusable rockets', domain: 'space', level: 100, icon: '🚀', desc: 'Launch costs fall tenfold.', fx: { productivity: 0.05 } },
  { id: 'megaconst', name: 'Satellite mega-constellations', domain: 'space', level: 103, icon: '🛰️', desc: 'Thousands of satellites for communications and watching the Earth.', fx: { intel: 0.03, military: 0.03 } },
  { id: 'asat', name: 'Anti-satellite weapons', domain: 'space', level: 105, icon: '💥', desc: 'Missiles and lasers that can blind an enemy in orbit.', fx: { military: 0.02 } },
  { id: 'lunar', name: 'A permanent lunar base', domain: 'space', level: 112, icon: '🌕', desc: 'People living on the Moon.', fx: { prestige: 10 } },
  { id: 'mars', name: 'Crewed landing on Mars', domain: 'space', level: 118, uncertain: true, icon: '🔴', desc: 'The first people on another planet.', fx: { prestige: 20 } },
];
export const TECH: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
