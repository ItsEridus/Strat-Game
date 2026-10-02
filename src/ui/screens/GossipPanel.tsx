// What people are saying (2.7): rumours about you, your rivals and feuds, and stories of your own.
import { useState } from 'preact/hooks';
import type { Citizen, World } from '../../sim/types';
import { ActBtn, CitLink, Help, Select } from '../common';
import { answerCheck, answerRumour, enemiesOf, feuding, rumoursAbout, spreadCheck, spreadRumour } from '../../sim/gossip';

export function GossipPanel({ w, p }: { w: World; p: Citizen }) {
  const rumours = rumoursAbout(w, p.id).filter((r) => r.told || r.sign > 0 || r.heard.length >= 3);
  const enemies = enemiesOf(w, p);
  const [target, setTarget] = useState<number>(enemies[0]?.id ?? -1);
  const o = w.citizens[target];
  return (
    <div>
      {rumours.length ? <ul class="small">{rumours.map((r) => (
        <li>"{r.text}" <span class="muted">({r.heard.length} have heard{r.by != null ? <>, started by <CitLink w={w} id={r.by} /></> : ''}{r.truth ? '' : '; not true'})</span>{' '}
          <ActBtn small kind="ghost" why={answerCheck(w, p, r)} run={(w) => answerRumour(w, r.id)}>{r.truth ? (r.sign < 0 ? 'Own up' : 'Thank them') : 'Set the record straight'}</ActBtn></li>
      ))}</ul> : <p class="small muted">Nothing much is being said about you.</p>}
      {enemies.length > 0 && <>
        <h4>Rivals and grudges</h4>
        <ul class="small">{enemies.slice(0, 8).map((x) => <li><CitLink w={w} id={x.id} />{feuding(w, x, p) ? ' (a feud)' : ''}: {x.ties!.find((t) => t.who === p.id)?.why}</li>)}</ul>
        <div class="row small">
          <Select value={target} options={enemies.map((x) => [x.id, x.name] as [number, string])} onChange={setTarget} />
          <ActBtn small kind="ghost" why={spreadCheck(w, p, o, false)} run={(w) => spreadRumour(w, target, false)}>Tell what you know</ActBtn>
          <ActBtn small kind="danger" why={spreadCheck(w, p, o, true)} confirm="Make something up? If it is traced back to you, it will cost you." run={(w) => spreadRumour(w, target, true)}>Invent a story</ActBtn>
        </div>
      </>}
      <Help>Rumours spread through the circles of the person they are about, a few more people each month, and each who hears one thinks better or worse of them. They start from what people see (a drinker, a gambler, someone in prison, a promotion, a kindness) and from grudges: those who bear one talk, and not always truthfully. A false rumour can be scotched if people think well of you; owning up to a true one takes the sting out. Two people with grudges against each other feud, and their families take sides; most make peace in time.</Help>
    </div>
  );
}
