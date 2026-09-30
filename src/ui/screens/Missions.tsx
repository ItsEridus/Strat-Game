import type { World } from '../../sim/types';
import { ActBtn, Bar, Panel, Help } from '../common';
import { store } from '../store';
import { CAMPAIGNS, GOALS, TUTORIAL, campaignStep, claimDaily, claimSeason, metric, seasonReward, seasonTier } from '../../sim/quests';
import { B } from '../../data/balance';
import { itemName } from '../../data/items';

function rewardText(r: { gold?: number; xp?: number; items?: Record<string, number>; prestige?: number }) {
  const parts: string[] = [];
  if (r.gold) parts.push(`${(r.gold / 1000).toFixed(2)} g`);
  if (r.xp) parts.push(`${r.xp} XP`);
  if (r.prestige) parts.push(`${r.prestige} prestige`);
  for (const [k, n] of Object.entries(r.items ?? {})) parts.push(`${n}× ${itemName(k)}`);
  return parts.join(', ');
}

export function Missions({ w }: { w: World }) {
  const ps = w.player;
  const tier = seasonTier(w);
  return (
    <div class="grid">
      {!ps.tutorialDone && (
        <Panel title="Tutorial" class="wide">
          <ol class="tutorial-list">
            {TUTORIAL.map((t, i) => (
              <li class={i < ps.tutorial ? 'done' : i === ps.tutorial ? 'cur' : ''}>
                {t.text} {i === ps.tutorial && <><span class="muted small">— {t.hint}</span> <button class="btn sm ghost" onClick={() => store.go(t.tab)}>Go</button></>}
              </li>
            ))}
          </ol>
        </Panel>
      )}
      <Panel title={`Daily missions (day ${ps.dailyDay})`}>
        <Help>{B.missions.count} missions drawn from systems you’ve unlocked; each pays {B.missions.gold} gold + {B.missions.prestige} prestige (+1 XP from level 2). They refresh at midnight (simulated).</Help>
        {ps.dailies.map((q) => {
          const prog = Math.min(q.target, metric(w, q.metric) - q.base);
          return (
            <div class={`quest ${q.claimed ? 'claimed' : ''}`}>
              <span>{q.text}</span>
              <Bar v={prog} max={q.target} color="#e0a526" label={`${prog}/${q.target}`} />
              <ActBtn small why={q.claimed ? 'Claimed.' : !q.done ? 'Not complete.' : null} showWhy={false} run={(w) => claimDaily(w, q.id)}>{q.claimed ? '✓' : 'Claim'}</ActBtn>
            </div>
          );
        })}
      </Panel>
      <Panel title="Campaigns">
        <Help>Three branches run in parallel — no career is locked. Steps complete automatically as you play.</Help>
        {Object.entries(CAMPAIGNS).map(([k, c]) => {
          const step = campaignStep(w, k);
          const idx = ps.campaigns[k].idx;
          return (
            <div class="campaign">
              <b>{c.name}</b> <small class="muted">{idx}/{c.steps.length}</small>
              <Bar v={idx} max={c.steps.length} color="#5b8def" />
              {step ? <p class="small">Next: {step.text} ({Math.min(step.target, metric(w, step.metric)).toLocaleString()}/{step.target.toLocaleString()}) — reward {rewardText(step.reward)}</p> : <p class="small good">Branch complete!</p>}
            </div>
          );
        })}
      </Panel>
      <Panel title="Personal goals (optional scenarios)">
        <Help>Open-ended sandbox goals. Losing an election or a war never ends the campaign.</Help>
        {GOALS.map((gl) => <div class="track"><span>{ps.achievements[gl.id] ? '🏆' : '▫️'} <b>{gl.name}</b><br /><small class="muted">{gl.desc}</small></span><small>{ps.achievements[gl.id] ? `day ${Math.floor(ps.achievements[gl.id] / 1440)}` : ''}</small></div>)}
      </Panel>
      <Panel title={`Season ${ps.season} track — ${ps.prestige} prestige (tier ${tier})`} class="wide">
        <Help>An entirely earnable progression track (replaces a paid battle pass). Every {B.season.prestigePerTier} prestige unlocks a tier.</Help>
        <div class="season">
          {Array.from({ length: B.season.tiers }, (_, t) => {
            const claimed = ps.seasonClaimed.includes(t);
            return (
              <div class={`tier ${tier > t ? 'open' : ''} ${claimed ? 'claimed' : ''}`}>
                <b>{t + 1}</b><small>{rewardText(seasonReward(t))}</small>
                <ActBtn small why={claimed ? 'Claimed.' : tier <= t ? 'Locked.' : null} showWhy={false} run={(w) => claimSeason(w, t)}>{claimed ? '✓' : 'Claim'}</ActBtn>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
