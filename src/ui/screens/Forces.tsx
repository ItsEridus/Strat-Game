// Armed Forces: your nation's army, navy and air force, your service career,
// command of formations, the defence ministry's controls and the war at sea.
import { fmtDay } from '../../engine/calendar';
import { appointChief, appointChiefCheck, commanderInChief, publicOffice, returnToDuty, returnToDutyCheck } from '../../sim/forces';
import { nationals } from '../../sim/census';
import { serviceDays } from '../../sim/growth';
import { useState } from 'preact/hooks';
import type { Branch, Formation, FormationKind, Id, World } from '../../sim/types';
import { ActBtn, Bar, CitLink, Empty, Help, NationChip, Panel, RegionLink, Select } from '../common';
import { controller, player } from '../../sim/query';
import { nationPerm } from '../../sim/authority';
import { B } from '../../data/balance';
import { EARTH } from '../../data/earth';
import { CLASS_INFO, EQUIP_CLASSES } from '../../data/arsenal';
import { arsenalOf, defenceNorm, effectiveGen, formationGen, milexOfGdp, splitOf } from '../../sim/arsenal';
import { ALERT_NAMES, BRANCH_ICON, BRANCH_NAME, KINDS, RANKS } from '../../data/military';
import {
  canOrder, commandCheck, discharge, disband, dutyCheck, enlist, enlistCheck, formationsOf, navalPower, orderCheck, power, raiseCheck, raiseFormation,
  rankName, reportForDuty, seasOf, setAlert, setDefenseBudget, setOrder, superiority, takeCommand, visible,
} from '../../sim/forces';

const orderText = (w: World, f: Formation) => {
  const t = f.order.target;
  const where = typeof t === 'number' ? w.regions[t]?.name : t;
  return `${f.order.kind}${where ? ` → ${where}` : ''}${f.path.length ? ` (${f.path.length}d)` : ''}`;
};

