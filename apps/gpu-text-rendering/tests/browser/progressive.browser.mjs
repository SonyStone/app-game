import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/progressive-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' })
  );
  await page.goto(`${process.env.GPU_TEXT_URL ?? 'http://localhost:3180'}/progressive-check`);
  const results = await page.evaluate(async () => {
    const { layoutPages } = await import('/src/features/document/document.ts');
    const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
    const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
    const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    document.body.append(canvas);
    const { gpu, dispose } = await mountRenderingGpu(canvas, 256 * 1024);
    const NativeWorker = Worker;
    const tails = [];
    window.Worker = class extends NativeWorker {
      postMessage(request, transfer) {
        if (request.tailLevel !== undefined) tails.push(request.id);
        super.postMessage(request, transfer);
      }
    };
    const results = [];
    try {
      for (const repeats of [1, 8]) {
        const table = new ArrayBuffer(16 * 24);
        const pixels = new Uint8Array(16 * 64 * 64 * 4);
        const records = new DataView(table);
        const instances = new ArrayBuffer(16 * repeats * 80);
        const draws = new DataView(instances);
        for (let image = 0; image < 16; image++) {
          [64, 64, image * 64 * 64 * 4, 64 * 64 * 4, 1, 0].forEach((value, i) =>
            records.setUint32(image * 24 + i * 4, value, true)
          );
          for (let pixel = image * 64 * 64 * 4; pixel < (image + 1) * 64 * 64 * 4; pixel += 4)
            pixels.set([32 + image * 12, 64, 128, 255], pixel);
          for (let copy = 0; copy < repeats; copy++) {
            const offset = (image * repeats + copy) * 80;
            for (const field of [0, 12, 32, 36, 40, 44, 56, 60]) draws.setFloat32(offset + field, 1, true);
            draws.setUint32(offset + 64, image, true);
            draws.setUint32(offset + 72, 2, true);
            draws.setUint32(offset + 76, image, true);
          }
        }
        const doc = {
          kind: 'curves',
          pages: layoutPages(
            Array.from({ length: 16 }, (_, i) => ({
              width: 100,
              height: 100,
              beginVertex: i * repeats * 6,
              endVertex: (i + 1) * repeats * 6,
              images: []
            })),
            2
          )._unsafeUnwrap(),
          positions: { x: new Float32Array(), y: new Float32Array() },
          curves: new ArrayBuffer(0),
          instances,
          clips: new ArrayBuffer(0),
          curveBins: new ArrayBuffer(0),
          blends: new ArrayBuffer(16 * repeats),
          groups: new ArrayBuffer(0),
          maskTransfers: new ArrayBuffer(0),
          radialGradients: new ArrayBuffer(0),
          rasterImages: { table, pixels: pixels.buffer },
          images: new Map(),
          imageVertices: new ArrayBuffer(0)
        };
        const initial = createFrame(doc, { x: 0.5, y: 0.5, zoom: 0.4, rotation: 0 }, 800, 600);
        const overview = createFrame(doc, { x: 2.5, y: -1.5, zoom: 4, rotation: 0 }, 800, 600);
        tails.length = 0;
        const lazy = (await createTypeGpuRenderer(gpu, doc, undefined, initial))._unsafeUnwrap();
        const preparedImages = [...tails];
        lazy.render(initial)._unsafeUnwrap();
        (await lazy.settle())._unsafeUnwrap();
        // This first overview caches commands while unseen images are still unavailable.
        lazy.render(overview)._unsafeUnwrap();
        (await lazy.settle())._unsafeUnwrap();
        lazy.render(overview)._unsafeUnwrap();
        (await lazy.settle())._unsafeUnwrap();
        const actual = canvas.toDataURL();
        const visitedImages = [...new Set(tails)].sort((a, b) => a - b);
        lazy.destroy();
        const eager = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
        eager.render(overview)._unsafeUnwrap();
        (await eager.settle())._unsafeUnwrap();
        const expected = canvas.toDataURL();
        eager.destroy();
        results.push({
          repeats,
          initialPages: initial.visible.length,
          preparedImages,
          visitedImages,
          equal: actual === expected
        });
      }
    } finally {
      window.Worker = NativeWorker;
      dispose();
    }
    return results;
  });
  for (const result of results) {
    assert.equal(result.initialPages, 1);
    assert.deepEqual(result.preparedImages, [0]);
    assert.equal(result.visitedImages.length, 16);
    assert.equal(
      result.equal,
      true,
      'Lazy loading must match eager rendering, including first-visit command bundles and composed prefixes'
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS visible-page preparation, deferred images, first-visit bundle repair and composed-page parity',
    results
  );
} finally {
  await browser.close();
}
