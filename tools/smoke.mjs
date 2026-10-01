// Play-tests a build in a real browser before it is released: node tools/smoke.mjs
// Needs Playwright (PLAYWRIGHT_PATH=$(npm root -g)/playwright) and a Chromium
// (CHROME_PATH=/path/to/chrome to use an installed Chrome). Run `npm run build` first.
//
// 1. Upgrade (when PREV_DIR points at the previous release's web build): start a
//    campaign in the previous version, save it, then load that save in this build,
//    the way the auto-updater hands a player's game to a new version.
// 2. A new campaign from the title screen: time running in real time, a long
//    advance, every screen opened, a conversation, then save, reload and continue.
// 3. The page opened straight from disk (file://), as the web download is played.
// Any page error, console error, blank screen or failed load fails the release.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = resolve('.');
const PREV = process.env.PREV_DIR ? resolve(process.env.PREV_DIR) : null;
const VERSION = JSON.parse(await readFile('package.json', 'utf8')).version;

// Both builds are served from one origin so they share saved games, as they do in the Windows window.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [, mount, ...rest] = url.split('/');
  const base = mount === 'new' ? ROOT : mount === 'prev' && PREV ? PREV : null;
  const file = base && join(base, rest.join('/') || 'index.html');
  try {
    if (!file || !file.startsWith(base) || !(await stat(file)).isFile()) throw new Error('not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const errors = [];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const watch = async (page, where) => {
  // The game must play offline: requests beyond the page (the browser build's update check) fail here.
  await page.route((url) => !url.href.startsWith(origin) && url.protocol !== 'file:' && url.protocol !== 'data:', (r) => r.abort());
  page.on('pageerror', (e) => errors.push(`${where}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url ?? '';
    if (m.text().startsWith('Failed to load resource') && url && !url.startsWith(origin) && !url.startsWith('file:')) return;
    errors.push(`${where}: console: ${m.text()}${url ? ` (${url})` : ''}`);
  });
};
const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const inGame = (page) => page.waitForSelector('.topbar', { timeout: 180_000 });

/** Advance the game by whole days, as a script would (stops at pausing events are resumed). */
const liveDays = (page, days) => page.evaluate((days) => {
  const s = window.meridian;
  s.w.settings.pauseOn = {};
  const end = s.w.time + days * 1440;
  for (let i = 0; i < 60 && s.w.time < end; i++) s.advanceSyncTo(end);
  return s.w.time >= end;
}, days);

/** Open every screen in the navigation, plus a person's profile and the admin panel. */
async function everyScreen(page, where) {
  const n = await page.locator('.nav button').count();
  check(n >= 30, `${where}: only ${n} screens in the navigation`);
  for (let i = 0; i < n; i++) {
    const label = await page.evaluate((i) => { const b = document.querySelectorAll('.nav button')[i]; b.click(); return b.textContent.trim(); }, i);
    await page.waitForTimeout(120);
    const text = await page.evaluate(() => document.querySelector('main.main')?.textContent.trim().length ?? 0);
    check(text > 20, `${where}: the ${label} screen is blank`);
  }
  for (const [tab, sel] of [['citizen', 'npc'], ['admin', null], ['war', 'war'], ['war', 'archive']]) {
    await page.evaluate(([tab, sel]) => {
      const s = window.meridian;
      const npc = Object.values(s.w.citizens).find((c) => !c.player && !c.gone);
      const war = Object.values(s.w.wars).sort((a, b) => b.declared - a.declared)[0];
      s.go(tab, sel === 'npc' ? { citizen: npc.id } : sel === 'war' ? { war: war?.id ?? null } : sel === 'archive' ? { war: null } : {});
    }, [tab, sel]);
    await page.waitForTimeout(150);
    const text = await page.evaluate(() => document.querySelector('main.main')?.textContent.trim().length ?? 0);
    check(text > 20, `${where}: the ${tab} screen is blank`);
  }
  await page.evaluate(() => window.meridian.go('dashboard'));
  log(`${where}: opened ${n + 4} screens (with a person's profile, the admin panel, a war's history and the war archive)`);
}

/** The back and forward buttons (and Alt+arrows) retrace screens and profiles, and restore where the page was scrolled. */
async function backAndForward(page) {
  const where = () => page.evaluate(() => { const s = window.meridian; return s.tab === 'citizen' ? `citizen:${s.sel.citizen}` : s.tab; });
  const nav = (label) => page.evaluate((label) => [...document.querySelectorAll('.nav button')].find((b) => b.textContent.includes(label)).click(), label);
  const [a, b] = await page.evaluate(() => Object.values(window.meridian.w.citizens).filter((c) => !c.player && !c.gone).slice(0, 2).map((c) => c.id));
  await nav('Armed Forces');
  await page.waitForTimeout(300); // let the screen open (and its own scroll to the top happen) before scrolling it
  await page.evaluate(() => window.scrollTo(0, 500));
  const y = await page.evaluate(() => window.scrollY);
  await nav('Journal');
  await page.evaluate((a) => window.meridian.go('citizen', { citizen: a }), a);
  await page.evaluate((b) => window.meridian.go('citizen', { citizen: b }), b);
  await page.evaluate(() => window.meridian.go('citizen', { story: null })); // not a new page
  const trail = [];
  for (let i = 0; i < 3; i++) { await page.click('.history button[aria-label="Back"]'); await page.waitForTimeout(80); trail.push(await where()); }
  check(trail.join(' ') === `citizen:${a} journal forces`, `history: back went ${trail.join(' → ')}`);
  // The view restores the position once the page has laid out (it retries for up to 5 s): wait for it to settle.
  await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 2, y, { timeout: 6000 }).catch(() => {});
  check(Math.abs((await page.evaluate(() => window.scrollY)) - y) < 2, `history: back did not restore the scroll position (${y}; at ${await page.evaluate(() => window.scrollY)})`);
  await page.click('.history button[aria-label="Forward"]');
  await page.waitForTimeout(80);
  check((await where()) === 'journal', `history: forward went to ${await where()}`);
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(80);
  check((await where()) === 'forces', `history: Alt+← went to ${await where()}`);
  await nav('Dashboard');
  check(await page.isDisabled('.history button[aria-label="Forward"]'), 'history: forward still offered after opening a new screen');
  log('new campaign: back and forward retrace screens and profiles');
}

/** Tables sort by a column when its heading is clicked, and reverse on a second click. */
async function sorting(page) {
  await page.evaluate(() => window.meridian.go('jobs'));
  await page.waitForTimeout(150);
  const head = page.locator('table:has(th.sortable) th.sortable button', { hasText: 'Industry' }).first();
  if (!(await head.count())) { log('new campaign: no job offers to sort'); return; }
  const industries = () => page.$$eval('table:has(th.sortable) tbody tr td:nth-child(2)', (tds) => tds.map((td) => td.textContent.trim().replace(/^\S+\s/, '')));
  const inOrder = (xs, dir) => xs.every((x, i) => i === 0 || dir * xs[i - 1].localeCompare(x, undefined, { numeric: true, sensitivity: 'base' }) <= 0);
  await head.click();
  const up = await industries();
  check(up.length > 1 && inOrder(up, 1), `sorting: the job market is not A→Z by industry (${up.slice(0, 5).join(', ')})`);
  await head.click();
  const down = await industries();
  check(inOrder(down, -1), `sorting: the job market is not Z→A by industry (${down.slice(0, 5).join(', ')})`);
  check((await page.getAttribute('table:has(th.sortable) th.sorted', 'aria-sort')) === 'descending', 'sorting: the sorted column is not marked');
  log(`new campaign: the job market sorts by industry (${up.length} offers)`);
}

/** Save, reload the page and continue the saved game from the title screen. */
async function saveReloadContinue(page, where) {
  const before = await page.evaluate(async () => { const s = window.meridian; await s.save('autosave'); return { t: s.w.time, name: s.w.citizens[s.w.playerId].name }; });
  await page.reload();
  await page.waitForSelector('.slot button', { timeout: 30_000 });
  await page.click('.slot button');
  await inGame(page);
  const after = await page.evaluate(() => { const s = window.meridian; return { t: s.w.time, name: s.w.citizens[s.w.playerId].name }; });
  check(after.name === before.name && after.t === before.t, `${where}: the reloaded game differs (${JSON.stringify(before)} → ${JSON.stringify(after)})`);
  log(`${where}: saved, reloaded and continued (day ${Math.floor(after.t / 1440)})`);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await watch(page, 'browser');

  if (PREV) {
    // 1. A game saved by the previous release loads and plays in this one.
    await page.goto(`${origin}/prev/index.html`);
    await page.click('text=Start campaign');
    await inGame(page);
    const saved = await page.evaluate(async () => { const s = window.meridian; s.advanceSyncTo(s.w.time + 1440); await s.save('autosave'); return { t: s.w.time, name: s.w.citizens[s.w.playerId].name }; });
    log(`previous release: campaign saved on day ${Math.floor(saved.t / 1440)}`);
    await page.goto(`${origin}/new/index.html`);
    // Someone updating sees what changed, once.
    await page.waitForSelector('.modal.whatsnew', { timeout: 15_000 });
    check((await page.textContent('.modal.whatsnew')).includes(VERSION), `upgrade: What's new does not show ${VERSION}`);
    await page.click('.modal.whatsnew button:has-text("Got it")');
    log(`upgrade: What's new showed ${VERSION}`);
    await page.waitForSelector('.slot button', { timeout: 30_000 });
    await page.click('.slot button');
    await inGame(page);
    const loaded = await page.evaluate(() => { const s = window.meridian; return { t: s.w.time, name: s.w.citizens[s.w.playerId].name }; });
    check(loaded.name === saved.name && loaded.t === saved.t, `upgrade: the loaded game differs (${JSON.stringify(saved)} → ${JSON.stringify(loaded)})`);
    check(await liveDays(page, 2), 'upgrade: time did not advance two days');
    await everyScreen(page, 'upgrade');
    log('upgrade: the previous release\'s save plays in this build');
    await page.evaluate(async () => { for (const d of await indexedDB.databases()) indexedDB.deleteDatabase(d.name); localStorage.clear(); });
  }

  // 2. A new campaign from the title screen.
  await page.goto(`${origin}/new/index.html`);
  await page.waitForSelector('text=Start campaign');
  check((await page.textContent('body')).includes(VERSION), `title screen: version ${VERSION} is not shown`);
  await page.waitForTimeout(300);
  check((await page.locator('.modal.whatsnew').count()) === 0, "a new player is shown What's new");
  await page.fill('.form input', 'Smoke Test');
  await page.click('text=Start campaign');
  await inGame(page);
  log('new campaign: world generated');
  // Every speed moves the clock (1× is a minute a second: the world takes a ten-minute step about every ten seconds).
  for (const k of [1, 2, 3]) {
    const a = await page.evaluate((k) => { const s = window.meridian; s.w.settings.pauseOn = {}; s.setSpeed(k); return s.w.time; }, k);
    await page.waitForTimeout(k === 1 ? 11_000 : 3_000);
    const b = await page.evaluate(() => { const s = window.meridian; s.setSpeed(0); return s.w.time; });
    check(b > a, `new campaign: speed ${k}× did not move the clock`);
  }
  log('new campaign: speeds 1×, 2× and 3× move the clock');
  // Real time at the fastest speed for a few seconds.
  const t1 = await page.evaluate(() => { const s = window.meridian; s.w.settings.pauseOn = {}; s.setSpeed(4); return s.w.time; });
  await page.waitForTimeout(4000);
  const t2 = await page.evaluate(() => { const s = window.meridian; s.setSpeed(0); return s.w.time; });
  check(t2 > t1, 'new campaign: the clock did not run');
  log(`new campaign: top speed ran ${((t2 - t1) / 60).toFixed(1)} game hours in 4 seconds`);
  // A long advance (+1 day) the way the advance menu runs it, in chunks.
  await page.evaluate(() => { const s = window.meridian; s.jump(1440, 'a day'); });
  for (let i = 0; i < 30; i++) {
    await page.waitForFunction(() => !window.meridian.advRunning, null, { timeout: 180_000 });
    const left = await page.evaluate(() => { const s = window.meridian; if (s.w.life.advance) s.resumeAdvance(); return !!s.w.life.advance; });
    if (!left) break;
  }
  check(await page.evaluate(() => !window.meridian.w.life.advance), 'new campaign: the long advance never finished');
  check(await liveDays(page, 2), 'new campaign: time did not advance two days');
  log('new campaign: lived three days');
  // Skip a year: statistical, a month at a time; it should finish in seconds and end with the year's summary.
  const s0 = await page.evaluate(() => { const s = window.meridian; s.startAdvance(s.w.time + 365 * 1440, 'a year from now', true); return s.w.time; });
  const t0 = Date.now();
  await page.waitForFunction(() => !window.meridian.w.life.advance && !window.meridian.advRunning, null, { timeout: 120_000 });
  const skip = await page.evaluate(() => { const s = window.meridian; return { t: s.w.time, summary: !!s.w.life.period }; });
  check(skip.t - s0 >= 364 * 1440 && skip.summary, `new campaign: skipping a year did not finish (${JSON.stringify(skip)})`);
  log(`new campaign: skipped a year in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.evaluate(() => { const s = window.meridian; delete s.w.life.period; s.emit(); });
  await everyScreen(page, 'new campaign');
  // Story windows would cover the page from here on.
  await page.evaluate(() => { const s = window.meridian; s.w.story.settings.frequency = 'off'; for (const i of Object.values(s.w.story.instances)) if (i.status === 'offered' || i.status === 'active') i.status = 'declined'; s.emit(); });
  await backAndForward(page);
  await sorting(page);
  // A conversation with someone in the neighbourhood, if anyone is free to talk.
  await page.evaluate(() => window.meridian.go('local'));
  await page.waitForTimeout(200);
  const talk = page.locator('.person .btn:has-text("Talk"):not([disabled])');
  if (await talk.count()) {
    await talk.first().click();
    await page.waitForSelector('.convo .choice', { timeout: 10_000 });
    const bye = page.locator('.convo .choice:has-text("goodbye")');
    if (await bye.count()) await bye.first().click();
    log('new campaign: talked to a neighbour');
  }
  // Family life: adopt a cat on the Life screen (with the money for it).
  await page.evaluate(() => { const s = window.meridian; s.go('life'); });
  await page.waitForTimeout(200);
  const healthTab = page.locator('.life-tabs button:has-text("Health")');
  if (await healthTab.count()) { await healthTab.first().click(); await page.waitForTimeout(150); }
  const adopt = page.locator('.btn:has-text("Adopt a cat"):not([disabled])');
  if (await adopt.count()) {
    await adopt.first().click();
    await page.waitForTimeout(200);
    check(await page.locator('text=No pets.').count() === 0, 'new campaign: the adopted cat is not on the Life screen');
    log('new campaign: adopted a cat');
  }
  const hobby = page.locator('.btn:has-text("Try it"):not([disabled])');
  if (await hobby.count()) {
    await hobby.first().click();
    await page.waitForTimeout(200);
    check(await page.evaluate(() => Object.keys(window.meridian.w.citizens[window.meridian.w.playerId].life?.hobbies ?? {}).length > 0), 'new campaign: trying a hobby did nothing');
    log('new campaign: tried a hobby');
  }
  const pets = await page.evaluate(() => window.meridian.w.life.pets.length);
  await saveReloadContinue(page, 'new campaign');
  check(await page.evaluate(() => window.meridian.w.life.pets.length) >= pets, 'new campaign: pets were lost on reload');
  check(await liveDays(page, 1), 'new campaign: time did not advance after reloading');
  await page.close();

  // 3. Straight from disk, as the web download is played.
  const disk = await browser.newPage();
  await watch(disk, 'file://');
  await disk.goto(`file://${ROOT}/index.html`);
  await disk.waitForSelector('text=Start campaign');
  check((await disk.textContent('h1')).includes('MERIDIAN REACH'), 'file://: the title screen did not draw');
  await disk.click('.start-footer .linkish');
  await disk.waitForSelector('.modal.whatsnew', { timeout: 5_000 });
  check((await disk.textContent('.modal.whatsnew')).includes(VERSION), "file://: What's new does not open from the title screen");
  await disk.click('.modal.whatsnew button:has-text("Got it")');
  log("file://: the title screen draws, and What's new opens from it");
} catch (e) {
  errors.push(`smoke test stopped: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.close();
}

if (errors.length) {
  console.error(`\n✗ The build is not ready to release (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
  for (const e of [...new Set(errors)].slice(0, 40)) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`\n✓ ${VERSION} plays in a browser${PREV ? ', and games saved by the previous release load in it' : ''}.`);
