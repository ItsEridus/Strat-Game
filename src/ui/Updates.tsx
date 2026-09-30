// Updates. In the Windows game the launcher checks GitHub, downloads new
// versions in the background and installs them on restart; this shows its
// status and controls. In a browser the page can only point to the download.
import { useEffect, useState } from 'preact/hooks';

export const GAME_VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';

interface Status { state: string; current: string; latest?: string; notes?: string; error?: string; page: string; auto: boolean }
const bridge = () => (typeof window !== 'undefined' ? (window as any) : {});
export const inLauncher = () => typeof bridge().__meridianUpdate === 'function';

async function launcherStatus(): Promise<Status | null> {
  try { return JSON.parse(await bridge().__meridianUpdate()); } catch { return null; }
}

/** Browser build: ask GitHub (at most daily) whether a newer release exists. */
async function browserCheck(): Promise<Status | null> {
  const key = 'meridian-update-check';
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (cached && Date.now() - cached.at < 86400000) return cached.s;
    const r = await fetch('https://api.github.com/repos/ItsEridus/Strat-Game/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const rel = await r.json();
    const s: Status = { state: newer(rel.tag_name, GAME_VERSION) ? 'manual' : 'current', current: GAME_VERSION, latest: rel.tag_name, page: rel.html_url, auto: false };
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), s }));
    return s;
  } catch { return null; }
}

export function newer(a: string, b: string) {
  const p = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const x = p(a ?? ''), y = p(b ?? '');
  if (x.length !== 3 || y.length !== 3 || [...x, ...y].some((n) => !Number.isFinite(n))) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

export function useUpdateStatus(): [Status | null, (s: Status | null) => void] {
  const [s, set] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = async () => { const v = inLauncher() ? await launcherStatus() : await browserCheck(); if (alive) set(v); };
    poll();
    const t = setInterval(poll, inLauncher() ? 15000 : 3600000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return [s, set];
}

/** A slim banner when an update is ready (or available to download). */
export function UpdateBanner() {
  const [s, set] = useUpdateStatus();
  const [hidden, setHidden] = useState('');
  if (!s || hidden === s.latest) return null;
  if (s.state === 'ready') return (
    <div class="update-banner">
      <span>⬆️ Meridian Reach {s.latest} is ready to install.</span>
      <button class="btn sm primary" onClick={async () => set(JSON.parse(await bridge().__meridianRestartToUpdate()))}>Restart and update</button>
      <button class="btn sm ghost" onClick={() => setHidden(s.latest!)}>Later (installs next start)</button>
    </div>
  );
  if (s.state === 'manual' && s.latest && newer(s.latest, GAME_VERSION)) return (
    <div class="update-banner">
      <span>⬆️ Version {s.latest} is out.{s.error && inLauncher() ? ` ${s.error}` : ''}</span>
      {inLauncher() ? <button class="btn sm primary" onClick={() => bridge().__meridianOpenDownloads()}>Open download page</button> : <a class="btn sm primary" href={s.page} target="_blank" rel="noopener">Download</a>}
      <button class="btn sm ghost" onClick={() => setHidden(s.latest!)}>Dismiss</button>
    </div>
  );
  return null;
}

/** Settings panel section. */
export function UpdateSettings() {
  const [s, set] = useUpdateStatus();
  const label: Record<string, string> = { checking: 'Checking…', current: 'You have the latest version.', downloading: `Downloading ${s?.latest ?? ''}…`, ready: `${s?.latest ?? 'An update'} is ready — restart to install.`, manual: `${s?.latest ?? 'A new version'} is available to download.`, error: s?.error ?? 'Could not check.', off: 'Automatic updates are off.' };
  return (
    <div class="small">
      <p>Version <b>{GAME_VERSION}</b>{s ? ` · ${label[s.state] ?? s.state}` : ''}</p>
      {inLauncher() ? (
        <div class="row">
          <label><input type="checkbox" checked={s?.auto ?? true} onChange={async (e) => set(JSON.parse(await bridge().__meridianSetAutoUpdate((e.target as HTMLInputElement).checked)))} /> Download and install updates automatically</label>
          <button class="btn sm" onClick={async () => set(JSON.parse(await bridge().__meridianCheckUpdate()))}>Check now</button>
          {s?.state === 'ready' && <button class="btn sm primary" onClick={async () => set(JSON.parse(await bridge().__meridianRestartToUpdate()))}>Restart and update</button>}
        </div>
      ) : <p class="muted">Playing in a browser: download new versions from the <a href="https://github.com/ItsEridus/Strat-Game/releases/latest" target="_blank" rel="noopener">releases page</a>. The Windows game (MeridianReach.exe) updates itself.</p>}
    </div>
  );
}
