import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const out = process.env.PSD_BENCH_OUT;
if (!out) {
  throw new Error('Run through benchmark.mjs with PSD_BENCH_PHASE3=1.');
}
const fixture = `${process.env.PSD_TEXT_MIXER_RESEARCH_ROOT}/fixtures/psd/oracle-1/DVE__Enzymes__test__--1-e9610aa019d6-g0/source-input/document.psb`;
const results = [];
const runs = Number(process.env.PSD_BENCH_RUNS ?? 3);
for (let run = 1; run <= runs; run++) {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    channel: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? undefined : 'chrome',
    headless: true,
    args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
  });
  const result = { run, dpr: Number(process.env.PSD_BENCH_DPR ?? 1), errors: [] };
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: result.dpr
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => result.errors.push(error.message));
    await page.addInitScript(() => {
      const audit = (window.__phase3 = { samples: [], requests: [], replies: [], phase: 'open' });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name.startsWith('psd:')) {
            audit.samples.push({
              name: entry.name.slice(4),
              start: entry.startTime,
              ms: entry.duration,
              value: entry.detail,
              phase: audit.phase
            });
          }
        }
      }).observe({ type: 'measure' });
      const Native = Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'windowRendered') {
              audit.replies.push({
                time: performance.now(),
                id: data.id,
                phase: audit.phase,
                ms: data.milliseconds,
                images: data.images.map(({ left, top, width, height, step, mips }) => ({
                  left,
                  top,
                  width,
                  height,
                  step,
                  mips: mips?.length ?? 0
                }))
              });
            }
          });
        }
        postMessage(data, ...args) {
          if (data.type === 'renderWindow') {
            audit.requests.push({ time: performance.now(), id: data.id, window: data.window, phase: audit.phase });
          }
          super.postMessage(data, ...args);
        }
      };
    });
    await page.goto(`${process.env.PSD_BENCH_URL}/?current=1&workers=${process.env.PSD_BENCH_WORKERS ?? 1}&telemetry=1`);
    const stage = page.locator('[data-busy]');
    const settle = async () => {
      await page.waitForFunction(
        () => document.querySelector('[data-busy]')?.dataset.busy === 'false' && document.querySelector('canvas'),
        {},
        { timeout: 120000 }
      );
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    await page.locator('input[accept=".psd,.psb"]').setInputFiles(fixture);
    await settle();
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await settle();
    const bounds = await stage.boundingBox();
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.evaluate(
      ({ center }) => {
        const stage = document.querySelector('[data-busy]');
        const x = Number(stage.dataset.cameraX);
        const y = Number(stage.dataset.cameraY);
        __phase3.phase = 'nine-tile';
        __phase3.nineStart = performance.now();
        stage.dispatchEvent(
          new PointerEvent('pointermove', {
            pointerId: 1,
            clientX: center.x - 4352 - x,
            clientY: center.y - 7424 - y,
            bubbles: true
          })
        );
      },
      { center }
    );
    await page.mouse.up();
    await settle();
    result.nineTile = await page.evaluate(() => ({
      ms: performance.now() - __phase3.nineStart,
      requests: __phase3.requests.filter((event) => event.phase === 'nine-tile'),
      replies: __phase3.replies.filter((event) => event.phase === 'nine-tile')
    }));
    await page.screenshot({ path: `${out}/assets/phase3-r${run}-populated.png` });

    // Four seconds of the original pan/zoom gesture, now over populated coverage.
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.evaluate(
      async ({ center }) => {
        const stage = document.querySelector('[data-busy]');
        __phase3.phase = 'trajectory';
        for (let frame = 1; frame <= 120; frame++) {
          await new Promise(requestAnimationFrame);
          stage.dispatchEvent(
            new PointerEvent('pointermove', {
              pointerId: 1,
              clientX: center.x + 150 * Math.sin(frame / 20),
              clientY: center.y + 80 * Math.cos(frame / 20),
              bubbles: true
            })
          );
        }
      },
      { center }
    );
    await page.mouse.up();
    await page.evaluate(
      async ({ center }) => {
        const stage = document.querySelector('[data-busy]');
        for (let frame = 0; frame < 120; frame++) {
          await new Promise(requestAnimationFrame);
          stage.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: frame < 60 ? 4 : -4,
              clientX: center.x,
              clientY: center.y,
              bubbles: true,
              cancelable: true
            })
          );
        }
      },
      { center }
    );
    await settle();
    result.trajectory = await page.evaluate(() => {
      const replies = __phase3.replies.filter((event) => event.phase === 'trajectory');
      const tiles = replies.flatMap((event) => event.images).filter((image) => image.step === 1);
      return {
        returned: tiles.length,
        repeated:
          tiles.length - new Set(tiles.map((image) => `${image.left}:${image.top}:${image.width}:${image.height}`)).size
      };
    });

    // Off-document and back, with exactly the same content and camera on return.
    await page.evaluate(() => (__phase3.phase = 'warm-revisit'));
    for (const delta of [600000, -600000]) {
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await stage.dispatchEvent('pointermove', { pointerId: 1, clientX: center.x + delta, clientY: center.y });
      await page.mouse.up();
      await settle();
    }
    result.warmRevisit = await page.evaluate(() => ({
      wasmCalls: __phase3.requests.filter((event) => event.phase === 'warm-revisit').length,
      uploads: __phase3.samples.filter((sample) => sample.phase === 'warm-revisit' && sample.name === 'upload').length
    }));

    // One uninterrupted five-minute traversal per DPR, after three independently cold viewport runs.
    // PSD_BENCH_TRAVERSE_MS supports a short pilot; the acceptance run uses the default 300000 ms.
    if (run === runs) {
      const duration = Number(process.env.PSD_BENCH_TRAVERSE_MS ?? 300000);
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.evaluate(
        async ({ center, duration }) => {
          const stage = document.querySelector('[data-busy]');
          __phase3.phase = 'traversal';
          const start = performance.now();
          let lastX = center.x,
            lastY = center.y;
          let previousBand = -1;
          let checkedScheduling = false;
          while (performance.now() - start < duration) {
            await new Promise(requestAnimationFrame);
            const elapsed = performance.now() - start;
            if (!checkedScheduling && elapsed >= 30000) {
              checkedScheduling = true;
              if (!__phase3.requests.some((request) => request.phase === 'traversal')) {
                throw new Error('Continuous input starved viewport tile requests.');
              }
            }
            const band = Math.floor(elapsed / 15000) % 2;
            if (band !== previousBand) {
              const scale = Number(stage.dataset.cameraScale);
              const desired = band ? 0.3 : 1;
              stage.dispatchEvent(
                new WheelEvent('wheel', {
                  deltaY: -Math.log(desired / scale) / 0.0015,
                  clientX: center.x,
                  clientY: center.y,
                  bubbles: true,
                  cancelable: true
                })
              );
              previousBand = band;
              continue;
            }

            const scale = Number(stage.dataset.cameraScale);
            const left = 1000 + 25000 * (0.5 + 0.5 * Math.sin(elapsed / 17000));
            const top = 1000 + 38000 * (0.5 + 0.5 * Math.cos(elapsed / 23000));
            lastX += -left * scale - Number(stage.dataset.cameraX);
            lastY += -top * scale - Number(stage.dataset.cameraY);
            stage.dispatchEvent(
              new PointerEvent('pointermove', { pointerId: 1, clientX: lastX, clientY: lastY, bubbles: true })
            );
          }
          __phase3.traversalEnd = performance.now();
          __phase3.traversalMs = __phase3.traversalEnd - start;
        },
        { center, duration }
      );
      await page.mouse.up();
      await settle();
      result.traversalMs = await page.evaluate(() => __phase3.traversalMs);
      result.duringTraversal = await page.evaluate(() => ({
        requests: __phase3.requests.filter((request) => request.phase === 'traversal' && request.time <= __phase3.traversalEnd).length,
        visibleArrivals: __phase3.samples.filter((sample) => sample.phase === 'traversal' &&
          sample.name === 'tile.visible.frames' && sample.start <= __phase3.traversalEnd).length
      }));
    }
    result.diagnostics = await page.evaluate(() => {
      const samples = __phase3.samples;
      const max = (name, field = 'value') =>
        Math.max(0, ...samples.filter((sample) => sample.name === name).map((sample) => sample[field]));
      const visible = samples.filter((sample) => sample.name === 'tile.visible.frames');
      return {
        peakCpuBytes: max('tiles.cpu.bytes'),
        peakGpuBytes: max('gpu.explicit.bytes'),
        peakPendingCpuBytes: max('tiles.cpu.pending.bytes'),
        peakPendingGpuBytes: max('gpu.pending.bytes'),
        visibleTileMaxFrames: max('tile.visible.frames'),
        imageChunkMaxFrames: max('imageChunk.visible.frames'),
        cachedRefinementMaxFrames: max('tile.refinement.frames'),
        visibleTileOverTwoFrames: visible.filter((sample) => sample.value > 2).length,
        visibleTileCount: visible.length,
        obsoleteBatchMaxTiles: max('cancellation.obsoleteBatchTiles'),
        salvagedTiles: samples
          .filter((sample) => sample.name === 'cancellation.salvagedTiles')
          .reduce((sum, sample) => sum + sample.value, 0)
      };
    });
    await writeFile(`${out}/phase3-r${run}-raw.json`, JSON.stringify(await page.evaluate(() => __phase3)));
  } catch (error) {
    result.error = String(error);
  } finally {
    await browser.close();
    results.push(result);
    await writeFile(`${out}/phase3.json`, JSON.stringify(results, null, 2));
    console.log(
      JSON.stringify({
        ...result,
        nineTile: result.nineTile && {
          ms: result.nineTile.ms,
          requests: result.nineTile.requests.length,
          replies: result.nineTile.replies.length
        }
      })
    );
  }
}
