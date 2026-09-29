import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    errors.push(message.text());
  }
});

try {
  await page.goto(`${baseURL}/tests/browser/scene.html`);
  await page.evaluate(async () => {
    const { loadDocument } = await import('/tests/browser/workerHarness.tsx');
    const { mountScene } = await import('/tests/browser/sceneHarness.tsx');
    const document = (await loadDocument())._unsafeUnwrap();
    window.scene = mountScene(globalThis.document.querySelector('canvas'), document);
  });

  await page.waitForFunction(() => scene.stats.frames > 0 || scene.errors.length > 0);
  assert.deepEqual(await page.evaluate(() => scene.errors.map(({ kind, message }) => ({ kind, message }))), []);
  assert.deepEqual(await pixel(400, 300), [255, 0, 0]);
  assert.deepEqual(await pixel(40, 40), [0, 0, 255]);
  assert.deepEqual(await pixel(720, 40), [0, 255, 0], 'instanced rectangles draw each item');
  assert.deepEqual(await pixel(720, 100), [0, 255, 0]);
  assert.deepEqual(await pixel(720, 70), [160, 169, 175], 'instanced rectangles leave gaps between items');

  await change(() => scene.setShowDocument(true));
  await page.waitForFunction(() => scene.stats.ready === 1 || scene.errors.length > 0);
  assert.deepEqual(await page.evaluate(() => scene.errors.map(({ kind, message }) => ({ kind, message }))), []);
  assert.deepEqual(await pixel(400, 300), [255, 0, 0], 'late document must respect JSX order at equal layer order');
  const pagePixel = await pixel(340, 250);
  assert.notDeepEqual(pagePixel, [160, 169, 175], 'document content must share the canvas');

  const documentBuffers = await page.evaluate(() => scene.stats.destroyedBuffers);
  await change(() => scene.setDocumentVisible(false));
  assert.deepEqual(await pixel(340, 250), [160, 169, 175], 'hidden document clears its content');
  assert.deepEqual(await pixel(400, 300), [255, 0, 0], 'hiding a document preserves sibling layers');
  assert.equal(await page.evaluate(() => scene.stats.destroyedBuffers), documentBuffers);
  await change(() => scene.setDocumentVisible(true));
  assert.deepEqual(await pixel(340, 250), pagePixel);
  assert.equal(await page.evaluate(() => scene.stats.ready), 1, 'showing a document reuses its renderer');

  await change(() => scene.setDocumentOrder(1));
  assert.notDeepEqual(await pixel(400, 300), [255, 0, 0], 'document order reacts without rebuilding its renderer');
  await change(() => scene.setDocumentOrder(0));
  assert.deepEqual(await pixel(400, 300), [255, 0, 0]);

  await change(() => scene.setPageMarkVisible(true));
  const pageMark = await page.evaluate(() => scene.projectPage({ x: 120, y: 120 }));
  assert.deepEqual(await pixel(pageMark.x, pageMark.y), [255, 255, 0], 'page overlays draw in page points');
  await change(() => scene.setPageMarkVisible(false));
  assert.notDeepEqual(await pixel(pageMark.x, pageMark.y), [255, 255, 0], 'hiding a page overlay restores the page');

  await change(() => scene.setOrder(-1));
  assert.notDeepEqual(await pixel(400, 300), [255, 0, 0], 'reactive order places the rectangle behind the page');

  await change(() => {
    scene.setOrder(10);
    scene.setColor([0, 1, 0, 1]);
    scene.setX(500);
  });
  assert.deepEqual(await pixel(520, 300), [0, 255, 0]);
  assert.notDeepEqual(await pixel(400, 300), [255, 0, 0], 'old rectangle position must be cleared');

  const hiddenBefore = await page.evaluate(() => scene.stats.destroyedBuffers);
  await change(() => scene.setRectangleVisible(false));
  assert.notDeepEqual(await pixel(520, 300), [0, 255, 0]);
  assert.equal(await page.evaluate(() => scene.stats.destroyedBuffers), hiddenBefore, 'visibility retains resources');
  await change(() => scene.setRectangleVisible(true));
  assert.deepEqual(await pixel(520, 300), [0, 255, 0]);

  const before = await page.evaluate(() => scene.stats.destroyedBuffers);
  await change(() => scene.setShowRectangle(false));
  assert.notDeepEqual(await pixel(520, 300), [0, 255, 0]);
  assert.equal(
    await page.evaluate(() => scene.stats.destroyedBuffers),
    before + 2,
    'rectangle must release its uniform and instance buffers'
  );
  assert.deepEqual(await pixel(340, 250), pagePixel, 'removing a rectangle must preserve the document');

  await change(() => scene.setShowDocument(false));
  assert.deepEqual(await pixel(400, 300), [160, 169, 175], 'removing the last document clears its old content');
  assert.deepEqual(await pixel(40, 40), [0, 0, 255], 'a sibling must survive document removal');
  assert.equal(await page.evaluate(() => scene.stats.cameraMounts), 1);
  assert.equal(await page.evaluate(() => scene.stats.cameraDisposals), 0);

  const oldZoom = await page.evaluate(() => scene.camera().zoom);
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction((oldZoom) => scene.camera().zoom !== oldZoom, oldZoom);

  const held = await page.evaluate(() => ({ ...scene.camera() }));
  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.move(200, 200, { steps: 4 });
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => ({ presses: scene.stats.presses, releases: scene.stats.releases })), {
    presses: 1,
    releases: 1
  });
  assert.ok((await page.evaluate(() => scene.stats.moves)) >= 1, 'captured moves reach the pressed item');
  assert.deepEqual(await page.evaluate(() => ({ ...scene.camera() })), held, 'a pressed item keeps the camera still');
  await page.mouse.move(600, 500);
  await page.mouse.down();
  await page.mouse.move(650, 520, { steps: 3 });
  await page.mouse.up();
  assert.notEqual(await page.evaluate(() => scene.camera().x), held.x, 'presses beside items still pan the camera');

  await change(() => scene.setWorldVisible(true));
  await change(() => scene.setCamera({ x: 0.45, y: 0.45, zoom: 0.5, rotation: 0.7 }));
  const worldPoint = await page.evaluate(() => scene.project({ x: 0.55, y: 0.55 }));
  assert.deepEqual(
    await pixel(worldPoint.x, worldPoint.y),
    [255, 0, 255],
    'document rectangle follows the rotated camera'
  );
  assert.deepEqual(await pixel(40, 40), [0, 0, 255], 'screen rectangle ignores the camera');

  const retained = await page.evaluate(() => scene.stats.destroyedBuffers);
  await change(() => scene.setAnnotations([{ id: 'highlight', x: 0.7, y: 0.6 }]));
  assert.equal(await page.evaluate(() => scene.stats.destroyedBuffers), retained, 'stable ids retain GPU resources');
  const moved = await page.evaluate(() => scene.project({ x: 0.8, y: 0.7 }));
  assert.deepEqual(await pixel(moved.x, moved.y), [255, 0, 255]);
  assert.notDeepEqual(await pixel(worldPoint.x, worldPoint.y), [255, 0, 255]);

  await change(() => scene.setPageAspect(1));
  const reshaped = await page.evaluate(() => scene.project({ x: 0.8, y: 0.7 }));
  assert.deepEqual(await pixel(reshaped.x, reshaped.y), [255, 0, 255]);

  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 800,
    height: 600,
    deviceScaleFactor: 3,
    mobile: false
  });
  // CDP can change DPR without emitting the resize event produced by a real display change.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForFunction(() => document.querySelector('canvas').width === 1600);
  assert.deepEqual(await pixel(40, 40), [0, 0, 255], 'screen geometry uses CSS pixels at high DPR');
  assert.deepEqual(await pixel(65, 40), [160, 169, 175], 'screen rectangle retains its CSS size');
  assert.deepEqual(await pixel(reshaped.x, reshaped.y), [255, 0, 255]);
  await change(() => scene.setMaxDpr(1));
  assert.equal(await page.evaluate(() => document.querySelector('canvas').width), 800);
  assert.deepEqual(await pixel(40, 40), [0, 0, 255]);

  const frames = await page.evaluate(() => scene.stats.frames);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => scene.stats.frames), frames, 'unchanged scene must idle');
  await page.evaluate(() => scene.dispose());
  assert.equal(await page.evaluate(() => scene.stats.cameraDisposals), 1);
  assert.deepEqual(await page.evaluate(() => scene.errors.map(({ kind, message }) => ({ kind, message }))), []);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: shared JSX scene, instanced rectangles, pointer capture, async document, ordering, reactive graphics, visibility, document/screen spaces, DPR, stable ids, disposal and idle loop'
  );
} finally {
  await browser.close();
}

async function change(update) {
  const before = await page.evaluate(() => scene.stats.frames);
  await page.evaluate(update);
  await page.waitForFunction((before) => scene.stats.frames > before || scene.errors.length > 0, before);
  assert.deepEqual(await page.evaluate(() => scene.errors.map(({ kind, message }) => ({ kind, message }))), []);
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
      return [...context.getImageData(x, y, 1, 1).data].slice(0, 3);
    },
    { source, x, y }
  );
}
