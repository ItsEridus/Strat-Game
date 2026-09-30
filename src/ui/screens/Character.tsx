import type { Attr, Citizen, World } from '../../sim/types';
import { ActBtn, Bar, Panel, Stat, Help } from '../common';
import { ATTRS, powerGain, train, trainCheck } from '../../sim/citizen';
import { effEco, maxEnergy, player, today } from '../../sim/query';
import { SKILL_HOW, ageOf, reputation } from '../../sim/growth';
import { B } from '../../data/balance';
import { hitPreview, rankOf, builderRank } from '../../sim/combatMath';

/** Distinct progression tracks with next milestones (shown on dashboard and here). */
export function tracks(w: World, c: Citizen) {
  const r = rankOf(c.dmgTotal);
  const br = builderRank(c.buildTotal);
  return [
    (() => { const r = reputation(c); return { label: 'Reputation', value: `${r.icon} ${r.name}`, next: r.next ? `${Math.ceil(r.next.min - r.standing)} more standing to “${r.next.name}” (influence and fame: speak, write, lead, serve)` : 'As famous as it gets' }; })(),
    { label: 'Age', value: `${ageOf(w, c)}`, next: 'Everyone grows older; the young learn fastest' },
    { label: 'Training power', value: c.power.toFixed(1), next: `Next training: +${powerGain(w, c).toFixed(2)} (×${(1 + c.power / B.damage.powerDivisor).toFixed(2)} damage now)` },
    { label: 'Economic skill', value: effEco(w, c).toFixed(2), next: `Grows with each shift; ×${(1 + effEco(w, c) * B.company.ecoFactor).toFixed(2)} production` },
    { label: 'Military rank', value: `${r.name} (×${r.mult.toFixed(1)})`, next: r.next ? `${Math.round(r.next - c.dmgTotal).toLocaleString()} damage to ${r.nextName}` : 'Top rank' },
    { label: 'Builder rank', value: `${br.index} (+${Math.round(br.bonus * 100)}%)`, next: br.next ? `${Math.round(br.next - c.buildTotal).toLocaleString()} construction points to rank ${br.index + 1}` : 'Top rank' },
  ];
}

export function Character({ w }: { w: World }) {
  const p = player(w);
  const pv = hitPreview(w, p, null, 'a', 0);
  return (
    <div class="grid">
      <Panel title="Training grounds">
        <p>Training power multiplies your battle damage. The <b>first</b> session each simulated day raises power by 1/log₁₀(power+2)
          (wiki baseline; log base chosen). Every session also builds strength and endurance, less with each extra session in a day.</p>
        <div class="row">
          <ActBtn kind="primary" why={trainCheck(w, p, 'normal')} run={(w) => train(w, p, 'normal')}>Train (−{B.cost.train}⚡)</ActBtn>
          <ActBtn why={trainCheck(w, p, 'food')} run={(w) => train(w, p, 'food')}>Train and donate 5 Q1 food (+standing)</ActBtn>
          <ActBtn why={trainCheck(w, p, 'weapons')} run={(w) => train(w, p, 'weapons')}>Train and donate 20 Q1 weapons (+standing)</ActBtn>
        </div>
        <p class="muted small">{p.lastTrainDay === today(w) ? `Power already raised today (${p.trainsToday} session${p.trainsToday > 1 ? 's' : ''}).` : `Next power gain: +${powerGain(w, p).toFixed(3)}.`}</p>
        <label class="check"><input type="checkbox" checked={w.settings.autoTrain} onChange={() => { w.settings.autoTrain = !w.settings.autoTrain; }} /> Automatically do my first training each day (at {String(p.trainHour).padStart(2, '0')}:00 when energy allows)</label>
      </Panel>
      <Panel title="Progression tracks">
        {tracks(w, p).map((t) => <div class="track"><Stat label={t.label}>{t.value}</Stat><small class="muted">{t.next}</small></div>)}
      </Panel>
      <Panel title="Skills" class="wide">
        <Help>There are no levels. You get better at what you do: each skill grows with practice, quickly at first and more slowly as you master it, and fastest while you are young. A Study Manual (Shop) improves your weakest skill.</Help>
        <table class="table">
          <thead><tr><th>Skill</th><th>Value</th><th>Improves by</th><th>Effect</th></tr></thead>
          <tbody>
            {(Object.keys(ATTRS) as Attr[]).map((a) => (
              <tr>
                <td>{ATTRS[a].name}</td><td class="num">{p.attrs[a].toFixed(1)}</td><td class="small">{SKILL_HOW[a]}</td>
                <td class="small">{attrTotal(w, p, a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Combat preview (unarmed, neutral terrain)">
        <div class="stats">
          <Stat label="Hit damage">{Math.round(pv.dmg).toLocaleString()}</Stat>
          <Stat label="Hit chance">{pv.hit.toFixed(1)}%</Stat>
          <Stat label="Crit chance / damage">{pv.crit.toFixed(1)}% / {pv.critDmg.toFixed(0)}%</Stat>
          <Stat label="Expected per hit">{Math.round(pv.expected).toLocaleString()}</Stat>
        </div>
        <details><summary>Formula</summary><ul class="small">{pv.parts.map((x) => <li>{x}</li>)}</ul></details>
      </Panel>
      <Panel title="Military rank ladder">
        <table class="table compact"><tbody>{B.ranks.names.map((nm, i) => (
          <tr class={rankOf(p.dmgTotal).index === i ? 'me' : ''}><td>{i + 1}. {nm}</td><td class="num">{B.ranks.thresholds[i].toLocaleString()}</td><td>×{(1 + i * B.ranks.multStep).toFixed(1)}</td></tr>
        ))}</tbody></table>
        <p class="small muted">Lifetime damage {p.dmgTotal.toLocaleString()} (never lost in defeat). Early thresholds are wiki values; later ones are solo extrapolations.</p>
      </Panel>
      <Panel title="Energy">
        <Bar v={p.energy} max={maxEnergy(w, p)} color="#3fb5a8" label={`${Math.floor(p.energy)} / ${maxEnergy(w, p)}`} />
        <p class="small muted">Base {B.energy.baseMax} + Endurance {Math.floor(p.attrs.end)} + hospital in your region ({w.regions[p.loc].bld.hospital} × {B.energy.hospitalPerLevel}).</p>
      </Panel>
    </div>
  );
}

function attrTotal(w: World, p: Citizen, a: Attr): string {
  const v = p.attrs[a];
  const f = (x: number) => (Math.round(x * 10) / 10).toString();
  switch (a) {
    case 'str': return `+${f(v * B.attrs.str)} base damage`;
    case 'acc': return `+${(v * B.attrs.acc).toFixed(1)} pt hit chance`;
    case 'luck': return `+${(v * B.attrs.luckCrit).toFixed(1)} pt crit, +${(v * B.attrs.luckCritDmg).toFixed(1)} pt crit dmg`;
    case 'end': return `+${f(v * B.attrs.end)} max energy (${maxEnergy(w, p)})`;
    case 'lead': return `+${(v * B.attrs.lead).toFixed(1)}% employee production`;
    case 'eco': return `+${(v * B.attrs.eco).toFixed(1)} economic skill`;
    case 'cons': return `+${(v * B.attrs.cons).toFixed(1)}% construction`;
  }
}
