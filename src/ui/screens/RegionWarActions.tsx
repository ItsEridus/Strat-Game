// Invasion controls for a region on the map.
import type { Region, World } from '../../sim/types';
import { ActBtn } from '../common';
import { controller, player } from '../../sim/query';
import { activeWars, invasionCheck, isBorder, startInvasion, supplyRoute } from '../../sim/war';

export function RegionWarActions({ w, r }: { w: World; r: Region }) {
  const p = player(w);
  const wars = activeWars(w).filter((x) => (x.att === p.nation || x.def === p.nation) && (controller(r) === (x.att === p.nation ? x.def : x.att) || (r.owner === p.nation && r.occ)));
  const route = supplyRoute(w, r.id);
  return (
    <>
      <p class="small muted">Supply route to {w.nations[controller(r)].name}’s seat: {route.length ? route.map((id) => w.regions[id].name).join(' → ') : 'none (cut off)'}{r.bld.base >= 4 ? ' · protected by a level-4 base' : ''}</p>
      {wars.map((war) => (
        <div>
          <h4>War action</h4>
          <p class="small">{isBorder(w, p.nation, r.id) ? 'Shares a border with your territory: ground invasion.' : 'No shared border: air assault (only air weapons count).'} Terrain {r.terrain}: {r.terrain === 'plains' ? 'attackers +20%' : r.terrain === 'mountains' ? 'defenders +20%' : r.terrain === 'forest' ? '−10 accuracy for all' : 'hits cost double energy'}.</p>
          <ActBtn small why={invasionCheck(w, p.id, war, r.id)} run={(w) => startInvasion(w, p.id, war.id, r.id)}>{r.owner === p.nation ? 'Launch liberation' : 'Launch invasion'}</ActBtn>
        </div>
      ))}
    </>
  );
}