export function Forces({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const mine = formationsOf(w, n.id).sort((a, b) => a.branch.localeCompare(b.branch) || b.strength - a.strength);
  const ministry = nationPerm(w, p.id, n.id, 'war');
  const total = (b: Branch) => mine.filter((f) => f.branch === b);
  return (
    <div class="grid">
      <Panel title={`🎖️ ${n.adj} Armed Forces`} class="wide">
        <div class="stats">
          {(['army', 'navy', 'air'] as Branch[]).map((b) => <div class="stat"><small>{BRANCH_ICON[b]} {BRANCH_NAME[b]}</small><b>{total(b).length} formations · power {Math.round(total(b).reduce((s, f) => s + power(w, f), 0) * 10)}</b></div>)}
          <div class="stat"><small>Commander-in-Chief</small><b>{n.president != null ? <><CitLink w={w} id={n.president} /> <small class="muted">({n.leader})</small></> : 'vacant'}</b></div>
          <div class="stat"><small>Chief of Staff</small><b>{n.defense.chief != null ? <>{rankName(w.citizens[n.defense.chief])} <CitLink w={w} id={n.defense.chief} /></> : 'vacant'}</b></div>
          <div class="stat"><small>Military budget</small><b>{Math.round(n.defense.budget * 1000) / 10}% of revenue ({milexOfGdp(n).toFixed(1)}% of GDP){n.defense.unpaid ? <span class="bad"> · unpaid {n.defense.unpaid}d</span> : ''}</b></div>
          <div class="stat"><small>Security alert</small><b class={n.alert >= 4 ? 'bad' : n.alert >= 3 ? 'warn' : ''}>{n.alert} · {ALERT_NAMES[n.alert]}</b></div>
        </div>
        <Help>Formations fight in battles alongside citizens: divisions in or next to the battle region (defenders garrisoned there fight automatically), air wings within {B.forces.airRangeKm.toLocaleString()} km on strike or superiority missions, fleets in a sea that touches the coast. Invasions need a land border — or naval superiority for an amphibious landing; otherwise they are air assaults. Upkeep comes from the military budget; unpaid forces lose morale and readiness; equipment wears and is repaired from national stocks.</Help>
      </Panel>

      <ArsenalPanel w={w} />
      <CommandPanel w={w} />
      <ServicePanel w={w} />
      {ministry && <MinistryPanel w={w} />}

      <Panel title="📋 Order of battle" class="wide">
        <div class="scroll-x"><table class="table compact small">
          <thead><tr><th>Formation</th><th>Where</th><th>Strength</th><th>Equip.</th><th>Gen.</th><th>Ready</th><th>Morale</th><th>Exp.</th><th>Commander</th><th>Orders</th><th /></tr></thead>
          <tbody>{mine.map((f) => <FormationRow w={w} f={f} />)}</tbody>
        </table></div>
      </Panel>

      <SeasPanel w={w} />
      <ForeignPanel w={w} />
    </div>
  );
}

function FormationRow({ w, f }: { w: World; f: Formation }) {
  const p = player(w);
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <td>{KINDS[f.kind].icon} <b>{f.name}</b><br /><span class="muted">{KINDS[f.kind].name}</span></td>
        <td>{f.branch === 'navy' ? <>{f.zone}<br /><span class="muted">port: <RegionLink w={w} id={f.loc} /></span></> : <RegionLink w={w} id={f.loc} />}</td>
        <td><Bar v={f.strength} max={100} color="#46b873" label={`${Math.round(f.strength)}`} /></td>
        <td><Bar v={f.equipment} max={100} color="#5b8def" label={`${Math.round(f.equipment)}`} /></td>
        <td>{formationGen(w, f).toFixed(1)}</td>
        <td>{Math.round(f.readiness)}</td><td>{Math.round(f.morale)}</td><td>{Math.round(f.experience)}</td>
        <td>{f.commander != null ? <>{rankName(w.citizens[f.commander])}<br /><CitLink w={w} id={f.commander} /></> : <span class="muted">none</span>}</td>
        <td>{orderText(w, f)}</td>
        <td>{canOrder(w, p.id, f) && <button class="btn sm" onClick={() => setOpen(!open)}>Orders</button>}
          {!commandCheck(w, p, f.id) && <ActBtn small run={(w) => takeCommand(w, p, f.id)}>Take command</ActBtn>}</td>
      </tr>
      {open && <tr><td colSpan={10}><OrderForm w={w} f={f} /></td></tr>}
    </>
  );
}

