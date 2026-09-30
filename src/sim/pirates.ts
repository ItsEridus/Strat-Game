// Reusable timed event engine, used for recurring pirate invasions: temporary
// sea "regions" (ships) defended by event NPCs (not citizens, so they never take
// citizen rewards). Nations that capture ships run Resource Depots (+10%
// production per level for their citizens' and organisations' companies, 2%
// Bazaar discount, DOC). Cleanup at the end removes ships, depots and battles.
import type { GameEvent, Id, World } from './types';
import { B } from '../data/balance';
import { fail, ok, type Result } from '../engine/result';
import { burn } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { DAY } from '../engine/clock';
import { nid, notify, record, schedule } from '../engine/events';
import { rand } from '../engine/rng';
import { authorize } from './authority';
import { activeBattles, createBattle, finishBattle } from './battle';
import { natref, player } from './query';

export const PIRATES = -1; // event faction id
const SHIP_NAMES = ['Black Gull', 'Salt Wraith', 'Red Tide', 'Iron Kraken', 'Grey Lantern', 'Storm Widow', 'Coral Fang', 'Night Heron'];

export const activeEvent = (w: World) => Object.values(w.events).find((e) => e.status === 'active');

export function startPirates(w: World): GameEvent {
  const ev: GameEvent = {
    id: nid(w), kind: 'pirates', start: w.time, end: w.time + B.pirates.lengthDays * DAY, status: 'active',
    ships: Array.from({ length: B.pirates.ships }, (_, i) => ({ id: i, name: SHIP_NAMES[i % SHIP_NAMES.length], holder: null, battle: null, defenders: B.pirates.defenders, depot: 0 })),
  };
  w.events[ev.id] = ev;
  schedule(w, ev.end, 'eventEnd', { id: ev.id });
  record(w, 'event', `🏴‍☠️ A pirate fleet of ${ev.ships.length} ships has appeared off the coast! Nations may seize them for Resource Depots.`, { important: true });
  notify(w, 'war', `🏴‍☠️ Pirate invasion! Capture ships for your nation (Events screen). Cutlasses are sold in the Bazaar while it lasts.`, { link: 'events' });
  return ev;
}

/** Daily: start an invasion on the recurring schedule (optional system). */
export function piratesDaily(w: World) {
  if (!w.settings.advanced.pirates || activeEvent(w)) return;
  const last = Object.values(w.events).sort((a, b) => b.end - a.end)[0];
  const since = last ? w.time - last.end : w.time - 20 * DAY + B.pirates.everyDays * DAY;
  if (since >= B.pirates.everyDays * DAY) startPirates(w);
}

export function attackShipCheck(w: World, actor: Id, shipIdx: number): string | null {
  const ev = activeEvent(w);
  if (!ev) return 'No pirate fleet at sea.';
  const ship = ev.ships[shipIdx];
  if (!ship) return 'Unknown ship.';
  const nation = w.citizens[actor]?.nation;
  if (nation == null || authorize(w, actor, natref(nation), 'war')) return 'Launching boarding actions requires the president, vice president or defense minister.';
  if (ship.battle != null && w.battles[ship.battle] && !w.battles[ship.battle].done) return 'A boarding battle is already underway.';
  if (ship.holder === nation) return 'Your nation already holds this ship.';
  if (activeBattles(w).some((b) => b.kind === 'event' && b.att === nation)) return 'Your nation is already boarding a ship.';
  return null;
}

export function attackShip(w: World, actor: Id, shipIdx: number): Result {
  const why = attackShipCheck(w, actor, shipIdx);
  if (why) return fail(why);
  const ev = activeEvent(w)!;
  const ship = ev.ships[shipIdx];
  const nation = w.citizens[actor].nation;
  const def = ship.holder ?? PIRATES;
  const b = createBattle(w, 'event', -1 - shipIdx, nation, def, null, false, ev.id);
  ship.battle = b.id;
  record(w, 'event', `⚓ ${w.nations[nation].name} boards the pirate ship ${ship.name}${def >= 0 ? ` held by ${w.nations[def].name}` : ''}.`, { nation });
  return ok(`Boarding action against ${ship.name} launched.`);
}

