import type { Attr, Citizen, World } from '../../sim/types';
import { ActBtn, Bar, Panel, Stat, Help } from '../common';
import { ATTRS, allocAttr, powerGain, respec, train, trainCheck } from '../../sim/citizen';
import { effEco, maxEnergy, player, today, xpToNext } from '../../sim/query';
import { B } from '../../data/balance';
import { hitPreview, rankOf, builderRank } from '../../sim/combatMath';

/** Distinct progression tracks with next milestones (shown on dashboard and here). */
export function tracks(w: World, c: Citizen) {
  const r = rankOf(c.dmgTotal);
  const br = builderRank(c.buildTotal);
  return [
    { label: 'Level', value: `${c.level}`, next: `${xpToNext(c.level) - c.xp} XP to level ${c.level + 1} (+${B.levels.attrPerLevel} attribute points)` },
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
          (wiki baseline; log base chosen); extra sessions still give XP. Strength (an attribute) is separate: it adds flat damage before the power multiplier.</p>
        <div class="row">
          <ActBtn kind="primary" why={trainCheck(w, p, 'normal')} run={(w) => train(w, p, 'normal')}>Train (−{B.cost.train}⚡, {B.xp.train} XP)</ActBtn>
          <ActBtn why={trainCheck(w, p, 'food')} run={(w) => train(w, p, 'food')}>Donate 5 Q1 food ({B.xp.trainDonate} XP)</ActBtn>
          <ActBtn why={trainCheck(w, p, 'weapons')} run={(w) => train(w, p, 'weapons')}>Donate 20 Q1 weapons ({B.xp.trainDonate} XP)</ActBtn>
        </div>
        <p class="muted small">{p.lastTrainDay === today(w) ? `Power already raised today (${p.trainsToday} session${p.trainsToday > 1 ? 's' : ''}).` : `Next power gain: +${powerGain(w, p).toFixed(3)}.`}</p>
        <label class="check"><input type="checkbox" checked={w.settings.autoTrain} onChange={() => { w.settings.autoTrain = !w.settings.autoTrain; }} /> Automatically do my first training each day (at {String(p.trainHour).padStart(2, '0')}:00 when energy allows)</label>
      </Panel>
      <Panel title="Progression tracks">
        {tracks(w, p).map((t) => <div class="track"><Stat label={t.label}>{t.value}</Stat><small class="muted">{t.next}</small></div>)}
      </Panel>
      <Panel title={`Attributes — ${p.attrPts} unspent`} class="wide" right={<ActBtn small why={(p.inv['sp:manual'] ?? 0) < 1 ? 'Needs a Retraining Manual (Shop).' : null} run={(w) => respec(w, p)} confirm="Reset all attribute points?">Respec</ActBtn>}>
        <Help>Three points per level through level 50 (documented). No per-attribute limit. Percentage-point (pt) effects add to a percentage; % effects multiply.</Help>
        <table class="table">
          <thead><tr><th>Attribute</th><th>Points</th><th>Effect per point</th><th>Your total</th><th /></tr></thead>
          <tbody>
            {(Object.keys(ATTRS) as Attr[]).map((a) => (
              <tr>
                <td>{ATTRS[a].name}</td><td>{p.attrs[a]}</td><td class="small">{ATTRS[a].effect}</td>
                <td class="small">{attrTotal(w, p, a)}</td>
                <td>
                  <ActBtn small why={p.attrPts < 1 ? 'No unspent points.' : null} showWhy={false} run={(w) => allocAttr(w, p, a, 1)}>+1</ActBtn>
                  <ActBtn small why={p.attrPts < 5 ? 'Fewer than 5 points.' : null} showWhy={false} run={(w) => allocAttr(w, p, a, 5)}>+5</ActBtn>
                </td>
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
        <p class="small muted">Base {B.energy.baseMax} + Endurance {p.attrs.end} + hospital in your region ({w.regions[p.loc].bld.hospital} × {B.energy.hospitalPerLevel}).</p>
      </Panel>
    </div>
  );
}

function attrTotal(w: World, p: Citizen, a: Attr): string {
  const v = p.attrs[a];
  switch (a) {
    case 'str': return `+${v * B.attrs.str} base damage`;
    case 'acc': return `+${(v * B.attrs.acc).toFixed(1)} pt hit chance`;
    case 'luck': return `+${(v * B.attrs.luckCrit).toFixed(1)} pt crit, +${(v * B.attrs.luckCritDmg).toFixed(1)} pt crit dmg`;
    case 'end': return `+${v * B.attrs.end} max energy (${maxEnergy(w, p)})`;
    case 'lead': return `+${(v * B.attrs.lead).toFixed(1)}% employee production`;
    case 'eco': return `+${(v * B.attrs.eco).toFixed(1)} economic skill`;
    case 'cons': return `+${(v * B.attrs.cons).toFixed(1)}% construction`;
  }
}
