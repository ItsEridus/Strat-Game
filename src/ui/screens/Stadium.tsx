import { useState } from 'preact/hooks';
import type { Terrain, Tournament, World } from '../../sim/types';
import { ActBtn, Btn, CitLink, Empty, Num, Panel, Select, Help } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import { enter, enterCheck, host, hostCheck } from '../../sim/tournaments';
import { B } from '../../data/balance';
import { GOLD, fmtAmt, g } from '../../engine/money';
import { fmtClock, fmtWhen } from '../../engine/clock';

export function Stadium({ w }: { w: World }) {
  const p = player(w);
  const list = Object.values(w.tournaments).sort((a, b) => b.start - a.start);
  const upcoming = list.filter((t) => t.status === 'upcoming').reverse();
  const live = list.filter((t) => t.status === 'live');
  const done = list.filter((t) => t.status === 'finished').slice(0, 6);
  const [name, setName] = useState('');
  const [terrain, setTerrain] = useState<Terrain>('plains');
  const [fee, setFee] = useState(0.5);
  const [prize, setPrize] = useState(2);
  const [minLvl, setMinLvl] = useState(10);
  return (
    <div class="grid">
      <Panel title="🏟️ Stadium" class="wide">
        <Help>Tournaments follow the simulated calendar{w.settings.advanced.tournaments ? '' : ' (official tournaments are disabled in this campaign; you can still host)'}. Bouts use organiser-issued Q2 ground weapons and {10} hits each, so supplies are equal: your attributes, training power, rank, gear and buffs decide. Entry needs level {B.tournaments.level}. Prizes: 60/25/15% of the pool.</Help>
      </Panel>
      <Panel title="Upcoming">
        {upcoming.length ? upcoming.map((t) => (
          <div class="card"><b>{t.name}</b> <small class="muted">{t.format} · {t.terrain} · {fmtClock(w, t.start)} ({fmtWhen(w, t.start)})</small>
            <p class="small">Fee {fmtAmt(GOLD, t.fee)} · level {t.minLevel}+ · {t.entrants.length}/{t.cap} entrants · pool {fmtAmt(GOLD, t.prize)}{t.hostedBy != null ? ` · hosted by ${w.citizens[t.hostedBy]?.name}` : ''}</p>
            <ActBtn small why={enterCheck(w, p, t)} run={(w) => enter(w, p, t.id)}>{t.entrants.includes(p.id) ? 'Registered ✓' : 'Register'}</ActBtn>
            <Btn small kind="ghost" onClick={() => store.jumpTo(t.start)}>⏭ Advance to start</Btn></div>
        )) : <Empty>None scheduled.</Empty>}
      </Panel>
      <Panel title="Live & finished">
        {[...live, ...done].map((t) => <Bracket w={w} t={t} />)}
        {!live.length && !done.length && <Empty>No results yet.</Empty>}
      </Panel>
      <Panel title="Host a tournament">
        <div class="form">
          <label>Name <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          <label>Terrain <Select value={terrain} options={['plains', 'mountains', 'forest', 'desert'].map((x) => [x, x] as [Terrain, string])} onChange={setTerrain} /></label>
          <label>Entry fee (g) <Num value={fee} step={0.1} onInput={setFee} /></label>
          <label>Your prize (g) <Num value={prize} step={0.5} onInput={setPrize} /></label>
          <label>Min level <Num value={minLvl} onInput={setMinLvl} /></label>
        </div>
        <ActBtn why={hostCheck(w, p, g(prize))} run={(w) => host(w, p, name, terrain, g(fee), g(prize), minLvl)}>Host</ActBtn>
      </Panel>
    </div>
  );
}

function Bracket({ w, t }: { w: World; t: Tournament }) {
  const rounds = [...new Set(t.bracket.map((b) => b.round))];
  return (
    <details class="card" open={t.status === 'live'}>
      <summary><b>{t.name}</b> — {t.status}{t.podium.length ? <> · 🥇 <CitLink w={w} id={t.podium[0]} /> 🥈 <CitLink w={w} id={t.podium[1]} /> {t.podium[2] != null && <>🥉 <CitLink w={w} id={t.podium[2]} /></>}</> : ''}</summary>
      {rounds.map((r) => (
        <div class="small"><b>Round {r}</b>{t.bracket.filter((b) => b.round === r).map((b) => (
          <div>{b.a.map((id) => w.citizens[id]?.name).join(' & ')} ({b.dmgA.toLocaleString()}) {b.winner === 'a' ? '✔' : ''} vs {b.b.map((id) => w.citizens[id]?.name).join(' & ')} ({b.dmgB.toLocaleString()}) {b.winner === 'b' ? '✔' : ''}</div>
        ))}</div>
      ))}
    </details>
  );
}
