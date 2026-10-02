import type { World } from '../../sim/types';
import { ActBtn, Bar, Panel, Help } from '../common';
import { player } from '../../sim/query';
import { ENERGY_PROGRESS, ITEM_PROGRESS, STUDIES, activate, activateCheck, contribute, contributeCheck, progressOf, unlocked } from '../../sim/academy';
import { B } from '../../data/balance';
import { itemName } from '../../data/items';

export function Academy({ w }: { w: World }) {
  const p = player(w);
  return (
    <div class="grid">
      <Panel title="Academy" class="wide">
        <Help>Contribute energy (10 → +{ENERGY_PROGRESS}%) or items (+{ITEM_PROGRESS}%) to a study. At {B.studies.unlockAt}% it unlocks: passive studies apply while unlocked, active ones can be triggered with a cooldown. Progress decays {B.studies.decayPerHour}% per simulated hour (a gentle solo default — set 0 in Balance overrides to disable upkeep). Studies never lock you out of other careers.</Help>
      </Panel>
      {(['economic', 'military', 'special'] as const).map((grp) => (
        <Panel title={grp[0].toUpperCase() + grp.slice(1)}>
          {STUDIES.filter((s) => s.group === grp).map((s) => {
            const prog = progressOf(p, s.id);
            const st = p.studies[s.id];
            return (
              <div class="card">
                <b>{s.name}</b> {unlocked(p, s.id) ? <span class="good small">unlocked</span> : null} {s.active && <span class="small muted">(active)</span>}
                <p class="small">{s.effect}</p>
                <Bar v={prog} max={100} color={unlocked(p, s.id) ? '#46b873' : '#5b8def'} label={`${Math.round(prog)}%`} />
                <ActBtn small why={contributeCheck(w, p, s.id, 'energy')} showWhy={false} run={(w) => contribute(w, p, s.id, 'energy')}>Study (10⚡)</ActBtn>
                <ActBtn small why={contributeCheck(w, p, s.id, 'item')} showWhy={false} run={(w) => contribute(w, p, s.id, 'item')}>Donate {s.itemQty} {itemName(s.item)}</ActBtn>
                {s.active && <ActBtn small kind="primary" why={activateCheck(w, p, s.id)} showWhy={false} run={(w) => activate(w, p, s.id)}>Activate{st?.cooldownUntil && st.cooldownUntil > w.time ? ` (cd ${Math.ceil((st.cooldownUntil - w.time) / 60)}h)` : ''}</ActBtn>}
              </div>
            );
          })}
        </Panel>
      ))}
    </div>
  );
}
