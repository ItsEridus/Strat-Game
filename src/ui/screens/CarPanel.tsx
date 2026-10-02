// Your car (2.8): buying, running costs, selling.
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Help } from '../common';
import { fmtAmt } from '../../engine/money';
import { fmtDate } from '../../engine/calendar';
import { MODELS, buyCar, buyCarCheck, carPrice, carValue, crashRisk, runningCost, sellCar } from '../../sim/cars';

export function CarPanel({ w, p }: { w: World; p: Citizen }) {
  const code = w.nations[p.nation].cur;
  const car = p.car;
  return (
    <div>
      {car ? <p class="small">{MODELS.find((m) => m.tier === car.tier)?.icon} {car.model}, bought {fmtDate(car.bought, 'medium')} for {fmtAmt(code, car.price)}; worth {fmtAmt(code, carValue(w, car))} now. Running it costs about {fmtAmt(code, runningCost(w, p, car))} a month. Chance of a crash this year: about {Math.round((1 - Math.pow(1 - crashRisk(w, p), 12)) * 100)}%.</p>
        : <p class="small muted">You have no car.</p>}
      <table class="table compact small"><tbody>{MODELS.map((m) => (
        <tr><td>{m.icon} {m.name}</td><td>{fmtAmt(code, carPrice(w, p.nation, m))}</td><td><ActBtn small kind="ghost" why={buyCarCheck(w, p, m.tier)} run={(w) => buyCar(w, m.tier)}>{car ? 'Trade in for this' : 'Buy'}</ActBtn></td></tr>
      ))}</tbody></table>
      {car && <ActBtn small kind="ghost" confirm={`Sell your car for about ${fmtAmt(code, carValue(w, car))}?`} run={(w) => sellCar(w)}>Sell your car</ActBtn>}
      <Help>Cars cost more where import duties are high (Brazil, Argentina, Turkey) and less where they are made cheaply (India, China), and lose about 15% of their value a year. Each month you pay for fuel (with the world oil price) or charging (much cheaper per kilometre), insurance and upkeep; more if you drive far to work. The risk of a crash follows your country's roads (about 3 deaths per 100,000 people a year in Britain, Germany and Japan; 13 in the United States; over 20 in South Africa) and you: being young, drinking and short nights all raise it.</Help>
    </div>
  );
}
