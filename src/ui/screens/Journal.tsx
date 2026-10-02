// Journal: the stories you are part of — what you know, what is next, what you
// promised — and what happened. Continue any open story from here.
import { fmtDay } from '../../engine/calendar';
import { useState } from 'preact/hooks';
import type { StoryInstance, World } from '../../sim/types';
import { Btn, Empty, Help, Panel, RegionLink, Select } from '../common';
import { store } from '../store';
import { Ctx, STORIES, openStories, setStoryFrequency, storyIcon, storyTitle } from '../../sim/story';
import { player } from '../../sim/query';

const when = (t: number) => `${fmtDay(t)}, ${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

export function Journal({ w }: { w: World }) {
  const [page, setPage] = useState(0);
  const open = openStories(w);
  const promises = w.story.journal.filter((j) => j.kind === 'promise').slice(-8).reverse();
  const history = w.story.journal.filter((j) => j.kind === 'outcome').slice().reverse();
  const per = 25;
  return (
    <div class="grid">
      <Panel title="📖 Your stories" class="wide" right={<span class="row small">Everyday situations <Select value={w.story.settings.frequency} options={[['off', 'Off'], ['rare', 'Rare'], ['normal', 'Normal'], ['frequent', 'Frequent']]} onChange={(f) => store.act((w) => setStoryFrequency(w, f))} /></span>}>
        {open.length ? open.map((i) => <StoryRow w={w} i={i} />) : <Empty>Nothing open right now. Stories start from what happens around you: strikes at work, friends in trouble, elections, crises. Go out into your neighbourhood.</Empty>}
        <Help>Stories remember who is involved and what you decided. Urgent decisions pause the game; the rest wait here as leads until you continue them. “Everyday situations” sets how often small encounters happen; running stories, messages and legal or debt consequences continue even when it is off.</Help>
      </Panel>
      {promises.length > 0 && (
        <Panel title="🤝 Promises and obligations">
          <ul class="news small">{promises.map((j) => <li><small class="muted">{when(j.t)}</small> <b>{j.title}:</b> {j.text}</li>)}</ul>
        </Panel>
      )}
      <Panel title="🗒️ What happened" class={promises.length ? '' : 'wide'}>
        {history.length ? <ul class="news small">{history.slice(page * per, page * per + per).map((j) => <li><small class="muted">{when(j.t)}</small> <b>{j.title}:</b> {j.text}</li>)}</ul> : <Empty>Your decisions will be recorded here.</Empty>}
        {history.length > per && <div class="row small"><button class="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Newer</button> {page + 1} / {Math.ceil(history.length / per)} <button class="btn sm" disabled={(page + 1) * per >= history.length} onClick={() => setPage(page + 1)}>Older ›</button></div>}
      </Panel>
    </div>
  );
}

function StoryRow({ w, i }: { w: World; i: StoryInstance }) {
  const def = STORIES[i.def];
  const lead = [...w.story.journal].reverse().find((j) => j.story === i.id && (j.kind === 'lead' || j.kind === 'outcome'));
  const stage = def?.stages[i.stage];
  const people = Object.entries(i.bind).filter(([k, v]) => typeof v === 'number' && w.citizens[v as number] && k !== 'msg').map(([, v]) => w.citizens[v as number]).slice(0, 3);
  const p = player(w);
  let region: number | null = null;
  try { region = stage?.region?.(new Ctx(w, i)) ?? null; } catch { region = null; }
  return (
    <div class="card story-row">
      <div class="row"><span class="enc-icon sm">{storyIcon(i)}</span><b>{storyTitle(w, i)}</b>
        <small class="muted">{def?.kind === 'chain' ? 'story' : 'situation'} · {i.status === 'waiting' ? `waiting until ${when(i.waitUntil!)}` : i.deadline ? `decide by ${when(i.deadline)}` : 'open'}</small></div>
      {lead && <p class="small">{lead.text}</p>}
      {i.status === 'waiting' && i.waitWhy && <p class="small muted">⏳ {i.waitWhy}</p>}
      {people.length > 0 && <p class="small muted">With {people.map((c) => c.name).join(', ')}</p>}
      <div class="row">
        {i.status !== 'waiting' && <Btn small kind="primary" onClick={() => store.go(store.tab, { story: i.id })}>{stage?.urgent ? 'Decide' : 'Follow lead'}</Btn>}
        {i.status === 'waiting' && i.waitUntil && <Btn small onClick={() => store.jumpTo(i.waitUntil!)}>Wait until then</Btn>}
        {region != null && region !== p.loc && <span class="small">Needs you in <RegionLink w={w} id={region} /></span>}
      </div>
    </div>
  );
}

