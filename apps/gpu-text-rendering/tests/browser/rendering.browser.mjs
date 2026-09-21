import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Run against `pnpm --filter @app-game/gpu-text-rendering dev`. Screenshots and measured timings are written outside the repository.
const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
const output = process.env.GPU_TEXT_OUTPUT ?? path.join(os.tmpdir(), 'gpu-text-rendering');
const baseline = process.env.GPU_TEXT_BASELINE;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') {
    errors.push(message.text());
  }
});
const report = { initialization: {}, cases: [], differences: [] };
try {
  await page.route('**/gpu-render-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body style="margin:0"></body></html>'
    })
  );
  await page.goto(`${baseURL}/gpu-render-check`);
  report.document = await page.evaluate(async () => {
    const { loadDocument } = await import('/src/features/document/document.ts');
    const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
    const start = performance.now();
    window.doc = (await loadDocument())._unsafeUnwrap();
    window.createFrame = createFrame;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Rendering checks require a WebGPU adapter');
    }
    return {
      decodeMs: performance.now() - start,
      pages: doc.pages.length,
      glyphs: doc.glyphVertices.byteLength / 72,
      adapter: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        description: adapter.info.description
      }
    };
  });
  const cases = [
    { name: 'overview', x: 0.5, y: 0.5, zoom: 2, rotation: 0 },
    { name: 'page', x: 0.5, y: 0.5, zoom: 0.55, rotation: 0 },
    { name: 'detail', x: 0.4, y: 0.8, zoom: 0.08, rotation: 0, vector: true },
    { name: 'rotated', x: 0.5, y: 0.5, zoom: 0.55, rotation: 0.5 },
    { name: 'grids', x: 0.4, y: 0.8, zoom: 0.08, rotation: 0.25, vector: true, grids: true },
    { name: 'far', x: 20, y: -10, zoom: 24, rotation: 0 },
    { name: 'image', x: 0.5, y: 0.5, zoom: 0.55, rotation: 0.3, image: true }
  ];
  {
    const backend = 'typegpu';
    report.initialization[backend] = await page.evaluate(async (backend) => {
      document.body.innerHTML = '';
      window.canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;
      document.body.append(canvas);
      const start = performance.now();
      const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
      const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
      const mounted = await mountRenderingGpu(canvas, doc.glyphVertices.byteLength);
      window.gpu = mounted.gpu;
      window.disposeGpu = mounted.dispose;
      window.makeRenderer = (_canvas, data) => createTypeGpuRenderer(gpu, data);
      window.renderer = (await makeRenderer(canvas, doc))._unsafeUnwrap();
      return { prepareMs: performance.now() - start, resourceBytes: renderer.resourceBytes };
    }, backend);
    for (const current of cases) {
      const timing = await page.evaluate(async (current) => {
        let data = doc;
        if (current.image) {
          renderer.destroy();
          const bitmap = await createImageBitmap(
            new ImageData(
              new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 128]),
              2,
              2
            ),
            { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }
          );
          const buffer = new ArrayBuffer(60);
          const vertices = new DataView(buffer);
          const corners = [
            [0.1, 0.1, 0, 0],
            [0.1, 0.1, 0, 0],
            [0.9, 0.1, 1, 0],
            [0.1, 0.9, 0, 1],
            [0.9, 0.9, 1, 1],
            [0.9, 0.9, 1, 1]
          ];
          corners.forEach((v, i) => {
            v.forEach((n, j) => vertices.setUint16(i * 10 + j * 2, Math.round(n * 65535), true));
            vertices.setUint8(i * 10 + 8, 180);
          });
          data = {
            ...doc,
            glyphVertices: doc.glyphVertices.slice(0, 72),
            imageVertices: buffer,
            pages: [
              {
                ...doc.pages[0],
                beginVertex: 0,
                endVertex: 0,
                images: [{ filename: 'fixture', vertexOffset: 0, numVerts: 6 }]
              }
            ],
            images: new Map([['fixture', bitmap]])
          };
          window.renderer = (await makeRenderer(canvas, data))._unsafeUnwrap();
          bitmap.close();
        }
        const frame = createFrame(data, current, 1200, 800, !!current.vector, !!current.grids);
        renderer.render(frame)._unsafeUnwrap();
        (await renderer.settle())._unsafeUnwrap();
        const samples = [];
        for (let i = 0; i < 7; i++) {
          const start = performance.now();
          renderer.render(frame)._unsafeUnwrap();
          const submitMs = performance.now() - start;
          (await renderer.settle())._unsafeUnwrap();
          samples.push({ submitMs, completedMs: performance.now() - start });
        }
        return { visiblePages: frame.visible.length, samples };
      }, current);
      report.cases.push({ backend, name: current.name, ...timing });
      await page.screenshot({ path: path.join(output, `${backend}-${current.name}.png`) });
      const screenshot = (await fs.readFile(path.join(output, `${backend}-${current.name}.png`))).toString('base64');
      const colors = await page.evaluate(async (source) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${source}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set();
        for (let i = 0; i < bytes.length; i += 4) colors.add((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]);
        return colors.size;
      }, screenshot);
      assert.ok(colors > 16, `${current.name}: missing text or image content`);
    }
    await page.evaluate(() => {
      renderer.destroy();
      disposeGpu();
    });
  }
  if (baseline) {
    for (const current of cases) {
      const sources = await Promise.all(
        [baseline, output].map(async (directory) =>
          (await fs.readFile(path.join(directory, `typegpu-${current.name}.png`))).toString('base64')
        )
      );
      const difference = await page.evaluate(async (sources) => {
        const pixels = async (source) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${source}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const [a, b] = await Promise.all(sources.map(pixels));
        let sum = 0,
          changed = 0,
          max = 0;
        for (let i = 0; i < a.length; i += 4) {
          let peak = 0;
          for (let j = 0; j < 3; j++) {
            const delta = Math.abs(a[i + j] - b[i + j]);
            sum += delta;
            peak = Math.max(peak, delta);
            max = Math.max(max, delta);
          }
          if (peak > 8) {
            changed++;
          }
        }
        return {
          meanChannelError: sum / ((a.length / 4) * 3),
          maxChannelError: max,
          changedPercent: (changed / (a.length / 4)) * 100
        };
      }, sources);
      report.differences.push({ name: current.name, ...difference });
      assert.ok(difference.meanChannelError < 0.6, `${current.name}: mean pixel difference too large`);
      assert.ok(difference.changedPercent < 1, `${current.name}: too many differing pixels`);
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({ output, initialization: report.initialization, differences: report.differences }, null, 2)
  );
} finally {
  await browser.close();
}
