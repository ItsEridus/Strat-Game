import type { World } from '../../sim/types';
import { ActBtn, CitLink, Empty, Panel } from '../common';
import { store } from '../store';
import { fmtWhen } from '../../engine/clock';
import { respond } from '../../sim/inbox';

export function Inbox({ w }: { w: World }) {
  const selId = store.sel.msg;
  const msg = w.inbox.find((m) => m.id === selId) ?? w.inbox[0];
  if (msg && !msg.read) msg.read = true;
  return (
    <div class="inbox">
      <Panel title="Inbox" class="inbox-list">
        {w.inbox.length ? w.inbox.map((m) => (
          <div class={`msg ${m.id === msg?.id ? 'on' : ''} ${m.read ? '' : 'unread'} ${m.options && !m.resolved ? 'pending' : ''}`} onClick={() => store.go('inbox', { msg: m.id })}>
            <b>{m.subject}</b><small class="muted">{fmtWhen(w, m.t)}{m.options && !m.resolved ? ' · needs reply' : ''}</small>
          </div>
        )) : <Empty>No messages.</Empty>}
      </Panel>
      {msg && (
        <Panel title={msg.subject} class="inbox-body">
          <p class="small muted">From {msg.from != null ? <CitLink w={w} id={msg.from} /> : 'System'} · {fmtWhen(w, msg.t)} · {msg.kind}</p>
          <p class="prewrap">{msg.body}</p>
          {msg.options && !msg.resolved && (
            <div class="row">{msg.options.map((o) => <ActBtn run={(w) => respond(w, msg.id, o.id)}>{o.label}</ActBtn>)}</div>
          )}
          {msg.resolved && <p class="muted">You replied: {msg.options?.find((o) => o.id === msg.resolved)?.label ?? msg.resolved}</p>}
        </Panel>
      )}
    </div>
  );
}
