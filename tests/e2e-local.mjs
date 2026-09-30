// Browser check of the lived-in world: node tests/e2e-local.mjs [outdir]
// Starts a full-size campaign, visits the Neighbourhood, talks to someone,
// canvasses, meets an encounter, opens the admin panel, saves and reloads.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.argv[2] || 'build/local';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto('file://' + process.cwd() + '/index.html');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.fill('.form input[type=number]', '2024');
let t = Date.now();
await page.click('text=Start campaign');
await page.waitForSelector('.topbar', { timeout: 60000 });
console.log('generated in', Date.now() - t, 'ms');
await page.evaluate(() => { const s = window.meridian; s.w.story.settings.frequency = 'off'; for (const i of Object.values(s.w.story.instances)) if (i.status === 'offered' || i.status === 'active') i.status = 'declined'; s.emit(); s.jump(12 * 60); });
await page.click('.nav button:has-text("Neighbourhood")');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/1-neighbourhood.png` });
await page.click('.person .btn:has-text("Talk")');
await page.waitForSelector('.convo');
for (const label of ['How is life', 'Heard anything', 'What do you make']) {
  const c = page.locator(`.convo .choice:has-text("${label}")`);
  if (await c.count()) await c.first().click();
  await page.waitForTimeout(80);
}
await page.screenshot({ path: `${out}/2-conversation.png` });
await page.click('.convo .choice:has-text("Say goodbye")');
await page.click('text=Canvass door to door');
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/3-canvass.png` });
// Let an encounter happen.
const got = await page.evaluate(() => { const s = window.meridian; s.w.story.settings.frequency = 'normal'; s.w.settings.pauseOn = { encounter: true }; s.w.story.nextAmbient = s.w.time; const open = () => Object.values(s.w.story.instances).find((i) => i.status === 'offered'); for (let i = 0; i < 72 && !open(); i++) s.jump(60); s.emit(); return open()?.def ?? null; });
console.log('encounter:', got);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/4-encounter.png` });
if (got) { await page.locator('.enc-opt:not([disabled])').first().click(); await page.waitForTimeout(150); await page.screenshot({ path: `${out}/5-outcome.png` }); await page.click('.modal button:has-text("Continue")'); }
await page.evaluate(() => { const s = window.meridian; s.w.story.settings.frequency = 'off'; for (const i of Object.values(s.w.story.instances)) if (i.status === 'offered' || i.status === 'active') i.status = 'declined'; s.emit(); });
await page.click('.nav button:has-text("Journal")');
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/5b-journal.png` });
await page.keyboard.press('Control+Shift+A');
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/6-admin.png` });
t = Date.now();
await page.evaluate(() => window.meridian.save('slot1'));
console.log('saved in', Date.now() - t, 'ms');
await page.reload();
await page.waitForSelector('text=Continue');
t = Date.now();
await page.click('.slot:has-text("slot1") >> text=Load');
await page.waitForSelector('.topbar', { timeout: 60000 });
console.log('loaded in', Date.now() - t, 'ms');
console.log(errors.length ? errors.join('\n') : 'no errors');
await b.close();
