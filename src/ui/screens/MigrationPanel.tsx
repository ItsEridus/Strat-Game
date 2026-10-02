// Moving abroad (2.9): visas, residence, the road to citizenship.
import { useState } from 'preact/hooks';
import type { Citizen, Id, World } from '../../sim/types';
import { ActBtn, Help, Select } from '../common';
import { fmtAmt } from '../../engine/money';
import { fmtDate } from '../../engine/calendar';
import { VISA_LABEL, emigrate, residenceOf, visaCheck, visaFee, yearsToCitizenship, type Visa } from '../../sim/migration';

export function MigrationPanel({ w, p }: { w: World; p: Citizen }) {
  const r = residenceOf(w, p);
  const others = w.nations.filter((n) => n.id !== p.nation && !n.exile && n.dissolved == null);
  const [dest, setDest] = useState<Id>(others[0]?.id ?? 0);
  const [visa, setVisa] = useState<Visa>('work');
  const y = yearsToCitizenship(w, p);
  return (
    <div>
      {r ? <p class="small">You live in {w.nations[r.nation].name} on {VISA_LABEL[r.visa]} since {fmtDate(r.since, 'medium')}. {y == null ? 'This country almost never naturalises foreigners.' : y > 0 ? `You can apply for citizenship in about ${y.toFixed(1)} years (with a language test).` : 'You can apply for citizenship (from the region page), if you pass the language test.'}</p>
        : <p class="small muted">You live in your own country.</p>}
      <div class="row small">Move to <Select value={dest} options={others.map((n) => [n.id, n.name] as [Id, string])} onChange={setDest} /> on <Select value={visa} options={(Object.keys(VISA_LABEL) as Visa[]).map((v) => [v, VISA_LABEL[v]] as [Visa, string])} onChange={setVisa} />
        <ActBtn small why={visaCheck(w, p, dest, visa)} confirm={`Move to ${w.nations[dest]?.name}? You leave your job and home.`} run={(w) => emigrate(w, dest, visa)}>✈️ Move ({fmtAmt(w.nations[p.nation].cur, visaFee(w, dest, visa))} visa)</ActBtn></div>
      <Help>Moving abroad needs a visa. Points-based countries (Canada, Australia, Britain, Germany, Japan, Korea) and governments that close their doors want graduates or skilled workers; the United States draws lots; elsewhere an employer sponsors you. You can also join a spouse who is a citizen, study, or seek asylum from war. The first year is a strain, easier among others from home. Migrants send money home. Citizenship comes after the years of residence each country requires (from two in Argentina to eleven in India; China and Saudi Arabia almost never naturalise) and a language test.</Help>
    </div>
  );
}
