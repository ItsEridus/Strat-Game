// Identity (2.9): your pride and regional attachment; a country's pride and division.
import type { Citizen, Id, World } from '../../sim/types';
import { Bar, Help, Panel } from '../common';
import { divisionOf, prideOf, prideOfNation, regionalOf } from '../../sim/identity';
import { identityOf } from '../../sim/secession';

export function IdentityPanel({ w, p }: { w: World; p: Citizen }) {
  const r = w.regions[p.home];
  return (
    <div>
      <table class="table compact small"><tbody>
        <tr><td>Pride in {w.nations[p.nation].name}</td><td><Bar v={prideOf(w, p)} max={100} color="#c0884a" label={`${prideOf(w, p)}`} /></td></tr>
        <tr><td>Attachment to {r.name}</td><td><Bar v={regionalOf(w, p)} max={100} color="#4a9cc0" label={`${regionalOf(w, p)}`} /></td></tr>
      </tbody></table>
      <Help>Pride follows your country's fortunes (its economy, standing, wars and government), your age, how much you value community and your politics; people who came from abroad, or who speak a minority language, are less attached to the nation and more to where they came from. Attachment to a region is strongest where it has an identity of its own ({r.name}: {identityOf(r) >= 15 ? 'distinct' : 'not especially distinct'}). The proud lean towards nationalist parties; strong regional identities feed independence movements.</Help>
    </div>
  );
}

export function NationIdentityPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  return (
    <Panel title="🏳️ Identity">
      <table class="table compact small"><tbody>
        <tr><td>National pride</td><td><Bar v={prideOfNation(n)} max={100} color="#c0884a" label={`${Math.round(prideOfNation(n))}`} /></td></tr>
        <tr><td>Division</td><td><Bar v={divisionOf(n)} max={100} color="#b05f5f" label={`${Math.round(divisionOf(n))}${divisionOf(n) > 60 ? ': deeply divided' : divisionOf(n) > 40 ? ': divided' : ''}`} /></td></tr>
      </tbody></table>
      <Help>Pride starts from the World Values Survey (most Indians, Mexicans and Turks are very proud of their country; few Germans, Japanese and Koreans say so) and moves with the economy, soft power, wars and the government. A country divided between opposed political camps, with many newcomers under a nationalist government or minorities who feel apart, is harder to govern.</Help>
    </Panel>
  );
}
