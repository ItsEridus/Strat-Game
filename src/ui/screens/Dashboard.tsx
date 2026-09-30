import type { World } from '../../sim/types';
import { ActBtn, Amt, Btn, CitLink, NationChip, Panel, RegionLink, Stat } from '../common';
import { store } from '../store';
import { controller, maxEnergy, player, today } from '../../sim/query';
import { eat, powerGain, train, trainCheck } from '../../sim/citizen';
import { publicWorksCheck, publicWorksShift, publicWorksWage, shiftCheck, workShift } from '../../sim/company';
import { tutorialStep } from '../../sim/quests';
import { B } from '../../data/balance';
import { fmtClock } from '../../engine/clock';
import { itemName } from '../../data/items';
import { ENVOY_NAME } from '../../data/names';
import { tracks } from './Character';
import { DAY } from '../../engine/clock';
import { activeCrises, KIND_ICON } from '../../sim/dynamics';
import { crimeLabel } from '../../sim/crime';
import { activityOf } from '../../sim/npc';
import { govTemplate } from '../../sim/stategov';

export function Dashboard({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const loc = w.nations[controller(w.regions[p.loc])];
  const step = tutorialStep(w);
  const bestFood = [5, 4, 3, 2, 1].find((q) => (p.inv[`food:${q}`] ?? 0) > 0);
  const eatWhy = !bestFood ? 'You have no food. Buy some on the Goods Market.' : p.allowance < 1 ? 'No eating allowance left.' : p.energy >= maxEnergy(w, p) ? 'Energy is full.' : null;
  const employer = p.job != null ? w.companies[p.job] : null;
  return (
    <div class="grid">
      {step && (
        <Panel title={`🧭 ${ENVOY_NAME}, civic guide`} class="wide tutorial">
          <p><b>Next: {step.text}.</b> {step.hint}</p>
          <Btn small kind="primary" onClick={() => store.go(step.tab)}>Take me there</Btn>
          <span class="muted small"> Step {w.player.tutorial + 1} of 10 · finishing the tutorial grants enough gold for a first company.</span>
        </Panel>
      )}
      <Panel title="Today" right={<small class="muted">{fmtClock(w)}</small>}>
        <div class="actions">
          <div class="action">
            <b>💼 Work a shift</b>
            <small>{employer ? `${employer.name}` : 'No job yet'}{p.lastWorkDay === today(w) ? ' · done today ✓' : ''}</small>
            <ActBtn kind="primary" why={shiftCheck(w, p)} run={(w) => workShift(w, p)}>Work (−{B.cost.work}⚡)</ActBtn>
            {p.job == null && <Btn small kind="ghost" onClick={() => store.go('jobs')}>Find a job</Btn>}
          </div>
          <div class="action">
            <b>🏋️ Train</b>
            <small>{p.lastTrainDay === today(w) ? 'Power gained today ✓ (extra sessions give XP)' : `+${powerGain(w, p).toFixed(2)} training power`}</small>
            <ActBtn kind="primary" why={trainCheck(w, p, 'normal')} run={(w) => train(w, p)}>Train (−{B.cost.train}⚡)</ActBtn>
          </div>
          <div class="action">
            <b>🍲 Eat</b>
            <small>{bestFood ? `Best: ${itemName(`food:${bestFood}`)} (+${B.food.energy[bestFood - 1]}⚡)` : 'No food in inventory'}</small>
            <ActBtn why={eatWhy} run={(w) => eat(w, p, bestFood!)}>Eat</ActBtn>
          </div>
          <div class="action">
            <b>🏗️ Public works</b>
            <small>Fallback job paid by the treasury: <Amt asset={loc.cur} v={publicWorksWage(w, loc.id)} /></small>
            <ActBtn why={publicWorksCheck(w, p)} run={(w) => publicWorksShift(w, p)}>Work public shift</ActBtn>
          </div>
        </div>
      </Panel>
      <Panel title="Your progress">
        <div class="stats">
          {tracks(w, p).map((t) => <Stat label={t.label} hint={t.next}>{t.value}</Stat>)}
        </div>
      </Panel>
      <Panel title={<span>Your nation: <NationChip w={w} id={n.id} /></span>}>
        <div class="stats">
          <Stat label={n.leader}><CitLink w={w} id={n.president} /></Stat>
          <Stat label="Work tax / VAT / Import">{n.taxes.work}% / {n.taxes.vat}% / {n.taxes.import}%</Stat>
          <Stat label="Treasury"><Amt asset={n.cur} v={n.wallet[n.cur] ?? 0} /></Stat>
          <Stat label="Approval">{Math.round(n.approval)}%</Stat>
          <Stat label="Location"><RegionLink w={w} id={p.loc} /></Stat>
        </div>
      </Panel>
      <Panel title="Alerts" right={<Btn small kind="ghost" onClick={() => store.go('news')}>All</Btn>}>
        <ul class="feed">
          {w.notices.filter((x) => w.settings.notifyFilter[x.cat] !== false).slice(0, 7).map((x) => (
            <li class={x.read ? 'read' : ''} onClick={() => x.link && store.go(x.link)}>{x.text}</li>
          ))}
          {!w.notices.length && <li class="muted">Nothing yet.</li>}
        </ul>
      </Panel>
      <AroundYou w={w} />
      <Panel title="World news" class="wide" right={<Btn small kind="ghost" onClick={() => store.go('news', { newsTab: 'world' })}>More</Btn>}>
        <ul class="feed">
          {w.log.slice(-8).reverse().map((e) => <li>{e.text}</li>)}
        </ul>
      </Panel>
    </div>
  );
}

/** What's happening near the player: local conditions, people nearby, crises, rivals. */
function AroundYou({ w }: { w: World }) {
  const p = player(w);
  const r = w.regions[p.loc];
  const s = w.govs[p.loc];
  const since = w.time - 2 * DAY;
  const local = w.log.filter((e) => e.t >= since && (e.region === p.loc || e.cit === p.id || (e.nation === p.nation && e.important))).slice(-6).reverse();
  const crises = activeCrises(w).filter((c) => c.regions.includes(p.loc) || c.nation === p.nation).slice(0, 3);
  const nearby = Object.values(w.citizens).filter((c) => c.loc === p.loc && !c.player).sort((a, b) => Math.abs(b.rel[p.id] ?? 0) - Math.abs(a.rel[p.id] ?? 0) || b.influence - a.influence).slice(0, 4);
  const cases = Object.values(w.cases).filter((k) => k.status === 'open' && k.suspect === p.id);
  return (
    <Panel title={`📍 Around you: ${r.name}`} class="wide" right={<Btn small kind="ghost" onClick={() => store.go('people')}>People</Btn>}>
      <div class="stats">
        <Stat label="Crime">{Math.round(r.crime)} ({crimeLabel(r.crime)})</Stat>
        <Stat label="Police">{Math.round(r.police)}</Stat>
        <Stat label="Unrest">{Math.round(r.unrest)}</Stat>
        {s && <Stat label={govTemplate(w, p.loc)?.title ?? 'Head'}>{s.head.cit != null ? <CitLink w={w} id={s.head.cit} /> : s.head.name} · {Math.round(s.approval)}%</Stat>}
        <Stat label="Economy">{w.econ.phase}</Stat>
        {cases.length > 0 && <Stat label="Police interest"><span class="warn">{cases.length} open case{cases.length > 1 ? 's' : ''}</span></Stat>}
      </div>
      {crises.map((c) => <p class="small"><span class="link" onClick={() => store.go('world')}>{KIND_ICON[c.kind]} {c.name}</span></p>)}
      <ul class="feed">
        {nearby.map((c) => <li><CitLink w={w} id={c.id} /> — {activityOf(w, c)}{(c.rel[p.id] ?? 0) >= 30 ? ' 🤝' : (c.rel[p.id] ?? 0) <= -30 ? ' 😠' : ''}</li>)}
        {local.map((e) => <li class="muted">{e.text}</li>)}
      </ul>
    </Panel>
  );
}
