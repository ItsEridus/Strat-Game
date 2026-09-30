import { useState } from 'preact/hooks';
import { Emblem } from '../icons';
import { GAME_VERSION } from '../Updates';
import { showWhatsNew } from '../WhatsNew';
import { store } from '../store';
import { NATION_DEFS } from '../../data/names';
import { EARTH } from '../../data/earth';
import { SLOTS, slotInfo } from '../../engine/save';
import { Btn, Num, Select } from '../common';
import type { Settings } from '../../sim/types';

export function StartScreen() {
  const [name, setName] = useState('Citizen');
  const [nation, setNation] = useState(0);
  const [seed, setSeed] = useState(Math.floor(Math.random() * 1e6));
  const [fixed, setFixed] = useState(false);
  const [cpn, setCpn] = useState(24);
  const [pace, setPace] = useState(365);
  const [difficulty, setDifficulty] = useState<Settings['difficulty']>('normal');
  const [adv, setAdv] = useState({ nuclear: true, pirates: true, terrainEvents: false, tournaments: true });
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [text, setText] = useState('');
  const saves = SLOTS.map((s) => slotInfo(s)).filter(Boolean);
  const onFile = async (f: File | undefined) => { if (f) setText(await f.text()); };
  const begin = () => { setGenerating(true); setTimeout(() => store.newGame(fixed ? seed : null, name, nation, cpn, difficulty, adv, pace), 60); };
  return (
    <div class="start">
      <TitleBackdrop />
      {generating && <div class="loading-veil" role="status"><Emblem size={84} /><p>Charting the world</p><small>{NATION_DEFS[nation].name} · {(cpn * 520).toLocaleString()} lives being set in motion…</small></div>}
      <div class="start-inner">
      <div class="title-block">
        <Emblem size={76} />
        <h1>MERIDIAN REACH</h1>
        <p class="tagline">A life · A nation · A world</p>
        <div class="rule" />
        <p class="lead">Live one life among thousands on a map of the real Earth: grow up, work, love, raise a family and grow old — or build companies, win elections and command armies — while a whole society lives around you.</p>
      </div>
      {saves.length > 0 && (
        <section class="panel">
          <header><h3>Continue</h3></header>
          <div class="slot-list">
            {saves.map((i) => (
              <div class="slot"><b>{i!.slot}</b> <span>{i!.name} · Day {i!.day}</span> <small class="muted">{new Date(i!.savedAt).toLocaleString()}</small>
                <Btn kind="primary" small onClick={() => store.loadSlot(i!.slot)}>Load</Btn></div>
            ))}
          </div>
        </section>
      )}
      <section class="panel">
        <header><h3>New campaign</h3></header>
        <div class="form">
          <label>Your name <input value={name} maxLength={28} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
          <label>Difficulty <Select value={difficulty} options={[['easy', 'Easy — more starting funds'], ['normal', 'Normal'], ['hard', 'Hard — leaner start']]} onChange={setDifficulty} /></label>
          <label>AI citizens per region <Select value={cpn} options={[[8, '8 (≈4,000 people · fastest)'], [16, '16 (≈8,000 people)'], [24, '24 (≈12,500 people · default)'], [32, '32 (≈16,500 people · slowest)']]} onChange={setCpn} /></label>
          <label>Pace of life <Select value={pace} options={[[365, 'With the calendar — one year of age per year (default)'], [120, 'Quick — three years of age per calendar year'], [72, 'Brisk — five years of age per calendar year'], [36, 'Generations — ten years of age per calendar year']]} onChange={setPace} /></label>
        </div>
        <h4>Choose your nation</h4>
        <svg class="start-map" viewBox={`0 0 ${EARTH.width} ${EARTH.height}`}>
          <rect width={EARTH.width} height={EARTH.height} fill="#0c2233" />
          <path d={EARTH.background} fill="#262d38" />
          {EARTH.regions.map((r) => (
            <path d={r.path} fill={NATION_DEFS[r.nation].color} opacity={r.nation === nation ? 1 : 0.45} stroke={r.nation === nation ? '#fff' : 'none'} stroke-width={1.2} vector-effect="non-scaling-stroke" onClick={() => setNation(r.nation)}>
              <title>{NATION_DEFS[r.nation].name} — {r.name}</title>
            </path>
          ))}
        </svg>
        <div class="nation-pick">
          {NATION_DEFS.map((n, i) => (
            <label class={nation === i ? 'on' : ''}><input type="radio" name="nation" checked={nation === i} onChange={() => setNation(i)} />
              <i class="dot" style={{ background: n.color }} />{n.name} <small class="muted">{n.cur}</small></label>
          ))}
        </div>
        <p class="muted small">{NATION_DEFS[nation].name}: led by a {NATION_DEFS[nation].leader.toLowerCase()} with the {NATION_DEFS[nation].legislature} · currency {NATION_DEFS[nation].cur} · {EARTH.regions.filter((r) => r.nation === nation).length} regions. Every country plays by the same rules; starting companies, citizens and politics are generated fresh for every campaign, and the future is never fixed: what happens depends on chance as it unfolds.</p>
        <h4>Optional advanced systems</h4>
        <div class="checks">
          {(['nuclear', 'pirates', 'tournaments', 'terrainEvents'] as const).map((k) => (
            <label><input type="checkbox" checked={adv[k]} onChange={() => setAdv({ ...adv, [k]: !adv[k] })} />
              {{ nuclear: 'Nuclear weapons & espionage', pirates: 'Recurring pirate invasions', tournaments: 'Tournaments', terrainEvents: 'Terrain-changing natural events' }[k]}</label>
          ))}
        </div>
        <details class="small"><summary>Reproducible world (for sharing or testing)</summary>
          <label class="check"><input type="checkbox" checked={fixed} onChange={() => setFixed(!fixed)} /> Build the world from a fixed seed and keep its future fixed too</label>
          {fixed && <label>Seed <Num value={seed} onInput={setSeed} width={120} /> <button class="btn sm ghost" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>🎲</button></label>}
        </details>
        <p class="muted small">Time is paused until you press play. The world only advances while the game is open.</p>
        <Btn kind="primary" onClick={begin}>Start campaign ▶</Btn>
        <Btn kind="ghost" onClick={() => setImporting(!importing)}>Import a save…</Btn>
        {importing && (
          <div class="import">
            <input type="file" accept=".json,.txt" onChange={(e) => onFile((e.target as HTMLInputElement).files?.[0])} />
            <textarea placeholder="…or paste save text" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
            <Btn onClick={() => { try { store.importText(text); } catch (err) { store.toast((err as Error).message, false); } }} why={!text ? 'Choose a file or paste a save.' : null}>Import</Btn>
          </div>
        )}
      </section>
      <p class="start-footer">Version {GAME_VERSION} · <button class="linkish" onClick={() => showWhatsNew()}>What's new</button> · single-player · everything runs on your computer</p>
      </div>
    </div>
  );
}

/** The slowly drifting Earth behind the title. */
function TitleBackdrop() {
  return (
    <div class="title-bg" aria-hidden="true">
      <svg class="earth" viewBox={`0 0 ${EARTH.width} ${EARTH.height}`} preserveAspectRatio="xMidYMid slice">
        <path class="land-bg" d={EARTH.background} />
        {EARTH.regions.map((r) => <path class="reg" d={r.path} />)}
      </svg>
      <div class="meridians" />
      <div class="stars" />
      <div class="vignette" />
    </div>
  );
}
