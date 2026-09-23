import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

// Real hardware only. CDP reuses Android Chrome without changing browser flags.
const input = process.argv[2];
const baseURL = process.env.GPU_TEXT_URL ?? 'http://localhost:3180';
assert.ok(input, 'Usage: node tests/performance/pan.browser.mjs /absolute/document.gdoc');
assert.ok((await stat(input)).isFile(), 'Input must be a GDOC file');
const frames = Number(process.env.GPU_TEXT_FRAMES ?? 600);
assert.ok(Number.isInteger(frames) && frames >= 2, 'GPU_TEXT_FRAMES must be an integer >= 2');
const samples = Number(process.env.GPU_TEXT_SAMPLES ?? 30);
assert.ok(Number.isInteger(samples) && samples >= 2, 'GPU_TEXT_SAMPLES must be an integer >= 2');
const output = process.env.GPU_TEXT_OUTPUT ?? '/tmp/gpu-pan-performance';
await mkdir(output, { recursive: true });
const remote = process.env.GPU_TEXT_CDP;
const targetHz = Number(process.env.GPU_TEXT_TARGET_HZ ?? 120);
assert.ok(Number.isFinite(targetHz) && targetHz > 0, 'GPU_TEXT_TARGET_HZ must be positive');
const motion = process.env.GPU_TEXT_MOTION ?? 'pan';
assert.ok(motion === 'pan' || motion === 'zoom');
const zoomScale = Number(process.env.GPU_TEXT_ZOOM_SCALE ?? 1);
assert.ok(Number.isFinite(zoomScale) && zoomScale > 0);
const focusPage = Number(process.env.GPU_TEXT_PAGE ?? 0);
assert.ok(Number.isInteger(focusPage) && focusPage >= 0, 'GPU_TEXT_PAGE is one-based, or zero for the layout center');
const server = createServer((request, response) => {
  if (request.url !== '/input.gdoc') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/octet-stream' });
  const stream = createReadStream(input);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
});
let browser;
let page;
let timeout;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(remote ? 3381 : 0, '127.0.0.1', resolve);
  });
  browser = remote
    ? await chromium.connectOverCDP(remote)
    : await chromium.launch({
        channel: process.env.GPU_TEXT_BROWSER_CHANNEL || undefined,
        headless: true,
        args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])]
      });
  page = remote
    ? await browser.contexts()[0].newPage()
    : await browser.newPage({
        viewport: {
          width: Number(process.env.GPU_TEXT_WIDTH ?? 1920),
          height: Number(process.env.GPU_TEXT_HEIGHT ?? 1200)
        },
        deviceScaleFactor: Number(process.env.GPU_TEXT_DPR ?? 1)
      });
  if (!remote) {
    await page.context().grantPermissions(['local-network-access'], { origin: baseURL });
  }
  const errors = [];
  timeout = setTimeout(() => void page.close(), 180_000);
  page.on('requestfailed', (request) => console.error(request.url(), request.failure()?.errorText));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().startsWith('BENCH')) {
      console.log(message.text());
    }
    if (message.type() === 'error') {
      errors.push(message.text());
      console.error(message.text());
    }
  });
  await page.route('**/performance-input.gdoc', (route) =>
    route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${server.address().port}/input.gdoc` } })
  );
  await page.route('**/performance-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style>'
    })
  );
  await page.goto(`${baseURL}/performance-check`);
  await page.bringToFront();
  const result = await page.evaluate(
    async ({ vectorOnly, frames, samples, zoomScale, remote, motion, targetHz, focusPage, autoZoom }) => {
      // Release on page close; never alter the tablet's system screen-timeout setting.
      const wakeLock = remote ? await navigator.wakeLock.request('screen') : undefined;
      let interrupted = document.visibilityState !== 'visible';
      document.addEventListener('visibilitychange', () => {
        interrupted ||= document.visibilityState !== 'visible';
      });
      wakeLock?.addEventListener('release', () => {
        interrupted = true;
      });
      const idleIntervals = [];
      const marker = document.createElement('div');
      marker.style.cssText = 'width:20px;height:20px;background:blue;position:fixed';
      document.body.append(marker);
      let idlePrevious;
      for (let i = 0; i < 121; i++) {
        const time = await new Promise(requestAnimationFrame);
        if (idlePrevious !== undefined) {
          idleIntervals.push(time - idlePrevious);
        }
        idlePrevious = time;
        marker.style.transform = `translateX(${i % 100}px)`;
      }
      marker.remove();
      const { readGdoc } = await import('/src/features/document/format/readGdoc.ts');
      const { layoutPages } = await import('/src/features/document/document.ts');
      const { createTypeGpuRenderer } = await import('/src/features/document/rendering/createTypeGpuRenderer.ts');
      const { createFrame } = await import('/src/features/document/rendering/createFrame.ts');
      const { mountRenderingGpu } = await import('/tests/browser/renderingHarness.ts');
      console.log('BENCH decode');
      const data = (await readGdoc(await (await fetch('/performance-input.gdoc')).arrayBuffer()))._unsafeUnwrap();
      const doc = {
        ...data,
        pages: layoutPages(data.pages, 2)._unsafeUnwrap(),
        images: new Map(),
        imageVertices: new ArrayBuffer(0)
      };
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(innerWidth * devicePixelRatio);
      canvas.height = Math.round(innerHeight * devicePixelRatio);
      document.body.append(canvas);
      console.log('BENCH device');
      const { gpu, dispose } = await mountRenderingGpu(
        canvas,
        doc.kind === 'curves' ? Math.max(doc.instances.byteLength, doc.curves.byteLength) : doc.glyphVertices.byteLength
      );
      let draws = 0;
      const bundleDraws = new WeakMap();
      const nativeBundleDraw = GPURenderBundleEncoder.prototype.draw;
      const nativeBundleIndexed = GPURenderBundleEncoder.prototype.drawIndexed;
      const nativeFinish = GPURenderBundleEncoder.prototype.finish;
      const nativeExecute = GPURenderPassEncoder.prototype.executeBundles;
      const nativeDraw = GPURenderPassEncoder.prototype.draw;
      const nativeIndexed = GPURenderPassEncoder.prototype.drawIndexed;
      GPURenderBundleEncoder.prototype.draw = function (...args) {
        bundleDraws.set(this, (bundleDraws.get(this) ?? 0) + 1);
        return nativeBundleDraw.apply(this, args);
      };
      GPURenderBundleEncoder.prototype.drawIndexed = function (...args) {
        bundleDraws.set(this, (bundleDraws.get(this) ?? 0) + 1);
        return nativeBundleIndexed.apply(this, args);
      };
      GPURenderBundleEncoder.prototype.finish = function (...args) {
        const result = nativeFinish.apply(this, args);
        bundleDraws.set(result, bundleDraws.get(this) ?? 0);
        return result;
      };
      GPURenderPassEncoder.prototype.executeBundles = function (bundles) {
        const list = [...bundles];
        draws += list.reduce((sum, bundle) => sum + (bundleDraws.get(bundle) ?? 0), 0);
        return nativeExecute.call(this, list);
      };
      GPURenderPassEncoder.prototype.draw = function (...args) {
        draws++;
        return nativeDraw.apply(this, args);
      };
      GPURenderPassEncoder.prototype.drawIndexed = function (...args) {
        draws++;
        return nativeIndexed.apply(this, args);
      };
      const start = performance.now();
      console.log('BENCH prepare');
      const prepared = await createTypeGpuRenderer(gpu, doc);
      if (prepared.isErr()) {
        console.error(prepared.error.message);
      }
      const renderer = prepared._unsafeUnwrap();
      console.log('BENCH prepared');
      const preparationMs = performance.now() - start;
      const first = doc.pages[0];
      const right = Math.max(...doc.pages.map((p) => -p.x + p.width / first.width));
      const bottom = Math.min(...doc.pages.map((p) => 1 - p.y - p.height / first.height));
      const camera = {
        x: right / 2,
        y: (1 + bottom) / 2,
        zoom: Math.max((right * innerHeight) / innerWidth, ((1 - bottom) * first.height) / first.width) * 0.65,
        rotation: 0
      };
      const overviewZoom = camera.zoom;
      camera.zoom *= zoomScale;
      const focus = { x: camera.x, y: camera.y, instance: undefined };

      if (focusPage > 0) {
        const page = doc.pages[focusPage - 1];
        if (!page) {
          return { error: 'Focus page is outside the document' };
        }

        focus.x = -page.x + page.width / first.width / 2;
        focus.y = 1 - page.y - page.height / first.height / 2;

        if (doc.kind === 'curves') {
          const words = new Uint32Array(doc.instances);
          const values = new Float32Array(doc.instances);
          const curves = new Float32Array(doc.curves);
          const candidates = [];

          for (let index = page.beginVertex / 6; index < page.endVertex / 6; index++) {
            const offset = index * 20;
            if (words[offset + 18] < 2 && words[offset + 17] >= 12 && Math.abs(values[offset]) < 0.03) {
              candidates.push(index);
            }
          }

          const index = candidates[Math.floor(candidates.length / 2)];
          if (index !== undefined) {
            const offset = index * 20;
            const curve = words[offset + 16] * 8;
            const x = curves[curve],
              y = curves[curve + 1];
            focus.x = -page.x + values[offset + 4] + values[offset] * x + values[offset + 2] * y;
            focus.y = 1 - page.y - values[offset + 5] - values[offset + 1] * x - values[offset + 3] * y;
            focus.instance = index;
          }
        }
      }

      const moveCamera = (index, count) => {
        camera.x = focus.x + Math.sin(index / 30) * Math.min(0.3, camera.zoom * 0.15);
        camera.y = focus.y;

        if (motion === 'zoom') {
          const progress = Math.sin((Math.PI * index) / (count - 1)) ** 2;
          camera.zoom = overviewZoom * Math.exp(Math.log(0.02) * progress);
          camera.x =
            right / 2 + (focus.x - right / 2) * progress + Math.sin(index / 30) * Math.min(0.3, camera.zoom * 0.15);
          camera.y = (1 + bottom) / 2 + (focus.y - (1 + bottom) / 2) * progress;
        }
      };
      const frame = () => createFrame(doc, camera, canvas.width, canvas.height, vectorOnly);
      moveCamera(0, frames);
      console.log('BENCH first render');
      const coldStart = performance.now();
      renderer.render(frame())._unsafeUnwrap();
      const coldCpuMs = performance.now() - coldStart;
      await gpu.device.queue.onSubmittedWorkDone();
      const coldCompletedMs = performance.now() - coldStart;
      console.log('BENCH first frame completed', coldCpuMs, coldCompletedMs);
      const refinementStart = performance.now();
      (await renderer.settle())._unsafeUnwrap();
      const firstRefinementMs = performance.now() - refinementStart;
      renderer.render(frame())._unsafeUnwrap();
      const warmRefinementStart = performance.now();
      (await renderer.settle())._unsafeUnwrap();
      const warmRefinementMs = performance.now() - warmRefinementStart;
      console.log('BENCH samples');
      const cpu = [],
        completed = [],
        intervals = [];
      draws = 0;
      for (let i = 0; i < samples; i++) {
        moveCamera(i, samples);
        const start = performance.now();
        renderer.render(frame())._unsafeUnwrap();
        cpu.push(performance.now() - start);
        await gpu.device.queue.onSubmittedWorkDone();
        completed.push(performance.now() - start);
      }
      console.log('BENCH animation');
      const drawsPerFrame = draws / samples;
      let previous;
      for (let i = 0; i < frames; i++) {
        const now = await new Promise(requestAnimationFrame);
        if (previous !== undefined) {
          intervals.push(now - previous);
        }
        previous = now;
        moveCamera(i, frames);
        renderer.render(frame())._unsafeUnwrap();
      }
      const flushStart = performance.now();
      await gpu.device.queue.onSubmittedWorkDone();
      const finalQueueWaitMs = performance.now() - flushStart;
      const stats = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        return {
          median: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          max: sorted.at(-1),
          mean: values.reduce((a, b) => a + b, 0) / values.length
        };
      };
      window.benchmarkQuality = async (exact) => {
        renderer.render({ ...frame(), vectorOnly: exact })._unsafeUnwrap();
        (await renderer.settle())._unsafeUnwrap();
        renderer.render({ ...frame(), vectorOnly: exact })._unsafeUnwrap();
        return canvas.toDataURL();
      };
      window.benchmarkDispose = () => {
        GPURenderPassEncoder.prototype.draw = nativeDraw;
        GPURenderPassEncoder.prototype.drawIndexed = nativeIndexed;
        GPURenderPassEncoder.prototype.executeBundles = nativeExecute;
        GPURenderBundleEncoder.prototype.draw = nativeBundleDraw;
        GPURenderBundleEncoder.prototype.drawIndexed = nativeBundleIndexed;
        GPURenderBundleEncoder.prototype.finish = nativeFinish;
        renderer.destroy();
        dispose();
        void wakeLock?.release();
      };
      const tour = autoZoom
        ? await (
            await import('/tests/performance/autoZoomHarness.ts')
          ).measureAutoZoom(renderer, doc, canvas, gpu, focus, focusPage || 1)
        : undefined;
      return {
        autoZoom: tour,
        userAgent: navigator.userAgent,
        targetHz,
        targetFrameMs: 1000 / targetHz,
        uninterrupted: !interrupted,
        idleRafMs: stats(idleIntervals),
        observedAnimationFps: 1000 / stats(intervals).mean,
        missedTargetIntervalsPercent: (intervals.filter((n) => n > 1500 / targetHz).length / intervals.length) * 100,
        frames,
        samples,
        vectorOnly,
        zoomScale,
        motion,
        focusPage,
        focus,
        adapter: {
          vendor: gpu.device.adapterInfo.vendor,
          architecture: gpu.device.adapterInfo.architecture,
          description: gpu.device.adapterInfo.description
        },
        width: canvas.width,
        height: canvas.height,
        dpr: devicePixelRatio,
        pages: doc.pages.length,
        profile: doc.kind,
        instances: doc.kind === 'curves' ? doc.instances.byteLength / 80 : doc.pages.at(-1).endVertex / 6,
        visiblePages: frame().visible.length,
        camera,
        preparationMs,
        coldCpuMs,
        coldCompletedMs,
        firstRefinementMs,
        warmRefinementMs,
        resourceBytes: renderer.resourceBytes,
        composition: renderer.refinement,
        drawsPerFrame,
        cpuMs: stats(cpu),
        completedMs: stats(completed),
        rafMs: stats(intervals),
        over25msPercent: (intervals.filter((n) => n > 25).length / intervals.length) * 100,
        finalQueueWaitMs
      };
    },
    {
      vectorOnly: process.env.GPU_TEXT_VECTOR_ONLY === '1',
      frames,
      samples,
      zoomScale,
      remote: !!remote,
      motion,
      targetHz,
      focusPage,
      autoZoom: process.env.GPU_TEXT_AUTOZOOM === '1'
    }
  );
  assert.equal(result.error, undefined, result.error);
  if (result.autoZoom) {
    assert.equal(result.autoZoom.failure, undefined);
    for (const [index, shot] of result.autoZoom.shots.entries()) {
      for (const kind of ['moving', 'settled']) {
        await writeFile(
          path.join(output, `tour-${index}-${kind}.png`),
          Buffer.from(shot[kind].split(',')[1], 'base64')
        );
        delete shot[kind];
      }
    }
  }
  if (process.env.GPU_TEXT_COMPARE_EXACT === '1') {
    // Read the drawing buffer directly: Android browser chrome can change screenshot dimensions.
    const normal = (await page.evaluate(() => benchmarkQuality(false))).split(',')[1];
    const exact = (await page.evaluate(() => benchmarkQuality(true))).split(',')[1];
    await writeFile(path.join(output, 'normal.png'), Buffer.from(normal, 'base64'));
    await writeFile(path.join(output, 'exact.png'), Buffer.from(exact, 'base64'));
    result.exactPixelDifference = await page.evaluate(
      async ({ normal, exact }) => {
        const pixels = async (source) => {
          const image = new Image();
          image.src = `data:image/png;base64,${source}`;
          await image.decode();
          const context = new OffscreenCanvas(image.width, image.height).getContext('2d');
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height).data;
        };
        const left = await pixels(normal);
        const right = await pixels(exact);
        if (left.length !== right.length || left.length === 0) {
          throw new Error('Quality captures must have equal, nonzero dimensions');
        }
        let sum = 0;
        let max = 0;
        for (let i = 0; i < left.length; i++) {
          const difference = Math.abs(left[i] - right[i]);
          sum += difference;
          max = Math.max(max, difference);
        }
        return { mean: sum / left.length, max };
      },
      { normal, exact }
    );
    await page.evaluate(() => benchmarkQuality(false));
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ ...result, errors }, null, 2));
  console.log(JSON.stringify({ ...result, errors }, null, 2));
  if (process.env.GPU_TEXT_SKIP_SCREENSHOT !== '1') {
    await page.screenshot({ path: path.join(output, 'overview.png'), timeout: 20_000 });
  }
  await page.evaluate(() => benchmarkDispose());
  assert.deepEqual(errors, []);
  if (result.exactPixelDifference) {
    const composed = process.env.GPU_TEXT_QUALITY_MODE === 'composed';
    const budget = composed ? 2 : 0.05;
    assert.ok(
      result.exactPixelDifference.mean < budget,
      `${composed ? 'Composed tiles' : 'Area tables'} must stay within ${budget}/255 mean error`
    );
    if (!composed && zoomScale <= 0.001) {
      assert.equal(result.exactPixelDifference.max, 0, 'Magnified drawing must preserve source-curve pixels');
    }
  }
  assert.equal(result.uninterrupted, true, 'Tab hidden or screen wake lock lost; discard this performance run');
} finally {
  clearTimeout(timeout);
  if (server.listening) {
    server.closeAllConnections();
    server.close();
  }
  await page?.close();
  await browser?.close();
}
