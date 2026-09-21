import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

// Run against `pnpm --filter @app-game/gpu-text-rendering dev`. UI behavior and cleanup use the real Solid component and GPU.
const viewerPath = process.env.GPU_TEXT_PATH ?? '/';
const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
for (const gpu of [true, false]) {
  const browser = await chromium.launch({
    headless: true,
    args: gpu
      ? ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
      : ['--disable-webgpu']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, hasTouch: true });
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
    await page.getByLabel('Vector only').check();
    await page.getByLabel('Grids', { exact: true }).check();
    await page.waitForFunction(() => pendingFrames.size === 0);
    assert.ok(!manipulated.equals(await snapshot()), 'reactive options must redraw the document');
    await page.getByLabel('Auto zoom').check();
    await page.waitForFunction(() => pendingFrames.size > 0);
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(() => !document.querySelector('input[type="checkbox"]').checked);
    assert.equal(await page.getByLabel('Auto zoom').isChecked(), false);
    await page.waitForFunction(() => pendingFrames.size === 0);
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForFunction(() => document.querySelector('canvas').width === 800 * devicePixelRatio);
    await page.waitForFunction(() => pendingFrames.size === 0);
    // Device loss is reported even when the demand-driven frame loop is stopped.
    await page.evaluate(() => viewerDevice.destroy());
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /device|destroy/i);
    assert.deepEqual(errors, []);
    await page.goto('about:blank');
    assert.deepEqual(errors, []);
    // A failed document request must produce a visible loading error.
    await page.route('**/glyphs.bmp*', (route) =>
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
