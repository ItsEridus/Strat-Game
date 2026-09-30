// Browser smoke test: node tests/e2e.mjs [outdir]. Clicks through every screen and reports console errors.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'build/shots';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
await page.goto('file://' + process.cwd() + '/index.html');
await page.screenshot({ path: `${out}/00-start.png` });
await page.click('text=Start campaign');
await page.waitForSelector('.topbar');
const navs = await page.$$eval('.nav button', (els) => els.map((e) => e.textContent.trim()));
let i = 1;
for (const label of navs) {
  await page.click(`.nav button:has-text("${label.replace(/\d+$/, '').trim()}")`);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${out}/${String(i++).padStart(2, '0')}-${label.replace(/[^a-z]/gi, '').slice(0, 20)}.png`, fullPage: true });
}
// play a few simulated hours at top speed, then advance a day
await page.click('.speeds button:nth-child(5)');
await page.waitForTimeout(2500);
await page.click('.speeds button:nth-child(1)');
await page.click('.nav button:has-text("Dashboard")');
await page.screenshot({ path: `${out}/99-after-run.png`, fullPage: true });
console.log('clock:', await page.textContent('.clock b'));
console.log('screens:', navs.length, 'errors:', errors.length ? errors.slice(0, 10) : 'none');
await b.close();
