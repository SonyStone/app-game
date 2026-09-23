import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Isolate browser scheduling from PDF/GPU cost; only our temporary tab is changed.
const endpoint = process.env.GPU_TEXT_CDP ?? 'http://127.0.0.1:9224';
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-browser-refresh';
const browser = await chromium.connectOverCDP(endpoint);
const page = await browser.contexts()[0].newPage();
const timeout = setTimeout(() => void page.close(), 30_000);
try {
  await page.route('**/refresh-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><button>Fullscreen</button><div id="marker" style="position:fixed;width:20px;height:20px;background:blue"></div>'
    })
  );
  await page.goto('http://localhost:3180/refresh-check');
  await page.evaluate(() => {
    document.querySelector('button').onclick = () => document.documentElement.requestFullscreen();
  });
  await page.bringToFront();
  const results = [];
  for (const fullscreen of [false, true]) {
    if (fullscreen) {
      await page.locator('button').click();
      await page.waitForFunction(() => !!document.fullscreenElement);
    }
    results.push(
      await page.evaluate(async () => {
        const lock = await navigator.wakeLock.request('screen');
        let interrupted = document.visibilityState !== 'visible';
        const onVisibility = () => {
          interrupted ||= document.visibilityState !== 'visible';
        };
        const onRelease = () => {
          interrupted = true;
        };
        document.addEventListener('visibilitychange', onVisibility);
        lock.addEventListener('release', onRelease);
        const intervals = [];
        let previous;
        for (let index = 0; index <= 240; index++) {
          const time = await new Promise(requestAnimationFrame);
          if (previous !== undefined) {
            intervals.push(time - previous);
          }
          previous = time;
          document.getElementById('marker').style.transform = `translateX(${index % 100}px)`;
        }
        document.removeEventListener('visibilitychange', onVisibility);
        lock.removeEventListener('release', onRelease);
        await lock.release();
        intervals.sort((a, b) => a - b);
        const mean = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
        return {
          fullscreen: !!document.fullscreenElement,
          uninterrupted: !interrupted,
          userAgent: navigator.userAgent,
          dpr: devicePixelRatio,
          medianMs: intervals[120],
          p95Ms: intervals[228],
          meanMs: mean,
          observedFps: 1000 / mean
        };
      })
    );
  }
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'refresh.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  assert.ok(
    results.every((result) => result.uninterrupted),
    'Screen/tab lost visibility; discard these measurements'
  );
} finally {
  clearTimeout(timeout);
  await page.close();
  await browser.close();
}
