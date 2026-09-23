import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Compare identical GDOC navigation in two running dev builds, serially on the same GPU.
const input = process.argv[2];
assert.ok(input, 'Pass an absolute GDOC path');
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-performance-comparison';
await mkdir(output, { recursive: true });
const results = [];
for (let sample = 0; sample < Number(process.env.GPU_TEXT_SAMPLES ?? 3); sample++) {
  for (const [name, url] of [
    ['before', process.env.GPU_TEXT_BASELINE_URL],
    ['after', process.env.GPU_TEXT_URL]
  ]) {
    assert.ok(url, 'Set GPU_TEXT_BASELINE_URL and GPU_TEXT_URL to running dev builds');
    const browser = await chromium.launch({
      channel: process.env.GPU_TEXT_BROWSER_CHANNEL ?? 'chrome',
      headless: true,
      args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
    });
    try {
      const page = await browser.newPage({ viewport: { width: 2500, height: 1600 }, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.text().startsWith('NAV')) console.log(name, message.text());
      });
      await page.route('**/comparison.gdoc', (route) => route.fulfill({ path: input }));
      await page.route('**/comparison-check', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' })
      );
      await page.goto(`${url}/comparison-check`);
      const timeout = setTimeout(() => void page.close(), 180000);
      try {
        const result = await page.evaluate(async () => {
          const { prepareCorpusNavigation } = await import('/tests/performance/corpusHarness.ts');
          const started = performance.now();
          const navigation = await prepareCorpusNavigation('/comparison.gdoc');
          const preparationMs = performance.now() - started;
          const scenarios = [];
          for (const [name, zoom] of [
            ['overview', navigation.overviewZoom],
            ['page', 0.65],
            ['overview-return', navigation.overviewZoom]
          ]) {
            scenarios.push(await navigation.measure(name, zoom, 45));
          }
          navigation.destroy();
          return { preparationMs, pages: navigation.pages, scenarios };
        });
        results.push({ sample, name, browser: browser.version(), ...result, errors });
        await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
        console.log(JSON.stringify(results.at(-1), null, 2));
        assert.deepEqual(errors, []);
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      await browser.close();
    }
  }
}
