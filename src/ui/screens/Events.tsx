import { useState } from 'preact/hooks';
import type { World } from '../../sim/types';
import { ActBtn, Btn, Empty, NationChip, Panel, Select, Help } from '../common';
import { store } from '../store';
import { controller, player } from '../../sim/query';
import { activeEvent, attackShip, attackShipCheck, upgradeDepot } from '../../sim/pirates';
import { defuse, defuseCheck, launch, launchCheck, nukeCosts, recon, reconCheck } from '../../sim/nuclear';
import { activeWars, enemyOf } from '../../sim/war';
import { B } from '../../data/balance';
import { fmtWhen } from '../../engine/clock';

export function Events({ w }: { w: World }) {
  const p = player(w);
  const ev = activeEvent(w);
  const past = Object.values(w.events).filter((e) => e.status === 'ended').slice(-3).reverse();
  return (
    <div class="grid">
      <Panel title="🏴‍☠️ Pirate invasions" class="wide">
        <Help>{w.settings.advanced.pirates ? `A pirate fleet of ${B.pirates.ships} ships appears every ~${B.pirates.everyDays} days for ${B.pirates.lengthDays} days.` : 'Recurring pirate invasions are disabled in this campaign.'} Each ship is a temporary sea region defended by {B.pirates.defenders} pirates (event NPCs — they never take citizen rewards). Holding a ship gives your nation a Resource Depot: +{B.pirates.depotBonus * 100}% production per level for its citizens’ and organisations’ companies and a {B.pirates.depotDiscount * 100}% Bazaar discount. Cutlasses (+20% vs ships) are sold while the fleet is here. Everything is removed when the fleet leaves.</Help>
        {ev ? (
          <table class="table">
            <thead><tr><th>Ship</th><th>Held by</th><th>Defenders</th><th>Depot</th><th>Battle</th><th /></tr></thead>
            <tbody>{ev.ships.map((s, i) => (
              <tr><td>{s.name}</td><td>{s.holder != null ? <NationChip w={w} id={s.holder} /> : 'pirates'}</td><td>{s.holder == null ? s.defenders : '—'}</td><td>{s.depot ? `L${s.depot}` : '—'}</td>
                <td>{s.battle != null && w.battles[s.battle] && !w.battles[s.battle].done ? <Btn small onClick={() => { w.player.watch = s.battle; store.go('battle', { battle: s.battle }); }}>Open</Btn> : '—'}</td>
                <td><ActBtn small why={attackShipCheck(w, p.id, i)} showWhy={false} run={(w) => attackShip(w, p.id, i)}>Board</ActBtn>
                  {s.holder === p.nation && <ActBtn small why={null} run={(w) => upgradeDepot(w, p.id, i)}>Upgrade depot</ActBtn>}</td></tr>
            ))}</tbody>
          </table>
        ) : <Empty>No fleet at sea.</Empty>}
        {ev && <p class="small">The fleet leaves {fmtWhen(w, ev.end)}. Boarding requires defense authority; any citizen of that nation can then fight.</p>}
        {past.map((e) => <p class="small muted">Past invasion ended {fmtWhen(w, e.end)}: {e.ships.filter((s) => s.holder != null).map((s) => `${s.name} → ${w.nations[s.holder!].name}`).join(', ') || 'no captures'}.</p>)}
      </Panel>
      <Strategic w={w} />
    </div>
  );
}

function Strategic({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const c = nukeCosts(w, n.id);
  const flying = Object.values(w.nukes).filter((x) => x.status === 'flying');
  const enemies = activeWars(w).filter((x) => x.att === n.id || x.def === n.id).map((x) => enemyOf(x, n.id));
  const targets = w.regions.filter((r) => enemies.includes(controller(r)));
  const [from, setFrom] = useState(n.warheads[0]?.region ?? -1);
  const [target, setTarget] = useState(targets[0]?.id ?? -1);
  const foreign = w.nations.filter((x) => x.id !== n.id);
  const [spyT, setSpyT] = useState(foreign[0].id);
  const known = w.nations[spyT].warheads;
  const [dReg, setDReg] = useState(known[0]?.region ?? -1);
  if (!w.settings.advanced.nuclear) return <Panel title="☢️ Strategic weapons"><Empty>Nuclear weapons and espionage are disabled in this campaign.</Empty></Panel>;
  return (
    <>
      <Panel title="☢️ Nuclear programme">
        <Help>Production needs a congressional authorisation (Congress → “Authorise a nuclear warhead”) and a level-{B.buildings.nukeLevel} military base: {c.gold / 1000} gold, {c.oil.toLocaleString()} oil, {c.iron.toLocaleString()} iron, {c.titanium.toLocaleString()} titanium, {c.hours}h (documented costs; centralist congresses pay less). A strike flies {B.nuke.flightHours}h with a warning, destroys every building level and stored warhead in the target and damages connected regions. Rebuilding is possible.</Help>
        <p>{n.name} warheads: {n.warheads.map((x) => `${x.count} at ${w.regions[x.region].name}`).join(', ') || 'none'}{n.nukeProd ? ` · producing (ready ${fmtWhen(w, n.nukeProd.done)})` : ''}</p>
        {n.warheads.length > 0 && (
          <div class="form row">
            <Select value={from} options={n.warheads.map((x) => [x.region, w.regions[x.region].name])} onChange={setFrom} />
            <Select value={target} options={targets.map((r) => [r.id, `${r.name} (${w.nations[controller(r)].name})`])} onChange={setTarget} />
            <ActBtn kind="danger" why={launchCheck(w, p.id, from, target)} confirm="Launch a nuclear strike? This causes a diplomatic incident with every nation." run={(w) => launch(w, p.id, from, target)}>Launch</ActBtn>
          </div>
        )}
        {flying.map((x) => <p class="warn">🚀 Missile from {w.nations[x.from].name} to {w.regions[x.target].name} arrives {fmtWhen(w, x.arrives)}.</p>)}
      </Panel>
      <Panel title="🕵️ Espionage">
        <Help>Requires the Secret Agent study. Reconnaissance (needs a level-5 base where you are, 24h cooldown): 70% hidden success, 20% exposed success, 10% exposed failure. Defusal targets <i>stored</i> warheads (not missiles in flight): per warhead 25% hidden destruction, 25% exposed destruction, 50% exposed failure. Exposure causes a diplomatic incident.</Help>
        <p class="small">Your intelligence: {p.flags.intel ?? 0}</p>
        <div class="form row">
          <Select value={spyT} options={foreign.map((x) => [x.id, x.name])} onChange={setSpyT} />
          <ActBtn why={reconCheck(w, p, spyT)} run={(w) => recon(w, p, spyT)}>Reconnaissance</ActBtn>
        </div>
        {p.flags[`intel_${spyT}`] ? <p class="small">Known warheads: {known.map((x) => `${x.count} at ${w.regions[x.region].name}`).join(', ') || 'none'}</p> : <p class="small muted">No current intelligence on {w.nations[spyT].name}.</p>}
        {known.length > 0 && <div class="form row"><Select value={dReg} options={known.map((x) => [x.region, w.regions[x.region].name])} onChange={setDReg} />
          <ActBtn why={defuseCheck(w, p, spyT, dReg)} run={(w) => defuse(w, p, spyT, dReg)}>Sabotage stockpile</ActBtn></div>}
      </Panel>
    </>
  );
}