function OrderForm({ w, f }: { w: World; f: Formation }) {
  const p = player(w);
  const battles = Object.values(w.battles).filter((b) => !b.done && b.kind === 'war' && (b.att === f.nation || b.def === f.nation));
  const regions = w.regions.filter((r) => controller(r) === f.nation || r.links.some((l) => controller(w.regions[l]) === f.nation)).sort((a, b) => a.name.localeCompare(b.name));
  const [dest, setDest] = useState<Id>(regions[0]?.id ?? 0);
  const [zone, setZone] = useState<string>(EARTH.seas[0].name);
  const [bat, setBat] = useState<Id>(battles[0]?.region ?? -1);
  const ministry = nationPerm(w, p.id, f.nation, 'war');
  const opts: [string, (w: World) => ReturnType<typeof setOrder>, string | null][] = [];
  if (f.branch === 'army') {
    opts.push(['Garrison', (w) => setOrder(w, p.id, f.id, 'garrison', null), orderCheck(w, p.id, f.id, 'garrison', null)]);
    opts.push(['March', (w) => setOrder(w, p.id, f.id, 'move', dest), orderCheck(w, p.id, f.id, 'move', dest)]);
    opts.push(['Support battle', (w) => setOrder(w, p.id, f.id, 'support', bat), orderCheck(w, p.id, f.id, 'support', bat)]);
  } else if (f.branch === 'navy') {
    opts.push(['Patrol here', (w) => setOrder(w, p.id, f.id, 'patrol', null), orderCheck(w, p.id, f.id, 'patrol', null)]);
    opts.push(['Sail', (w) => setOrder(w, p.id, f.id, 'move', zone), orderCheck(w, p.id, f.id, 'move', zone)]);
    opts.push(['Bombard / support', (w) => setOrder(w, p.id, f.id, 'support', bat), orderCheck(w, p.id, f.id, 'support', bat)]);
  } else {
    opts.push(['Stand down', (w) => setOrder(w, p.id, f.id, 'garrison', null), orderCheck(w, p.id, f.id, 'garrison', null)]);
    opts.push(['Strike', (w) => setOrder(w, p.id, f.id, 'strike', bat), orderCheck(w, p.id, f.id, 'strike', bat)]);
    opts.push(['Air superiority', (w) => setOrder(w, p.id, f.id, 'superiority', bat), orderCheck(w, p.id, f.id, 'superiority', bat)]);
  }
  return (
    <div class="row small">
      {f.branch === 'army' && <>March to <Select value={dest} options={regions.map((r) => [r.id, `${r.name}${controller(r) !== f.nation ? ` (${w.nations[controller(r)].name})` : ''}`])} onChange={setDest} /></>}
      {f.branch === 'navy' && <>Sail to <Select value={zone} options={EARTH.seas.map((s) => [s.name, s.name])} onChange={setZone} /></>}
      {battles.length > 0 && <>Battle <Select value={bat} options={battles.map((b) => [b.region, `${w.regions[b.region].name} (${w.nations[b.att]?.name ?? '?'} vs ${w.nations[b.def]?.name ?? '?'})`])} onChange={setBat} /></>}
      {opts.map(([label, run, why]) => <ActBtn small why={why} showWhy={false} run={run}>{label}</ActBtn>)}
      {ministry && <ActBtn small kind="danger" confirm={`Disband the ${f.name}?`} run={(w) => disband(w, p.id, f.id)}>Disband</ActBtn>}
    </div>
  );
}

