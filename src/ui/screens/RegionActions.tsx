// Region-context actions: travel and citizenship (stage 2); invasions are added by the war UI.
import type { Region, World } from '../../sim/types';
import { ActBtn, Btn } from '../common';
import { itemName } from '../../data/items';
import { store } from '../store';
import { controller, player } from '../../sim/query';
import { applyCitizenship, citizenshipCheck, kmBetween, travel, travelOptions } from '../../sim/travel';
import { B } from '../../data/balance';
import { RegionWarActions } from './RegionWarActions';

export function RegionActions({ w, r }: { w: World; r: Region }) {
  const p = player(w);
  const nat = controller(r);
  const km = kmBetween(p.loc, r.id);
  const opts = r.id === p.loc ? [] : travelOptions(w, p, r.id);
  return (
    <>
      {r.id !== p.loc && (
        <>
          <h4>Travel here ({km.toLocaleString()} km from {w.regions[p.loc].name})</h4>
          <table class="table compact"><tbody>{opts.map((o) => (
            <tr><td>{o.label}</td><td>{o.energy}⚡{o.ticket ? ` + 1 ${itemName(o.ticket).toLowerCase()}` : ''}</td>
              <td><ActBtn small why={o.why} showWhy={false} run={(w) => travel(w, p, r.id, o.id)}>Go</ActBtn></td></tr>
          ))}</tbody></table>
          <p class="small muted">Tickets come from transit companies (Goods Market → Tickets). Better grades go farther for less energy; going overland only works between bordering regions.</p>
        </>
      )}
      {r.project != null && w.projects[r.project] && !w.projects[r.project].done && <Btn small onClick={() => store.go('construction', { conNat: w.projects[r.project!].nation })}>Construction site →</Btn>}
      {p.nation !== nat && (
        <>
          <h4>Citizenship</h4>
          <ActBtn small why={citizenshipCheck(w, p, nat)} run={(w) => applyCitizenship(w, p, nat)}>Apply for {w.nations[nat].name} citizenship ({B.citizenship.cost} gold)</ActBtn>
        </>
      )}
      <RegionWarActions w={w} r={r} />
    </>
  );
}
