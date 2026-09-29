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
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') {
    errors.push(message.text());
  }
});
const report = { initialization: {}, cases: [], differences: [] };
try {
  await page.goto(`${baseURL}/tests/browser/empty.html`);
  report.document = await page.evaluate(async () => {
    const { loadDocument } = await import('/tests/browser/workerHarness.tsx');
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
      glyphs: doc.glyphVertices.byteLength / (doc.glyphEncoding === 'instances' ? 28 : 72),
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
    { name: 'far', x: 20, y: -10, zoom: 24, rotation: 0 }
  ];
  {
    const backend = 'typegpu';
    report.initialization[backend] = await page.evaluate(
      async (storageLimit) => {
        document.body.innerHTML = '';
        window.canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 800;
        document.body.append(canvas);
        const start = performance.now();
        const { createTypeGpuRenderer } = await import('/tests/browser/workerHarness.tsx');
        const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
        const mounted = await mountRenderingGpu(canvas, doc.glyphVertices.byteLength);
        window.gpu = mounted.gpu;
        // Exercise page draws crossing storage-buffer boundaries on ordinary hardware.
        if (storageLimit) {
          window.gpu = {
            ...gpu,
            device: new Proxy(gpu.device, {
              get(target, key) {
                if (key === 'limits')
                  return { maxBufferSize: target.limits.maxBufferSize, maxStorageBufferBindingSize: storageLimit };
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
              }
            })
          };
        }
        window.disposeGpu = mounted.dispose;
        window.renderer = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
        return { prepareMs: performance.now() - start, resourceBytes: renderer.resourceBytes };
      },
      Number(process.env.GPU_TEXT_TEST_STORAGE_LIMIT ?? 0)
    );
    for (const current of cases) {
      const timing = await page.evaluate(async (current) => {
        const frame = createFrame(doc, current, 1200, 800, {
          vectorOnly: !!current.vector,
          grids: !!current.grids
        });
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
      assert.ok(colors > 16, `${current.name}: missing text content`);
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
      if (process.env.GPU_TEXT_EXACT === '1') {
        assert.equal(difference.maxChannelError, 0, `${current.name}: expected exact pixel parity`);
      }
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
