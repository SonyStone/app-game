import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/**
 * End-to-end smoke test of the editor UI in headless Chromium with WebGPU: panels, keyboard shortcuts, a mouse stroke
 * with undo/redo, and a switch from the worker to the main-thread engine that keeps the drawing (undo history is
 * per engine session and does not survive the switch).
 *
 *   node tests/browser/studio.browser.mjs
 *
 * Starts its own Vite dev server on a free port unless `PAINT_URL` points at a running one. Every run uses a fresh
 * browser profile, so it never touches drawings saved by the app on `localhost`. Exits non-zero on the first failed
 * step, on an uncaught page error or on a console error.
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = process.env.PAINT_URL ? undefined : await startServer();
const baseURL = process.env.PAINT_URL ?? server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  channel: process.env.PAINT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const pageErrors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      pageErrors.push(`console.error: ${message.text()}`);
    }
  });
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  await page.goto(`${baseURL}/`);
  await waitForSaved(page);

  await step('zoom buttons change the zoom level', async () => {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    assert.equal(await page.getByRole('button', { name: 'Reset zoom' }).textContent(), '125%');
    await page.getByRole('button', { name: 'Reset zoom' }).click();
    assert.equal(await page.getByRole('button', { name: 'Reset zoom' }).textContent(), '100%');
  });

  await step('an empty layer opacity entry keeps the layer, and Escape closes the panel', async () => {
    await page.getByRole('button', { name: 'Layers' }).click();
    const opacity = page.getByLabel('Layer opacity');
    await opacity.fill('');
    await opacity.dispatchEvent('change');
    assert.equal(await opacity.inputValue(), '100');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#paint-panel').count(), 0);
  });

  await step('tool shortcuts ignore modifiers', async () => {
    const pressed = (name) => page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed');
    await page.keyboard.press('l');
    assert.equal(await pressed('Lasso'), 'true');
    await page.keyboard.press('Alt+b');
    assert.equal(await pressed('Lasso'), 'true');
    await page.keyboard.press('b');
    assert.equal(await pressed('Brush'), 'true');
  });

  await step('a mouse stroke can be undone and redone', async () => {
    const undo = page.getByRole('button', { name: 'Undo' });
    const redo = page.getByRole('button', { name: 'Redo' });
    assert.equal(await undo.isDisabled(), true);
    await stroke(page);
    await waitForSaved(page);
    await waitEnabled(undo);
    await undo.click();
    await waitEnabled(redo);
    await redo.click();
    await waitEnabled(undo);
    assert.equal(await redo.isDisabled(), true);
  });

  await step('switching to the main-thread engine keeps the drawing', async () => {
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await page.getByRole('button', { name: 'Developer' }).click();
    // The checkbox follows the running engine, so it stays checked until the switch completes.
    await page.getByLabel('Web Worker + OffscreenCanvas').click();
    await page.waitForURL(/paintThread=main/);
    await page.getByRole('button', { name: 'Close developer tools' }).click();
    await waitForSaved(page);
    // Undo history belongs to one engine session; the replacement restores the saved drawing, so the empty-canvas
    // hint stays hidden.
    assert.equal(await page.getByText('Pen to draw. Touch to move.').count(), 0);
  });

  assert.deepEqual(pageErrors, [], 'The page reported errors.');
  console.log('Studio UI smoke test passed.');
} catch (error) {
  console.error(error);
  if (pageErrors.length) {
    console.error(pageErrors.join('\n'));
  }

  process.exitCode = 1;
} finally {
  await browser.close();
  await server?.close();
}

/** Runs one named check and prefixes its failure with the name. */
async function step(name, check) {
  try {
    await check();
    console.log(`PASS ${name}`);
  } catch (error) {
    throw new Error(`FAIL ${name}: ${error.message}`, { cause: error });
  }
}

/** Waits until the engine is ready and has no pending changes. */
function waitForSaved(page) {
  return page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor({ timeout: 30_000 });
}

/** Waits until a button reflects an engine state change. */
function waitEnabled(button) {
  return button.and(button.page().locator(':enabled')).waitFor({ timeout: 10_000 });
}

/** Draws a short diagonal stroke with the mouse in the middle of the canvas. */
async function stroke(page) {
  const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x + i * 12, y + i * 6);
  }

  await page.mouse.up();
}

/** A dev server without file watching, so edits made during the run never reload the page. */
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
