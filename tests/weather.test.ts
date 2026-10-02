import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit } from '../src/engine/ledger';
import { combatWeather, constructionFactor, energyDemand, flightsGrounded, forecast, normals, weatherAt, weatherOf, zoneOf } from '../src/sim/weather';
import { formationsOf } from '../src/sim/forces';
import { player } from '../src/sim/query';
import { travelOptions } from '../src/sim/travel';

registerSystems();
const fresh = (seed = 401) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 1 });

test('climates follow latitude, terrain and the hemisphere', () => {
  const w = fresh();
  const cap = (iso: string) => w.nations.find((n) => n.iso === iso)!.capital;
  const mos = cap('RUS'), riy = cap('SAU'), ba = cap('ARG');
  assert.equal(zoneOf(w, riy), 'arid');
  assert.ok(normals(w, mos, 15).t < -5 && normals(w, mos, 196).t > 15, 'Moscow: cold winters, warm summers');
  assert.ok(normals(w, ba, 15).t > normals(w, ba, 196).t + 8, 'Buenos Aires: summer in January');
  assert.ok(normals(w, riy, 15).wet < 0.1);
});

test('daily weather persists, forecasts are close, and weather has consequences', () => {
  const w = fresh(402);
  advance(w, 2 * DAY, false);
  const s = weatherOf(w);
  assert.ok(Object.keys(s.today).length === w.regions.length);
  const r = w.nations[0].capital;
  const f = forecast(w, r);
  assert.ok(Math.abs(f.t - s.tomorrow[r].t) <= 8, 'forecast within a few degrees');
  // Force a storm and check its effects.
  s.today[r] = { t: -15, mm: 30, wind: 90, kind: 'storm' };
  assert.ok(constructionFactor(w, r) < 0.5);
  assert.ok(energyDemand(w, r) > 1.5, 'heating in the cold');
  const other = w.regions.find((x) => x.id !== r)!.id;
  assert.match(flightsGrounded(w, r, other) ?? '', /storm/);
  const p = player(w);
  p.loc = r;
  assert.ok(travelOptions(w, p, other).filter((o) => o.ticket).every((o) => /storm|ticket|reach|energy/.test(o.why ?? '')));
  const fl = formationsOf(w, 0).find((x) => x.branch === 'air');
  if (fl) { fl.loc = r; assert.ok(combatWeather(w, fl).mult < 1); }
  assert.ok(weatherAt(w, r).kind === 'storm');
  assert.ok(audit(w).ok);
});

test('a year of weather produces seasons and rain near observed amounts', () => {
  const w = fresh(403);
  const r = w.nations.find((n) => n.iso === 'GBR')!.capital;
  let wet = 0, jan = 0, jul = 0;
  const t0 = w.time;
  for (let d = 0; d < 365; d++) { w.time = t0 + d * DAY; const x = weatherOf(w).today[r]; if (x.mm > 0) wet++; if (d < 31) jan += x.t; if (d >= 181 && d < 212) jul += x.t; }
  assert.ok(wet > 70 && wet < 160, `${wet} wet days in England`);
  assert.ok(jul / 31 > jan / 31 + 8, 'summer is warmer');
});
