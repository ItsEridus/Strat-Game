// Ancestral places (3.0): the family home, graves and memorials, the place you were born.
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Help } from '../common';
import { fmtAmt } from '../../engine/money';
import { dateAt } from '../../engine/calendar';
import { birthplaceOf, familyHomeLabel, gravesOf, homecoming, homecomingCheck, memorialCheck, memorialCost, raiseMemorial, visitGrave, visitGraveCheck } from '../../sim/ancestry';

export function AncestryPanel({ w, p }: { w: World; p: Citizen }) {
  const graves = gravesOf(w, p);
  const code = w.nations[p.nation].cur;
  return (
    <div>
      <p class="small">🏡 {familyHomeLabel(p) ? `You live in ${familyHomeLabel(p)}.` : 'Your home has no family history yet.'} You were born in {w.regions[birthplaceOf(p)].name}. <ActBtn small kind="ghost" why={homecomingCheck(w, p)} run={(w) => homecoming(w)}>Go back</ActBtn></p>
      {graves.length ? <table class="table compact small"><tbody>{graves.map((g) => (
        <tr><td>🪦 {g.name} <span class="muted">({dateAt(g.born).year}–{dateAt(g.gone!.t).year}), {w.regions[g.home].name}{g.memorial ? ', with a memorial' : ''}</span></td>
          <td><ActBtn small kind="ghost" why={visitGraveCheck(w, p, g.id)} run={(w) => visitGrave(w, g.id)}>Visit</ActBtn><ActBtn small kind="ghost" why={memorialCheck(w, p, g.id)} run={(w) => raiseMemorial(w, g.id)}>Memorial ({fmtAmt(code, memorialCost())})</ActBtn></td></tr>
      ))}</tbody></table> : <p class="small muted">No family graves yet.</p>}
      <Help>A home handed down to an heir who lives there stays the family home and counts its generations. The family's dead lie where they lived: visiting their graves eases grief that would not ease, and a memorial honours them and the family name. Going back to where you were born, after years away, is a homecoming.</Help>
    </div>
  );
}
