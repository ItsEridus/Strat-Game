// The player's daily routine: what they do each day without being asked (a work
// shift, training, an evening with family, rest, a hobby, school). Each item
// runs the same validated action as the button on its screen, so a routine can
// never pay twice for one shift or do what the player could not do by hand.
import type { World } from './types';
import { hourOf } from '../engine/clock';
import { jailed, player, today } from './query';
import { routineOf } from './lifecycle';
import { applyCheck, applyJob, shiftCheck, workShift } from './company';
import { bestOffer } from '../ai/citizens';
import { notify } from '../engine/events';
import { hobbyCheck, pursueHobby } from './hobbies';
import { study, studyCheck } from './education';
import { serviceShift, serviceShiftCheck } from './services';
import { familyTime, familyTimeCheck, rest, restCheck } from './wellbeing';

/** Hourly, for the player only. */
export function routineHourly(w: World) {
  const p = player(w);
  if (!p || p.gone || jailed(w, p)) return;
  const r = routineOf(w);
  const h = hourOf(w.time);
  // Looking for work: apply to the best offer around (as anyone would), an hour before the shift.
  if (r.jobHunt && p.job == null && !p.post && h === (p.workHour + 23) % 24) { const best = bestOffer(w, p); if (best && !applyCheck(w, p, w.companies[best.id])) { const res = applyJob(w, p, best.id); if (res.ok) notify(w, 'economy', `💼 ${res.msg}`, { link: 'jobs' }); } }
  if (r.work && h === p.workHour && p.post && !serviceShiftCheck(w, p)) serviceShift(w, p);
  if (r.work && h === p.workHour && p.job != null && p.lastWorkDay !== today(w) && !shiftCheck(w, p)) workShift(w, p);
  if (r.school && h === 9 && !studyCheck(w, p)) study(w, p);
  if (r.family && h === 19 && !familyTimeCheck(w, p)) familyTime(w, p);
  if (r.hobby && h === 20 && !hobbyCheck(w, p, r.hobby)) pursueHobby(w, r.hobby, p);
  if (r.rest && h === 21 && !restCheck(w, p)) rest(w, p);
}
