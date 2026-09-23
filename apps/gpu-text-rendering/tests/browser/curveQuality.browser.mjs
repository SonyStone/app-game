import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { makePdf } from '../fixtures/pdf.mjs';

const text = Array.from(
  { length: 24 },
  (_, row) => `BT /F1 2 Tf 2 ${97 - row * 4} Td (Dense text ABBA 0123456789 repeated outlines) Tj ET`
).join('\n');
const form = '1 1 1 rg 35 35 30 30 re f';
// Include image detail and transparency alongside dense, repeated text.
const imagePixels = Buffer.alloc(256 * 256 * 3);
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    const color = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 255 : 0;
    imagePixels.fill(color, (y * 256 + x) * 3, (y * 256 + x) * 3 + 3);
  }
}
const imageHex = imagePixels.toString('hex') + '>';
const pdf = makePdf(
  '1 0 0 rg 0 50 50 50 re f 0 1 0 rg 50 50 50 50 re f 0 0 1 rg 0 0 50 50 re f q 50 0 0 50 50 0 cm /Im Do Q /Half gs /G Do 0 0 0 rg ' +
    text,
  {
    width: 100,
    height: 100,
    pages: 16,
    resources: '/XObject << /Im 22 0 R /G 23 0 R >> /ExtGState << /Half << /ca 0.5 >> >>',
    extraObjects: [
      `<< /Type /XObject /Subtype /Image /Width 256 /Height 256 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${imageHex.length} >>\nstream\n${imageHex}\nendstream`,
      `<< /Type /XObject /Subtype /Form /BBox [0 0 100 100] /Group << /S /Transparency /I true >> /Resources << >> /Length ${form.length} >>\nstream\n${form}\nendstream`
    ]
  }
);
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors.push(m.text());
  }
});
try {
  for (const input of [pdf, makePdf('0 0 0 rg ' + text, { width: 100, height: 100, pages: 16 })]) {
    await page.unroute('**/quality-input.pdf');
    await page.route('**/quality-input.pdf', (route) => route.fulfill({ body: input }));
    await page.route('**/quality-check', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<body style="margin:0"></body>' })
    );
    await page.goto(`${process.env.GPU_TEXT_URL ?? 'http://localhost:3180'}/quality-check`);
    await page.evaluate(async () => {
      const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
      const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
      const { layoutPages } = await import('/src/features/document/document.ts');
      const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
      const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
      const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
      const data = (
        await readGdoc((await convertPdf(await (await fetch('/quality-input.pdf')).arrayBuffer()))._unsafeUnwrap())
      )._unsafeUnwrap();
      const doc = {
        ...data,
        pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
        images: new Map(),
        imageVertices: new ArrayBuffer(0)
      };
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      document.body.append(canvas);
      const { gpu, dispose } = await mountRenderingGpu(canvas, data.instances.byteLength);
      const renderer = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
      window.captureQuality = async ({ rotation, vectorOnly, zoom = 4 }) => {
        let draws = 0;
        const native = GPURenderPassEncoder.prototype.draw;
        const nativeBundles = GPURenderPassEncoder.prototype.executeBundles;
        GPURenderPassEncoder.prototype.executeBundles = function (bundles) {
          const list = [...bundles];
          draws += list.length;
          return nativeBundles.call(this, list);
        };
        GPURenderPassEncoder.prototype.draw = function (...args) {
          draws++;
          return native.apply(this, args);
        };
        const anchor = doc.pages[Math.floor(doc.pages.length / 2)];
        const frame = createFrame(
          doc,
          { x: -anchor.x + 0.5, y: 0.5 - anchor.y, zoom, rotation },
          canvas.width,
          canvas.height,
          vectorOnly
        );
        renderer.render(frame)._unsafeUnwrap();
        const firstDraws = draws;
        (await renderer.settle())._unsafeUnwrap();
        await gpu.device.queue.onSubmittedWorkDone();
        GPURenderPassEncoder.prototype.draw = native;
        GPURenderPassEncoder.prototype.executeBundles = nativeBundles;
        return { draws: firstDraws, visible: frame.visible.length, bytes: renderer.resourceBytes };
      };
      window.disposeQuality = () => {
        renderer.destroy();
        dispose();
      };
    });

    for (const [rotation, zoom] of [
      [0, 4],
      [0, 1.55],
      [0, 1.57],
      [0.6, 4],
      [0, 0.08],
      [0, 0.06]
    ]) {
      const normal = await page.evaluate((options) => captureQuality(options), { rotation, zoom, vectorOnly: false });

      assert.ok(normal.visible > 0, 'must draw actual pages at every zoom');
      const a = (await page.screenshot()).toString('base64');
      await page.evaluate((options) => captureQuality(options), { rotation, zoom, vectorOnly: true });

      const b = (await page.screenshot()).toString('base64');
      const difference = await page.evaluate(
        async ({ a, b }) => {
          const pixels = async (source) => {
            const image = new Image();
            image.src = `data:image/png;base64,${source}`;
            await image.decode();
            const ctx = new OffscreenCanvas(800, 600).getContext('2d');
            ctx.drawImage(image, 0, 0);
            return ctx.getImageData(0, 0, 800, 600).data;
          };
          const left = await pixels(a),
            right = await pixels(b);
          let sum = 0;
          for (let i = 0; i < left.length; i++) {
            sum += Math.abs(left[i] - right[i]);
          }
          return sum / left.length;
        },
        { a, b }
      );
      console.log('exact curve pixel error', { rotation, zoom, difference });
      assert.ok(difference < 0.05, `area tables exceed the 0.05/255 mean error budget: ${difference}`);
    }
    const close = await page.evaluate(() => captureQuality({ rotation: 0, vectorOnly: false, zoom: 0.6 }));
    assert.ok(close.draws > 1, 'close view must retain exact drawing');
    const returned = await page.evaluate(() => captureQuality({ rotation: 0, vectorOnly: false }));
    assert.ok(returned.draws > 1, 'zoom return must retain exact drawing');
    await page.evaluate(() => disposeQuality());
    assert.deepEqual(errors, []);
  }
  console.log(
    'PASS area tables versus original curves: dense text, zoom transitions, image detail, rotation, groups and render bundles'
  );
} finally {
  await browser.close();
}
