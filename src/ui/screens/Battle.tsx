import { useState } from 'preact/hooks';
import type { Battle as BattleT, World } from '../../sim/types';
import { ActBtn, Btn, CitLink, Empty, NationChip, Panel, RegionLink, Select, Help } from '../common';
import { store } from '../store';
import { maxEnergy, player } from '../../sim/query';
import { TICKS_PER_ROUND, activeBattles, claimReserve, fightCheck, hitMany, roundPoints, segmentOf, tickIndex, tickPoints } from '../../sim/battle';
import { hitPreview, rankOf, type WeaponSel } from '../../sim/combatMath';
import { eat } from '../../sim/citizen';
import { useSpecial, specialCheck } from '../../sim/specials';
import { refPrice } from '../../sim/market';
import { B } from '../../data/balance';
import { SPECIALS, itemName } from '../../data/items';
import { fmtDur } from '../../engine/clock';
import { GOLD, fmtAmt } from '../../engine/money';

const sideName = (w: World, b: BattleT, s: 'a' | 'd') => { const id = s === 'a' ? b.att : b.def; return id >= 0 ? w.nations[id].name : 'Pirates'; };
const sideColor = (w: World, b: BattleT, s: 'a' | 'd') => { const id = s === 'a' ? b.att : b.def; return id >= 0 ? w.nations[id].color : '#444'; };

export function BattleScreen({ w }: { w: World }) {
  const p = player(w);
  const list = activeBattles(w).filter((b) => b.kind !== 'tournament');
  const mine = list.filter((b) => b.att === p.nation || b.def === p.nation);
  const selId = store.sel.battle ?? w.player.watch ?? mine[0]?.id ?? list[0]?.id;
  const b = selId != null ? w.battles[selId] : undefined;
  if (!b) return <div class="grid"><Panel title="Battles"><Empty>No battles are being fought. Wars are declared by congress; see the Wars screen.</Empty></Panel></div>;
  return (
    <div class="grid">
      <Panel title="Battles" class="wide" right={
        <Select value={b.id} options={[...list, ...(b.done ? [b] : [])].map((x) => [x.id, `${x.done ? '(ended) ' : ''}${w.regions[x.region]?.name ?? 'Sea'}: ${sideName(w, x, 'a')} vs ${sideName(w, x, 'd')}`])} onChange={(v) => { w.player.watch = v; store.go('battle', { battle: v }); }} />
      }>
        <BattleHeader w={w} b={b} />
      </Panel>
      {!b.done && <FightPanel w={w} b={b} />}
      <Contributors w={w} b={b} />
      <Panel title="Rounds">
        {b.rounds.length ? (
          <table class="table compact"><thead><tr><th>#</th><th class="num">Damage A</th><th class="num">Damage D</th><th class="num">Points</th><th>Winner</th><th>Top</th></tr></thead>
            <tbody>{b.rounds.map((r, i) => <tr><td>{i + 1}</td><td class="num">{r.a.toLocaleString()}</td><td class="num">{r.d.toLocaleString()}</td><td class="num">{r.ptsA}–{r.ptsD}</td><td>{sideName(w, b, r.winner)}</td><td><CitLink w={w} id={r.hero} /></td></tr>)}</tbody></table>
        ) : <Empty>First round in progress.</Empty>}
        <p class="small muted">Weapons consumed — attackers {b.weaponsUsed.a}, defenders {b.weaponsUsed.d}. Hits {b.hits.a} / {b.hits.d}.</p>
      </Panel>
    </div>
  );
}

