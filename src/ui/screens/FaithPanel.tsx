// Faith and festivals (2.9): your religion, the festivals you keep, and a country's faiths and holidays.
import type { Citizen, Id, World } from '../../sim/types';
import { Help, Panel, Select } from '../common';
import { store } from '../store';
import { fmtDate } from '../../engine/calendar';
import { RELIGION_INFO, devout, festivalsOf, religionOf, religionStats, setReligion, upcoming, type Religion } from '../../sim/faith';
import { dateAt } from '../../engine/calendar';
import { dataIso } from '../../data/isoAlias';

export function FaithPanel({ w, p }: { w: World; p: Citizen }) {
  const r = religionOf(w, p);
  const next = upcoming(w, p, 90);
  return (
    <div>
      <div class="row small">Faith: <Select value={r} options={(Object.keys(RELIGION_INFO) as Religion[]).map((k) => [k, `${RELIGION_INFO[k].icon} ${RELIGION_INFO[k].label}`] as [Religion, string])} onChange={(x) => store.act((w) => setReligion(w, x))} />{devout(w, p) ? <span class="muted">(practising)</span> : null}</div>
      {next.length ? <ul class="small">{next.map((f) => <li>{f.icon} {f.name}: {fmtDate(f.t, 'dayMonth')}</li>)}</ul> : <p class="small muted">No festivals in the next three months.</p>}
      <Help>Religions follow each country (Pew Research): mostly Christian in the Americas, Europe and South Africa, Muslim in Turkey and Saudi Arabia, Hindu in India, and largely of no religion (with Buddhism and folk religion) in East Asia. Those who keep a festival are happier for it and see their families. The devout of a faith form a congregation, one of your circles. Devout people of different faiths get on less easily; at a wedding, one spouse sometimes takes the other's faith.</Help>
    </div>
  );
}

export function NationFaithPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const stats = religionStats(w, id);
  const iso = dataIso(n.iso);
  const holidays = festivalsOf(dateAt(w.time).year).filter((f) => f.nations?.includes(iso)).sort((a, b) => a.t - b.t);
  return (
    <Panel title="🛐 Faith and holidays">
      <table class="table compact small"><tbody>{stats.slice(0, 6).map(([r, s]) => <tr><td>{RELIGION_INFO[r].icon} {RELIGION_INFO[r].label}</td><td>{Math.round(s * 100)}%</td></tr>)}</tbody></table>
      {holidays.length > 0 && <p class="small">National days: {holidays.map((f) => `${f.icon} ${f.name} (${fmtDate(f.t, 'dayMonth')})`).join(' · ')}</p>}
    </Panel>
  );
}
