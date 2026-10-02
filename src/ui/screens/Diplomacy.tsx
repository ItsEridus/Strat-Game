// Diplomacy: how a country sees every other (and why), its blocs and alliances, and
// the outlook of its head of government.
import { useState } from 'preact/hooks';
import type { Id, World } from '../../sim/types';
import { ActBtn, Bar, CitLink, Help, NationChip, Panel, Select } from '../common';
import { player } from '../../sim/query';
import { activeWars } from '../../sim/war';
import { TREATY_INFO, activeTreaties, allTreaties, willingness, type Treaty, type TreatyKind } from '../../sim/treaties';
import { DIP_INFO, DEMAND_NAME, dipCheck, dipOf, doDiplomacy, loansOf, type DipAction, type Demand } from '../../sim/diplomacyActions';
import { GOLD, fmtAmt } from '../../engine/money';
import { RES_INFO, castCheck, castVote, councilMembers, intlOf, permanentIds, tableCheck, tableResolution, voters, type ResKind } from '../../sim/intlOrgs';
import { fail, ok } from '../../engine/result';
import { CRISIS_INFO, LEVELS, MOVE_INFO, activeCrises, chooseMove, resolve, type Move } from '../../sim/crises';
import { racesOf } from '../../sim/balanceOfPower';
import { DAY, fmtWhen } from '../../engine/clock';
import { BLOCS } from '../../data/diplomacy';
import { blocsOf, leaderProfile, prestigeOf, tiesOfPair } from '../../sim/relations';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Diplomacy({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const rows = Object.entries(n.relations).map(([k, r]) => ({ id: Number(k), r })).filter(({ id: o }) => w.nations[o]).sort((a, b) => b.r.score - a.r.score);
  const lp = leaderProfile(w, n);
  return (
    <>
      <Panel title="Diplomatic relations" class="wide">
        <div class="scroll-x"><table class="table compact small">
          <thead><tr><th>Nation</th><th>Relation</th><th>Trust</th><th>Affinity</th><th>Threat</th><th>Trade ties</th><th>Grievances</th><th>Status</th><th>Recent</th></tr></thead>
          <tbody>{rows.map(({ id: o, r }) => {
            const t = tiesOfPair(w, n, w.nations[o]);
            const status = [n.alliances.includes(o) ? 'allied' : null, n.embargoes.includes(o) ? 'embargo' : null, (n.pacts[o] ?? 0) > w.time ? `pact until ${fmtWhen(w, n.pacts[o])}` : null,
              Object.values(w.wars).some((x) => x.status === 'active' && ((x.att === id && x.def === o) || (x.att === o && x.def === id))) ? 'AT WAR' : null].filter(Boolean).join(', ');
            return (
              <tr><td><NationChip w={w} id={o} /></td>
                <td class={r.score > 20 ? 'good' : r.score < -20 ? 'bad' : ''}><b>{Math.round(r.score)}</b></td>
                <td class={t.trust > 20 ? 'good' : t.trust < -20 ? 'bad' : ''}>{Math.round(t.trust)}</td>
                <td>{t.affinity}</td>
                <td class={t.threat > 40 ? 'bad' : t.threat > 20 ? 'warn' : ''}>{t.threat}</td>
                <td>{Math.round(t.interdep)}</td>
                <td class={t.grievance > 30 ? 'bad' : ''}>{Math.round(t.grievance)}</td>
                <td>{status || '—'}</td>
                <td class="small muted">{r.hist.slice(0, 2).map((h) => `${h.delta > 0 ? '+' : ''}${h.delta} ${h.why}`).join('; ')}</td></tr>
            );
          })}</tbody>
        </table></div>
        <Help>A relation is built from trust (what each side has done to the other, remembered and slowly fading), affinity (similar governments, a shared language and blocs), threat (the other side's military power, its closeness and its intentions), trade ties, and grievances (territorial disputes and historical wrongs; lost wars add new ones). The score moves towards that blend day by day.</Help>
      </Panel>
      {player(w).nation === id && n.president === player(w).id && <Actions w={w} id={id} />}
      <Crises w={w} id={id} />
      <Treaties w={w} id={id} />
      <Organisations w={w} id={id} />
      <Panel title="Blocs and alliances">
        <table class="table compact small"><tbody>{blocsOf(n).map((b) => (
          <tr><td><b>{b.name}</b><br /><small class="muted">{b.desc}</small></td><td>{b.members.map((iso) => w.nations.find((x) => x.iso === iso)).filter(Boolean).map((x) => <NationChip w={w} id={x!.id} />)}</td></tr>
        ))}</tbody></table>
        {!blocsOf(n).length && <p class="small muted">{n.name} belongs to none of the main blocs ({BLOCS.map((b) => b.name).join(', ')}).</p>}
        <p class="small">Standing in the world: <b>{prestigeOf(w, n)}</b> / 100</p>
      </Panel>
      <Panel title="The head of government's outlook">
        <p class="small">{n.leader}: {n.president != null ? <CitLink w={w} id={n.president} /> : 'vacant'}</p>
        <table class="table compact small"><tbody>
          <tr><td>Hawk or dove</td><td><Bar v={lp.hawk * 100} max={100} color="#e0574f" label={lp.hawk > 0.6 ? `hawk (${pct(lp.hawk)})` : lp.hawk < 0.4 ? `dove (${pct(lp.hawk)})` : `centrist (${pct(lp.hawk)})`} /></td></tr>
          <tr><td>Appetite for risk</td><td><Bar v={lp.risk * 100} max={100} color="#e39b3a" label={pct(lp.risk)} /></td></tr>
          <tr><td>Ideologue or pragmatist</td><td><Bar v={lp.ideologue * 100} max={100} color="#9b6bd6" label={lp.ideologue > 0.6 ? 'ideologue' : 'pragmatist'} /></td></tr>
          <tr><td>Nationalism</td><td><Bar v={lp.nationalism * 100} max={100} color="#5b8def" label={pct(lp.nationalism)} /></td></tr>
        </tbody></table>
        <Help>The leader's character colours foreign policy: hawks see more threat and are readier to use force; doves trust more. A change of leader can change a country's course.</Help>
      </Panel>
    </>
  );
}

const treatyStatus = (w: World, t: Treaty) =>
  t.status === 'active' ? (t.until != null ? `until ${fmtWhen(w, t.until)}` : 'open-ended') : `${t.status} ${t.ended != null ? fmtWhen(w, t.ended) : ''}${t.why ? ` (${t.why})` : ''}`;

function Treaties({ w, id }: { w: World; id: Id }) {
  const [old, setOld] = useState(false);
  const list = allTreaties(w).filter((t) => t.parties.includes(id) && (old || t.status === 'active')).sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.kind.localeCompare(b.kind) || b.signed - a.signed);
  const loans = loansOf(w, id);
  return (
    <Panel title="Treaties" class="wide" right={<label class="small"><input type="checkbox" checked={old} onChange={() => setOld(!old)} /> show ended</label>}>
      <div class="scroll-x"><table class="table compact small">
        <thead><tr><th>Treaty</th><th>Kind</th><th>Parties</th><th>Signed</th><th>Status</th><th>Record</th></tr></thead>
        <tbody>{list.map((t) => (
          <tr class={t.status !== 'active' ? 'muted' : ''}><td><b>{t.name}</b></td><td title={TREATY_INFO[t.kind].effect}>{TREATY_INFO[t.kind].icon} {TREATY_INFO[t.kind].name}</td>
            <td>{t.parties.filter((p) => p !== id).map((p) => <NationChip w={w} id={p} />)}</td>
            <td>{t.signed < 0 ? 'before 2025' : fmtWhen(w, t.signed)}</td><td>{treatyStatus(w, t)}</td>
            <td>{t.honoured || t.failed ? `kept ${t.honoured}, failed ${t.failed}` : '—'}</td></tr>
        ))}</tbody>
      </table></div>
      {!list.length && <p class="small muted">No treaties.</p>}
      {loans.length > 0 && <p class="small">Loans between governments: {loans.map((l) => `${w.nations[l.from].name} → ${w.nations[l.to].name}: ${fmtAmt(GOLD, l.left)} still owed`).join('; ')}</p>}
      <Help>Treaties are real agreements with terms and an end date. {Object.values(TREATY_INFO).map((i) => `${i.icon} ${i.name}: ${i.effect}`).join(' ')} Treaties run out and are renewed only if every party still wants them.</Help>
    </Panel>
  );
}

const ACTIONS: DipAction[] = ['praise', 'condemn', 'summit', 'aid', 'loan', 'sanction', 'liftSanctions', 'expel', 'treaty', 'renounce', 'ultimatum', 'mediate', 'arm'];

function Actions({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const others = w.nations.filter((x) => x.id !== id && !x.exile);
  const [target, setTarget] = useState<Id>(others[0]?.id ?? 0);
  const [kind, setKind] = useState<TreatyKind>('trade');
  const [demand, setDemand] = useState<Demand>('liftSanctions');
  const t = w.nations[target];
  const d = dipOf(n);
  const mine = activeTreaties(w, id).filter((x) => x.parties.includes(target));
  const wars = activeWars(w).filter((x) => x.att !== id && x.def !== id);
  const params = (a: DipAction) => ({ target, kind, demand, treaty: mine[0]?.id, war: wars[0]?.id, other: t?.alliances[0] });
  const v = t ? willingness(w, t, n, kind) : null;
  return (
    <Panel title="🌐 Conduct foreign policy" class="wide">
      <p class="small">Diplomatic capital: <b>{Math.floor(d.capital)}</b> / 100 (it builds up daily, faster for a country with standing).</p>
      <div class="row">
        <span>Towards</span><Select value={target} options={others.map((x) => [x.id, x.name] as [Id, string])} onChange={setTarget} />
        <span>Treaty</span><Select value={kind} options={(Object.keys(TREATY_INFO) as TreatyKind[]).map((k) => [k, TREATY_INFO[k].name] as [TreatyKind, string])} onChange={setKind} />
        <span>Demand</span><Select value={demand} options={(Object.keys(DEMAND_NAME) as Demand[]).map((k) => [k, DEMAND_NAME[k]] as [Demand, string])} onChange={setDemand} />
      </div>
      {v && <p class="small muted">{t.name}'s appetite for a {TREATY_INFO[kind].name.toLowerCase()}: {Math.round(v.p * 100)}% ({v.why}).</p>}
      <table class="table compact small"><tbody>{ACTIONS.map((a) => (
        <tr><td><b>{DIP_INFO[a].name}</b><br /><small class="muted">{DIP_INFO[a].desc}{a === 'renounce' && mine[0] ? ` (${mine[0].name})` : ''}{a === 'mediate' && wars[0] ? ` (${w.nations[wars[0].att].name} against ${w.nations[wars[0].def].name})` : ''}</small></td>
          <td class="small">{DIP_INFO[a].capital} capital</td>
          <td><ActBtn small why={dipCheck(w, n, a, params(a))} run={(w) => doDiplomacy(w, w.nations[id], a, params(a))}>Do it</ActBtn></td></tr>
      ))}</tbody></table>
      <Help>As head of government you conduct the country's foreign policy. Other governments decide on the merits: their trust in you, their fears, their leader's outlook and how they see your power and your allies.</Help>
    </Panel>
  );
}

const VOTE_NAME = { y: 'for', n: 'against', a: 'abstained' } as const;

function Organisations({ w, id }: { w: World; id: Id }) {
  const st = intlOf(w);
  const n = w.nations[id];
  const pl = player(w);
  const head = pl.nation === id && n.president === pl.id;
  const perm = permanentIds(w);
  const council = councilMembers(w);
  const open = st.resolutions.filter((r) => r.status === 'open');
  const recent = st.resolutions.filter((r) => r.status !== 'open').slice(-8).reverse();
  const [kind, setKind] = useState<ResKind>('condemn');
  const aggressors = Object.values(w.wars).filter((x) => x.status === 'active' || x.declared > w.time - 30 * DAY).map((x) => x.att).filter((x, i, a) => a.indexOf(x) === i && x !== id);
  const [target, setTarget] = useState<Id>(aggressors[0] ?? -1);
  const disputes = st.disputes.filter((d) => d.complainant === id || d.respondent === id).slice(-6).reverse();
  const imf = st.imf.filter((p) => p.nation === id);
  return (
    <Panel title="🇺🇳 International organisations" class="wide">
      <p class="small"><b>UN Security Council:</b> permanent members (with a veto) {perm.map((p) => <NationChip w={w} id={p} />)}; elected {st.seats.map((s) => <span><NationChip w={w} id={s.nation} /> <small class="muted">until {fmtWhen(w, s.until)}</small> </span>)}.
        {council.includes(id) ? ` ${n.name} sits on the Council.` : ''}</p>
      {open.length > 0 && <>
        <h4>Before the UN now</h4>
        <table class="table compact small"><tbody>{open.map((r) => (
          <tr><td>{r.body === 'sc' ? 'Security Council' : 'General Assembly'}: <b>{RES_INFO[r.kind].name}</b> — <NationChip w={w} id={r.target} /> <small class="muted">(tabled by {w.nations[r.sponsor].name}; vote {fmtWhen(w, r.closes)})</small></td>
            <td>{head && voters(w, r).includes(id) && (r.votes[id] && r.sponsor !== id ? `you voted ${VOTE_NAME[r.votes[id]]}` : (['y', 'n', 'a'] as const).map((v) => (
              <ActBtn small why={castCheck(w, n, r)} run={(w) => { castVote(w, w.nations[id], w.intl!.resolutions.find((x) => x.id === r.id)!, v); return ok(`${n.name} will vote ${VOTE_NAME[v]}.`); }}>{v === 'y' ? 'For' : v === 'n' ? (r.body === 'sc' && perm.includes(id) ? 'Against (veto)' : 'Against') : 'Abstain'}</ActBtn>)))}</td></tr>
        ))}</tbody></table>
      </>}
      {head && aggressors.length > 0 && (
        <div class="row">
          <span>Table a resolution:</span>
          <Select value={kind} options={(Object.keys(RES_INFO) as ResKind[]).map((k) => [k, RES_INFO[k].name] as [ResKind, string])} onChange={setKind} />
          <Select value={target} options={aggressors.map((x) => [x, w.nations[x].name] as [Id, string])} onChange={setTarget} />
          <ActBtn small why={tableCheck(w, n, 'sc', kind, target)} run={(w) => (tableResolution(w, w.nations[id], 'sc', kind, target) ? ok('Tabled at the Security Council.') : fail('Could not table it.'))}>at the Security Council</ActBtn>
          <ActBtn small why={tableCheck(w, n, 'ga', kind, target)} run={(w) => (tableResolution(w, w.nations[id], 'ga', kind, target) ? ok('Tabled at the General Assembly.') : fail('Could not table it.'))}>at the General Assembly</ActBtn>
        </div>
      )}
      {recent.length > 0 && <>
        <h4>Recent votes</h4>
        <ul class="small">{recent.map((r) => <li>{fmtWhen(w, r.closes)}: {r.result} {r.votes[id] ? <span class="muted">({n.name} voted {VOTE_NAME[r.votes[id]]}.)</span> : null}</li>)}</ul>
      </>}
      {st.g20.length > 0 && <p class="small"><b>G20:</b> {st.g20[st.g20.length - 1].text}</p>}
      {disputes.length > 0 && <>
        <h4>Trade disputes at the WTO</h4>
        <ul class="small">{disputes.map((d) => <li>{w.nations[d.complainant].name} against {w.nations[d.respondent].name} (filed {fmtWhen(w, d.filed)}): {({ open: `ruling due ${fmtWhen(w, d.ruling)}`, won: 'ruled for the complainant; the sanctions must go', lost: 'complaint rejected', security: 'national-security defence accepted', complied: 'resolved', retaliation: 'ruling ignored; retaliation authorised' } as const)[d.status]}</li>)}</ul>
      </>}
      {imf.length > 0 && <p class="small"><b>IMF:</b> {imf.map((p) => `a programme of ${fmtAmt(GOLD, p.amount)} from ${fmtWhen(w, p.start)} until ${fmtWhen(w, p.until)}`).join('; ')}. Austerity is unpopular, but the markets lend more cheaply.</p>}
      <Help>The United Nations votes on wars of aggression: the Security Council (where the US, China, Russia and Britain hold vetoes) can condemn, demand a ceasefire or impose binding sanctions for a year; when it is blocked, the General Assembly can still condemn. Countries vote on their interests and their friendships. The G20 meets every November. The WTO hears complaints against sanctions the UN never authorised, and the IMF lends to countries whose reserves or credit run out.</Help>
    </Panel>
  );
}

function Crises({ w, id }: { w: World; id: Id }) {
  const n = w.nations[id];
  const pl = player(w);
  const head = pl.nation === id && n.president === pl.id;
  const live = activeCrises(w, id);
  const past = (w.standoffs ?? []).filter((c) => c.status !== 'active' && (c.a === id || c.b === id)).slice(-6).reverse();
  const races = racesOf(w, id);
  const bop = w.bop?.[w.bop.length - 1];
  const outcome = (c: NonNullable<World['standoffs']>[number]) => c.status === 'won' ? `${w.nations[c.winner!].name} prevailed` : c.status === 'settled' ? 'settled' : c.status === 'war' ? 'war' : 'faded';
  return (
    <Panel title="⚠️ Crises and the balance of power" class="wide">
      {live.map((c) => {
        const them = c.a === id ? c.b : c.a;
        return (
          <div class="card">
            <p><b>{CRISIS_INFO[c.kind].name} with <NationChip w={w} id={them} /></b>: now at {LEVELS[c.level]} (step {c.level} of 5). Next move {fmtWhen(w, c.next)}.</p>
            <p class="small muted">Your resolve: {Math.round(resolve(w, c, id) * 100)}%. Theirs, as far as can be judged: {Math.round(resolve(w, c, them) * 100)}%. Both offering talks settles it; whoever backs down loses face; escalating past the brink means war.</p>
            {head && <div class="row">{(Object.keys(MOVE_INFO) as Move[]).map((m) => (
              <ActBtn small kind={c.choice?.[id] === m ? 'primary' : undefined} run={(w) => { chooseMove(w, w.standoffs!.find((x) => x.id === c.id)!, id, m); return ok(`Next move: ${MOVE_INFO[m].toLowerCase()}.`); }}>{MOVE_INFO[m]}</ActBtn>
            ))}{c.choice?.[id] ? <span class="small">chosen: {MOVE_INFO[c.choice[id]]}</span> : <span class="small muted">(you hold firm unless you choose)</span>}</div>}
          </div>
        );
      })}
      {!live.length && <p class="small muted">{n.name} is in no crisis now.</p>}
      {past.length > 0 && <ul class="small">{past.map((c) => <li>{fmtWhen(w, c.started)}: {CRISIS_INFO[c.kind].name.toLowerCase()} with {w.nations[c.a === id ? c.b : c.a].name}, up to {LEVELS[c.level]} — {outcome(c)}</li>)}</ul>}
      {races.length > 0 && <p class="small">🚀 In an arms race with {races.map((r) => w.nations[r.a === id ? r.b : r.a].name).join(' and ')} since {fmtWhen(w, races[0].since)}: the government is building up its forces{races.some((r) => r.nuclear) ? ', and without arms control both nuclear arsenals grow' : ''}.</p>}
      {n.alignment && <p class="small">{n.alignment.choice === 'balance' ? `🛡️ Facing a far stronger ${w.nations[n.alignment.towards].name}, ${n.name} is looking for partners.` : `🤝 Too weak to resist ${w.nations[n.alignment.towards].name}, ${n.name} is seeking an accommodation with it.`}</p>}
      {bop && <p class="small"><b>The world is {bop.polarity}.</b> Shares of world power: {bop.shares.map((s) => `${w.nations[s.id].name} ${Math.round(s.share * 100)}%`).join(', ')}.</p>}
      <Help>Crises happen between hostile neighbours and rivals: border clashes, naval standoffs, airspace violations, detained citizens and missile tests. Each side's resolve depends on its leader, the balance of power (allies included), what is at stake and, for an unpopular government, the pull of a rally round the flag. Between nuclear powers, fear of escalation weighs heavily. Rivals who fear each other fall into arms races. Sanctions cost both sides growth (the target more), in proportion to the trade between them.</Help>
    </Panel>
  );
}
