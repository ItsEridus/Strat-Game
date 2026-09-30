// Wires every subsystem's hooks into the simulation loop, once, in a fixed order.
import { dailyHooks, hourlyHooks, tickHooks, HANDLERS } from './hooks';

let done = false;
export function registerSystems() {
  if (done) return;
  done = true;
  // Later stages register here. Keep the order stable: it is part of determinism.
  void dailyHooks; void hourlyHooks; void tickHooks; void HANDLERS;
}
