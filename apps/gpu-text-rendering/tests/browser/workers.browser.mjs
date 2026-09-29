import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { makePdf } from '../fixtures/pdf.mjs';

// Run after pnpm build, against pnpm preview. Exercises the emitted modules in real workers, without a DOM.
const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:4180';
const assets = await readdir(new URL('../../dist/assets/', import.meta.url));
const workers = Object.fromEntries(
  ['decode', 'import', 'convert', 'raster', 'coverage'].map((name) => {
    const asset = assets.find((file) => file.startsWith(`${name}.worker-`) && file.endsWith('.js'));
    assert.ok(asset, `Missing ${name} worker; run pnpm build first`);
    return [name, `/assets/${asset}`];
  })
);
const browser = await chromium.launch({ headless: true, channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) errors.push(message.text());
  });
  await page.route('**/worker-check', (route) => route.fulfill({ contentType: 'text/html', body: '<body></body>' }));
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
  await page.goto(`${baseURL}/worker-check`);
  const result = await page.evaluate(
    async ({ workers, pdf }) => {
      const opened = [];
      const progress = [];
      let transferred = 0;
      function worker(name) {
        const instance = new Worker(workers[name], { type: 'module' });
        opened.push(instance);
        return instance;
      }
      function send(instance, data, transfer = []) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Worker reply timed out')), 30000);
          instance.onerror = (event) => {
            clearTimeout(timeout);
            reject(new Error(event.message));
          };
          instance.onmessage = ({ data }) => {
            if ('progress' in data) {
              progress.push(data.progress.stage);
              return;
            }
            clearTimeout(timeout);
            if (data.ok) resolve(data.value);
            else reject(new Error(typeof data.error === 'string' ? data.error : data.error.message));
          };
          instance.postMessage(data, transfer);
          for (const buffer of transfer) {
            if (buffer.byteLength !== 0) throw new Error('Input buffer was not transferred');
            transferred++;
          }
        });
      }
      try {
        const source = new Uint8Array(pdf).buffer;
        const imported = await send(worker('import'), source, [source]);
        const secondSource = new Uint8Array(pdf).buffer;
        const encoded = await send(worker('convert'), secondSource, [secondSource]);
        const decoded = await send(worker('decode'), encoded, [encoded]);
        const coverage = await send(
          worker('coverage'),
          {
            instances: imported.instances,
            curves: imported.curves
          },
          [imported.instances, imported.curves]
        );
        const raster = worker('raster');
        const pixels = new Uint8Array(16).fill(255).buffer;
        const first = await send(
          raster,
          { id: 1, bytes: pixels, width: 2, height: 2, codec: 0, tailLevel: 0, tiles: [] },
          [pixels]
        );
        const second = await send(raster, { id: 1, width: 2, height: 2, codec: 0, tailLevel: 0, tiles: [] });
        return {
          pages: [imported.pages.length, decoded.pages.length],
          kind: decoded.kind,
          coverage: coverage.offsets.byteLength > 0,
          cachedRaster:
            first.tail.pixels.byteLength > 0 && second.tail.pixels.byteLength === first.tail.pixels.byteLength,
          transferred,
          progress
        };
      } finally {
        opened.forEach((instance) => instance.terminate());
      }
    },
    { workers, pdf: [...makePdf('0 0 10 10 re f')] }
  );
  assert.deepEqual(result.pages, [1, 1]);
  assert.equal(result.kind, 'curves');
  assert.equal(result.coverage, true);
  assert.equal(result.cachedRaster, true);
  assert.equal(result.transferred, 6);
  assert.ok(result.progress.includes('loadingDecoder'));
  assert.ok(result.progress.includes('processingPages'));
  assert.ok(result.progress.includes('decodingDocument'));
  assert.deepEqual(errors, []);
  console.log('PASS built JSX workers: PDF import/export, GDOC decoding, coverage, raster cache and buffer transfers');
} finally {
  await browser.close();
}
