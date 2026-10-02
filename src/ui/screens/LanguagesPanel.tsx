// Languages (2.9): what you speak, and lessons.
import { useState } from 'preact/hooks';
import type { Citizen, World } from '../../sim/types';
import { ActBtn, Bar, Help, Select } from '../common';
import { fmtAmt, c as cur } from '../../engine/money';
import { COURSE_USD, LANG_NAME, courseCheck, fluencyLabel, languagesOf, startCourse, stopCourse, type Lang } from '../../sim/languages';

export function LanguagesPanel({ w, p }: { w: World; p: Citizen }) {
  const langs = Object.entries(languagesOf(w, p)).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as [Lang, number][];
  const [pick, setPick] = useState<Lang>('es');
  return (
    <div>
      <table class="table compact small"><tbody>{langs.map(([l, v]) => <tr><td>{LANG_NAME[l]}</td><td><Bar v={v} max={100} color="#4a7cc0" label={fluencyLabel(v)} /></td></tr>)}</tbody></table>
      {p.course ? <p class="small">🗣️ Taking {LANG_NAME[p.course]} lessons. <ActBtn small kind="ghost" run={(w) => stopCourse(w)}>Stop</ActBtn></p>
        : <div class="row small">Learn <Select value={pick} options={(Object.keys(LANG_NAME) as Lang[]).map((l) => [l, LANG_NAME[l]] as [Lang, string])} onChange={setPick} />
          <ActBtn small why={courseCheck(w, p, pick)} run={(w) => startCourse(w, pick)}>Take lessons ({fmtAmt(w.nations[p.nation].cur, Math.round(cur(COURSE_USD) / 10))}/month)</ActBtn></div>}
      <Help>You speak your mother tongue, the language of your country's schools and work, and perhaps English. Lessons, or living where a language is spoken, make you more fluent, fastest at first. Working abroad needs some of the local language (more for skilled work), and people who share no language find it harder to become friends.</Help>
    </div>
  );
}
