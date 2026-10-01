import { WX_INFO } from '../sim/weather';
import { useState } from 'preact/hooks';
import { oneYearOn } from '../sim/periodReview';
import { Emblem, HUD_ICONS } from './icons';
import { SPEED_LABELS, store, useStore } from './store';
import { Bar, Amt } from './common';
import { DAY, dayOf, fmtDur } from '../engine/clock';
import { SEASON_ICON, fmtDate, fmtTime, partOfDay, seasonAt } from '../engine/calendar';
import { latitudeOf } from '../data/earth';
import { GOLD } from '../engine/money';
import { allowanceCap, allowanceEta, energyEta } from '../sim/citizen';
import { controller, maxEnergy, player } from '../sim/query';
import { ageOf, nextBirthday, reputation } from '../sim/growth';
import { upcoming } from './upcoming';
import { SCREENS } from './screens';
import type { World } from '../sim/types';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const s = useStore();
  const w = s.w!;
  const p = player(w);
  const [open, setOpen] = useState(false);
  const max = maxEnergy(w, p);
  const locNat = w.nations[controller(w.regions[p.loc])];
  const home = w.nations[p.nation];
  const speed = s.paused ? 0 : w.settings.speed;
  const ups = open ? upcoming(w) : [];
  return (
    <header class="topbar">
      <button class="menu-btn" onClick={onMenu} aria-label="Menu"><HUD_ICONS.menu size={18} /></button>
      <div class="history" role="group" aria-label="Screen history">
        <button disabled={!s.backTo} onClick={() => store.back()} title={s.backTo ? `Back to ${placeName(w, s.backTo)} (Alt+←)` : 'Back'} aria-label="Back"><HUD_ICONS.back size={18} /></button>
        <button disabled={!s.forwardTo} onClick={() => store.forward()} title={s.forwardTo ? `Forward to ${placeName(w, s.forwardTo)} (Alt+→)` : 'Forward'} aria-label="Forward"><HUD_ICONS.forward size={18} /></button>
      </div>
      <div class="brand"><Emblem size={30} /><span class="word">MERIDIAN&nbsp;REACH</span></div>
      <div class="clock" title={`Day ${dayOf(w.time)} of the campaign · ${SPEED_LABELS[speed]}`}>
        <div class="clock-face">
          <b class="clock-time">{fmtTime(w.time + s.pendingMinutes, !!w.settings.clock24)}</b>
          <span class="clock-date">{fmtDate(w.time, 'long')}</span>
        </div>
        <div class="speeds">
          {[0, 1, 2, 3, 4].map((k) => (
            <button class={speed === k ? 'on' : ''} title={SPEED_LABELS[k]} onClick={() => store.setSpeed(k)}>
              {k === 0 ? '⏸' : '▶'.repeat(k)}
            </button>
          ))}
          <span class="clock-desc">{partOfDay(w.time).icon} {partOfDay(w.time).name} · {SEASON_ICON[seasonAt(w.time, latitudeOf(p.loc))]} {seasonAt(w.time, latitudeOf(p.loc))}{w.weather?.today[p.loc] ? ` · ${WX_INFO[w.weather.today[p.loc].kind].icon} ${w.weather.today[p.loc].t}°C` : ''}</span>
          <div class="adv">
            <button onClick={() => setOpen(!open)} title="Advance time to an event">⏭ Advance</button>
            {open && (
              <div class="dropdown" onMouseLeave={() => setOpen(false)}>
                <button class="strong" onClick={() => { setOpen(false); store.startAdvance(nextBirthday(w, p), `your ${ageOf(w, p) + 1}th birthday`); }}>
                  <span>🎂 Next birthday (age {ageOf(w, p) + 1})</span><small>in {fmtDur(nextBirthday(w, p) - w.time)}</small>
                </button>
                <div class="row pad">
                  <button onClick={() => { setOpen(false); store.jump(DAY, 'tomorrow'); }}>+1 day</button>
                  <button onClick={() => { setOpen(false); store.jump(7 * DAY, 'a week from now'); }}>+1 week</button>
                  <button onClick={() => { setOpen(false); store.jump(30 * DAY, 'a month from now'); }}>+30 days</button>
                  <button onClick={() => { setOpen(false); store.startAdvance(oneYearOn(w.time), 'a year from now'); }} title="Live a whole year: the world is simulated in full, in the background, and stops for important events">+1 year</button>
                </div>
                <button class="strong" onClick={() => { setOpen(false); store.startAdvance(oneYearOn(w.time), 'a year from now', true); }} title="Skip straight to a year from now without stopping. Everyone outside your region is simulated at a coarser level of detail; you get a summary of the year at the end.">
                  <span>⏩ Skip a year</span><small>no stops · summary at the end</small>
                </button>
                {ups.slice(0, 14).map((u) => (
                  <button onClick={() => { setOpen(false); store.jumpTo(u.t, u.label); }}>
                    <span>{u.label}</span><small>in {fmtDur(u.t - w.time)}</small>
                  </button>
                ))}
                <small class="muted pad">Advancement stops early on notifications you set to pause (Settings).</small>
              </div>
            )}
          </div>
        </div>
      </div>
      <div class="vitals">
        <div class="vital" title={`Energy regenerates 1 per 2 minutes. Full in ${fmtDur(energyEta(w, p))}.`}>
          <small><HUD_ICONS.energy size={13} /> Energy {Math.floor(p.energy)}/{max}{p.energy < max ? ` · full in ${fmtDur(energyEta(w, p))}` : ''}</small>
          <Bar v={p.energy} max={max} color="#3fb5a8" />
        </div>
        <div class="vital" title="Eating allowance: each meal uses one; one regenerates every 45 minutes.">
          <small><HUD_ICONS.meals size={13} /> Meals {p.allowance}/{allowanceCap(w, p)}{allowanceEta(w, p) ? ` · +1 in ${fmtDur(allowanceEta(w, p))}` : ''}</small>
          <Bar v={p.allowance} max={allowanceCap(w, p)} color="#e0a526" />
        </div>
        {(() => { const r = reputation(p); const lo = r.min, hi = r.next?.min ?? r.min + 1; return (
          <div class="vital" title={`Reputation: how well known and regarded you are (influence + fame). Age ${ageOf(w, p)}.`}>
            <small>{r.icon} {r.name}{r.next ? ` · ${Math.floor(r.standing)}/${hi}` : ''}</small>
            <Bar v={r.next ? r.standing - lo : 1} max={r.next ? hi - lo : 1} color="#8e7cc3" />
          </div>); })()}
        <div class="money">
          <Amt asset={GOLD} v={p.wallet[GOLD] ?? 0} />
          <Amt asset={home.cur} v={p.wallet[home.cur] ?? 0} />
          {locNat.cur !== home.cur && <Amt asset={locNat.cur} v={p.wallet[locNat.cur] ?? 0} />}
        </div>
        <div class="loc link" onClick={() => store.go('map', { region: p.loc })} title="Your location (click for map)">
          📍 {w.regions[p.loc].name}, {locNat.name}{p.mining ? ' · ⛏ mining' : ''}
        </div>
      </div>
    </header>
  );
}

/** What a history entry leads to: a screen's name, or whose profile. */
function placeName(w: World, v: { tab: string; sel: Record<string, any> }) {
  if (v.tab !== 'citizen') return SCREENS.find((x) => x.id === v.tab)?.label ?? v.tab;
  const id = v.sel.citizen ?? w.playerId;
  return id === w.playerId ? 'your profile' : `${w.citizens[id]?.name ?? 'a person'}'s profile`;
}
