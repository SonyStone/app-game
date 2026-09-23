import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { makePdf } from '../fixtures/pdf.mjs';

// Expected ink comes from geometry, independently of the renderer's coverage implementation.
const cases = [
  { name: 'retraced L is empty', paint: '20 20 m 80 20 l 20 20 l 20 80 l h f', area: 0 },
  { name: 'thin vertical', paint: '49.45 20 0.1 60 re f', area: 6 },
  { name: 'thin horizontal', paint: '20 49.45 60 0.1 re f', area: 6 },
  { name: 'tiny rectangle', paint: '49.4 49.4 0.2 0.3 re f', area: 0.06 },
  { name: 'even-odd overlap', paint: '49.3 20 0.4 60 re 49.5 20 0.4 60 re f*', area: 24 },
  { name: 'nonzero overlap', paint: '49.3 20 0.4 60 re 49.5 20 0.4 60 re f', area: 36 },
  {
    name: 'crossing-cache overflow',
    paint:
      Array.from({ length: 20 }, (_, i) => `${49.5 + i * 0.04} 20 0.02 60 re`).join(' ') + ' 49.5 20 0.78 0.02 re f',
    area: 24.0076
  },
  { name: 'thin rectangular frame', paint: '30 30 40 40 re 30.04 30.04 39.92 39.92 re f*', area: 6.3936 },
  { name: 'hole', paint: '30 30 40 40 re 30.1 30.1 39.8 39.8 re f*', area: 15.96 },
  { name: 'curved lens', paint: '20 50 m 40 49.8 60 49.8 80 50 c 60 50.2 40 50.2 20 50 c f', area: 12 }
];
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.route('**/coverage-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' })
  );
  for (const test of cases) {
    await page.unroute('**/coverage.pdf');
    await page.route('**/coverage.pdf', (route) =>
      route.fulfill({ body: makePdf(test.paint, { width: 100, height: 100 }) })
    );
    await page.goto(`${process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180'}/coverage-check`);
    await page.evaluate(async () => {
      const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
      const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
      const { layoutPages } = await import('/src/features/document/document.ts');
      const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
      const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
      const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
      const converted = (await convertPdf(await (await fetch('/coverage.pdf')).arrayBuffer()))._unsafeUnwrap();
      const data = (await readGdoc(converted))._unsafeUnwrap();
      const doc = {
        ...data,
        pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
        images: new Map(),
        imageVertices: new ArrayBuffer(0)
      };
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      document.body.append(canvas);
      const { gpu, dispose } = await mountRenderingGpu(canvas, data.instances.byteLength);
      const prepared = await createTypeGpuRenderer(gpu, doc);
      if (prepared.isErr()) {
        throw new Error(prepared.error.message);
      }
      const renderer = prepared.value;
      window.drawCoverage = async (rotation) => {
        renderer.render(createFrame(doc, { x: 0.5, y: 0.5, zoom: 0.5, rotation }, 100, 100))._unsafeUnwrap();
        (await renderer.settle())._unsafeUnwrap();
      };
      window.disposeCoverage = () => {
        renderer.destroy();
        dispose();
      };
    });
    for (const rotation of [0, 0.37, 1.57]) {
      await page.evaluate((rotation) => drawCoverage(rotation), rotation);
      const png = (await page.screenshot()).toString('base64');
      const ink = await page.evaluate(async (png) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const ctx = new OffscreenCanvas(100, 100).getContext('2d');
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, 100, 100).data;
        let ink = 0;
        // Interior region contains all fixture geometry, excluding rotated page/background corners.
        for (let y = 15; y < 85; y++) {
          for (let x = 15; x < 85; x++) {
            ink += (255 - data[(y * 100 + x) * 4]) / 255;
          }
        }
        return ink;
      }, png);
      console.log(test.name, rotation, { expected: test.area, ink });
      assert.ok(
        Math.abs(ink - test.area) < Math.max(0.02, test.area * 0.04),
        `${test.name}: ink ${ink}, expected ${test.area}`
      );
    }
    await page.evaluate(() => disposeCoverage());
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
