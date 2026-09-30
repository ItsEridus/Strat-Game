import { useState } from 'preact/hooks';
import { UpdateSettings } from '../Updates';
import type { World } from '../../sim/types';
import { Btn, Panel, Tabs, Help, Select } from '../common';
import { store } from '../store';
import { SLOTS, deleteSlot, slotInfo } from '../../engine/save';
import { NOTICE_CATS } from '../../engine/events';
import { B, BALANCE, PROVENANCE, applyBalance } from '../../data/balance';
import { audit } from '../../engine/ledger';
import { fmtAmt } from '../../engine/money';

export function Settings({ w }: { w: World }) {
  const tab = store.sel.setTab ?? 'saves';
  return (
    <div class="grid">
      <Panel class="wide" title="Settings" right={<Tabs tabs={[['saves', 'Saves'], ['game', 'Game'], ['updates', 'Updates'], ['alerts', 'Alerts & pausing'], ['economy', 'Money supply'], ['balance', 'Balance & sources']]} value={tab} onChange={(t) => store.go('settings', { setTab: t })} />}>
        {tab === 'saves' && <Saves w={w} />}
        {tab === 'game' && <Game w={w} />}
        {tab === 'updates' && <UpdateSettings />}
        {tab === 'alerts' && <Alerts w={w} />}
        {tab === 'economy' && <Economy w={w} />}
        {tab === 'balance' && <Balance w={w} />}
      </Panel>
    </div>
  );
}

