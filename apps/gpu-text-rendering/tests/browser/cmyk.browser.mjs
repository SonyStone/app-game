import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { makePdf } from '../fixtures/pdf.mjs';

const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-cmyk';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 640, height: 160 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (['warning', 'error'].includes(message.type())) {
    errors.push(message.text());
  }
});

try {
  await page.route('**/cmyk-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
  );
  await page.goto(`${baseURL}/cmyk-check`);
  for (const name of ['cmyk', 'ycck']) {
    const jpeg = await readFile(new URL(`../fixtures/jpeg/pdf-${name}.jpg`, import.meta.url));
    const placeholder = 'x'.repeat(jpeg.length);
    const pdf = makePdf('64 0 0 16 0 0 cm /Im Do', {
      width: 64,
      height: 16,
      resources: '/XObject << /Im 7 0 R >>',
      extraObjects: [
        `<< /Type /XObject /Subtype /Image /Width 64 /Height 16 /BitsPerComponent 8 /ColorSpace /DeviceCMYK /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n${placeholder}\nendstream`
      ]
    });
    jpeg.copy(pdf, pdf.indexOf(placeholder));
    const codec = await page.evaluate(
      async (bytes) => {
        const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
        const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
        const { layoutPages } = await import('/src/features/document/document.ts');
        const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
        const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
        const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
        const encoded = (await convertPdf(new Uint8Array(bytes).buffer))._unsafeUnwrap();
        const data = (await readGdoc(encoded))._unsafeUnwrap();
        const doc = {
          ...data,
          pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
          images: new Map(),
          imageVertices: new ArrayBuffer(0)
        };
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 160;
        document.body.append(canvas);
        const { gpu, dispose } = await mountRenderingGpu(canvas, data.instances.byteLength);
        const renderer = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
        renderer.render(createFrame(doc, { x: 0.5, y: 0.5, zoom: 0.125, rotation: 0 }, 640, 160))._unsafeUnwrap();
        (await renderer.settle())._unsafeUnwrap();
        window.clearCmyk = () => {
          renderer.destroy();
          dispose();
          canvas.remove();
        };
        return new DataView(data.rasterImages.table).getUint32(20, true);
      },
      [...pdf]
    );
    assert.equal(codec, 3, 'Must exercise retained JPEG plus the PDF ICC profile');
    const screenshot = await page.locator('canvas').screenshot({ path: `${output}/${name}.png` });
    const colors = await page.evaluate(async (base64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const context = new OffscreenCanvas(640, 160).getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return [80, 240, 400, 560].map((x) => [...context.getImageData(x, 80, 1, 1).data]);
    }, screenshot.toString('base64'));
    assert.ok(
      colors[0].slice(0, 3).every((c) => c > 240),
      `${name} white: ${colors[0]}`
    );
    assert.ok(
      colors[1].slice(0, 3).every((c) => c < 60),
      `${name} black: ${colors[1]}`
    );
    assert.ok(colors[2][0] < 70 && colors[2][1] > 100 && colors[2][2] > 100, `${name} cyan: ${colors[2]}`);
    assert.ok(colors[3][0] > 150 && colors[3][1] < 100 && colors[3][2] > 80, `${name} magenta: ${colors[3]}`);
    await page.evaluate(() => clearCmyk());
  }
  assert.deepEqual(errors, []);
  console.log('PASS PDF CMYK/YCCK JPEG: source polarity, ICC transform, retained GDOC bytes and GPU colors');
} finally {
  await browser.close();
}