/** Per tick: pirate defenders (event NPCs) fight back with scripted strength. */
export function pirateTick(w: World) {
  const ev = activeEvent(w);
  if (!ev) return;
  for (const s of ev.ships) {
    const b = s.battle != null ? w.battles[s.battle] : null;
    if (!b || b.done || b.def !== PIRATES) continue;
    const dmg = Math.round(s.defenders * 90 * (1 + w.time / DAY / 200) * rand(w, 0.7, 1.3)); // SOLO pirate strength
    b.dmg.d += dmg;
    b.hits.d += s.defenders;
  }
}

export function onEventBattleWon(w: World, b: { eventRef?: Id; region: Id; att: Id; def: Id; rounds: { winner: 'a' | 'd' }[] }, winner: 'a' | 'd') {
  const ev = b.eventRef != null ? w.events[b.eventRef] : null;
  if (!ev) return;
  const ship = ev.ships[-1 - b.region];
  if (!ship) return;
  ship.battle = null;
  ship.defenders = Math.max(2, ship.defenders - b.rounds.filter((r) => r.winner === 'a').length * 2);
  if (winner !== 'a') { record(w, 'event', `🏴‍☠️ The ${ship.name} repelled ${w.nations[b.att].name}.`); return; }
  const prev = ship.holder;
  ship.holder = b.att;
  ship.depot = 1;
  record(w, 'event', `⚓ ${w.nations[b.att].name} captured the ${ship.name}${prev != null ? ` from ${w.nations[prev].name}` : ''} and opened a Resource Depot.`, { nation: b.att, important: prev == null });
  if (b.att === player(w).nation) notify(w, 'progress', `⚓ Your nation captured the ${ship.name}: +${B.pirates.depotBonus * 100}% production and ${B.pirates.depotDiscount * 100}% Bazaar discount.`, { link: 'events' });
}

export function upgradeDepot(w: World, actor: Id, shipIdx: number): Result {
  const ev = activeEvent(w);
  const ship = ev?.ships[shipIdx];
  if (!ev || !ship) return fail('No such ship.');
  const nation = w.citizens[actor]?.nation;
  if (ship.holder !== nation) return fail('Your nation does not hold this ship.');
  if (authorize(w, actor, natref(nation), 'build')) return fail('Requires construction authority.');
  if (ship.depot >= 5) return fail('Depot at level 5.');
  const cost = g(5 * ship.depot);
  if (!burn(w, natref(nation), GOLD, cost, 'Resource depot upgrade')) return fail(`Needs ${5 * ship.depot} gold in the treasury.`);
  ship.depot++;
  return ok(`${ship.name} depot upgraded to level ${ship.depot}.`);
}

export function onEventEnd(w: World, id: Id) {
  const ev = w.events[id];
  if (!ev || ev.status !== 'active') return;
  for (const s of ev.ships) { const b = s.battle != null ? w.battles[s.battle] : null; if (b && !b.done) finishBattle(w, b, null); }
  ev.status = 'ended';
  const held = ev.ships.filter((s) => s.holder != null).map((s) => `${s.name} (${w.nations[s.holder!].name}, depot ${s.depot})`);
  record(w, 'event', `🌊 The pirate fleet sailed away. ${held.length ? `Held at the end: ${held.join(', ')}.` : 'No ship was taken.'} Depots are dismantled until the next invasion.`, { important: true });
}

/** AI: each nation boards one ship at a time and upgrades depots it holds. */
export function piratesAI(w: World) {
  const ev = activeEvent(w);
  if (!ev) return;
  const pl = player(w);
  for (const n of w.nations) {
    if (n.exile) continue;
    const actor = n.cabinet.defense ?? n.president;
    if (actor == null || actor === pl.id) continue;
    const free = ev.ships.map((s, i) => ({ s, i })).filter(({ i }) => !attackShipCheck(w, actor, i));
    const t = free.sort((a, b) => (a.s.holder == null ? 0 : 1) - (b.s.holder == null ? 0 : 1) || a.s.defenders - b.s.defenders)[0];
    if (t && ev.ships.filter((s) => s.holder === n.id).length < 2) attackShip(w, actor, t.i);
    const dev = n.cabinet.development ?? n.president;
    if (dev != null && dev !== pl.id) for (let i = 0; i < ev.ships.length; i++) if (ev.ships[i].holder === n.id && (n.wallet.GOLD ?? 0) > g(80)) upgradeDepot(w, dev, i);
  }
}
