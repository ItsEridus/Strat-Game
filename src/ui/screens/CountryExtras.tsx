// Government action panels on the Country screen. Each panel appears only for
// officials holding the matching authority; actions run through permission checks.
import { useState } from 'preact/hooks';
import { fromLocal as fromL, localStep as stepL, toLocal as toL } from '../../engine/money';
import type { Id, Ministry, World } from '../../sim/types';
import { ActBtn, CitLink, Empty, Item, Num, Panel, Select, Help } from '../common';
import { store } from '../store';
import { citizensOf, natref, player } from '../../sim/query';
import { MINISTRY_INFO, nationPerm } from '../../sim/authority';
import { appoint, resignOffice } from '../../sim/politics';
import { decideCitizenship } from '../../sim/travel';
import { list } from '../../sim/market';
import { placeOrder, ordersOf, cancelOrder } from '../../sim/fx';
import { GOLD, fmtAmt, g } from '../../engine/money';
import { itemName } from '../../data/items';
import { fmtWhen } from '../../engine/clock';
import { Diplomacy } from './Diplomacy';
import { REGIMES, regimeOf } from '../../sim/regimes';
import { coupRisk } from '../../sim/uprisings';
import { Bar } from '../common';
import { identityOf } from '../../sim/secession';
import { TECHS } from '../../data/techTree';
import { controlled, hasTech, researchMass, threshold } from '../../sim/technology';
import { capsOf } from '../../sim/strategic';

export function CountryExtras({ w, id }: { w: World; id: Id }) {
  const p = player(w);
  const n = w.nations[id];
  const mine = p.nation === id;
  const offices = Object.entries(n.cabinet).filter(([, v]) => v === p.id).map(([k]) => k as Ministry);
  return (
    <>
      <RegimePanel w={w} id={id} />
      <TechPanel w={w} id={id} />
      {mine && n.president === p.id && <Cabinet w={w} />}
      {mine && offices.length > 0 && (
        <Panel title="Your office">
          <p>You serve as {offices.map((m) => MINISTRY_INFO[m].name).join(', ')}.</p>
          <ActBtn kind="danger" run={(w) => resignOffice(w, p)} confirm="Resign your ministry?">Resign</ActBtn>
        </Panel>
      )}
      {mine && nationPerm(w, p.id, id, 'exchange') && <TreasuryFx w={w} />}
      {mine && nationPerm(w, p.id, id, 'publicTrade') && <PublicTrade w={w} />}
      {mine && nationPerm(w, p.id, id, 'recruit') && <Applications w={w} />}
      <Diplomacy w={w} id={id} />
    </>
  );
}

