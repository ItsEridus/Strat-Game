// Home life (2.8): furnishing, improvements, bills, appliances and the housework.
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Help, Select } from '../common';
import { store } from '../store';
import { fmtAmt } from '../../engine/money';
import {
  APPLIANCES, FURNISH, IMPROVE, applianceCheck, applianceCost, billsOf, buyAppliance, choresOf, cleanerCost, furnish, furnishCheck, furnishCost,
  homeUplift, householdOf, improveCheck, improveCost, improveHome, setCleaner, setSplit, type Appliance, type Improvement,
} from '../../sim/homeLife';

export function HomeLifePanel({ w, p }: { w: World; p: Citizen }) {
  const code = w.nations[p.nation].cur;
  const h = householdOf(p);
  const ch = choresOf(w, p);
  const married = p.family?.status === 'married';
  return (
    <div>
      <p class="small">🛋️ {FURNISH[h.furnish]}. Bills about {fmtAmt(code, billsOf(w, p))} a month. Housework: {ch.total.toFixed(0)} hours a week{married ? `, of which you do ${ch.mine.toFixed(0)}` : ''}.{homeUplift(p) > 1 ? ` Improvements add ${Math.round((homeUplift(p) - 1) * 100)}% to your home's value.` : ''}</p>
      <div class="row">{[2, 3].filter((t) => t > h.furnish).map((t) => <ActBtn small kind="ghost" why={furnishCheck(w, p, t)} run={(w) => furnish(w, t)}>Furnish: {FURNISH[t]} ({fmtAmt(code, furnishCost(w, p, t))})</ActBtn>)}</div>
      {p.dwelling?.kind === 'own' && <div class="row">{(Object.keys(IMPROVE) as Improvement[]).filter((k) => !(p.dwelling!.improved ?? []).includes(k)).map((k) => <ActBtn small kind="ghost" why={improveCheck(w, p, k)} run={(w) => improveHome(w, k)}>{IMPROVE[k].icon} {IMPROVE[k].label} ({fmtAmt(code, improveCost(w, p, k))})</ActBtn>)}</div>}
      <div class="row">{(Object.keys(APPLIANCES) as Appliance[]).filter((a) => !h.appliances.includes(a)).map((a) => <ActBtn small kind="ghost" why={applianceCheck(w, p, a)} run={(w) => buyAppliance(w, a)}>{APPLIANCES[a].icon} {APPLIANCES[a].label} ({fmtAmt(code, applianceCost(w, p, a))})</ActBtn>)}</div>
      <div class="row small">
        {married && <>Housework: <Select value={h.split ?? 'custom'} options={[['custom', 'as couples here usually do'], ['fair', 'shared equally'], ['mine', 'mostly me'], ['theirs', 'mostly my partner']] as [string, string][]} onChange={(v) => store.act((w) => setSplit(w, v === 'custom' ? undefined : (v as 'fair')))} /></>}
        <label class="check"><input type="checkbox" checked={!!h.cleaner} onChange={() => store.act((w) => setCleaner(w, !h.cleaner))} /> A cleaner (~{fmtAmt(code, cleanerCost(w, p))}/month)</label>
      </div>
      <Help>A comfortable home is a happier one. Owners can improve their home: a new kitchen or bathroom, insulation and solar panels (which cut the bills), an extension; improvements raise what it sells for. Bills follow your home's size and your country's energy price. Appliances save hours of housework. Couples share the housework as couples in their country usually do (women still do most of it almost everywhere) unless they agree otherwise; a partner who does far more than their share grows resentful.</Help>
    </div>
  );
}
