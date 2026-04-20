/**
 * Capture screenshots des 4 ecrans tables tactiles en 1920x1080.
 *
 * Usage (depuis invader_master/) :
 *   node scripts/capture-tables.js
 *
 * Necessite :
 *   - frontend+backend lances en local
 *   - playwright installe (npx playwright install chromium)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE = 'http://localhost:5173';
const HOSTNAME = 'TABLE01-1';

const PAGES = [
  { name: 'screensaver', url: `/table/screensaver?hostname=${HOSTNAME}` },
  { name: 'home', url: `/table/home?hostname=${HOSTNAME}` },
  { name: 'menu', url: `/table/menu?hostname=${HOSTNAME}` },
  { name: 'games', url: `/table/games?hostname=${HOSTNAME}` },
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.error('  [pageerror]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [console.error]', msg.text());
  });

  for (const { name, url } of PAGES) {
    const full = BASE + url;
    console.log(`> ${name} -> ${full}`);
    try {
      await page.goto(full, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1800);
      const file = path.join(OUT, `table-${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`  saved -> ${file}`);

      const metrics = await page.evaluate(() => {
        const de = document.documentElement;
        const body = document.body;
        const layout = document.querySelector('[class*="bg-table-bg"]');
        return {
          vw: window.innerWidth,
          vh: window.innerHeight,
          docScrollH: de.scrollHeight,
          docScrollW: de.scrollWidth,
          bodyScrollH: body.scrollHeight,
          bodyScrollW: body.scrollWidth,
          layoutBg: layout ? getComputedStyle(layout).backgroundColor : null,
          layoutInk: layout ? getComputedStyle(layout).color : null,
        };
      });
      const vScroll = metrics.docScrollH > metrics.vh + 2;
      const hScroll = metrics.docScrollW > metrics.vw + 2;
      console.log(
        `  metrics: viewport=${metrics.vw}x${metrics.vh}  doc=${metrics.docScrollW}x${metrics.docScrollH}  vScroll=${vScroll}  hScroll=${hScroll}`
      );
      console.log(`  colors : bg=${metrics.layoutBg}  ink=${metrics.layoutInk}`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  await browser.close();
})();