function Saves({ w }: { w: World }) {
  const [, force] = useState(0);
  const download = () => {
    const blob = new Blob([store.exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-reach-day${Math.floor(w.time / 1440)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (f?: File) => { if (!f) return; try { store.importText(await f.text()); } catch (e) { store.toast((e as Error).message, false); } };
  return (
    <>
      <Help>Saves include the clock, RNG state, scheduled events, pending votes, escrows, battles and occupations. The game autosaves every three minutes of play, when the window is hidden or closed, and when you quit to the title screen. Saves are stored compressed in the browser's database; export a file for a backup.</Help>
      <table class="table">
        <thead><tr><th>Slot</th><th>Contents</th><th /></tr></thead>
        <tbody>{SLOTS.map((s) => {
          const i = slotInfo(s);
          return (
            <tr><td>{s}</td><td>{i ? `${i.name} · day ${i.day} · ${new Date(i.savedAt).toLocaleString()} · ${(i.size / 1e6).toFixed(1)} MB` : <span class="muted">empty</span>}</td>
              <td>
                {s !== 'autosave' && <Btn small onClick={() => { void store.save(s).then(() => force((x) => x + 1)); }}>Save here</Btn>}
                <Btn small why={!i ? 'Empty slot.' : null} showWhy={false} onClick={() => { if (confirm(`Load ${s}? Unsaved progress will be lost.`)) store.loadSlot(s); }}>Load</Btn>
                <Btn small kind="danger" why={!i ? 'Empty slot.' : null} showWhy={false} onClick={() => { if (confirm(`Delete ${s}?`)) { deleteSlot(s); force((x) => x + 1); } }}>Delete</Btn>
              </td></tr>
          );
        })}</tbody>
      </table>
      <div class="row">
        <Btn onClick={download}>⬇ Export save file</Btn>
        <label class="btn">⬆ Import save file<input type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => upload((e.target as HTMLInputElement).files?.[0])} /></label>
        <Btn kind="danger" onClick={() => { if (confirm('Quit to the title screen? (Progress is autosaved.)')) { void store.save('autosave').then(() => { store.w = null; store.emit(); }); } }}>Quit to title</Btn>
      </div>
    </>
  );
}

function Game({ w }: { w: World }) {
  const s = w.settings;
  return (
    <div class="form">
      <label>Month length (days) <Select value={s.monthLen} options={[[20, '20'], [30, '30 (default)'], [40, '40']]} onChange={(v) => { s.monthLen = v; store.emit(); }} /></label>
      <label class="check"><input type="checkbox" checked={s.autoTrain} onChange={() => { s.autoTrain = !s.autoTrain; store.emit(); }} /> Automatic first daily training</label>
      <p class="small muted">{s.fixedFate ? `Reproducible world (seed ${w.seed}) · ` : 'Living world (unscripted) · '}difficulty {s.difficulty} · {Object.keys(w.citizens).length} citizens · advanced systems: {Object.entries(s.advanced).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}.</p>
      <p class="small muted">Elections follow the calendar: president day {B.politics.days.president}, party leaders day {B.politics.days.party}, congress day {B.politics.days.congress} of each month.</p>
    </div>
  );
}

function Alerts({ w }: { w: World }) {
  return (
    <>
      <Help>Choose which alerts appear, and which ones stop the clock (when playing or advancing time).</Help>
      <table class="table">
        <thead><tr><th>Category</th><th>Show</th><th>Pause time</th></tr></thead>
        <tbody>{Object.entries(NOTICE_CATS).map(([k, v]) => (
          <tr><td>{v.label}</td>
            <td><input type="checkbox" checked={w.settings.notifyFilter[k] !== false} onChange={() => { w.settings.notifyFilter[k] = !(w.settings.notifyFilter[k] !== false); store.emit(); }} /></td>
            <td><input type="checkbox" checked={!!w.settings.pauseOn[k]} onChange={() => { w.settings.pauseOn[k] = !w.settings.pauseOn[k]; store.emit(); }} /></td></tr>
        ))}</tbody>
      </table>
    </>
  );
}

function Economy({ w }: { w: World }) {
  const [res, setRes] = useState<string | null>(null);
  const rows = Object.entries(w.stats.supply).sort();
  const reasons = (map: Record<string, number>, asset: string) => Object.entries(map).filter(([k]) => k.startsWith(asset + '|')).map(([k, v]) => [k.split('|')[1], v] as [string, number]).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <Help>Every unit of money is created (minted) or destroyed (burned) for a recorded reason; all other movements are transfers. The audit sums every wallet and escrow and compares with the tracked supply.</Help>
      <Btn onClick={() => { const a = audit(w); setRes(a.ok ? '✅ Audit passed: all money and goods are accounted for.' : '❌ ' + a.problems.slice(0, 5).join('; ')); }}>Run audit</Btn>
      {res && <p>{res}</p>}
      <table class="table compact">
        <thead><tr><th>Asset</th><th class="num">Supply</th><th>Created by</th><th>Destroyed by</th></tr></thead>
        <tbody>{rows.map(([a, v]) => (
          <tr><td>{a}</td><td class="num">{fmtAmt(a, v)}</td>
            <td class="small">{reasons(w.stats.minted, a).slice(0, 5).map(([r, n]) => `${r}: ${fmtAmt(a, n)}`).join('; ')}</td>
            <td class="small">{reasons(w.stats.burned, a).slice(0, 5).map(([r, n]) => `${r}: ${fmtAmt(a, n)}`).join('; ')}</td></tr>
        ))}</tbody>
      </table>
    </>
  );
}

function Balance({ w }: { w: World }) {
  const [text, setText] = useState(JSON.stringify(w.settings.balance, null, 1));
  return (
    <>
      <Help>Where each number comes from: <b>DOC</b> documented by current official announcements, <b>WIKI</b> older wiki baseline, <b>SOLO</b> a chosen default for this single-player adaptation. See docs/DESIGN.md.</Help>
      <table class="table compact">
        <thead><tr><th>Setting</th><th>Source</th><th>Notes</th></tr></thead>
        <tbody>{PROVENANCE.map((p) => <tr><td><code>{p.key}</code></td><td><span class={`src ${p.src}`}>{p.src}</span></td><td class="small">{p.note}</td></tr>)}</tbody>
      </table>
      <h4>Overrides for this save</h4>
      <p class="small muted">JSON object of dotted paths to values, e.g. {'{"energy.baseMax": 150, "war.pactDays": 10}'}. Applied immediately and saved with the game.</p>
      <textarea value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <Btn onClick={() => {
        try { const o = JSON.parse(text || '{}'); w.settings.balance = o; applyBalance(o); store.toast('Balance overrides applied.', true); } catch (e) { store.toast('Invalid JSON: ' + (e as Error).message, false); }
      }}>Apply overrides</Btn>
      <details><summary>Full current balance table</summary><pre class="small">{JSON.stringify(B, null, 1)}</pre></details>
      <span class="muted small">Defaults: {Object.keys(BALANCE).length} sections.</span>
    </>
  );
}
