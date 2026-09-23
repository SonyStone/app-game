import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { curvePage, makePdf } from '../fixtures/pdf.mjs';

const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const viewerURL = `${baseURL}${process.env.GPU_TEXT_PATH ?? '/'}`;
const uiOnly = process.env.GPU_TEXT_UI_ONLY === '1';
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-text-pdf';
await mkdir(output, { recursive: true });
const pdf = makePdf(curvePage);
await writeFile(`${output}/curves.pdf`, pdf);
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    errors.push(m.text());
  }
});

try {
  let releaseImport;
  const importGate = new Promise((resolve) => {
    releaseImport = resolve;
  });
  await page.route('**/import.worker*', async (route) => {
    await importGate;
    await route.continue();
  });
  await page.goto(viewerURL);
  await page.locator('input[type=file]').waitFor({ state: 'attached' });
  // Drop onto a toolbar child: the full viewer handles file drops, including its controls.
  await page.evaluate(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'curves.pdf', { type: 'application/pdf' }));
      const target = document.querySelector('#toolbar button');
      target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
      window.documentDropTransfer = transfer;
    },
    [...pdf]
  );
  await page.getByTestId('document-drop-overlay').waitFor();
  await page.evaluate(() => {
    const event = new DragEvent('drop', { dataTransfer: window.documentDropTransfer, bubbles: true, cancelable: true });
    document.querySelector('#toolbar button').dispatchEvent(event);
    if (!event.defaultPrevented) throw new Error('File drop would navigate away');
    delete window.documentDropTransfer;
  });
  await page.getByTestId('document-drop-overlay').waitFor({ state: 'hidden' });
  try {
    await page.getByRole('progressbar', { name: 'Loading document…' }).waitFor();
    assert.equal(await page.locator('canvas').getAttribute('aria-busy'), 'true');
    await page.getByText('curves.pdf', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/loading.png` });
  } finally {
    releaseImport();
  }
  await page.getByTestId('document-loading').waitFor({ state: 'hidden' });
  await page.unroute('**/import.worker*');
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'), { timeout: 60000 });
  await page.screenshot({ path: `${output}/viewer.png` });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download GDOC' }).click();
  const saved = await download;
  await saved.saveAs(`${output}/curves.gdoc`);
  await page.locator('input[type=file]').setInputFiles(`${output}/curves.gdoc`);
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'));
  await page.getByRole('button', { name: 'More', exact: true }).click();
  assert.equal(await page.getByRole('menuitemcheckbox', { name: 'Vector only' }).count(), 0);
  await page.keyboard.press('Escape');

  let result = { uiOnly };
  if (!uiOnly) {
    await page.route('**/gpu-pdf-check', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
    );
    await page.goto(`${baseURL}/gpu-pdf-check`);
    result = await page.evaluate(
      async (bytes) => {
        const { convertPdf } = await import('/src/features/document/pdf/convertPdf.ts');
        const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
        const { layoutPages } = await import('/src/features/document/document.ts');
        const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
        const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
        const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
        const source = new Uint8Array(bytes).buffer;
        const pending = convertPdf(source);
        const detached = source.byteLength === 0;
        const encoded = (await pending)._unsafeUnwrap();
        const data = (await readGdoc(encoded))._unsafeUnwrap();
        window.doc = {
          ...data,
          pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
          images: new Map(),
          imageVertices: new ArrayBuffer(0)
        };
        window.canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 800;
        document.body.append(canvas);
        const { gpu, dispose } = await mountRenderingGpu(
          canvas,
          Math.max(data.curves.byteLength, data.instances.byteLength)
        );
        window.dispose = dispose;
        window.renderer = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
        window.drawPdf = async (camera) => {
          renderer.render(createFrame(doc, camera, 800, 800))._unsafeUnwrap();
          (await renderer.settle())._unsafeUnwrap();
        };
        await drawPdf({ x: 0.5, y: 0.5, zoom: 0.5, rotation: 0 });
        const abort = new AbortController();
        const cancelled = convertPdf(new Uint8Array(bytes).buffer, abort.signal);
        abort.abort();
        return {
          detached,
          kind: data.kind,
          shapes: data.instances.byteLength / 80,
          curves: data.curves.byteLength / 32,
          cancelled: (await cancelled)._unsafeUnwrapErr().kind
        };
      },
      [...pdf]
    );
    assert.equal(result.kind, 'curves');
    assert.equal(result.detached, true);
    assert.equal(result.cancelled, 'aborted');
    const snapshot = await page.locator('canvas').screenshot({ path: `${output}/page.png` });
    const pixels = await page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const context = new OffscreenCanvas(image.width, image.height).getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return [
        [200, 450],
        [500, 400],
        [600, 400],
        [100, 720],
        [80, 350]
      ].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    }, snapshot.toString('base64'));
    assert.deepEqual(pixels, [
      [26, 166, 102, 255],
      [217, 51, 77, 255],
      [255, 255, 255, 255],
      [51, 102, 242, 255],
      [255, 255, 255, 255]
    ]);
    await page.evaluate(() => drawPdf({ x: 0.13, y: 0.5, zoom: 0.07, rotation: 0.6 }));
    await page.locator('canvas').screenshot({ path: `${output}/detail.png` });
    await page.evaluate(() => {
      renderer.destroy();
      dispose();
    });
  }
  // Chromium creates a real embedded font subset and compressed content stream.
  const printer = await browser.newPage();
  await printer.setContent(
    '<html><body style="font:24px Arial;color:#153080"><h1>Embedded fonts</h1><p>Glyph reuse: ABBA ABBA. Привет!</p><svg width="300" height="200"><path d="M10 180 C 10 10 280 10 280 180 Z" fill="#229966"/></svg></body></html>'
  );
  const embedded = await printer.pdf({ width: '600px', height: '600px', printBackground: true });
  await writeFile(`${output}/embedded.pdf`, embedded);
  await printer.close();
  await page.goto(viewerURL);
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'embedded.pdf', mimeType: 'application/pdf', buffer: embedded });
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'));
  await page.screenshot({ path: `${output}/embedded.png` });
  // Import replacement must recover after an explicit unsupported-feature error.
  await page.locator('input[type=file]').setInputFiles({
    name: 'unsupported-pattern.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf('/GS gs /Pattern cs /P scn 10 10 100 100 re f', {
      resources: '/ExtGState << /GS << /BM /Multiply >> >> /Pattern << /P 7 0 R >>',
      extraObjects: [
        '<< /Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10 /Resources << >> /Length 14 >>\nstream\n0 0 10 10 re f\nendstream'
      ]
    })
  });
  await page.waitForFunction(() =>
    document.querySelector('[role=alert]')?.textContent.includes('tiling patterns with blend modes')
  );
  assert.equal(await page.getByTestId('document-loading').count(), 0);
  await page.locator('input[type=file]').setInputFiles({
    name: 'rotated.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf(curvePage, { rotate: 90, pages: 2 })
  });
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'));
  await page.screenshot({ path: `${output}/rotated.png` });
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'blank.pdf', mimeType: 'application/pdf', buffer: makePdf('') });
  await page.waitForFunction(() => document.querySelector('output')?.textContent.includes('MiB'));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(errors, []);
  console.log('PASS PDF → Rust/WASM → GDOC → TypeGPU, download/reopen, cancellation', result);
} catch (error) {
  console.error(errors, await page.locator('body').innerText());
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
