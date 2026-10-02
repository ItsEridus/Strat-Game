// Briefings before decisions (3.0.4 Diplomacy completed): what the foreign ministry and the
// intelligence service tell the government about another country before it acts. Everything
// in it is what the government believes (beliefs.ts), not the truth, and a better foreign
// minister and diplomatic service add more of what the other side wants and will accept.
import type { Nation, World } from './types';
import { believed, believedPower, estimateOf } from './beliefs';
import { tiesOfPair } from './relations';
import { militaryPower } from './war';
import { TREATY_INFO, activeTreaties, willingness, type TreatyKind } from './treaties';
import { nationalStaffing } from './services';
import { ministerSkill } from './diplomacyActions';
import { hedging, patronOf } from './spheres';
import { leak, tariffOn } from './tradePolicy';

export interface Briefing { quality: number; lines: { head: string; text: string }[] }

export function briefing(w: World, n: Nation, t: Nation): Briefing {
  const e = estimateOf(w, n, t);
  const ties = tiesOfPair(w, n, t);
  const skill = ministerSkill(w, n), staff = nationalStaffing(w, n.id, 'diplomacy');
  const quality = Math.min(1, e.quality * 0.5 + skill * 0.25 + staff * 0.25);
  const lines: Briefing['lines'] = [];
  const ratio = believedPower(w, n.id, t.id) / Math.max(1, militaryPower(w, n.id));
  const hostile = believed(w, n, t, 'hostile');
  lines.push({ head: 'Strength', text: ratio > 1.5 ? `Their forces are much stronger than ours (about ${ratio.toFixed(1)} times, we believe).` : ratio > 0.8 ? 'Their forces are roughly a match for ours.' : `We are the stronger (they have about ${Math.round(ratio * 100)}% of our strength, we believe).` });
  lines.push({ head: 'Intentions', text: hostile > 50 ? 'They are hostile and may act against us.' : hostile > 20 ? 'Wary of us, and watching.' : hostile < -20 ? 'Friendly to us.' : 'No particular designs on us.' });
  lines.push({ head: 'Our relationship', text: `Relations ${Math.round(n.relations[t.id]?.score ?? 0)}, trust ${Math.round(ties.trust)}, trade ties ${Math.round(ties.interdep)}${ties.grievance > 10 ? `, and an old grievance (${Math.round(ties.grievance)})` : ''}.` });
  const theirs = activeTreaties(w, t.id).filter((x) => x.kind === 'defence' || x.kind === 'offensive' || x.kind === 'guarantee').map((x) => x.name);
  if (theirs.length) lines.push({ head: 'Their commitments', text: theirs.slice(0, 4).join('; ') + '.' });
  const pat = patronOf(w, t.id), hed = hedging(w, t.id);
  if (pat != null) lines.push({ head: 'Sphere', text: `In ${w.nations[pat].name}'s sphere of influence: moves here will be watched from ${w.nations[pat].name}.` });
  else if (hed) lines.push({ head: 'Sphere', text: `Hedging between ${w.nations[hed[0]].name} and ${w.nations[hed[1]].name}: it will not join either side's alliance.` });
  const trade: string[] = [];
  if (n.embargoes.includes(t.id)) trade.push(`our embargo on them (smugglers get round about ${Math.round(leak(w, n.id, t.id) * 100)}%)`);
  if (tariffOn(w, t.id, n.id)) trade.push(`their ${tariffOn(w, t.id, n.id)}% tariff on our goods`);
  if (trade.length) lines.push({ head: 'Trade', text: trade.join('; ') + '.' });
  // What they would sign, as far as our diplomats can tell (the better the service, the more we know).
  if (quality > 0.35) {
    const kinds = (Object.keys(TREATY_INFO) as TreatyKind[]).filter((k) => k !== 'climate').map((k) => ({ k, p: willingness(w, t, n, k).p })).filter((x) => x.p >= 0.5).sort((a, b) => b.p - a.p);
    lines.push({ head: 'What they would sign', text: kinds.length ? kinds.slice(0, 4).map((x) => TREATY_INFO[x.k].name.toLowerCase()).join(', ') + '.' : 'Nothing at present.' });
  }
  lines.push({ head: 'Confidence', text: quality > 0.7 ? 'High: good sources, and a capable foreign ministry.' : quality > 0.4 ? 'Moderate.' : 'Low: we know little about their thinking.' });
  return { quality, lines };
}
