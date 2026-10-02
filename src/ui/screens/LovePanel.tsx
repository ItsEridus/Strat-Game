// Love and the law (2.7): whom you are drawn to, and your country's family law.
import type { Citizen, World } from '../../sim/types';
import { Help, Select } from '../common';
import { store } from '../store';
import { fmtAmt } from '../../engine/money';
import { fmtDate } from '../../engine/calendar';
import { ORIENT_LABEL, SS_LABEL, lawOf, orientationOf, setOrientation, type Orientation } from '../../sim/partnership';

export function LovePanel({ w, p }: { w: World; p: Citizen }) {
  const n = w.nations[p.nation];
  const law = lawOf(n);
  const a = p.alimony;
  const owed = Object.values(w.citizens).find((x) => x.alimony?.to === p.id && !x.gone);
  return (
    <div>
      <div class="row small">You are drawn to <Select value={orientationOf(p)} options={(Object.keys(ORIENT_LABEL) as Orientation[]).map((o) => [o, o === 'straight' ? 'the other sex (straight)' : o === 'gay' ? 'your own sex (gay or lesbian)' : 'both (bisexual)'] as [Orientation, string])} onChange={(o) => store.act((w) => setOrientation(w, o))} /></div>
      <table class="table compact small"><tbody>
        <tr><td>In {n.name}</td><td>{SS_LABEL[law.ss]}</td></tr>
        <tr><td>Divorce</td><td>{law.note}{law.wait ? `; at least ${law.wait} days` : ''}</td></tr>
        <tr><td>Property</td><td>{Math.round(law.split * 100)}% of the difference between spouses' savings is evened out</td></tr>
        <tr><td>Maintenance</td><td>{law.alimony ? `up to ${law.alimony} year${law.alimony > 1 ? 's' : ''} from the better-off spouse` : 'rarely ordered'}</td></tr>
        {a && <tr><td>You pay</td><td>{fmtAmt(a.cur, a.amount)} a month to {w.citizens[a.to]?.name} until {fmtDate(a.until, 'medium')}</td></tr>}
        {owed?.alimony && <tr><td>You receive</td><td>{fmtAmt(owed.alimony.cur, owed.alimony.amount)} a month from {owed.name}</td></tr>}
      </tbody></table>
      <Help>People are drawn to the other sex, their own, or both; whom you can ask out depends on whom they are drawn to. Same-sex couples marry where the law allows it, register a partnership where there is one, and elsewhere live as partners; where they are persecuted, many hide and some emigrate. A divorce follows your country's law: savings are evened out and the better-off spouse may pay maintenance.</Help>
    </div>
  );
}
