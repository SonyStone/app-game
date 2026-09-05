import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pageFixture =
  '<title>Spector regression page</title><iframe src="/frame"></iframe><iframe src="/frame"></iframe>';
const frameFixture = `<canvas id="scene" width="320" height="240"></canvas><script>
  window.gl = document.querySelector('canvas').getContext('webgl2');
  window.draw = () => { gl.clearColor(0.2, 0.6, 0.8, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  draw();
</script>`;

// Uses real extension messaging, MAIN-world injection and WebGL in an isolated profile.
// Only the DevTools-provided tab ID/theme are supplied to the standalone panel page.
const profile = await mkdtemp(join(tmpdir(), 'spector-browser-'));
const artifacts = await mkdtemp(join(tmpdir(), 'spector-evidence-'));
const extension = fileURLToPath(new URL('../dist-extension', import.meta.url));
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(request.url === '/frame' ? frameFixture : pageFixture);
});
let context;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1300, height: 700 }
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const inspected = await context.newPage();
  await inspected.goto(`http://127.0.0.1:${server.address().port}/`);
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.title === 'Spector regression page').id;
  });
  const panel = await context.newPage();
  const errors = [];
  panel.on('pageerror', (error) => errors.push(error.message));
  await panel.addInitScript(
    ({ tabId }) => {
      chrome.devtools = { inspectedWindow: { tabId }, panels: { themeName: 'dark', setThemeChangeHandler() {} } };
    },
    { tabId }
  );
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
  await expect(panel.locator('.canvas-row')).toHaveCount(2);
  await expect(panel.locator('.canvas-row.selected')).toHaveCount(1);
  await panel.screenshot({ path: join(artifacts, '01-canvases.png') });

  await capture();
  await expect(panel.getByRole('button', { name: 'Commands (2)', exact: true })).toBeVisible();
  await panel.setViewportSize({ width: 900, height: 650 });
  assert.equal(
    await panel
      .locator('header')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height),
    42
  );
  assert.notEqual(await panel.evaluate(() => document.elementFromPoint(450, 300)?.tagName), 'HEADER');
  await panel.screenshot({ path: join(artifacts, '02-results.png') });
  await closeResults();

  await panel.setViewportSize({ width: 680, height: 650 });
  await expect(panel.getByRole('button', { name: 'Captures (1)', exact: true })).toBeVisible();
  const previousDocuments = await worker.evaluate(
    async (tabId) => (await chrome.webNavigation.getAllFrames({ tabId })).map((frame) => frame.documentId),
    tabId
  );
  await inspected.reload();
  await expect
    .poll(async () => {
      const next = await worker.evaluate(
        async (tabId) => (await chrome.webNavigation.getAllFrames({ tabId })).map((frame) => frame.documentId),
        tabId
      );
      return next.every((id) => !previousDocuments.includes(id));
    })
    .toBe(true);
  await expect(panel.locator('.canvas-row')).toHaveCount(2);
  await expect(panel.getByRole('button', { name: 'Capture next frame', exact: true })).toBeEnabled();
  await capture();
  await expect(panel.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
  await closeResults();
  await expect(panel.getByRole('button', { name: 'Captures (2)', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Captures (2)', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(`Browser regressions passed. Screenshots: ${artifacts}`);

  async function capture() {
    await panel.getByRole('button', { name: 'Capture next frame', exact: true }).click();
    await expect(panel.getByText(/Waiting for WebGL activity/)).toBeVisible();
    await inspected.frames()[1].evaluate(() => window.draw());
  }

  async function closeResults() {
    await panel.getByRole('button', { name: 'Menu', exact: true }).click();
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
  }
} finally {
  await context?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
