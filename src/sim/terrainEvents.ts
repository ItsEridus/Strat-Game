// Optional natural events (off by default): earthquakes, hurricanes, tsunamis and
// eruptions turn a region's terrain into desert, plains, forest or mountains.
// A rotation prevents a region being hit again before every other region has
// had its turn (wiki). Effects are written to world history.
import type { Terrain, World } from './types';
import { chance, pick } from '../engine/rng';
import { notify, record } from '../engine/events';
import { player } from './query';

const EVENTS: { name: string; terrain: Terrain }[] = [
  { name: 'earthquake', terrain: 'desert' }, { name: 'hurricane', terrain: 'plains' },
  { name: 'tsunami', terrain: 'forest' }, { name: 'volcanic eruption', terrain: 'mountains' },
];

export function terrainDaily(w: World) {
  if (!w.settings.advanced.terrainEvents || !chance(w, 1 / 10)) return;
  const done = (w.calendar.terrainDone = w.calendar.terrainDone ?? []);
  let pool = w.regions.filter((r) => !done.includes(r.id));
  if (!pool.length) { w.calendar.terrainDone = []; pool = w.regions; }
  const r = pick(w, pool);
  const ev = pick(w, EVENTS.filter((e) => e.terrain !== r.terrain));
  const before = r.terrain;
  r.terrain = ev.terrain;
  w.calendar.terrainDone!.push(r.id);
  record(w, 'nature', `🌋 A ${ev.name} struck ${r.name}: its terrain changed from ${before} to ${ev.terrain}.`, { region: r.id, important: true });
  if (r.owner === player(w).nation) notify(w, 'war', `🌋 ${r.name} is now ${ev.terrain} after a ${ev.name} — review defence plans.`, { link: 'map' });
}
