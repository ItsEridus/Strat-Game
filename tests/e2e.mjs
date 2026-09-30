// Browser smoke test: node tests/e2e.mjs [outdir]. Clicks through every screen,
// fast-forwards the world, and reports console errors.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.argv[2] || 'build/shots';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto('file://' + process.cwd() + '/index.html');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.screenshot({ path: `${out}/00-start.png` });
await page.fill('.form input[type=number]', '7');
await page.click('text=Start campaign');
await page.waitForSelector('.topbar');
async function tour(prefix) {
  const navs = await page.$$eval('.nav button', (els) => els.map((e) => e.getAttribute('data-id') || e.textContent.trim()));
  let i = 1;
  for (const label of navs) {
    const text = label.replace(/\d+$/, '').trim();
    await page.click(`.nav button:has-text("${text}")`);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/${prefix}${String(i++).padStart(2, '0')}-${text.replace(/[^a-z]/gi, '').slice(0, 18)}.png`, fullPage: true });
  }
  return navs.length;
}
const n1 = await tour('a');
// Play at top speed briefly, then jump 45 days through the event-based advance API.
await page.click('.speeds button:nth-child(5)');
await page.waitForTimeout(1500);
await page.click('.speeds button:nth-child(1)');
const t0 = Date.now();
const stops = await page.evaluate(() => {
  // Critical alerts (e.g. an attack on your nation) stop an advance; keep going like a player pressing play again.
  const s = window.meridian; s.w.settings.pauseOn = {};
  const end = s.w.time + 45 * 1440, reasons = [];
  for (let i = 0; i < 20 && s.w.time < end; i++) { s.jumpTo(end); if (s.w.time < end) reasons.push(s.pauseReason); }
  return reasons;
});
if (stops.length) console.log('advance paused for:', stops.join(' | '));
console.log('45-day jump took', Date.now() - t0, 'ms');
const n2 = await tour('b');
console.log('clock:', await page.textContent('.clock b'));
console.log('screens:', n1, n2, 'errors:', errors.length ? errors.slice(0, 10) : 'none');
await b.close();
