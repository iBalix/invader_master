/**
 * Capture la transition verticale entre Home -> Menu (frame intermediaire).
 *
 * On charge la home puis on clique sur "Voir la carte", et on capture
 * juste apres le clic pour voir l'etat "tiroir mid-air" (motion.div en
 * cours de translation).
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE = 'http://localhost:5173';
const HOSTNAME = 'TABLE01-1';

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  console.log('> Loading home...');
  await page.goto(`${BASE}/table/home?hostname=${HOSTNAME}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'transition-0-home.png') });
  console.log('  saved transition-0-home.png');

  console.log('> Click on "CARTE"...');
  // On clique le lien vers /table/menu
  const clickPromise = page.click('a[href="/table/menu"]');

  // pendant la transition (~550ms), on capture quelques frames
  const frames = [120, 280, 450, 620, 900];
  for (let i = 0; i < frames.length; i++) {
    await page.waitForTimeout(i === 0 ? frames[0] : frames[i] - frames[i - 1]);
    const file = path.join(OUT, `transition-${i + 1}-mid.png`);
    await page.screenshot({ path: file });
    console.log(`  saved ${path.basename(file)} at ~${frames[i]}ms`);
  }

  await clickPromise.catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'transition-final-menu.png') });
  console.log('  saved transition-final-menu.png');

  await browser.close();
})();
