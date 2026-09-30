// Optional nuclear escalation and espionage (DOC costs, timings and outcome
// odds). Production needs congressional authorisation and a level-5 base; a
// strike flies 8 hours with a warning, then destroys all building levels and
// stored warheads in the target and damages connected regions. Stockpile
// sabotage (defusal) targets stored warheads only — interception of missiles in
// flight is not modelled, since sources don't establish it.
import type { Citizen, Id, World } from './types';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { fail, ok, type Result } from '../engine/result';
import { burn, consume } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { HOUR } from '../engine/clock';
import { nid, notify, record, schedule } from '../engine/events';
import { chance } from '../engine/rng';
import { authorize } from './authority';
import { controller, cref, natref, player, seatShare, studyActive } from './query';
import type { ExtraProposal } from './congressExtra';
import { relation } from './congress';
import { activeWars, enemyOf } from './war';

export function nukeCosts(w: World, nation: Id) {
  const f = 1 + (seatShare(w, w.nations[nation]).centralism ?? 0) * IDEOLOGIES.centralism.fx.nukeCost;
  return { gold: g(B.nuke.gold * f), oil: Math.round(B.nuke.oil * f), iron: Math.round(B.nuke.iron * f), titanium: Math.round(B.nuke.titanium * f), hours: Math.round(B.nuke.prodHours * f) };
}

function nukeCheck(w: World, nation: Id, params: Record<string, any>): string | null {
  if (!w.settings.advanced.nuclear) return 'Nuclear weapons are disabled in this campaign.';
  const n = w.nations[nation];
  const r = w.regions[params.region];
  if (!r || r.owner !== nation || controller(r) !== nation) return 'Choose a region your nation holds.';
  if (r.bld.base < B.buildings.nukeLevel) return `Requires a level-${B.buildings.nukeLevel} military base there.`;
  if (n.nukeProd) return 'A warhead is already in production.';
  const c = nukeCosts(w, nation);
  if ((n.wallet[GOLD] ?? 0) < c.gold) return `Treasury needs ${c.gold / 1000} gold.`;
  for (const k of ['oil', 'iron', 'titanium'] as const) if ((n.inv[k] ?? 0) < c[k]) return `National storage needs ${c[k].toLocaleString()} ${k} (has ${(n.inv[k] ?? 0).toLocaleString()}).`;
  return null;
}

export const NUKE_PROPOSAL: ExtraProposal = {
  info: { name: 'Authorise a nuclear warhead', fullTerm: true },
  describe(w, n, p) {
    const c = nukeCosts(w, n.id);
    return { effect: `Produce one warhead at ${w.regions[p.region]?.name ?? '?'} in ${c.hours}h, consuming ${c.gold / 1000} gold, ${c.oil.toLocaleString()} oil, ${c.iron.toLocaleString()} iron and ${c.titanium.toLocaleString()} titanium from the treasury and national storage.`, cost: c.gold };
  },
  check: (w, n, _c, p) => nukeCheck(w, n.id, p),
  support: (w, n) => (activeWars(w).some((x) => x.att === n.id || x.def === n.id) ? 0.1 : -0.4) + (seatShare(w, n).centralism ?? 0) * 0.4,
  enact(w, n, p) {
    const why = nukeCheck(w, n.id, p.params);
    if (why) return `Not started: ${why}`;
    const c = nukeCosts(w, n.id);
    burn(w, natref(n.id), GOLD, c.gold, 'Nuclear programme');
    for (const k of ['oil', 'iron', 'titanium'] as const) consume(w, natref(n.id), k, c[k], 'nuclear programme');
    n.nukeProd = { region: p.params.region, done: w.time + c.hours * HOUR };
    schedule(w, n.nukeProd.done, 'nukeBuilt', { nation: n.id });
    record(w, 'nuclear', `☢️ ${n.name} began producing a nuclear warhead.`, { nation: n.id, important: true });
    return `Warhead ready in ${c.hours} hours.`;
  },
  aiOptions(w, n) {
    if (!w.settings.advanced.nuclear || n.nukeProd) return [];
    const r = w.regions.find((x) => x.owner === n.id && x.bld.base >= B.buildings.nukeLevel && !nukeCheck(w, n.id, { region: x.id }));
    return r && activeWars(w).some((x) => x.att === n.id || x.def === n.id) ? [{ params: { region: r.id }, weight: 0.3 }] : [];
  },
};

