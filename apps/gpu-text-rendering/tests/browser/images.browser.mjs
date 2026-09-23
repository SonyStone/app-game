import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { makeImagePdf } from '../fixtures/pdf.mjs';

const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const viewerURL = `${baseURL}${process.env.GPU_TEXT_PATH ?? '/'}`;
const uiOnly = process.env.GPU_TEXT_UI_ONLY === '1';
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-images';
await mkdir(output, { recursive: true });
const pdf = makeImagePdf();
await writeFile(`${output}/images.pdf`, pdf);
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    errors.push(message.text());
  }
});

try {
  await page.goto(viewerURL);
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'images.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'));
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download GDOC' }).click();
  await (await download).saveAs(`${output}/images.gdoc`);
  await page.locator('input[type=file]').setInputFiles(`${output}/images.gdoc`);
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'));
  await page.screenshot({ path: `${output}/reopened.png` });

  if (!uiOnly) {
    await page.route('**/gpu-image-check', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
    );
    await page.goto(`${baseURL}/gpu-image-check`);
    const resources = await page.evaluate(
      async (bytes) => {
        const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
        const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
        const { layoutPages } = await import('/src/features/document/document.ts');
        const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
        const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
        const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
        const encoded = (await convertPdf(new Uint8Array(bytes).buffer))._unsafeUnwrap();
        const data = (await readGdoc(encoded))._unsafeUnwrap();
        const documentData = {
          ...data,
          pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
          images: new Map(),
          imageVertices: new ArrayBuffer(0)
        };
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 800;
        document.body.append(canvas);
        const { gpu, dispose } = await mountRenderingGpu(
          canvas,
          Math.max(data.curves.byteLength, data.instances.byteLength)
        );
        const renderer = (await createTypeGpuRenderer(gpu, documentData))._unsafeUnwrap();
        window.drawImages = async (camera) => {
          renderer.render(createFrame(documentData, camera, 800, 800))._unsafeUnwrap();
          (await renderer.settle())._unsafeUnwrap();
        };
        window.disposeImages = () => {
          renderer.destroy();
          renderer.destroy();
          dispose();
        };
        await drawImages({ x: 0.5, y: 0.5, zoom: 0.5, rotation: 0 });
        return { images: data.rasterImages.table.byteLength / 24, bytes: data.rasterImages.pixels.byteLength };
      },
      [...pdf]
    );
    assert.deepEqual(resources, { images: 3, bytes: 32 });
    const png = await page.locator('canvas').screenshot({ path: `${output}/page.png` });
    const pixels = await page.evaluate(async (base64) => {
      const bitmap = new Image();
      bitmap.src = `data:image/png;base64,${base64}`;
      await bitmap.decode();
      const context = new OffscreenCanvas(800, 800).getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      return [
        [220, 220],
        [580, 220],
        [220, 580],
        [580, 580],
        [320, 320],
        [50, 740],
        [200, 740],
        [620, 740],
        [710, 740],
        [690, 25],
        [770, 25],
        [25, 25]
      ].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    }, png.toString('base64'));
    assert.deepEqual(pixels, [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 0, 255],
      [0, 0, 255, 255],
      [128, 0, 127, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255]
    ]);
    await page.evaluate(() => drawImages({ x: 0.5, y: 0.5, zoom: 0.07, rotation: 0.6 }));
    await page.locator('canvas').screenshot({ path: `${output}/detail.png` });
    await page.evaluate(() => drawImages({ x: 0.5, y: 0.5, zoom: 2, rotation: 0.2 }));
    await page.locator('canvas').screenshot({ path: `${output}/mipmaps.png` });
    await page.evaluate(() => disposeImages());
  }

  assert.deepEqual(errors, []);
  console.log(
    'PASS PDF images: paint order, orientation, reflection, clipping, masks, resource reuse, GDOC reopen and GPU lifetime'
  );
} finally {
  await browser.close();
}
