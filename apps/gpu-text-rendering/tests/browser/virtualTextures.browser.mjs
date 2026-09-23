import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const baseURL = process.env.GPU_TEXT_URL ?? 'http://127.0.0.1:3180';
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-virtual-textures';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
  headless: true,
  args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
});
const page = await browser.newPage({ viewport: { width: 1025, height: 513 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    errors.push(message.text());
  }
});

try {
  await page.route('**/virtual-texture-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0"></body></html>' })
  );
  await page.goto(`${baseURL}/virtual-texture-check`);
  await page.evaluate(async () => {
    const { layoutPages } = await import('/src/features/document/document.ts');
    const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
    const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
    const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
    const width = 1025;
    const height = 513;
    const pixels = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        pixels.set([x % 256, y % 256, (x + y) % 256, 255], (y * width + x) * 4);
      }
    }

    const table = new Uint32Array([width, height, 0, pixels.byteLength, 1, 0]).buffer;
    const instances = new ArrayBuffer(80);
    const values = new DataView(instances);
    for (const [offset, value] of [
      [0, 1],
      [12, 1],
      [32, 1],
      [36, 1],
      [40, 1],
      [44, 1],
      [56, 1],
      [60, 1]
    ]) {
      values.setFloat32(offset, value, true);
    }
    values.setUint32(72, 2, true);
    const doc = {
      kind: 'curves',
      pages: layoutPages([{ width, height, beginVertex: 0, endVertex: 6, images: [] }], 2)._unsafeUnwrap(),
      positions: { x: new Float32Array([0.5]), y: new Float32Array([0.5]) },
      curves: new ArrayBuffer(0),
      instances,
      clips: new ArrayBuffer(0),
      curveBins: new ArrayBuffer(0),
      blends: new ArrayBuffer(1),
      groups: new ArrayBuffer(0),
      maskTransfers: new ArrayBuffer(0),
      radialGradients: new ArrayBuffer(0),
      rasterImages: { table, pixels: pixels.buffer },
      images: new Map(),
      imageVertices: new ArrayBuffer(0)
    };
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.append(canvas);
    const { gpu, dispose } = await mountRenderingGpu(canvas, 256);
    const NativeWorker = window.Worker;
    let pauseDetails = true;
    const held = [];
    window.Worker = class extends NativeWorker {
      postMessage(request, transfer) {
        if (pauseDetails && request.tiles?.length) {
          held.push(() => super.postMessage(request, transfer));
          return;
        }

        super.postMessage(request, transfer);
      }
    };
    window.releaseVirtualDetails = () => {
      pauseDetails = false;
      const count = held.length;
      held.splice(0).forEach((send) => send());
      return count;
    };
    let renderer = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
    const overview = { x: 0.5, y: 0.5, zoom: height / width / 2, rotation: 0 };
    window.renderVirtual = async (camera = overview, settle = true) => {
      renderer.render(createFrame(doc, camera, width, height))._unsafeUnwrap();
      if (settle) {
        (await renderer.settle())._unsafeUnwrap();
      }
      await gpu.device.queue.onSubmittedWorkDone();
      return renderer.resourceBytes;
    };
    window.usePackedTiles = async () => {
      const { reduceMip } = await import('/src/features/document/rendering/curves/rasterPixels.ts');
      const levels = [{ width, height, pixels }];
      while (levels.at(-1).width > 1 || levels.at(-1).height > 1) {
        levels.push(reduceMip(levels.at(-1)));
      }
      const payloads = [];
      for (const level of levels) {
        for (let y = 0; y < level.height; y += 128) {
          for (let x = 0; x < level.width; x += 128) {
            const tw = Math.min(128, level.width - x) + 2;
            const th = Math.min(128, level.height - y) + 2;
            const tile = new Uint8Array(tw * th * 4);
            for (let py = 0; py < th; py++) {
              for (let px = 0; px < tw; px++) {
                const offset =
                  (Math.max(0, Math.min(level.height - 1, y + py - 1)) * level.width +
                    Math.max(0, Math.min(level.width - 1, x + px - 1))) *
                  4;
                tile.set(level.pixels.subarray(offset, offset + 4), (py * tw + px) * 4);
              }
            }
            payloads.push(
              new Uint8Array(
                await new Response(
                  new Blob([tile]).stream().pipeThrough(new CompressionStream('deflate'))
                ).arrayBuffer()
              )
            );
          }
        }
      }
      const headerSize = 16 + payloads.length * 8;
      const packed = new Uint8Array(headerSize + payloads.reduce((sum, tile) => sum + tile.length, 0));
      const header = new DataView(packed.buffer);
      header.setUint32(0, 128, true);
      header.setUint32(4, levels.length, true);
      header.setUint32(8, payloads.length, true);
      let offset = headerSize;
      payloads.forEach((tile, index) => {
        header.setUint32(16 + index * 8, offset, true);
        header.setUint32(20 + index * 8, tile.length, true);
        packed.set(tile, offset);
        offset += tile.length;
      });
      renderer.destroy();
      new DataView(table).setUint32(12, packed.length, true);
      new DataView(table).setUint32(20, 4, true);
      doc.rasterImages.pixels = packed.buffer;
      renderer = (await createTypeGpuRenderer(gpu, doc))._unsafeUnwrap();
    };
    window.finishVirtual = () => {
      renderer.destroy();
      dispose();
    };
    await renderVirtual(undefined, false);
  });

  const initial = await page.locator('canvas').screenshot({ path: `${output}/initial-lod.png` });
  const uncovered = await page.evaluate(async (base64) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const context = new OffscreenCanvas(1025, 513).getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 1025, 513).data;
    let white = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 255) {
        white++;
      }
    }

    return white;
  }, initial.toString('base64'));
  assert.equal(uncovered, 0, 'Every pixel must have a base LOD before any detail tile is decoded');
  assert.ok((await page.evaluate(() => releaseVirtualDetails())) > 0, 'The test must block pending detail work');
  await page.evaluate(() => renderVirtual());

  const baseline = await page.locator('canvas').screenshot({ path: `${output}/raw.png` });
  const seamErrors = await page.evaluate(async (base64) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const context = new OffscreenCanvas(1025, 513).getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const errors = [];
    for (const y of [0, 127, 128, 255, 256, 511, 512]) {
      for (const x of [0, 126, 127, 128, 129, 255, 256, 511, 512, 1023, 1024]) {
        const actual = [...context.getImageData(x, y, 1, 1).data];
        const expected = [x % 256, y % 256, (x + y) % 256, 255];
        if (actual.some((value, index) => Math.abs(value - expected[index]) > 1)) {
          errors.push({ x, y, actual, expected });
        }
      }
    }
    return errors;
  }, baseline.toString('base64'));
  assert.deepEqual(seamErrors, []);
  await page.evaluate(() => renderVirtual({ x: 0.35, y: 0.6, zoom: 0.025, rotation: 0.7 }));
  await page.evaluate(() => renderVirtual(undefined, false));
  const returned = await page.locator('canvas').screenshot({ path: `${output}/returned-immediately.png` });
  assert.deepEqual(returned, baseline, 'Returning to the loaded overview should require no decode or replacement');
  await page.evaluate(() => usePackedTiles());
  const bytes = await page.evaluate(() => renderVirtual());
  assert.ok(bytes < 96 * 1024 * 1024);
  const packed = await page.locator('canvas').screenshot({ path: `${output}/packed.png` });
  assert.deepEqual(packed, baseline, 'Independent GDOC tiles must exactly preserve source pixels and borders');
  await page.evaluate(() => finishVirtual());
  const jpegDetail = await page.evaluate(async () => {
    const { default: RasterWorker } = await import('/src/features/document/rendering/curves/raster.worker.ts?worker');
    const { tilePixels } = await import('/src/features/document/rendering/curves/rasterPixels.ts');
    const source = new OffscreenCanvas(513, 513);
    const context = source.getContext('2d');
    const data = context.createImageData(513, 513);
    for (let i = 0; i < 513 * 513; i++) {
      data.data.set([i % 256, Math.floor(i / 513) % 256, (i * 17) % 256, 255], i * 4);
    }
    context.putImageData(data, 0, 0);
    const blob = await source.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
    const bytes = await blob.arrayBuffer();
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'default' });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const expected = new Uint8Array(
      tilePixels(
        { width: 513, height: 513, pixels: new Uint8Array(context.getImageData(0, 0, 513, 513).data.buffer) },
        1,
        1
      )
    );
    const worker = new RasterWorker();
    const send = (request) =>
      new Promise((resolve, reject) => {
        worker.onerror = reject;
        worker.onmessage = ({ data }) => (data.ok ? resolve(data.value) : reject(new Error(data.error)));
        worker.postMessage(
          { id: 0, width: 513, height: 513, codec: 3, tiles: [], ...request },
          request.bytes ? [request.bytes] : []
        );
      });
    try {
      const coarse = await send({ bytes, tailLevel: 5 });
      // Upgrade the same retained source twice without retransferring its JPEG.
      await send({ tiles: [{ image: 0, level: 2, x: 0, y: 0 }] });
      const full = await send({ tiles: [{ image: 0, level: 0, x: 1, y: 1 }] });
      const actual = new Uint8Array(full.tiles[0].pixels);
      return {
        tail: !!coarse.tail,
        error: actual.reduce((max, value, i) => Math.max(max, Math.abs(value - expected[i])), 0)
      };
    } finally {
      worker.terminate();
    }
  });
  assert.ok(jpegDetail.tail);
  assert.equal(jpegDetail.error, 0, 'JPEG refinement must recover exact full-resolution pixels after coarse LOD');
  assert.deepEqual(errors, []);
  console.log(
    'PASS virtual textures: initial LOD with blocked detail loading, exact pixels across tile seams, odd image edges, rotation, immediate zoom return, packed tile parity and bounded resources'
  );
} finally {
  await browser.close();
}
