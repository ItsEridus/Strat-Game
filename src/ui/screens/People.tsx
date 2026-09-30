// People: rivals and allies, the notable figures of your country, and who is
// around you right now — what they do and what they want.
import { ageOf } from '../../sim/growth';
import type { Citizen, World } from '../../sim/types';
import { CitLink, Empty, Help, Panel, RegionLink } from '../common';
import { player } from '../../sim/query';
import { IDEOLOGIES } from '../../data/ideologies';
import { activityOf, goalText } from '../../sim/npc';
import { govTemplate, headOf } from '../../sim/stategov';

function Row({ w, c, showGoal }: { w: World; c: Citizen; showGoal: boolean }) {
  const p = player(w);
  const rel = Math.round(c.rel[p.id] ?? 0);
  return (
    <tr>
      <td><CitLink w={w} id={c.id} /><br /><small class="muted">{c.persona} · {ageOf(w, c)} · {IDEOLOGIES[c.ideo].name}</small></td>
      <td class="small">{activityOf(w, c)}{showGoal && c.sec.goal ? <><br /><span class="muted">wants to {goalText(w, c)}</span></> : null}</td>
      <td class={rel >= 30 ? 'good' : rel <= -30 ? 'bad' : 'muted'}>{rel > 0 ? '+' : ''}{rel}</td>
    </tr>
  );
}

export function People({ w }: { w: World }) {
  const p = player(w);
  const known = (c: Citizen) => Math.abs(c.rel[p.id] ?? 0) >= 20 || c.sec.fame > 5 || c.influence > 30;
  const rivals = p.sec.rivals.map((id) => w.citizens[id]).filter(Boolean);
  const friends = Object.values(w.citizens).filter((c) => !c.player && (c.rel[p.id] ?? 0) >= 30).sort((a, b) => (b.rel[p.id] ?? 0) - (a.rel[p.id] ?? 0)).slice(0, 10);
  const n = w.nations[p.nation];
  const notable = Object.values(w.citizens).filter((c) => c.nation === p.nation && !c.player && (n.president === c.id || Object.values(n.cabinet).includes(c.id) || headOf(w, c.id) != null || c.sec.prank >= 3 || c.influence > 40 || c.sec.fame > 8))
    .sort((a, b) => (n.president === b.id ? 1 : 0) - (n.president === a.id ? 1 : 0) || b.influence - a.influence).slice(0, 25);
  const here = Object.values(w.citizens).filter((c) => c.loc === p.loc && !c.player).sort((a, b) => (b.rel[p.id] ?? 0) - (a.rel[p.id] ?? 0) || b.influence - a.influence);
  const gov = headOf(w, p.id);
  return (
    <div class="grid">
      <Panel title="🪪 Your reputation">
        <table class="table compact"><tbody>
          <tr><td>Influence</td><td>{Math.round(p.influence)}</td></tr>
          <tr><td>Fame</td><td>{p.sec.fame.toFixed(0)}</td></tr>
          <tr><td>Notoriety</td><td>{p.sec.notoriety.toFixed(0)}</td></tr>
          <tr><td>Standing</td><td>{activityOf(w, p)}{gov != null ? ` (${govTemplate(w, gov)?.title})` : ''}</td></tr>
          <tr><td>Friends / rivals</td><td>{friends.length} / {rivals.length}</td></tr>
        </tbody></table>
        <Help>Fame helps in elections and attracts interviews; notoriety attracts organised crime and police. People remember what you do: help them, employ them fairly and keep your word, or they turn against you — and rivals will act on it.</Help>
      </Panel>

      <Panel title="😠 Rivals">
        {rivals.length ? <table class="table compact"><tbody>{rivals.map((c) => <Row w={w} c={c} showGoal={true} />)}</tbody></table> : <Empty>No rivals yet. Compete for office, markets or turf and they will come.</Empty>}
        <Help>Rivals attack you in speeches, undercut your prices and poach workers, and tip off the police if you give them a reason.</Help>
      </Panel>

      <Panel title="🤝 Friends & allies">
        {friends.length ? <table class="table compact"><tbody>{friends.map((c) => <Row w={w} c={c} showGoal={true} />)}</tbody></table> : <Empty>No close friends yet. Endorse people, help them, hire them.</Empty>}
        <Help>Friends vouch for you, warn you when police close in, and lend money when you're short.</Help>
      </Panel>

      <Panel title={`⭐ Notable figures in ${n.name}`} class="wide">
        <table class="table compact"><thead><tr><th>Person</th><th>Role · ambition</th><th>Toward you</th></tr></thead>
          <tbody>{notable.map((c) => <Row w={w} c={c} showGoal={true} />)}</tbody></table>
      </Panel>

      <Panel title={`📍 People in ${w.regions[p.loc].name} (${here.length})`} class="wide">
        {here.length ? <table class="table compact"><thead><tr><th>Person</th><th>Doing</th><th>Toward you</th></tr></thead>
          <tbody>{here.slice(0, 40).map((c) => <Row w={w} c={c} showGoal={known(c)} />)}</tbody></table> : <Empty>Nobody you know is here. Travel to cities to meet people (<RegionLink w={w} id={w.nations[p.nation].capital} />).</Empty>}
      </Panel>
    </div>
  );
}
