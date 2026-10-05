import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { curvePage, makePdf } from '../fixtures/pdf.mjs';

// Run against `pnpm --filter @app-game/gpu-text-rendering dev`. Split view uses the real app, one device and two canvases.
const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-split';
/** Background color of the canvas outside pages. */
const background = [160, 169, 175];
await mkdir(output, { recursive: true });
await writeFile(`${output}/curves.pdf`, makePdf(curvePage));

const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    errors.push(message.text());
  }
});
// Count pending RAF callbacks to wait for an idle scene, and image decoder workers to show one shared renderer.
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
  const NativeWorker = window.Worker;
  window.rasterWorkers = 0;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      if (String(url).includes('raster')) {
        window.rasterWorkers++;
      }
    }
  };
});

try {
  await page.goto(baseURL);
  await ready();
  const canvases = page.getByLabel('Document canvas');
  const split = page.getByRole('button', { name: 'Split view' });
  assert.equal(await canvases.count(), 1);

  await split.click();
  assert.equal(await split.getAttribute('aria-pressed'), 'true');
  assert.equal(await canvases.count(), 2);
  await idle();
  const [left, right] = [canvases.nth(0), canvases.nth(1)];
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  assert.ok(rightBox.x > leftBox.x + leftBox.width - 1, 'wide screens place panes side by side');
  const [leftOpened, rightOpened] = await shots(left, right);
  assert.ok(leftOpened.equals(rightOpened), 'the second pane opens on the first pane’s view');

  const rightBefore = rightOpened;
  const leftBefore = leftOpened;
  await page.mouse.move(leftBox.x + leftBox.width / 2, leftBox.y + leftBox.height / 2);
  await page.mouse.wheel(0, -300);
  await idle();
  let [leftNow, rightNow] = await shots(left, right);
  assert.ok(!leftNow.equals(leftBefore), 'the zoomed pane redraws');
  assert.ok(rightNow.equals(rightBefore), 'the other pane keeps its view');

  // A press focuses the right pane; the toolbar's overview then acts on it alone.
  await page.mouse.click(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2);
  await idle();
  const [leftFocused] = await shots(left, right);
  await page.getByRole('button', { name: 'Show entire document' }).click();
  await idle();
  [leftNow, rightNow] = await shots(left, right);
  assert.ok(!rightNow.equals(rightBefore), 'overview fits the focused pane');
  assert.ok(leftNow.equals(leftFocused), 'overview leaves the other pane');

  // Resizing clears a canvas after the frame's animation callbacks ran; the pane must redraw before the next paint.
  const redrawnBeforePaint = await page.evaluate(async () => {
    const queue = GPUQueue.prototype;
    const submit = queue.submit;
    let submits = 0;
    queue.submit = function (...args) {
      submits++;
      return submit.apply(this, args);
    };

    try {
      const canvas = document.querySelectorAll('canvas')[0];
      const before = submits;
      // Observers run in creation order, so this one runs after the app's and sees whether it already redrew.
      const redrawn = new Promise((resolve) => {
        const observer = new ResizeObserver(() => {
          observer.disconnect();
          resolve(submits > before);
        });
        observer.observe(canvas);
      });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      canvas.parentElement.style.flexBasis = `${canvas.parentElement.getBoundingClientRect().width - 60}px`;
      return await redrawn;
    } finally {
      queue.submit = submit;
    }
  });
  assert.ok(redrawnBeforePaint, 'a resized pane redraws before the browser paints it');
  await idle();

  const divider = page.getByRole('separator', { name: 'Resize panes' });
  const dividerBox = await divider.boundingBox();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + 200, dividerBox.y + dividerBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await idle();
  const resized = await left.boundingBox();
  assert.ok(resized.width > leftBox.width + 150, 'dragging the divider widens the first pane');
  assert.ok(Math.abs((await left.evaluate((canvas) => canvas.width)) - resized.width) <= 1, 'framebuffers follow');

  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await idle();
  assert.ok((await left.boundingBox()).width < resized.width - 100, 'arrow keys move the divider');

  await split.click();
  assert.equal(await canvases.count(), 1);
  assert.equal(await split.getAttribute('aria-pressed'), 'false');
  await idle();

  // Stacked panes on portrait screens, and one shared renderer for a streamed curve document.
  await page.setViewportSize({ width: 600, height: 900 });
  await page.locator('input[type=file]').setInputFiles(`${output}/curves.pdf`);
  await ready();
  const workers = await page.evaluate(() => rasterWorkers);
  await split.click();
  await idle();
  const topBox = await canvases.nth(0).boundingBox();
  const bottomBox = await canvases.nth(1).boundingBox();
  assert.ok(bottomBox.y > topBox.y + topBox.height - 1, 'portrait screens stack panes');
  // The ratio dragged earlier persists, so the panes differ in size; each shows the page at its center.
  for (const box of [topBox, bottomBox]) {
    assert.notDeepEqual(await pixel(box.x + box.width / 2, box.y + box.height / 2), background, 'both panes draw');
  }
  assert.equal(await page.evaluate(() => rasterWorkers), workers, 'a second pane reuses the prepared document');
  const bottomBefore = (await shots(canvases.nth(0), canvases.nth(1)))[1];
  await page.mouse.move(topBox.x + topBox.width / 2, topBox.y + topBox.height / 2);
  await page.mouse.wheel(0, -400);
  await idle();
  // The panes share on-demand coverage tables; one sized for the closer pane may shift the other's anti-aliasing by a
  // level, but nothing else may change.
  assert.ok(
    (await largestDifference((await shots(canvases.nth(0), canvases.nth(1)))[1], bottomBefore)) <= 2,
    'streaming for one pane keeps the other'
  );

  const frames = await page.evaluate(() => pendingFrames.size);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => pendingFrames.size), frames, 'two idle panes stop requesting frames');
  assert.deepEqual(errors, []);
  console.log('PASS split view: shared renderer, independent cameras, focus, divider, orientation and idle panes');
} finally {
  await browser.close();
}

