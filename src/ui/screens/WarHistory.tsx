// War history: why a war started, what happened in it and why it ended, from
// the war chronicle (sim/warChronicle.ts). Without a war selected, the archive.
import type { War, World } from '../../sim/types';
import { Btn, CitLink, Empty, Help, NationChip, Panel, RegionLink } from '../common';
import { store } from '../store';
import { fmtDate, fmtTime } from '../../engine/calendar';
import { fmtDur } from '../../engine/clock';
import { useSort } from '../sort';

const num = (x: number) => Math.round(x).toLocaleString('en-US');
const when = (w: World, t: number) => `${fmtDate(t, 'medium')} · ${fmtTime(t, !!w.settings.clock24)}`;

export function WarHistory({ w }: { w: World }) {
  const war: War | undefined = store.sel.war != null ? w.wars[store.sel.war] : undefined;
  if (!war) return <WarArchive w={w} />;
  const c = war.chronicle;
  const ended = war.status === 'ended';
  const end = c?.ending;
  const battles = c ? Object.entries(c.battles).map(([id, b]) => ({ id: Number(id), ...b })).sort((a, b) => a.started - b.started) : [];
  const total = (i: 0 | 1, k: 'damage' | 'fighters') => battles.reduce((s, b) => s + (b[k]?.[i] ?? 0), 0);
  const won = (id: number) => battles.filter((b) => b.winner === id).length;
  return (
    <div class="grid war-history">
      <Panel title={<span><NationChip w={w} id={war.att} /> ⚔ <NationChip w={w} id={war.def} /></span>} class="wide" right={<Btn small kind="ghost" onClick={() => store.go('war', { war: null })}>All wars</Btn>}>
        <p class="war-dates">Declared {when(w, war.declared)} · {ended && end ? `ended ${when(w, end.t)} after ${fmtDur(end.t - war.declared)}` : `under way for ${fmtDur(w.time - war.declared)}; deadline ${when(w, war.deadline)}`}</p>
        <p class="war-headline">{end ? end.headline : ended ? `Ended by ${war.outcome}.` : `In progress: ${war.occupied.length} of ${war.quota} occupations held at once.`}</p>
        {c ? (
          <div class="stats">
            <div class="stat"><small>Battles</small><b>{battles.length}</b></div>
            <div class="stat"><small>Won by {w.nations[war.att].name}</small><b>{won(war.att)}</b></div>
            <div class="stat"><small>Won by {w.nations[war.def].name}</small><b>{won(war.def)}</b></div>
            <div class="stat"><small>Damage dealt</small><b>{num(total(0, 'damage'))} / {num(total(1, 'damage'))}</b></div>
            <div class="stat"><small>Fighters, all battles</small><b>{num(total(0, 'fighters'))} / {num(total(1, 'fighters'))}</b></div>
          </div>
        ) : <p class="small muted">This war was fought before war chronicles were kept (they began in version 1.3.4), so only its outcome is known: {war.outcome ?? 'still being fought'}.</p>}
      </Panel>
      {c?.cause && <WhyItStarted w={w} war={war} />}
      {c && (
        <Panel title="What happened" class="wide">
          {c.events.length ? (
            <ol class="timeline">
              {c.events.map((e) => (
                <li class={e.side ?? ''}>
                  <span class="when">{fmtDate(e.t, 'short')}<br /><small>{fmtTime(e.t, !!w.settings.clock24)}</small></span>
                  <span class="icon">{e.icon}</span>
                  <span class="what">{e.text}</span>
                </li>
              ))}
            </ol>
          ) : <Empty>Nothing yet.</Empty>}
        </Panel>
      )}
      {battles.length > 0 && (
        <Panel title="Battles" class="wide">
          <table class="table compact small">
            <thead><tr><th>Region</th><th>Began</th><th>Lasted</th><th>Rounds</th><th class="num">Damage (att / def)</th><th class="num">Fighters</th><th>Result</th><th>Heroes</th></tr></thead>
            <tbody>
              {battles.map((b) => (
                <tr>
                  <td><RegionLink w={w} id={b.region} />{b.airOnly ? ' ✈️' : b.amphibious ? ' ⚓' : ''}<br /><small class="muted">{w.nations[b.att].name} attacking</small></td>
                  <td>{fmtDate(b.started, 'short')}</td>
                  <td>{b.ended ? fmtDur(b.ended - b.started) : 'ongoing'}</td>
                  <td>{b.rounds ? `${b.rounds[0]}–${b.rounds[1]}` : '—'}</td>
                  <td class="num">{b.damage ? `${num(b.damage[0])} / ${num(b.damage[1])}` : '—'}</td>
                  <td class="num">{b.fighters ? `${b.fighters[0]} / ${b.fighters[1]}` : '—'}</td>
                  <td>{b.winner != null ? <><NationChip w={w} id={b.winner} /> won</> : b.ended ? 'called off' : 'in progress'}{b.result && <><br /><small class="muted">{b.result}</small></>}</td>
                  <td>{(b.heroes ?? []).map((h) => <div><CitLink w={w} id={h.id} /> <small class="muted">{num(h.dmg)}</small></div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {end && (
        <Panel title="Why it ended" class="wide">
          <p class="war-headline">{end.headline}</p>
          <ul>{end.why.map((x) => <li>{x}</li>)}</ul>
          <h4>Terms</h4>
          <ul>{end.terms.map((x) => <li>{x}</li>)}</ul>
          <h4>Aftermath</h4>
          <ul>{end.aftermath.map((x) => <li>{x}</li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

function WhyItStarted({ w, war }: { w: World; war: War }) {
  const cause = war.chronicle!.cause!;
  const att = w.nations[war.att], def = w.nations[war.def];
  const max = Math.max(0.1, ...cause.factors.map((f) => Math.abs(f.weight)));
  const s = cause.snapshot;
  return (
    <>
      <Panel title="Why it started" class="wide">
        <p class="war-summary">{cause.summary}</p>
        {cause.by && <p class="small">Proposed by {cause.by.role} <CitLink w={w} id={cause.by.id} />{cause.by.party ? ` (${cause.by.party})` : ''}.{cause.vote && ` Congress voted ${cause.vote.yes}–${cause.vote.no} with ${cause.vote.eligible} deputies able to vote.`}</p>}
        {cause.vote && cause.vote.parties.length > 0 && (
          <table class="table compact small"><thead><tr><th>Party</th><th class="num">For war</th><th class="num">Against</th></tr></thead>
            <tbody>{cause.vote.parties.map((p) => <tr><td>{p.name}</td><td class="num">{p.yes}</td><td class="num">{p.no}</td></tr>)}</tbody></table>
        )}
        <h4>What {att.name} weighed</h4>
        <table class="table factors">
          <tbody>
            {cause.factors.map((f) => (
              <tr>
                <td><b>{f.label}</b></td>
                <td class="small">{f.detail}</td>
                <td class="weight" title={`${f.weight > 0 ? 'Pushed toward war' : f.weight < 0 ? 'Held it back' : 'No effect'} (${f.weight.toFixed(2)})`}>
                  <span class={`bar ${f.weight > 0 ? 'war' : 'peace'}`} style={{ width: `${Math.round((Math.abs(f.weight) / max) * 100)}%` }} />
                  <small>{f.weight > 0.005 ? 'toward war' : f.weight < -0.005 ? 'against' : '—'}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Help>The first five factors are the ones deputies vote on, with the same weights; the rest describe what was at stake. Longer bars mattered more.</Help>
      </Panel>
      <Panel title="War aims">
        <ul>{cause.aims.map((a) => <li>{a}</li>)}</ul>
        <h4>At the declaration</h4>
        <table class="table compact small"><thead><tr><th /><th class="num">{att.name}</th><th class="num">{def.name}</th></tr></thead><tbody>
          <tr><td>Military strength</td><td class="num">{num(s.power[0])}</td><td class="num">{num(s.power[1])}</td></tr>
          <tr><td>Regions held</td><td class="num">{s.regions[0]}</td><td class="num">{s.regions[1]}</td></tr>
          <tr><td>Government approval</td><td class="num">{s.approval[0]}%</td><td class="num">{s.approval[1]}%</td></tr>
          <tr><td>War mood</td><td class="num">{s.mood[0]}</td><td class="num">{s.mood[1]}</td></tr>
          <tr><td>Relations</td><td class="num" colSpan={2}>{s.relation}</td></tr>
        </tbody></table>
      </Panel>
      <Panel title={`How ${def.name} saw it`}>
        <ul>{cause.defender.map((x) => <li>{x}</li>)}</ul>
      </Panel>
    </>
  );
}

/** Every war, newest first. */
function WarArchive({ w }: { w: World }) {
  const wars = Object.values(w.wars).sort((a, b) => b.declared - a.declared);
  const lasted = (x: War) => (x.chronicle?.ending?.t ?? (x.status === 'active' ? w.time : x.deadline)) - x.declared;
  const sort = useSort('war-archive', wars, {
    war: (x) => `${w.nations[x.att].name} ${w.nations[x.def].name}`, declared: (x) => x.declared, lasted, battles: (x) => x.battles.length,
    outcome: (x) => (x.status === 'active' ? '' : x.chronicle?.ending?.headline ?? x.outcome ?? ''),
  }, { key: 'declared', dir: 'desc' });
  return (
    <Panel title="War archive" class="wide">
      <Help>Every war since the campaign began: why it started, how it went and why it ended. Open one for its full history.</Help>
      {wars.length ? (
        <table class="table compact">
          <thead><tr>{sort.th('war', 'War')}{sort.th('declared', 'Declared')}{sort.th('lasted', 'Lasted')}{sort.th('battles', 'Battles')}<th>Why</th>{sort.th('outcome', 'Outcome')}<th /></tr></thead>
          <tbody>
            {sort.rows.map((x) => (
              <tr>
                <td><NationChip w={w} id={x.att} /> vs <NationChip w={w} id={x.def} /></td>
                <td class="small">{fmtDate(x.declared, 'short')}</td>
                <td class="small">{fmtDur(lasted(x))}</td><td class="small">{x.battles.length}</td>
                <td class="small">{x.chronicle?.cause?.summary ?? <span class="muted">not recorded</span>}</td>
                <td class="small">{x.status === 'active' ? 'being fought' : x.chronicle?.ending?.headline ?? x.outcome}</td>
                <td><Btn small onClick={() => store.go('war', { war: x.id })}>Open</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>No wars yet.</Empty>}
    </Panel>
  );
}
