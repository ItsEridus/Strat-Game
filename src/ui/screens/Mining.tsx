import type { World } from '../../sim/types';
import { ActBtn, Btn, Panel, RegionLink, Help } from '../common';
import { store } from '../store';
import { player } from '../../sim/query';
import { cancelMining, mineCheck, miningPreview, startMining } from '../../sim/mining';
import { distance } from '../../sim/travel';
import { fmtDur } from '../../engine/clock';
import { B } from '../../data/balance';

export function Mining({ w }: { w: World }) {
  const p = player(w);
  const d = distance(w, p.loc, p.mineSite);
  return (
    <div class="grid">
      <Panel title="Gold mining" class="wide">
        <Help>You are assigned a mining site. Shifts of 1 or 2 simulated hours yield gold (wiki: {B.mining.yields[1]} / {B.mining.yields[2]}), scaled by mining equipment, skill and studies. While mining you cannot travel, fight, trade on markets or donate — but you can work and train. After each shift you get a new site. Leaving early forfeits the shift.</Help>
        <p>Assigned site: <RegionLink w={w} id={p.mineSite} /> {d === 0 ? '(you are here)' : `(${d} region${d > 1 ? 's' : ''} away — travel from the map)`}</p>
        {p.mining ? (
          <>
            <p>⛏️ Mining in {w.regions[p.mining.region].name}: finishes in <b>{fmtDur(p.mining.end - w.time)}</b>.</p>
            <Btn kind="primary" onClick={() => store.jumpTo(p.mining!.end)}>⏭ Finish shift (advance time)</Btn>
            <ActBtn kind="danger" confirm="Abandon the shift? No gold will be paid." run={(w) => cancelMining(w, p)}>Abandon</ActBtn>
          </>
        ) : (
          ([1, 2] as const).map((h) => {
            const pv = miningPreview(w, p, h);
            return (
              <div class="card">
                <b>{h}-hour shift → {pv.total.toFixed(3)} gold</b>
                <p class="small">Base {pv.base} × equipment {pv.equip.toFixed(2)} × skill {pv.skill.toFixed(2)} × studies {pv.study.toFixed(2)} × world multiplier {pv.mult}</p>
                <ActBtn kind="primary" why={mineCheck(w, p)} run={(w) => startMining(w, p, h)}>Start ({B.cost.mineStart}⚡)</ActBtn>
              </div>
            );
          })
        )}
        {d > 0 && <Btn onClick={() => store.go('map', { region: p.mineSite })}>Show site on map</Btn>}
      </Panel>
    </div>
  );
}
