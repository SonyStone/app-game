import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Production UI: cold browser per sample, optional PDF import, main-thread long tasks and GPU fence.
const input = process.argv[2];
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-startup-comparison';
await mkdir(output, { recursive: true });
const results = [];
for (let sample = 0; sample < Number(process.env.GPU_TEXT_SAMPLES ?? 3); sample++) {
  for (const [name, url] of [
    ['before', process.env.GPU_TEXT_BASELINE_URL],
    ['after', process.env.GPU_TEXT_URL]
  ]) {
    assert.ok(url, 'Set both production preview URLs');
    const browser = await chromium.launch({
      channel: process.env.GPU_TEXT_BROWSER_CHANNEL ?? 'chrome',
      headless: true,
      args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors = [];
      const requests = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => requests.push(request.url().split('/').at(-1)));
      await page.addInitScript(() => {
        window.longTasks = [];
        new PerformanceObserver((list) =>
          window.longTasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })))
        ).observe({ type: 'longtask', buffered: true });
        const request = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = async function (...args) {
          window.measuredDevice = await request.apply(this, args);
          return window.measuredDevice;
        };
      });
      await page.goto(url);
      await page.waitForFunction(
        () => document.querySelector('output')?.textContent?.startsWith('TypeGPU'),
        undefined,
        { timeout: 60000 }
      );
      const demo = await page.evaluate(() => ({
        readyMs: performance.now(),
        message: document.querySelector('output').textContent,
        longTasks: [...window.longTasks]
      }));
      let pdf;
      if (input) {
        const started = await page.evaluate(() => performance.now());
        await page.locator('input[type=file]').setInputFiles(input);
        await page.waitForFunction(
          () => document.querySelector('output')?.textContent?.startsWith('TypeGPU'),
          undefined,
          { timeout: 300000 }
        );
        pdf = await page.evaluate(async (started) => {
          const readyMs = performance.now() - started;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          await measuredDevice.queue.onSubmittedWorkDone();
          return {
            readyMs,
            frameCompleteMs: performance.now() - started,
            message: document.querySelector('output').textContent,
            longTasks: window.longTasks.filter((e) => e.start >= started)
          };
        }, started);
      }
      assert.deepEqual(errors, []);
      results.push({ sample, name, browser: browser.version(), demo, pdf, requests });
      await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
      console.log(JSON.stringify(results.at(-1)));
    } finally {
      await browser.close();
    }
  }
}