export function onNukeBuilt(w: World, nation: Id) {
  const n = w.nations[nation];
  if (!n.nukeProd) return;
  const rid = n.nukeProd.region;
  const slot = n.warheads.find((x) => x.region === rid);
  if (slot) slot.count++; else n.warheads.push({ region: rid, count: 1 });
  n.nukeProd = null;
  record(w, 'nuclear', `☢️ ${n.name} completed a nuclear warhead.`, { nation, important: true });
}

export function launchCheck(w: World, actor: Id, from: Id, target: Id): string | null {
  if (!w.settings.advanced.nuclear) return 'Nuclear weapons are disabled.';
  const nat = w.citizens[actor]?.nation;
  if (nat == null || authorize(w, actor, natref(nat), 'nuke')) return 'Only the president, vice president or defense minister can launch.';
  const n = w.nations[nat];
  const slot = n.warheads.find((x) => x.region === from && x.count > 0);
  if (!slot) return 'No warhead stored there.';
  const tr = w.regions[target];
  if (!tr) return 'Pick a target.';
  if (!activeWars(w).some((x) => (x.att === nat || x.def === nat) && enemyOf(x, nat) === controller(tr))) return 'You can only strike a nation you are at war with.';
  return null;
}

export function launch(w: World, actor: Id, from: Id, target: Id): Result {
  const why = launchCheck(w, actor, from, target);
  if (why) return fail(why);
  const nat = w.citizens[actor].nation;
  const n = w.nations[nat];
  const slot = n.warheads.find((x) => x.region === from)!;
  slot.count--;
  n.warheads = n.warheads.filter((x) => x.count > 0);
  const id = nid(w);
  w.nukes[id] = { id, from: nat, target, launched: w.time, arrives: w.time + B.nuke.flightHours * HOUR, status: 'flying' };
  schedule(w, w.nukes[id].arrives, 'nukeArrive', { id });
  const victim = controller(w.regions[target]);
  relation(w, nat, victim, -40, 'nuclear launch');
  for (const o of w.nations) if (o.id !== nat && o.id !== victim) relation(w, nat, o.id, -15, 'nuclear launch (diplomatic incident)');
  record(w, 'nuclear', `🚀 ${n.name} launched a nuclear missile at ${w.regions[target].name}! Impact in ${B.nuke.flightHours} hours.`, { nation: nat, region: target, important: true });
  if (victim === player(w).nation) notify(w, 'warHome', `🚀 NUCLEAR WARNING: a missile from ${n.name} will strike ${w.regions[target].name} in ${B.nuke.flightHours} hours.`, { critical: true });
  return ok('Missile launched.');
}

export function onNukeArrive(w: World, id: Id) {
  const nk = w.nukes[id];
  if (!nk || nk.status !== 'flying') return;
  nk.status = 'hit';
  const r = w.regions[nk.target];
  const lost = r.bld.hospital + r.bld.fields + r.bld.industrial + r.bld.base;
  r.bld = { hospital: 0, fields: 0, industrial: 0, base: 0 };
  let heads = 0;
  for (const n of w.nations) { const s = n.warheads.find((x) => x.region === r.id); if (s) { heads += s.count; n.warheads = n.warheads.filter((x) => x !== s); } }
  for (const l of r.links) { const o = w.regions[l]; for (const k of Object.keys(o.bld) as (keyof typeof o.bld)[]) o.bld[k] = Math.max(0, o.bld[k] - 1); }
  r.pollution = 1;
  record(w, 'nuclear', `☢️ A nuclear strike devastated ${r.name}: ${lost} building levels destroyed${heads ? `, ${heads} stored warheads lost` : ''}; neighbouring regions damaged.`, { region: r.id, important: true });
  if (controller(r) === player(w).nation || r.owner === player(w).nation) notify(w, 'warHome', `☢️ ${r.name} was hit by a nuclear strike.`, { critical: true });
}

// ---------- espionage ----------
export function reconCheck(w: World, c: Citizen, target: Id): string | null {
  if (!w.settings.advanced.nuclear) return 'Espionage is part of the disabled nuclear system.';
  if (!studyActive(w, c, 'secretagent')) return 'Requires the Secret Agent study (Academy).';
  if (w.regions[c.loc].bld.base < B.buildings.nukeLevel) return `Requires a level-${B.buildings.nukeLevel} military base at your location.`;
  if ((c.flags.reconCd ?? 0) > w.time) return `Cooldown: ${Math.ceil(((c.flags.reconCd ?? 0) - w.time) / 60)}h.`;
  if (target === c.nation || !w.nations[target]) return 'Pick a foreign nation.';
  return null;
}

