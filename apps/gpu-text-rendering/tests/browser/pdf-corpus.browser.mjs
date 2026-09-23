import { chromium } from '@playwright/test';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// External corpus stays outside the repository. Only result metadata and screenshots are written to output.
const directory = process.argv[2];
if (!directory) {
  console.error('Usage: node tests/browser/pdf-corpus.browser.mjs <pdf-directory>');
  process.exit(1);
}

const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-pdf-corpus';
const url = process.env.GPU_TEXT_URL ?? 'http://localhost:3120/gpu-text-rendering';
const files = (await readdir(directory)).filter((name) => /\.pdf$/i.test(name)).sort();
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  const NativeWorker = window.Worker;
  window.documentJobs = [];
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      const job = { url: String(url), start: performance.now(), terminated: false };
      window.documentJobs.push(job);
      this.job = job;
      this.addEventListener('message', (event) => {
        job.elapsedMs = performance.now() - job.start;
        job.ok = event.data.ok;
        if (event.data.ok) {
          const value = event.data.value;
          job.result =
            value instanceof ArrayBuffer
              ? { bytes: value.byteLength }
              : { profile: value.kind, pages: value.pages?.length };
        } else {
          job.error = event.data.error;
        }
      });
    }
    terminate() {
      this.job.terminated = true;
      super.terminate();
    }
  };
});

const report = { url, files: [], pageErrors: errors };
try {
  await page.goto(url);
  await page.locator('input[type=file]').waitFor();
  await page.getByRole('checkbox', { name: 'Auto zoom', exact: true }).uncheck();
  for (const [index, name] of files.entries()) {
    const file = path.resolve(directory, name);
    const fileStat = await stat(file);
    await page.evaluate(() => {
      window.documentJobs = [];
    });
    const started = Date.now();
    await page.locator('input[type=file]').setInputFiles(file);
    await page.getByText(name, { exact: true }).waitFor();
    await page.waitForFunction(
      () => document.querySelector('#beziercanvas')?.getAttribute('aria-busy') === 'false',
      undefined,
      { timeout: 75_000 }
    );
    await page.waitForFunction(
      () => Boolean(document.querySelector('[role=alert]')) || window.documentJobs.every((job) => job.terminated),
      undefined,
      { timeout: 60_000 }
    );
    const terminal = await page.evaluate(() => ({
      message: document.querySelector('output')?.textContent,
      failed: Boolean(document.querySelector('[role=alert]')),
      jobs: window.documentJobs
    }));
    const result = { name, bytes: fileStat.size, elapsedMs: Date.now() - started, ...terminal };
    await page.screenshot({ path: `${output}/${index + 1}-viewer.png` });
    if (!terminal.failed) {
      const download = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Download GDOC' }).click();
      await (await download).saveAs(`${output}/${index + 1}.gdoc`);
      await page.locator('input[type=file]').setInputFiles(`${output}/${index + 1}.gdoc`);
      await page.waitForFunction(
        () =>
          document.querySelector('#beziercanvas')?.getAttribute('aria-busy') === 'false' &&
          window.documentJobs.every((job) => job.terminated),
        undefined,
        { timeout: 60_000 }
      );
      result.reopened = !(await page.locator('[role=alert]').count());
      result.failed ||= !result.reopened;
    }
    report.files.push(result);
    await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(result));
  }
  await page.getByRole('button', { name: 'Back to demo' }).click();
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'), undefined, {
    timeout: 60_000
  });
  report.demoRecovered = true;
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  process.exitCode = report.files.some((file) => file.failed) || errors.length > 0 ? 1 : 0;
} finally {
  await browser.close();
}
