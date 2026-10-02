// The World Almanac (2.5): the record of the campaign. Every nation's statistics year by
// year and its heads of government; every war and treaty; the largest companies; the most
// notable people.
import { useState } from 'preact/hooks';
import type { Id, World } from '../../sim/types';
import { CitLink, Empty, Help, NationChip, Panel, Select, Sparkline } from '../common';
import { fmtDay, dateAt } from '../../engine/calendar';
import { fmtAmt } from '../../engine/money';
import { almanacOf, SCENARIOS } from '../../sim/almanac';
import { WAR_KIND_LABEL, warKindOf } from '../../sim/warCourse';
import { TREATY_INFO } from '../../sim/treaties';
import { companyCurrency } from '../../sim/query';
import { player } from '../../sim/query';

export function Almanac({ w }: { w: World }) {
  const a = almanacOf(w);
  const [nid, setNid] = useState<Id>(player(w).nation);
  const latest = (id: Id) => { const rows = a.years[id] ?? []; return rows[rows.length - 1]; };
  const rows = a.years[nid] ?? [];
  const leaders = (a.leaders[nid] ?? []).slice().reverse();
  const wars = Object.values(w.wars).sort((x, y) => y.declared - x.declared).slice(0, 40);
  const treaties = Object.values(w.treaties ?? {}).sort((x, y) => y.signed - x.signed).slice(0, 40);
  const companies = Object.values(w.companies).sort((x, y) => y.lifetime.revenue - x.lifetime.revenue).slice(0, 15);
  const people = Object.values(w.citizens).filter((c) => (c.sec?.fame ?? 0) > 0).sort((x, y) => y.sec.fame - x.sec.fame).slice(0, 15);
  return (
    <div class="grid">
      <Panel title="📚 The World Almanac" class="wide">
        <p class="small">Campaign begun in {dateAt(0).year} · starting world: {SCENARIOS[w.settings.scenario ?? 'present'].label} · now {dateAt(w.time).year}.</p>
        <table class="table compact small"><thead><tr><th>Country</th><th>Economy (% of world, 2025 terms)</th><th>Population (2025 = 1)</th><th>Output per worker</th><th>Technology</th><th>Soft power</th><th>Rating</th></tr></thead><tbody>
          {w.nations.filter((n) => n.dissolved == null && latest(n.id)).sort((x, y) => latest(y.id)!.economy - latest(x.id)!.economy).map((n) => { const r = latest(n.id)!; return (
            <tr><td><NationChip w={w} id={n.id} /></td><td>{r.economy.toFixed(1)}</td><td>{r.pop.toFixed(2)}</td><td>{r.prod.toFixed(2)}</td><td>{r.tech}</td><td>{r.soft}</td><td>{r.rating}</td></tr>
          ); })}
        </tbody></table>
        {!w.nations.some((n) => latest(n.id)) && <Empty>The first yearly entries are written on 1 January.</Empty>}
        <Help>Statistics are recorded every 1 January: the economy as a share of the 2025 world economy (grown by output per worker and population), population and output per worker against 2025, the average technology level (100 = the 2025 leader), soft power and the credit rating.</Help>
      </Panel>

      <Panel title="🏛️ A country's record" class="wide">
        <div class="row small"><Select value={nid} options={w.nations.map((n) => [n.id, n.name] as [Id, string])} onChange={setNid} /></div>
        {rows.length > 1 && <><small class="muted">Economy</small><Sparkline values={rows.map((r) => r.economy)} width={300} height={40} /></>}
        {rows.length > 0 && <table class="table compact small"><thead><tr><th>Year</th><th>Economy</th><th>Population</th><th>Output per worker</th><th>Technology</th><th>Soft power</th><th>Rating</th><th>World temperature</th></tr></thead><tbody>
          {rows.slice(-15).reverse().map((r) => <tr><td>{r.year}</td><td>{r.economy.toFixed(1)}</td><td>{r.pop.toFixed(2)}</td><td>{r.prod.toFixed(2)}</td><td>{r.tech}</td><td>{r.soft}</td><td>{r.rating}</td><td>{r.temp.toFixed(2)}°C</td></tr>)}
        </tbody></table>}
        <h4>Heads of government</h4>
        {leaders.length ? <ul class="small">{leaders.map((l) => <li><CitLink w={w} id={l.id} /> ({fmtDay(l.from)} – {l.to != null ? fmtDay(l.to) : 'present'}){l.party ? `, ${l.party}` : ''}</li>)}</ul> : <Empty>None recorded yet.</Empty>}
      </Panel>

      <Panel title="⚔️ Wars">
        {wars.length ? <ul class="small">{wars.map((x) => <li>{fmtDay(x.declared)}: {w.nations[x.att].name} against {w.nations[x.def].name} ({WAR_KIND_LABEL[warKindOf(x)]}){x.status === 'active' ? ' — under way' : x.outcome ? ` — ${x.outcome}` : ''}</li>)}</ul> : <Empty>No wars yet.</Empty>}
      </Panel>

      <Panel title="📜 Treaties">
        {treaties.length ? <ul class="small">{treaties.map((t) => <li>{TREATY_INFO[t.kind]?.icon} {t.name} ({t.parties.length} parties; {t.historic ? 'in force in 2025' : `signed ${fmtDay(t.signed)}`}){t.status !== 'active' ? ` — ${t.status}` : ''}</li>)}</ul> : <Empty>No treaties yet.</Empty>}
      </Panel>

      <Panel title="🏭 Largest companies">
        {companies.length ? <table class="table compact small"><tbody>{companies.map((co) => <tr><td>{co.name}</td><td>{w.nations[w.regions[co.region].owner]?.name}</td><td>{fmtAmt(companyCurrency(w, co), co.lifetime.revenue)} earned in all</td></tr>)}</tbody></table> : <Empty>No companies.</Empty>}
      </Panel>

      <Panel title="⭐ Notable people">
        {people.length ? <table class="table compact small"><tbody>{people.map((c) => <tr><td><CitLink w={w} id={c.id} />{c.gone ? ' †' : ''}</td><td>{w.nations[c.nation]?.name}</td><td>fame {Math.round(c.sec.fame)}</td></tr>)}</tbody></table> : <Empty>Nobody is famous yet.</Empty>}
      </Panel>
    </div>
  );
}
