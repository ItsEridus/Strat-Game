import type { World } from '../../sim/types';
import { Btn, Panel, Tabs } from '../common';
import { store } from '../store';
import { NOTICE_CATS } from '../../engine/events';
import { fmtClock, fmtWhen } from '../../engine/clock';

export function News({ w }: { w: World }) {
  const tab = store.sel.newsTab ?? 'alerts';
  const cat = store.sel.newsCat ?? 'all';
  const notices = w.notices.filter((n) => (cat === 'all' ? w.settings.notifyFilter[n.cat] !== false : n.cat === cat));
  const typeFilter = store.sel.logType ?? 'all';
  const types = [...new Set(w.log.map((e) => e.type))];
  const events = w.log.filter((e) => typeFilter === 'all' || e.type === typeFilter).slice(-200).reverse();
  return (
    <div class="grid">
      <Panel class="wide" title="News & alerts" right={<Tabs tabs={[['alerts', 'My alerts'], ['world', 'World events']]} value={tab} onChange={(t) => store.go('news', { newsTab: t })} />}>
        {tab === 'alerts' ? (
          <>
            <div class="row">
              <select value={cat} onChange={(e) => store.go('news', { newsCat: (e.target as HTMLSelectElement).value })}>
                <option value="all">All shown categories</option>
                {Object.entries(NOTICE_CATS).map(([k, v]) => <option value={k}>{v.label}</option>)}
              </select>
              <Btn small kind="ghost" onClick={() => { for (const n of w.notices) n.read = true; store.emit(); }}>Mark all read</Btn>
              <Btn small kind="ghost" onClick={() => store.go('settings', { setTab: 'alerts' })}>Filters & pausing…</Btn>
            </div>
            <ul class="feed big">
              {notices.map((n) => (
                <li class={n.read ? 'read' : ''} onClick={() => { n.read = true; if (n.link) store.go(n.link); else store.emit(); }}>
                  <small class="muted">{fmtWhen(w, n.t)} · {NOTICE_CATS[n.cat]?.label ?? n.cat}</small><br />{n.text}
                </li>
              ))}
              {!notices.length && <li class="muted">No alerts.</li>}
            </ul>
          </>
        ) : (
          <>
            <select value={typeFilter} onChange={(e) => store.go('news', { logType: (e.target as HTMLSelectElement).value })}>
              <option value="all">All event types</option>
              {types.map((t) => <option value={t}>{t}</option>)}
            </select>
            <ul class="feed big">{events.map((e) => <li class={e.player ? 'me' : ''}><small class="muted">{fmtClock(w, e.t)}</small><br />{e.text}</li>)}</ul>
          </>
        )}
      </Panel>
    </div>
  );
}
