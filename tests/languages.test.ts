import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/sim/worldgen';
import { registerSystems } from '../src/sim/systems';
import { advance } from '../src/sim/tick';
import { DAY } from '../src/engine/clock';
import { audit, mint } from '../src/engine/ledger';
import { census } from '../src/sim/census';
import { cref, player } from '../src/sim/query';
import { c as cur } from '../src/engine/money';
import { commonLanguage, fluency, languageBar, languagesMonth, startCourse, workLang } from '../src/sim/languages';

registerSystems();
const fresh = (seed = 5301) => generateWorld(seed, 'Tester', 0, { citizensPerRegion: 2 });

test('languages by country; common languages; lessons; working abroad needs the language', () => {
  const w = fresh();
  advance(w, DAY, false);
  const all = census(w).all.filter((c) => !c.player);
  const jp = all.find((c) => w.nations[c.nation].iso === 'JPN')!, br = all.find((c) => w.nations[c.nation].iso === 'BRA')!;
  assert.equal(fluency(w, jp, 'ja'), 100);
  assert.equal(fluency(w, br, 'pt'), 100);
  const english = (iso: string) => { const xs = all.filter((c) => w.nations[c.nation].iso === iso); return xs.filter((c) => fluency(w, c, 'en') >= 45).length / xs.length; };
  assert.ok(english('DEU') > english('JPN') + 0.2, 'Germans speak more English than Japanese');
  assert.ok(commonLanguage(w, jp, br) < 60 || fluency(w, jp, 'en') > 0);
  // Working in Japan needs Japanese.
  const p = player(w);
  const jpn = w.nations.find((n) => n.iso === 'JPN')!;
  if (p.nation !== jpn.id) assert.ok(languageBar(w, p, jpn.id, true));
  assert.equal(workLang(w, jpn.id), 'ja');
  // Lessons.
  mint(w, cref(p.id), w.nations[p.nation].cur, cur(200), 'test');
  const l = p.nation === jpn.id ? 'es' : 'ja';
  assert.ok(startCourse(w, l).ok);
  const f0 = fluency(w, p, l);
  for (let m = 0; m < 6; m++) languagesMonth(w);
  assert.ok(fluency(w, p, l) > f0 + 15, `lessons work (${fluency(w, p, l)})`);
  assert.ok(audit(w).ok);
});
