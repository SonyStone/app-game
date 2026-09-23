import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Run against `pnpm --filter @app-game/gpu-text-rendering dev`. UI behavior and cleanup use the real Solid component and GPU.
const viewerPath = process.env.GPU_TEXT_PATH ?? '/';
const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
for (const gpu of [true, false]) {
  const browser = await chromium.launch({
    channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
    headless: true,
    args: gpu
      ? ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
      : ['--disable-webgpu']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, hasTouch: true });
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (!gpu && message.text() === 'No available adapters.') {
        return;
      }
      if (message.type() === 'error' || message.type() === 'warning') {
        errors.push(message.text());
      }
    });
    // Count active RAF callbacks and retain the device to exercise an idle device-loss notification.
    await page.addInitScript(() => {
      const request = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      window.pendingFrames = new Set();
      window.requestAnimationFrame = (callback) => {
        const id = request((timestamp) => {
          window.pendingFrames.delete(id);
          callback(timestamp);
        });
        window.pendingFrames.add(id);
        return id;
      };
      window.cancelAnimationFrame = (id) => {
        window.pendingFrames.delete(id);
        cancel(id);
      };
      if (typeof GPUAdapter !== 'undefined') {
        const requestDevice = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = async function (...args) {
          const device = await requestDevice.apply(this, args);
          window.viewerDevice = device;
          return device;
        };
      }
    });
    if (!gpu) {
      // Installed Chrome versions can ignore --disable-webgpu; exercise the actual missing-API branch.
      await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
    }
    await page.goto(`${baseURL}${viewerPath}`);
    await page.getByLabel('Document canvas').waitFor();
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(await page.locator('select').count(), 0);
    if (!gpu) {
      await page.getByRole('alert').waitFor({ timeout: 60000 });
      assert.match(await page.getByRole('alert').textContent(), /WebGPU/);
      assert.equal(await page.evaluate(() => pendingFrames.size), 0);
      assert.deepEqual(errors, []);
      continue;
    }
    await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'), null, {
      timeout: 60000
    });
    const canvas = page.getByLabel('Document canvas');
    const snapshot = () => canvas.screenshot({ mask: [page.locator('#toolbar')] });
    await page.waitForFunction(() => pendingFrames.size === 0);
    const before = await snapshot();
    await page.mouse.move(450, 400);
    await page.mouse.down();
    assert.equal(await canvas.evaluate((node) => getComputedStyle(node).cursor), 'grabbing');
    await page.mouse.move(550, 450, { steps: 5 });
    await page.mouse.up();
    assert.equal(await canvas.evaluate((node) => getComputedStyle(node).cursor), 'grab');
    await page.mouse.wheel(0, -300);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: 400, y: 350 },
        { id: 2, x: 650, y: 350 }
      ]
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: 410, y: 310 },
        { id: 2, x: 690, y: 470 }
      ]
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => pendingFrames.size === 0);
    const manipulated = await snapshot();
    assert.ok(!before.equals(manipulated), 'gestures must change the rendered document');
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Vector only' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Grids', exact: true }).click();
    await page.waitForFunction(() => pendingFrames.size === 0);
    assert.ok(!manipulated.equals(await snapshot()), 'reactive options must redraw the document');
    await page.getByRole('menuitemcheckbox', { name: 'Auto zoom' }).click();
    await page.waitForFunction(() => pendingFrames.size > 0);
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(
      () => document.querySelector('[role="menuitemcheckbox"]')?.getAttribute('aria-checked') === 'false'
    );
    assert.equal(
      await page.getByRole('menuitemcheckbox', { name: 'Auto zoom' }).getAttribute('aria-checked'),
      'false'
    );
    await page.waitForFunction(() => pendingFrames.size === 0);
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 800 * devicePixelRatio);
    await page.waitForFunction(() => pendingFrames.size === 0);
    if (!(await page.getByRole('menu').isVisible())) await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Grids', exact: true }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Vector only' }).click();
    await page.getByRole('button', { name: 'More', exact: true }).press('Escape');
    await page.getByRole('button', { name: 'Show entire document' }).click();
    await page.waitForFunction(() => pendingFrames.size === 0);
    const overview = await snapshot();
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, -500);
    await page.waitForFunction(() => pendingFrames.size === 0);
    assert.ok(!overview.equals(await snapshot()));
    await page.getByRole('button', { name: 'Show entire document' }).click();
    await page.waitForFunction(() => pendingFrames.size === 0);
    assert.ok(overview.equals(await snapshot()), 'overview must restore the exact fitted camera');
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.getByRole('button', { name: 'Exit fullscreen' }).click();
    await page.waitForFunction(() => !document.fullscreenElement);
    const more = page.getByRole('button', { name: 'More', exact: true });
    await more.press('ArrowDown');
    assert.equal(await page.locator(':focus').getAttribute('role'), 'menuitemcheckbox');
    await page.keyboard.press('End');
    assert.equal(await page.locator(':focus').textContent(), 'About the technology');
    await page.keyboard.press('Escape');
    assert.equal(await more.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'More');
    await more.click();
    await page.mouse.click(20, 20);
    assert.equal(await more.getAttribute('aria-expanded'), 'false');
    const screenshots = process.env.GPU_TEXT_UI_SCREENSHOTS;
    if (screenshots) await mkdir(screenshots, { recursive: true });
    for (const [width, height] of [
      [1440, 1024],
      [390, 844],
      [320, 568],
      [844, 390]
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Show entire document' }).click();
      await page.waitForFunction(() => pendingFrames.size === 0);
      const box = await page.locator('#toolbar').boundingBox();
      assert.ok(box.width <= 220 && box.height <= 60 && box.x >= 0 && box.y + box.height <= height);
      await page.mouse.move(10, 10);
      if (screenshots) await page.screenshot({ path: `${screenshots}/${width}x${height}.png` });
      await more.click();
      const menu = await page.getByRole('menu').boundingBox();
      assert.ok(menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= width && menu.y + menu.height <= height);
      await page.mouse.move(10, 10);
      if (screenshots) await page.screenshot({ path: `${screenshots}/${width}x${height}-menu.png` });
      await page.keyboard.press('Escape');
    }
    // Device loss is reported even when the demand-driven frame loop is stopped.
    await page.evaluate(() => viewerDevice.destroy());
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /device|destroy/i);
    assert.deepEqual(errors, []);
    await page.goto('about:blank');
    assert.deepEqual(errors, []);
    // A failed document request must produce a visible loading error.
    await page
      .context()
      .route('**/demo*.gdoc*', (route) =>
        route.request().resourceType() === 'fetch' ? route.abort() : route.continue()
      );
    await page.goto(`${baseURL}${viewerPath}`);
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /fetch|load/i);
  } finally {
    await browser.close();
  }
}
console.log('PASS gestures, reactive options, idle RAF, resize, device loss and missing WebGPU');
