import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined, headless: true });
const page = await browser.newPage();
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.route('**/gpu-format-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  );
  await page.goto(`${baseURL}/gpu-format-check`);

  const result = await page.evaluate(async () => {
    const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
    const { default: url } = await import('/src/features/document/assets/demo.gdoc?url');
    const source = await (await fetch(url)).arrayBuffer();
    const NativeWorker = window.Worker;
    let created = 0;
    let terminated = 0;
    let ticks = 0;

    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        created++;
      }
      terminate() {
        terminated++;
        super.terminate();
      }
    };

    const timer = setInterval(() => ticks++, 1);
    const pending = readGdoc(source);
    const detached = source.byteLength === 0;
    const good = (await pending)._unsafeUnwrap();
    clearInterval(timer);

    const invalid = (await readGdoc(new ArrayBuffer(10)))._unsafeUnwrapErr().code;
    const original = await (await fetch(url)).arrayBuffer();
    const version = original.slice(0);
    new Uint8Array(version)[8] = 2;
    const unsupported = (await readGdoc(version))._unsafeUnwrapErr().code;
    const corrupt = original.slice(0);
    new Uint8Array(corrupt)[20] ^= 1;
    const checksum = (await readGdoc(corrupt))._unsafeUnwrapErr().code;

    // Valid GDOC with unused tail padding exercises the actual buffer, fetch and Rust size gates.
    const large = new Uint8Array(128 * 1024 * 1024 + 8);
    large.set(new Uint8Array(original));
    new DataView(large.buffer).setUint32(24, large.byteLength, true);
    const largeUrl = URL.createObjectURL(new Blob([large]));
    const largeBufferPages = (await readGdoc(large.buffer))._unsafeUnwrap().pages.length;
    const largeUrlPages = (await readGdoc(largeUrl))._unsafeUnwrap().pages.length;
    URL.revokeObjectURL(largeUrl);

    const abort = new AbortController();
    const cancelled = readGdoc(original, abort.signal);
    abort.abort();
    const aborted = (await cancelled)._unsafeUnwrapErr().kind;

    return {
      largeBufferPages,
      largeUrlPages,
      detached,
      pages: good.pages.length,
      glyphs: good.glyphVertices.byteLength / 72,
      ticks,
      invalid,
      unsupported,
      checksum,
      aborted,
      created,
      terminated
    };
  });

  assert.equal(result.pages, 1273);
  assert.equal(result.largeBufferPages, 1273);
  assert.equal(result.largeUrlPages, 1273);
  assert.equal(result.glyphs, 2675369);
  assert.equal(result.detached, true);
  assert.ok(result.ticks > 1, 'the main thread must remain responsive during decoding');
  assert.equal(result.invalid, 'invalid-data');
  assert.equal(result.unsupported, 'unsupported-format');
  assert.equal(result.checksum, 'checksum');
  assert.equal(result.aborted, 'aborted');
  assert.equal(result.created, result.terminated);
  assert.deepEqual(errors, []);
  console.log(
    'PASS GDOC Worker: real WASM, transfer, main-thread responsiveness, corruption, versions and cancellation'
  );
} finally {
  await browser.close();
}