/** The chain of command: civilian leadership over the uniformed chiefs. */
function CommandPanel({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const cinc = commanderInChief(w, n.id);
  const isCinc = cinc?.id === p.id;
  const [pick, setPick] = useState<number | null>(null);
  const candidates = isCinc ? nationals(w, n.id).filter((c) => !appointChiefCheck(w, p.id, n.id, c.id)).sort((a, b) => b.mil.rank - a.mil.rank || b.mil.sp - a.mil.sp).slice(0, 12) : [];
  return (
    <Panel title="🏛️ Chain of command">
      <table class="table compact small"><tbody>
        <tr><td>Commander-in-Chief</td><td>{cinc ? <><CitLink w={w} id={cinc.id} /> <small class="muted">· {n.leader}, civilian</small></> : <span class="muted">vacant</span>}</td></tr>
        <tr><td>Minister of Defense</td><td>{n.cabinet.defense != null ? <CitLink w={w} id={n.cabinet.defense} /> : <span class="muted">none</span>}</td></tr>
        <tr><td>Chief of Staff</td><td>{n.defense.chief != null ? <>{rankName(w.citizens[n.defense.chief])} <CitLink w={w} id={n.defense.chief} /> <small class="muted">· {n.defense.appointed ? 'appointed by the Commander-in-Chief' : 'most senior officer'}</small></> : <span class="muted">vacant</span>}</td></tr>
        <tr><td>Formation commanders</td><td>{formationsOf(w, n.id).filter((f) => f.commander != null).length} of {formationsOf(w, n.id).length} formations</td></tr>
      </tbody></table>
      <Help>The armed forces answer to civilian government: the {n.leader} is Commander-in-Chief while in office and can order any formation. Anyone holding public office ({n.leader}, ministers, members of the {n.legislature}, governors) passes to the reserve and keeps their rank until they leave office.</Help>
      {isCinc && (
        <div class="row">
          <Select value={pick ?? -1} options={[[-1, 'Appoint a Chief of Staff…'], ...candidates.map((c) => [c.id, `${rankName(c)} ${c.name}`] as [number, string])]} onChange={(v) => setPick(v < 0 ? null : v)} />
          <ActBtn small kind="primary" why={pick == null ? 'Choose an officer.' : appointChiefCheck(w, p.id, n.id, pick)} run={(w) => appointChief(w, p.id, n.id, pick!)}>Appoint</ActBtn>
        </div>
      )}
    </Panel>
  );
}

function ServicePanel({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  if (p.mil.branch && p.mil.reserve) {
    const office = publicOffice(w, p);
    return (
      <Panel title={`${BRANCH_ICON[p.mil.branch]} ${rankName(p)} (reserve), ${n.adj} ${BRANCH_NAME[p.mil.branch]}`}>
        <p class="small">{office ? `You are in the reserve while you serve as ${office}: no duty, pay, command or promotion, but your rank and record are kept.` : 'You are in the reserve. Your rank and record are kept; time in the reserve does not count toward promotion.'} Service {serviceDays(w, p)} days · {Math.floor(p.mil.sp)} SP.</p>
        <div class="row">
          <ActBtn kind="primary" why={returnToDutyCheck(w, p)} run={(w) => returnToDuty(w, p)}>Return to active duty</ActBtn>
          <ActBtn small kind="ghost" confirm="Leave the armed forces for good?" run={(w) => discharge(w, p)}>Discharge</ActBtn>
        </div>
      </Panel>
    );
  }
  if (!p.mil.branch) {
    return (
      <Panel title="🪖 Enlist">
        <p class="small">Serve in the {n.adj} armed forces: report for duty daily for pay and service points, fight in wars for more, climb the ranks, and from Colonel/Captain command a division, fleet or air wing. Serving citizens deal +{B.forces.rankBonus * 100}% war damage per rank.</p>
        <div class="row">{(['army', 'navy', 'air'] as Branch[]).map((b) => <ActBtn why={enlistCheck(w, p, b)} run={(w) => enlist(w, p, b)}>{BRANCH_ICON[b]} {BRANCH_NAME[b]}</ActBtn>)}</div>
      </Panel>
    );
  }
  const ladder = RANKS[p.mil.branch];
  const next = ladder[p.mil.rank + 1];
  const cmd = Object.values(w.forces).find((f) => f.commander === p.id);
  const eligible = formationsOf(w, p.nation).filter((f) => !commandCheck(w, p, f.id));
  return (
    <Panel title={`${BRANCH_ICON[p.mil.branch]} ${rankName(p)}, ${n.adj} ${BRANCH_NAME[p.mil.branch]}`}>
      <p class="small">Service points {Math.floor(p.mil.sp)} · serving since {fmtDay(p.mil.since)}{cmd ? ` · commanding the ${cmd.name}` : ''}{n.defense.chief === p.id ? ' · Chief of Staff' : ''}</p>
      {next ? <Bar v={p.mil.sp} max={next.sp} color="#e0a526" label={`next: ${next.name} at ${next.sp} SP and ${next.days} days' service${next.flag ? ', 10 days in command' : ''}`} /> : <p class="good small">Highest rank reached.</p>}
      <div class="row">
        <ActBtn kind="primary" why={dutyCheck(w, p)} run={(w) => reportForDuty(w, p)}>Report for duty (−{B.forces.dutyEnergy}⚡)</ActBtn>
        <ActBtn small kind="ghost" confirm="Leave the armed forces?" run={(w) => discharge(w, p)}>Discharge</ActBtn>
      </div>
      {!cmd && eligible.length > 0 && <p class="small">You can take command: {eligible.slice(0, 4).map((f) => <ActBtn small run={(w) => takeCommand(w, p, f.id)}>{f.name}</ActBtn>)}</p>}
      <details><summary class="small">Rank ladder</summary><p class="small muted">Above every rank: the Commander-in-Chief — the {n.leader}, a civilian office held only while in power.</p><ol class="small">{ladder.map((r, i) => <li class={i === p.mil.rank ? 'good' : i < p.mil.rank ? 'muted' : ''}>{r.name} — {r.sp} SP, {r.days} days' service{r.command ? ' · command' : ''}{r.flag ? ' · flag rank' : ''}</li>)}</ol></details>
    </Panel>
  );
}

function MinistryPanel({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const [budget, setBudget] = useState(Math.round(n.defense.budget * 100));
  const [alert, setAlertLv] = useState(n.alert);
  const [kind, setKind] = useState<FormationKind>('infantry');
  const own = w.regions.filter((r) => r.owner === n.id && controller(r) === n.id).sort((a, b) => a.name.localeCompare(b.name));
  const [rid, setRid] = useState<Id>(n.capital);
  const k = KINDS[kind];
  return (
    <Panel title="🏛️ Defence ministry">
      <div class="row small">Budget <Select value={budget} options={[0, 5, 10, 15, 20, 25, 30, 40, 50].map((x) => [x, `${x}% of revenue`])} onChange={setBudget} />
        <ActBtn small run={(w) => setDefenseBudget(w, p.id, n.id, budget / 100)}>Set</ActBtn></div>
      <div class="row small">Alert <Select value={alert} options={[1, 2, 3, 4, 5].map((x) => [x, `${x} · ${ALERT_NAMES[x]}`])} onChange={setAlertLv} />
        <ActBtn small run={(w) => setAlert(w, p.id, n.id, alert)}>Set</ActBtn></div>
      <div class="row small">Raise <Select value={kind} options={(Object.keys(KINDS) as FormationKind[]).map((x) => [x, `${KINDS[x].icon} ${KINDS[x].name}`])} onChange={setKind} />
        in <Select value={rid} options={own.map((r) => [r.id, `${r.name}${seasOf(r.id).length ? ' ⚓' : ''}`])} onChange={setRid} />
        <ActBtn small why={raiseCheck(w, p.id, n.id, kind, rid)} run={(w) => raiseFormation(w, p.id, n.id, kind, rid)}>Raise</ActBtn></div>
      <p class="small muted">{k.desc} Cost: {k.raise.money} + {Object.entries(k.raise.items).map(([i, q]) => `${q} ${i}`).join(', ')} from national storage.</p>
    </Panel>
  );
}

function SeasPanel({ w }: { w: World }) {
  const p = player(w);
  const mySeas = new Set(w.regions.filter((r) => controller(r) === p.nation).flatMap((r) => seasOf(r.id)));
  for (const f of formationsOf(w, p.nation)) if (f.zone) mySeas.add(f.zone);
  const rows = [...mySeas].sort().map((z) => {
    const rivals = w.nations.filter((n) => n.id !== p.nation && Object.values(w.forces).some((f) => f.nation === n.id && f.zone === z && visible(w, p.nation, f)));
    const top = rivals.map((n) => ({ n, v: navalPower(w, n.id, z) })).sort((a, b) => b.v - a.v)[0];
    const mine = navalPower(w, p.nation, z);
    const status = top && superiority(w, top.n.id, p.nation, z) ? <span class="bad">{top.n.name} rules</span> : mine > 0 && (!top || superiority(w, p.nation, top.n.id, z)) ? <span class="good">ours</span> : mine > 0 ? 'contested' : <span class="muted">no fleet</span>;
    return <tr><td>{z}</td><td>{Math.round(mine * 10)}</td><td>{top ? <><NationChip w={w} id={top.n.id} /> {Math.round(top.v * 10)}</> : <span class="muted">—</span>}</td><td>{status}</td></tr>;
  });
  const blockaded = w.regions.filter((r) => r.blockade != null && controller(r) === p.nation);
  return (
    <Panel title="🌊 The seas">
      <table class="table compact small"><thead><tr><th>Sea</th><th>Our power</th><th>Strongest rival seen</th><th>Control</th></tr></thead><tbody>{rows}</tbody></table>
      {blockaded.length > 0 && <p class="small bad">Blockaded: {blockaded.map((r) => r.name).join(', ')} (−{B.forces.blockade * 100}% production; sea lanes cut).</p>}
      <ul class="small">{w.navalLog.slice(0, 6).map((l) => <li>{fmtDay(l.t)}: {l.text}</li>)}</ul>
      <Help>Superiority (20% more naval power than the enemy in a sea) allows amphibious landings on its coasts, blockades enemy coasts during war (production and sea-lane supply cut), and lets armies cross sea lanes.</Help>
    </Panel>
  );
}

function ForeignPanel({ w }: { w: World }) {
  const p = player(w);
  const foreign = Object.values(w.forces).filter((f) => f.nation !== p.nation && visible(w, p.nation, f)).sort((a, b) => a.nation - b.nation || b.strength - a.strength);
  const hidden = Object.values(w.forces).filter((f) => f.nation !== p.nation && !visible(w, p.nation, f)).length;
  return (
    <Panel title="🔭 Foreign forces in view">
      {foreign.length ? <table class="table compact small"><tbody>{foreign.slice(0, 40).map((f) => (
        <tr><td><NationChip w={w} id={f.nation} /></td><td>{KINDS[f.kind].icon} {f.name}</td><td>{f.branch === 'navy' ? f.zone : w.regions[f.loc].name}</td><td>str {Math.round(f.strength)}</td></tr>
      ))}</tbody></table> : <Empty>No foreign formations in view.</Empty>}
      <p class="small muted">{hidden} foreign formations are beyond your sight. Forces near your borders and seas are visible; deep intelligence networks (50+) or a "Military reconnaissance" operation reveal the rest.</p>
    </Panel>
  );
}

/** The national arsenal: the defence budget's split and each class of equipment's generation and age. */
function ArsenalPanel({ w }: { w: World }) {
  const n = w.nations[player(w).nation];
  const a = arsenalOf(w, n);
  const s = splitOf(n);
  return (
    <Panel title="🏭 Arsenal" class="wide">
      <p class="small">Defence spending: <b>{milexOfGdp(n).toFixed(1)}% of GDP</b> (usually {(defenceNorm(n) * 100).toFixed(1)}% of revenue) · personnel {Math.round(s.personnel * 100)}% · operations and maintenance {Math.round(s.om * 100)}% · procurement {Math.round(s.procurement * 100)}% · R&D {Math.round(s.rd * 100)}%</p>
      <div class="scroll-x"><table class="table compact small">
        <thead><tr><th>Equipment</th><th>Generation</th><th>Average age</th><th>Condition</th></tr></thead>
        <tbody>{EQUIP_CLASSES.map((cls) => {
          const st = a[cls];
          if (!st.gen) return <tr><td>{CLASS_INFO[cls].icon} {CLASS_INFO[cls].label}</td><td colSpan={3} class="muted">not fielded</td></tr>;
          const eff = effectiveGen(cls, st);
          const life = CLASS_INFO[cls].life;
          return <tr><td>{CLASS_INFO[cls].icon} {CLASS_INFO[cls].label}</td><td>{st.gen.toFixed(1)}{eff < st.gen - 0.05 ? <span class="bad"> (fights as {eff.toFixed(1)})</span> : ''}</td><td>{st.age.toFixed(0)} years</td>
            <td class={st.age > life * 0.7 ? 'bad' : st.age > life * 0.5 ? 'warn' : 'good'}>{st.age > life * 0.7 ? 'ageing: wears fast, loses edge' : st.age > life * 0.5 ? 'mid-life' : 'modern'}</td></tr>;
        })}</tbody>
      </table></div>
      <Help>Equipment generations run from 1 to 6 (for fighters: 4 = F-16 or Su-27, 5 = F-35 or J-20). Each generation is worth about 15% in combat. Procurement contracts renew equipment over its service life; without them it ages, wears faster and, past about 70% of its life, loses its edge. Procurement and R&D money goes to the country's defence contractor.</Help>
    </Panel>
  );
}
