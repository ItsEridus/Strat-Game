// Regional construction: governments start projects; anyone contributes labour
// (energy → points) or materials. A project completes exactly once, consuming
// its materials and raising the building level.
import type { AccountRef, BuildingType, Citizen, Id, Nation, Project, World } from './types';
import { B } from '../data/balance';
import { IDEOLOGIES } from '../data/ideologies';
import { itemName } from '../data/items';
import { fail, ok, type Result } from '../engine/result';
import { acct, consume, itemsFromEscrow, itemsToEscrow, pay } from '../engine/ledger';
import { GOLD, g } from '../engine/money';
import { nid, notify, record } from '../engine/events';
import { authorize } from './authority';
import { addXp } from './citizen';
import { builderRank, gearStats } from './combatMath';
import { buffValue, controller, cref, natref, player, seatShare, studyActive, today } from './query';
import { bump } from './progress';
import { rollDrop } from './gear';

export const BUILDINGS: Record<BuildingType, { name: string; icon: string; effect: string }> = {
  hospital: { name: 'Hospital', icon: '🏥', effect: `+${B.energy.hospitalPerLevel} max energy per level for anyone in the region` },
  fields: { name: 'Production Fields', icon: '🌾', effect: `+${B.buildings.fieldsRaw * 100}% raw-material output per level` },
  industrial: { name: 'Industrial Zone', icon: '🏭', effect: `+${B.buildings.industrialFactory * 100}% factory output and +${B.pollution.industrialMitigation * 100}% pollution capacity per level` },
  base: { name: 'Military Base', icon: '🛡️', effect: `+${B.buildings.baseDefense * 100}% defender damage & +${B.buildings.baseAccuracy} accuracy per level; L4 protects supply; L5 enables nuclear production` },
};

function popFactor(pop: number) { return 0.5 + pop / 100000; }

export function projectNeeds(w: World, rid: Id, type: BuildingType, level: number, n: Nation) {
  const r = w.regions[rid];
  const sh = seatShare(w, n);
  const costMult = (1 + (sh.centralism ?? 0) * IDEOLOGIES.centralism.fx.constructionCost) * popFactor(r.pop);
  const needMats: Record<string, number> = {};
  for (const [k, v] of Object.entries(B.construction.mats[type])) needMats[k] = Math.round(v * level * costMult);
  return { needPts: Math.round(B.construction.needPtsPerLevel * level * popFactor(r.pop)), needMats };
}

export function startCheck(w: World, actor: Id, nation: Id, rid: Id, type: BuildingType): string | null {
  const auth = authorize(w, actor, natref(nation), 'build');
  if (auth) return 'Starting construction requires the president, vice president or development minister.';
  const r = w.regions[rid];
  if (!r) return 'Pick a region.';
  if (r.owner !== nation || r.occ) return 'You can only build in regions your nation owns and controls.';
  if (r.project != null && w.projects[r.project] && !w.projects[r.project].done) return 'This region already has a construction site.';
  if (r.bld[type] >= 5) return 'Already at level 5.';
  return null;
}

export function startProject(w: World, actor: Id, nation: Id, rid: Id, type: BuildingType): Result {
  const why = startCheck(w, actor, nation, rid, type);
  if (why) return fail(why);
  const r = w.regions[rid];
  const n = w.nations[nation];
  const level = r.bld[type] + 1;
  const need = projectNeeds(w, rid, type, level, n);
  const p: Project = { id: nid(w), region: rid, nation, type, level, points: 0, needPts: need.needPts, mats: {}, needMats: need.needMats, contrib: {}, started: w.time };
  w.projects[p.id] = p;
  r.project = p.id;
  if (n.priorities.project == null || w.projects[n.priorities.project]?.done) n.priorities.project = p.id;
  record(w, 'construction', `🏗️ ${n.name} began building ${BUILDINGS[type].name} L${level} in ${r.name}.`, { nation, region: rid, player: w.citizens[actor]?.player });
  return ok(`Construction site opened: ${BUILDINGS[type].name} L${level} in ${r.name}.`);
}

