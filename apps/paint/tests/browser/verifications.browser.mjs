import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { readAdobeBrushFixture } from '../../../../scripts/adobe-brush-fixture.mjs';

/**
 * Runs every real-GPU verification exported by `harness.ts` in headless Chromium with WebGPU.
 *
 *   node tests/browser/verifications.browser.mjs [name ...]
 *
 * Starts its own Vite dev server unless `PAINT_URL` points at a running one. Each verification runs in a fresh page;
 * it fails when it throws, when the page reports an uncaught error or a console error, or after
 * `PAINT_VERIFY_TIMEOUT_MS` (default 5 minutes). `PAINT_BROWSER_CHANNEL` selects an installed Chrome instead of
 * Playwright's Chromium. Per-verification logs and a JSON report are written outside the repository (`PAINT_OUTPUT`,
 * default `$TMPDIR/paint-verifications`). Exits non-zero when any verification fails.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const timeout = Number(process.env.PAINT_VERIFY_TIMEOUT_MS ?? 5 * 60 * 1000);
const output = process.env.PAINT_OUTPUT ?? path.join(os.tmpdir(), 'paint-verifications');
const requested = process.argv.slice(2);

await fs.mkdir(output, { recursive: true });
const server = process.env.PAINT_URL ? undefined : await startServer();
const baseURL = process.env.PAINT_URL ?? server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  channel: process.env.PAINT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const results = [];

try {
  const available = await withPage(async (page) => {
    await page.goto(`${baseURL}/tests/browser/harness.html`);
    await page.waitForFunction(() => window.paintVerifications);
    return page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();

      if (!adapter) {
        throw new Error('GPU verifications require a WebGPU adapter.');
      }

      return {
        names: Object.keys(window.paintVerifications),
        adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description }
      };
    });
  });
  if (!available.ok) {
    throw new Error(`Harness failed to load: ${[available.error, ...available.pageErrors].filter(Boolean).join('\n')}`);
  }

  const unknown = requested.filter((name) => !available.value.names.includes(name));

  if (unknown.length) {
    throw new Error(`Unknown verifications: ${unknown.join(', ')}. Available: ${available.value.names.join(', ')}`);
  }

  console.log(`WebGPU adapter: ${JSON.stringify(available.value.adapter)}`);

  for (const name of requested.length ? requested : available.value.names) {
    const started = performance.now();
    const result = await withPage(async (page) => {
      await page.goto(`${baseURL}/tests/browser/harness.html`);
      await page.waitForFunction(() => window.paintVerifications);
      return page.evaluate(async (name) => {
        const log = [];
        await window.paintVerifications[name]((message) => log.push(String(message)));
        return log;
      }, name);
    });
    const entry = {
      name,
      ok: result.ok,
      seconds: Math.round(performance.now() - started) / 1000,
      error: result.error,
      pageErrors: result.pageErrors,
      log: result.value ?? []
    };
    results.push(entry);
    await fs.writeFile(path.join(output, `${name}.log`), [...entry.log, ...(entry.error ? [`FAIL: ${entry.error}`] : [])].join('\n'));
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${name} (${entry.seconds}s)${entry.ok ? '' : `\n  ${[entry.error, ...entry.pageErrors].filter(Boolean).join('\n  ')}`}`);
  }
} finally {
  await browser.close();
  await server?.close();
}

await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
const failed = results.filter((result) => !result.ok);
console.log(`${results.length - failed.length}/${results.length} verifications passed. Logs: ${output}`);
process.exitCode = failed.length ? 1 : 0;

/**
 * Runs `action` in a fresh page with the pinned Adobe fixture served at `/__fixtures/`. Resolves with the action's value
 * and any uncaught page errors or console errors; the run is not `ok` if either occurred, it threw, or it timed out.
 */
async function withPage(action) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      pageErrors.push(`console.error: ${message.text()}`);
    }
  });
  page.on('crash', () => pageErrors.push('page crashed'));
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  await page.route('**/__fixtures/*.abr', async (route) =>
    route.fulfill({
      contentType: 'application/octet-stream',
      body: await readAdobeBrushFixture(path.basename(new URL(route.request().url()).pathname))
    })
  );

  let timer;
  try {
    const value = await Promise.race([
      action(page),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${timeout} ms`)), timeout);
      })
    ]);
    return { ok: pageErrors.length === 0, value, pageErrors };
  } catch (error) {
    return { ok: false, error: error.stack ?? String(error), pageErrors };
  } finally {
    clearTimeout(timer);
    await context.close();
  }
}

/** A dev server without file watching, so edits made while the suite runs never reload a page mid-verification. */
async function startServer() {
  const server = await createServer({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null }
  });
  await server.listen();
  return server;
}