function Cabinet({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const pool = citizensOf(w, n.id).filter((c) => c.id !== p.id).sort((a, b) => b.influence - a.influence);
  return (
    <Panel title="👑 Appoint your cabinet" class="wide">
      <Help>Ministers act with national authority in their portfolio; AI ministers carry out their priorities daily. Loyal, competent allies from your party work best — appointments improve their opinion of you.</Help>
      <table class="table compact"><tbody>
        {(Object.keys(MINISTRY_INFO) as Ministry[]).map((m) => (
          <tr><td title={MINISTRY_INFO[m].desc}>{MINISTRY_INFO[m].name}</td><td><CitLink w={w} id={n.cabinet[m]} /></td>
            <td><Select value={n.cabinet[m] ?? -1} options={[[-1, '— vacant —'], ...pool.map((c) => [c.id, `${c.name} (${c.persona}, infl ${Math.round(c.influence)}${c.party === p.party ? ', your party' : ''})`] as [number, string])]} onChange={(v) => store.act((w) => appoint(w, p, m, v === -1 ? null : v))} /></td></tr>
        ))}
      </tbody></table>
    </Panel>
  );
}

function TreasuryFx({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const [amt, setAmt] = useState(10);
  const [rate, setRate] = useState(Math.round(toL(n.cur, n.fxAnchor)));
  const orders = ordersOf(w, natref(n.id));
  return (
    <Panel title="💱 Treasury exchange (economy)">
      <p class="small">Treasury: {fmtAmt(n.cur, n.wallet[n.cur] ?? 0)} · {fmtAmt(GOLD, n.wallet[GOLD] ?? 0)} · reference rate {fmtAmt(n.cur, n.fxAnchor)}/g</p>
      <div class="form row">
        <label>Gold <Num value={amt} onInput={setAmt} /></label>
        <label>Rate ({n.cur} per gold) <Num value={rate} step={stepL(n.cur)} onInput={setRate} /></label>
        <ActBtn run={(w) => placeOrder(w, p.id, natref(n.id), n.cur, 'sellGold', g(amt), fromL(n.cur, rate))}>Sell treasury gold</ActBtn>
        <ActBtn run={(w) => placeOrder(w, p.id, natref(n.id), n.cur, 'sellCur', g(amt), fromL(n.cur, rate))}>Buy gold for treasury</ActBtn>
      </div>
      {orders.map((o) => <div class="small">{o.side === 'sellGold' ? 'Ask' : 'Bid'} @ {fmtAmt(n.cur, o.rate)} · {fmtAmt(o.side === 'sellGold' ? GOLD : n.cur, o.amount)} <ActBtn small kind="ghost" run={(w) => cancelOrder(w, p.id, o.id)}>Cancel</ActBtn></div>)}
      <p class="small muted">While you hold this post the AI central bank stops re-quoting; you manage liquidity.</p>
    </Panel>
  );
}

function PublicTrade({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  const keys = Object.keys(n.inv).filter((k) => (n.inv[k] ?? 0) > 0);
  const [key, setKey] = useState(keys[0] ?? 'food:1');
  const [qty, setQty] = useState(10);
  const [price, setPrice] = useState(() => Math.round(toL(n.cur, 500) * 100) / 100);
  return (
    <Panel title="📦 National storage (labour)">
      <ul class="inv-list">{keys.map((k) => <li><Item k={k} n={n.inv[k]} /></li>)}</ul>
      {!keys.length && <Empty>Empty.</Empty>}
      <div class="form row">
        <Select value={key} options={keys.map((k) => [k, itemName(k)])} onChange={setKey} />
        <Num value={qty} onInput={setQty} /> <label>@ <Num value={price} step={stepL(n.cur) / 10} onInput={setPrice} /> {n.cur}</label>
        <ActBtn why={!keys.length ? 'Nothing to sell.' : null} run={(w) => list(w, p.id, natref(n.id), n.id, key, qty, fromL(n.cur, price))}>List on market</ActBtn>
      </div>
    </Panel>
  );
}

function Applications({ w }: { w: World }) {
  const p = player(w);
  const n = w.nations[p.nation];
  return (
    <Panel title="🛂 Citizenship applications (recruitment)">
      {n.requests.length ? n.requests.map((r) => (
        <div class="row"><CitLink w={w} id={r.cit} /> from {w.nations[w.citizens[r.cit]?.nation]?.name} · {fmtWhen(w, r.t)}
          <ActBtn small run={(w) => decideCitizenship(w, p.id, n.id, r.cit, true)}>Approve</ActBtn>
          <ActBtn small kind="danger" run={(w) => decideCitizenship(w, p.id, n.id, r.cit, false)}>Deny</ActBtn></div>
      )) : <Empty>No pending applications.</Empty>}
    </Panel>
  );
}

function TechPanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const caps = capsOf(w, n);
  const firsts = w.techFirsts ?? {};
  const next = TECHS.filter((d) => !hasTech(n, d.id)).map((d) => ({ d, gap: threshold(d) - caps.tech[d.domain] })).sort((a, b) => a.gap - b.gap).slice(0, 4);
  return (
    <Panel title="🔬 Technology">
      <p class="small">Research effort {researchMass(n).toFixed(1)} (R&D spending × the size of the economy). {Object.keys(n.techs ?? {}).length} of {TECHS.length} frontier technologies; {Object.values(firsts).filter((f) => f.nation === id).length} world firsts.</p>
      <table class="table compact small"><tbody>
        {TECHS.filter((d) => hasTech(n, d.id)).map((d) => <tr><td title={d.desc}>{d.icon} {d.name}</td><td>{firsts[d.id]?.nation === id ? '🥇 first' : 'adopted'} {fmtWhen(w, n.techs![d.id])}</td></tr>)}
        {next.map(({ d, gap }) => <tr class="muted"><td title={d.desc}>{d.icon} {d.name}</td><td>{gap > 0 ? `${gap.toFixed(1)} points of ${d.domain} technology short` : firsts[d.id] ? (controlled(w, n, d.id) ? 'within reach; its holders keep it from us' : 'within reach; adoption under way') : d.uncertain ? 'within reach of research; an uncertain breakthrough' : 'within reach of research'}</td></tr>)}
      </tbody></table>
      <Help>Technologies become possible as a country advances in each domain (R&D, with know-how spreading from the leaders). The first to reach one may make the breakthrough, more likely with a larger research effort; others adopt it once they are close, faster with good institutions, slower if every holder dislikes them. Each brings faster growth for a decade, stronger forces, sharper intelligence, longer lives or cheaper energy.</Help>
    </Panel>
  );
}

function RegimePanel({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const r = regimeOf(n);
  const rules = REGIMES[r.type];
  return (
    <Panel title={`🏛️ ${rules.label}`}>
      <p class="small">{rules.desc}</p>
      <table class="table compact small"><tbody>
        <tr><td>Legitimacy</td><td><Bar v={r.legitimacy} max={100} color={r.legitimacy < 35 ? '#e0574f' : '#4caf7a'} label={`${Math.round(r.legitimacy)}`} /></td></tr>
        <tr><td>Elections</td><td>{rules.free ? 'free and fair' : rules.managed >= 100 ? 'no contest for the head of state' : `managed in favour of those in power (+${rules.managed})`}</td></tr>
        <tr><td>Term limits</td><td>{rules.termLimit ? `${rules.termLimit} terms for the head of government` : 'none'}</td></tr>
        <tr><td>Succession</td><td>{({ election: 'by election', party: 'chosen by the ruling party', heir: 'to a royal heir', council: 'by a council of officers' } as const)[rules.succession]}</td></tr>
        <tr><td>Press</td><td>{rules.press >= 0.6 ? 'free' : rules.press >= 0.35 ? 'under pressure' : 'controlled'}</td></tr>
        <tr><td>Protest movement</td><td><Bar v={n.protest ?? 0} max={100} color="#e39b3a" label={`${Math.round(n.protest ?? 0)}`} /></td></tr>
        <tr><td>Risk of a coup</td><td>{(coupRisk(w, n) * 100).toFixed(1)}% a year{(n.coupProof ?? 0) > 0.2 ? ' (the army has been purged and watched)' : ''}</td></tr>
      </tbody></table>
      {n.dissolved != null && <p class="small">🏴 {n.name} no longer exists: it became part of {w.nations[n.mergedInto ?? -1]?.name ?? 'another country'} on {fmtWhen(w, n.dissolved)}.</p>}
      {n.faction && n.dissolved == null && <p class="small">⚔️ A rebel government fighting a civil war against {w.nations[n.parent ?? -1]?.name ?? 'the old government'}.</p>}
      {n.overlord != null && <p class="small">🎎 A puppet of {w.nations[n.overlord]?.name}: bound by a defence treaty, paying 2% of its gold a month in tribute, and unable to attack its overlord.</p>}
      {w.nations.some((o) => o.overlord === n.id && o.dissolved == null) && <p class="small">🎎 Puppet states: {w.nations.filter((o) => o.overlord === n.id && o.dissolved == null).map((o) => o.name).join(', ')}.</p>}
      {(n.insurgency ?? 0) >= 30 && <p class="small">💣 An insurgency ({Math.round(n.insurgency ?? 0)} of 100) is wearing down troops and raising unrest in restive regions.</p>}
      {n.failedSince != null && <p class="small">🏚️ A failed state since {fmtWhen(w, n.failedSince)}: institutions are decaying, unrest is spreading and a coup is twice as likely. It recovers when legitimacy passes 30 and unrest falls below 45.</p>}
      {n.parent != null && (
        <p class="small">🏳️ Independent from {w.nations[n.parent]?.name ?? 'its old country'} since {fmtWhen(w, n.founded ?? 0)}. Recognised by {(n.recognisedBy ?? []).length} of {w.nations.filter((o) => o.id !== n.id && !o.exile).length} countries{(n.recognisedBy ?? []).length ? `: ${(n.recognisedBy ?? []).map((o) => w.nations[o]?.name).filter(Boolean).join(', ')}` : ''}.</p>
      )}
      {(() => {
        const movements = w.regions.filter((x) => x.owner === n.id && (x.indep ?? 0) >= 10).sort((a, b) => (b.indep ?? 0) - (a.indep ?? 0)).slice(0, 5);
        return movements.length > 0 && (
          <table class="table compact small"><thead><tr><th>Region</th><th>Identity</th><th>Support for independence</th></tr></thead><tbody>
            {movements.map((x) => <tr><td>{x.name}{x.indepMovement ? ' 🏳️' : ''}</td><td>{identityOf(x)}</td><td><Bar v={x.indep ?? 0} max={100} color={(x.indep ?? 0) > 45 ? '#e0574f' : '#e39b3a'} label={`${Math.round(x.indep ?? 0)}%`} /></td></tr>)}
          </tbody></table>
        );
      })()}
      {r.history.length > 0 && <ul class="small">{r.history.slice(-5).reverse().map((h) => <li>{fmtWhen(w, h.t)}: {REGIMES[h.from].label} → {REGIMES[h.to].label} ({h.why})</li>)}</ul>}
      <Help>Every country starts from its real regime in 2025. Legitimacy follows the economy, the government's popularity, whether elections are free, and the cost of repression. Democracies can slide when leaders are nationalist and legitimacy is low, though strong courts resist it; autocracies can open up when legitimacy collapses. Disloyal officers plot coups, more often in weak states and in turmoil. Protest movements grow when legitimacy is low; governments concede or repress, and a movement that grows large enough brings down an autocracy if the security forces refuse to fire, or forces an early election in a democracy. Regions with an identity of their own (language, history, nationhood) grow support for independence when they are alienated: unrest, an unpopular or illegitimate government, repression, a war going badly. A democracy may hold a referendum; elsewhere a region may declare independence, and its old country may fight to keep it. A new state gets its own currency, government and congress. An uprising met with force, or an army split by a failed coup, can become a civil war: the rebels hold regions with troops of their own; the war ends with the rebellion crushed, the rebels in power, or the country partitioned. Seceded and partitioned states can rejoin their old country when relations are good. A state whose legitimacy, order and finances all collapse becomes a failed state; a government in exile returns when its people rise against the occupier.</Help>
    </Panel>
  );
}