/** Construction points per 10-energy labour action for this citizen. */
export function laborPoints(w: World, c: Citizen, p: Project): number {
  const n = w.nations[p.nation];
  const sh = seatShare(w, n);
  const gs = gearStats(w, c);
  let pts = B.construction.ptsPerAction;
  pts *= 1 + builderRank(c.buildTotal).bonus;
  pts *= 1 + (c.attrs.cons * B.attrs.cons) / 100;
  pts *= 1 + (gs.build ?? 0) / 100;
  pts *= 1 + buffValue(w, c, 'hammer') * (studyActive(w, c, 'blacksmith') ? 1.5 : 1);
  pts *= 1 + (sh.centralism ?? 0) * IDEOLOGIES.centralism.fx.construction;
  return Math.round(pts * 10) / 10;
}

export function laborCheck(w: World, c: Citizen, p: Project | undefined): string | null {
  if (!p) return 'Project not found.';
  if (p.done) return 'This project is complete.';
  if (controller(w.regions[c.loc]) !== controller(w.regions[p.region])) return `Travel to ${w.nations[controller(w.regions[p.region])].name} to work on this site.`;
  if (p.points >= p.needPts) return 'Labour is complete; the site is waiting for materials.';
  if (c.energy < B.cost.build) return `Not enough energy (${Math.floor(c.energy)}/${B.cost.build}).`;
  return null;
}

export function contributeLabor(w: World, c: Citizen, pid: Id, times = 1): Result {
  const p = w.projects[pid];
  let done = 0, pts = 0;
  let why = laborCheck(w, c, p);
  if (why) return fail(why);
  while (done < times && !(why = laborCheck(w, c, p))) {
    c.energy -= B.cost.build;
    const add = Math.min(laborPoints(w, c, p), p.needPts - p.points);
    addPoints(w, p, c.id, add);
    c.buildTotal += add;
    pts += add;
    done++;
    addXp(w, c, B.xp.build);
    rollDrop(w, c, B.gear.dropBuild * (studyActive(w, c, 'extrashift') ? 2 : 1), 'construction');
    c.flags.buildDay = today(w);
    if (p.done) break;
  }
  if (c.player) { bump(w, 'buildAct', done); bump(w, 'buildPts', Math.round(pts)); }
  return ok(`Contributed ${done} labour shift${done > 1 ? 's' : ''}: +${pts.toFixed(0)} construction points${p.done ? ' — construction complete!' : ''}.`);
}

/** Add labour points (also used by public works) and check completion. */
export function addPoints(w: World, p: Project, who: Id | null, pts: number) {
  if (p.done) return;
  p.points = Math.min(p.needPts, p.points + pts);
  if (who != null) p.contrib[who] = (p.contrib[who] ?? 0) + pts;
  checkComplete(w, p);
}

export function donateCheck(w: World, actor: Id, from: AccountRef, p: Project | undefined, key: string, n: number): string | null {
  if (!p) return 'Project not found.';
  if (p.done) return 'This project is complete.';
  const auth = authorize(w, actor, from, from.k === 'nat' ? 'build' : 'trade');
  if (auth) return auth;
  if (!(key in p.needMats)) return `${itemName(key)} is not needed here.`;
  const missing = p.needMats[key] - (p.mats[key] ?? 0);
  if (missing <= 0) return `Enough ${itemName(key)} already delivered.`;
  if (!Number.isInteger(n) || n < 1) return 'Enter a quantity.';
  if ((acct(w, from)?.inv[key] ?? 0) < Math.min(n, missing)) return `Not enough ${itemName(key)} in storage.`;
  if (from.k === 'cit') {
    const c = w.citizens[from.id];
    if (c.mining) return 'Donations are blocked while mining.';
    if (controller(w.regions[c.loc]) !== controller(w.regions[p.region])) return 'Travel to the project’s country to deliver materials.';
  }
  return null;
}

