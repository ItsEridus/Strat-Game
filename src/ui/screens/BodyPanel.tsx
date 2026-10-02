// Body (2.8): weight, fitness and diet.
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Bar, Help, Select } from '../common';
import { store } from '../store';
import { fmtAmt } from '../../engine/money';
import { DIET_LABEL, bmiLabel, bmiOf, dietCost, dietOf, exercise, exerciseCheck, fitnessOf, mealPrice, setDiet, type Diet } from '../../sim/body';

export function BodyPanel({ w, p }: { w: World; p: Citizen }) {
  const code = w.nations[p.nation].cur;
  const b = bmiOf(w, p);
  const f = fitnessOf(w, p);
  return (
    <div>
      <table class="table compact small"><tbody>
        <tr><td>Weight</td><td>body-mass index {b.toFixed(1)}: {bmiLabel(b)}</td></tr>
        <tr><td>Fitness</td><td><Bar v={f} max={100} color="#3f8f6b" label={`${Math.round(f)}`} /></td></tr>
      </tbody></table>
      <div class="row small">Eating: <Select value={dietOf(w, p)} options={(Object.keys(DIET_LABEL) as Diet[]).map((d) => [d, `${DIET_LABEL[d]}${dietCost(w, p, d) ? ` (~${fmtAmt(code, dietCost(w, p, d))}/month)` : ''}`] as [Diet, string])} onChange={(d) => store.act((w) => setDiet(w, d))} /></div>
      <ActBtn small why={exerciseCheck(w, p)} run={(w) => exercise(w)}>🏃 An hour of exercise</ActBtn>
      <Help>Cooking at home is cheapest and healthiest (an hour a day); a meal out here costs about {fmtAmt(code, mealPrice(w, p))}, and fast food is quick but fattening. Exercise, active hobbies and walking or cycling to work build fitness; age and sitting still wear it down. Obesity (a body-mass index of 30 or more) raises the risk of diabetes and heart disease; fitness lifts health and eases stress. You can make exercise part of your routine.</Help>
    </div>
  );
}
