// Habits and addictions (2.6): the player's habits, quitting and relapse, a flutter at the
// bookmaker's; and a country's smoking, drinking, gambling and gaming.
import type { Citizen, Id, World } from '../../sim/types';
import { ActBtn, Empty, Help, Panel } from '../common';
import { fmtAmt } from '../../engine/money';
import { DAY } from '../../engine/clock';
import { player } from '../../sim/query';
import { visitCost } from '../../sim/health';
import {
  HABITS, HABIT_KEYS, STAKES, banned, betCheck, habitLevel, habitStats, habitsOf, indulge, indulgeCheck, placeBet, prices, quitCheck, quitHabit,
  raiseTobaccoDuty, tobaccoDuty,
} from '../../sim/habits';
import { c as cur } from '../../engine/money';

export function HabitsPanel({ w, p }: { w: World; p: Citizen }) {
  const n = w.nations[p.nation];
  const list = habitsOf(p);
  const pr = prices(w, n);
  const v = visitCost(w, p);
  return (
    <div>
      {list.length ? (
        <table class="table compact small"><tbody>{list.map(([h, s]) => (
          <tr>
            <td>{HABITS[h].icon} {HABITS[h].label}</td>
            <td>{s.quit != null ? `stopped ${Math.floor((w.time - s.quit) / DAY)} days ago${s.helped ? ' (with help)' : ''}` : habitLevel(h, s.level)}</td>
            <td class="muted">strength {s.level}{s.tries ? ` · ${s.tries} tr${s.tries > 1 ? 'ies' : 'y'} to stop` : ''}</td>
            <td>{s.quit == null && <>
              <ActBtn small kind="ghost" why={quitCheck(w, p, h, false)} run={(w) => quitHabit(w, undefined, h, false)}>Stop</ActBtn>
              <ActBtn small kind="ghost" why={quitCheck(w, p, h, true)} run={(w) => quitHabit(w, undefined, h, true)}>Stop with help ({v.patient ? fmtAmt(v.code, v.patient) : 'free'})</ActBtn>
            </>}</td>
          </tr>
        ))}</tbody></table>
      ) : <p class="small muted">No habits to speak of.</p>}
      <div class="row">
        {HABIT_KEYS.filter((h) => h !== 'gambling' && !banned(n, h)).map((h) => (
          <ActBtn small why={indulgeCheck(w, p, h)} run={(w) => indulge(w, undefined, h)}>{HABITS[h].icon} {h === 'smoking' ? `A pack (${fmtAmt(n.cur, pr.pack)})` : h === 'drinking' ? `A night out drinking (${fmtAmt(n.cur, pr.drink * 3)})` : 'An evening of games'}</ActBtn>
        ))}
        {!banned(n, 'gambling') && STAKES.map((s) => <ActBtn small why={betCheck(w, p, Math.round(cur(s) / 10))} run={(w) => placeBet(w, undefined, Math.round(cur(s) / 10))}>🎰 Bet {fmtAmt(n.cur, Math.round(cur(s) / 10))}</ActBtn>)}
      </div>
      <Help>A smoke, a drink, a bet or an evening of games lifts the mood for a while, and every time the habit grows; at strength 50 it is an addiction. Habits cost money every month (much of it in duty), and smoking and heavy drinking harm your health; drink and gambling strain families. Most people need several tries to stop: the first weeks bring cravings, and relapse is likeliest early on. Help from a doctor about doubles your chances. After a year without, a habit is behind you.</Help>
    </div>
  );
}

export function NationHabitsPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const p = player(w);
  const s = habitStats(w, id);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <Panel title="🚬 Habits">
      {s.adults ? <table class="table compact small"><tbody>
        <tr><td>Daily smokers</td><td>{pct(s.smokersMen)} of men, {pct(s.smokersWomen)} of women</td></tr>
        <tr><td>Drinking heavily</td><td>{pct(s.heavyDrinking)} of adults ({pct(s.alcoholDependence)} dependent){banned(n, 'drinking') ? ' (alcohol is illegal)' : ''}</td></tr>
        <tr><td>Problem gambling</td><td>{pct(s.problemGambling)}{banned(n, 'gambling') ? ' (gambling is illegal)' : ''}</td></tr>
        <tr><td>Gaming disorder</td><td>{pct(s.gamingDisorder)}</td></tr>
        <tr><td>A pack of cigarettes</td><td>{fmtAmt(n.cur, prices(w, n).pack)} (tobacco duty {tobaccoDuty(n) > 1 ? `${Math.round((tobaccoDuty(n) - 1) * 100)}% higher than in 2025` : 'as in 2025'})</td></tr>
      </tbody></table> : <Empty>No figures.</Empty>}
      {n.president === p.id && <ActBtn small run={(w) => raiseTobaccoDuty(w)}>🚬 Raise tobacco duty by a quarter</ActBtn>}
      <Help>Figures are for the simulated people. They start from 2025 (WHO for tobacco and alcohol; national surveys of gambling and gaming). Higher tobacco duty means fewer start and more stop, and governments raise it over the years.</Help>
    </Panel>
  );
}
