import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/**
 * Live broadcasting end to end in headless Chromium: a dev server, the local Bun relay on port 3121, an author who
 * draws, goes live and draws again, and a viewer in another browser context who opens the watch link and must show
 * both strokes where the author's view has them, and the author's pointer.
 *
 *   node tests/browser/live.browser.mjs
 */
const root = fileURLToPath(new URL('../../', import.meta.url));
const liveRoot = path.join(root, '../../packages/paint-live');
// The binary itself: pnpm's `.bin/bun` shell shim would be the one killed, leaving Bun running.
const relay = spawn(path.join(liveRoot, 'node_modules/bun/bin/bun.exe'), ['src/serve.ts'], {
  cwd: liveRoot,
  stdio: ['ignore', 'pipe', 'inherit']
});
await new Promise((resolve) => relay.stdout.once('data', resolve));
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null }
});
await server.listen();
const baseURL = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const errors = [];

try {
  const author = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  author.on('pageerror', (error) => errors.push(`author: ${error.message}`));
  await author.goto(`${baseURL}/`);
  await saved(author);
  const workspace = await author.getByRole('main', { name: 'Drawing workspace' }).boundingBox();
  const cx = workspace.x + workspace.width / 2,
    cy = workspace.y + workspace.height / 2;
  await stroke(author, cx - 200, cy - 100, cx - 60, cy - 100);

  await author.getByRole('button', { name: 'Drawing menu' }).click();
  await author.getByRole('button', { name: 'Go live' }).click();
  const menu = author.getByLabel('Drawing', { exact: true });
  await menu.getByText(/Live · 0 watching/).waitFor({ timeout: 15_000 });
  const link = await author.getByLabel('Watch link').inputValue();
  assert.match(link, /[?&]watch=[a-z0-9]{12}/);
  await author.keyboard.press('Escape');

  const viewer = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  viewer.on('pageerror', (error) => errors.push(`viewer: ${error.message}`));
  viewer.on('console', (message) => message.type() === 'error' && errors.push(`viewer console: ${message.text()}`));
  await viewer.goto(link);
  await viewer
    .getByRole('status')
    .filter({ hasText: /^Live/ })
    .waitFor({ timeout: 20_000 })
    .catch(async (error) => {
      await viewer.screenshot({ path: '/tmp/live-viewer.png' });
      console.log('VIEWER STATUS', await viewer.getByRole('status').allTextContents(), viewer.url(), errors);
      throw error;
    });
  await author
    .getByRole('status')
    .filter({ hasText: /Live · 1 watching/ })
    .first()
    .waitFor({ timeout: 15_000 });
  await inked(viewer, cx - 130, cy - 100, 'the stroke made before going live');

  // A stroke made while live reaches the viewer, and a hovering pointer shows there.
  await stroke(author, cx + 60, cy + 80, cx + 220, cy + 80);
  await inked(viewer, cx + 140, cy + 80, 'the stroke made while live');
  await author.mouse.move(cx, cy + 200);
  await viewer.locator('[data-contact]').waitFor({ timeout: 10_000 });
  await author.screenshot({ path: path.join(os.tmpdir(), 'paint-live-author.png') });
  await viewer.screenshot({ path: path.join(os.tmpdir(), 'paint-live-viewer.png') });

  // Going off live tells the viewer the author is away.
  await author.getByRole('button', { name: 'Drawing menu' }).click();
  await author.getByRole('button', { name: 'Stop live' }).click();
  await viewer.getByText('The author is away').waitFor({ timeout: 15_000 });
  assert.deepEqual(errors, []);
  console.log('Live broadcast test passed.');
} finally {
  await browser.close();
  await server.close();
  relay.kill();
}

function saved(page) {
  return page
    .getByRole('status')
    .filter({ hasText: /^Saved$/ })
    .waitFor({ timeout: 30_000 });
}

/** A mouse stroke from (x0, y0) to (x1, y1). */
async function stroke(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12);
  }

  await page.mouse.up();
  await saved(page);
}

/** Waits until the viewer's canvas shows ink, not paper, at (x, y). */
async function inked(page, x, y, what) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const shot = await page.screenshot({ clip: { x: x - 1, y: y - 1, width: 3, height: 3 } });
    const pixel = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return [...context.getImageData(1, 1, 1, 1).data];
    }, shot.toString('base64'));
    if (Math.max(...pixel.slice(0, 3)) < 0xa0) {
      return;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`The viewer does not show ${what}.`);
}
