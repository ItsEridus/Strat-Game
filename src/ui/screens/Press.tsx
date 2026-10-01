import { useState } from 'preact/hooks';
import type { World } from '../../sim/types';
import { ActBtn, CitLink, Empty, NationChip, Panel, Select, Help } from '../common';
import { player, citizensOf } from '../../sim/query';
import { STANCES, articleCheck, foundPaper, foundPaperCheck, papersOwnedBy, publish, relevance, subscribe, type Topic } from '../../sim/press';
import { B } from '../../data/balance';
import { fmtWhen } from '../../engine/clock';
import { fmtAmt } from '../../engine/money';

export function Press({ w }: { w: World }) {
  const p = player(w);
  const mine = papersOwnedBy(w, p.id)[0];
  const [name, setName] = useState('');
  const [topic, setTopic] = useState<Topic>('politics');
  const [stance, setStance] = useState(STANCES.politics[0].id);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const others = citizensOf(w, p.nation).filter((c) => !c.player).sort((a, b) => b.influence - a.influence);
  const [target, setTarget] = useState(others[0]?.id ?? -1);
  const papers = Object.values(w.papers).sort((a, b) => b.subs.length + b.bgSubs - (a.subs.length + a.bgSubs));
  const feed = Object.values(w.articles).sort((a, b) => b.t - a.t).slice(0, 20);
  const est = mine ? Math.round((mine.subs.length * 3 + mine.bgSubs) * relevance(w, mine.nation, topic)) : 0;
  return (
    <div class="grid">
      <Panel title="Your newspaper">
        {mine ? (
          <>
            <p><b>{mine.name}</b> · {mine.subs.length} citizen subscribers · {mine.bgSubs} background readers · {mine.articles} articles · revenue {fmtAmt(w.nations[mine.nation].cur, mine.revenue)}</p>
            <Help>Choose a topic and stance: readership depends on subscribers and how relevant the topic is right now (currently ×{relevance(w, mine.nation, topic).toFixed(1)} for {topic}); readers who share the stance warm to you, others cool. Your text is flavour — effects come from topic, stance and context.</Help>
            <div class="form">
              <label>Topic <Select value={topic} options={(Object.keys(STANCES) as Topic[]).map((t) => [t, t])} onChange={(t) => { setTopic(t); setStance(STANCES[t][0].id); }} /></label>
              <label>Stance <Select value={stance} options={STANCES[topic].map((s) => [s.id, s.label])} onChange={setStance} /></label>
              {stance === 'endorse' && <label>Citizen <Select value={target} options={others.slice(0, 30).map((c) => [c.id, c.name])} onChange={setTarget} /></label>}
            </div>
            <input placeholder="Headline (optional)" value={title} maxLength={90} style={{ width: '100%' }} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
            <textarea placeholder="Article text (optional)" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
            <p class="small">Expected readers ≈ {est}. Costs {B.cost.article} energy; one article per day.</p>
            <ActBtn kind="primary" why={articleCheck(w, p, mine.id)} run={(w) => { const r = publish(w, p, mine.id, topic, stance, title, text, stance === 'endorse' ? target : undefined); if (r.ok) { setTitle(''); setText(''); } return r; }}>Publish</ActBtn>
          </>
        ) : (
          <div class="form row"><input placeholder="Newspaper name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <ActBtn why={foundPaperCheck(w, p)} run={(w) => foundPaper(w, p, name)}>Found newspaper ({B.newspaper.cost} gold)</ActBtn></div>
        )}
      </Panel>
      <Panel title="Newspapers">
        <table class="table compact"><tbody>{papers.map((x) => (
          <tr><td><b>{x.name}</b></td><td><NationChip w={w} id={x.nation} /></td><td>{x.owner.k === 'cit' ? <CitLink w={w} id={x.owner.id} /> : '—'}</td><td>{x.subs.length + x.bgSubs} readers</td>
            <td><ActBtn small kind="ghost" run={(w) => subscribe(w, p, x.id)}>{x.subs.includes(p.id) ? 'Unsubscribe' : 'Subscribe'}</ActBtn></td></tr>
        ))}</tbody></table>
      </Panel>
      <Panel title="Latest articles" class="wide">
        {feed.length ? feed.map((a) => (
          <details class="card">
            <summary><b>{a.title}</b> <small class="muted">— {w.papers[a.paper]?.name} · <CitLink w={w} id={a.author} /> · {fmtWhen(w, a.t)} · {a.readers} readers · 👍 {a.votes}</small></summary>
            {a.text && <p class="prewrap small">{a.text}</p>}
            <p class="small muted">{a.topic} / {a.stance} — {a.effect}</p>
            {a.comments.map((cm) => <p class="small">💬 <CitLink w={w} id={cm.by} />: {cm.text}</p>)}
          </details>
        )) : <Empty>No articles yet.</Empty>}
      </Panel>
    </div>
  );
}
