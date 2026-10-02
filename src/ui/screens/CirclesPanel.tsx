// Your circles (2.7): family, friends, workmates, neighbours, a club, a congregation; your standing in each.
import type { Citizen, World } from '../../sim/types';
import { ActBtn, CitLink, Help } from '../common';
import { CIRCLE_INFO, circleAct, circleActCheck, circlesOf, standingIn, standingLabel } from '../../sim/circles';

export function CirclesPanel({ w, p }: { w: World; p: Citizen }) {
  const circles = circlesOf(w, p);
  return (
    <div>
      {circles.length ? <table class="table compact small"><tbody>{circles.map((c) => {
        const s = standingIn(p, c);
        return (
          <tr>
            <td>{CIRCLE_INFO[c.kind].icon} {c.name}<br /><small class="muted">{c.members.slice(0, 4).map((x, i) => <>{i ? ', ' : ''}<CitLink w={w} id={x.id} /></>)}{c.members.length > 4 ? ` and ${c.members.length - 4} more` : ''}</small></td>
            <td class={s >= 8 ? 'good' : s <= -8 ? 'bad' : 'muted'}>{standingLabel(s)} ({s})</td>
            <td><ActBtn small kind="ghost" why={circleActCheck(w, p, c.kind)} run={(w) => circleAct(w, c.kind)}>{CIRCLE_INFO[c.kind].act}</ActBtn></td>
          </tr>
        );
      })}</tbody></table> : <p class="small muted">You do not belong to any circle yet: find work, take up a hobby, make friends.</p>}
      <Help>Circles come from your family, your friends, where you work, where you live, your hobby (a club) and your faith (a congregation). Your standing in a circle is what its members think of you, on average. People in a circle meet and grow closer, everyone, not only you, so friendships form across the world. Standing among workmates counts towards promotion in public service. Once a week you can do something with each circle.</Help>
    </div>
  );
}
