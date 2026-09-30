// Captures the README screenshots: node tools/screenshots.mjs (needs Playwright:
// PLAYWRIGHT_PATH=$(npm root -g)/playwright). Plays a seeded campaign for 60
// days, then photographs the main screens into docs/screenshots/.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = 'docs/screenshots';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + process.cwd() + '/index.html');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.screenshot({ path: `${out}/start.png` });
await page.fill('.form input[type=number]', '2024');
await page.click('text=Start campaign');
await page.waitForSelector('.topbar');
// Live a while: the world plays itself (wars, elections, crises) while the player works.
await page.evaluate(() => {
  const s = window.meridian;
  s.w.settings.pauseOn = {};
  const end = s.w.time + 60 * 1440;
  for (let i = 0; i < 40 && s.w.time < end; i++) s.jumpTo(end);
  s.w.player.encounter = null; s.w.player.nextEncounter = 1e12; s.emit();
});
const shot = async (nav, file, prep, full = false) => {
  await page.click(`.nav button:has-text("${nav}")`);
  if (prep) await prep();
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.scrollTo(0, 0); for (const e of document.querySelectorAll('*')) if (e.scrollTop) e.scrollTop = 0; });
  await page.mouse.move(1435, 895);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/${file}.png`, fullPage: full });
};
const mapTo = async (region, mode, zoom) => {
  await page.evaluate(([region, mode]) => { const s = window.meridian; const r = s.w.regions.find((x) => x.name === region); s.go('map', { region: r.id, mapMode: mode }); }, [region, mode]);
  await page.waitForTimeout(150);
  if (zoom) await page.click('.map-controls button[title="Selected region"]');
};
await shot('World Map', 'map-world', () => mapTo('District of Columbia', 'political', false));
await shot('World Map', 'map-states', () => mapTo('Texas', 'government', true));
await shot('World Map', 'map-military', async () => { await mapTo('Tokyo', 'military', false); await page.click('.map-controls button[title="Whole world"]'); });
await shot('Dashboard', 'dashboard');
await shot('Armed Forces', 'armed-forces');
await shot('Rankings', 'rankings');
await shot('Law & Order', 'law-and-order');
await shot('Intelligence', 'intelligence');
await shot('World Situation', 'world-situation');
await shot('Neighbourhood', 'neighbourhood');
// A conversation with a local.
await page.evaluate(() => { const s = window.meridian; s.w.player.encounter = null; s.emit(); });
await page.click('.person .btn:has-text("Talk")');
for (const label of ['How is life', 'Heard anything']) { const c = page.locator(`.convo .choice:has-text("${label}")`); if (await c.count()) await c.first().click(); await page.waitForTimeout(100); }
await page.mouse.move(1435, 895);
await page.screenshot({ path: `${out}/conversation.png` });
await page.click('.convo .choice:has-text("Say goodbye")');
// A situation that needs a decision.
await page.evaluate(() => { const s = window.meridian; s.w.settings.pauseOn = { encounter: true }; s.w.player.nextEncounter = s.w.time; for (let i = 0; i < 72 && !s.w.player.encounter; i++) s.jump(60); s.emit(); });
await page.waitForTimeout(200);
await page.mouse.move(1435, 895);
await page.screenshot({ path: `${out}/encounter.png` });
await page.evaluate(() => { const s = window.meridian; s.w.player.encounter = null; s.emit(); });
await shot('Country', 'country', null);
await shot('Goods Market', 'market');
console.log(errors.length ? `errors: ${errors.join('; ')}` : 'screenshots saved, no errors');
await b.close();
