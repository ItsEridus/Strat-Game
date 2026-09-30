// The Library turns the append-only event log into readable monthly chapters
// using local templates (no external services), highlighting the player's role.
import type { World, WorldEvent } from './types';
import { DAY } from '../engine/clock';
import { monthOf } from '../engine/clock';
import { player } from './query';

function count(evs: WorldEvent[], type: string, re?: RegExp) {
  return evs.filter((e) => e.type === type && (!re || re.test(e.text))).length;
}

/** Build a chapter from events in [from, to). */
export function composeChapter(w: World, from: number, to: number, title: string) {
  const evs = w.log.filter((e) => e.t >= from && e.t < to);
  const p = player(w);
  const text: string[] = [];
  const wars = evs.filter((e) => e.type === 'war' && /declared war/.test(e.text));
  const settled = evs.filter((e) => e.type === 'war' && /ended by/.test(e.text));
  const occ = count(evs, 'war', /occupied/), lib = count(evs, 'war', /liberated/);
  const pres = evs.filter((e) => e.type === 'election' && /President/.test(e.text));
  const laws = count(evs, 'law', /passed/), rejected = count(evs, 'law', /rejected/);
  const built = evs.filter((e) => e.type === 'construction' && /completed/.test(e.text));
  const companies = count(evs, 'company', /founded/);
  if (wars.length || settled.length) {
    text.push(`War shaped these days. ${wars.map((e) => e.text.replace(/^\W+/, '')).join(' ')} ${occ ? `Armies occupied ${occ} region${occ > 1 ? 's' : ''}` : ''}${lib ? ` and ${lib} were liberated` : ''}${occ || lib ? '.' : ''} ${settled.map((e) => e.text.replace(/^\W+/, '')).join(' ')}`.trim());
  } else text.push('The Reach knew peace; no new wars were declared.');
  if (pres.length) text.push(`At the ballot box: ${pres.map((e) => e.text.replace(/^\W+/, '')).join(' ')}`);
  if (laws || rejected) text.push(`Congresses across the continent passed ${laws} law${laws === 1 ? '' : 's'} and rejected ${rejected}.`);
  if (built.length) text.push(`Builders finished ${built.length} project${built.length > 1 ? 's' : ''}, among them: ${built.slice(0, 3).map((e) => e.text.replace(/^\W+/, '').split(' (')[0]).join('; ')}.`);
  if (companies) text.push(`${companies} new compan${companies > 1 ? 'ies were' : 'y was'} founded as entrepreneurs chased demand.`);
  const mine = evs.filter((e) => e.player);
  if (mine.length) text.push(`${p.name}'s part: ${mine.slice(-6).map((e) => e.text.replace(/^\W+/, '')).join(' ')}`);
  const headline = wars[0]?.text ?? pres[0]?.text ?? built[0]?.text ?? 'A quiet season';
  return { title: `${title}: ${headline.replace(/^\W+/, '').slice(0, 70)}`, from, to, text };
}

/** Daily: close the previous month into a chapter. */
export function libraryDaily(w: World) {
  const today = monthOf(w, w.time);
  const yesterday = monthOf(w, w.time - DAY);
  if (today.month === yesterday.month) return;
  const len = w.settings.monthLen;
  const from = ((yesterday.month - 1) * len + 1) * DAY;
  w.chapters.push(composeChapter(w, from, w.time, `Month ${yesterday.month}`));
}

/** Export the whole chronicle as Markdown. */
export function exportHistory(w: World): string {
  const p = player(w);
  const parts = [`# A Chronicle of Our Times`, `_As lived by ${p.name}, citizen of ${w.nations[p.nation].name}. Seed ${w.seed}._`, ''];
  const chapters = [...w.chapters, composeChapter(w, w.chapters.length ? w.chapters[w.chapters.length - 1].to : 0, w.time + 1, 'The present')];
  for (const c of chapters) { parts.push(`## ${c.title}`, '', ...c.text.map((t) => t + '\n')); }
  parts.push('## Timeline of notable events', '');
  for (const e of w.log.filter((x) => x.important || x.player)) parts.push(`- Day ${Math.floor(e.t / DAY)}: ${e.text}`);
  return parts.join('\n');
}