function BattleHeader({ w, b }: { w: World; b: BattleT }) {
  const r = w.regions[b.region];
  const idx = Math.min(TICKS_PER_ROUND() - 1, tickIndex(b, w.time));
  const seg = segmentOf(b, w.time);
  const nextTick = b.roundStart + (idx + 1) * 10;
  const total = b.dmg.a + b.dmg.d || 1;
  const pips = (n: number) => <span class="pips">{Array.from({ length: B.battle.roundsToWin }, (_, i) => <i class={i < n ? 'on' : ''} />)}</span>;
  const war = b.war != null ? w.wars[b.war] : null;
  return (
    <>
      <div class="row">
        <b>{r ? <RegionLink w={w} id={r.id} /> : 'Sea'}</b>{r && <span class="muted">· {r.terrain}{r.bld.base ? ` · base L${r.bld.base}` : ''}{!r.supplied ? ' · defender supply cut' : ''}</span>}
        {b.airOnly && <span class="warn">· air assault (only air weapons count)</span>}
        {war && <span class="muted">· war goal: {war.goals.includes(b.region) ? 'yes' : 'no'}</span>}
      </div>
      <div class="row" style={{ justifyContent: 'space-between' }}>
        <span>{b.att >= 0 ? <NationChip w={w} id={b.att} /> : 'Pirates'} {pips(b.wins.a)} attacker</span>
        <b>{b.done ? `Finished — ${b.winner ? sideName(w, b, b.winner) + ' won' : 'cancelled'}` : `Round ${b.round}`}</b>
        <span>defender {pips(b.wins.d)} {b.def >= 0 ? <NationChip w={w} id={b.def} /> : 'Pirates'}</span>
      </div>
      {!b.done && (
        <>
          <div class="battle-bar">
            <i style={{ width: `${(b.dmg.a / total) * 100}%`, background: sideColor(w, b, 'a') }}>{b.dmg.a.toLocaleString()}</i>
            <i style={{ width: `${(b.dmg.d / total) * 100}%`, background: sideColor(w, b, 'd') }}>{b.dmg.d.toLocaleString()}</i>
          </div>
          <div class="ticks">{Array.from({ length: TICKS_PER_ROUND() }, (_, i) => {
            const winner = b.ticks[i];
            return <span title={`Tick ${i + 1}: ${tickPoints(i)} pts`} style={{ background: winner ? sideColor(w, b, winner) : i === idx ? '#555' : undefined, opacity: winner ? 1 : 0.5 }} />;
          })}</div>
          <p class="small">Points {b.pts.a} – {b.pts.d} of {roundPoints()} (win with {Math.floor(roundPoints() / 2) + 1}). Tick {idx + 1}/{TICKS_PER_ROUND()}, segment {seg + 1} worth {tickPoints(idx)} pts; next tick in {fmtDur(nextTick - w.time)}.
            Each tick goes to the side leading in <b>round damage</b> when it ends (ties to the defender) — surging late decides the heavy final ticks.</p>
          <div class="row">
            <Btn small onClick={() => store.jumpTo(nextTick)}>⏭ Next tick</Btn>
            <Btn small why={seg >= 3 ? 'Already in the final segment.' : null} showWhy={false} onClick={() => store.jumpTo(b.roundStart + 120)}>⏭ Final segment</Btn>
            <Btn small onClick={() => store.jumpTo(b.roundStart + B.battle.roundMinutes)}>⏭ Round end</Btn>
          </div>
        </>
      )}
    </>
  );
}