export function donateMaterials(w: World, actor: Id, from: AccountRef, pid: Id, key: string, n: number): Result {
  const p = w.projects[pid];
  const why = donateCheck(w, actor, from, p, key, n);
  if (why) return fail(why);
  const amount = Math.min(n, p.needMats[key] - (p.mats[key] ?? 0));
  itemsToEscrow(w, from, key, amount);
  p.mats[key] = (p.mats[key] ?? 0) + amount;
  if (from.k === 'cit') {
    const c = w.citizens[from.id];
    const credit = amount * 2; // SOLO: 2 contribution points per delivered unit for rankings
    p.contrib[c.id] = (p.contrib[c.id] ?? 0) + credit;
    if (c.player) bump(w, 'buildAct');
  }
  checkComplete(w, p);
  return ok(`Delivered ${amount} ${itemName(key)}${p.done ? ' — construction complete!' : ''}.`);
}

function checkComplete(w: World, p: Project) {
  if (p.done || p.points < p.needPts) return;
  for (const [k, v] of Object.entries(p.needMats)) if ((p.mats[k] ?? 0) < v) return;
  // Complete exactly once: consume materials held in the site, raise the level.
  const site: AccountRef = natref(p.nation);
  for (const [k, v] of Object.entries(p.mats)) { itemsFromEscrow(w, site, k, v); consume(w, site, k, v, 'construction'); }
  p.mats = {};
  p.done = w.time;
  const r = w.regions[p.region];
  r.bld[p.type] = Math.max(r.bld[p.type], p.level);
  if (r.project === p.id) r.project = null;
  const n = w.nations[p.nation];
  if (n.priorities.project === p.id) n.priorities.project = null;
  const top = Object.entries(p.contrib).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => Number(id));
  const pool = g(B.construction.rewardPool);
  top.forEach((id, i) => {
    const c = w.citizens[id];
    if (!c) return;
    c.medals.builder = (c.medals.builder ?? 0) + (i === 0 ? 1 : 0);
    c.influence += 3 - i;
    const share = Math.floor(pool * [0.5, 0.3, 0.2][i]);
    pay(w, natref(p.nation), cref(id), GOLD, Math.min(share, n.wallet[GOLD] ?? 0), `Construction reward (${BUILDINGS[p.type].name})`);
  });
  const pl = player(w);
  record(w, 'construction', `🏗️ ${BUILDINGS[p.type].name} L${p.level} completed in ${r.name} (${n.name}). Top builder: ${w.citizens[top[0]]?.name ?? '—'}.`, { nation: n.id, region: r.id, important: true, player: top.includes(pl.id) });
  if (p.contrib[pl.id]) notify(w, 'progress', `🏗️ ${BUILDINGS[p.type].name} L${p.level} in ${r.name} is complete${top.includes(pl.id) ? ` — you placed #${top.indexOf(pl.id) + 1} among contributors` : ''}.`, { link: 'construction' });
}

export const activeProjects = (w: World, nation?: Id) => Object.values(w.projects).filter((p) => !p.done && (nation == null || p.nation === nation)).sort((a, b) => a.id - b.id);

/** Move national storage to a project (government authority). */
export function fundProject(w: World, actor: Id, pid: Id): Result {
  const p = w.projects[pid];
  if (!p) return fail('Project not found.');
  let moved = 0;
  for (const k of Object.keys(p.needMats)) {
    const missing = p.needMats[k] - (p.mats[k] ?? 0);
    const have = w.nations[p.nation].inv[k] ?? 0;
    const n = Math.min(missing, have);
    if (n > 0) { const r = donateMaterials(w, actor, natref(p.nation), pid, k, n); if (r.ok) moved += n; else return r; }
  }
  return moved ? ok(`Delivered ${moved} units from national storage.`) : fail('National storage has none of the missing materials.');
}

void studyActive;

/** Close a site without completing it: escrowed materials return to the nation's storage. */
export function cancelProject(w: World, p: Project, why: string) {
  if (p.done) return;
  for (const [k, v] of Object.entries(p.mats)) itemsFromEscrow(w, natref(p.nation), k, v);
  p.mats = {};
  p.done = w.time;
  p.cancelled = true;
  const r = w.regions[p.region];
  if (r.project === p.id) r.project = null;
  const n = w.nations[p.nation];
  if (n.priorities.project === p.id) n.priorities.project = null;
  record(w, 'construction', `🏚️ Construction of ${BUILDINGS[p.type].name} L${p.level} in ${r.name} was abandoned (${why}); materials returned to ${n.name}.`, { nation: n.id, region: r.id });
}
