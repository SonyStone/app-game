import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/**
 * End-to-end smoke test of the editor UI in headless Chromium with WebGPU: panels, keyboard shortcuts, a mouse stroke
 * with undo/redo, duplicating and renaming a layer, and a switch from the worker to the main-thread engine that keeps the drawing (undo history is
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

  await step('Ctrl+Alt drag resizes the brush with a HUD', async () => {
    const size = page.getByRole('button', { name: 'Brush settings' }).locator('small');
    assert.equal(await size.textContent(), '32');
    const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
    const x = box.x + box.width / 2 - 200,
      y = box.y + box.height / 2;
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 3 });
    await page.mouse.move(x + 120, y, { steps: 3 });
    await page.getByText('64 px · 100%').waitFor({ timeout: 5_000 });
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
    assert.equal(await size.textContent(), '32');
    assert.equal(await page.getByText(/ px · \d+%/).count(), 0);
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

  await step('a drawn layer can be duplicated, renamed, merged down and the steps undone', async () => {
    await page.getByRole('button', { name: 'Layers' }).click();
    const panel = page.getByRole('complementary', { name: 'Layers' });
    await panel.getByRole('button', { name: 'Duplicate layer' }).click();
    await panel.getByText('2 layers').waitFor({ timeout: 10_000 });
    const name = panel.getByLabel('Layer name');
    assert.equal(await name.inputValue(), 'Layer 1 copy');
    await name.fill('Inks');
    await name.press('Enter');
    await panel.getByRole('button', { name: 'Select Inks' }).waitFor({ timeout: 10_000 });
    await panel.getByRole('button', { name: 'Merge down' }).click();
    await panel.getByText('1 layer', { exact: true }).waitFor({ timeout: 10_000 });
    assert.equal(await panel.getByLabel('Layer name').inputValue(), 'Layer 1');
    await waitForSaved(page);
    await page.keyboard.press('Escape');
    // Undo the merge, the rename and the duplicate.
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.getByRole('button', { name: 'Layers' }).click();
    await panel.getByText('1 layer', { exact: true }).waitFor({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await waitForSaved(page);
  });

  await step('Alt-click and the canvas picker take the displayed color', async () => {
    const hex = () => page.getByLabel('Hex color').inputValue();
    /** The picked color arrives from the engine asynchronously; polls because rAF does not run in a hidden page. */
    const hexOtherThan = async (previous) => {
      await page.waitForFunction(
        (previous) => document.querySelector('input[aria-label="Hex color"]')?.value !== previous,
        previous,
        { polling: 100, timeout: 10_000 }
      );
      return hex();
    };
    await page.getByRole('button', { name: 'Color palette' }).click();
    await page.getByLabel('Hex color').fill('FF0000');
    await page.getByLabel('Hex color').press('Enter');
    assert.equal(await hex(), 'FF0000');
    await page.keyboard.press('Escape');

    // The stroke drawn earlier runs from the workspace center towards the lower right in black.
    const box = await page.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
    await page.keyboard.down('Alt');
    await page.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30);
    await page.keyboard.up('Alt');
    await page.getByRole('button', { name: 'Color palette' }).click();
    const stroke = await hexOtherThan('FF0000');
    const channels = (hex) => [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
    assert.ok(Math.max(...channels(stroke)) < 0x90, `expected the dark stroke color, got ${stroke}`);

    await page.getByRole('button', { name: 'Pick color from canvas' }).click();
    // Empty paper up and to the left of the stroke, clear of the toolbars along the edges.
    await page.mouse.click(box.x + box.width / 2 - 150, box.y + box.height / 2 - 100);
    await page.getByRole('button', { name: 'Color palette' }).click();
    const paper = await hexOtherThan(stroke);
    assert.ok(Math.min(...channels(paper)) > 0xe0, `expected the light paper color, got ${paper}`);
    await page.keyboard.press('Escape');
    await waitForSaved(page);
  });

  await step('the visible canvas exports as PNG', async () => {
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /Export visible canvas/ }).click()
    ]);
    assert.equal(download.suggestedFilename(), 'drawing-view.png');
    assert.equal(await page.getByRole('alert').count(), 0);
    await page.keyboard.press('Escape');
  });

  await step('switching to the main-thread engine keeps the drawing', async () => {
    await page.getByRole('button', { name: 'Drawing menu' }).click();
    await page.getByRole('button', { name: 'Developer' }).click();
    // The checkbox follows the running engine, so it stays checked until the switch completes.
    await page.getByLabel('Web Worker + OffscreenCanvas').click();
    await page.waitForURL(/paintThread=main/);
    await page.getByRole('button', { name: 'Close developer tools' }).click();
    // Undo history belongs to one engine session, so a disabled Undo shows that the replacement engine has reported
    // its own document state; until then the editor still shows the previous engine's state.
    const undo = page.getByRole('button', { name: 'Undo' });
    await undo.and(page.locator(':disabled')).waitFor({ timeout: 30_000 });
    await waitForSaved(page);
    // The replacement restored the saved drawing, so the empty-canvas hint stays hidden.
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