function FightPanel({ w, b }: { w: World; b: BattleT }) {
  const p = player(w);
  const defaultSide: 'a' | 'd' = b.def === p.nation || w.nations[b.def]?.alliances.includes(p.nation) ? 'd' : 'a';
  const [side, setSide] = useState<'a' | 'd'>(defaultSide);
  const weaponKeys = Object.keys(p.inv).filter((k) => k.startsWith('wg:') || k.startsWith('wa:')).sort();
  const [wk, setWk] = useState<string>(weaponKeys[weaponKeys.length - 1] ?? 'none');
  const weapon: WeaponSel = wk === 'none' || !(p.inv[wk] > 0) ? null : { kind: wk.split(':')[0] as 'wg' | 'wa', q: Number(wk.split(':')[1]) };
  const pv = hitPreview(w, p, b, side, weapon);
  const why = fightCheck(w, p, b, side, weapon);
  const nat = side === 'a' ? b.att : b.def;
  const market = nat >= 0 ? nat : p.nation;
  const price = weapon ? refPrice(w, market, `${weapon.kind}:${weapon.q}`) : null;
  const cur = w.nations[market]?.cur ?? w.nations[p.nation].cur;
  const bestFood = [5, 4, 3, 2, 1].find((q) => (p.inv[`food:${q}`] ?? 0) > 0);
  const buffs = ['steroids', 'tank', 'bomber', 'bunker', 'focus', 'cutlass'].filter((k) => (p.inv[`sp:${k}`] ?? 0) > 0);
  const maxHits = Math.min(50, Math.floor(p.energy / pv.energy));
  return (
    <Panel title="Fight">
      <div class="form">
        <label>Side <Select value={side} options={[['a', `Attack for ${sideName(w, b, 'a')}`], ['d', `Defend for ${sideName(w, b, 'd')}`]]} onChange={setSide} /></label>
        <label>Weapon <Select value={weapon ? wk : 'none'} options={[['none', 'Unarmed (×1)'], ...weaponKeys.map((k) => [k, `${itemName(k)} ×${(k.startsWith('wa') ? B.damage.air : B.damage.ground)[Number(k.split(':')[1]) - 1]} (${p.inv[k]})`] as [string, string])]} onChange={setWk} /></label>
      </div>
      <div class="stats">
        <div class="stat"><small>Damage per hit</small><b>{Math.round(pv.dmg).toLocaleString()}</b></div>
        <div class="stat"><small>Hit / crit</small><b>{pv.hit.toFixed(0)}% / {pv.crit.toFixed(0)}% ×{(pv.critDmg / 100).toFixed(1)}</b></div>
        <div class="stat"><small>Expected per hit</small><b>{Math.round(pv.expected).toLocaleString()}</b></div>
        <div class="stat"><small>Per 10 energy</small><b>{Math.round((pv.expected * 10) / pv.energy).toLocaleString()}</b></div>
        <div class="stat"><small>Weapon cost / 1k expected dmg</small><b>{price ? fmtAmt(cur, Math.round((price / pv.expected) * 1000)) : weapon ? '—' : 'free'}</b></div>
        <div class="stat"><small>Energy</small><b>{Math.floor(p.energy)}/{maxEnergy(w, p)} ({maxHits} hits)</b></div>
      </div>
      <details><summary class="small">Damage breakdown</summary><ul class="small">{pv.parts.map((x) => <li>{x}</li>)}</ul></details>
      <div class="row">
        <ActBtn kind="primary" why={why} run={(w) => hitMany(w, p, b.id, side, weapon, 1)}>Hit</ActBtn>
        <ActBtn why={why} showWhy={false} run={(w) => hitMany(w, p, b.id, side, weapon, 5)}>×5</ActBtn>
        <ActBtn why={why} showWhy={false} run={(w) => hitMany(w, p, b.id, side, weapon, 10)}>×10</ActBtn>
        <ActBtn why={why ?? (maxHits < 1 ? 'No energy.' : null)} showWhy={false} run={(w) => hitMany(w, p, b.id, side, weapon, maxHits)}>All ({maxHits})</ActBtn>
      </div>
      <div class="row">
        <ActBtn small why={!bestFood ? 'No food.' : p.allowance < 1 ? 'No allowance.' : null} showWhy={false} run={(w) => eat(w, p, bestFood!)}>🍲 Eat {bestFood ? `Q${bestFood}` : ''} ({p.allowance} allowance)</ActBtn>
        {buffs.map((k) => <ActBtn small why={specialCheck(w, p, k)} showWhy={false} run={(w) => useSpecial(w, p, k)}>{SPECIALS[k].icon} {SPECIALS[k].name}</ActBtn>)}
      </div>
      <p class="small muted">Rank {rankOf(p.dmgTotal).name} (×{rankOf(p.dmgTotal).mult.toFixed(1)}). Each hit costs {pv.energy} energy and consumes the selected weapon even on a miss. Round reward pools are shared by damage (40% paid now, 60% to your reserve: {fmtAmt(GOLD, p.reserve)}).</p>
      <ActBtn small why={p.reserve <= 0 ? 'Reserve empty.' : null} showWhy={false} run={(w) => claimReserve(w, p)}>Claim reserve</ActBtn>
    </Panel>
  );
}

function Contributors({ w, b }: { w: World; b: BattleT }) {
  const p = player(w);
  const top = (side: 'a' | 'd', src: Record<number, { a: number; d: number }>) => Object.entries(src).map(([id, v]) => ({ id: Number(id), v: v[side] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 6);
  const myRound = b.cur[p.id] ? b.cur[p.id].a + b.cur[p.id].d : 0;
  const myTotal = b.total[p.id] ? b.total[p.id].a + b.total[p.id].d : 0;
  return (
    <Panel title="Top fighters">
      <p class="small">Your damage — this round {myRound.toLocaleString()}, whole battle {myTotal.toLocaleString()}.</p>
      <div class="book">
        {(['a', 'd'] as const).map((s) => (
          <div><h4>{sideName(w, b, s)} (round)</h4>{top(s, b.cur).map((x) => <div class="small"><CitLink w={w} id={x.id} /> {x.v.toLocaleString()}</div>)}
            <h4>Battle total</h4>{top(s, b.total).slice(0, 3).map((x) => <div class="small"><CitLink w={w} id={x.id} /> {x.v.toLocaleString()}</div>)}</div>
        ))}
      </div>
      <Help>The top damage dealer on each side at the end earns the exclusive hero medal.</Help>
    </Panel>
  );
}
