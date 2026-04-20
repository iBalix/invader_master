/**
 * Benchmark perf des 4 ecrans tables tactiles.
 *
 * Mesure pour chaque page :
 *   - FPS moyen sur 5 secondes (via requestAnimationFrame counter)
 *   - JS heap usedJSHeapSize (Mo)
 *   - Long tasks count (PerformanceObserver)
 *   - Layer count approx (composited layers via element count avec backdrop-filter, transform, etc.)
 *   - Animations infinies actives (count des elements avec animation)
 *
 * Usage (depuis invader_master/) :
 *   node scripts/perf-tables.js
 */

const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const HOSTNAME = 'TABLE01-1';
const SAMPLE_MS = 5000;

const PAGES = [
  { name: 'screensaver', url: `/table/screensaver?hostname=${HOSTNAME}` },
  { name: 'home', url: `/table/home?hostname=${HOSTNAME}` },
  { name: 'menu', url: `/table/menu?hostname=${HOSTNAME}` },
  { name: 'games', url: `/table/games?hostname=${HOSTNAME}` },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('pageerror', (err) => console.error('  [pageerror]', err.message));

  console.log('\n=== PERF BENCH ===');
  console.log(`viewport 1920x1080 / sample ${SAMPLE_MS}ms par page\n`);

  for (const { name, url } of PAGES) {
    const full = BASE + url;
    try {
      await page.goto(full, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      const result = await page.evaluate(async (sampleMs) => {
        return await new Promise((resolve) => {
          let frames = 0;
          const longTasks = [];
          let observer = null;
          try {
            observer = new PerformanceObserver((list) => {
              for (const e of list.getEntries()) longTasks.push(e.duration);
            });
            observer.observe({ entryTypes: ['longtask'] });
          } catch {}

          const start = performance.now();
          function tick() {
            frames++;
            if (performance.now() - start < sampleMs) {
              requestAnimationFrame(tick);
            } else {
              if (observer) observer.disconnect();
              const elapsed = performance.now() - start;
              const fps = (frames * 1000) / elapsed;

              // detection heuristique
              const all = document.querySelectorAll('*');
              let withBackdrop = 0;
              let withInfiniteAnim = 0;
              let withBoxShadow = 0;
              for (const el of all) {
                const cs = getComputedStyle(el);
                if (cs.backdropFilter && cs.backdropFilter !== 'none') withBackdrop++;
                if (
                  cs.animationIterationCount === 'infinite' &&
                  cs.animationName !== 'none'
                ) {
                  withInfiniteAnim++;
                }
                if (cs.boxShadow && cs.boxShadow !== 'none') withBoxShadow++;
              }

              const mem = performance.memory
                ? {
                    usedMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
                    totalMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1),
                  }
                : null;

              resolve({
                fps: +fps.toFixed(1),
                frames,
                elapsedMs: Math.round(elapsed),
                longTasksCount: longTasks.length,
                longTasksTotalMs: Math.round(
                  longTasks.reduce((a, b) => a + b, 0)
                ),
                withBackdrop,
                withInfiniteAnim,
                withBoxShadow,
                mem,
                domNodes: all.length,
              });
            }
          }
          requestAnimationFrame(tick);
        });
      }, SAMPLE_MS);

      console.log(`> ${name.padEnd(12)} fps=${String(result.fps).padStart(5)}` +
        `  long-tasks=${String(result.longTasksCount).padStart(2)} (${result.longTasksTotalMs}ms)` +
        `  heap=${result.mem ? result.mem.usedMB + 'MB' : 'n/a'}` +
        `  dom=${result.domNodes}` +
        `  backdrop=${result.withBackdrop}` +
        `  anim-inf=${result.withInfiniteAnim}` +
        `  box-shadow=${result.withBoxShadow}`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  await browser.close();
  console.log('');
})();
