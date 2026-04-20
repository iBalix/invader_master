const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:5173/table/screensaver?hostname=TABLE01-1', {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const layoutRoot = document.querySelector('[class*="bg-table-bg"]');
    const body = document.body;
    const html = document.documentElement;
    return {
      bodyBg: getComputedStyle(body).backgroundColor,
      htmlBg: getComputedStyle(html).backgroundColor,
      layoutBg: layoutRoot ? getComputedStyle(layoutRoot).backgroundColor : null,
      layoutClass: layoutRoot ? layoutRoot.className : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