/**
 * Screenshots the same-sized region of two panes: inside the focus outline and above the toolbar and its shadow, which
 * overlap both panes at different positions.
 */
async function shots(first, second) {
  const toolbar = await page.locator('#toolbar').boundingBox();
  const boxes = [await first.boundingBox(), await second.boundingBox()];
  const width = Math.min(...boxes.map((box) => box.width)) - 8;
  // The toolbar's shadow reaches about 20 px above its box.
  const height = Math.min(...boxes.map((box) => Math.min(box.height, toolbar.y - 32 - box.y))) - 8;
  return Promise.all(boxes.map((box) => page.screenshot({ clip: { x: box.x + 4, y: box.y + 4, width, height } })));
}

/** Largest channel difference between two equally sized PNG screenshots, decoded in the page. */
function largestDifference(first, second) {
  return page.evaluate(
    async (sources) => {
      const [a, b] = await Promise.all(
        sources.map(async (source) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${source}`)).blob());
          const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          return context.getImageData(0, 0, context.canvas.width, context.canvas.height).data;
        })
      );
      let largest = 0;

      for (let i = 0; i < a.length; i++) {
        largest = Math.max(largest, Math.abs(a[i] - b[i]));
      }

      return largest;
    },
    [first.toString('base64'), second.toString('base64')]
  );
}

async function pixel(x, y) {
  const source = (await page.screenshot({ scale: 'css' })).toString('base64');
  return page.evaluate(
    async ({ source, x, y }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${source}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
    },
    { source, x, y }
  );
}

async function ready() {
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'), null, {
    timeout: 60000
  });
  await idle();
}

/**
 * Waits until no frame is pending and the page stops changing: refined tiles land and fade in without a pending
 * animation frame, so an empty frame queue alone can precede the final pixels.
 */
async function idle() {
  let previous;

  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForFunction(() => pendingFrames.size === 0, null, { timeout: 30000 });
    await page.waitForTimeout(150);
    const current = await page.screenshot();

    if (previous?.equals(current)) {
      return;
    }

    previous = current;
  }

  throw new Error('The page kept changing');
}