/** Reconnaissance: 70% hidden success, 20% exposed success, 10% exposed failure (DOC). */
export function recon(w: World, c: Citizen, target: Id): Result {
  const why = reconCheck(w, c, target);
  if (why) return fail(why);
  c.flags.reconCd = w.time + B.spy.cooldownHours * HOUR;
  const x = chance(w, B.spy.recon[0]) ? 0 : chance(w, B.spy.recon[1] / (1 - B.spy.recon[0])) ? 1 : 2;
  const t = w.nations[target];
  if (x < 2) {
    c.flags.intel = (c.flags.intel ?? 0) + 10;
    c.flags[`intel_${target}`] = w.time;
  }
  if (x > 0) {
    relation(w, c.nation, target, -10, 'espionage exposed');
    record(w, 'espionage', `🕵️ ${t.name} exposed a ${w.nations[c.nation].name} agent (${c.name}).`, { nation: target, cit: c.id, player: c.player });
  }
  const stock = t.warheads.map((s) => `${s.count} at ${w.regions[s.region].name}`).join(', ') || 'none';
  return x === 2 ? fail('Mission failed and exposed: diplomatic incident.') : ok(`Recon ${x === 0 ? 'undetected' : 'succeeded but was exposed'}: +10 intel. ${t.name} warheads: ${stock}.`);
}

export function defuseCheck(w: World, c: Citizen, target: Id, region: Id): string | null {
  if (!studyActive(w, c, 'secretagent')) return 'Requires the Secret Agent study.';
  if ((c.flags.intel ?? 0) < B.spy.defuseIntel) return `Needs ${B.spy.defuseIntel} intelligence (from reconnaissance).`;
  if ((c.wallet[GOLD] ?? 0) < g(B.spy.defuseGold)) return `Needs ${B.spy.defuseGold} gold.`;
  if ((c.inv['ticket:1'] ?? 0) < B.spy.defuseTickets) return `Needs ${B.spy.defuseTickets} Q1 tickets.`;
  if (!w.nations[target]?.warheads.some((s) => s.region === region && s.count > 0)) return 'No known warheads there.';
  return null;
}

/** Defusal per warhead: 25% hidden destruction, 25% exposed destruction, 50% exposed failure (DOC). */
export function defuse(w: World, c: Citizen, target: Id, region: Id): Result {
  const why = defuseCheck(w, c, target, region);
  if (why) return fail(why);
  c.flags.intel -= B.spy.defuseIntel;
  burn(w, cref(c.id), GOLD, g(B.spy.defuseGold), 'Sabotage operation');
  consume(w, cref(c.id), 'ticket:1', B.spy.defuseTickets, 'sabotage operation');
  const slot = w.nations[target].warheads.find((s) => s.region === region)!;
  let destroyed = 0, exposed = false;
  const n0 = slot.count;
  for (let i = 0; i < n0; i++) {
    const r = Math.floor(chance(w, 0.5) ? (chance(w, 0.5) ? 0 : 1) : 2);
    if (r < 2) { destroyed++; slot.count--; }
    if (r > 0) exposed = true;
  }
  w.nations[target].warheads = w.nations[target].warheads.filter((s) => s.count > 0);
  if (exposed) { relation(w, c.nation, target, -15, 'sabotage exposed'); record(w, 'espionage', `🕵️ Sabotage against ${w.nations[target].name}'s warheads was exposed.`, { nation: target, player: c.player }); }
  return ok(`Destroyed ${destroyed}/${n0} warheads${exposed ? ' — the operation was exposed' : ' undetected'}.`);
}

/** AI: a losing nation at war with warheads may strike the enemy's most developed region. */
export function nuclearAI(w: World) {
  if (!w.settings.advanced.nuclear) return;
  const pl = player(w);
  for (const n of w.nations) {
    if (!n.warheads.length) continue;
    const actor = n.cabinet.defense ?? n.president;
    if (actor == null || actor === pl.id) continue;
    const war = activeWars(w).find((x) => x.att === n.id || x.def === n.id);
    if (!war || n.warScore > -30 || !chance(w, 0.1)) continue;
    const enemy = enemyOf(war, n.id);
    const target = w.regions.filter((r) => controller(r) === enemy).sort((a, b) => (b.bld.base + b.bld.industrial + b.bld.hospital) - (a.bld.base + a.bld.industrial + a.bld.hospital))[0];
    if (target) launch(w, actor, n.warheads[0].region, target.id);
  }
}
