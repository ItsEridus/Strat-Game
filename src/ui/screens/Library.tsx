import type { World } from '../../sim/types';
import { Btn, Panel, Select, Help } from '../common';
import { store } from '../store';
import { composeChapter, exportHistory } from '../../sim/library';
import { fmtClock } from '../../engine/clock';

export function Library({ w }: { w: World }) {
  const nationFilter = store.sel.libNation ?? -1;
  const current = composeChapter(w, w.chapters.length ? w.chapters[w.chapters.length - 1].to : 0, w.time + 1, 'This month so far');
  const timeline = w.log.filter((e) => (e.important || e.player) && (nationFilter < 0 || e.nation === nationFilter)).slice(-150).reverse();
  const download = () => {
    const blob = new Blob([exportHistory(w)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-chronicle-day${Math.floor(w.time / 1440)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div class="grid">
      <Panel title="📚 Library — chronicles of the Reach" class="wide" right={<Btn onClick={download}>⬇ Export history (Markdown)</Btn>}>
        <Help>Each month closes into a chapter written from the permanent event log, highlighting your part. Everything here happened in your simulation.</Help>
      </Panel>
      <Panel title={current.title}>{current.text.map((t) => <p>{t}</p>)}</Panel>
      {w.chapters.slice().reverse().map((c) => <Panel title={c.title}>{c.text.map((t) => <p>{t}</p>)}</Panel>)}
      <Panel title="Timeline" class="wide" right={<Select value={nationFilter} options={[[-1, 'All nations'], ...w.nations.map((n) => [n.id, n.name] as [number, string])]} onChange={(v) => store.go('library', { libNation: v })} />}>
        <ul class="feed big">{timeline.map((e) => <li class={e.player ? 'me' : ''}><small class="muted">{fmtClock(w, e.t)}</small><br />{e.text}</li>)}</ul>
      </Panel>
    </div>
  );
}
